// ============================================================
// 🌿 Farm Model (Collection: farms)
// ============================================================
//
// PURPOSE:
//   Stores farm profile data including name, location, area,
//   soil type, water source, and crop history. Each farm
//   belongs to one user and can have many crops.
//
// RELATIONSHIPS:
//   User (1) ──────> (N) Farm       (farm.user → User._id)
//   Farm (1) ──────> (N) Crop       (crop.farm → Farm._id)
//   Farm (1) ──────> (N) Disease    (disease.farm → Farm._id)
//   Farm (1) ──────> (N) CostEst.   (costEst.farm → Farm._id)
//
// GEOSPATIAL:
//   • location   → GeoJSON Polygon  (farm boundary on map)
//   • center     → GeoJSON Point    (centroid for map marker)
//   • Both indexed with 2dsphere for geospatial queries
//
// INDEXES:
//   • { user: 1, isActive: 1 }  — fast "get my active farms"
//   • { location: "2dsphere" }  — geospatial queries
//   • { center: "2dsphere" }    — proximity searches
//   • { user: 1, createdAt: -1 } — sorted listing
// ============================================================

const mongoose = require("mongoose");

// -----------------------------------------------------------
// Sub-Schema: Crop History Entry
// -----------------------------------------------------------
// Embedded document — NOT a reference to the Crop collection.
// This records a lightweight historical log of what was grown
// on this farm in previous seasons, separate from active crops.
// -----------------------------------------------------------
const cropHistoryEntrySchema = new mongoose.Schema(
    {
        cropName: {
            type: String,
            required: true,
            trim: true,
        },
        variety: {
            type: String,
            trim: true,
            default: "",
        },
        season: {
            type: String,
            enum: ["kharif", "rabi", "zaid", "spring", "summer", "autumn", "winter", "year-round"],
            required: true,
        },
        year: {
            type: Number,
            required: true,
        },
        areaUsed: {
            value: { type: Number },
            unit: { type: String, enum: ["acres", "hectares", "sqft"], default: "acres" },
        },
        yieldObtained: {
            value: { type: Number },
            unit: { type: String, default: "kg" },
        },
        notes: {
            type: String,
            default: "",
        },
    },
    { _id: true, timestamps: false }
);

