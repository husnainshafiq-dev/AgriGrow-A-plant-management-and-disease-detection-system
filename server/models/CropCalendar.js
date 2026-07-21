const mongoose = require("mongoose");

const cropCalendarSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Calendar event must belong to a user"]
        },
        field: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GeoField"
        },
        farm: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Farm"
        },
        title: {
            type: String,
            required: [true, "Event title is required"],
            maxlength: [200, "Title cannot exceed 200 characters"],
            trim: true
        },
        description: {
            type: String,
            maxlength: [1000, "Description cannot exceed 1000 characters"],
            trim: true
        },
        eventType: {
            type: String,
            enum: ["watering", "fertilizer", "pesticide", "harvest", "sowing", "soil-prep", "pruning", "inspection", "other"],
            required: [true, "Event type is required"]
        },
        cropName: {
            type: String,
            trim: true
        },
        startDate: {
            type: Date,
            required: [true, "Start date is required"]
        },
        endDate: {
            type: Date
        },
        isAllDay: {
            type: Boolean,
            default: true
        },
        recurrence: {
            type: String,
            enum: ["none", "daily", "weekly", "biweekly", "monthly"],
            default: "none"
        },
        recurrenceEnd: {
            type: Date
        },
        reminderBefore: {
            type: Number,
            enum: [0, 15, 30, 60, 1440, 4320], // minutes (0, 15m, 30m, 1h, 1d, 3d)
            default: 60
        },
        isCompleted: {
            type: Boolean,
            default: false
        },
        completedAt: {
            type: Date
        },
        notes: {
            type: String,
            trim: true
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high"],
            default: "medium"
        }
    },
    {
        timestamps: true
    }
);

// Indexes
cropCalendarSchema.index({ user: 1, startDate: 1 });
cropCalendarSchema.index({ user: 1, eventType: 1, startDate: 1 });

module.exports = mongoose.model("CropCalendar", cropCalendarSchema);
