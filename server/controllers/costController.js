// ============================================================
// 💰 Cost Estimation Controller (STEP 6.1)
// ============================================================
//
// ENDPOINTS:
//   POST   /api/cost/estimate          — Quick cost estimation
//   POST   /api/cost/estimate/detailed  — Detailed + save to DB
//   POST   /api/cost/estimate/farm/:id  — Estimate using farm data
//   POST   /api/cost/compare            — Compare multiple crops
//   POST   /api/cost/estimate/ai        — AI-enhanced estimation
//   GET    /api/cost/history            — User's saved estimations
//   GET    /api/cost/history/:id        — Single estimation
//   DELETE /api/cost/history/:id        — Delete estimation
//   PUT    /api/cost/crop/:id           — Update crop cost data
//   GET    /api/cost/crops              — Supported crops list
//   GET    /api/cost/crops/soil/:type   — Crops for soil type
//   GET    /api/cost/crops/season/:name — Crops for season
//
// ============================================================

const asyncHandler = require("express-async-handler");
const CostEstimation = require("../models/CostEstimation");
const Farm = require("../models/Farm");
const Crop = require("../models/Crop");
const {
    estimateCost,
    compareCrops,
    getSupportedCrops,
    getCropCategories,
    getCropsForSoil,
    getCropsForSeason,
} = require("../services/costService");
const { AppError } = require("../middleware/errorHandler");
const { sendSuccess } = require("../utils/apiResponse");
const logger = require("../utils/logger");

// ============================================================
// 1. QUICK ESTIMATE — No DB save, instant result
// ============================================================
/**
 * @desc    Quick crop cost estimation (not saved)
 * @route   POST /api/cost/estimate
 * @access  Private
 */
const estimate = asyncHandler(async (req, res) => {
    const {
        cropName,
        area,
        areaUnit,
        soilType,
        season,
        irrigationType,
        laborRate,
        customCosts,
        marketPrice,
    } = req.body;

    if (!cropName) {
        throw new AppError("cropName is required", 400);
    }
    if (!area || area <= 0) {
        throw new AppError("area must be a positive number", 400);
    }

    const result = estimateCost({
        cropName,
        area,
        areaUnit,
        soilType,
        season,
        irrigationType,
        laborRate,
        customCosts,
        marketPrice,
    });

    if (!result.available) {
        return sendSuccess(res, 200, result.message, result);
    }

    sendSuccess(res, 200, "Cost estimation complete", {
        estimation: result,
        estimationType: "quick",
    });
});

// ============================================================
// 2. DETAILED ESTIMATE — Calculate + save to DB
// ============================================================
/**
 * @desc    Detailed cost estimation with DB persistence
 * @route   POST /api/cost/estimate/detailed
 * @access  Private
 */
