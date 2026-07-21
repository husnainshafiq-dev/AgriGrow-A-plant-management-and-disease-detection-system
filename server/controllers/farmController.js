// ============================================================
// 🗺️ Farm Controller (STEP 2.2)
// ============================================================
//
// FARM-USER LINKAGE:
//
//   ┌────────────────┐       ┌──────────────────────────┐
//   │     USER       │       │         FARM             │
//   │────────────────│       │──────────────────────────│
//   │ _id (ObjectId) │◄──────│ user (ObjectId ref)      │
//   │ name           │  1:N  │ name                     │
//   │ email          │       │ location (GeoJSON)       │
//   │ role           │       │ area { value, unit }     │
//   └────────────────┘       │ soilType                 │
//                            │ waterSource { primary, …}│
//                            │ cropHistory [ { … } ]    │
//                            │ crops [ ObjectId refs ]   │
//                            └──────────────────────────┘
//
//   KEY PRINCIPLE:
//   Every farm document stores the user's _id in its `user` field.
//   When a user requests their farms, we filter by:
//     Farm.find({ user: req.user._id })
//   This ensures data isolation — users ONLY see their own farms.
//
// OPERATIONS:
//   CREATE  → POST   /api/farms
//   READ    → GET    /api/farms          (list all user's farms)
//   READ    → GET    /api/farms/:id      (single farm with crops)
//   UPDATE  → PUT    /api/farms/:id      (update farm details)
//   DELETE  → DELETE /api/farms/:id      (soft or hard delete)
//   EXTRA   → POST   /api/farms/:id/crop-history  (add history entry)
//   EXTRA   → GET    /api/farms/:id/statistics     (farm stats)
// ============================================================

const asyncHandler = require("express-async-handler");
const Farm = require("../models/Farm");
const Crop = require("../models/Crop");
const Disease = require("../models/Disease");
const { AppError } = require("../middleware/errorHandler");
const { sendSuccess } = require("../utils/apiResponse");
const logger = require("../utils/logger");
const {
    calculateArea,
    calculateCentroid,
    calculatePerimeter,
    validatePolygon,
    getCropSuitability,
    checkCropSoilMatch,
} = require("../utils/geoUtils");

// -----------------------------------------------------------
// Helper: Verify farm ownership
// -----------------------------------------------------------
const verifyOwnership = (farm, userId) => {
    if (farm.user.toString() !== userId.toString()) {
        throw new AppError("Not authorized to access this farm", 403);
    }
};

// ============================================================
// CREATE FARM
// ============================================================
/**
 * @desc    Create a new farm profile
 * @route   POST /api/farms
 * @access  Private (farmer/admin)
 *
 * HOW FARM IS LINKED TO USER:
 *   The `user` field is set to `req.user._id`, which is the
 *   authenticated user's MongoDB ObjectId (set by protect middleware).
 *   This is NOT taken from the request body — this prevents a user
 *   from creating a farm under someone else's account.
 */
const createFarm = asyncHandler(async (req, res, next) => {
    // Auto-set user from JWT token (never from request body!)
    const farmData = {
        ...req.body,
        user: req.user._id, // ← Ownership assignment
    };

    // ---------------------------------------------------
    // Validate polygon if coordinates are provided
    // ---------------------------------------------------
    if (req.body.location?.coordinates) {
        const validation = validatePolygon(req.body.location.coordinates);
        if (!validation.valid) {
            return next(
                new AppError(
                    `Invalid farm boundary: ${validation.errors.join("; ")}`,
                    400
                )
            );
        }
    }

    // ---------------------------------------------------
    // Auto-calculate centroid using geodesic method
    // ---------------------------------------------------
    if (req.body.location?.coordinates?.[0]) {
        const ring = req.body.location.coordinates[0];

        // Calculate centroid
        if (!req.body.center) {
            const centroid = calculateCentroid(ring);
            farmData.center = {
                type: "Point",
                coordinates: centroid,
            };
        }

        // Auto-calculate area from polygon if not provided
        if (!req.body.area?.value) {
            const unit = req.body.area?.unit || "acres";
            const calculatedArea = calculateArea(ring, unit);
            farmData.area = {
                value: calculatedArea,
                unit,
            };
        }
    }

    const farm = await Farm.create(farmData);

    logger.info(`Farm created: "${farm.name}" by user ${req.user._id}`);

    sendSuccess(res, 201, "Farm created successfully", { farm });
});

