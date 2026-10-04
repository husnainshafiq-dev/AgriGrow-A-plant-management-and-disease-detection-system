// ============================================================
// 🚀 AgriGrow — Express Server Entry Point
// ============================================================
//
// This is the main entry point for the backend API server.
// It follows a specific initialization order:
//
// 1. Load & validate environment variables
// 2. Import dependencies
// 3. Connect to MongoDB
// 4. Configure Express middleware (security → parsing → logging)
// 5. Mount API routes
// 6. Error handling (404 + global error handler)
// 7. Serve React client in production
// 8. Start listening
//
// This order matters! For example, security headers must be
// set before routes, and error handling must come after routes.
// ============================================================

// 1. Environment — MUST be loaded first
const config = require("./config/env");

// 2. Dependencies
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");

// Internal modules
const connectDB = require("./config/db");
const corsOptions = require("./config/cors");
const logger = require("./utils/logger");
const { AppError, errorHandler } = require("./middleware/errorHandler");

// Route imports
const authRoutes = require("./routes/authRoutes");
const diseaseRoutes = require("./routes/diseaseRoutes");
const advisoryRoutes = require("./routes/advisoryRoutes");
const farmRoutes = require("./routes/farmRoutes");
const costRoutes = require("./routes/costRoutes");
const suitabilityRoutes = require("./routes/suitabilityRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const blogRoutes = require("./routes/blogRoutes");
const forumRoutes = require("./routes/forumRoutes");
const adminRoutes = require("./routes/adminRoutes");
const weatherAlertRoutes = require("./routes/weatherAlertRoutes");
const calendarRoutes = require("./routes/calendarRoutes");
const marketPriceRoutes = require("./routes/marketPriceRoutes");
const questionRoutes = require("./routes/questionRoutes");
const bookmarkRoutes = require("./routes/bookmarkRoutes");

// ============================================================
// Initialize Express App
// ============================================================
const app = express();

// ============================================================
// 4. Middleware — Applied in Security → Parsing → Logging order
// ============================================================

// --- Security Middleware ---

// Helmet: sets various HTTP headers for security
// (X-Content-Type-Options, X-Frame-Options, CSP, etc.)
app.use(helmet());

// CORS: control which origins can access the API
app.use(cors(corsOptions));

// Rate Limiting: prevent brute-force & DDoS attacks
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: config.NODE_ENV === "development" ? 10000 : 1000, // high limit in dev mode
    message: {
        success: false,
        error: "Too many requests from this IP, please try again after 15 minutes",
    },
    standardHeaders: true,     // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,      // Disable the `X-RateLimit-*` headers
});
app.use("/api", limiter);

// Sanitize data: prevent NoSQL injection attacks
// Strips any keys starting with $ or containing .
app.use(mongoSanitize());

// HPP: prevent HTTP parameter pollution
app.use(hpp());

// --- Body Parsing ---

// Parse JSON bodies
app.use(express.json({ limit: "250kb" }));

// Parse URL-encoded bodies (for form submissions)
app.use(express.urlencoded({ extended: true, limit: "250kb" }));

// Parse cookies (for JWT cookie support)
app.use(cookieParser());

// --- Logging ---

// Morgan: HTTP request logging
if (config.NODE_ENV === "development") {
    app.use(morgan("dev")); // Colorized concise output
} else {
    // In production, log in combined format to Winston
    app.use(
        morgan("combined", {
            stream: { write: (msg) => logger.info(msg.trim()) },
        })
    );
}

// ============================================================
// 5. Static File Serving — Uploaded Images
// ============================================================
// Serves files from server/uploads/ at /uploads/ URL path.
// Example: /uploads/disease/1707840000-abc123.jpg
// ============================================================
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ============================================================
// 6. Mount API Routes
// ============================================================

