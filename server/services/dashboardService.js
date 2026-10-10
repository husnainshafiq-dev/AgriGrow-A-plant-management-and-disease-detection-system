// ============================================================
// 🌦️ Dashboard Service — Weather, Geo, & AI Crop Analysis
// ============================================================
//
// This service handles:
//   1. Fetching real-time weather from OpenWeatherMap API
//   2. Calculating polygon centroids using Turf.js math
//   3. Calculating polygon areas in acres using Turf.js math
//   4. Building seasonal crop recommendation prompts
//   5. Determining current agricultural season
//
// DEPENDENCIES:
//   • axios — HTTP client for weather API
//   • config — env variable access (OPENWEATHER_API_KEY)
//   • geminiService — AI text generation
//
// ============================================================

const axios = require("axios");
const config = require("../config/env");
const logger = require("../utils/logger");

// ============================================================
// GEOSPATIAL MATH (replaces @turf/turf for zero dependencies)
// ============================================================

const EARTH_RADIUS_M = 6371000; // Earth's mean radius in meters
const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Calculate the centroid of a GeoJSON Polygon.
 *
 * MATH:
 *   Simple arithmetic mean of all vertices works well for
 *   small polygons (farm-sized). For continent-scale polygons,
 *   you'd need spherical centroid calculation — but for fields
 *   up to ~1000 acres this is accurate to < 1 meter.
 *
 * @param {number[][][]} coordinates - GeoJSON polygon coordinates
 * @returns {{ lng: number, lat: number }} Centroid point
 */
const calculateCentroid = (coordinates) => {
    // GeoJSON: coordinates[0] = outer ring = [[lng,lat], ...]
    const ring = coordinates[0];

    // Exclude the closing point (which duplicates the first)
    const points = ring.slice(0, -1);

    if (points.length === 0) {
        return { lng: 0, lat: 0 };
    }

    let sumLng = 0;
    let sumLat = 0;

    for (const [lng, lat] of points) {
        sumLng += lng;
        sumLat += lat;
    }

    return {
        lng: sumLng / points.length,
        lat: sumLat / points.length,
    };
};

/**
 * Calculate the area of a GeoJSON Polygon in square meters.
 *
 * MATH — Spherical Excess Formula (Gauss's formulation):
 *   Uses the shoelface formula adapted for spherical coordinates.
 *   Each triangle formed by consecutive edges contributes:
 *     ΔA = (λ₂ - λ₁) × (2 + sin(φ₁) + sin(φ₂))
 *   Total area = |ΣΔA| × R² / 2
 *
 *   Where:
 *     λ = longitude in radians
 *     φ = latitude in radians
 *     R = Earth's radius (6,371,000 m)
 *
 * @param {number[][][]} coordinates - GeoJSON polygon coordinates
 * @param {string} unit - "acres" | "hectares" | "sqm" | "sqft"
 * @returns {number} Area in the specified unit
 */
const calculateArea = (coordinates, unit = "acres") => {
    const ring = coordinates[0];
    const points = ring.slice(0, -1); // Remove closing point

    if (points.length < 3) return 0;

    let area = 0;

    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;

        const lng1 = toRad(points[i][0]);
        const lat1 = toRad(points[i][1]);
        const lng2 = toRad(points[j][0]);
        const lat2 = toRad(points[j][1]);

        // Spherical excess contribution
        area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }

    const sqMeters = (Math.abs(area) * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2;

    // Convert to requested unit
    switch (unit) {
        case "hectares":
            return Math.round((sqMeters / 10000) * 10000) / 10000;
        case "sqft":
            return Math.round(sqMeters / 0.09290304);
        case "sqm":
            return Math.round(sqMeters * 100) / 100;
        case "acres":
        default:
            return Math.round((sqMeters / 4046.8564224) * 10000) / 10000;
    }
};

// ============================================================
// WEATHER SERVICE — OpenWeatherMap & Open-Meteo Integration
// ============================================================

