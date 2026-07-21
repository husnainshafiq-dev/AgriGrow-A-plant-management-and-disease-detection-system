// ============================================================
// 🤖 AI Advisory Controller (STEP 4.1 + 4.2)
// ============================================================
//
// CONTROLLER ENDPOINTS:
//
//   Method  Path                        Description
//   ──────  ──────────────────────────  ─────────────────────────────────
//   POST    /api/advisory/ask           General farming advisory
//   POST    /api/advisory/disease       Disease-specific advisory
//   POST    /api/advisory/crop-plan     Crop planning advisory
//   POST    /api/advisory/soil          Soil management advisory
//   POST    /api/advisory/cost          Cost estimation advisory
//   GET     /api/advisory/history       User's advisory history
//   GET     /api/advisory/:id           Single advisory record
//   PATCH   /api/advisory/:id           Rate, bookmark, or add notes
//   DELETE  /api/advisory/:id           Delete an advisory record
//
// STEP 4.2.5 — COMPLETE ADVISORY FLOW:
//
//   ┌─────────────────────────────────────────────────────────┐
//   │                   POST /advisory/disease                │
//   └─────────────────────────────────────────────────────────┘
//        │
//   ┌────▼──────────────────────────────────────────────┐
//   │ 1. RECEIVE ML OUTPUT                              │
//   │    ├── disease: "Tomato — Early Blight"           │
//   │    ├── confidence: 94.32                          │
//   │    ├── confidenceLevel: "high"                    │
//   │    ├── severity: "moderate"                       │
//   │    ├── isHealthy: false                           │
//   │    └── topPredictions: [...]                      │
//   └────┬──────────────────────────────────────────────┘
//        │
//   ┌────▼──────────────────────────────────────────────┐
//   │ 2. ENRICH WITH FARM CONTEXT                       │
//   │    ├── cropType: "Tomato"                         │
//   │    ├── location: "Maharashtra, India"             │
//   │    ├── season: "Kharif"                           │
//   │    ├── soilType: "Black soil"                     │
//   │    └── area: "5 acres"                            │
//   └────┬──────────────────────────────────────────────┘
//        │
//   ┌────▼──────────────────────────────────────────────┐
//   │ 3. BUILD STRUCTURED PROMPT                        │
//   │    Uses buildDiseasePrompt() template              │
//   │    Includes system persona + disease + context     │
//   └────┬──────────────────────────────────────────────┘
//        │
//   ┌────▼──────────────────────────────────────────────┐
//   │ 4. SEND TO GEMINI API                             │
//   │    POST https://generativelanguage.googleapis.com  │
//   │    Uses lower temperature (0.5) for precision      │
//   │    Timeout: 30 seconds                             │
//   └────┬──────────────────────────────────────────────┘
//        │
//   ┌────▼──────────────────────────────────────────────┐
//   │ 5. RECEIVE + VALIDATE RESPONSE                    │
//   │    ├── Check for empty response                   │
//   │    ├── Check for content safety blocks             │
//   │    └── Extract text + token usage                 │
//   └────┬──────────────────────────────────────────────┘
//        │
//   ┌────▼──────────────────────────────────────────────┐
//   │ 6. COMBINE ML CONFIDENCE + GEMINI TEXT            │
//   │    combineMLAndGeminiAdvisory() adds:             │
//   │    ├── Confidence preamble (emoji-coded)          │
//   │    ├── Alternative diagnoses (if low confidence)  │
//   │    └── Action urgency level                       │
//   └────┬──────────────────────────────────────────────┘
//        │
//   ┌────▼──────────────────────────────────────────────┐
//   │ 7. SAVE TO MONGODB                                │
//   │    Advisory.create() with:                        │
//   │    ├── response text + preamble                   │
//   │    ├── context (disease + farm data)              │
//   │    ├── token usage                                │
//   │    ├── action urgency                             │
//   │    └── linked diseaseReport ID                    │
//   └────┬──────────────────────────────────────────────┘
//        │
//   ┌────▼──────────────────────────────────────────────┐
//   │ 8. RETURN TO FRONTEND                             │
//   │    {                                              │
//   │      success: true,                               │
//   │      data: {                                      │
//   │        id, preamble, advisory, fullAdvisory,      │
//   │        actionUrgency, tokensUsed, ...             │
//   │      }                                            │
//   │    }                                              │
//   └──────────────────────────────────────────────────-┘
//
// ERROR HANDLING & FALLBACK (STEP 4.2.3):
//   If Gemini API fails:
//     1. Log error with context
//     2. Generate fallback advisory from ML model's built-in data
//     3. Mark advisory as isFallback = true in MongoDB
//     4. Return fallback to user with notice
//   If Gemini returns low-quality advice:
//     1. Check if response is too short (< 100 chars)
//     2. Check if response is gibberish (no recognizable sections)
//     3. If either, supplement with fallback
// ============================================================

