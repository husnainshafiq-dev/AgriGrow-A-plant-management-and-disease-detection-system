const dashboardService = require("./dashboardService");

const ALERT_THRESHOLDS = {
    heatwave: { tempMin: 42, severity: "high" },
    frost: { tempMax: 2, severity: "critical" },
    storm: { windMin: 16.6, severity: "high" }, // 60 km/h is ~16.6 m/s
    drought: { humidityMax: 20, severity: "medium" },
    "heavy-rain": { condition: "Rain", severity: "medium" }
};

/**
 * Check weather conditions against agricultural thresholds.
 * 
 * @param {Object} weather - Normalized weather object from fetchWeather
 * @returns {Array} List of triggered alert definitions
 */
const checkThresholds = (weather) => {
    const alerts = [];
    if (!weather) return alerts;

    const temp = weather.temperature;
    const humidity = weather.humidity;
    const wind = weather.windSpeed; // in m/s usually from OpenWeather API
    const condition = weather.condition;

    // Heatwave check
    if (temp >= ALERT_THRESHOLDS.heatwave.tempMin) {
        alerts.push({
            alertType: "heatwave",
            severity: "high",
            title: "Extreme Heat Warning",
            message: `Temperature of ${temp}°C detected. Risk of crop heat stress and rapid moisture evaporation. Increase watering in early mornings.`,
            weatherData: { temperature: temp, humidity, windSpeed: wind, rainfall: 0, condition }
        });
    }

    // Frost check
    if (temp <= ALERT_THRESHOLDS.frost.tempMax) {
        alerts.push({
            alertType: "frost",
            severity: "critical",
            title: "Frost Risk Detected",
            message: `Temperature dropped to ${temp}°C. Frost damage is imminent for winter crops. Consider protective sheeting or light night-time irrigation.`,
            weatherData: { temperature: temp, humidity, windSpeed: wind, rainfall: 0, condition }
        });
    }

    // Storm/Wind check
    if (wind >= ALERT_THRESHOLDS.storm.windMin) {
        alerts.push({
            alertType: "storm",
            severity: "high",
            title: "High Wind / Storm Alert",
            message: `Severe wind speeds of ${(wind * 3.6).toFixed(0)} km/h detected. Secure weak crop supports and delay any spraying operations.`,
            weatherData: { temperature: temp, humidity, windSpeed: wind, rainfall: 0, condition }
        });
    }

    // Drought/Low humidity check
    if (humidity <= ALERT_THRESHOLDS.drought.humidityMax) {
        alerts.push({
            alertType: "drought",
            severity: "medium",
            title: "Low Soil Moisture Risk",
            message: `Extremely low relative humidity (${humidity}%) detected. Soil is drying out quickly. Monitor soil moisture closely.`,
            weatherData: { temperature: temp, humidity, windSpeed: wind, rainfall: 0, condition }
        });
    }

    // Heavy rain check
    if (condition && condition.toLowerCase().includes("rain")) {
        alerts.push({
            alertType: "heavy-rain",
            severity: "medium",
            title: "Precipitation Alert",
            message: `Rain detected (${condition}). Hold off on pesticide and fertilizer application to prevent chemical runoff.`,
            weatherData: { temperature: temp, humidity, windSpeed: wind, rainfall: 5, condition }
        });
    }

    return alerts;
};

/**
 * Check weather for a single GeoField polygon.
 * 
 * @param {Object} field - GeoField document
 * @returns {Promise<Array>} List of alerts
 */
const checkFieldWeather = async (field) => {
    if (!field || !field.centroid || !field.centroid.coordinates) return [];
    
    const [lng, lat] = field.centroid.coordinates;
    const weather = await dashboardService.fetchWeather(lat, lng);
    return checkThresholds(weather);
};

module.exports = {
    checkThresholds,
    checkFieldWeather,
    ALERT_THRESHOLDS
};
