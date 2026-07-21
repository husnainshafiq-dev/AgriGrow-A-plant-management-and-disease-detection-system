const User = require("../models/User");
const BlogPost = require("../models/BlogPost");
const Advisory = require("../models/Advisory");
const Question = require("../models/Question");
const asyncHandler = require("express-async-handler");
const { sendSuccess, sendError } = require("../utils/apiResponse");

// @desc    Get user's bookmarked items grouped by type
// @route   GET /api/bookmarks
// @access  Private
const getBookmarks = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id);
    if (!user) return sendError(res, 404, "User not found");

    const articleIds = user.bookmarks.filter(b => b.type === "article").map(b => b.itemId);
    const advisoryIds = user.bookmarks.filter(b => b.type === "advisory").map(b => b.itemId);
    const questionIds = user.bookmarks.filter(b => b.type === "question").map(b => b.itemId);

    const articles = await BlogPost.find({ _id: { $in: articleIds } });
    const advisories = await Advisory.find({ _id: { $in: advisoryIds } });
    const questions = await Question.find({ _id: { $in: questionIds } });

    sendSuccess(res, 200, "Bookmarks retrieved", {
        article: articles,
        advisory: advisories,
        question: questions
    });
});

// @desc    Add a bookmark
// @route   POST /api/bookmarks
// @access  Private
const addBookmark = asyncHandler(async (req, res) => {
    const { type, itemId } = req.body;

    if (!type || !itemId) {
        return sendError(res, 400, "Please provide bookmark type and itemId");
    }

    if (!["article", "advisory", "question"].includes(type)) {
        return sendError(res, 400, "Invalid bookmark type");
    }

    const user = await User.findById(req.user._id);
    
    // Check if duplicate
    const exists = user.bookmarks.some(
        b => b.type === type && b.itemId.toString() === itemId.toString()
    );

    if (exists) {
        return sendSuccess(res, 200, "Item already bookmarked", user.bookmarks);
    }

    user.bookmarks.push({ type, itemId });
    await user.save();

    sendSuccess(res, 201, "Bookmark added successfully", user.bookmarks);
});

// @desc    Remove a bookmark
// @route   DELETE /api/bookmarks/:type/:itemId
// @access  Private
const removeBookmark = asyncHandler(async (req, res) => {
    const { type, itemId } = req.params;

    const user = await User.findById(req.user._id);
    
    user.bookmarks = user.bookmarks.filter(
        b => !(b.type === type && b.itemId.toString() === itemId.toString())
    );

    await user.save();
    sendSuccess(res, 200, "Bookmark removed successfully", user.bookmarks);
});

// @desc    Check if an item is bookmarked
// @route   GET /api/bookmarks/check/:type/:itemId
// @access  Private
const checkBookmark = asyncHandler(async (req, res) => {
    const { type, itemId } = req.params;

    const user = await User.findById(req.user._id);
    
    const exists = user.bookmarks.some(
        b => b.type === type && b.itemId.toString() === itemId.toString()
    );

    sendSuccess(res, 200, "Checked bookmark status", { bookmarked: exists });
});

module.exports = {
    getBookmarks,
    addBookmark,
    removeBookmark,
    checkBookmark
};
