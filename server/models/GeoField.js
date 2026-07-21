// ============================================================
// 🗺️ GeoField Model (Collection: geo_fields)
// ============================================================
//
// PURPOSE:
//   Stores precision agriculture field data including:
//   • Polygon boundaries (drawn by user on the map)
//   • Calculated area in acres
//   • Centroid coordinates (for weather API lookups)
//   • Associated AI crop recommendations from Gemini
//   • Weather snapshot at time of analysis
//
// GEOSPATIAL:
//   • boundary  → GeoJSON Polygon  (field boundary on map)
//   • centroid  → GeoJSON Point    (center for weather/API)
//   • Both indexed with 2dsphere for geospatial queries
//
// INDEXES:
//   • { user: 1, createdAt: -1 }   — user's fields sorted
//   • { boundary: "2dsphere" }      — geospatial queries
//   • { centroid: "2dsphere" }      — proximity searches
// ============================================================

const mongoose = require("mongoose");

// -----------------------------------------------------------
// Sub-Schema: Weather Snapshot
// -----------------------------------------------------------
// Captures environmental conditions at time of AI analysis.
// Essential for correlating crop recommendations with climate.
// -----------------------------------------------------------
const weatherSnapshotSchema = new mongoose.Schema(
    {
        temperature: { type: Number },         // °C
        feelsLike: { type: Number },           // °C
        humidity: { type: Number },            // %
        pressure: { type: Number },            // hPa
        windSpeed: { type: Number },           // m/s
        windDirection: { type: Number },       // degrees
        visibility: { type: Number },          // meters
        cloudCoverage: { type: Number },       // %
        condition: { type: String, trim: true },    // e.g., "Clear", "Rain"
        conditionDetail: { type: String, trim: true }, // e.g., "light rain"
        icon: { type: String },                // OpenWeatherMap icon code
        fetchedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

// -----------------------------------------------------------
// Sub-Schema: AI Crop Recommendation
// -----------------------------------------------------------
const cropRecommendationSchema = new mongoose.Schema(
    {
        // The full AI-generated text response
        fullResponse: { type: String, default: "" },

        // Structured fields extracted from AI response
        bestCrops: [
            {
                name: { type: String, trim: true },
                reason: { type: String, trim: true },
                expectedYield: { type: String, trim: true },
                waterNeeds: { type: String, trim: true },
            },
        ],

        preventiveMeasures: [
            {
                disease: { type: String, trim: true },
                measure: { type: String, trim: true },
            },
        ],

        seasonalInsights: { type: String, default: "" },

        // Tokens used for the AI call (tracking/billing)
        tokensUsed: {
            prompt: { type: Number, default: 0 },
            response: { type: Number, default: 0 },
            total: { type: Number, default: 0 },
        },

        generatedAt: { type: Date, default: Date.now },
    },
    { _id: false }
);

// -----------------------------------------------------------
// Sub-Schema: Disease Report Entry (Point data)
// -----------------------------------------------------------
// Each image upload creates a point report linked to this field.
// -----------------------------------------------------------
const diseasePointSchema = new mongoose.Schema(
    {
        // GeoJSON Point — where the image was taken / the field centroid
        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number], // [lng, lat]
                required: true,
            },
        },

        imageUrl: { type: String, required: true },
        imageOriginalName: { type: String },

        // ML model results
        prediction: {
            disease: { type: String, required: true },
            confidence: { type: Number, min: 0, max: 100 },
            isHealthy: { type: Boolean, default: false },
        },

        // AI advisory for this specific image
        aiAdvisory: { type: String, default: "" },

        // Weather at scan time
        weatherAtScan: weatherSnapshotSchema,

        scannedAt: { type: Date, default: Date.now },
    },
    { _id: true }
);

// 2dsphere index on disease point locations
diseasePointSchema.index({ location: "2dsphere" });

