const express = require("express");
const { getPrices, getLatestPrices, getCropPriceHistory, getTrends, submitPrice, getTrackedCrops, getMandis, verifyPrice } = require("../controllers/marketPriceController");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/prices", getPrices);
router.get("/prices/latest", getLatestPrices);
router.get("/prices/crop/:cropName", getCropPriceHistory);
router.get("/prices/trends", getTrends);
router.get("/crops", getTrackedCrops);
router.get("/mandis", getMandis);

// Authenticated/Write routes
router.post("/prices", protect, submitPrice);
router.patch("/prices/:id/verify", protect, authorize("admin"), verifyPrice);

module.exports = router;