const estimateDetailed = asyncHandler(async (req, res) => {
    const {
        cropName, area, areaUnit, soilType, season,
        irrigationType, laborRate, customCosts, marketPrice,
        farmId, cropId, title, notes,
    } = req.body;

    if (!cropName) throw new AppError("cropName is required", 400);
    if (!area || area <= 0) throw new AppError("area must be a positive number", 400);

    // Run estimation engine
    const result = estimateCost({
        cropName, area, areaUnit, soilType, season,
        irrigationType, laborRate, customCosts, marketPrice,
    });

    if (!result.available) {
        throw new AppError(result.message, 400);
    }

    // Verify farm ownership if farmId provided
    if (farmId) {
        const farm = await Farm.findById(farmId).lean();
        if (!farm) throw new AppError("Farm not found", 404);
        if (farm.user.toString() !== req.user._id.toString()) {
            throw new AppError("Not authorized to use this farm", 403);
        }
    }

    // Verify crop ownership if cropId provided
    if (cropId) {
        const crop = await Crop.findById(cropId).lean();
        if (!crop) throw new AppError("Crop not found", 404);
        if (crop.user.toString() !== req.user._id.toString()) {
            throw new AppError("Not authorized to use this crop", 403);
        }
    }

    // Build line items from cost breakdown
    const lineItems = Object.entries(result.costBreakdown)
        .filter(([, amount]) => amount > 0)
        .map(([category, amount]) => ({
            category: category === "riskContingency" ? "other" : category,
            description: category === "riskContingency"
                ? `Risk contingency (${result.riskProfile.premium})`
                : `${category} cost for ${result.crop}`,
            amount,
            isEstimated: !customCosts?.[category],
        }));

    // Save to DB
    const estimation = await CostEstimation.create({
        user: req.user._id,
        farm: farmId || undefined,
        crop: cropId || undefined,
        cropName: result.crop,
        area: result.area,
        season: result.season,
        costSummary: {
            seeds: result.costBreakdown.seeds || 0,
            fertilizer: result.costBreakdown.fertilizer || 0,
            pesticides: result.costBreakdown.pesticides || 0,
            labor: result.costBreakdown.labor || 0,
            irrigation: result.costBreakdown.irrigation || 0,
            equipment: result.costBreakdown.equipment || 0,
            transportation: result.costBreakdown.transportation || 0,
            storage: result.costBreakdown.storage || 0,
            other: (result.costBreakdown.other || 0) + (result.costBreakdown.riskContingency || 0),
        },
        lineItems,
        totalCost: result.totalCost,
        expectedYield: result.expectedYield,
        marketPricePerUnit: result.marketPrice.value,
        expectedRevenue: result.expectedRevenue,
        expectedProfit: result.expectedProfit,
        roi: result.roiNumeric,
        breakEvenYield: result.breakEvenYield,
        currency: "INR",
        estimationType: "detailed",
        title: title || `${result.crop} Cost Estimate`,
        notes: notes || "",
        isSaved: true,
        dataSource: Object.keys(customCosts || {}).length > 0 ? "hybrid" : "reference-data",
    });

    logger.info(`Cost estimation saved: ${estimation._id} for user ${req.user._id}`);

    sendSuccess(res, 201, "Detailed cost estimation saved", {
        estimation,
        analysis: {
            soilCompatibility: result.soilCompatibility,
            seasonCompatibility: result.seasonCompatibility,
            riskFactors: result.riskFactors,
            costReductionTips: result.costReductionTips,
            riskProfile: result.riskProfile,
        },
    });
});

// ============================================================
// 3. FARM-LINKED ESTIMATE — Pull data from existing farm
// ============================================================
/**
 * @desc    Estimate cost using farm's stored data
 * @route   POST /api/cost/estimate/farm/:id
 * @access  Private
 */
const estimateForFarm = asyncHandler(async (req, res, next) => {
    const farm = await Farm.findById(req.params.id);
    if (!farm) return next(new AppError("Farm not found", 404));
    if (farm.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized", 403));
    }

    const { cropName, season, customCosts, marketPrice } = req.body;

    if (!cropName) {
        return next(new AppError("cropName is required", 400));
    }

    // Pull farm data
    const result = estimateCost({
        cropName,
        area: farm.area?.value || 1,
        areaUnit: farm.area?.unit || "acres",
        soilType: farm.soilType || "other",
        season: season || undefined,
        irrigationType: farm.waterSource?.irrigationType || "other",
        customCosts,
        marketPrice,
    });

    if (!result.available) {
        return next(new AppError(result.message, 400));
    }

    sendSuccess(res, 200, "Farm-linked cost estimation complete", {
        farm: {
            id: farm._id,
            name: farm.name,
            area: farm.area,
            soilType: farm.soilType,
            irrigationType: farm.waterSource?.irrigationType,
        },
        estimation: result,
    });
});

// ============================================================
// 4. COMPARE CROPS — Side-by-side analysis
// ============================================================
/**
 * @desc    Compare cost estimations for multiple crops
 * @route   POST /api/cost/compare
 * @access  Private
 */
const compare = asyncHandler(async (req, res) => {
    const { cropNames, area, areaUnit, soilType, season, irrigationType } = req.body;

    if (!cropNames || !Array.isArray(cropNames) || cropNames.length < 2) {
        throw new AppError("Provide at least 2 crop names to compare", 400);
    }
    if (cropNames.length > 10) {
        throw new AppError("Maximum 10 crops can be compared at once", 400);
    }
    if (!area || area <= 0) {
        throw new AppError("area must be a positive number", 400);
    }

    const result = compareCrops({
        cropNames, area, areaUnit, soilType, season, irrigationType,
    });

    sendSuccess(res, 200, `Compared ${result.comparisons.length} crops`, result);
});

// ============================================================
// 5. AI-ENHANCED ESTIMATE — Gemini augmentation
// ============================================================
/**
 * @desc    Get AI-enhanced cost estimation with Gemini suggestions
 * @route   POST /api/cost/estimate/ai
 * @access  Private
 */
