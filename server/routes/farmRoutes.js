// ============================================================
// 🗺️ Farm Routes (STEP 2.2)
// ============================================================
//
// ROUTE TABLE:
//   Method  Path                                Access    Description
//   ──────  ──────────────────────────────────  ────────  ─────────────────────
//   POST    /api/farms                          Private   Create a farm
//   GET     /api/farms                          Private   List user's farms
//   GET     /api/farms/nearby                   Private   Find farms near a point
//   GET     /api/farms/:id                      Private   Get single farm
//   PUT     /api/farms/:id                      Private   Update farm
//   DELETE  /api/farms/:id                      Private   Delete farm + cascade
//   POST    /api/farms/:id/crop-history         Private   Add crop history entry
//   DELETE  /api/farms/:id/crop-history/:entryId Private  Remove history entry
//   GET     /api/farms/:id/statistics           Private   Get farm statistics
//   GET     /api/farms/:id/geo-analysis         Private   Geospatial analysis
//   GET     /api/farms/:id/soil-check           Private   Soil-crop suitability
//
// AUTH:
//   All routes require a valid JWT token (protect middleware
//   applied at the router level via router.use).
// ============================================================

const express = require("express");
const router = express.Router();

// Controllers
const {
    createFarm,
    getFarms,
    getFarm,
    updateFarm,
    deleteFarm,
    addCropHistory,
    removeCropHistory,
    getFarmStatistics,
    getGeoAnalysis,
    getNearbyFarms,
    checkSoilSuitability,
} = require("../controllers/farmController");

// Middleware
const { protect } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");

// Validation Schemas
const {
    createFarmSchema,
    updateFarmSchema,
    addCropHistorySchema,
} = require("../validators/farmSchemas");

// -----------------------------------------------------------
// Apply authentication to ALL farm routes
// -----------------------------------------------------------
// This means every route below requires a valid JWT.
// We apply it once here instead of on each individual route.
// -----------------------------------------------------------
router.use(protect);

// ============================================================
// CRUD Routes
// ============================================================

/**
 * @route   POST /api/farms
 * @desc    Create a new farm
 * @route   GET  /api/farms
 * @desc    List all farms for current user
 */
router
    .route("/")
    .post(validateBody(createFarmSchema), createFarm)
    .get(getFarms);

/**
 * @route   GET    /api/farms/:id
 * @desc    Get single farm with full details
 * @route   PUT    /api/farms/:id
 * @desc    Update farm details
 * @route   DELETE /api/farms/:id
 * @desc    Delete farm (cascades to crops, disease reports, etc.)
 */
router
    .route("/:id")
    .get(getFarm)
    .put(validateBody(updateFarmSchema), updateFarm)
    .delete(deleteFarm);

// ============================================================
// Crop History Routes (sub-resource)
// ============================================================

/**
 * @route   POST   /api/farms/:id/crop-history
 * @desc    Add a historical crop entry to the farm
 */
router.post(
    "/:id/crop-history",
    validateBody(addCropHistorySchema),
    addCropHistory
);

/**
 * @route   DELETE /api/farms/:id/crop-history/:entryId
 * @desc    Remove a crop history entry
 */
router.delete(
    "/:id/crop-history/:entryId",
    removeCropHistory
);

// ============================================================
// Geospatial Routes (STEP 5.2)
// ============================================================

/**
 * @route   GET /api/farms/nearby?lng=73.85&lat=18.52&radius=5000
 * @desc    Find farms near a given coordinate point
 */
router.get("/nearby", getNearbyFarms);

// ============================================================
// Statistics & Analysis Routes
// ============================================================

/**
 * @route   GET /api/farms/:id/statistics
 * @desc    Get aggregated statistics for a farm
 */
router.get(
    "/:id/statistics",
    getFarmStatistics
);

/**
 * @route   GET /api/farms/:id/geo-analysis
 * @desc    Get geospatial analysis (area/perimeter/centroid/soil)
 */
router.get(
    "/:id/geo-analysis",
    getGeoAnalysis
);

/**
 * @route   GET /api/farms/:id/soil-check?crop=tomato
 * @desc    Check soil-crop compatibility
 */
router.get(
    "/:id/soil-check",
    checkSoilSuitability
);

module.exports = router;