// ============================================================
// GET ALL FARMS (for current user)
// ============================================================
/**
 * @desc    Get all farms belonging to the authenticated user
 * @route   GET /api/farms
 * @access  Private
 * @query   ?page=1&limit=10&soilType=loamy&isActive=true&sort=name
 *
 * FILTERING:
 *   The primary filter is ALWAYS { user: req.user._id }.
 *   Additional filters (soilType, isActive, etc.) are optional.
 */
const getFarms = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50); // Cap at 50
    const skip = (page - 1) * limit;

    // Build filter — ALWAYS start with user ownership
    const filter = { user: req.user._id };

    // Optional filters
    if (req.query.soilType) filter.soilType = req.query.soilType;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";
    if (req.query.farmType) filter.farmType = req.query.farmType;
    if (req.query.search) {
        filter.name = { $regex: req.query.search, $options: "i" };
    }

    // Build sort
    let sort = { createdAt: -1 }; // Default: newest first
    if (req.query.sort === "name") sort = { name: 1 };
    if (req.query.sort === "area") sort = { "area.value": -1 };
    if (req.query.sort === "oldest") sort = { createdAt: 1 };

    const [farms, total] = await Promise.all([
        Farm.find(filter)
            .populate("crops", "name status area plantingDate")
            .sort(sort)
            .skip(skip)
            .limit(limit),
        Farm.countDocuments(filter),
    ]);

    sendSuccess(res, 200, "Farms retrieved", {
        count: farms.length,
        farms,
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
// GET SINGLE FARM
// ============================================================
/**
 * @desc    Get a single farm by ID with full details
 * @route   GET /api/farms/:id
 * @access  Private (owner only)
 *
 * OWNERSHIP CHECK:
 *   Even though the route is behind `protect` middleware,
 *   we still verify that the requesting user OWNS this farm.
 *   Without this check, any authenticated user could view
 *   any farm by guessing the ObjectId.
 */
const getFarm = asyncHandler(async (req, res, next) => {
    const farm = await Farm.findById(req.params.id)
        .populate("crops")           // Full crop details
        .populate("diseaseReports"); // Virtual count

    if (!farm) {
        return next(new AppError("Farm not found", 404));
    }

    // Ownership verification
    verifyOwnership(farm, req.user._id);

    // Get aggregate statistics for this farm
    const stats = await Promise.all([
        Crop.countDocuments({ farm: farm._id }),
        Crop.countDocuments({ farm: farm._id, status: "growing" }),
        Disease.countDocuments({ farm: farm._id }),
        Disease.countDocuments({ farm: farm._id, "prediction.isHealthy": false }),
    ]);

    const farmData = farm.toObject();
    farmData.statistics = {
        totalCrops: stats[0],
        activeCrops: stats[1],
        totalScans: stats[2],
        diseasesDetected: stats[3],
        cropHistorySeasons: farm.cropHistory?.length || 0,
    };

    sendSuccess(res, 200, "Farm retrieved", { farm: farmData });
});

// ============================================================
// UPDATE FARM
// ============================================================
/**
 * @desc    Update farm profile details
 * @route   PUT /api/farms/:id
 * @access  Private (owner only)
 *
 * SECURITY:
 *   - Ownership check prevents unauthorized updates
 *   - Joi validation (in route middleware) prevents invalid data
 *   - The `user` field CANNOT be changed (it's the owner link)
 */
const updateFarm = asyncHandler(async (req, res, next) => {
    let farm = await Farm.findById(req.params.id);

    if (!farm) {
        return next(new AppError("Farm not found", 404));
    }

    verifyOwnership(farm, req.user._id);

    // Prevent changing ownership
    if (req.body.user) {
        delete req.body.user;
    }

    // Validate updated polygon
    if (req.body.location?.coordinates) {
        const validation = validatePolygon(req.body.location.coordinates);
        if (!validation.valid) {
            return next(
                new AppError(
                    `Invalid farm boundary: ${validation.errors.join("; ")}`,
                    400
                )
            );
        }
    }

    // Auto-recalculate center and area if boundary changed
    if (req.body.location?.coordinates?.[0]) {
        const ring = req.body.location.coordinates[0];

        if (!req.body.center) {
            const centroid = calculateCentroid(ring);
            req.body.center = {
                type: "Point",
                coordinates: centroid,
            };
        }

        if (!req.body.area?.value) {
            const unit = req.body.area?.unit || farm.area?.unit || "acres";
            req.body.area = {
                value: calculateArea(ring, unit),
                unit,
            };
        }
    }

    farm = await Farm.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        {
            new: true,                 // Return updated document
            runValidators: true,       // Re-run Mongoose validators
        }
    ).populate("crops", "name status");

    logger.info(`Farm updated: "${farm.name}" by user ${req.user._id}`);

    sendSuccess(res, 200, "Farm updated successfully", { farm });
});

// ============================================================
// DELETE FARM
// ============================================================
/**
 * @desc    Delete a farm (cascades to crops, disease reports, cost est.)
 * @route   DELETE /api/farms/:id
 * @access  Private (owner only)
 *
 * CASCADE:
 *   The Farm model's pre-deleteOne hook automatically removes
 *   all associated Crops, Disease reports, and Cost Estimations.
 *   See models/Farm.js for the cascade logic.
 */
const deleteFarm = asyncHandler(async (req, res, next) => {
    const farm = await Farm.findById(req.params.id);

    if (!farm) {
        return next(new AppError("Farm not found", 404));
    }

    verifyOwnership(farm, req.user._id);

    const farmName = farm.name;

    // deleteOne() triggers the pre-deleteOne cascade hook
    await farm.deleteOne();

    logger.info(`Farm deleted: "${farmName}" by user ${req.user._id}`);

    sendSuccess(res, 200, "Farm and all associated data deleted successfully", {
        deletedFarm: farmName,
    });
});

// ============================================================
// ADD CROP HISTORY ENTRY
// ============================================================
/**
 * @desc    Add a historical crop record to the farm
 * @route   POST /api/farms/:id/crop-history
 * @access  Private (owner only)
 *
 * WHY EMBEDDED?
 *   Crop history is always accessed together with the farm
 *   and is read-only (historical data). Embedding avoids
 *   extra database lookups compared to a separate collection.
 */
const addCropHistory = asyncHandler(async (req, res, next) => {
    const farm = await Farm.findById(req.params.id);

    if (!farm) {
        return next(new AppError("Farm not found", 404));
    }

    verifyOwnership(farm, req.user._id);

    // Push new history entry (validated by Joi in route middleware)
    farm.cropHistory.push(req.body);
    await farm.save();

    logger.info(
        `Crop history added to farm "${farm.name}": ${req.body.cropName} (${req.body.season} ${req.body.year})`
    );

    sendSuccess(res, 201, "Crop history entry added", {
        farm: {
            id: farm._id,
            name: farm.name,
            cropHistory: farm.cropHistory,
        },
    });
});

// ============================================================
// REMOVE CROP HISTORY ENTRY
// ============================================================
/**
 * @desc    Remove a crop history entry by its sub-document ID
 * @route   DELETE /api/farms/:id/crop-history/:entryId
 * @access  Private (owner only)
 */
const removeCropHistory = asyncHandler(async (req, res, next) => {
    const farm = await Farm.findById(req.params.id);

    if (!farm) {
        return next(new AppError("Farm not found", 404));
    }

    verifyOwnership(farm, req.user._id);

    // Find and remove the sub-document by _id
    const entry = farm.cropHistory.id(req.params.entryId);
    if (!entry) {
        return next(new AppError("Crop history entry not found", 404));
    }

    entry.deleteOne();
    await farm.save();

    sendSuccess(res, 200, "Crop history entry removed", {
        farm: {
            id: farm._id,
            name: farm.name,
            cropHistory: farm.cropHistory,
        },
    });
});

// ============================================================
// GET FARM STATISTICS
// ============================================================
/**
 * @desc    Get aggregated statistics for a farm
 * @route   GET /api/farms/:id/statistics
 * @access  Private (owner only)
 *
 * Returns:
 *   - Total crops count
 *   - Active vs harvested vs failed crops
 *   - Disease scan summary
 *   - Total cost and revenue
 *   - Crop history summary
 */
const getFarmStatistics = asyncHandler(async (req, res, next) => {
    const farm = await Farm.findById(req.params.id);

    if (!farm) {
        return next(new AppError("Farm not found", 404));
    }

    verifyOwnership(farm, req.user._id);

    // Aggregate crop data
    const cropStats = await Crop.aggregate([
        { $match: { farm: farm._id } },
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
                totalArea: { $sum: "$area.value" },
                totalCost: {
                    $sum: {
                        $add: [
                            "$costs.seeds",
                            "$costs.fertilizer",
                            "$costs.pesticides",
                            "$costs.labor",
                            "$costs.irrigation",
                            "$costs.equipment",
                            "$costs.transportation",
                            "$costs.storage",
                            "$costs.other",
                        ],
                    },
                },
                totalExpectedRevenue: { $sum: "$expectedRevenue" },
                totalActualRevenue: { $sum: "$actualRevenue" },
            },
        },
    ]);

    // Disease scan summary
    const diseaseStats = await Disease.aggregate([
        { $match: { farm: farm._id } },
        {
            $group: {
                _id: "$prediction.isHealthy",
                count: { $sum: 1 },
            },
        },
    ]);

    // Format statistics
    const statusSummary = {};
    let totalCost = 0;
    let totalExpectedRevenue = 0;
    let totalActualRevenue = 0;

    cropStats.forEach((stat) => {
        statusSummary[stat._id] = stat.count;
        totalCost += stat.totalCost || 0;
        totalExpectedRevenue += stat.totalExpectedRevenue || 0;
        totalActualRevenue += stat.totalActualRevenue || 0;
    });

    const healthyScans = diseaseStats.find((d) => d._id === true)?.count || 0;
    const diseaseScans = diseaseStats.find((d) => d._id === false)?.count || 0;

    // Crop history summary by year
    const historyByYear = {};
    (farm.cropHistory || []).forEach((entry) => {
        const key = `${entry.year}-${entry.season}`;
        if (!historyByYear[key]) historyByYear[key] = [];
        historyByYear[key].push(entry.cropName);
    });

    sendSuccess(res, 200, "Farm statistics retrieved", {
        farm: {
            id: farm._id,
            name: farm.name,
            area: farm.area,
        },
        crops: {
            total: Object.values(statusSummary).reduce((a, b) => a + b, 0),
            byStatus: statusSummary,
        },
        financials: {
            totalCost: Math.round(totalCost),
            totalExpectedRevenue: Math.round(totalExpectedRevenue),
            totalActualRevenue: Math.round(totalActualRevenue),
            estimatedProfit: Math.round(totalExpectedRevenue - totalCost),
            currency: "INR",
        },
        diseaseScans: {
            total: healthyScans + diseaseScans,
            healthy: healthyScans,
            diseased: diseaseScans,
        },
        cropHistory: {
            totalEntries: farm.cropHistory?.length || 0,
            bySeasonYear: historyByYear,
        },
    });
});

