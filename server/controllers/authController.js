// ============================================================
// 🔐 Auth Controller (STEP 2.1)
// ============================================================
//
// AUTHENTICATION FLOW:
//
//   ┌──────────┐     POST /register     ┌──────────────┐
//   │  Client  │ ──────────────────────► │  Validate    │
//   │  (React) │                         │  (Joi)       │
//   └──────────┘                         └──────┬───────┘
//                                               │
//                                        ┌──────▼───────┐
//                                        │ Check if     │
//                                        │ email exists │
//                                        └──────┬───────┘
//                                               │
//                                        ┌──────▼───────┐
//                                        │ Create User  │
//                                        │ (bcrypt hash │
//                                        │  in pre-save)│
//                                        └──────┬───────┘
//                                               │
//                                        ┌──────▼───────┐
//                                        │ Generate JWT │──► Return token
//                                        └──────────────┘
//
//   ┌──────────┐     POST /login        ┌──────────────┐
//   │  Client  │ ──────────────────────► │  Find user   │
//   └──────────┘                         │  by email    │
//                                        └──────┬───────┘
//                                               │
//                                        ┌──────▼───────┐
//                                        │ Check locked │
//                                        │ status       │
//                                        └──────┬───────┘
//                                               │
//                                        ┌──────▼───────┐
//                                        │ bcrypt.compare│
//                                        │ passwords    │
//                                        └──────┬───────┘
//                                               │
//                            ┌──────────────────┴──────────────────┐
//                            ▼ FAIL                                ▼ SUCCESS
//                   ┌─────────────────┐                  ┌─────────────────┐
//                   │ Increment login │                  │ Reset attempts  │
//                   │ attempts.       │                  │ Generate JWT    │
//                   │ Lock if ≥ 5     │                  │ Set lastLogin   │
//                   └─────────────────┘                  └─────────────────┘
//
// SECURITY BEST PRACTICES:
//   1. Never reveal whether email exists (use same error for both)
//   2. Hash passwords with bcrypt (12 salt rounds)
//   3. Return minimal user data (no password, no internal IDs)
//   4. Lock accounts after 5 failed login attempts
//   5. Track password change timestamps for token invalidation
//   6. Use express-async-handler to catch async errors
//   7. Validate input with Joi BEFORE hitting the database
//   8. Set secure, httpOnly cookies in production
// ============================================================

const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const { AppError } = require("../middleware/errorHandler");
const { sendSuccess, sendError } = require("../utils/apiResponse");
const logger = require("../utils/logger");

// -----------------------------------------------------------
// Helper: Format user response (never expose sensitive fields)
// -----------------------------------------------------------
const formatUserResponse = (user) => ({
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
    avatar: user.avatar || "",
    address: user.address || {},
    location: user.location || null,
    isActive: user.isActive,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    bio: user.bio || "",
    experience: user.experience || 0,
    specializations: user.specializations || [],
    farmingType: user.farmingType || "",
    totalLandArea: user.totalLandArea || { value: 0, unit: "acres" },
    language: user.language || "en",
    bookmarks: user.bookmarks || [],
});

// -----------------------------------------------------------
// Helper: Send token response (used by register & login)
// -----------------------------------------------------------
const sendTokenResponse = (user, statusCode, message, res) => {
    const token = user.generateToken();

    // Cookie options for production
    const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        httpOnly: true,      // Not accessible via JavaScript (XSS protection)
        secure: process.env.NODE_ENV === "production", // HTTPS only in production
        sameSite: "strict",  // CSRF protection
    };

    // Set token as cookie AND return in response body
    // → Cookie for browser clients, body for mobile/API clients
    res.cookie("token", token, cookieOptions);

    sendSuccess(res, statusCode, message, {
        token,
        user: formatUserResponse(user),
    });
};

