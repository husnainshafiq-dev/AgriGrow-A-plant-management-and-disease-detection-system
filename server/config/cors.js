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
        // Allow requests with no origin (mobile apps, Postman, curl, health checks)
        if (!origin) return callback(null, true);

        // Normalize origin
        const cleanOrigin = origin.replace(/\/$/, "");

        // Allowed origins from environment variable (comma-separated or single)
        const envOrigins = (process.env.CLIENT_URL || process.env.CORS_ORIGIN || "")
            .split(",")
            .map((url) => url.trim().replace(/\/$/, ""))
            .filter(Boolean);

        // Allow any localhost / 127.0.0.1 in non-production, or if explicitly configured
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin);
        if (config.NODE_ENV !== "production" && isLocalhost) {
            return callback(null, true);
        }

        // Allow any Vercel deployment (e.g. https://your-project.vercel.app or preview URLs)
        const isVercel = /^https:\/\/[a-z0-9-]+(\.vercel\.app)$/i.test(cleanOrigin);
        if (isVercel) {
            return callback(null, true);
        }

        // Check if origin matches any explicitly allowed domain
        if (envOrigins.includes(cleanOrigin) || isLocalhost) {
            return callback(null, true);
        }

        callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true, // Allow cookies / Authorization headers
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
};

module.exports = corsOptions;