// ============================================================
// GEO ANALYSIS — Area verification & soil suitability
// ============================================================
/**
 * @desc    Get geospatial analysis for a farm
 * @route   GET /api/farms/:id/geo-analysis
 * @access  Private (owner only)
 *
 * Returns:
 *   - Calculated area (geodesic) in multiple units
 *   - Perimeter in meters and km
 *   - Centroid coordinates
 *   - Soil-crop suitability data
 *   - Area verification (stored vs calculated)
 */
const getGeoAnalysis = asyncHandler(async (req, res, next) => {
    const farm = await Farm.findById(req.params.id);

    if (!farm) {
        return next(new AppError("Farm not found", 404));
    }

    verifyOwnership(farm, req.user._id);

    const ring = farm.location?.coordinates?.[0];
    if (!ring || ring.length < 4) {
        return next(new AppError("Farm has no valid boundary polygon", 400));
    }

    // Calculate area in multiple units
    const areaAcres = calculateArea(ring, "acres");
    const areaHectares = calculateArea(ring, "hectares");
    const areaSqm = calculateArea(ring, "sqm");

    // Perimeter
    const perimeterM = calculatePerimeter(ring);

    // Centroid
    const centroid = calculateCentroid(ring);

    // Soil suitability
    const soilInfo = getCropSuitability(farm.soilType || "other");

    // Area verification
    const storedArea = farm.area?.value || 0;
    const storedUnit = farm.area?.unit || "acres";
    const calculatedInStoredUnit = calculateArea(ring, storedUnit);
    const areaDifference = Math.abs(storedArea - calculatedInStoredUnit);
    const percentDiff = storedArea > 0
        ? ((areaDifference / storedArea) * 100).toFixed(1)
        : 0;

    sendSuccess(res, 200, "Geo-analysis complete", {
        farm: {
            id: farm._id,
            name: farm.name,
        },
        area: {
            acres: areaAcres,
            hectares: areaHectares,
            squareMeters: areaSqm,
        },
        perimeter: {
            meters: perimeterM,
            kilometers: Math.round((perimeterM / 1000) * 100) / 100,
        },
        centroid: {
            longitude: centroid[0],
            latitude: centroid[1],
        },
        boundaryPoints: ring.length - 1, // Exclude closing point
        areaVerification: {
            stored: { value: storedArea, unit: storedUnit },
            calculated: { value: calculatedInStoredUnit, unit: storedUnit },
            difference: areaDifference.toFixed(4),
            percentDifference: `${percentDiff}%`,
            isAccurate: parseFloat(percentDiff) < 5,
        },
        soilSuitability: {
            soilType: farm.soilType || "other",
            suitableCrops: soilInfo.suitable,
            unsuitableCrops: soilInfo.unsuitable,
            notes: soilInfo.notes,
        },
    });
});

