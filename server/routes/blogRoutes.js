const express = require("express");
const router = express.Router();

const {
    listPublishedPosts,
    getPublishedPost,
    submitPost,
    addComment,
    listAdminPosts,
    updateAdminPost,
    deleteAdminPost,
    getNotifications,
    markNotificationRead,
} = require("../controllers/blogController");
const { protect, authorize, optionalAuth } = require("../middleware/auth");

router.get("/posts", listPublishedPosts);
router.post("/posts", optionalAuth, submitPost);
router.get("/posts/:slug", getPublishedPost);
router.post("/posts/:slug/comments", optionalAuth, addComment);

router.get("/notifications", optionalAuth, getNotifications);
router.patch("/notifications/:id/read", optionalAuth, markNotificationRead);

router.get("/admin/posts", protect, authorize("admin"), listAdminPosts);
router.patch("/admin/posts/:id", protect, authorize("admin"), updateAdminPost);
router.delete("/admin/posts/:id", protect, authorize("admin"), deleteAdminPost);

module.exports = router;
