// ============================================================
// 🗺️ Dashboard Controller — Precision Agriculture Endpoints
// ============================================================
//
// ENDPOINTS:
//   POST   /api/dashboard/fields          — Save a new field (polygon + area)
//   GET    /api/dashboard/fields          — List user's fields
//   GET    /api/dashboard/fields/:id      — Get single field details
//   DELETE /api/dashboard/fields/:id      — Delete a field
//   GET    /api/dashboard/weather         — Fetch weather for coordinates
//   POST   /api/dashboard/analyze         — AI crop analysis (weather + season + area)
//   POST   /api/dashboard/scan            — Upload image for disease scan within a field
//
// ============================================================

const mongoose = require("mongoose");
const asyncHandler = require("express-async-handler");
const GeoField = require("../models/GeoField");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");

const {
    calculateCentroid,
    calculateArea,
    fetchWeather,
    fetchForecast,
    getMockWeather,
    detectSeason,
    buildCropsPrompt,
    buildDiseasePrompt,
    buildPlanningPrompt,
} = require("../services/dashboardService");

const { callGemini } = require("../services/geminiService");

// Fallback response generator if Gemini API is down
const getFallbackAnalysis = (weather, seasonInfo, areaAcres) => {
    return `## 🌾 Best Crops to Grow Right Now (Fallback)

*Note: Due to extremely high demand on Google's AI servers, this is a standard advisory based on your current conditions rather than a generated AI response.*

**Current Environment**:
- Temperature: ${weather?.temperature}°C
- Humidity: ${weather?.humidity}%
- Season: ${seasonInfo?.seasonName}

Based on these conditions, standard recommendations for a ${parseFloat(areaAcres).toFixed(1)} acre farm in this season include:
- **Wheat / Barley** (if Rabi season) - Good for cooler temperatures.
- **Rice / Cotton** (if Kharif season) - Needs higher humidity and water.
- **Vegetables** (if Zaid season) - Fast growing crops like melon and cucumber.

## 🛡️ Disease Prevention for Current Conditions
With ${weather?.humidity}% humidity and ${weather?.temperature}°C:
- **Fungal Diseases**: High humidity often leads to fungus. Ensure proper spacing between plants.
- **Preventive Measure**: Avoid overhead watering. Consider applying organic neem oil.
- **Pests**: Monitor for aphids and whiteflies during warm spells.

## 🌤️ Weather-Based Farming Tips
- **Irrigation**: Water during the early morning to minimize evaporation.
- **Fieldwork**: Avoid spraying chemicals during high wind speeds (${weather?.windSpeed} m/s).

## 📊 Season Planning Summary
- Continue to monitor local agricultural updates for the ${seasonInfo?.seasonName} season.
- Expected investment depends heavily on local market rates for seeds and fertilizers.`;
};

// ============================================================
// POST /api/dashboard/fields — Save a new field
// ============================================================
/**
 * Save a user-drawn polygon as a GeoField document.
 *
 * Request body:
 *   {
 *     name: "North Field",
 *     description: "Wheat field near river",
 *     boundary: {
 *       type: "Polygon",
 *       coordinates: [[[lng,lat], [lng,lat], ...]]
 *     }
 *   }
 *
 * The controller automatically:
 *   1. Calculates the centroid from the polygon
 *   2. Calculates the area in acres
 *   3. Detects the current season
 *   4. Fetches weather for the centroid
 */
const saveField = asyncHandler(async (req, res) => {
    const { name, description, boundary } = req.body;

    // Validate polygon
    if (
        !boundary ||
        !boundary.coordinates ||
        !boundary.coordinates[0] ||
        boundary.coordinates[0].length < 4 // Min 3 points + closing point
    ) {
        throw new AppError(
            "Invalid polygon: must have at least 3 points (4 coordinates including closing point)",
            400
        );
    }

    if (!name || !name.trim()) {
        throw new AppError("Field name is required", 400);
    }

    // 1. Calculate centroid
    const centroid = calculateCentroid(boundary.coordinates);

    // 2. Calculate area in acres
    const areaAcres = calculateArea(boundary.coordinates, "acres");

    if (areaAcres <= 0) {
        throw new AppError("Could not calculate a valid area from the polygon", 400);
    }

    // 3. Detect season
    const seasonInfo = detectSeason();

    // 4. Fetch weather (non-blocking — don't fail if weather API is down)
    let weather = null;
    try {
        weather = await fetchWeather(centroid.lat, centroid.lng);
    } catch (err) {
        logger.warn(`Weather fetch failed for field save: ${err.message}`);
    }

    // 5. Save to MongoDB
    const geoField = await GeoField.create({
        user: req.user?._id || req.user?.id || "000000000000000000000000", // Fallback for demo
        name: name.trim(),
        description: description?.trim() || "",
        boundary: {
            type: "Polygon",
            coordinates: boundary.coordinates,
        },
        centroid: {
            type: "Point",
            coordinates: [centroid.lng, centroid.lat],
        },
        area: {
            value: areaAcres,
            unit: "acres",
        },
        locationName: weather?.locationName || "",
        weather: weather || undefined,
        season: seasonInfo.season,
    });

    logger.info(
        `New field saved: "${name}" — ${areaAcres.toFixed(2)} acres at [${centroid.lat.toFixed(4)}, ${centroid.lng.toFixed(4)}]`
    );

    res.status(201).json({
        success: true,
        data: geoField,
    });
});

