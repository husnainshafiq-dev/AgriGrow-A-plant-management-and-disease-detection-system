// ============================================================
// 🚨 Global Error Handling Middleware
// ============================================================
// This is the LAST middleware in the Express pipeline.
// Any error thrown in a route handler or middleware lands here.
//
// Why centralized error handling?
// - Consistent error response format across the entire API
// - Single place to log errors
// - Prevents sensitive info (stack traces) leaking in production
// ============================================================

const logger = require("../utils/logger");

/**
 * Custom error class with HTTP status code support.
 * Throw this anywhere in your code:
 *
 *   throw new AppError("User not found", 404);
 */
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true; // Flag to distinguish from programming bugs
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Express error-handling middleware.
 * Must have FOUR parameters (err, req, res, next).
 */
const errorHandler = (err, req, res, _next) => {
    // Default to 500 if no status code is set
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    // ---------------------------------------------------
    // Handle specific Mongoose errors
    // ---------------------------------------------------

    // Bad ObjectId (CastError)
    if (err.name === "CastError") {
        statusCode = 400;
        message = `Invalid ${err.path}: ${err.value}`;
    }

    // Duplicate key error (code 11000)
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        statusCode = 400;
        message = `Duplicate value for field '${field}'. Please use another value.`;
    }

    // Validation error
    if (err.name === "ValidationError") {
        statusCode = 400;
        const messages = Object.values(err.errors).map((e) => e.message);
        message = messages.join(". ");
    }

    // JWT errors
    if (err.name === "JsonWebTokenError") {
        statusCode = 401;
        message = "Invalid token. Please log in again.";
    }

    if (err.name === "TokenExpiredError") {
        statusCode = 401;
        message = "Token expired. Please log in again.";
    }

    // ---------------------------------------------------
    // Log the error
    // ---------------------------------------------------
    logger.error(`${statusCode} - ${message} - ${req.originalUrl} - ${req.method}`, {
        stack: err.stack,
        body: req.body,
    });

    // ---------------------------------------------------
    // Send response
    // ---------------------------------------------------
    res.status(statusCode).json({
        success: false,
        error: message,
        // Only include stack trace in development
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
    });
};

module.exports = { AppError, errorHandler };
