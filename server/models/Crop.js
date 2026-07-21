// ============================================================
// 🌾 Crop Model (Collection: crops)
// ============================================================
//
// PURPOSE:
//   Stores active crop records linked to a farm and user.
//   Tracks planting lifecycle from planning → harvest.
//   Contains cost breakdown fields used by cost estimation.
//
// RELATIONSHIPS:
//   Farm (1)  ──> (N) Crop       (crop.farm → Farm._id)
//   User (1)  ──> (N) Crop       (crop.user → User._id)
//   Crop (1)  ──> (N) Disease    (disease.crop → Crop._id)
//   Crop (1)  ──> (1) CostEst.  (costEst.crop → Crop._id)
//
// INDEXES:
//   • { farm: 1 }                — get all crops for a farm
//   • { user: 1, status: 1 }    — get user's crops by status
//   • { user: 1, createdAt: -1 } — latest crops first
//   • { name: "text" }           — text search on crop name
// ============================================================

const mongoose = require("mongoose");

const cropSchema = new mongoose.Schema(
    {
        // ---------------------------------------------------
        // References
        // ---------------------------------------------------
        farm: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Farm",
            required: [true, "Crop must belong to a farm"],
            index: true,
        },

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Crop must belong to a user"],
            index: true,
        },

        // ---------------------------------------------------
        // Crop Details
        // ---------------------------------------------------
        name: {
            type: String,
            required: [true, "Please provide the crop name"],
            trim: true,
            maxlength: [100, "Crop name cannot exceed 100 characters"],
        },

        variety: {
            type: String,
            trim: true,
            default: "",
        },

        category: {
            type: String,
            enum: ["cereal", "pulse", "vegetable", "fruit", "oilseed", "spice", "fiber", "cash-crop", "other"],
            default: "other",
        },

        season: {
            type: String,
            enum: ["kharif", "rabi", "zaid", "spring", "summer", "autumn", "winter", "year-round"],
        },

        // ---------------------------------------------------
        // Lifecycle Dates
        // ---------------------------------------------------
        plantingDate: {
            type: Date,
            required: [true, "Please provide the planting date"],
        },

        expectedHarvestDate: {
            type: Date,
        },

        actualHarvestDate: {
            type: Date,
        },

        // ---------------------------------------------------
        // Area Under Cultivation
        // ---------------------------------------------------
        area: {
            value: {
                type: Number,
                required: [true, "Please provide crop area"],
                min: [0.01, "Area must be greater than 0"],
            },
            unit: {
                type: String,
                enum: ["acres", "hectares", "sqft"],
                default: "acres",
            },
        },

        // ---------------------------------------------------
        // Cost Breakdown (per-category costs)
        //
        // WHY EMBEDDED in Crop?
        // → Costs directly describe this crop's expenses.
        //   The CostEstimation model provides an AGGREGATE view
        //   across multiple crops/seasons for reporting.
        // ---------------------------------------------------
        costs: {
            seeds: { type: Number, default: 0, min: 0 },
            fertilizer: { type: Number, default: 0, min: 0 },
            pesticides: { type: Number, default: 0, min: 0 },
            labor: { type: Number, default: 0, min: 0 },
            irrigation: { type: Number, default: 0, min: 0 },
            equipment: { type: Number, default: 0, min: 0 },
            transportation: { type: Number, default: 0, min: 0 },
            storage: { type: Number, default: 0, min: 0 },
            other: { type: Number, default: 0, min: 0 },
        },

        // ---------------------------------------------------
        // Yield Tracking
        // ---------------------------------------------------
        expectedYield: {
            value: { type: Number, default: 0, min: 0 },
            unit: { type: String, default: "kg" },
        },

        actualYield: {
            value: { type: Number, default: 0, min: 0 },
            unit: { type: String, default: "kg" },
        },

        // ---------------------------------------------------
        // Revenue
        // ---------------------------------------------------
        marketPricePerUnit: {
            type: Number,
            default: 0,
            min: 0,
        },

        expectedRevenue: {
            type: Number,
            default: 0,
            min: 0,
        },

        actualRevenue: {
            type: Number,
            default: 0,
            min: 0,
        },

        currency: {
            type: String,
            default: "INR",
        },

        // ---------------------------------------------------
        // Status & Health
        // ---------------------------------------------------
        status: {
            type: String,
            enum: {
                values: ["planned", "sowing", "growing", "flowering", "harvesting", "harvested", "failed"],
                message: "{VALUE} is not a valid crop status",
            },
            default: "planned",
        },

        healthStatus: {
            type: String,
            enum: ["healthy", "infected", "treated", "critical", "unknown"],
            default: "unknown",
        },

        // ---------------------------------------------------
        // Notes & Metadata
        // ---------------------------------------------------
        notes: {
            type: String,
            default: "",
            maxlength: [2000, "Notes cannot exceed 2000 characters"],
        },

        tags: [
            {
                type: String,
                trim: true,
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
// INDEXES
// ============================================================
cropSchema.index({ user: 1, status: 1 });
cropSchema.index({ user: 1, createdAt: -1 });
cropSchema.index({ farm: 1, status: 1 });
cropSchema.index({ name: "text", variety: "text" }); // full-text search

// ============================================================
// VIRTUALS
// ============================================================

/**
 * Virtual: total cost (sum of all cost sub-fields).
 * Computed on the fly — NOT stored in the database.
 */
cropSchema.virtual("totalCost").get(function () {
    const c = this.costs;
    if (!c) return 0;
    return (
        (c.seeds || 0) +
        (c.fertilizer || 0) +
        (c.pesticides || 0) +
        (c.labor || 0) +
        (c.irrigation || 0) +
        (c.equipment || 0) +
        (c.transportation || 0) +
        (c.storage || 0) +
        (c.other || 0)
    );
});

/**
 * Virtual: estimated profit = revenue - costs.
 */
cropSchema.virtual("estimatedProfit").get(function () {
    return (this.expectedRevenue || 0) - this.totalCost;
});

/**
 * Virtual: actual profit (after harvest).
 */
cropSchema.virtual("actualProfit").get(function () {
    return (this.actualRevenue || 0) - this.totalCost;
});

/**
 * Virtual: cost per unit area.
 */
cropSchema.virtual("costPerAcre").get(function () {
    if (!this.area || !this.area.value || this.area.value === 0) return 0;
    return Math.round(this.totalCost / this.area.value);
});

/**
 * Virtual: disease reports for this crop.
 */
cropSchema.virtual("diseaseReports", {
    ref: "Disease",
    localField: "_id",
    foreignField: "crop",
});

module.exports = mongoose.model("Crop", cropSchema);
