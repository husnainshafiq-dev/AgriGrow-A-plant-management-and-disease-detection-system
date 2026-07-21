// ============================================================
// 📝 Logger — Winston Configuration
// ============================================================
// Provides structured logging throughout the application.
//
// Why Winston?
// - Multiple transports (console + file)
// - Log levels (error, warn, info, debug)
// - Timestamps for debugging production issues
// - JSON format for log aggregation tools
// ============================================================

const { createLogger, format, transports } = require("winston");
const path = require("path");

const logger = createLogger({
    // Log level — in development we want everything,
    // in production we only care about warnings and errors.
    level: process.env.NODE_ENV === "production" ? "warn" : "debug",

    format: format.combine(
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        format.errors({ stack: true }), // Include stack traces
        format.json()
    ),

    defaultMeta: { service: "agrigrow-api" },

    transports: [
        // ---------------------------------------------------
        // Console transport — colorized output for development
        // ---------------------------------------------------
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.printf(({ level, message, timestamp, stack }) => {
                    return stack
                        ? `${timestamp} ${level}: ${message}\n${stack}`
                        : `${timestamp} ${level}: ${message}`;
                })
            ),
        }),

        // ---------------------------------------------------
        // File transport — write errors to a file for
        // post-mortem analysis in production
        // ---------------------------------------------------
        new transports.File({
            filename: path.join(__dirname, "..", "logs", "error.log"),
            level: "error",
            maxsize: 5 * 1024 * 1024, // 5 MB per file
            maxFiles: 5, // Keep last 5 files
        }),

        new transports.File({
            filename: path.join(__dirname, "..", "logs", "combined.log"),
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5,
        }),
    ],
});

module.exports = logger;