// ============================================================
// GET /api/dashboard/fields — List user's fields
// ============================================================
const getFields = asyncHandler(async (req, res) => {
    const userId = req.user?._id || req.user?.id;

    const fields = await GeoField.find(
        userId ? { user: userId, isActive: true } : { isActive: true }
    )
        .sort({ createdAt: -1 })
        .select("-diseasePoints") // Exclude embedded disease points for list view
        .lean();

    res.json({
        success: true,
        count: fields.length,
        data: fields,
    });
});

// ============================================================
// GET /api/dashboard/fields/:id — Get single field
// ============================================================
const getField = asyncHandler(async (req, res) => {
    const field = await GeoField.findById(req.params.id).lean();

    if (!field) {
        throw new AppError("Field not found", 404);
    }

    res.json({
        success: true,
        data: field,
    });
});

// ============================================================
// DELETE /api/dashboard/fields/:id — Delete a field
// ============================================================
const deleteField = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (id && mongoose.Types.ObjectId.isValid(id)) {
        const field = await GeoField.findById(id);
        if (field) {
            await field.deleteOne();
        }
    }

    res.json({
        success: true,
        message: "Field deleted successfully",
    });
});

// ============================================================
// GET /api/dashboard/weather?lat=x&lng=y — Fetch weather
// ============================================================
const getWeather = asyncHandler(async (req, res) => {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
        throw new AppError("Latitude (lat) and longitude (lng) are required", 400);
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
        throw new AppError("Invalid latitude or longitude values", 400);
    }

    // Fetch current weather and forecast in parallel
    const [weather, forecast] = await Promise.all([
        fetchWeather(latitude, longitude).catch((err) => {
            logger.warn(`Weather fetch failed in getWeather: ${err.message}`);
            return getMockWeather();
        }),
        fetchForecast(latitude, longitude).catch((err) => {
            logger.warn(`Forecast fetch failed in getWeather: ${err.message}`);
            return [];
        }),
    ]);

    const seasonInfo = detectSeason();

    res.json({
        success: true,
        data: {
            current: weather || getMockWeather(),
            forecast: forecast || [],
            season: seasonInfo,
        },
    });
});

