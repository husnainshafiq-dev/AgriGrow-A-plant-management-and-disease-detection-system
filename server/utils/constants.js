// ============================================================
// 📌 Application-Wide Constants
// ============================================================

module.exports = {
    // User roles
    ROLES: {
        FARMER: "farmer",
        ADMIN: "admin",
    },

    // File upload configuration
    UPLOAD: {
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10 MB
        ALLOWED_MIMETYPES: ["image/jpeg", "image/png", "image/webp"],
        ALLOWED_EXTENSIONS: [".jpg", ".jpeg", ".png", ".webp"],
    },

    // Pagination defaults
    PAGINATION: {
        DEFAULT_PAGE: 1,
        DEFAULT_LIMIT: 10,
        MAX_LIMIT: 100,
    },

    // Disease detection configuration
    PREDICTION: {
        MIN_CONFIDENCE: 50,     // Minimum confidence % for a valid prediction
        HIGH_CONFIDENCE: 85,    // Threshold considered "high confidence"
        WARNING_CONFIDENCE: 65, // Below this triggers a low-confidence warning
    },

    // ML service communication
    ML_SERVICE: {
        TIMEOUT: 60000,             // 60 seconds max for inference
        RETRY_ATTEMPTS: 2,          // Number of retries on failure
        RETRY_DELAY: 1000,          // 1 second between retries
        HEALTH_CHECK_INTERVAL: 30000, // 30 seconds
    },
};
