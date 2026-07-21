const mongoose = require("mongoose");

const marketPriceSchema = new mongoose.Schema(
    {
        cropName: {
            type: String,
            required: [true, "Crop name is required"],
            trim: true,
            lowercase: true
        },
        variety: {
            type: String,
            trim: true,
            default: ""
        },
        market: {
            type: String,
            required: [true, "Market/Mandi name is required"],
            trim: true
        },
        province: {
            type: String,
            enum: ["Punjab", "Sindh", "KPK", "Balochistan"],
            required: [true, "Province is required"]
        },
        price: {
            min: {
                type: Number,
                default: 0
            },
            max: {
                type: Number,
                default: 0
            },
            average: {
                type: Number,
                required: [true, "Average price is required"]
            },
            unit: {
                type: String,
                // "per_100kg" is the canonical AMIS (govt) unit for Punjab
                // wholesale prices. Other units are kept for user reports
                // and historical seeded data.
                enum: ["per_kg", "per_40kg", "per_maund", "per_100kg"],
                default: "per_40kg"
            }
        },
        currency: {
            type: String,
            default: "PKR"
        },
        date: {
            type: Date,
            required: [true, "Price date is required"],
            default: Date.now
        },
        source: {
            type: String,
            enum: ["admin", "user-contributed", "seed-data", "admin-manual", "amis-scraper", "offline-sync"],
            default: "user-contributed"
        },
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    },
    {
        timestamps: true
    }
);

// Indexes for fast lookup on lists, details, and chart history
marketPriceSchema.index({ cropName: 1, date: -1 });
marketPriceSchema.index({ market: 1, date: -1 });
marketPriceSchema.index({ province: 1, cropName: 1, date: -1 });

module.exports = mongoose.model("MarketPrice", marketPriceSchema);
