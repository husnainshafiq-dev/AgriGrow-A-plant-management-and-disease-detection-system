// ============================================================
// 🔧 Environment Variable Validation & Configuration
// ============================================================
// This module loads environment variables from .env and validates
// that all required variables are present before the app starts.
// If anything is missing, the server crashes early with a clear
// error message — much better than a cryptic runtime failure.
// ============================================================

const dotenv = require("dotenv");
const path = require("path");

// Load .env file from the server directory
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// -----------------------------------------------------------
// Define all required environment variables
// -----------------------------------------------------------
const requiredVars = [
  "MONGO_URI",
  "JWT_SECRET",
];

// Optional vars with defaults
const defaults = {
  NODE_ENV: "development",
  PORT: "5000",
  JWT_EXPIRE: "7d",
  ML_SERVICE_URL: "http://localhost:8000",
  CLIENT_URL: "",
};

// -----------------------------------------------------------
// Validate required variables exist
// -----------------------------------------------------------
const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error("❌ Missing required environment variables:");
  missing.forEach((key) => console.error(`   • ${key}`));
  console.error("\n📄 Copy .env.example to server/.env and fill in the values.");
  process.exit(1);
}

// -----------------------------------------------------------
// Apply defaults for optional variables
// -----------------------------------------------------------
Object.entries(defaults).forEach(([key, value]) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
});

// -----------------------------------------------------------
// Export a clean config object
// -----------------------------------------------------------
module.exports = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: parseInt(process.env.PORT, 10),
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRE: process.env.JWT_EXPIRE,
  ML_SERVICE_URL: process.env.ML_SERVICE_URL,
  CLIENT_URL: process.env.CLIENT_URL || process.env.CORS_ORIGIN || "",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY || "4b16bf702e544ccac182c540d54148e2",
};
