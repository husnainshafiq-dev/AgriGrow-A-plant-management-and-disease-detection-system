const express = require("express");
const {
    getPrices,
    getLatestPrices,
    getCropPriceHistory,
    getTrends,
    submitPrice,
    getCropsList,
    getMandis,
    manualPriceEntry,
    triggerScrape,
    getCronStatus,
    verifyPrice,
    approvePrice,
    rejectPrice,
    getModerationQueue,
    deletePrice,
    getMyReportedPrices,
} = require("../controllers/marketPriceController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// --- Public read endpoints ---
router.get("/prices", getPrices);
router.get("/prices/latest", getLatestPrices);
router.get("/prices/crop/:cropName", getCropPriceHistory);
router.get("/prices/trends", getTrends);
router.get("/crops", getCropsList);
router.get("/mandis", getMandis);

// --- Authenticated user endpoints ---
router.get("/my-prices", protect, getMyReportedPrices);
router.post("/prices", protect, submitPrice);

// --- Moderation & management endpoints (Editor, Admin, Superadmin) ---
router.get("/moderation-queue", protect, authorize("admin", "editor"), getModerationQueue);
router.delete("/prices/:id", protect, authorize("admin"), deletePrice);
router.patch("/prices/:id/approve", protect, authorize("admin", "editor"), approvePrice);
router.patch("/prices/:id/reject", protect, authorize("admin", "editor"), rejectPrice);
router.patch("/prices/:id/verify", protect, authorize("admin", "editor"), approvePrice);

// --- Admin-only operational endpoints ---
router.post("/prices/manual", protect, authorize("admin"), manualPriceEntry);
router.post("/scrape-now", protect, triggerScrape);
router.get("/cron-status", protect, authorize("admin"), getCronStatus);

module.exports = router;
