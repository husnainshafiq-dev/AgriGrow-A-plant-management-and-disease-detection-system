// ============================================================
// 📦 Standardized API Response Helper
// ============================================================
// Every API response from this server follows the same shape.
// This makes it easy for the frontend to parse responses
// consistently, and simplifies error handling.
//
// Success: { success: true, data: { ... }, message: "..." }
// Error:   { success: false, error: "...", statusCode: 400 }
// ============================================================

/**
 * Send a success response.
 *
 * @param {Object}  res         Express response object
 * @param {number}  statusCode  HTTP status code (default: 200)
 * @param {string}  message     Human-readable message
 * @param {Object}  data        Response payload
 */
const sendSuccess = (res, statusCode = 200, message = "Success", data = {}) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
};

/**
 * Send an error response.
 *
 * @param {Object}  res         Express response object
 * @param {number}  statusCode  HTTP status code (default: 500)
 * @param {string}  message     Human-readable error message
 */
const sendError = (res, statusCode = 500, message = "Internal Server Error") => {
    return res.status(statusCode).json({
        success: false,
        error: message,
        statusCode,
    });
};

module.exports = { sendSuccess, sendError };