const estimateWithAI = asyncHandler(async (req, res) => {
    const {
        cropName, area, areaUnit, soilType, season,
        irrigationType, laborRate, customCosts, marketPrice,
        farmId, location,
    } = req.body;

    if (!cropName) throw new AppError("cropName is required", 400);
    if (!area || area <= 0) throw new AppError("area must be a positive number", 400);

    // Step 1: Run rule-based engine
    const baseEstimate = estimateCost({
        cropName, area, areaUnit, soilType, season,
        irrigationType, laborRate, customCosts, marketPrice,
    });

    if (!baseEstimate.available) {
        throw new AppError(baseEstimate.message, 400);
    }

    // Step 2: Try Gemini enhancement
    let aiSuggestions = null;
    try {
        const { getCostEstimationAdvisory } = require("../services/geminiService");
        const geminiResult = await getCostEstimationAdvisory({
            cropName: baseEstimate.crop,
            area: `${baseEstimate.area.value}`,
            areaUnit: baseEstimate.area.unit,
            location: location || "India",
            season: baseEstimate.season,
            farmingMethod: irrigationType === "drip" ? "Modern/Drip" : "Conventional",
        }, req.user._id.toString());

        aiSuggestions = {
            text: geminiResult.text,
            tokensUsed: geminiResult.tokensUsed,
        };
    } catch (err) {
        logger.warn(`Gemini cost advisory failed: ${err.message}`);
        aiSuggestions = {
            text: null,
            error: "AI suggestions temporarily unavailable. Rule-based estimates are still provided.",
        };
    }

    // Step 3: Optionally save with AI data
    let savedEstimation = null;
    if (farmId || req.body.save) {
        // Verify farm ownership
        if (farmId) {
            const farm = await Farm.findById(farmId).lean();
            if (!farm) throw new AppError("Farm not found", 404);
            if (farm.user.toString() !== req.user._id.toString()) {
                throw new AppError("Not authorized to use this farm", 403);
            }
        }

        const lineItems = Object.entries(baseEstimate.costBreakdown)
            .filter(([, amount]) => amount > 0)
            .map(([category, amount]) => ({
                category: category === "riskContingency" ? "other" : category,
                description: `${category} for ${baseEstimate.crop}`,
                amount,
                isEstimated: true,
            }));

        savedEstimation = await CostEstimation.create({
            user: req.user._id,
            farm: farmId || undefined,
            cropName: baseEstimate.crop,
            area: baseEstimate.area,
            season: baseEstimate.season,
            costSummary: {
                seeds: baseEstimate.costBreakdown.seeds || 0,
                fertilizer: baseEstimate.costBreakdown.fertilizer || 0,
                pesticides: baseEstimate.costBreakdown.pesticides || 0,
                labor: baseEstimate.costBreakdown.labor || 0,
                irrigation: baseEstimate.costBreakdown.irrigation || 0,
                equipment: baseEstimate.costBreakdown.equipment || 0,
                transportation: baseEstimate.costBreakdown.transportation || 0,
                storage: baseEstimate.costBreakdown.storage || 0,
                other: (baseEstimate.costBreakdown.other || 0) + (baseEstimate.costBreakdown.riskContingency || 0),
            },
            lineItems,
            totalCost: baseEstimate.totalCost,
            expectedYield: baseEstimate.expectedYield,
            marketPricePerUnit: baseEstimate.marketPrice.value,
            expectedRevenue: baseEstimate.expectedRevenue,
            expectedProfit: baseEstimate.expectedProfit,
            roi: baseEstimate.roiNumeric,
            breakEvenYield: baseEstimate.breakEvenYield,
            currency: "INR",
            estimationType: "ai-assisted",
            title: `AI-Enhanced: ${baseEstimate.crop}`,
            aiSuggestions: {
                costReduction: baseEstimate.costReductionTips,
                overallAdvice: aiSuggestions?.text || "",
            },
            isSaved: true,
            dataSource: "ai-generated",
        });
    }

    sendSuccess(res, 200, "AI-enhanced cost estimation complete", {
        estimation: baseEstimate,
        aiSuggestions,
        savedId: savedEstimation?._id || null,
    });
});

// ============================================================
// 6. HISTORY — Retrieve saved estimations
// ============================================================
/**
 * @desc    Get user's saved cost estimations
 * @route   GET /api/cost/history
 * @access  Private
 */