// ============================================================
// NEARBY FARMS — 2dsphere proximity search
// ============================================================
/**
 * @desc    Find farms near a given location
 * @route   GET /api/farms/nearby?lng=73.85&lat=18.52&radius=5000
 * @access  Private
 *
 * Uses MongoDB's $nearSphere geospatial query on the center
 * point index. Radius is in meters.
 */
const getNearbyFarms = asyncHandler(async (req, res, next) => {
    const { lng, lat, radius } = req.query;

    if (!lng || !lat) {
        return next(new AppError("Longitude and latitude are required", 400));
    }

    const longitude = parseFloat(lng);
    const latitude = parseFloat(lat);
    const maxDistance = parseInt(radius) || 10000; // Default 10km

    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
        return next(new AppError("Invalid coordinates", 400));
    }

    const farms = await Farm.find({
        user: req.user._id,
        center: {
            $nearSphere: {
                $geometry: {
                    type: "Point",
                    coordinates: [longitude, latitude],
                },
                $maxDistance: maxDistance,
            },
        },
        isActive: true,
    })
        .select("name area soilType center address")
        .limit(20);

    sendSuccess(res, 200, `Found ${farms.length} nearby farms`, {
        searchPoint: { longitude, latitude },
        radiusMeters: maxDistance,
        count: farms.length,
        farms,
    });
});