// -----------------------------------------------------------
// Main GeoField Schema
// -----------------------------------------------------------
const geoFieldSchema = new mongoose.Schema(
    {
        // ---------------------------------------------------
        // Owner Reference
        // ---------------------------------------------------
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Field must belong to a user"],
            index: true,
        },

        // Optional link to an existing Farm
        farm: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Farm",
        },

        // ---------------------------------------------------
        // Field Name & Description
        // ---------------------------------------------------
        name: {
            type: String,
            required: [true, "Field name is required"],
            trim: true,
            minlength: [2, "Field name must be at least 2 characters"],
            maxlength: [100, "Field name cannot exceed 100 characters"],
        },

        description: {
            type: String,
            default: "",
            maxlength: [500, "Description cannot exceed 500 characters"],
        },

        // ---------------------------------------------------
        // Boundary — GeoJSON Polygon
        // ---------------------------------------------------
        // User-drawn polygon on the dashboard map.
        // coordinates = [ [ [lng,lat], [lng,lat], ... ] ]
        // First and last point MUST match (closed polygon).
        // ---------------------------------------------------
        boundary: {
            type: {
                type: String,
                enum: ["Polygon"],
                default: "Polygon",
            },
            coordinates: {
                type: [[[Number]]],
                required: [true, "Field boundary coordinates are required"],
            },
        },

        // ---------------------------------------------------
        // Centroid — GeoJSON Point
        // ---------------------------------------------------
        // Automatically calculated from the polygon using
        // @turf/centroid on the backend. Used for:
        //   1. Weather API lookups (lat/lng → OpenWeatherMap)
        //   2. Reverse geocoding (lat/lng → city/region name)
        //   3. Map marker placement
        // ---------------------------------------------------
        centroid: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                required: [true, "Centroid is required"],
            },
        },

        // ---------------------------------------------------
        // Calculated Area (from Turf.js)
        // ---------------------------------------------------
        area: {
            value: {
                type: Number,
                required: [true, "Area value is required"],
                min: [0, "Area must be positive"],
            },
            unit: {
                type: String,
                enum: ["acres", "hectares", "sqft", "sqm"],
                default: "acres",
            },
        },

        // ---------------------------------------------------
        // Location Context (reverse-geocoded)
        // ---------------------------------------------------
        locationName: {
            type: String,
            trim: true,
            default: "", // e.g., "Sialkot, Punjab, Pakistan"
        },

        // ---------------------------------------------------
        // Weather Data (latest snapshot)
        // ---------------------------------------------------
        weather: weatherSnapshotSchema,

        // ---------------------------------------------------
        // AI Crop Recommendations
        // ---------------------------------------------------
        aiRecommendation: cropRecommendationSchema,

        // ---------------------------------------------------
        // Disease Points (embedded sub-documents)
        // ---------------------------------------------------
        // Each image upload within this field boundary creates
        // a disease point entry with its own GeoJSON Point.
        // ---------------------------------------------------
        diseasePoints: [diseasePointSchema],

        // ---------------------------------------------------
        // Status
        // ---------------------------------------------------
        isActive: {
            type: Boolean,
            default: true,
        },

        season: {
            type: String,
            trim: true,
            default: "", // Auto-detected from date & location
        },
    },
    {
        timestamps: true,
        collection: "geo_fields",
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// INDEXES
// ============================================================

// User's fields sorted by creation date
geoFieldSchema.index({ user: 1, createdAt: -1 });

// Geospatial: field boundaries for spatial queries
geoFieldSchema.index({ boundary: "2dsphere" });

// Geospatial: centroid for proximity/weather lookups
geoFieldSchema.index({ centroid: "2dsphere" });

// Active fields filter
geoFieldSchema.index({ user: 1, isActive: 1 });

// ============================================================
// VIRTUALS
// ============================================================

/**
 * Virtual: count of disease points in this field.
 */
geoFieldSchema.virtual("diseasePointCount").get(function () {
    return this.diseasePoints ? this.diseasePoints.length : 0;
});

/**
 * Virtual: whether AI recommendation exists.
 */
geoFieldSchema.virtual("hasRecommendation").get(function () {
    return !!(this.aiRecommendation && this.aiRecommendation.fullResponse);
});

module.exports = mongoose.model("GeoField", geoFieldSchema);