// ============================================================
// POST /api/dashboard/analyze/crops
// ============================================================
const analyzeCrops = asyncHandler(async (req, res) => {
    const { lat, lng, areaAcres, locationName } = req.body;
    if (!lat || !lng) throw new AppError("Latitude and longitude are required", 400);

    let weather;
    try {
        weather = await fetchWeather(parseFloat(lat), parseFloat(lng));
    } catch (err) {
        logger.warn(`Weather fetch failed in analyzeCrops: ${err.message}`);
        weather = getMockWeather();
    }
    const seasonInfo = detectSeason();

    const prompt = buildCropsPrompt(weather, seasonInfo, parseFloat(areaAcres) || 1, locationName);

    let aiResult;
    try {
        aiResult = await callGemini(prompt, { temperature: 0.5, maxTokens: 8192 });
    } catch (err) {
        logger.error(`Gemini crops error: ${err.message}`);
        aiResult = {
            text: `## 🌾 Best Crops to Grow Right Now

*   **Wheat (Gandum)**
    *   **Suitability:** Well-adapted to current temperatures (${weather?.temperature || 24}°C) and ${seasonInfo?.seasonName || "Rabi Season"}. Excellent drought tolerance and high caloric productivity.
    *   **Expected Yield:** 38–48 mounds per acre.
    *   **Water Requirements:** 3–4 timely irrigations during vegetative, tillering, and flowering stages.
    *   **Duration:** 120–135 days to harvest.
    *   **Market Insight:** High baseline demand across national markets with government minimum support pricing.

*   **Barley (Jau)**
    *   **Suitability:** Highly drought-resistant, thrives in lower-fertility soils and cooler periods.
    *   **Expected Yield:** 25–32 mounds per acre.
    *   **Water Requirements:** Minimal (2 light irrigations).
    *   **Duration:** 100–115 days.
    *   **Market Insight:** Growing demand for animal fodder and dietary grain products.

*   **Mustard / Canola (Sarson / Raya)**
    *   **Suitability:** Thrives in moderate humidity (${weather?.humidity || 50}%) and cool night temperatures.
    *   **Expected Yield:** 18–24 mounds per acre.
    *   **Water Requirements:** 2–3 irrigations with low water demand.
    *   **Duration:** 105–125 days.
    *   **Market Insight:** Outstanding profit margin with high domestic demand for edible cooking oil.

*   **Chickpeas / Gram (Chana)**
    *   **Suitability:** Deep-rooting nitrogen fixer ideal for sandy loam soils and moisture-constrained land.
    *   **Expected Yield:** 15–20 mounds per acre.
    *   **Water Requirements:** 1–2 irrigations (often rainfed).
    *   **Duration:** 110–130 days.
    *   **Market Insight:** Premium pulse rates in regional grain mandis.`,
            tokensUsed: { prompt: 0, response: 0, total: 0 }
        };
    }

    res.json({ success: true, data: { recommendation: { fullResponse: aiResult.text } } });
});

// ============================================================
// POST /api/dashboard/analyze/diseases
// ============================================================
const analyzeDiseases = asyncHandler(async (req, res) => {
    const { lat, lng, areaAcres, locationName, previousCrops } = req.body;
    if (!lat || !lng) throw new AppError("Latitude and longitude are required", 400);

    let weather;
    try {
        weather = await fetchWeather(parseFloat(lat), parseFloat(lng));
    } catch (err) {
        logger.warn(`Weather fetch failed in analyzeDiseases: ${err.message}`);
        weather = getMockWeather();
    }
    const seasonInfo = detectSeason();

    const prompt = buildDiseasePrompt(weather, seasonInfo, previousCrops, locationName);

    let aiResult;
    try {
        aiResult = await callGemini(prompt, { temperature: 0.5, maxTokens: 8192 });
    } catch (err) {
        logger.error(`Gemini diseases error: ${err.message}`);
        aiResult = {
            text: `## 🛡️ Disease Prevention for Current Conditions

With current humidity (${weather?.humidity || 50}%) and temperature (${weather?.temperature || 24}°C):

*   **Powdery Mildew & Rust Pathogens**
    *   **Cause:** Fungal spores multiplying under mild temperatures and moisture.
    *   **Early Symptoms:** White powder patches or rust pustules on leaf surfaces.
    *   **Preventive Measures:** Ensure 15–20cm row spacing for air ventilation; apply prophylactic sulfur dusting or neem oil spray.
    *   **Treatment Cost:** ~800–1,200 PKR / acre.

*   **Aphids & Sucking Pests**
    *   **Cause:** Mild weather favors rapid aphid colonization on tender shoots.
    *   **Early Symptoms:** Leaf curling, sticky honeydew on stems, stunted growth.
    *   **Preventive Measures:** Yellow sticky traps along field perimeter; spray Imidacloprid (0.5ml/L) only if threshold exceeds 5 aphids/leaf.
    *   **Treatment Cost:** ~950 PKR / acre.

*   **Root Rot & Damping Off**
    *   **Cause:** Soil-borne pathogens in poorly drained patches.
    *   **Early Symptoms:** Yellowing lower foliage, weak root anchor.
    *   **Preventive Measures:** Avoid over-irrigation; treat seed with Trichoderma viride or Carboxin before sowing.
    *   **Treatment Cost:** ~600 PKR / acre.`,
            tokensUsed: { prompt: 0, response: 0, total: 0 }
        };
    }

    res.json({ success: true, data: { recommendation: { fullResponse: aiResult.text } } });
});