const asyncHandler = require("express-async-handler");
const Advisory = require("../models/Advisory");
const Disease = require("../models/Disease");
const {
    getAdvisory,
    getDiseaseAdvisory,
    getCropPlanningAdvisory,
    getSoilAdvisory,
    getCostEstimationAdvisory,
    getFallbackAdvisory,
    combineMLAndGeminiAdvisory,
} = require("../services/geminiService");
const { sendSuccess } = require("../utils/apiResponse");
const { AppError } = require("../middleware/errorHandler");
const logger = require("../utils/logger");

// ============================================================
// 1. GENERAL ADVISORY — Ask any farming question
// ============================================================
/**
 * @desc    Get AI-powered farming advisory
 * @route   POST /api/advisory/ask
 * @access  Private
 *
 * Request Body:
 *   {
 *     "query": "How often should I water my tomato plants?",
 *     "context": {
 *       "cropType": "Tomato",
 *       "soilType": "Sandy loam",
 *       "season": "Kharif",
 *       "location": "Maharashtra"
 *     },
 *     "farmId": "65a1b2c3d4..." (optional)
 *   }
 */
const askAdvisory = asyncHandler(async (req, res, next) => {
    const { query, context, farmId, category } = req.body;

    if (!query || query.trim().length === 0) {
        return next(new AppError("Please provide a question.", 400));
    }

    if (query.length > 2000) {
        return next(
            new AppError("Question is too long. Maximum 2000 characters.", 400)
        );
    }

    try {
        // Call Gemini with rate limiting per user
        const result = await getAdvisory(
            query,
            context || {},
            req.user._id.toString()
        );

        // Save to database
        const record = await Advisory.create({
            user: req.user._id,
            farm: farmId || undefined,
            query,
            context: context || {},
            response: result.text,
            category: category || "general",
            promptTemplate: "general",
            tokensUsed: result.tokensUsed,
        });

        sendSuccess(res, 200, "Advisory generated", {
            id: record._id,
            query,
            response: result.text,
            category: record.category,
            tokensUsed: result.tokensUsed,
            createdAt: record.createdAt,
        });
    } catch (error) {
        logger.error(`General advisory failed: ${error.message}`);
        return next(new AppError(error.message, 503));
    }
});

// ============================================================
// 2. DISEASE ADVISORY — Post-detection detailed treatment
// ============================================================
/**
 * @desc    Get disease-specific treatment advisory from Gemini
 * @route   POST /api/advisory/disease
 * @access  Private
 *
 * HOW IT WORKS (STEP 4.2.5):
 *   1. Receives ML prediction result + farm context
 *   2. Builds structured disease prompt (template in geminiService)
 *   3. Calls Gemini API with lower temperature (0.5) for precision
 *   4. Combines ML confidence level with Gemini response
 *   5. Saves comprehensive advisory to MongoDB
 *   6. Returns full advisory to frontend
 *
 * Request Body:
 *   {
 *     "diseaseReportId": "65b2c3d4...",
 *     "disease": "Tomato — Early Blight",
 *     "confidence": 94.32,
 *     "confidenceLevel": "high",
 *     "severity": "moderate",
 *     "isHealthy": false,
 *     "topPredictions": [...],
 *     "description": "Caused by Alternaria solani...",
 *     "recommendation": "Apply fungicides...",
 *     "cropType": "Tomato",
 *     "location": "Maharashtra, India",
 *     "season": "Kharif",
 *     "soilType": "Black soil",
 *     "area": "5 acres",
 *     "farmingMethod": "Conventional",
 *     "farmId": "65a1b2c3..."
 *   }
 */
