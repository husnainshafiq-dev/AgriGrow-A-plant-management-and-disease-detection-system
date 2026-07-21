// ============================================================
// 🗺️ Dashboard Routes — Precision Agriculture API
// ============================================================
//
// Endpoints:
//   POST   /api/dashboard/fields      — Save a drawn field polygon
//   GET    /api/dashboard/fields      — List user's saved fields
//   GET    /api/dashboard/fields/:id  — Get single field details
//   DELETE /api/dashboard/fields/:id  — Delete a field
//   GET    /api/dashboard/weather     — Fetch weather for coords
//   POST   /api/dashboard/analyze     — AI crop & disease analysis
//   POST   /api/dashboard/scan        — Upload image for disease scan
//
// AUTH:
//   All routes use optionalAuth — works for both authenticated
//   and unauthenticated users (demo-friendly). For production,
//   switch to the protect middleware.
//
// ============================================================

const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const {
    saveField,
    getFields,
    getField,
    deleteField,
    getWeather,
    analyzeCrops,
    analyzeDiseases,
    analyzeTips,
    scanDisease,
} = require("../controllers/dashboardController");

const { uploadDisease, validateUploadedFile } = require("../middleware/upload");

// -----------------------------------------------------------
// Optional Auth Middleware
// -----------------------------------------------------------
// Attempts to authenticate but doesn't block if no token.
// This allows the dashboard to work in demo mode without login.
// -----------------------------------------------------------
const optionalAuth = (req, _res, next) => {
    try {
        const jwt = require("jsonwebtoken");
        const config = require("../config/env");

        let token = null;

        // Check Authorization header
        if (req.headers.authorization?.startsWith("Bearer")) {
            token = req.headers.authorization.split(" ")[1];
        }
        // Check cookies
        else if (req.cookies?.token) {
            token = req.cookies.token;
        }
        else if (req.cookies?.jwt) {
            token = req.cookies.jwt;
        }

        if (token) {
            const decoded = jwt.verify(token, config.JWT_SECRET);
            req.user = { _id: decoded.id || decoded._id, id: decoded.id || decoded._id };
        } else {
            // Demo user — allows the dashboard to work without auth
            req.user = { _id: "000000000000000000000000", id: "000000000000000000000000" };
        }
    } catch {
        req.user = { _id: "000000000000000000000000", id: "000000000000000000000000" };
    }

    next();
};

// -----------------------------------------------------------
// Rate Limiting — AI analysis endpoint
// -----------------------------------------------------------
const analysisLimiter = rateLimit({
    windowMs: 2 * 60 * 1000, // 2 minutes
    max: 5,
    message: {
        success: false,
        error: "Too many AI analysis requests. Please wait before trying again.",
    },
});

// -----------------------------------------------------------
// Routes
// -----------------------------------------------------------

// Field CRUD
router.post("/fields", optionalAuth, saveField);
router.get("/fields", optionalAuth, getFields);
router.get("/fields/:id", optionalAuth, getField);
router.delete("/fields/:id", optionalAuth, deleteField);

// Weather lookup
router.get("/weather", getWeather);

// AI Analysis (rate-limited — expensive Gemini calls)
router.post("/analyze/crops", optionalAuth, analysisLimiter, analyzeCrops);
router.post("/analyze/diseases", optionalAuth, analysisLimiter, analyzeDiseases);
router.post("/analyze/tips", optionalAuth, analysisLimiter, analyzeTips);

// Disease scan with image upload
router.post(
    "/scan",
    optionalAuth,
    uploadDisease.single("image"),
    validateUploadedFile,
    scanDisease
);

module.exports = router;
