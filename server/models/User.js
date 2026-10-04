// ============================================================
// 👤 User Model (Collection: users)
// ============================================================
//
// PURPOSE:
//   Central user identity for the entire application.
//   Every farm, crop, disease report, and cost estimation
//   belongs to a user via ObjectId reference.
//
// RELATIONSHIPS:
//   User  ──< (1:N) ──>  Farm
//   User  ──< (1:N) ──>  Crop
//   User  ──< (1:N) ──>  Disease
//   User  ──< (1:N) ──>  CostEstimation
//   User  ──< (1:N) ──>  Advisory
//
// SECURITY:
//   • Password hashed with bcrypt (12 salt rounds) in pre-save
//   • Password field excluded from all queries (select: false)
//   • JWT generation as an instance method
//   • Login attempt tracking for brute-force protection
//
// INDEXES:
//   • email          — unique, speeds up login lookups
//   • role           — filters admin vs farmer queries
//   • createdAt      — default from timestamps, descending sorts
// ============================================================

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const config = require("../config/env");

const userSchema = new mongoose.Schema(
    {
        // ---------------------------------------------------
        // Identity Fields
        // ---------------------------------------------------
        name: {
            type: String,
            required: [true, "Please provide your name"],
            trim: true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [50, "Name cannot exceed 50 characters"],
        },

        email: {
            type: String,
            required: [true, "Please provide your email"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                "Please provide a valid email",
            ],
        },

        password: {
            type: String,
            required: [true, "Please provide a password"],
            minlength: [6, "Password must be at least 6 characters"],
            select: false, // NEVER included in query results
        },

        phone: {
            type: String,
            trim: true,
            match: [/^\+?[1-9]\d{1,14}$/, "Please provide a valid phone number"],
        },

        // ---------------------------------------------------
        // Role-Based Access Control (RBAC)
        // ---------------------------------------------------
        role: {
            type: String,
            enum: {
                values: ["farmer", "editor", "admin", "superadmin"],
                message: "Role must be one of: 'farmer', 'editor', 'admin', 'superadmin'",
            },
            default: "farmer",
        },

        // ---------------------------------------------------
        // Profile Fields
        // ---------------------------------------------------
        avatar: {
            type: String,
            default: "",
        },

        address: {
            street: { type: String, trim: true, default: "" },
            city: { type: String, trim: true, default: "" },
            state: { type: String, trim: true, default: "" },
            country: { type: String, trim: true, default: "" },
            zipCode: { type: String, trim: true, default: "" },
        },

        bio: {
            type: String,
            maxlength: [500, "Bio cannot exceed 500 characters"],
            default: "",
        },

        experience: {
            type: Number,
            min: [0, "Experience cannot be negative"],
            max: [80, "Experience cannot exceed 80 years"],
            default: 0,
        },

        specializations: {
            type: [String],
            default: [],
        },

        farmingType: {
            type: String,
            enum: {
                values: ["organic", "conventional", "mixed", ""],
                message: "Farming type must be organic, conventional, mixed or empty",
            },
            default: "",
        },

        totalLandArea: {
            value: { type: Number, default: 0 },
            unit: { type: String, enum: ["acres", "hectares", "kanal"], default: "acres" },
        },

        language: {
            type: String,
            enum: ["en", "ur", "pa"],
            default: "en",
        },

        bookmarks: [
            {
                type: { type: String, enum: ["article", "advisory", "question"] },
                itemId: { type: mongoose.Schema.Types.ObjectId },
                savedAt: { type: Date, default: Date.now },
            }
        ],

        // Location as a GeoJSON Point (for "nearby farmers" feature)
        location: {
            type: {
                type: String,
                enum: ["Point"],
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
            },
        },

        // ---------------------------------------------------
        // Security & Account Status
        // ---------------------------------------------------
        isActive: {
            type: Boolean,
            default: true,
        },

        lastLogin: {
            type: Date,
        },

        loginAttempts: {
            type: Number,
            default: 0,
        },

        lockUntil: {
            type: Date,
        },

        passwordChangedAt: {
            type: Date,
        },

        passwordResetToken: {
            type: String,
            select: false,
        },

        passwordResetExpires: {
            type: Date,
            select: false,
        },
    },
    {
        timestamps: true,     // createdAt, updatedAt auto-managed
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// INDEXES
// ============================================================
// Compound index for role-based admin queries
userSchema.index({ role: 1, createdAt: -1 });
// Geospatial index for location-based queries
userSchema.index({ location: "2dsphere" });

// ============================================================
// VIRTUALS — computed fields (not stored in DB)
// ============================================================

/**
 * Virtual: count of farms owned by this user.
 * Populated via Farm.find({ user: this._id }).
 */
userSchema.virtual("farms", {
    ref: "Farm",
    localField: "_id",
    foreignField: "user",
    count: true,
});

/**
 * Virtual: check if account is currently locked.
 */
userSchema.virtual("isLocked").get(function () {
    return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ============================================================
// PRE-SAVE HOOKS
// ============================================================

/**
 * Hash password before saving to database.
 * Only runs when the password field has been modified.
 *
 * bcrypt salt rounds = 12 (good balance of security vs speed)
 * - 10 rounds ≈ 10 hashes/sec  (fast but less secure)
 * - 12 rounds ≈ 2-3 hashes/sec (recommended for production)
 * - 14 rounds ≈ 1 hash/sec     (very secure but slow)
 */
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();

    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);

    // Track when password was changed (for token invalidation)
    if (!this.isNew) {
        this.passwordChangedAt = Date.now() - 1000; // subtract 1s to ensure token is issued after
    }

    next();
});

// ============================================================
// INSTANCE METHODS
// ============================================================

/**
 * Compare entered password with the hashed password in DB.
 * Uses bcrypt's constant-time comparison to prevent timing attacks.
 *
 * @param {string} enteredPassword - Plain text password from login form
 * @returns {Promise<boolean>} true if passwords match
 */
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

/**
 * Generate a signed JWT token for authenticated sessions.
 *
 * Payload contains:
 *   - id:   MongoDB ObjectId (to find user on protected routes)
 *   - role: user role (for authorization middleware)
 *
 * @returns {string} Signed JWT token string
 */
userSchema.methods.generateToken = function () {
    return jwt.sign(
        { id: this._id, role: this.role },
        config.JWT_SECRET,
        { expiresIn: config.JWT_EXPIRE }
    );
};

/**
 * Check if password was changed after a JWT was issued.
 * Used by the protect middleware to invalidate old tokens.
 *
 * @param {number} jwtTimestamp - iat (issued-at) from the JWT payload
 * @returns {boolean} true if password was changed after token was issued
 */
userSchema.methods.changedPasswordAfter = function (jwtTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(
            this.passwordChangedAt.getTime() / 1000,
            10
        );
        return jwtTimestamp < changedTimestamp;
    }
    return false;
};

/**
 * Handle failed login attempt.
 * Locks account after 5 consecutive failures for 30 minutes.
 */
userSchema.methods.handleFailedLogin = async function () {
    this.loginAttempts += 1;

    // Lock after 5 failed attempts
    if (this.loginAttempts >= 5) {
        this.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
    }

    await this.save({ validateBeforeSave: false });
};

/**
 * Reset login attempt counter after successful login.
 */
userSchema.methods.handleSuccessfulLogin = async function () {
    this.loginAttempts = 0;
    this.lockUntil = undefined;
    this.lastLogin = Date.now();
    await this.save({ validateBeforeSave: false });
};

// ============================================================
// STATIC METHODS
// ============================================================

/**
 * Find user by email and include password field.
 * Used exclusively in the login flow.
 */
userSchema.statics.findByCredentials = async function (email) {
    return this.findOne({ email }).select("+password");
};

module.exports = mongoose.model("User", userSchema);
