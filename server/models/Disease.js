// ============================================================
// 🦠 Disease Report Model (Collection: disease_reports)
// ============================================================
//
// PURPOSE:
//   Stores every plant disease detection scan result.
//   Links to user, farm (optional), and crop (optional)
//   for comprehensive tracking and analytics.
//
// RELATIONSHIPS:
//   User (1)  ──> (N) DiseaseReport  (disease.user → User._id)
//   Farm (1)  ──> (N) DiseaseReport  (disease.farm → Farm._id)
//   Crop (1)  ──> (N) DiseaseReport  (disease.crop → Crop._id)
//
// WHY SEPARATE FROM CROP?
//   A user might scan a leaf without linking it to a specific
//   crop in the system. The scan itself has standalone value
//   (prediction, confidence, recommendation).
//
// INDEXES:
//   • { user: 1, createdAt: -1 }           — user's scan history
//   • { farm: 1, createdAt: -1 }           — scans per farm
//   • { "prediction.disease": 1 }          — aggregate by disease type
//   • { "prediction.isHealthy": 1 }        — filter healthy/diseased
// ============================================================

const mongoose = require("mongoose");

// -----------------------------------------------------------
// Sub-Schema: Top Prediction Entry
// -----------------------------------------------------------
const topPredictionSchema = new mongoose.Schema(
    {
        class: {
            type: String,
            required: true,
        },
        probability: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
    },
    { _id: false }
);

// -----------------------------------------------------------
// Sub-Schema: User Feedback
// -----------------------------------------------------------
const feedbackSchema = new mongoose.Schema(
    {
        isAccurate: {
            type: Boolean,
            required: true,
        },
        correctDisease: {
            type: String,
            trim: true,
        },
        severity: {
            type: String,
            enum: ["mild", "moderate", "severe", "critical"],
        },
        notes: {
            type: String,
            maxlength: 500,
        },
        submittedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

// -----------------------------------------------------------
// Main Disease Report Schema
// -----------------------------------------------------------
const diseaseReportSchema = new mongoose.Schema(
    {
        // ---------------------------------------------------
        // References
        // ---------------------------------------------------
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Disease report must belong to a user"],
            index: true,
        },

        farm: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Farm",
            // Optional — user can scan without linking to a farm
        },

        crop: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Crop",
            // Optional — user can scan without linking to a crop
        },

        // ---------------------------------------------------
        // Image Data
        // ---------------------------------------------------
        imageUrl: {
            type: String,
            required: [true, "Image URL is required"],
        },

        imageOriginalName: {
            type: String,
        },

        imageMimeType: {
            type: String,
        },

        // ---------------------------------------------------
        // ML Model Prediction Results
        // ---------------------------------------------------
        prediction: {
            disease: {
                type: String,
                required: [true, "Prediction disease name is required"],
            },
            confidence: {
                type: Number,
                required: [true, "Prediction confidence is required"],
                min: 0,
                max: 100,
            },
            isHealthy: {
                type: Boolean,
                required: true,
            },
        },

        // Human-readable info about the disease
        description: {
            type: String,
            default: "",
        },

        recommendation: {
            type: String,
            default: "",
        },

        // Top-5 predictions from the model
        topPredictions: [topPredictionSchema],

        // ---------------------------------------------------
        // AI Advisory (Gemini-generated)
        // ---------------------------------------------------
        aiAdvisory: {
            type: String,
            default: "",
        },

        // ---------------------------------------------------
        // Treatment Tracking
        // ---------------------------------------------------
        treatmentApplied: {
            type: String,
            default: "",
        },

        treatmentDate: {
            type: Date,
        },

        followUpDate: {
            type: Date,
        },

        resolved: {
            type: Boolean,
            default: false,
        },

        // ---------------------------------------------------
        // User Feedback on Accuracy
        // ---------------------------------------------------
        userFeedback: feedbackSchema,

        // ---------------------------------------------------
        // Metadata
        // ---------------------------------------------------
        scanLocation: {
            type: {
                type: String,
                enum: ["Point"],
            },
            coordinates: [Number], // [lng, lat] — GPS of where scan happened
        },

        weatherAtScan: {
            temperature: Number,
            humidity: Number,
            condition: String,
        },

        source: {
            type: String,
            enum: ["server", "offline-sync"],
            default: "server",
        },

        offlineCapturedAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
        // Use custom collection name to match user's requirement
        collection: "disease_reports",
    }
);

// ============================================================
// INDEXES
// ============================================================
diseaseReportSchema.index({ user: 1, createdAt: -1 });
diseaseReportSchema.index({ farm: 1, createdAt: -1 });
diseaseReportSchema.index({ crop: 1 });
diseaseReportSchema.index({ "prediction.disease": 1 });
diseaseReportSchema.index({ "prediction.isHealthy": 1, user: 1 });
diseaseReportSchema.index({ resolved: 1, user: 1 });

module.exports = mongoose.model("Disease", diseaseReportSchema);