// Map WMO weather interpretation codes to condition names and icons
const mapWmoToCondition = (code) => {
    if (code === 0) return { condition: "Clear", conditionDetail: "clear sky", icon: "01d" };
    if ([1, 2].includes(code)) return { condition: "Clouds", conditionDetail: "partly cloudy", icon: "02d" };
    if (code === 3) return { condition: "Clouds", conditionDetail: "overcast", icon: "04d" };
    if ([45, 48].includes(code)) return { condition: "Fog", conditionDetail: "foggy", icon: "50d" };
    if ([51, 53, 55].includes(code)) return { condition: "Drizzle", conditionDetail: "light drizzle", icon: "09d" };
    if ([61, 63, 65, 80, 81, 82].includes(code)) return { condition: "Rain", conditionDetail: "rain showers", icon: "10d" };
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { condition: "Snow", conditionDetail: "snowfall", icon: "13d" };
    if ([95, 96, 99].includes(code)) return { condition: "Thunderstorm", conditionDetail: "thunderstorm", icon: "11d" };
    return { condition: "Clear", conditionDetail: "clear sky", icon: "01d" };
};

const fetchOpenMeteoWeather = async (lat, lng) => {
    try {
        const url = "https://api.open-meteo.com/v1/forecast";
        const response = await axios.get(url, {
            params: {
                latitude: lat,
                longitude: lng,
                current: "temperature_2m,relative_humidity_2m,apparent_temperature,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,weather_code",
            },
            headers: {
                "User-Agent": "AgriGrow-App/1.0 (https://github.com/husnainshafiq-dev/AgriGrow-A-plant-management-and-disease-detection-system)",
            },
            timeout: 8000,
        });

        const current = response.data.current;
        if (!current) return null;
        const wmo = mapWmoToCondition(current.weather_code);

        return {
            temperature: Math.round(current.temperature_2m * 10) / 10,
            feelsLike: Math.round(current.apparent_temperature * 10) / 10,
            humidity: Math.round(current.relative_humidity_2m),
            pressure: Math.round(current.surface_pressure),
            windSpeed: Math.round(current.wind_speed_10m * 10) / 10,
            windDirection: current.wind_direction_10m || 0,
            visibility: 10000,
            cloudCoverage: current.cloud_cover || 0,
            condition: wmo.condition,
            conditionDetail: wmo.conditionDetail,
            icon: wmo.icon,
            locationName: `Farmland (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`,
            fetchedAt: new Date(),
        };
    } catch (err) {
        logger.warn(`Open-Meteo weather fallback failed: ${err.message}`);
        return null;
    }
};

const fetchOpenMeteoForecast = async (lat, lng) => {
    try {
        const url = "https://api.open-meteo.com/v1/forecast";
        const response = await axios.get(url, {
            params: {
                latitude: lat,
                longitude: lng,
                hourly: "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation_probability",
                forecast_days: 2,
            },
            headers: {
                "User-Agent": "AgriGrow-App/1.0 (https://github.com/husnainshafiq-dev/AgriGrow-A-plant-management-and-disease-detection-system)",
            },
            timeout: 8000,
        });

        const h = response.data.hourly;
        if (!h || !h.time) return null;

        const forecastList = [];
        for (let i = 0; i < Math.min(h.time.length, 16); i += 2) {
            const wmo = mapWmoToCondition(h.weather_code[i]);
            forecastList.push({
                dt: Math.floor(new Date(h.time[i]).getTime() / 1000),
                date: new Date(h.time[i]).toISOString(),
                temperature: Math.round(h.temperature_2m[i] * 10) / 10,
                humidity: Math.round(h.relative_humidity_2m[i]),
                condition: wmo.condition,
                conditionDetail: wmo.conditionDetail,
                icon: wmo.icon,
                windSpeed: Math.round(h.wind_speed_10m[i] * 10) / 10,
                pop: Math.round(h.precipitation_probability[i] || 0),
            });
        }
        return forecastList;
    } catch (err) {
        logger.warn(`Open-Meteo forecast fallback failed: ${err.message}`);
        return null;
    }
};

/**
 * Fetch real-time weather data for given coordinates.
 *
 * API: OpenWeatherMap "Current Weather Data" (free tier)
 * Endpoint: https://api.openweathermap.org/data/2.5/weather
 * Fallback: Open-Meteo live API (no key required)
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} Normalized weather data
 */
