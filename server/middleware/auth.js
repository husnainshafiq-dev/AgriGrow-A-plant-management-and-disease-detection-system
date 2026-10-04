// ============================================================
// 🔐 JWT Authentication & Authorization Middleware (STEP 2.1)
// ============================================================
//
// How JWT Authentication Works (Text Diagram):
//
//   ┌──────────┐                         ┌──────────────┐
//   │  Client  │  Authorization:         │   protect    │
//   │  (React) │  Bearer eyJhbG...  ──►  │  middleware   │
//   └──────────┘                         └──────┬───────┘
//                                               │
//                                        ┌──────▼───────┐
//                                        │ 1. Extract   │
//                                        │    token     │
//                                        │    from      │
//                                        │    header    │
//                                        └──────┬───────┘
//                                               │
//                                        ┌──────▼───────┐
//                                        │ 2. Verify    │
//                                        │    token     │
//                                        │    signature │
//                                        │    & expiry  │
//                                        └──────┬───────┘
//                                               │
//                                        ┌──────▼───────┐
//                                        │ 3. Find user │
//                                        │    by ID     │
//                                        │    from      │
//                                        │    payload   │
//                                        └──────┬───────┘
//                                               │
//                                        ┌──────▼───────┐
//                                        │ 4. Check     │
//                                        │    password  │
//                                        │    changed   │
//                                        │    after JWT │
//                                        └──────┬───────┘
//                                               │
//                                        ┌──────▼───────┐
//                                        │ 5. Attach    │
//                                        │    user to   │
//                                        │    req.user  │──► next()
//                                        └──────────────┘
//
// Usage in Routes:
//   router.get("/profile", protect, getProfile);
//   router.delete("/users/:id", protect, authorize("admin"), deleteUser);
//
// SECURITY CONSIDERATIONS:
//   1. Token is extracted from:
//      - Authorization header: "Bearer <token>"  (preferred)
//      - Cookies: req.cookies.token               (fallback)
//   2. jwt.verify() checks both signature and expiration
//   3. User must still exist in DB (handles deleted accounts)
//   4. Password change check invalidates old tokens
//   5. Account must be active
// ============================================================

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { AppError } = require("./errorHandler");
const config = require("../config/env");

/**
 * Protect — require a valid JWT.
 *
 * This middleware:
 *   1. Extracts the JWT from the Authorization header or cookies
 *   2. Verifies the token's signature and expiration
 *   3. Finds the user in the database
 *   4. Checks if the user changed their password after the token was issued
 *   5. Attaches the user object to req.user for downstream use
 */
const protect = async (req, _res, next) => {
    try {
        let token;

        // ---------------------------------------------------
        // 1. Extract token from header or cookie
        // ---------------------------------------------------
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ) {
            // Primary: Authorization header
            token = req.headers.authorization.split(" ")[1];
        } else if (req.cookies?.token && req.cookies.token !== "none") {
            // Fallback: Cookie (set during login)
            token = req.cookies.token;
        }

        if (!token) {
            return next(new AppError("Not authorized — no token provided", 401));
        }

        // ---------------------------------------------------
        // 2. Verify token (signature + expiration)
        // ---------------------------------------------------
        const decoded = jwt.verify(token, config.JWT_SECRET);

        // ---------------------------------------------------
        // 3. Find user (exclude password from result)
        // ---------------------------------------------------
        const user = await User.findById(decoded.id).select("-password");

        if (!user) {
            return next(
                new AppError("The user belonging to this token no longer exists", 401)
            );
        }

        // ---------------------------------------------------
        // 4. Check if account is active
        // ---------------------------------------------------
        if (!user.isActive) {
            return next(
                new AppError("This account has been deactivated", 401)
            );
        }

        // ---------------------------------------------------
        // 5. Check if password was changed after token was issued
        // ---------------------------------------------------
        // This is a critical security feature:
        //   If a user changes their password (e.g., because they
        //   suspect their account was compromised), ALL previously
        //   issued tokens should become invalid.
        // ---------------------------------------------------
        if (user.changedPasswordAfter(decoded.iat)) {
            return next(
                new AppError(
                    "Password was recently changed. Please log in again.",
                    401
                )
            );
        }

        // ---------------------------------------------------
        // 6. GRANT ACCESS — attach user to request
        // ---------------------------------------------------
        req.user = user;
        next();
    } catch (error) {
        console.error("❌ JWT auth middleware error:", error);
        // jwt.verify throws specific error types:
        //   - JsonWebTokenError: invalid signature
        //   - TokenExpiredError: token has expired
        //   - NotBeforeError:     token not yet active
        // The global error handler normalizes these (see errorHandler.js)
        return next(new AppError("Not authorized — token invalid or expired", 401));
    }
};

/**
 * Authorize — restrict access to specific roles.
 *
 * MUST be used AFTER protect() middleware (it needs req.user).
 *
 * @param  {...string} roles  Allowed roles (e.g., "admin", "farmer")
 * @returns {Function} Express middleware
 *
 * Example:
 *   router.delete("/users/:id", protect, authorize("admin"), deleteUser);
 *   // Only users with role "admin" can access this route
 */
const authorize = (...roles) => {
    return (req, _res, next) => {
        if (!req.user) {
            return next(
                new AppError("Authentication required before authorization", 500)
            );
        }

        // Superadmin controls everything and bypasses specific role restrictions
        if (req.user.role === "superadmin" || roles.includes(req.user.role)) {
            return next();
        }

        return next(
            new AppError(
                `Role '${req.user.role}' is not authorized to access this route. ` +
                `Required roles: ${roles.join(", ")}`,
                403
            )
        );
    };
};

/**
 * Optional authentication for public routes that can do more when a user
 * is logged in. Invalid or missing tokens are ignored instead of rejected.
 */
const optionalAuth = async (req, _res, next) => {
    try {
        let token;

        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith("Bearer")
        ) {
            token = req.headers.authorization.split(" ")[1];
        } else if (req.cookies?.token && req.cookies.token !== "none") {
            token = req.cookies.token;
        } else if (req.cookies?.jwt && req.cookies.jwt !== "none") {
            token = req.cookies.jwt;
        }

        if (!token) {
            req.user = null;
            return next();
        }

        const decoded = jwt.verify(token, config.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");

        if (!user || !user.isActive || user.changedPasswordAfter(decoded.iat)) {
            req.user = null;
            return next();
        }

        req.user = user;
        next();
    } catch {
        req.user = null;
        next();
    }
};

module.exports = { protect, authorize, optionalAuth };
