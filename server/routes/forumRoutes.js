const express = require("express");
const router = express.Router();

const {
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
} = require("../controllers/forumController");
const { protect, authorize, optionalAuth } = require("../middleware/auth");

router.get("/categories", getCategories);
router.get("/threads", listThreads);
router.post("/threads", protect, createThread);
router.get("/threads/:slug", getThread);
router.post("/threads/:slug/replies", protect, addReply);
router.post("/threads/:id/upvote", protect, upvoteThread);
router.post("/replies/:id/upvote", protect, upvoteReply);
router.post("/replies/:replyId/solution", protect, markSolved);
router.post("/reports", protect, reportContent);

router.get("/admin/moderation", protect, authorize("admin", "editor", "superadmin"), listModeration);
router.patch("/admin/threads/:id", protect, authorize("admin", "editor", "superadmin"), moderateThread);
router.patch("/admin/replies/:id", protect, authorize("admin", "editor", "superadmin"), moderateReply);
router.patch("/admin/reports/:id", protect, authorize("admin", "editor", "superadmin"), reviewReport);

module.exports = router;