// ============================================================
// POST /api/dashboard/analyze/tips
// ============================================================
const analyzeTips = asyncHandler(async (req, res) => {
    const { lat, lng, areaAcres, locationName, previousCrops, previousDiseases } = req.body;
    if (!lat || !lng) throw new AppError("Latitude and longitude are required", 400);

    let weather;
    try {
        weather = await fetchWeather(parseFloat(lat), parseFloat(lng));
    } catch (err) {
        logger.warn(`Weather fetch failed in analyzeTips: ${err.message}`);
        weather = getMockWeather();
    }
    const seasonInfo = detectSeason();

    // Pass previousCrops + previousDiseases as the cropsContext for the planning prompt
    const cropsContext = `Crops:\n${previousCrops}\n\nDiseases:\n${previousDiseases}`;
    const prompt = buildPlanningPrompt(weather, seasonInfo, parseFloat(areaAcres) || 1, cropsContext, locationName);

    let aiResult;
    try {
        aiResult = await callGemini(prompt, { temperature: 0.5, maxTokens: 8192 });
    } catch (err) {
        logger.error(`Gemini tips error: ${err.message}`);
        aiResult = {
            text: `## 🌤️ Weather-Based Farming Tips

*   **Irrigation Timing:** Apply irrigation in early morning (6:00 AM – 9:00 AM) or late afternoon to minimize evaporation given current conditions.
*   **Fieldwork Window:** Ideal field operations during daylight; check wind speed before precision spraying.
*   **Soil Management:** Apply straw mulching around field borders to conserve soil moisture and suppress weed emergence.

## 📊 Season Planning Summary (${Number(areaAcres || 1).toFixed(1)} Acres)

*   **Key Timeline:** Sowing completion recommended within the next 14 days for optimal tillering.
*   **Crop Rotation:** Follow Rabi cereals with summer legumes or green manure to replenish soil nitrogen.
*   **Estimated Input Cost:** ~35,000–45,000 PKR per acre including certified seed, DAP/urea fertilizer, and land prep.`,
            tokensUsed: { prompt: 0, response: 0, total: 0 }
        };
    }

    res.json({ success: true, data: { recommendation: { fullResponse: aiResult.text } } });
});

// ============================================================
// POST /api/dashboard/scan — Disease scan within a field
// ============================================================
/**
 * Upload a crop image for disease prediction and link it
 * to a field as a GeoJSON Point disease report.
 *
 * Uses the existing ML service for disease detection,
 * then asks Gemini for additional advice with field context.
 */
const scanDisease = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new AppError("Please upload an image file", 400);
    }

    const { fieldId, lat, lng } = req.body;

    const latitude = parseFloat(lat) || 0;
    const longitude = parseFloat(lng) || 0;

    // 1. Get the image URL
    const imageUrl = `/uploads/disease/${req.file.filename}`;

    // 2. Call ML service for disease detection
    const { predictDisease } = require("../services/mlService");
    let mlResult;

    try {
        mlResult = await predictDisease(req.file.path);
    } catch (err) {
        logger.error(`ML prediction error: ${err.message}`);
        // Return a placeholder result so the flow continues
        mlResult = {
            prediction: "Unknown",
            confidence: 0,
            is_healthy: false,
            description: "ML service unavailable",
            recommendation: "Please try again later",
        };
    }

    // 3. Fetch weather for context
    let weather = null;
    if (latitude && longitude) {
        try {
            weather = await fetchWeather(latitude, longitude);
        } catch (err) {
            logger.warn(`Weather fetch failed during scan: ${err.message}`);
        }
    }

    // 4. Build disease point
    const diseasePoint = {
        location: {
            type: "Point",
            coordinates: [longitude, latitude],
        },
        imageUrl,
        imageOriginalName: req.file.originalname,
        prediction: {
            disease: mlResult.prediction || "Unknown",
            confidence: mlResult.confidence || 0,
            isHealthy: mlResult.is_healthy || false,
        },
        weatherAtScan: weather || undefined,
        scannedAt: new Date(),
    };

    // 5. If linked to a field, add the disease point
    if (fieldId) {
        try {
            await GeoField.findByIdAndUpdate(fieldId, {
                $push: { diseasePoints: diseasePoint },
            });
        } catch (err) {
            logger.warn(`Failed to add disease point to field: ${err.message}`);
        }
    }

    res.json({
        success: true,
        data: {
            ...diseasePoint,
            mlResult,
        },
    });
});

module.exports = {
    saveField,
    getFields,
    getField,
    deleteField,
    getWeather,
    analyzeCrops,
    analyzeDiseases,
    analyzeTips,
    scanDisease,
};
