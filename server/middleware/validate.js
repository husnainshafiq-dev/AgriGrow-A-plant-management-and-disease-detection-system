// ============================================================
// ✅ Request Validation Middleware (Joi)
// ============================================================
// Uses Joi schemas to validate request body, params, or query.
//
// Usage:
//   const { validateBody } = require("../middleware/validate");
//   const { registerSchema } = require("../validators/authSchemas");
//   router.post("/register", validateBody(registerSchema), register);
// ============================================================

const { AppError } = require("./errorHandler");

/**
 * Validate request body against a Joi schema.
 * @param {Object} schema - Joi schema object
 */
const validateBody = (schema) => {
    return (req, _res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false,    // Report ALL errors, not just the first
            stripUnknown: true,   // Remove fields not in the schema
        });

        if (error) {
            const messages = error.details.map((detail) => detail.message).join(". ");
            return next(new AppError(messages, 400));
        }

        // Replace body with validated & sanitized values
        req.body = value;
        next();
    };
};

/**
 * Validate request query parameters against a Joi schema.
 * @param {Object} schema - Joi schema object
 */
const validateQuery = (schema) => {
    return (req, _res, next) => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const messages = error.details.map((detail) => detail.message).join(". ");
            return next(new AppError(messages, 400));
        }

        req.query = value;
        next();
    };
};

/**
 * Validate request params against a Joi schema.
 * @param {Object} schema - Joi schema object
 */
const validateParams = (schema) => {
    return (req, _res, next) => {
        const { error, value } = schema.validate(req.params, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const messages = error.details.map((detail) => detail.message).join(". ");
            return next(new AppError(messages, 400));
        }

        req.params = value;
        next();
    };
};

module.exports = { validateBody, validateQuery, validateParams };
