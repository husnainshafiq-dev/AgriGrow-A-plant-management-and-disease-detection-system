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
router.post("/threads", optionalAuth, createThread);
router.get("/threads/:slug", getThread);
router.post("/threads/:slug/replies", optionalAuth, addReply);
router.post("/threads/:id/upvote", optionalAuth, upvoteThread);
router.post("/replies/:id/upvote", optionalAuth, upvoteReply);
router.post("/replies/:replyId/solution", protect, markSolved);
router.post("/reports", optionalAuth, reportContent);

router.get("/admin/moderation", protect, authorize("admin"), listModeration);
router.patch("/admin/threads/:id", protect, authorize("admin"), moderateThread);
router.patch("/admin/replies/:id", protect, authorize("admin"), moderateReply);
router.patch("/admin/reports/:id", protect, authorize("admin"), reviewReport);

module.exports = router;
