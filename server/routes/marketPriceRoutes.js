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

// --- Authenticated write endpoints ---
router.post("/prices", protect, submitPrice);
router.patch("/prices/:id/verify", protect, authorize("admin"), verifyPrice);

// --- Admin-only endpoints (failsafe + ops) ---
router.post("/prices/manual", protect, authorize("admin"), manualPriceEntry);
router.post("/scrape-now", protect, authorize("admin"), triggerScrape);
router.get("/cron-status", protect, authorize("admin"), getCronStatus);

module.exports = router;
