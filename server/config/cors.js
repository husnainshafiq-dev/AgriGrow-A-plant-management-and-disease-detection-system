// ============================================================
// 🔒 CORS Configuration
// ============================================================
// Defines which origins are allowed to make requests to our API.
// In development, we allow localhost. In production, you'd
// restrict this to your actual domain.
// ============================================================

const config = require("./env");

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, curl)
        if (!origin) return callback(null, true);

        if (config.NODE_ENV === "production") {
            const allowedOrigins = [
                "https://yourdomain.com",
                "https://www.yourdomain.com",
            ];
            if (allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            return callback(new Error("Not allowed by CORS"));
        }

        // Development: allow any localhost or 127.0.0.1 with any port
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
        if (isLocalhost) {
            return callback(null, true);
        }
        callback(new Error("Not allowed by CORS"));
    },
    credentials: true, // Allow cookies to be sent
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

module.exports = corsOptions;
