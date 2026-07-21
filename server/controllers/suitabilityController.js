// ============================================================
// 🌱 Crop Suitability Controller (STEP 6.2)
// ============================================================
//
// ENDPOINTS:
//   POST   /api/suitability/check          — Check single crop suitability
//   POST   /api/suitability/rank           — Rank all crops for farm
//   POST   /api/suitability/alternatives   — Get alternatives for a crop
//   POST   /api/suitability/rotation       — Crop rotation plan
//   POST   /api/suitability/farm/:id       — Full suitability using farm data
//   POST   /api/suitability/farm/:id/ai    — AI-enhanced suitability
//
// ============================================================

const asyncHandler = require("express-async-handler");
const Farm = require("../models/Farm");
const Disease = require("../models/Disease");
const {
    calculateSuitabilityScore,
    rankAllCrops,
    suggestAlternatives,
    suggestRotation,
} = require("../services/suitabilityService");
const { AppError } = require("../middleware/errorHandler");
const { sendSuccess } = require("../utils/apiResponse");
const logger = require("../utils/logger");

// ============================================================
// 1. CHECK — Single crop suitability score
// ============================================================
/**
 * @desc    Check suitability of a specific crop for given conditions
 * @route   POST /api/suitability/check
 * @access  Private
 */
const checkSuitability = asyncHandler(async (req, res) => {
    const {
        cropName, soilType, season, irrigationType,
        farmArea, soilPH, terrain, diseaseHistory,
    } = req.body;

    if (!cropName) {
        throw new AppError("cropName is required", 400);
    }

    const cropKey = cropName.toLowerCase().replace(/\s+/g, "-");

    const result = calculateSuitabilityScore({
        cropKey,
        soilType,
        season,
        irrigationType,
        farmArea,
        soilPH,
        terrain,
        diseaseHistory,
    });

    if (!result.available) {
        throw new AppError(result.message, 400);
    }

    sendSuccess(res, 200, `Suitability: ${result.grade} (${result.score}/100)`, {
        suitability: result,
    });
});

// ============================================================
// 2. RANK — Rank all crops for given farm conditions
// ============================================================
/**
 * @desc    Rank all supported crops for given farm conditions
 * @route   POST /api/suitability/rank
 * @access  Private
 */
const rankCrops = asyncHandler(async (req, res) => {
    const {
        soilType, season, irrigationType, farmArea,
        soilPH, terrain, diseaseHistory, limit,
    } = req.body;

    const result = rankAllCrops(
        { soilType, season, irrigationType, farmArea, soilPH, terrain, diseaseHistory },
        limit || 0
    );

    sendSuccess(res, 200, `Ranked ${result.rankings.length} crops`, {
        rankings: result.rankings,
        summary: result.summary,
        farmConditions: {
            soilType: soilType || "not specified",
            season: season || "not specified",
            irrigationType: irrigationType || "not specified",
            terrain: terrain || "flat",
            soilPH: soilPH || "not specified",
        },
    });
});

// ============================================================
// 3. ALTERNATIVES — Suggest alternatives for a crop
// ============================================================
/**
 * @desc    Suggest alternative crops if target is not ideal
 * @route   POST /api/suitability/alternatives
 * @access  Private
 */
const getAlternatives = asyncHandler(async (req, res) => {
    const {
        cropName, soilType, season, irrigationType,
        farmArea, soilPH, terrain,
    } = req.body;

    if (!cropName) {
        throw new AppError("cropName is required", 400);
    }

    const cropKey = cropName.toLowerCase().replace(/\s+/g, "-");

    const result = suggestAlternatives(cropKey, {
        soilType, season, irrigationType, farmArea, soilPH, terrain,
    });

    sendSuccess(res, 200, result.suggestion, {
        target: result.target,
        sameCategoryAlternatives: result.sameCategoryAlternatives,
        topAlternatives: result.topAlternatives,
    });
});

// ============================================================
// 4. ROTATION — Crop rotation suggestion
// ============================================================
/**
 * @desc    Get crop rotation plan
 * @route   POST /api/suitability/rotation
 * @access  Private
 */
const getRotationPlan = asyncHandler(async (req, res) => {
    const { soilType, currentCrop, terrain } = req.body;

    if (!soilType) {
        throw new AppError("soilType is required for rotation planning", 400);
    }

    const result = suggestRotation({
        soilType,
        currentCrop: currentCrop || undefined,
        terrain,
    });

    sendSuccess(res, 200, "Crop rotation plan generated", {
        rotation: result,
    });
});

// ============================================================
// 5. FARM-LINKED — Full suitability analysis using farm data
// ============================================================
/**
 * @desc    Analyze crop suitability using stored farm data + disease history
 * @route   POST /api/suitability/farm/:id
 * @access  Private
 */
