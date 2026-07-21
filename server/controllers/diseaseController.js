// ============================================================
// 🦠 Disease Detection Controller (STEP 3.1 + 3.2)
// ============================================================
//
// COMPLETE DETECTION FLOW:
//
//   ┌──────────────────────────────────────────────────────────┐
//   │                    POST /api/disease/detect              │
//   └──────────────────────────────────────────────────────────┘
//        │
//   ┌────▼────┐
//   │ MULTER  │─── 1. Validate file type, size, extension
//   │ upload  │    2. Save to server/uploads/disease/
//   └────┬────┘    3. Set req.file = { path, filename, ... }
//        │
//   ┌────▼─────────────┐
//   │ MAGIC BYTES      │─── 4. Verify file header matches MIME type
//   │ validation       │    5. Delete file if spoofed
//   └────┬─────────────┘
//        │
//   ┌────▼─────────────┐
//   │ CONTROLLER LOGIC │
//   │                  │─── 6. Check if req.file exists
//   │                  │    7. Send image to ML service (HTTP POST)
//   │  predictDisease()│    8. ML service runs TF model inference
//   │                  │    9. Receive JSON prediction
//   │                  │    10. Apply confidence thresholds
//   │                  │
//   │  (optional)      │──  11. If disease detected, ask Gemini AI
//   │  getAdvisory()   │       for treatment recommendations
//   │                  │
//   │  Disease.create()│──  12. Save report to MongoDB
//   │                  │
//   │  cleanup()       │──  13. Optionally delete original image
//   └────┬─────────────┘       (or keep for reference)
//        │
//   ┌────▼────┐
//   │ RESPONSE│─── 14. Return prediction + advisory to client
//   └─────────┘
//
// ============================================================

const asyncHandler = require("express-async-handler");
const path = require("path");
const Disease = require("../models/Disease");
const { predictDisease, checkHealth } = require("../services/mlService");
const {
    getDiseaseAdvisory,
    getFallbackAdvisory,
    combineMLAndGeminiAdvisory,
} = require("../services/geminiService");
const { AppError } = require("../middleware/errorHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { deleteUploadedFile, getUploadUrl } = require("../middleware/upload");
const { PREDICTION } = require("../utils/constants");
const logger = require("../utils/logger");

const DEMO_USER_ID = "000000000000000000000000";
const OFFLINE_PLACEHOLDER_IMAGE = "/uploads/disease/offline-scan-placeholder.svg";

const normalizeBoolean = (value, fallback = false) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value === "true";
    return fallback;
};

const normalizeTopPredictions = (predictions = []) => {
    if (!Array.isArray(predictions)) return [];

    return predictions
        .filter((item) => item && (item.class || item.name || item.disease))
        .slice(0, 5)
        .map((item) => ({
            class: String(item.class || item.name || item.disease),
            probability: Number(item.probability ?? item.confidence ?? 0),
        }))
        .filter((item) => !Number.isNaN(item.probability));
};

// ============================================================
// DETECT DISEASE — Main endpoint
// ============================================================
/**
 * @desc    Detect plant disease from uploaded image
 * @route   POST /api/disease/detect
 * @access  Private
 *
 * Request:
 *   Content-Type: multipart/form-data
 *   Fields:
 *     image  (file)     - The plant leaf image (JPEG/PNG, max 10MB)
 *     farmId (string)   - Optional: link detection to a farm
 *     cropId (string)   - Optional: link detection to a crop
 *
 * Response:
 *   {
 *     success: true,
 *     data: {
 *       id: "...",
 *       prediction: "Tomato — Early Blight",
 *       confidence: 94.32,
 *       confidenceLevel: "high",
 *       confidenceMessage: "...",
 *       isHealthy: false,
 *       description: "...",
 *       recommendation: "...",
 *       aiAdvisory: "...",       ← Gemini AI recommendation
 *       topPredictions: [...],
 *       imageUrl: "/uploads/disease/1707840000-abc123.jpg"
 *     }
 *   }
 */