const getDiseaseAdvisoryHandler = asyncHandler(async (req, res, next) => {
    const {
        diseaseReportId,
        disease,
        confidence,
        confidenceLevel,
        severity,
        isHealthy,
        topPredictions,
        description,
        recommendation,
        cropType,
        location,
        season,
        soilType,
        area,
        farmingMethod,
        farmId,
    } = req.body;

    // ---------------------------------------------------
    // Validate required disease data
    // ---------------------------------------------------
    if (!disease) {
        return next(
            new AppError(
                "Disease name is required. Please run a disease detection scan first.",
                400
            )
        );
    }

    // ---------------------------------------------------
    // Build disease data object for the prompt
    // ---------------------------------------------------
    const diseaseData = {
        disease,
        confidence: confidence || 0,
        confidenceLevel: confidenceLevel || "unknown",
        severity: severity || "Not assessed",
        cropType: cropType || "",
        location: location || "",
        season: season || "",
        soilType: soilType || "",
        area: area || "",
        farmingMethod: farmingMethod || "Conventional",
    };

    // ML result for confidence combination
    const mlResult = {
        confidence: confidence || 0,
        confidenceLevel: confidenceLevel || "unknown",
        is_healthy: isHealthy || false,
        top_predictions: topPredictions || [],
    };

    let advisory;
    let isFallback = false;

    try {
        // ---------------------------------------------------
        // Call Gemini API for disease advisory
        // ---------------------------------------------------
        const geminiResult = await getDiseaseAdvisory(
            diseaseData,
            req.user._id.toString()
        );

        // ---------------------------------------------------
        // Validate Gemini response quality
        // ---------------------------------------------------
        if (!geminiResult.text || geminiResult.text.length < 100) {
            logger.warn(
                "Gemini returned very short response — supplementing with fallback"
            );
            const fallback = getFallbackAdvisory({
                disease,
                confidence,
                description,
                recommendation,
            });
            geminiResult.text = geminiResult.text
                ? geminiResult.text + "\n\n---\n\n" + fallback
                : fallback;
            isFallback = true;
        }

        // ---------------------------------------------------
        // Combine ML confidence + Gemini advisory
        // ---------------------------------------------------
        advisory = combineMLAndGeminiAdvisory(mlResult, geminiResult.text);
        advisory.tokensUsed = geminiResult.tokensUsed;
    } catch (error) {
        // ---------------------------------------------------
        // FALLBACK: Gemini unavailable (STEP 4.2.3)
        // ---------------------------------------------------
        logger.error(`Disease advisory Gemini call failed: ${error.message}`);

        const fallbackText = getFallbackAdvisory({
            disease,
            confidence,
            description,
            recommendation,
        });

        advisory = combineMLAndGeminiAdvisory(mlResult, fallbackText);
        advisory.tokensUsed = { prompt: 0, response: 0, total: 0 };
        isFallback = true;
    }

    // ---------------------------------------------------
    // Save to MongoDB
    // ---------------------------------------------------
    const record = await Advisory.create({
        user: req.user._id,
        farm: farmId || undefined,
        diseaseReport: diseaseReportId || undefined,
        query: `Disease treatment advisory for: ${disease}`,
        context: {
            cropType,
            soilType,
            season,
            location,
            area,
            farmingMethod,
            diseaseDetected: disease,
            diseaseConfidence: confidence,
            diseaseSeverity: severity,
        },
        response: advisory.advisory,
        preamble: advisory.preamble,
        actionUrgency: advisory.actionUrgency,
        category: "disease-treatment",
        promptTemplate: "disease",
        tokensUsed: advisory.tokensUsed,
        isFallback,
    });

    // ---------------------------------------------------
    // Optionally update the disease report with advisory ID
    // ---------------------------------------------------
    if (diseaseReportId) {
        try {
            await Disease.findByIdAndUpdate(diseaseReportId, {
                aiAdvisory: advisory.fullAdvisory,
            });
        } catch (err) {
            logger.warn(`Could not link advisory to disease report: ${err.message}`);
        }
    }

    // ---------------------------------------------------
    // Response to frontend
    // ---------------------------------------------------
    sendSuccess(res, 200, "Disease advisory generated", {
        id: record._id,
        preamble: advisory.preamble,
        advisory: advisory.advisory,
        fullAdvisory: advisory.fullAdvisory,
        actionUrgency: advisory.actionUrgency,
        confidenceLevel: advisory.confidenceLevel,
        confidence: advisory.confidence,
        isFallback,
        tokensUsed: advisory.tokensUsed,
        diseaseReportId: diseaseReportId || null,
        createdAt: record.createdAt,
    });
});

// ============================================================
// 3. CROP PLANNING ADVISORY
// ============================================================
/**
 * @desc    Get crop planning advice
 * @route   POST /api/advisory/crop-plan
 * @access  Private
 *
 * Request Body:
 *   {
 *     "query": "What crops should I plant this season?",
 *     "location": "Punjab, India",
 *     "soilType": "Alluvial",
 *     "season": "Rabi",
 *     "area": "10 acres",
 *     "waterSource": "Canal + Borewell",
 *     "budget": "₹50,000 per acre",
 *     "previousCrops": "Paddy, Wheat",
 *     "farmId": "65a1b2c3..."
 *   }
 */
