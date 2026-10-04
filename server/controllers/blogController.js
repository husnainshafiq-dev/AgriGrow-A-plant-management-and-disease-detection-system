const asyncHandler = require("express-async-handler");
const { BlogPost, BLOG_CATEGORIES } = require("../models/BlogPost");
const Notification = require("../models/Notification");
const { AppError } = require("../middleware/errorHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { createUniqueSlug } = require("../utils/slug");

const getSubmitter = (req, body = {}) => ({
    userId: req.user?._id,
    name: req.user?.name || body.authorName || "Community contributor",
    email: req.user?.email || body.submitterEmail || body.authorEmail || "",
});

const sanitizeTags = (tags = []) => {
    if (typeof tags === "string") {
        tags = tags.split(",").map((tag) => tag.trim());
    }

    return Array.isArray(tags)
        ? [...new Set(tags.filter(Boolean).map((tag) => tag.toLowerCase()).slice(0, 8))]
        : [];
};

const postListProjection = "-comments.content -comments.authorEmail";

const listPublishedPosts = asyncHandler(async (req, res) => {
    const filter = { status: "approved" };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.q) filter.$text = { $search: req.query.q };

    const posts = await BlogPost.find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .select(postListProjection)
        .populate("approvedBy", "name")
        .lean();

    sendSuccess(res, 200, "Published blog posts retrieved", {
        posts,
        categories: BLOG_CATEGORIES,
    });
});

const getPublishedPost = asyncHandler(async (req, res, next) => {
    const post = await BlogPost.findOne({
        slug: req.params.slug,
        status: "approved",
    })
        .populate("approvedBy", "name")
        .lean();

    if (!post) {
        return next(new AppError("Blog post not found", 404));
    }

    await BlogPost.updateOne({ _id: post._id }, { $inc: { viewCount: 1 } });
    post.comments = (post.comments || []).filter((comment) => comment.status === "approved");

    sendSuccess(res, 200, "Blog post retrieved", { post });
});

const submitPost = asyncHandler(async (req, res, next) => {
    const { title, content, excerpt, coverImage, category } = req.body;

    if (!title || !content) {
        return next(new AppError("Title and content are required", 400));
    }

    const submitter = getSubmitter(req, req.body);
    const slug = await createUniqueSlug(BlogPost, title);

    const post = await BlogPost.create({
        title,
        slug,
        content,
        excerpt,
        coverImage,
        category: BLOG_CATEGORIES.includes(category) ? category : "general",
        tags: sanitizeTags(req.body.tags),
        author: submitter.userId,
        submittedBy: submitter.userId,
        authorName: submitter.name,
        submitterEmail: submitter.email,
        status: req.body.status === "draft" ? "draft" : "pending",
    });

    sendSuccess(res, 201, "Blog post submitted for approval", { post });
});

const addComment = asyncHandler(async (req, res, next) => {
    const post = await BlogPost.findOne({ slug: req.params.slug, status: "approved" });
    if (!post) return next(new AppError("Blog post not found", 404));
    if (!req.body.content) return next(new AppError("Comment content is required", 400));

    const submitter = getSubmitter(req, req.body);
    post.comments.push({
        content: req.body.content,
        author: submitter.userId,
        authorName: submitter.name,
        authorEmail: submitter.email,
        status: "approved",
    });
    await post.save();

    const approvedComments = post.comments.filter((comment) => comment.status === "approved");
    const addedComment = approvedComments[approvedComments.length - 1];

    sendSuccess(res, 201, "Comment added", {
        comment: addedComment,
        comments: approvedComments,
        commentCount: approvedComments.length,
    });
});

const listAdminPosts = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const posts = await BlogPost.find(filter)
        .sort({ createdAt: -1 })
        .populate("submittedBy", "name email")
        .populate("approvedBy", "name email")
        .lean();

    sendSuccess(res, 200, "Blog moderation queue retrieved", { posts });
});

const updateAdminPost = asyncHandler(async (req, res, next) => {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return next(new AppError("Blog post not found", 404));
    const previousTitle = post.title;

    const editableFields = [
        "title",
        "content",
        "excerpt",
        "coverImage",
        "category",
        "authorName",
        "rejectionReason",
    ];

    for (const field of editableFields) {
        if (req.body[field] !== undefined) post[field] = req.body[field];
    }

    if (req.body.tags !== undefined) post.tags = sanitizeTags(req.body.tags);
    if (req.body.title && req.body.title !== previousTitle) {
        post.slug = await createUniqueSlug(BlogPost, req.body.title, post._id);
    }

    if (req.body.status) {
        post.status = req.body.status;
        if (req.body.status === "approved") {
            post.approvedBy = req.user._id;
            post.approvedAt = new Date();
            post.publishedAt = post.publishedAt || new Date();
            post.rejectionReason = "";
        }
        if (req.body.status === "rejected") {
            post.approvedBy = undefined;
            post.approvedAt = undefined;
            post.publishedAt = undefined;
        }
    }

    await post.save();

    if (["approved", "rejected"].includes(post.status)) {
        await Notification.create({
            user: post.submittedBy,
            recipientEmail: post.submitterEmail,
            title: post.status === "approved" ? "Your blog post was approved" : "Your blog post needs changes",
            message: post.status === "approved"
                ? `"${post.title}" is now published.`
                : `"${post.title}" was rejected. ${post.rejectionReason || "Please review and submit again."}`,
            type: post.status === "approved" ? "blog-approved" : "blog-rejected",
            link: post.status === "approved" ? `/blog/${post.slug}` : "",
        });
    }

    sendSuccess(res, 200, "Blog post updated", { post });
});

const deleteAdminPost = asyncHandler(async (req, res, next) => {
    const post = await BlogPost.findById(req.params.id);
    if (!post) return next(new AppError("Blog post not found", 404));
    await post.deleteOne();
    sendSuccess(res, 200, "Blog post deleted");
});

const getNotifications = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.user?._id) filter.user = req.user._id;
    else if (req.query.email) filter.recipientEmail = String(req.query.email).toLowerCase();
    else return sendSuccess(res, 200, "Notifications retrieved", { notifications: [] });

    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    sendSuccess(res, 200, "Notifications retrieved", { notifications });
});

const markNotificationRead = asyncHandler(async (req, res, next) => {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return next(new AppError("Notification not found", 404));

    if (req.user?._id && notification.user && notification.user.toString() !== req.user._id.toString()) {
        return next(new AppError("Not authorized to update this notification", 403));
    }

    notification.readAt = new Date();
    await notification.save();
    sendSuccess(res, 200, "Notification marked as read", { notification });
});

module.exports = {
    listPublishedPosts,
    getPublishedPost,
    submitPost,
    addComment,
    listAdminPosts,
    updateAdminPost,
    deleteAdminPost,
    getNotifications,
    markNotificationRead,
};
