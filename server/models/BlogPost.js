const mongoose = require("mongoose");

const BLOG_CATEGORIES = [
    "disease-treatment",
    "crop-guides",
    "soil-care",
    "weather-tips",
    "success-stories",
    "general",
];

const blogCommentSchema = new mongoose.Schema(
    {
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
        content: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 1500,
        },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "approved",
            index: true,
        },
        rejectionReason: {
            type: String,
            default: "",
            maxlength: 500,
        },
    },
    { timestamps: true }
);

const blogPostSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            minlength: 4,
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
        excerpt: {
            type: String,
            trim: true,
            maxlength: 300,
            default: "",
        },
        content: {
            type: String,
            required: true,
            trim: true,
            minlength: 30,
            maxlength: 20000,
        },
        coverImage: {
            type: String,
            trim: true,
            default: "",
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        authorName: {
            type: String,
            trim: true,
            maxlength: 80,
            default: "Community contributor",
        },
        submittedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        submitterEmail: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 120,
        },
        status: {
            type: String,
            enum: ["draft", "pending", "approved", "rejected"],
            default: "pending",
            index: true,
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        approvedAt: {
            type: Date,
        },
        rejectionReason: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },
        category: {
            type: String,
            enum: BLOG_CATEGORIES,
            default: "general",
            index: true,
        },
        tags: [{
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 40,
        }],
        publishedAt: {
            type: Date,
            index: true,
        },
        comments: [blogCommentSchema],
        viewCount: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ category: 1, status: 1, publishedAt: -1 });
blogPostSchema.index({ title: "text", content: "text", tags: "text" });

blogPostSchema.pre("validate", function (next) {
    if (this.status === "approved" && !this.publishedAt) {
        this.publishedAt = new Date();
    }
    next();
});

module.exports = {
    BlogPost: mongoose.model("BlogPost", blogPostSchema),
    BLOG_CATEGORIES,
};
