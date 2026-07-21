const express = require("express");
const { getBookmarks, addBookmark, removeBookmark, checkBookmark } = require("../controllers/bookmarkController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.use(protect); // All bookmark routes require authentication

router.route("/")
    .get(getBookmarks)
    .post(addBookmark);

router.route("/:type/:itemId")
    .delete(removeBookmark);

router.route("/check/:type/:itemId")
    .get(checkBookmark);

module.exports = router;
