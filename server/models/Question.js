const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Answer must have an author"]
        },
        authorName: {
            type: String,
            required: [true, "Author name is required"]
        },
        body: {
            type: String,
            required: [true, "Answer body is required"],
            maxlength: [5000, "Answer cannot exceed 5000 characters"]
        },
        isExpert: {
            type: Boolean,
            default: false
        },
        isAccepted: {
            type: Boolean,
            default: false
        },
        upvotes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            }
        ]
    },
    {
        timestamps: true
    }
);

const questionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Question must have an author"]
        },
        title: {
            type: String,
            required: [true, "Question title is required"],
            maxlength: [300, "Title cannot exceed 300 characters"],
            trim: true
        },
        body: {
            type: String,
            required: [true, "Question body is required"],
            maxlength: [5000, "Body cannot exceed 5000 characters"],
            trim: true
        },
        category: {
            type: String,
            enum: ["disease", "crop-planning", "soil", "irrigation", "market", "equipment", "livestock", "other"],
            required: [true, "Category is required"]
        },
        tags: [
            {
                type: String,
                trim: true
            }
        ],
        images: [
            {
                type: String
            }
        ],
        cropName: {
            type: String,
            trim: true
        },
        location: {
            province: {
                type: String,
                trim: true
            },
            district: {
                type: String,
                trim: true
            }
        },
        status: {
            type: String,
            enum: ["open", "answered", "resolved", "closed"],
            default: "open"
        },
        aiAnswer: {
            type: String,
            default: ""
        },
        answers: [answerSchema],
        upvotes: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            }
        ],
        viewCount: {
            type: Number,
            default: 0
        },
        isUrgent: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

// Indexes
questionSchema.index({ category: 1, status: 1, createdAt: -1 });
questionSchema.index({ title: "text", body: "text" });

module.exports = mongoose.model("Question", questionSchema);