// -----------------------------------------------------------
// Main Farm Schema
// -----------------------------------------------------------
const farmSchema = new mongoose.Schema(
    {
        // ---------------------------------------------------
        // Owner Reference
        // ---------------------------------------------------
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Farm must belong to a user"],
            index: true,
        },

        // ---------------------------------------------------
        // Basic Information
        // ---------------------------------------------------
        name: {
            type: String,
            required: [true, "Please provide a farm name"],
            trim: true,
            minlength: [2, "Farm name must be at least 2 characters"],
            maxlength: [100, "Farm name cannot exceed 100 characters"],
        },

        description: {
            type: String,
            default: "",
            maxlength: [1000, "Description cannot exceed 1000 characters"],
        },

        // ---------------------------------------------------
        // Location — GeoJSON Polygon (farm boundary)
        // ---------------------------------------------------
        // GeoJSON format mandated by MongoDB for geospatial queries.
        // coordinates = [ [ [lng,lat], [lng,lat], ... ] ]
        // The outer array is the polygon ring; the inner arrays
        // are coordinate pairs. The first and last point MUST match
        // (closed polygon).
        // ---------------------------------------------------
        location: {
            type: {
                type: String,
                enum: ["Polygon"],
                default: "Polygon",
            },
            coordinates: {
                type: [[[Number]]], // Array of rings → array of [lng, lat] pairs
                required: [true, "Farm boundary coordinates are required"],
            },
        },

        // Centroid point for map markers and proximity searches
        center: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                default: [0, 0],
            },
        },

        // Human-readable address
        address: {
            village: { type: String, trim: true, default: "" },
            district: { type: String, trim: true, default: "" },
            state: { type: String, trim: true, default: "" },
            country: { type: String, trim: true, default: "India" },
            pinCode: { type: String, trim: true, default: "" },
        },

        // ---------------------------------------------------
        // Area
        // ---------------------------------------------------
        area: {
            value: {
                type: Number,
                required: [true, "Please provide the farm area"],
                min: [0.01, "Area must be greater than 0"],
            },
            unit: {
                type: String,
                enum: ["acres", "hectares", "sqft"],
                default: "acres",
            },
        },

        // ---------------------------------------------------
        // Soil & Land Characteristics
        // ---------------------------------------------------
        soilType: {
            type: String,
            enum: {
                values: ["clay", "sandy", "loamy", "silt", "peat", "chalk", "laterite", "black-cotton", "red", "alluvial", "other"],
                message: "{VALUE} is not a supported soil type",
            },
            default: "other",
        },

        soilPH: {
            type: Number,
            min: [0, "pH cannot be negative"],
            max: [14, "pH cannot exceed 14"],
        },

        terrain: {
            type: String,
            enum: ["flat", "hilly", "terraced", "sloped", "valley", "other"],
            default: "flat",
        },

        // ---------------------------------------------------
        // Water Source — Critical for farming advisory
        // ---------------------------------------------------
        waterSource: {
            primary: {
                type: String,
                enum: {
                    values: ["borewell", "well", "canal", "river", "rainwater", "pond", "dam", "drip", "sprinkler", "municipal", "none", "other"],
                    message: "{VALUE} is not a supported water source",
                },
                default: "other",
            },
            secondary: {
                type: String,
                enum: ["borewell", "well", "canal", "river", "rainwater", "pond", "dam", "drip", "sprinkler", "municipal", "none", "other"],
            },
            irrigationType: {
                type: String,
                enum: ["flood", "drip", "sprinkler", "furrow", "center-pivot", "manual", "rainfed", "other"],
                default: "other",
            },
            availability: {
                type: String,
                enum: ["year-round", "seasonal", "limited", "scarce"],
                default: "year-round",
            },
        },

        // ---------------------------------------------------
        // Active Crops (references to Crop collection)
        // ---------------------------------------------------
        crops: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Crop",
            },
        ],

        // ---------------------------------------------------
        // Crop History (embedded sub-documents)
        // ---------------------------------------------------
        // Why embedded instead of referenced?
        // → Historical data is read-only and always accessed
        //   with the farm. Embedding avoids extra lookups.
        // ---------------------------------------------------
        cropHistory: [cropHistoryEntrySchema],

        // ---------------------------------------------------
        // Farm Status & Metadata
        // ---------------------------------------------------
        farmType: {
            type: String,
            enum: ["crop", "orchard", "mixed", "dairy", "poultry", "aquaculture", "other"],
            default: "crop",
        },

        ownershipType: {
            type: String,
            enum: ["owned", "leased", "shared", "government", "other"],
            default: "owned",
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        isVerified: {
            type: Boolean,
            default: false,
        },

        images: [
            {
                url: String,
                caption: String,
                uploadedAt: { type: Date, default: Date.now },
            },
        ],
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// INDEXES — Critical for query performance
// ============================================================

// Compound: "get current user's active farms" (most common query)
farmSchema.index({ user: 1, isActive: 1 });

// Compound: "user's farms sorted by creation date"
farmSchema.index({ user: 1, createdAt: -1 });

// Geospatial: farm boundaries
farmSchema.index({ location: "2dsphere" });

// Geospatial: centroid for proximity searches
farmSchema.index({ center: "2dsphere" });

// ============================================================
// VIRTUALS
// ============================================================

/**
 * Virtual: count of active crops on this farm.
 */
farmSchema.virtual("activeCropCount").get(function () {
    return this.crops ? this.crops.length : 0;
});

/**
 * Virtual: count of historical crop entries.
 */
farmSchema.virtual("seasonCount").get(function () {
    return this.cropHistory ? this.cropHistory.length : 0;
});

/**
 * Virtual: disease reports linked to this farm.
 * Populated via Disease.find({ farm: this._id })
 */
farmSchema.virtual("diseaseReports", {
    ref: "Disease",
    localField: "_id",
    foreignField: "farm",
    count: true,
});

// ============================================================
// PRE-REMOVE HOOK — Cascade delete related data
// ============================================================
farmSchema.pre("deleteOne", { document: true, query: false }, async function () {
    const Crop = mongoose.model("Crop");
    const Disease = mongoose.model("Disease");
    const CostEstimation = mongoose.model("CostEstimation");

    // Remove all crops, disease reports, and cost estimations linked to this farm
    await Promise.all([
        Crop.deleteMany({ farm: this._id }),
        Disease.deleteMany({ farm: this._id }),
        CostEstimation.deleteMany({ farm: this._id }),
    ]);
});

module.exports = mongoose.model("Farm", farmSchema);