const getHistory = asyncHandler(async (req, res) => {
    const {
        page = 1, limit = 10, farmId, cropName, sort = "-createdAt",
    } = req.query;

    const query = { user: req.user._id, isSaved: true };
    if (farmId) query.farm = farmId;
    if (cropName) query.cropName = new RegExp(cropName, "i");

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await CostEstimation.countDocuments(query);

    const estimations = await CostEstimation.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate("farm", "name area soilType")
        .lean();

    sendSuccess(res, 200, `Found ${estimations.length} estimations`, {
        estimations,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
        },
    });
});

/**
 * @desc    Get single cost estimation
 * @route   GET /api/cost/history/:id
 * @access  Private
 */
const getEstimation = asyncHandler(async (req, res, next) => {
    const estimation = await CostEstimation.findById(req.params.id)
        .populate("farm", "name area soilType waterSource address")
        .populate("crop", "name variety status area");

    if (!estimation) return next(new AppError("Estimation not found", 404));
    if (estimation.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized", 403));
    }

    sendSuccess(res, 200, "Estimation retrieved", { estimation });
});

/**
 * @desc    Delete a saved estimation
 * @route   DELETE /api/cost/history/:id
 * @access  Private
 */
const deleteEstimation = asyncHandler(async (req, res, next) => {
    const estimation = await CostEstimation.findById(req.params.id);
    if (!estimation) return next(new AppError("Estimation not found", 404));
    if (estimation.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized", 403));
    }

    await estimation.deleteOne();

    sendSuccess(res, 200, "Estimation deleted", { id: req.params.id });
});

// ============================================================
// 7. SAVE COSTS TO CROP — Update existing crop record
// ============================================================
/**
 * @desc    Save cost data to a crop record
 * @route   PUT /api/cost/crop/:id
 * @access  Private
 */
const saveCropCosts = asyncHandler(async (req, res, next) => {
    const crop = await Crop.findById(req.params.id);
    if (!crop) return next(new AppError("Crop not found", 404));
    if (crop.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized", 403));
    }

    // Update cost fields
    if (req.body.costs) {
        crop.costs = { ...crop.costs.toObject?.() || crop.costs, ...req.body.costs };
    }
    if (req.body.expectedRevenue !== undefined) crop.expectedRevenue = req.body.expectedRevenue;
    if (req.body.expectedYield) crop.expectedYield = req.body.expectedYield;
    if (req.body.marketPricePerUnit !== undefined) crop.marketPricePerUnit = req.body.marketPricePerUnit;

    await crop.save();

    sendSuccess(res, 200, "Crop costs updated", {
        crop,
        totalCost: crop.totalCost,
        estimatedProfit: crop.estimatedProfit,
        costPerAcre: crop.costPerAcre,
    });
});

// ============================================================
// 8. REFERENCE DATA — Crops list, categories, filtering
// ============================================================
/**
 * @desc    Get supported crops for estimation
 * @route   GET /api/cost/crops
 * @access  Public
 */
const supportedCrops = asyncHandler(async (req, res) => {
    const crops = getSupportedCrops();
    const categories = getCropCategories();

    sendSuccess(res, 200, `${crops.length} supported crops`, {
        crops,
        categories,
        totalCrops: crops.length,
    });
});

/**
 * @desc    Get crops suitable for a soil type
 * @route   GET /api/cost/crops/soil/:type
 * @access  Public
 */
const cropsForSoil = asyncHandler(async (req, res) => {
    const crops = getCropsForSoil(req.params.type);
    sendSuccess(res, 200, `${crops.length} crops suitable for ${req.params.type} soil`, {
        soilType: req.params.type,
        crops,
    });
});

/**
 * @desc    Get crops suitable for a season
 * @route   GET /api/cost/crops/season/:name
 * @access  Public
 */
const cropsForSeason = asyncHandler(async (req, res) => {
    const crops = getCropsForSeason(req.params.name);
    sendSuccess(res, 200, `${crops.length} crops for ${req.params.name} season`, {
        season: req.params.name,
        crops,
    });
});

module.exports = {
    estimate,
    estimateDetailed,
    estimateForFarm,
    compare,
    estimateWithAI,
    getHistory,
    getEstimation,
    deleteEstimation,
    saveCropCosts,
    supportedCrops,
    cropsForSoil,
    cropsForSeason,
};