const getCropPlanningHandler = asyncHandler(async (req, res, next) => {
    const context = {
        query: req.body.query || "What crops should I plant this season?",
        location: req.body.location || "",
        soilType: req.body.soilType || "",
        season: req.body.season || "",
        area: req.body.area || "",
        waterSource: req.body.waterSource || "",
        budget: req.body.budget || "",
        previousCrops: req.body.previousCrops || "",
    };

    try {
        const result = await getCropPlanningAdvisory(
            context,
            req.user._id.toString()
        );

        const record = await Advisory.create({
            user: req.user._id,
            farm: req.body.farmId || undefined,
            query: context.query,
            context: {
                cropType: req.body.previousCrops || "",
                soilType: context.soilType,
                season: context.season,
                location: context.location,
                area: context.area,
            },
            response: result.text,
            category: "crop-planning",
            promptTemplate: "crop-planning",
            tokensUsed: result.tokensUsed,
        });

        sendSuccess(res, 200, "Crop planning advisory generated", {
            id: record._id,
            query: context.query,
            response: result.text,
            category: "crop-planning",
            tokensUsed: result.tokensUsed,
            createdAt: record.createdAt,
        });
    } catch (error) {
        logger.error(`Crop planning advisory failed: ${error.message}`);
        return next(new AppError(error.message, 503));
    }
});

// ============================================================
// 4. SOIL MANAGEMENT ADVISORY
// ============================================================
/**
 * @desc    Get soil management advice
 * @route   POST /api/advisory/soil
 * @access  Private
 */
const getSoilAdvisoryHandler = asyncHandler(async (req, res, next) => {
    const context = {
        query: req.body.query || "How can I improve my soil health?",
        soilType: req.body.soilType || "",
        soilPH: req.body.soilPH || "",
        location: req.body.location || "",
        cropType: req.body.cropType || "",
        issues: req.body.issues || "",
    };

    try {
        const result = await getSoilAdvisory(
            context,
            req.user._id.toString()
        );

        const record = await Advisory.create({
            user: req.user._id,
            farm: req.body.farmId || undefined,
            query: context.query,
            context: {
                soilType: context.soilType,
                location: context.location,
                cropType: context.cropType,
            },
            response: result.text,
            category: "soil-management",
            promptTemplate: "soil",
            tokensUsed: result.tokensUsed,
        });

        sendSuccess(res, 200, "Soil advisory generated", {
            id: record._id,
            query: context.query,
            response: result.text,
            category: "soil-management",
            tokensUsed: result.tokensUsed,
            createdAt: record.createdAt,
        });
    } catch (error) {
        logger.error(`Soil advisory failed: ${error.message}`);
        return next(new AppError(error.message, 503));
    }
});

// ============================================================
// 5. COST ESTIMATION ADVISORY
// ============================================================
/**
 * @desc    Get AI-enhanced cost estimation
 * @route   POST /api/advisory/cost
 * @access  Private
 */
const getCostAdvisoryHandler = asyncHandler(async (req, res, next) => {
    const context = {
        cropName: req.body.cropName || "",
        area: req.body.area || "",
        areaUnit: req.body.areaUnit || "acres",
        location: req.body.location || "",
        season: req.body.season || "",
        farmingMethod: req.body.farmingMethod || "Conventional",
    };

    try {
        const result = await getCostEstimationAdvisory(
            context,
            req.user._id.toString()
        );

        const record = await Advisory.create({
            user: req.user._id,
            farm: req.body.farmId || undefined,
            query: `Cost estimation for ${context.cropName || "crop"} on ${context.area || "unknown"} ${context.areaUnit}`,
            context: {
                cropType: context.cropName,
                location: context.location,
                season: context.season,
                area: context.area,
                farmingMethod: context.farmingMethod,
            },
            response: result.text,
            category: "cost-estimation",
            promptTemplate: "cost-estimation",
            tokensUsed: result.tokensUsed,
        });

        sendSuccess(res, 200, "Cost estimation advisory generated", {
            id: record._id,
            response: result.text,
            category: "cost-estimation",
            tokensUsed: result.tokensUsed,
            createdAt: record.createdAt,
        });
    } catch (error) {
        logger.error(`Cost estimation advisory failed: ${error.message}`);
        return next(new AppError(error.message, 503));
    }
});

// ============================================================
// 6. GET ADVISORY HISTORY
// ============================================================
/**
 * @desc    Get advisory history for current user
 * @route   GET /api/advisory/history
 * @access  Private
 * @query   ?page=1&limit=10&category=disease-treatment&bookmarked=true&sort=newest
 */