// ============================================================
// REGISTER
// ============================================================
/**
 * @desc    Register a new user account
 * @route   POST /api/auth/register
 * @access  Public
 *
 * Flow:
 *   1. Joi validates request body (in route middleware)
 *   2. Check if email is already registered
 *   3. Create user (bcrypt hashes password in pre-save hook)
 *   4. Generate JWT and return
 */
const register = asyncHandler(async (req, res, next) => {
    const { name, email, password, phone, role } = req.body;

    // Step 1: Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return next(new AppError("A user with this email already exists", 400));
    }

    // Step 2: Create user
    // Note: password hashing happens automatically in the User model's
    // pre-save hook (see models/User.js line ~168)
    const user = await User.create({
        name,
        email,
        password,
        phone,
        role: role || "farmer", // Default role
    });

    logger.info(`New user registered: ${email} (role: ${user.role})`);

    // Step 3: Generate JWT and respond
    sendTokenResponse(user, 201, "Registration successful", res);
});

// ============================================================
// LOGIN
// ============================================================
/**
 * @desc    Authenticate user and get token
 * @route   POST /api/auth/login
 * @access  Public
 *
 * Flow:
 *   1. Joi validates request body (in route middleware)
 *   2. Find user by email (include password field)
 *   3. Check if account is locked
 *   4. Compare passwords with bcrypt
 *   5. Handle success/failure (reset/increment attempts)
 *   6. Generate JWT and return
 *
 * SECURITY NOTE:
 *   The error message "Invalid email or password" is intentionally
 *   vague. Never tell the attacker whether the email exists or
 *   whether it was the password that was wrong.
 */
const login = asyncHandler(async (req, res, next) => {
    const { email, password } = req.body;

    // Step 1: Find user and explicitly include password field
    const user = await User.findByCredentials(email);

    if (!user) {
        // Intentionally vague message
        return next(new AppError("Invalid email or password", 401));
    }

    // Step 2: Check if account is active
    if (!user.isActive) {
        return next(new AppError("Account has been deactivated. Contact support.", 403));
    }

    // Step 3: Check if account is locked
    if (user.isLocked) {
        const remainingMinutes = Math.ceil(
            (user.lockUntil - Date.now()) / (60 * 1000)
        );
        return next(
            new AppError(
                `Account is temporarily locked due to too many failed login attempts. Try again in ${remainingMinutes} minutes.`,
                423
            )
        );
    }

    // Step 4: Compare passwords
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
        // Increment failed login counter
        await user.handleFailedLogin();

        logger.warn(`Failed login attempt for: ${email} (attempt #${user.loginAttempts})`);

        return next(new AppError("Invalid email or password", 401));
    }

    // Step 5: Successful login — reset attempt counter
    await user.handleSuccessfulLogin();

    logger.info(`User logged in: ${email}`);

    // Step 6: Generate JWT and respond
    sendTokenResponse(user, 200, "Login successful", res);
});

// ============================================================
// GET CURRENT USER PROFILE
// ============================================================
/**
 * @desc    Get currently authenticated user's profile
 * @route   GET /api/auth/me
 * @access  Private (requires valid JWT)
 *
 * How it works:
 *   1. The `protect` middleware (auth.js) verifies the JWT
 *   2. It decodes the token and finds the user in the database
 *   3. Attaches the user to `req.user`
 *   4. This controller simply returns req.user
 */
const getMe = asyncHandler(async (req, res) => {
    // Populate virtual farm count
    const user = await User.findById(req.user._id).populate("farms");

    sendSuccess(res, 200, "Profile retrieved", {
        user: formatUserResponse(user),
    });
});

// ============================================================
// UPDATE PROFILE
// ============================================================
/**
 * @desc    Update current user's profile (non-password fields)
 * @route   PUT /api/auth/profile
 * @access  Private
 */