// ============================================================
// SOIL SUITABILITY CHECK — crop compatibility
// ============================================================
/**
 * @desc    Check if a crop is suitable for a farm's soil type
 * @route   GET /api/farms/:id/soil-check?crop=tomato
 * @access  Private (owner only)
 */
const checkSoilSuitability = asyncHandler(async (req, res, next) => {
    const farm = await Farm.findById(req.params.id);

    if (!farm) {
        return next(new AppError("Farm not found", 404));
    }

    verifyOwnership(farm, req.user._id);

    const cropName = req.query.crop;

    if (!cropName) {
        // Return general soil info
        const soilInfo = getCropSuitability(farm.soilType || "other");
        return sendSuccess(res, 200, "Soil suitability retrieved", {
            farm: { id: farm._id, name: farm.name },
            soilType: farm.soilType || "other",
            soilPH: farm.soilPH || null,
            suitableCrops: soilInfo.suitable,
            unsuitableCrops: soilInfo.unsuitable,
            notes: soilInfo.notes,
        });
    }

    // Check specific crop
    const result = checkCropSoilMatch(cropName, farm.soilType || "other");

    sendSuccess(res, 200, "Crop-soil compatibility check complete", {
        farm: { id: farm._id, name: farm.name },
        crop: cropName,
        soilType: farm.soilType || "other",
        compatibility: result.score,
        message: result.message,
    });
});

module.exports = {
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
};
