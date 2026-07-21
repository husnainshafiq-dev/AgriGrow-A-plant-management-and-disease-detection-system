// ============================================================
// 💰 Cost Estimation Model (Collection: cost_estimations)
// ============================================================
//
// PURPOSE:
//   Stores aggregated cost estimation reports for a specific
//   crop-farm combination. While the Crop model has individual
//   cost fields, THIS model stores complete estimation snapshots
//   with AI-suggested optimizations and comparison data.
//
// WHY SEPARATE FROM CROP?
//   • A user can generate MULTIPLE estimations for the same crop
//     (e.g., "what-if" scenarios with different input prices)
//   • Estimations include AI suggestions and market data that
//     don't belong in the crop's core data
//   • Historical estimations allow trend analysis
//
// RELATIONSHIPS:
//   User (1)  ──> (N) CostEstimation  (costEst.user → User._id)
//   Farm (1)  ──> (N) CostEstimation  (costEst.farm → Farm._id)
//   Crop (1)  ──> (N) CostEstimation  (costEst.crop → Crop._id)
//
// INDEXES:
//   • { user: 1, createdAt: -1 }  — user's estimation history
//   • { farm: 1, crop: 1 }        — estimations per farm-crop pair
//   • { cropName: 1 }             — aggregate by crop type
// ============================================================

const mongoose = require("mongoose");

// -----------------------------------------------------------
// Sub-Schema: Individual Cost Line Item
// -----------------------------------------------------------
const costLineItemSchema = new mongoose.Schema(
    {
        category: {
            type: String,
            required: true,
            enum: [
                "seeds",
                "fertilizer",
                "pesticides",
                "labor",
                "irrigation",
                "equipment",
                "transportation",
                "storage",
                "land-lease",
                "insurance",
                "other",
            ],
        },
        description: {
            type: String,
            default: "",
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        isEstimated: {
            type: Boolean,
            default: true, // true if calculated, false if user-provided
        },
    },
    { _id: false }
);

// -----------------------------------------------------------
// Main Cost Estimation Schema
// -----------------------------------------------------------
const costEstimationSchema = new mongoose.Schema(
    {
        // ---------------------------------------------------
        // References
        // ---------------------------------------------------
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Cost estimation must belong to a user"],
            index: true,
        },

        farm: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Farm",
        },

        crop: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Crop",
        },

        // ---------------------------------------------------
        // Estimation Input Parameters
        // ---------------------------------------------------
        cropName: {
            type: String,
            required: [true, "Crop name is required for estimation"],
            trim: true,
            index: true,
        },

        area: {
            value: {
                type: Number,
                required: [true, "Area is required for estimation"],
                min: 0.01,
            },
            unit: {
                type: String,
                enum: ["acres", "hectares", "sqft"],
                default: "acres",
            },
        },

        season: {
            type: String,
            enum: ["kharif", "rabi", "zaid", "spring", "summer", "autumn", "winter", "year-round"],
        },

        // ---------------------------------------------------
        // Cost Breakdown
        // ---------------------------------------------------
        // Quick summary (denormalized for fast reads)
        costSummary: {
            seeds: { type: Number, default: 0 },
            fertilizer: { type: Number, default: 0 },
            pesticides: { type: Number, default: 0 },
            labor: { type: Number, default: 0 },
            irrigation: { type: Number, default: 0 },
            equipment: { type: Number, default: 0 },
            transportation: { type: Number, default: 0 },
            storage: { type: Number, default: 0 },
            other: { type: Number, default: 0 },
        },

        // Detailed line items (for itemized view)
        lineItems: [costLineItemSchema],

        totalCost: {
            type: Number,
            required: true,
            min: 0,
        },

        // ---------------------------------------------------
        // Yield & Revenue Projections
        // ---------------------------------------------------
        expectedYield: {
            value: { type: Number, default: 0, min: 0 },
            unit: { type: String, default: "kg" },
        },

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

        expectedProfit: {
            type: Number,
            default: 0,
        },

        roi: {
            type: Number, // Percentage
            default: 0,
        },

        breakEvenYield: {
            value: { type: Number, default: 0 },
            unit: { type: String, default: "kg" },
        },

        currency: {
            type: String,
            default: "INR",
        },

        // ---------------------------------------------------
        // AI Suggestions (from Gemini or cost service)
        // ---------------------------------------------------
        aiSuggestions: {
            costReduction: [{ type: String }],    // Ways to reduce cost
            yieldImprovement: [{ type: String }],  // Ways to improve yield
            marketTiming: { type: String },         // Best time to sell
            overallAdvice: { type: String },        // General advice
        },

        // ---------------------------------------------------
        // Comparison Data
        // ---------------------------------------------------
        regionAverage: {
            totalCost: { type: Number },
            yieldPerAcre: { type: Number },
            profitPerAcre: { type: Number },
        },

        // ---------------------------------------------------
        // Metadata
        // ---------------------------------------------------
        estimationType: {
            type: String,
            enum: ["quick", "detailed", "ai-assisted"],
            default: "quick",
        },

        title: {
            type: String,
            trim: true,
            default: "",
        },

        notes: {
            type: String,
            default: "",
            maxlength: 2000,
        },

        isSaved: {
            type: Boolean,
            default: false, // Quick estimates are not saved by default
        },

        // Data source for the estimation
        dataSource: {
            type: String,
            enum: ["user-input", "reference-data", "ai-generated", "hybrid"],
            default: "reference-data",
        },
    },
    {
        timestamps: true,
        collection: "cost_estimations",
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// ============================================================
// INDEXES
// ============================================================
costEstimationSchema.index({ user: 1, createdAt: -1 });
costEstimationSchema.index({ farm: 1, crop: 1 });
costEstimationSchema.index({ cropName: 1, createdAt: -1 });
costEstimationSchema.index({ user: 1, isSaved: 1 });

// ============================================================
// VIRTUALS
// ============================================================

/**
 * Virtual: cost per acre.
 */
costEstimationSchema.virtual("costPerAcre").get(function () {
    if (!this.area || !this.area.value || this.area.value === 0) return 0;
    return Math.round(this.totalCost / this.area.value);
});

/**
 * Virtual: profit margin percentage.
 */
costEstimationSchema.virtual("profitMargin").get(function () {
    if (!this.expectedRevenue || this.expectedRevenue === 0) return 0;
    return ((this.expectedProfit / this.expectedRevenue) * 100).toFixed(1);
});

module.exports = mongoose.model("CostEstimation", costEstimationSchema);
