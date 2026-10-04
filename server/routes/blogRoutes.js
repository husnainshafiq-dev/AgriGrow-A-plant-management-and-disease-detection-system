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
router.post("/posts", protect, submitPost);
router.get("/posts/:slug", getPublishedPost);
router.post("/posts/:slug/comments", protect, addComment);

router.get("/notifications", optionalAuth, getNotifications);
router.patch("/notifications/:id/read", optionalAuth, markNotificationRead);

router.get("/admin/posts", protect, authorize("admin", "editor", "superadmin"), listAdminPosts);
router.patch("/admin/posts/:id", protect, authorize("admin", "editor", "superadmin"), updateAdminPost);
router.delete("/admin/posts/:id", protect, authorize("admin", "editor", "superadmin"), deleteAdminPost);

module.exports = router;