const detectDisease = asyncHandler(async (req, res, next) => {
    // ---------------------------------------------------
    // Step 1: Validate file was uploaded
    // ---------------------------------------------------
    if (!req.file) {
        return next(
            new AppError(
                "Please upload a plant leaf image. " +
                "Accepted formats: JPEG, PNG, WebP (max 10MB).",
                400
            )
        );
    }

    const imagePath = req.file.path;
    const imageFilename = req.file.filename;

    try {
        // ---------------------------------------------------
        // Step 2: Send image to ML microservice
        // ---------------------------------------------------
        // This calls the Python FastAPI /predict endpoint.
        // The mlService.js handles:
        //   - Retry with exponential backoff (2 retries)
        //   - Circuit breaker (fail fast if service is down)
        //   - Timeout (60 seconds)
        //   - Confidence threshold processing
        // ---------------------------------------------------
        const prediction = await predictDisease(imagePath);

        // ---------------------------------------------------
        // Step 3: Get AI advisory from Gemini (for all users when disease detected)
        // Requires GEMINI_API_KEY in server/.env — see README or .env.example
        // ---------------------------------------------------
        let combinedAdvisory = null;
        let isFallback = false;
        const isLoggedIn = !!req.user;
        const rateLimitUserId = req.user?._id?.toString() || "guest";
        const offlineMode = req.body.offlineMode === "true" || req.body.offlineMode === true;

        if (
            !prediction.is_healthy &&
            !prediction.isBelowThreshold &&
            prediction.confidence >= PREDICTION.MIN_CONFIDENCE
        ) {
            const diseaseData = {
                disease: prediction.prediction,
                confidence: prediction.confidence,
                confidenceLevel: prediction.confidenceLevel,
                severity: prediction.severity || "Not assessed",
                cropType: req.body.cropType || "",
                location: req.body.location || "",
                season: req.body.season || "",
                soilType: req.body.soilType || "",
                area: req.body.area || "",
                farmingMethod: req.body.farmingMethod || "Conventional",
            };

            const mlResult = {
                confidence: prediction.confidence,
                confidenceLevel: prediction.confidenceLevel,
                is_healthy: prediction.is_healthy,
                top_predictions: prediction.top_predictions || [],
            };

            if (offlineMode) {
                // Offline mode — skip Gemini, use ML model fallback only
                logger.info("Offline mode — skipping Gemini advisory");
                const fallbackText = getFallbackAdvisory({
                    disease: prediction.prediction,
                    confidence: prediction.confidence,
                    description: prediction.description,
                    recommendation: prediction.recommendation,
                });
                combinedAdvisory = combineMLAndGeminiAdvisory(mlResult, fallbackText);
                isFallback = true;
            } else {
                // Online mode — try Gemini, fall back on error
                try {
                    const geminiResult = await getDiseaseAdvisory(
                        diseaseData,
                        rateLimitUserId
                    );
                    combinedAdvisory = combineMLAndGeminiAdvisory(
                        mlResult,
                        geminiResult.text
                    );
                    combinedAdvisory.tokensUsed = geminiResult.tokensUsed;
                } catch (aiError) {
                    logger.warn(`Gemini advisory failed: ${aiError.message}`);
                    const fallbackText = getFallbackAdvisory({
                        disease: prediction.prediction,
                        confidence: prediction.confidence,
                        description: prediction.description,
                        recommendation: prediction.recommendation,
                    });
                    combinedAdvisory = combineMLAndGeminiAdvisory(mlResult, fallbackText);
                    isFallback = true;
                }
            }
        }

        // ---------------------------------------------------
        // Step 4: Save detection record to MongoDB (only when logged in)
        // ---------------------------------------------------
        const imageUrl = getUploadUrl("disease", imageFilename);
        let record = null;

        if (isLoggedIn) {
            record = await Disease.create({
                user: req.user._id,
                farm: req.body.farmId || undefined,
                crop: req.body.cropId || undefined,
                imageUrl: imageUrl,
                imageOriginalName: req.file.originalname,
                imageMimeType: req.file.mimetype,
                prediction: {
                    disease: prediction.prediction,
                    confidence: prediction.confidence,
                    isHealthy: prediction.is_healthy,
                },
                description: prediction.description || "",
                recommendation: prediction.recommendation || "",
                topPredictions: prediction.top_predictions || [],
                aiAdvisory: combinedAdvisory?.fullAdvisory || "",
            });
            logger.info(
                `Disease detection #${record._id}: "${prediction.prediction}" ` +
                `(${prediction.confidence}%) for user ${req.user._id}` +
                (isFallback ? " [FALLBACK advisory]" : "")
            );
        } else {
            logger.info(
                `Disease detection (guest): "${prediction.prediction}" (${prediction.confidence}%)`
            );
        }

        // ---------------------------------------------------
        // Step 5: Build and send response
        // ---------------------------------------------------
        sendSuccess(res, 200, "Disease detection complete", {
            id: record?._id ?? null,
            prediction: prediction.prediction,
            confidence: prediction.confidence,
            confidenceLevel: prediction.confidenceLevel,
            confidenceMessage: prediction.confidenceMessage,
            isHealthy: prediction.is_healthy,
            isBelowThreshold: prediction.isBelowThreshold,
            description: prediction.description,
            recommendation: prediction.recommendation,
            aiAdvisory: combinedAdvisory?.fullAdvisory || "",
            advisoryPreamble: combinedAdvisory?.preamble || "",
            actionUrgency: combinedAdvisory?.actionUrgency || "normal",
            isFallbackAdvisory: isFallback,
            topPredictions: prediction.top_predictions,
            imageUrl: imageUrl,
            farm: isLoggedIn ? (req.body.farmId || null) : null,
            crop: isLoggedIn ? (req.body.cropId || null) : null,
            createdAt: record?.createdAt ?? null,
        });
    } catch (error) {
        // Clean up uploaded file on ML service failure
        deleteUploadedFile(imagePath);
        return next(
            new AppError(error.message || "Disease detection failed", 503)
        );
    }
});