app.use("/api/auth", authRoutes);
app.use("/api/disease", diseaseRoutes);
app.use("/api/advisory", advisoryRoutes);
app.use("/api/farms", farmRoutes);
app.use("/api/cost", costRoutes);
app.use("/api/suitability", suitabilityRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/blog", blogRoutes);
app.use("/api/forum", forumRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/weather", weatherAlertRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/market", marketPriceRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/bookmarks", bookmarkRoutes);

// Root & Health check endpoints (no auth required)
app.get("/", (_req, res) => {
    res.json({
        name: "AgriGrow API",
        status: "online",
        environment: config.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
});
app.get("/health", (_req, res) => res.status(200).send("OK"));

// Health check endpoint (no auth required)
// Checks both backend and ML service status
const { checkHealth } = require("./services/mlService");
app.get("/api/health", async (_req, res) => {
    try {
        const mlHealth = await checkHealth();
        const isReady = (mlHealth.status === "available" || mlHealth.status === "healthy") && mlHealth.model_loaded === true;

        res.json({
            success: true,
            status: isReady ? "ready" : "loading",
            environment: config.NODE_ENV,
            timestamp: new Date().toISOString(),
            ml_service: mlHealth,
        });
    } catch (error) {
        res.json({
            success: false,
            status: "loading",
            environment: config.NODE_ENV,
            timestamp: new Date().toISOString(),
            ml_service: { status: "unavailable", error: error.message },
        });
    }
});

// ============================================================
// 7. Serve React Client in Production (before 404 so SPA routes work)
// ============================================================
const clientDist = path.join(__dirname, "..", "client", "dist");
if (config.NODE_ENV === "production" && fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api")) return next();
        res.sendFile(path.join(clientDist, "index.html"));
    });
}

// ============================================================
// 8. Error Handling
// ============================================================

// Multer upload errors — convert to user-friendly messages
const { handleMulterError } = require("./middleware/upload");
app.use(handleMulterError);

// 404 — route not found (only reached if no route and not production static)
app.use((req, _res, next) => {
    next(new AppError(`Route not found: ${req.originalUrl}`, 404));
});

// Global error handler (must be last middleware)
app.use(errorHandler);

// ============================================================
// 9. Start Server
// ============================================================
const startServer = async () => {
    const port = process.env.PORT || config.PORT || 5000;
    const host = "0.0.0.0";

    // 1. Immediately bind and start listening on 0.0.0.0 so Render detects the port instantly
    const server = app.listen(port, host, () => {
        const msg = `🚀 AgriGrow API Server listening on http://${host}:${port} [${config.NODE_ENV}]`;
        console.log("═══════════════════════════════════════════════");
        console.log(msg);
        console.log(`   Host        : ${host}`);
        console.log(`   Port        : ${port}`);
        console.log(`   Environment : ${config.NODE_ENV}`);
        console.log(`   ML Service  : ${config.ML_SERVICE_URL}`);
        console.log("═══════════════════════════════════════════════");
        logger.info(msg);
    });

    server.on("error", (err) => {
        console.error(`❌ Server port bind error: ${err.message}`);
        logger.error(`Server port bind error: ${err.message}`);
        process.exit(1);
    });

    // 2. Connect to MongoDB asynchronously without blocking port availability
    const tryConnectDB = async (retries = 5, delay = 5000) => {
        const maskedUri = (config.MONGO_URI || "").replace(/:\/\/[^:]+:[^@]+@/, "://<credentials>@");
        for (let i = 1; i <= retries; i++) {
            try {
                console.log(`⏳ Connecting to MongoDB at ${maskedUri} (Attempt ${i}/${retries})...`);
                await connectDB(config.MONGO_URI);
                console.log(`✅ MongoDB connected successfully!`);

                // Start the market price cron job (daily AMIS scrape)
                const { startMarketPriceCron } = require("./jobs/marketPriceCron");
                startMarketPriceCron();
                return;
            } catch (error) {
                console.error(`❌ MongoDB connection attempt ${i} failed: ${error.message}`);
                logger.error(`Database connection attempt ${i} failed: ${error.message}`);
                if (i < retries) {
                    console.log(`⏳ Retrying database connection in ${delay / 1000} seconds...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                } else {
                    console.error("❌ Could not connect to MongoDB after multiple attempts. Please check MONGO_URI and IP whitelist (0.0.0.0/0).");
                }
            }
        }
    };

    tryConnectDB();
};

// ============================================================
// Graceful Shutdown
// ============================================================
// Handle SIGTERM (sent by process managers like PM2)
process.on("SIGTERM", () => {
    logger.info("SIGTERM received. Shutting down gracefully...");
    process.exit(0);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
    logger.error(`Unhandled Rejection: ${err.message}`);
    process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
    logger.error(`Uncaught Exception: ${err.message}`);
    process.exit(1);
});

// 🚀 Launch!
startServer();
