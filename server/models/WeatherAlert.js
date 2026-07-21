const mongoose = require("mongoose");

const weatherAlertSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Alert must belong to a user"]
        },
        field: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GeoField",
            required: [true, "Alert must belong to a field"]
        },
        alertType: {
            type: String,
            enum: ["heavy-rain", "frost", "heatwave", "storm", "drought", "wind", "humidity"],
            required: [true, "Alert type is required"]
        },
        severity: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            required: [true, "Severity is required"]
        },
        title: {
            type: String,
            required: [true, "Alert title is required"],
            trim: true
        },
        message: {
            type: String,
            required: [true, "Alert message is required"],
            trim: true
        },
        weatherData: {
            temperature: Number,
            humidity: Number,
            windSpeed: Number,
            rainfall: Number,
            condition: String
        },
        isRead: {
            type: Boolean,
            default: false
        },
        isDismissed: {
            type: Boolean,
            default: false
        },
        expiresAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

// Index to quickly query active notifications
weatherAlertSchema.index({ user: 1, isRead: 1, createdAt: -1 });

// TTL index to automatically remove expired alerts from database
weatherAlertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("WeatherAlert", weatherAlertSchema);