// ============================================================
// SYNC OFFLINE DETECTION
// ============================================================
/**
 * @desc    Store a scan that was produced by the browser offline model
 * @route   POST /api/disease/sync
 * @access  Public, user-linked when a valid token/cookie is present
 */
const syncOfflineDetection = asyncHandler(async (req, res, next) => {
    const predictionName = req.body.prediction || req.body.disease;
    const confidence = Number(req.body.confidence);

    if (!predictionName || Number.isNaN(confidence)) {
        return next(
            new AppError("Offline scan sync requires prediction and confidence", 400)
        );
    }

    const userId = req.user?._id || DEMO_USER_ID;
    const capturedAt = req.body.timestamp ? new Date(req.body.timestamp) : new Date();
    const topPredictions = normalizeTopPredictions(
        req.body.top_predictions || req.body.topPredictions
    );

    const record = await Disease.create({
        user: userId,
        imageUrl: OFFLINE_PLACEHOLDER_IMAGE,
        imageOriginalName: "offline-browser-scan",
        imageMimeType: "image/svg+xml",
        prediction: {
            disease: String(predictionName),
            confidence: Math.max(0, Math.min(100, confidence)),
            isHealthy: normalizeBoolean(
                req.body.is_healthy ?? req.body.isHealthy,
                false
            ),
        },
        description: req.body.description || "",
        recommendation: req.body.recommendation || "",
        topPredictions,
        aiAdvisory: req.body.aiAdvisory || req.body.ai_advisory || "",
        source: "offline-sync",
        offlineCapturedAt: Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt,
    });

    logger.info(
        `Offline disease scan synced #${record._id}: "${record.prediction.disease}" ` +
        `(${record.prediction.confidence}%) for user ${userId}`
    );

    sendSuccess(res, 201, "Offline scan synced", {
        id: record._id,
        synced: true,
        record,
    });
});

// ============================================================
// GET DETECTION HISTORY
// ============================================================
/**
 * @desc    Get detection history for current user
 * @route   GET /api/disease/history
 * @access  Private
 * @query   ?page=1&limit=10&farmId=...&isHealthy=false&sort=newest
 */
