// ============================================================
// ✅ Auth Validation Schemas (Joi)
// ============================================================
// Validates user input BEFORE it reaches the controller.
//
// WHY JOI instead of Mongoose validation alone?
//   • Joi runs BEFORE the database operation, saving resources
//   • Provides more expressive validation rules
//   • Better error messages for the frontend
//   • Strips unknown fields (security against mass assignment)
//
// VALIDATION LAYERS (Defense in Depth):
//   1. Frontend: basic HTML5 validation (UX only, never trust)
//   2. Joi:      structural & format validation (this file)
//   3. Mongoose: schema-level data integrity (models)
//   4. MongoDB:  unique indexes & constraints (database)
// ============================================================

const Joi = require("joi");

/**
 * PASSWORD RULES:
 *   • Minimum 6 characters
 *   • Maximum 128 characters
 *   • Must contain at least:
 *     - One uppercase letter
 *     - One lowercase letter
 *     - One digit
 *
 * WHY THESE RULES?
 *   NIST guidelines recommend minimum 8 characters with no complexity
 *   requirements, but for a university project we demonstrate
 *   pattern-based validation. In production, you'd also check
 *   against breached password databases (e.g., HaveIBeenPwned).
 */
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

// -----------------------------------------------------------
// REGISTER
// -----------------------------------------------------------
const registerSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .required()
        .messages({
            "string.min": "Name must be at least 2 characters",
            "string.max": "Name cannot exceed 50 characters",
            "any.required": "Name is required",
        }),

    email: Joi.string()
        .trim()
        .lowercase()
        .email()
        .required()
        .messages({
            "string.email": "Please provide a valid email address",
            "any.required": "Email is required",
        }),

    password: Joi.string()
        .min(6)
        .max(128)
        .pattern(passwordPattern)
        .required()
        .messages({
            "string.min": "Password must be at least 6 characters",
            "string.max": "Password cannot exceed 128 characters",
            "string.pattern.base":
                "Password must contain at least one uppercase letter, one lowercase letter, and one digit",
            "any.required": "Password is required",
        }),

    confirmPassword: Joi.string()
        .valid(Joi.ref("password"))
        .required()
        .messages({
            "any.only": "Passwords do not match",
            "any.required": "Password confirmation is required",
        }),

    phone: Joi.string()
        .pattern(/^\+?[1-9]\d{1,14}$/)
        .optional()
        .allow("")
        .messages({
            "string.pattern.base": "Please provide a valid phone number (E.164 format)",
        }),

    role: Joi.string()
        .valid("farmer", "admin")
        .default("farmer")
        .messages({
            "any.only": "Role must be either 'farmer' or 'admin'",
        }),
});

// -----------------------------------------------------------
// LOGIN
// -----------------------------------------------------------
const loginSchema = Joi.object({
    email: Joi.string()
        .trim()
        .lowercase()
        .email()
        .required()
        .messages({
            "string.email": "Please provide a valid email address",
            "any.required": "Email is required",
        }),

    password: Joi.string()
        .required()
        .messages({
            "any.required": "Password is required",
        }),
});

// -----------------------------------------------------------
// UPDATE PROFILE
// -----------------------------------------------------------
const updateProfileSchema = Joi.object({
    name: Joi.string()
        .trim()
        .min(2)
        .max(50)
        .optional()
        .messages({
            "string.min": "Name must be at least 2 characters",
            "string.max": "Name cannot exceed 50 characters",
        }),

    phone: Joi.string()
        .pattern(/^\+?[1-9]\d{1,14}$/)
        .optional()
        .allow("")
        .messages({
            "string.pattern.base": "Please provide a valid phone number",
        }),

    avatar: Joi.string()
        .uri()
        .optional()
        .allow(""),

    address: Joi.object({
        street: Joi.string().trim().max(200).optional().allow(""),
        city: Joi.string().trim().max(100).optional().allow(""),
        state: Joi.string().trim().max(100).optional().allow(""),
        country: Joi.string().trim().max(100).optional().allow(""),
        zipCode: Joi.string().trim().max(20).optional().allow(""),
    }).optional(),

    location: Joi.object({
        type: Joi.string().valid("Point").default("Point"),
        coordinates: Joi.array()
            .items(Joi.number())
            .length(2)
            .required()
            .messages({
                "array.length": "Coordinates must be [longitude, latitude]",
            }),
    }).optional(),
}).min(1).messages({
    "object.min": "Please provide at least one field to update",
});

// -----------------------------------------------------------
// CHANGE PASSWORD
// -----------------------------------------------------------
const changePasswordSchema = Joi.object({
    currentPassword: Joi.string()
        .required()
        .messages({
            "any.required": "Current password is required",
        }),

    newPassword: Joi.string()
        .min(6)
        .max(128)
        .pattern(passwordPattern)
        .required()
        .disallow(Joi.ref("currentPassword"))
        .messages({
            "string.min": "New password must be at least 6 characters",
            "string.pattern.base":
                "New password must contain at least one uppercase letter, one lowercase letter, and one digit",
            "any.required": "New password is required",
            "any.invalid": "New password must be different from current password",
        }),

    confirmNewPassword: Joi.string()
        .valid(Joi.ref("newPassword"))
        .required()
        .messages({
            "any.only": "Passwords do not match",
            "any.required": "Password confirmation is required",
        }),
});

module.exports = {
    registerSchema,
    loginSchema,
    updateProfileSchema,
    changePasswordSchema,
};