const fetchWeather = async (lat, lng) => {
    const apiKey = config.OPENWEATHER_API_KEY;

    if (apiKey) {
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather`;
            const response = await axios.get(url, {
                params: {
                    lat,
                    lon: lng,
                    appid: apiKey,
                    units: "metric", // Celsius
                },
                timeout: 8000,
            });

            const data = response.data;

            return {
                temperature: Math.round(data.main.temp * 10) / 10,
                feelsLike: Math.round(data.main.feels_like * 10) / 10,
                humidity: data.main.humidity,
                pressure: data.main.pressure,
                windSpeed: data.wind.speed,
                windDirection: data.wind.deg || 0,
                visibility: data.visibility || 10000,
                cloudCoverage: data.clouds?.all || 0,
                condition: data.weather?.[0]?.main || "Unknown",
                conditionDetail: data.weather?.[0]?.description || "",
                icon: data.weather?.[0]?.icon || "01d",
                locationName: data.name ? `${data.name}, ${data.sys?.country || ""}` : "",
                fetchedAt: new Date(),
            };
        } catch (error) {
            logger.warn(`OpenWeatherMap error (${error.message}) — attempting Open-Meteo fallback`);
        }
    }

    // Try Open-Meteo live weather fallback
    const liveMeteo = await fetchOpenMeteoWeather(lat, lng);
    if (liveMeteo) return liveMeteo;

    // Return mock data only if both live weather providers fail
    return getMockWeather();
};

/**
 * Fetch 5-day weather forecast for given coordinates.
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Array} Array of forecast entries
 */
const fetchForecast = async (lat, lng) => {
    const apiKey = config.OPENWEATHER_API_KEY;

    if (apiKey) {
        try {
            const url = `https://api.openweathermap.org/data/2.5/forecast`;
            const response = await axios.get(url, {
                params: {
                    lat,
                    lon: lng,
                    appid: apiKey,
                    units: "metric",
                    cnt: 16, // ~2 days of 3-hour intervals
                },
                timeout: 8000,
            });

            return response.data.list.map((entry) => ({
                dt: entry.dt,
                date: new Date(entry.dt * 1000).toISOString(),
                temperature: Math.round(entry.main.temp * 10) / 10,
                humidity: entry.main.humidity,
                condition: entry.weather?.[0]?.main || "Unknown",
                conditionDetail: entry.weather?.[0]?.description || "",
                icon: entry.weather?.[0]?.icon || "01d",
                windSpeed: entry.wind?.speed || 0,
                pop: Math.round((entry.pop || 0) * 100), // Probability of precipitation %
            }));
        } catch (error) {
            logger.warn(`OpenWeather forecast error (${error.message}) — attempting Open-Meteo fallback`);
        }
    }

    // Try Open-Meteo forecast fallback
    const liveForecast = await fetchOpenMeteoForecast(lat, lng);
    if (liveForecast && liveForecast.length > 0) return liveForecast;

    return getMockForecast();
};

// -----------------------------------------------------------
// Mock Weather (fallback when API key is missing/fails)
// -----------------------------------------------------------
const getMockWeather = () => ({
    temperature: 28.5,
    feelsLike: 31.2,
    humidity: 65,
    pressure: 1013,
    windSpeed: 3.2,
    windDirection: 180,
    visibility: 10000,
    cloudCoverage: 40,
    condition: "Clouds",
    conditionDetail: "scattered clouds",
    icon: "03d",
    locationName: "Sample Location",
    fetchedAt: new Date(),
    isMock: true,
});

const getMockForecast = () => {
    const now = Date.now();
    return Array.from({ length: 8 }, (_, i) => ({
        dt: Math.floor((now + i * 3 * 3600 * 1000) / 1000),
        date: new Date(now + i * 3 * 3600 * 1000).toISOString(),
        temperature: 25 + Math.random() * 10,
        humidity: 50 + Math.random() * 30,
        condition: ["Clear", "Clouds", "Rain"][Math.floor(Math.random() * 3)],
        conditionDetail: "mock forecast data",
        icon: "01d",
        windSpeed: 2 + Math.random() * 5,
        pop: Math.floor(Math.random() * 40),
        isMock: true,
    }));
};

// ============================================================
// SEASON DETECTION
// ============================================================

/**
 * Determine the current agricultural season based on month
 * and approximate geographic location.
 *
 * Pakistani / South Asian agricultural calendar:
 *   Rabi  (Oct–Mar): Wheat, barley, mustard, peas
 *   Kharif (Apr–Sep): Rice, maize, cotton, sugarcane
 *   Zaid  (Mar–Jun): Watermelon, muskmelon, cucumber
 *
 * @param {number} month - 0-indexed month (0=Jan, 11=Dec)
 * @param {number} lat - Latitude (for hemisphere detection)
 * @returns {Object} { season, seasonName, monthName }
 */