const getAdvisoryHistory = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    // Build filter
    const filter = { user: req.user._id };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.bookmarked === "true") filter.isBookmarked = true;
    if (req.query.farmId) filter.farm = req.query.farmId;
    if (req.query.isFallback === "true") filter.isFallback = true;

    // Sort
    let sort = { createdAt: -1 };
    if (req.query.sort === "oldest") sort = { createdAt: 1 };
    if (req.query.sort === "rating") sort = { rating: -1, createdAt: -1 };

    const [records, total] = await Promise.all([
        Advisory.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .populate("farm", "name")
            .populate("diseaseReport", "prediction.disease prediction.confidence"),
        Advisory.countDocuments(filter),
    ]);

    sendSuccess(res, 200, "Advisory history retrieved", {
        records,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1,
        },
    });
});

// ============================================================
// 7. GET SINGLE ADVISORY
// ============================================================
/**
 * @desc    Get a single advisory record
 * @route   GET /api/advisory/:id
 * @access  Private (owner only)
 */
const getAdvisoryById = asyncHandler(async (req, res, next) => {
    const record = await Advisory.findById(req.params.id)
        .populate("farm", "name location soilType")
        .populate("diseaseReport", "prediction imageUrl topPredictions");

    if (!record) {
        return next(new AppError("Advisory record not found", 404));
    }

    if (record.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized to view this advisory", 403));
    }

    sendSuccess(res, 200, "Advisory record retrieved", { record });
});

// ============================================================
// 8. UPDATE ADVISORY — Rate, bookmark, add notes
// ============================================================
/**
 * @desc    Update advisory (rate, bookmark, add notes)
 * @route   PATCH /api/advisory/:id
 * @access  Private (owner only)
 */
const updateAdvisory = asyncHandler(async (req, res, next) => {
    const record = await Advisory.findById(req.params.id);

    if (!record) {
        return next(new AppError("Advisory record not found", 404));
    }

    if (record.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized to update this advisory", 403));
    }

    // Whitelist updatable fields
    if (req.body.rating !== undefined) record.rating = req.body.rating;
    if (req.body.isBookmarked !== undefined) record.isBookmarked = req.body.isBookmarked;
    if (req.body.isHelpful !== undefined) record.isHelpful = req.body.isHelpful;
    if (req.body.userNotes !== undefined) record.userNotes = req.body.userNotes;

    await record.save();

    sendSuccess(res, 200, "Advisory updated", { record });
});

// ============================================================
// 9. DELETE ADVISORY
// ============================================================
/**
 * @desc    Delete an advisory record
 * @route   DELETE /api/advisory/:id
 * @access  Private (owner only)
 */
const deleteAdvisory = asyncHandler(async (req, res, next) => {
    const record = await Advisory.findById(req.params.id);

    if (!record) {
        return next(new AppError("Advisory record not found", 404));
    }

    if (record.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized to delete this advisory", 403));
    }

    await record.deleteOne();

    sendSuccess(res, 200, "Advisory record deleted");
});

// ============================================================
// 10. ADVISORY STATISTICS
// ============================================================
/**
 * @desc    Get advisory usage statistics
 * @route   GET /api/advisory/stats
 * @access  Private
 */
const getAdvisoryStats = asyncHandler(async (req, res) => {
    const stats = await Advisory.aggregate([
        { $match: { user: req.user._id } },
        {
            $group: {
                _id: null,
                totalQueries: { $sum: 1 },
                totalTokensUsed: { $sum: "$tokensUsed.total" },
                avgRating: { $avg: "$rating" },
                bookmarkedCount: {
                    $sum: { $cond: ["$isBookmarked", 1, 0] },
                },
                fallbackCount: {
                    $sum: { $cond: ["$isFallback", 1, 0] },
                },
            },
        },
    ]);

    // Category breakdown
    const categoryBreakdown = await Advisory.aggregate([
        { $match: { user: req.user._id } },
        {
            $group: {
                _id: "$category",
                count: { $sum: 1 },
                avgTokens: { $avg: "$tokensUsed.total" },
            },
        },
        { $sort: { count: -1 } },
    ]);

    sendSuccess(res, 200, "Advisory statistics retrieved", {
        summary: stats[0] || {
            totalQueries: 0,
            totalTokensUsed: 0,
            avgRating: null,
            bookmarkedCount: 0,
            fallbackCount: 0,
        },
        categoryBreakdown,
    });
});

module.exports = {
    askAdvisory,
    getDiseaseAdvisoryHandler,
    getCropPlanningHandler,
    getSoilAdvisoryHandler,
    getCostAdvisoryHandler,
    getAdvisoryHistory,
    getAdvisoryById,
    updateAdvisory,
    deleteAdvisory,
    getAdvisoryStats,
};
