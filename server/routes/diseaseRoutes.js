// ============================================================
// 🦠 Disease Detection Routes (STEP 3.1 + 3.2)
// ============================================================
//
// ROUTE TABLE:
//   Method  Path                       Access    Description
//   ──────  ─────────────────────────  ────────  ───────────────────────────
//   POST    /api/disease/detect        Private   Upload image + get prediction
//   GET     /api/disease/history       Private   List detection history
//   GET     /api/disease/stats         Private   Aggregated statistics
//   GET     /api/disease/ml-health     Private   Check ML service status
//   GET     /api/disease/:id           Private   Get single detection record
//   PUT     /api/disease/:id           Private   Update (feedback/treatment)
//   DELETE  /api/disease/:id           Private   Delete detection record
//
// UPLOAD MIDDLEWARE CHAIN:
//   1. protect              → verify JWT token
//   2. uploadDisease.single  → Multer saves image to uploads/disease/
//   3. handleMulterError     → Convert multer errors to AppErrors
//   4. validateUploadedFile  → Verify magic bytes (anti-spoofing)
//   5. detectDisease         → Controller: ML prediction + save
// ============================================================

const express = require("express");
const router = express.Router();

// Controllers
const {
    detectDisease,
    syncOfflineDetection,
    getHistory,
    getDetection,
    updateDetection,
    deleteDetection,
    getStats,
    mlHealthCheck,
} = require("../controllers/diseaseController");

// Middleware
const { protect, optionalAuth } = require("../middleware/auth");
const {
    uploadDisease,
    validateUploadedFile,
    handleMulterError,
} = require("../middleware/upload");

// ============================================================
// Detection endpoint — PUBLIC (no login required)
// ============================================================
/**
 * @route   POST /api/disease/detect
 * @desc    Upload a plant leaf image and get disease prediction
 *
 * Middleware chain:
 *   1. uploadDisease.single("image")  → save file to disk
 *   2. handleMulterError              → convert Multer errors
 *   3. validateUploadedFile           → verify magic bytes
 *   4. detectDisease                  → send to ML, return result
 *
 * Request:
 *   Content-Type: multipart/form-data
 *   Body fields:
 *     - image  (file)   - Plant leaf image (JPEG/PNG, max 10MB) [REQUIRED]
 *     - farmId (string) - Link detection to a farm [OPTIONAL, requires auth]
 *     - cropId (string) - Link detection to a crop [OPTIONAL, requires auth]
 *
 * Response:
 *   {
 *     success: true,
 *     message: "Disease detection complete",
 *     data: {
 *       prediction: "Tomato — Early Blight",
 *       confidence: 94.32,
 *       confidenceLevel: "high",
 *       isHealthy: false,
 *       ...
 *     }
 *   }
 */
router.post(
    "/detect",
    optionalAuth,
    uploadDisease.single("image"),     // ← field name = "image"
    handleMulterError,
    validateUploadedFile,
    detectDisease
);

router.post("/sync", optionalAuth, syncOfflineDetection);

// -----------------------------------------------------------
// All other disease routes require authentication
// -----------------------------------------------------------
router.use(protect);

// ============================================================
// History & Statistics
// ============================================================

/**
 * @route   GET /api/disease/history
 * @desc    Get user's detection history (paginated)
 * @query   ?page=1&limit=10&farmId=...&isHealthy=false&sort=newest
 */
router.get("/history", getHistory);

/**
 * @route   GET /api/disease/stats
 * @desc    Get aggregated detection statistics
 */
router.get("/stats", getStats);

/**
 * @route   GET /api/disease/ml-health
 * @desc    Check ML microservice health status
 */
router.get("/ml-health", mlHealthCheck);

// ============================================================
// Single record operations
// ============================================================

/**
 * @route   GET    /api/disease/:id  → get single record
 * @route   PUT    /api/disease/:id  → update (feedback/treatment)
 * @route   DELETE /api/disease/:id  → delete record + image
 */
router
    .route("/:id")
    .get(getDetection)
    .put(updateDetection)
    .delete(deleteDetection);

module.exports = router;
