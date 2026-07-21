const mongoose = require("mongoose");

const FORUM_DEFAULT_CATEGORIES = [
    {
        name: "Disease Help",
        slug: "disease-help",
        description: "Ask for help identifying crop symptoms and treatments.",
        color: "#ef4444",
        sortOrder: 1,
    },
    {
        name: "Crop Planning",
        slug: "crop-planning",
        description: "Discuss crop selection, rotation, calendars, and yields.",
        color: "#22c55e",
        sortOrder: 2,
    },
    {
        name: "Soil",
        slug: "soil",
        description: "Soil health, fertilizers, pH, compost, and testing.",
        color: "#a16207",
        sortOrder: 3,
    },
    {
        name: "Market Prices",
        slug: "market-prices",
        description: "Share crop pricing, selling tips, and local demand.",
        color: "#0ea5e9",
        sortOrder: 4,
    },
    {
        name: "General Farming",
        slug: "general-farming",
        description: "Tools, irrigation, farm life, and general questions.",
        color: "#8b5cf6",
        sortOrder: 5,
    },
];

const forumCategorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        description: {
            type: String,
            default: "",
            maxlength: 300,
        },
        color: {
            type: String,
            default: "#10b981",
        },
        sortOrder: {
            type: Number,
            default: 100,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

const forumThreadSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            minlength: 6,
            maxlength: 160,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        body: {
            type: String,
            required: true,
            trim: true,
            minlength: 15,
            maxlength: 12000,
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ForumCategory",
            required: true,
            index: true,
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        authorName: {
            type: String,
            trim: true,
            maxlength: 80,
            default: "Community member",
        },
        authorEmail: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 120,
        },
        moderationStatus: {
            type: String,
            enum: ["pending", "approved", "rejected", "hidden"],
            default: "pending",
            index: true,
        },
        status: {
            type: String,
            enum: ["open", "closed"],
            default: "open",
        },
        isSolved: {
            type: Boolean,
            default: false,
            index: true,
        },
        solvedReply: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ForumReply",
        },
        upvotes: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }],
        guestUpvoteCount: {
            type: Number,
            default: 0,
        },
        replyCount: {
            type: Number,
            default: 0,
        },
        reportCount: {
            type: Number,
            default: 0,
        },
        lastActivityAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        rejectionReason: {
            type: String,
            default: "",
            maxlength: 1000,
        },
    },
    { timestamps: true }
);

const forumReplySchema = new mongoose.Schema(
    {
        thread: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ForumThread",
            required: true,
            index: true,
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        authorName: {
            type: String,
            trim: true,
            maxlength: 80,
            default: "Community member",
        },
        authorEmail: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 120,
        },
        body: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 8000,
        },
        moderationStatus: {
            type: String,
            enum: ["pending", "approved", "rejected", "hidden"],
            default: "approved",
            index: true,
        },
        isSolution: {
            type: Boolean,
            default: false,
        },
        upvotes: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        }],
        guestUpvoteCount: {
            type: Number,
            default: 0,
        },
        reportCount: {
            type: Number,
            default: 0,
        },
        rejectionReason: {
            type: String,
            default: "",
            maxlength: 1000,
        },
    },
    { timestamps: true }
);

const reportSchema = new mongoose.Schema(
    {
        targetType: {
            type: String,
            enum: ["blog-post", "blog-comment", "forum-thread", "forum-reply"],
            required: true,
            index: true,
        },
        targetId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        reason: {
            type: String,
            enum: ["spam", "abuse", "misinformation", "unsafe-advice", "other"],
            default: "other",
        },
        details: {
            type: String,
            default: "",
            maxlength: 1000,
        },
        reporter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        reporterName: {
            type: String,
            trim: true,
            maxlength: 80,
            default: "Community member",
        },
        status: {
            type: String,
            enum: ["pending", "reviewed", "dismissed"],
            default: "pending",
            index: true,
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        reviewedAt: {
            type: Date,
        },
        adminNotes: {
            type: String,
            default: "",
            maxlength: 1000,
        },
    },
    { timestamps: true }
);

forumThreadSchema.index({ moderationStatus: 1, lastActivityAt: -1 });
forumThreadSchema.index({ category: 1, moderationStatus: 1, lastActivityAt: -1 });
forumThreadSchema.index({ title: "text", body: "text" });
forumReplySchema.index({ thread: 1, moderationStatus: 1, createdAt: 1 });
reportSchema.index({ status: 1, createdAt: -1 });

module.exports = {
    ForumCategory: mongoose.model("ForumCategory", forumCategorySchema),
    ForumThread: mongoose.model("ForumThread", forumThreadSchema),
    ForumReply: mongoose.model("ForumReply", forumReplySchema),
    Report: mongoose.model("Report", reportSchema),
    FORUM_DEFAULT_CATEGORIES,
};
