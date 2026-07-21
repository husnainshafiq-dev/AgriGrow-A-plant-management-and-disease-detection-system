// ============================================================
// 🔐 Auth Routes (STEP 2.1)
// ============================================================
//
// ROUTE TABLE:
//   Method  Path                  Access       Description
//   ──────  ────────────────────  ───────────  ────────────────────────
//   POST    /api/auth/register    Public       Create new account
//   POST    /api/auth/login       Public       Authenticate & get token
//   GET     /api/auth/me          Private      Get current user profile
//   PUT     /api/auth/profile     Private      Update profile
//   PUT     /api/auth/password    Private      Change password
//   POST    /api/auth/logout      Private      Clear auth cookie
//   GET     /api/auth/users       Admin Only   List all users
//
// MIDDLEWARE CHAIN EXAMPLE (for /register):
//   Request → rateLimit → validateBody(registerSchema) → register()
//             ────────     ───────────────────────────     ──────────
//             security     input validation               controller
// ============================================================

const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

// Controllers
// Controllers
const {
    register,
    login,
    getMe,
    updateProfile,
    changePassword,
    logout,
    getAllUsers,
    getPublicProfile,
    uploadAvatar,
} = require("../controllers/authController");

// Middleware
const { protect, authorize } = require("../middleware/auth");
const { validateBody } = require("../middleware/validate");
const { uploadProfile } = require("../middleware/upload");

// Validation Schemas
const {
    registerSchema,
    loginSchema,
    updateProfileSchema,
    changePasswordSchema,
} = require("../validators/authSchemas");

// -----------------------------------------------------------
// Rate Limiter for Auth Routes
// -----------------------------------------------------------
// More aggressive than the global limiter because auth routes
// are prime targets for brute-force attacks.
// -----------------------------------------------------------
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                   // 10 attempts per window
    message: {
        success: false,
        error: "Too many authentication attempts. Please try again after 15 minutes.",
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for successful requests in development
    skipSuccessfulRequests: process.env.NODE_ENV === "development",
});

// ============================================================
// PUBLIC ROUTES (no token required)
// ============================================================

/**
 * @route   GET /api/auth/profile/:id
 * @desc    Get public profile of a farmer
 * @access  Public
 */
router.get("/profile/:id", getPublicProfile);

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user account
 * @access  Public
 *
 * Middleware chain:
 *   1. authLimiter      → rate limit (10 req / 15 min)
 *   2. validateBody     → Joi validates name, email, password, confirmPassword
 *   3. register         → controller creates user, returns JWT
 */
router.post(
    "/register",
    authLimiter,
    validateBody(registerSchema),
    register
);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and get JWT token
 * @access  Public
 *
 * Middleware chain:
 *   1. authLimiter      → rate limit
 *   2. validateBody     → Joi validates email, password
 *   3. login            → controller verifies credentials, returns JWT
 */
router.post(
    "/login",
    authLimiter,
    validateBody(loginSchema),
    login
);

// ============================================================
// PROTECTED ROUTES (valid JWT required)
// ============================================================

/**
 * @route   POST /api/auth/profile/avatar
 * @desc    Upload avatar picture
 * @access  Private
 */
router.post(
    "/profile/avatar",
    protect,
    uploadProfile.single("avatar"),
    uploadAvatar
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user's profile
 * @access  Private (any authenticated user)
 */
router.get("/me", protect, getMe);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update current user's profile (name, phone, address, etc.)
 * @access  Private
 *
 * NOTE: Cannot update email, password, or role through this route.
 *       - Email change requires verification (future feature)
 *       - Password change uses /password route below
 *       - Role can only be changed by admin
 */
router.put(
    "/profile",
    protect,
    validateBody(updateProfileSchema),
    updateProfile
);

/**
 * @route   PUT /api/auth/password
 * @desc    Change current user's password
 * @access  Private
 *
 * Requires current password for verification.
 * Issues a new JWT after password change.
 */
router.put(
    "/password",
    protect,
    validateBody(changePasswordSchema),
    changePassword
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout (clear auth cookie)
 * @access  Private
 */
router.post("/logout", protect, logout);

// ============================================================
// ADMIN ROUTES (admin role required)
// ============================================================

/**
 * @route   GET /api/auth/users
 * @desc    Get all users (with pagination and filtering)
 * @access  Private/Admin
 * @query   ?page=1&limit=10&role=farmer&isActive=true
 */
router.get(
    "/users",
    protect,
    authorize("admin"),
    getAllUsers
);

module.exports = router;
