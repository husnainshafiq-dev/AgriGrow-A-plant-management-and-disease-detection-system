// ============================================================
// 💰 Cost Estimation Routes (STEP 6.1)
// ============================================================
//
// ROUTE TABLE:
// ┌────────┬─────────────────────────────┬──────────┬──────────────────────┐
// │ Method │ Path                        │ Auth     │ Handler              │
// ├────────┼─────────────────────────────┼──────────┼──────────────────────┤
// │ GET    │ /api/cost/crops             │ Public   │ supportedCrops       │
// │ GET    │ /api/cost/crops/soil/:type  │ Public   │ cropsForSoil         │
// │ GET    │ /api/cost/crops/season/:name│ Public   │ cropsForSeason       │
// │ POST   │ /api/cost/estimate          │ Private  │ estimate (quick)     │
// │ POST   │ /api/cost/estimate/detailed │ Private  │ estimateDetailed     │
// │ POST   │ /api/cost/estimate/farm/:id │ Private  │ estimateForFarm      │
// │ POST   │ /api/cost/estimate/ai       │ Private  │ estimateWithAI       │
// │ POST   │ /api/cost/compare           │ Private  │ compare              │
// │ GET    │ /api/cost/history           │ Private  │ getHistory           │
// │ GET    │ /api/cost/history/:id       │ Private  │ getEstimation        │
// │ DELETE │ /api/cost/history/:id       │ Private  │ deleteEstimation     │
// │ PUT    │ /api/cost/crop/:id          │ Private  │ saveCropCosts        │
// └────────┴─────────────────────────────┴──────────┴──────────────────────┘
// ============================================================

const express = require("express");
const router = express.Router();
const {
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
} = require("../controllers/costController");
const { protect } = require("../middleware/auth");

// ── Public routes ─────────────────────────────
router.get("/crops", supportedCrops);
router.get("/crops/soil/:type", cropsForSoil);
router.get("/crops/season/:name", cropsForSeason);

// ── Protected: Estimation ─────────────────────
router.post("/estimate", protect, estimate);
router.post("/estimate/detailed", protect, estimateDetailed);
router.post("/estimate/farm/:id", protect, estimateForFarm);
router.post("/estimate/ai", protect, estimateWithAI);
router.post("/compare", protect, compare);

// ── Protected: History ────────────────────────
router.get("/history", protect, getHistory);
router.get("/history/:id", protect, getEstimation);
router.delete("/history/:id", protect, deleteEstimation);

// ── Protected: Crop cost update ───────────────
router.put("/crop/:id", protect, saveCropCosts);

module.exports = router;