const detectSeason = (month = new Date().getMonth(), lat = 30) => {
    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];

    // South Asian agricultural seasons
    let season, seasonName;

    if (month >= 9 || month <= 2) {
        // October to March
        season = "rabi";
        seasonName = "Rabi (Winter Crop Season)";
    } else if (month >= 2 && month <= 5) {
        // March to June
        season = "zaid";
        seasonName = "Zaid (Summer Short Season)";
    } else {
        // June to September
        season = "kharif";
        seasonName = "Kharif (Monsoon Crop Season)";
    }

    return {
        season,
        seasonName,
        monthName: months[month],
        month: month + 1, // 1-indexed for display
    };
};

// ============================================================
// AI CROP RECOMMENDATION PROMPTS
// ============================================================

/**
 * STEP 1: Best Crops Section Only
 */
const buildCropsPrompt = (weather, seasonInfo, areaAcres, locationName = "") => {
    const loc = locationName || weather?.locationName || "Pakistan";
    return `
Act as AgriGrow AI, an expert agricultural advisor. Analyze a ${areaAcres?.toFixed(1)}-acre farm in ${loc} under these current conditions:
- Temp: ${weather?.temperature}°C
- Humidity: ${weather?.humidity}%
- Season: ${seasonInfo?.seasonName}

Provide ONLY the following section. Do not generate disease analysis, weather tips, or financial estimates yet.

## 🌾 Best Crops to Grow Right Now
Suggest 4-6 crops perfectly suited for these exact conditions. For each crop, include:
- **Crop name**
- **Why it suits this location, season, and weather**
- **Expected yield per acre**
- **Water requirements** (considering current humidity & weather)
- **Growing duration** (days to harvest)
- **Market value insight** (current demand in Pakistan)

Keep language simple, practical, and use bullet points.
`;
};

/**
 * STEP 2: Disease Prevention Section Only
 */
const buildDiseasePrompt = (weather, seasonInfo, cropsContext = "", locationName = "") => {
    const loc = locationName || weather?.locationName || "Pakistan";
    return `
Act as AgriGrow AI. Based on the current temperature (${weather?.temperature}°C), humidity (${weather?.humidity}%), location (${loc}), and season (${seasonInfo?.seasonName}), analyze the pest and disease risks${cropsContext ? ` for these crops: ${cropsContext}` : ""}.

Provide ONLY the following section. Do not generate crop choices or weather tips yet.

## 🛡️ Disease Prevention for Current Conditions
- List the **top 5 most likely diseases or pests** that could affect crops in these conditions.
- For each disease:
  - **Cause** (fungal, bacterial, viral, environmental)
  - **Early symptoms** to watch for
  - **Preventive measures** (both organic and chemical)
  - **Estimated treatment cost** per acre in PKR

Keep language simple, practical, and use bullet points. Include cost estimates in PKR where applicable.
`;
};

/**
 * STEP 3: Weather Tips & Season Planning
 */
const buildPlanningPrompt = (weather, seasonInfo, areaAcres, cropsContext = "", locationName = "") => {
    const loc = locationName || weather?.locationName || "Pakistan";
    return `
Act as AgriGrow AI. Complete the seasonal agricultural strategy for a ${areaAcres?.toFixed(1)}-acre farming operation in ${loc} under these conditions:
- Temp: ${weather?.temperature}°C
- Humidity: ${weather?.humidity}%
- Season: ${seasonInfo?.seasonName}
${cropsContext ? `- Target Crops: ${cropsContext}` : ""}

Provide ONLY the following sections:

## 🌤️ Weather-Based Farming Tips
- Irrigation recommendations (specific timing to prevent high evaporation)
- Best time of day for fieldwork
- Soil management tips (e.g., mulching or tilling recommendations)
- Any weather alerts or precautions

## 📊 Season Planning Summary
- Key dates for this season
- Crop rotation suggestions for the next 2 seasons
- Detailed investment estimate breakdown for the total ${areaAcres?.toFixed(1)} acres based on standard regional input costs per acre.

Keep language simple, practical, and use bullet points. Include cost estimates in PKR where applicable.
`;
};

module.exports = {
    calculateCentroid,
    calculateArea,
    fetchWeather,
    fetchForecast,
    fetchOpenMeteoWeather,
    fetchOpenMeteoForecast,
    getMockWeather,
    detectSeason,
    buildCropsPrompt,      // Refactored Step 1
    buildDiseasePrompt,    // Refactored Step 2
    buildPlanningPrompt,   // Refactored Step 3
};
