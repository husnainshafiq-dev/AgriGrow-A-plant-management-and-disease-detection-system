// ============================================================
// 🤖 AI Advisory Routes (STEP 4.1 + 4.2)
// ============================================================
//
// ROUTE TABLE:
//   Method  Path                        Access    Description
//   ──────  ──────────────────────────  ────────  ─────────────────────────
//   POST    /api/advisory/ask           Private   General farming advisory
//   POST    /api/advisory/disease       Private   Disease treatment advisory
//   POST    /api/advisory/crop-plan     Private   Crop planning advisory
//   POST    /api/advisory/soil          Private   Soil management advisory
//   POST    /api/advisory/cost          Private   Cost estimation advisory
//   GET     /api/advisory/history       Private   Advisory history (paginated)
//   GET     /api/advisory/stats         Private   Advisory usage statistics
//   GET     /api/advisory/:id           Private   Single advisory record
//   PATCH   /api/advisory/:id           Private   Rate, bookmark, add notes
//   DELETE  /api/advisory/:id           Private   Delete advisory record
//
// RATE LIMITING:
//   All POST routes (AI generation) are rate-limited:
//   • Gemini service: 10 req/min per user (in-memory)
//   • Express rate limiter: 20 req/min per IP (middleware)
//   • Google quota: 60 req/min total (Gemini free tier)
//
// SECURITY:
//   1. JWT required on all routes (protect middleware)
//   2. Joi validation on all POST routes
//   3. Owner-only access on PATCH/DELETE (checked in controller)
//   4. API key stored in .env — never exposed to client
//   5. MongoDB ObjectId validation on :id params
// ============================================================

const express = require("express");
const router = express.Router();
const Joi = require("joi");
const rateLimit = require("express-rate-limit");

// Controllers
const {
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
} = require("../controllers/advisoryController");

// Middleware
const { protect } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");

// -----------------------------------------------------------
// Rate Limiter for AI generation endpoints
// -----------------------------------------------------------
// Prevents abuse of the Gemini API. More restrictive than
// other endpoints because AI calls are expensive.
// -----------------------------------------------------------
const advisoryRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,             // 20 requests per minute per IP
    message: {
        success: false,
        error: "Too many AI advisory requests. Please wait a moment before asking another question.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// -----------------------------------------------------------
// Joi Validation Schemas
// -----------------------------------------------------------

// Common context schema (reused across multiple endpoints)
const contextSchema = Joi.object({
    cropType: Joi.string().max(100).allow(""),
    soilType: Joi.string().max(100).allow(""),
    season: Joi.string().max(50).allow(""),
    location: Joi.string().max(200).allow(""),
    area: Joi.string().max(50).allow(""),
    farmingMethod: Joi.string().max(50).allow(""),
    diseaseDetected: Joi.string().max(200).allow(""),
}).unknown(false);

// General advisory
const askSchema = Joi.object({
    query: Joi.string().min(5).max(2000).required().messages({
        "string.min": "Question must be at least 5 characters long",
        "string.max": "Question cannot exceed 2000 characters",
        "any.required": "Please provide a question",
    }),
    context: contextSchema,
    farmId: Joi.string().hex().length(24).allow("", null),
    category: Joi.string().valid(
        "disease-treatment", "pest-control", "soil-management",
        "irrigation", "fertilization", "crop-planning",
        "cost-estimation", "weather", "general"
    ),
});

// Disease advisory
const diseaseSchema = Joi.object({
    diseaseReportId: Joi.string().hex().length(24).allow("", null),
    disease: Joi.string().max(200).required().messages({
        "any.required": "Disease name is required",
    }),
    confidence: Joi.number().min(0).max(100),
    confidenceLevel: Joi.string().valid("high", "moderate", "low", "very_low", "unknown"),
    severity: Joi.string().valid("none", "moderate", "high", "unknown").allow(""),
    isHealthy: Joi.boolean(),
    topPredictions: Joi.array().items(
        Joi.object({
            class: Joi.string(),
            probability: Joi.number(),
        })
    ),
    description: Joi.string().max(2000).allow(""),
    recommendation: Joi.string().max(2000).allow(""),
    cropType: Joi.string().max(100).allow(""),
    location: Joi.string().max(200).allow(""),
    season: Joi.string().max(50).allow(""),
    soilType: Joi.string().max(100).allow(""),
    area: Joi.string().max(50).allow(""),
    farmingMethod: Joi.string().max(50).allow(""),
    farmId: Joi.string().hex().length(24).allow("", null),
});

// Crop planning advisory
const cropPlanSchema = Joi.object({
    query: Joi.string().max(2000).allow(""),
    location: Joi.string().max(200).allow(""),
    soilType: Joi.string().max(100).allow(""),
    season: Joi.string().max(50).allow(""),
    area: Joi.string().max(50).allow(""),
    waterSource: Joi.string().max(100).allow(""),
    budget: Joi.string().max(50).allow(""),
    previousCrops: Joi.string().max(500).allow(""),
    farmId: Joi.string().hex().length(24).allow("", null),
});

// Soil advisory
const soilSchema = Joi.object({
    query: Joi.string().max(2000).allow(""),
    soilType: Joi.string().max(100).allow(""),
    soilPH: Joi.string().max(10).allow(""),
    location: Joi.string().max(200).allow(""),
    cropType: Joi.string().max(100).allow(""),
    issues: Joi.string().max(500).allow(""),
    farmId: Joi.string().hex().length(24).allow("", null),
});

// Cost estimation advisory
const costSchema = Joi.object({
    cropName: Joi.string().max(100).allow(""),
    area: Joi.string().max(50).allow(""),
    areaUnit: Joi.string().valid("acres", "hectares", "bigha", "kanal").default("acres"),
    location: Joi.string().max(200).allow(""),
    season: Joi.string().max(50).allow(""),
    farmingMethod: Joi.string().max(50).allow(""),
    farmId: Joi.string().hex().length(24).allow("", null),
});

// Update advisory
const updateSchema = Joi.object({
    rating: Joi.number().integer().min(1).max(5),
    isBookmarked: Joi.boolean(),
    isHelpful: Joi.boolean().allow(null),
    userNotes: Joi.string().max(1000).allow(""),
}).min(1).messages({
    "object.min": "At least one field must be provided to update",
});

// ============================================================
// All routes require authentication
// ============================================================
router.use(protect);

// ============================================================
// AI Generation Routes (rate-limited)
// ============================================================

router.post(
    "/ask",
    advisoryRateLimiter,
    validateBody(askSchema),
    askAdvisory
);

router.post(
    "/disease",
    advisoryRateLimiter,
    validateBody(diseaseSchema),
    getDiseaseAdvisoryHandler
);

router.post(
    "/crop-plan",
    advisoryRateLimiter,
    validateBody(cropPlanSchema),
    getCropPlanningHandler
);

router.post(
    "/soil",
    advisoryRateLimiter,
    validateBody(soilSchema),
    getSoilAdvisoryHandler
);

router.post(
    "/cost",
    advisoryRateLimiter,
    validateBody(costSchema),
    getCostAdvisoryHandler
);

// ============================================================
// History & Statistics (no rate limiting needed)
// ============================================================

router.get("/history", getAdvisoryHistory);
router.get("/stats", getAdvisoryStats);

// ============================================================
// Single Record Operations
// ============================================================

router
    .route("/:id")
    .get(getAdvisoryById)
    .patch(validateBody(updateSchema), updateAdvisory)
    .delete(deleteAdvisory);

module.exports = router;