const analyzeForFarm = asyncHandler(async (req, res, next) => {
    const farm = await Farm.findById(req.params.id);
    if (!farm) return next(new AppError("Farm not found", 404));
    if (farm.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized", 403));
    }

    const { cropName, limit } = req.body;

    // Fetch disease history for this farm
    let diseaseHistory = [];
    try {
        const diseases = await Disease.find({ farm: farm._id })
            .select("prediction.disease")
            .lean();
        diseaseHistory = diseases
            .map((d) => d.prediction?.disease)
            .filter(Boolean);
    } catch (err) {
        logger.warn(`Could not fetch disease history for farm ${farm._id}: ${err.message}`);
    }

    // Build farm context
    const farmContext = {
        soilType: farm.soilType || "other",
        season: req.body.season || undefined,
        irrigationType: farm.waterSource?.irrigationType || "other",
        farmArea: farm.area?.value,
        soilPH: farm.soilPH || undefined,
        terrain: farm.terrain || "flat",
        diseaseHistory,
    };

    let result;

    if (cropName) {
        // Single crop analysis
        const cropKey = cropName.toLowerCase().replace(/\s+/g, "-");
        const suitability = calculateSuitabilityScore({ cropKey, ...farmContext });
        const alternatives = suggestAlternatives(cropKey, farmContext);

        result = {
            type: "single-crop",
            suitability,
            alternatives: alternatives.topAlternatives?.slice(0, 3),
            sameCategoryAlternatives: alternatives.sameCategoryAlternatives,
        };
    } else {
        // Full ranking for the farm
        result = {
            type: "full-ranking",
            ...rankAllCrops(farmContext, limit || 10),
        };
    }

    // Include rotation suggestion
    const rotation = suggestRotation({
        soilType: farmContext.soilType,
        currentCrop: cropName || undefined,
        terrain: farmContext.terrain,
    });

    sendSuccess(res, 200, "Farm suitability analysis complete", {
        farm: {
            id: farm._id,
            name: farm.name,
            area: farm.area,
            soilType: farm.soilType,
            irrigationType: farm.waterSource?.irrigationType,
            terrain: farm.terrain,
            soilPH: farm.soilPH,
            diseaseCount: diseaseHistory.length,
        },
        analysis: result,
        rotationPlan: rotation,
    });
});

// ============================================================
// 6. AI-ENHANCED — Gemini-powered suitability analysis
// ============================================================
/**
 * @desc    AI-enhanced crop suitability with Gemini recommendations
 * @route   POST /api/suitability/farm/:id/ai
 * @access  Private
 */
const analyzeWithAI = asyncHandler(async (req, res, next) => {
    const farm = await Farm.findById(req.params.id);
    if (!farm) return next(new AppError("Farm not found", 404));
    if (farm.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized", 403));
    }

    const { cropName, season } = req.body;

    // Fetch disease history
    let diseaseHistory = [];
    try {
        const diseases = await Disease.find({ farm: farm._id })
            .select("prediction.disease")
            .lean();
        diseaseHistory = diseases
            .map((d) => d.prediction?.disease)
            .filter(Boolean);
    } catch (err) {
        logger.warn(`Could not fetch disease history: ${err.message}`);
    }

    // Build farm context
    const farmContext = {
        soilType: farm.soilType || "other",
        season: season || undefined,
        irrigationType: farm.waterSource?.irrigationType || "other",
        farmArea: farm.area?.value,
        soilPH: farm.soilPH || undefined,
        terrain: farm.terrain || "flat",
        diseaseHistory,
    };

    // Rule-based analysis
    const ranking = rankAllCrops(farmContext, 5);

    // Try Gemini AI enhancement
    let aiAdvisory = null;
    try {
        const { getCropPlanningAdvisory } = require("../services/geminiService");
        const geminiResult = await getCropPlanningAdvisory({
            location: farm.address
                ? `${farm.address.village || ""}, ${farm.address.district || ""}, ${farm.address.state || ""}`
                : "India",
            soilType: farmContext.soilType,
            area: `${farmContext.farmArea || "unknown"}`,
            waterSource: farmContext.irrigationType,
            season: farmContext.season || "current",
            previousCrops: cropName || "not specified",
            query: cropName
                ? `Is ${cropName} suitable for my farm? What alternatives should I consider?`
                : "What are the best crops to grow on my farm this season?",
        }, req.user._id.toString());

        aiAdvisory = {
            text: geminiResult.text,
            tokensUsed: geminiResult.tokensUsed,
        };
    } catch (err) {
        logger.warn(`Gemini crop planning advisory failed: ${err.message}`);
        aiAdvisory = {
            text: null,
            error: "AI advisory temporarily unavailable. Rule-based analysis is still provided.",
        };
    }

    sendSuccess(res, 200, "AI-enhanced suitability analysis complete", {
        farm: {
            id: farm._id,
            name: farm.name,
            area: farm.area,
            soilType: farm.soilType,
        },
        ruleBasedRanking: ranking,
        aiAdvisory,
    });
});

module.exports = {
    checkSuitability,
    rankCrops,
    getAlternatives,
    getRotationPlan,
    analyzeForFarm,
    analyzeWithAI,
};
