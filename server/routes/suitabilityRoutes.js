// ============================================================
// 🌱 Crop Suitability Routes (STEP 6.2)
// ============================================================
//
// ROUTE TABLE:
// ┌────────┬──────────────────────────────────┬──────────┬────────────────┐
// │ Method │ Path                             │ Auth     │ Handler        │
// ├────────┼──────────────────────────────────┼──────────┼────────────────┤
// │ POST   │ /api/suitability/check           │ Private  │ checkSuitability│
// │ POST   │ /api/suitability/rank            │ Private  │ rankCrops      │
// │ POST   │ /api/suitability/alternatives    │ Private  │ getAlternatives│
// │ POST   │ /api/suitability/rotation        │ Private  │ getRotationPlan│
// │ POST   │ /api/suitability/farm/:id        │ Private  │ analyzeForFarm │
// │ POST   │ /api/suitability/farm/:id/ai     │ Private  │ analyzeWithAI  │
// └────────┴──────────────────────────────────┴──────────┴────────────────┘
// ============================================================

const express = require("express");
const router = express.Router();
const {
    checkSuitability,
    rankCrops,
    getAlternatives,
    getRotationPlan,
    analyzeForFarm,
    analyzeWithAI,
} = require("../controllers/suitabilityController");
const { protect } = require("../middleware/auth");

// All suitability routes require authentication
router.use(protect);

// ── Analysis endpoints ────────────────────────
router.post("/check", checkSuitability);
router.post("/rank", rankCrops);
router.post("/alternatives", getAlternatives);
router.post("/rotation", getRotationPlan);

// ── Farm-linked endpoints ─────────────────────
router.post("/farm/:id", analyzeForFarm);
router.post("/farm/:id/ai", analyzeWithAI);

module.exports = router;
