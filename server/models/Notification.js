const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true,
        },
        recipientEmail: {
            type: String,
            lowercase: true,
            trim: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 160,
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },
        type: {
            type: String,
            enum: [
                "blog-submitted",
                "blog-approved",
                "blog-rejected",
                "forum-reported",
                "forum-approved",
                "forum-rejected",
            ],
            default: "blog-submitted",
            index: true,
        },
        link: {
            type: String,
            default: "",
        },
        readAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipientEmail: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
