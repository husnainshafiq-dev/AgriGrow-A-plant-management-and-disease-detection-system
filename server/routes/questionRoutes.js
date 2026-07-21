const express = require("express");
const { getQuestions, createQuestion, getMyQuestions, getQuestion, postAnswer, acceptAnswer, upvoteQuestion, upvoteAnswer } = require("../controllers/questionController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.route("/")
    .get(getQuestions)
    .post(protect, createQuestion);

router.route("/my")
    .get(protect, getMyQuestions);

router.route("/:id")
    .get(getQuestion);

router.route("/:id/answers")
    .post(protect, postAnswer);

router.route("/:id/answers/:answerId/accept")
    .patch(protect, acceptAnswer);

router.route("/:id/upvote")
    .post(protect, upvoteQuestion);

router.route("/:id/answers/:answerId/upvote")
    .post(protect, upvoteAnswer);

module.exports = router;
