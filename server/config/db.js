// ============================================================
// 🗄️ MongoDB Connection
// ============================================================
// This module handles the MongoDB connection using Mongoose.
//
// Key design decisions:
// 1. Uses a dedicated function (not top-level await) so we can
//    call it explicitly in server.js and handle failures.
// 2. Sets recommended Mongoose options for production stability.
// 3. Listens for connection events to log status changes.
// ============================================================

const mongoose = require("mongoose");
const logger = require("../utils/logger");

/**
 * Connect to MongoDB.
 * Call this once during server startup.
 *
 * @param {string} uri - MongoDB connection string
 * @returns {Promise<void>}
 */
const connectDB = async (uri) => {
    try {
        const conn = await mongoose.connect(uri, {
            // ---------------------------------------------------
            // Mongoose 8+ applies sensible defaults, but we set
            // these explicitly for clarity and documentation.
            // ---------------------------------------------------
            // Maximum number of sockets the MongoDB driver will
            // keep open for this connection. Default is 100.
            maxPoolSize: 10,

            // How long to wait for a connection from the pool
            // before throwing an error (in milliseconds).
            serverSelectionTimeoutMS: 5000,

            // How long to wait for a response from the server
            // after sending a request (in milliseconds).
            socketTimeoutMS: 45000,
        });

        logger.info(`✅ MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        logger.error(`❌ MongoDB connection failed: ${error.message}`);
        console.error(`❌ MongoDB connection failed: ${error.message}`);
        throw error;
    }
};

// -----------------------------------------------------------
// Connection event listeners (helpful for debugging)
// -----------------------------------------------------------
mongoose.connection.on("disconnected", () => {
    logger.warn("⚠️  MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
    logger.info("🔄 MongoDB reconnected");
});

mongoose.connection.on("error", (err) => {
    logger.error(`❌ MongoDB error: ${err.message}`);
});

module.exports = connectDB;