const updateProfile = asyncHandler(async (req, res, next) => {
    // Whitelist of updatable fields (prevent role escalation!)
    const allowedFields = [
        "name", "phone", "avatar", "address", "location",
        "bio", "experience", "specializations", "farmingType",
        "totalLandArea", "language"
    ];
    const updates = {};

    allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    });

    if (Object.keys(updates).length === 0) {
        return next(new AppError("No valid fields to update", 400));
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $set: updates },
        { new: true, runValidators: true }
    );

    logger.info(`Profile updated for user: ${user.email}`);

    sendSuccess(res, 200, "Profile updated successfully", {
        user: formatUserResponse(user),
    });
});

// ============================================================
// CHANGE PASSWORD
// ============================================================
/**
 * @desc    Change current user's password
 * @route   PUT /api/auth/password
 * @access  Private
 *
 * SECURITY:
 *   Requires the current password to prevent unauthorized
 *   password changes if someone steals the JWT token.
 *   After changing, a new JWT is issued (old tokens become
 *   invalid due to passwordChangedAt tracking).
 */
const changePassword = asyncHandler(async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;

    // Get user with password included
    const user = await User.findById(req.user._id).select("+password");

    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
        return next(new AppError("Current password is incorrect", 401));
    }

    // Set new password (will be hashed in pre-save hook)
    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);

    // Issue new token (old token will be invalidated by passwordChangedAt)
    sendTokenResponse(user, 200, "Password changed successfully", res);
});

// ============================================================
// LOGOUT
// ============================================================
/**
 * @desc    Logout user (clear cookie)
 * @route   POST /api/auth/logout
 * @access  Private
 *
 * NOTE: Since JWTs are stateless, we can't truly "invalidate"
 * a token server-side. We clear the cookie, and the frontend
 * should also delete the token from localStorage/state.
 *
 * For true token invalidation, you'd need a token blacklist
 * stored in Redis (advanced feature for future implementation).
 */
const logout = asyncHandler(async (_req, res) => {
    res.cookie("token", "none", {
        expires: new Date(Date.now() + 5 * 1000), // Expires in 5 seconds
        httpOnly: true,
    });

    sendSuccess(res, 200, "Logged out successfully");
});

// ============================================================
// ADMIN: GET ALL USERS
// ============================================================
/**
 * @desc    Get all users (admin only)
 * @route   GET /api/auth/users
 * @access  Private/Admin
 */
const getAllUsers = asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";

    const [users, total] = await Promise.all([
        User.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select("-password -passwordResetToken -passwordResetExpires"),
        User.countDocuments(filter),
    ]);

    sendSuccess(res, 200, "Users retrieved", {
        users: users.map(formatUserResponse),
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
        },
    });
});

// @desc    Get public farmer profile
// @route   GET /api/auth/profile/:id
// @access  Public
const getPublicProfile = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.params.id).populate("farms");

    if (!user || !user.isActive) {
        return next(new AppError("User not found or inactive", 404));
    }

    sendSuccess(res, 200, "Public profile retrieved", {
        id: user._id,
        name: user.name,
        avatar: user.avatar || "",
        bio: user.bio || "",
        experience: user.experience || 0,
        specializations: user.specializations || [],
        farmingType: user.farmingType || "",
        createdAt: user.createdAt,
        farmsCount: user.farms ? user.farms.length : 0
    });
});

// @desc    Upload profile avatar image
// @route   POST /api/auth/profile/avatar
// @access  Private
const uploadAvatar = asyncHandler(async (req, res, next) => {
    if (!req.file) {
        return next(new AppError("Please upload an image file", 400));
    }

    const avatarUrl = `/uploads/profiles/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
        req.user._id,
        { avatar: avatarUrl },
        { new: true }
    );

    sendSuccess(res, 200, "Avatar uploaded successfully", {
        avatar: user.avatar,
        user: formatUserResponse(user)
    });
});

module.exports = {
    register,
    login,
    getMe,
    updateProfile,
    changePassword,
    logout,
    getAllUsers,
    getPublicProfile,
    uploadAvatar
};