const getHistory = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    // Build filter
    const filter = { user: req.user._id };
    if (req.query.farmId) filter.farm = req.query.farmId;
    if (req.query.cropId) filter.crop = req.query.cropId;
    if (req.query.isHealthy !== undefined) {
        filter["prediction.isHealthy"] = req.query.isHealthy === "true";
    }
    if (req.query.resolved !== undefined) {
        filter.resolved = req.query.resolved === "true";
    }

    // Build sort
    let sort = { createdAt: -1 };
    if (req.query.sort === "oldest") sort = { createdAt: 1 };
    if (req.query.sort === "confidence") sort = { "prediction.confidence": -1 };

    const [records, total] = await Promise.all([
        Disease.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .populate("farm", "name")
            .populate("crop", "name"),
        Disease.countDocuments(filter),
    ]);

    sendSuccess(res, 200, "Detection history retrieved", {
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
// GET SINGLE DETECTION
// ============================================================
/**
 * @desc    Get a single detection record by ID
 * @route   GET /api/disease/:id
 * @access  Private (owner only)
 */
const getDetection = asyncHandler(async (req, res, next) => {
    const record = await Disease.findById(req.params.id)
        .populate("farm", "name location area soilType")
        .populate("crop", "name variety status");

    if (!record) {
        return next(new AppError("Detection record not found", 404));
    }

    if (record.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized to view this record", 403));
    }

    sendSuccess(res, 200, "Detection record retrieved", { record });
});

// ============================================================
// UPDATE DETECTION — Add feedback or treatment info
// ============================================================
/**
 * @desc    Update a detection record (add feedback, treatment, etc.)
 * @route   PUT /api/disease/:id
 * @access  Private (owner only)
 */
const updateDetection = asyncHandler(async (req, res, next) => {
    let record = await Disease.findById(req.params.id);

    if (!record) {
        return next(new AppError("Detection record not found", 404));
    }

    if (record.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized to update this record", 403));
    }

    // Whitelist of updatable fields
    const allowedFields = [
        "userFeedback",
        "treatmentApplied",
        "treatmentDate",
        "followUpDate",
        "resolved",
    ];
    const updates = {};

    allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    });

    record = await Disease.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true, runValidators: true }
    );

    sendSuccess(res, 200, "Detection record updated", { record });
});

// ============================================================
// DELETE DETECTION
// ============================================================
/**
 * @desc    Delete a detection record
 * @route   DELETE /api/disease/:id
 * @access  Private (owner only)
 */
const deleteDetection = asyncHandler(async (req, res, next) => {
    const record = await Disease.findById(req.params.id);

    if (!record) {
        return next(new AppError("Detection record not found", 404));
    }

    if (record.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized to delete this record", 403));
    }

    // Delete the associated image file
    if (record.imageUrl) {
        const imagePath = path.join(
            __dirname, "..", "uploads", "disease",
            path.basename(record.imageUrl)
        );
        deleteUploadedFile(imagePath);
    }

    await record.deleteOne();

    sendSuccess(res, 200, "Detection record deleted");
});

// ============================================================
// GET DETECTION STATISTICS
// ============================================================
/**
 * @desc    Get aggregate detection statistics for the user
 * @route   GET /api/disease/stats
 * @access  Private
 */
const getStats = asyncHandler(async (req, res) => {
    const stats = await Disease.aggregate([
        { $match: { user: req.user._id } },
        {
            $group: {
                _id: null,
                totalScans: { $sum: 1 },
                healthyScans: {
                    $sum: { $cond: ["$prediction.isHealthy", 1, 0] },
                },
                diseasedScans: {
                    $sum: { $cond: ["$prediction.isHealthy", 0, 1] },
                },
                avgConfidence: { $avg: "$prediction.confidence" },
                resolvedCount: {
                    $sum: { $cond: ["$resolved", 1, 0] },
                },
            },
        },
    ]);

    // Get disease frequency breakdown
    const diseaseBreakdown = await Disease.aggregate([
        {
            $match: {
                user: req.user._id,
                "prediction.isHealthy": false,
            },
        },
        {
            $group: {
                _id: "$prediction.disease",
                count: { $sum: 1 },
                avgConfidence: { $avg: "$prediction.confidence" },
            },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
    ]);

    // Recent scan activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = await Disease.countDocuments({
        user: req.user._id,
        createdAt: { $gte: thirtyDaysAgo },
    });

    sendSuccess(res, 200, "Detection statistics retrieved", {
        summary: stats[0] || {
            totalScans: 0,
            healthyScans: 0,
            diseasedScans: 0,
            avgConfidence: 0,
            resolvedCount: 0,
        },
        diseaseBreakdown,
        recentActivity: {
            last30Days: recentActivity,
        },
    });
});

// ============================================================
// ML SERVICE HEALTH CHECK
// ============================================================
/**
 * @desc    Check if the ML service is running
 * @route   GET /api/disease/ml-health
 * @access  Private
 */
const mlHealthCheck = asyncHandler(async (_req, res) => {
    const health = await checkHealth();
    const statusCode = health.status === "available" ? 200 : 503;

    res.status(statusCode).json({
        success: health.status === "available",
        ...health,
    });
});

module.exports = {
    detectDisease,
    syncOfflineDetection,
    getHistory,
    getDetection,
    updateDetection,
    deleteDetection,
    getStats,
    mlHealthCheck,
};
