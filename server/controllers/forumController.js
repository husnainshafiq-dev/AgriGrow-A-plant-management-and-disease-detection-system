const asyncHandler = require("express-async-handler");
const {
    ForumCategory,
    ForumThread,
    ForumReply,
    Report,
    FORUM_DEFAULT_CATEGORIES,
} = require("../models/Forum");
const { AppError } = require("../middleware/errorHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { createUniqueSlug } = require("../utils/slug");

const getAuthor = (req, body = {}) => ({
    userId: req.user?._id,
    name: req.user?.name || body.authorName || "Community member",
    email: req.user?.email || body.authorEmail || "",
});

const ensureDefaultCategories = async () => {
    const count = await ForumCategory.countDocuments();
    if (count > 0) return;
    await ForumCategory.insertMany(FORUM_DEFAULT_CATEGORIES);
};

const getCategories = asyncHandler(async (_req, res) => {
    await ensureDefaultCategories();
    const categories = await ForumCategory.find({ isActive: true })
        .sort({ sortOrder: 1, name: 1 })
        .lean();
    sendSuccess(res, 200, "Forum categories retrieved", { categories });
});

const listThreads = asyncHandler(async (req, res) => {
    await ensureDefaultCategories();
    const filter = { moderationStatus: "approved" };

    if (req.query.category) {
        const category = await ForumCategory.findOne({ slug: req.query.category }).lean();
        if (category) filter.category = category._id;
    }
    if (req.query.solved === "true") filter.isSolved = true;
    if (req.query.q) filter.$text = { $search: req.query.q };

    const threads = await ForumThread.find(filter)
        .sort({ lastActivityAt: -1 })
        .populate("category", "name slug color")
        .select("-authorEmail")
        .lean();

    sendSuccess(res, 200, "Forum threads retrieved", { threads });
});

const getThread = asyncHandler(async (req, res, next) => {
    const thread = await ForumThread.findOne({
        slug: req.params.slug,
        moderationStatus: "approved",
    })
        .populate("category", "name slug color")
        .populate("solvedReply")
        .lean();

    if (!thread) return next(new AppError("Forum thread not found", 404));

    const replies = await ForumReply.find({
        thread: thread._id,
        moderationStatus: "approved",
    })
        .sort({ isSolution: -1, createdAt: 1 })
        .select("-authorEmail")
        .lean();

    sendSuccess(res, 200, "Forum thread retrieved", { thread, replies });
});

const createThread = asyncHandler(async (req, res, next) => {
    await ensureDefaultCategories();
    const { title, body, categorySlug, categoryId } = req.body;

    if (!title || !body) return next(new AppError("Title and question are required", 400));

    const category = categoryId
        ? await ForumCategory.findById(categoryId)
        : await ForumCategory.findOne({ slug: categorySlug || "general-farming" });

    if (!category) return next(new AppError("Forum category not found", 404));

    const author = getAuthor(req, req.body);
    const slug = await createUniqueSlug(ForumThread, title);
    const isAdmin = ["superadmin", "admin", "editor"].includes(req.user?.role);

    const thread = await ForumThread.create({
        title,
        slug,
        body,
        category: category._id,
        author: author.userId,
        authorName: author.name,
        authorEmail: author.email,
        moderationStatus: isAdmin ? "approved" : "pending",
        lastActivityAt: new Date(),
    });

    sendSuccess(res, 201, isAdmin ? "Forum thread published" : "Forum thread submitted for moderation", {
        thread,
    });
});

const addReply = asyncHandler(async (req, res, next) => {
    const thread = await ForumThread.findOne({ slug: req.params.slug, moderationStatus: "approved" });
    if (!thread) return next(new AppError("Forum thread not found", 404));
    if (!req.body.body) return next(new AppError("Reply body is required", 400));

    const author = getAuthor(req, req.body);

    const reply = await ForumReply.create({
        thread: thread._id,
        body: req.body.body,
        author: author.userId,
        authorName: author.name,
        authorEmail: author.email,
        moderationStatus: "approved",
    });

    thread.replyCount += 1;
    thread.lastActivityAt = new Date();
    await thread.save();

    sendSuccess(res, 201, "Reply posted", { reply });
});

const upvoteThread = asyncHandler(async (req, res, next) => {
    const thread = await ForumThread.findById(req.params.id);
    if (!thread) return next(new AppError("Forum thread not found", 404));

    if (req.user?._id) {
        const userId = req.user._id.toString();
        const alreadyVoted = thread.upvotes.some((id) => id.toString() === userId);
        thread.upvotes = alreadyVoted
            ? thread.upvotes.filter((id) => id.toString() !== userId)
            : [...thread.upvotes, req.user._id];
    } else {
        thread.guestUpvoteCount += 1;
    }

    await thread.save();
    sendSuccess(res, 200, "Thread vote updated", {
        votes: thread.upvotes.length + thread.guestUpvoteCount,
    });
});

const upvoteReply = asyncHandler(async (req, res, next) => {
    const reply = await ForumReply.findById(req.params.id);
    if (!reply) return next(new AppError("Forum reply not found", 404));

    if (req.user?._id) {
        const userId = req.user._id.toString();
        const alreadyVoted = reply.upvotes.some((id) => id.toString() === userId);
        reply.upvotes = alreadyVoted
            ? reply.upvotes.filter((id) => id.toString() !== userId)
            : [...reply.upvotes, req.user._id];
    } else {
        reply.guestUpvoteCount += 1;
    }

    await reply.save();
    sendSuccess(res, 200, "Reply vote updated", {
        votes: reply.upvotes.length + reply.guestUpvoteCount,
    });
});

const markSolved = asyncHandler(async (req, res, next) => {
    const reply = await ForumReply.findById(req.params.replyId);
    if (!reply) return next(new AppError("Forum reply not found", 404));

    const thread = await ForumThread.findById(reply.thread);
    if (!thread) return next(new AppError("Forum thread not found", 404));

    const canSolve =
        ["superadmin", "admin", "editor"].includes(req.user?.role) ||
        (thread.author && req.user?._id && thread.author.toString() === req.user._id.toString());

    if (!canSolve) return next(new AppError("Only the thread author or admin can mark a solution", 403));

    await ForumReply.updateMany({ thread: thread._id }, { $set: { isSolution: false } });
    reply.isSolution = true;
    await reply.save();

    thread.isSolved = true;
    thread.solvedReply = reply._id;
    await thread.save();

    sendSuccess(res, 200, "Reply marked as solution", { thread, reply });
});

const reportContent = asyncHandler(async (req, res, next) => {
    const { targetType, targetId, reason, details } = req.body;
    if (!targetType || !targetId) return next(new AppError("Report target is required", 400));

    const author = getAuthor(req, req.body);
    const report = await Report.create({
        targetType,
        targetId,
        reason,
        details,
        reporter: author.userId,
        reporterName: author.name,
    });

    if (targetType === "forum-thread") {
        await ForumThread.findByIdAndUpdate(targetId, { $inc: { reportCount: 1 } });
    }
    if (targetType === "forum-reply") {
        await ForumReply.findByIdAndUpdate(targetId, { $inc: { reportCount: 1 } });
    }

    sendSuccess(res, 201, "Report submitted for admin review", { report });
});

const listModeration = asyncHandler(async (_req, res) => {
    const [threads, replies, reports] = await Promise.all([
        ForumThread.find({ moderationStatus: { $in: ["pending", "hidden", "rejected"] } })
            .sort({ createdAt: -1 })
            .populate("category", "name slug")
            .lean(),
        ForumReply.find({ moderationStatus: { $in: ["pending", "hidden", "rejected"] } })
            .sort({ createdAt: -1 })
            .populate("thread", "title slug")
            .lean(),
        Report.find({ status: "pending" }).sort({ createdAt: -1 }).lean(),
    ]);

    sendSuccess(res, 200, "Forum moderation queue retrieved", { threads, replies, reports });
});

const moderateThread = asyncHandler(async (req, res, next) => {
    const thread = await ForumThread.findById(req.params.id);
    if (!thread) return next(new AppError("Forum thread not found", 404));

    if (req.body.moderationStatus) thread.moderationStatus = req.body.moderationStatus;
    if (req.body.status) thread.status = req.body.status;
    if (req.body.rejectionReason !== undefined) thread.rejectionReason = req.body.rejectionReason;
    if (req.body.title) {
        thread.title = req.body.title;
        thread.slug = await createUniqueSlug(ForumThread, req.body.title, thread._id);
    }
    if (req.body.body) thread.body = req.body.body;
    await thread.save();

    sendSuccess(res, 200, "Forum thread moderated", { thread });
});

const moderateReply = asyncHandler(async (req, res, next) => {
    const reply = await ForumReply.findById(req.params.id);
    if (!reply) return next(new AppError("Forum reply not found", 404));

    const oldStatus = reply.moderationStatus;
    if (req.body.moderationStatus) reply.moderationStatus = req.body.moderationStatus;
    if (req.body.rejectionReason !== undefined) reply.rejectionReason = req.body.rejectionReason;
    if (req.body.body) reply.body = req.body.body;
    await reply.save();

    if (oldStatus !== "approved" && reply.moderationStatus === "approved") {
        await ForumThread.findByIdAndUpdate(reply.thread, {
            $inc: { replyCount: 1 },
            $set: { lastActivityAt: new Date() },
        });
    }

    sendSuccess(res, 200, "Forum reply moderated", { reply });
});

const reviewReport = asyncHandler(async (req, res, next) => {
    const report = await Report.findById(req.params.id);
    if (!report) return next(new AppError("Report not found", 404));

    report.status = req.body.status || "reviewed";
    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();
    report.adminNotes = req.body.adminNotes || "";
    await report.save();

    sendSuccess(res, 200, "Report reviewed", { report });
});

module.exports = {
    getCategories,
    listThreads,
    getThread,
    createThread,
    addReply,
    upvoteThread,
    upvoteReply,
    markSolved,
    reportContent,
    listModeration,
    moderateThread,
    moderateReply,
    reviewReport,
};
