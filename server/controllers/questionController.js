const Question = require("../models/Question");
const User = require("../models/User");
const geminiService = require("../services/geminiService");
const asyncHandler = require("express-async-handler");
const { sendSuccess, sendError } = require("../utils/apiResponse");

// @desc    Get all questions with filters, search, and pagination
// @route   GET /api/questions
// @access  Public
const getQuestions = asyncHandler(async (req, res) => {
    const { category, status, search, sort, page = 1, limit = 10 } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (status) filter.status = status;
    
    if (search) {
        filter.$text = { $search: search };
    }

    const skip = (page - 1) * limit;
    const queryBuilder = Question.find(filter)
        .populate("user", "name avatar role")
        .select("-answers.upvotes"); // Hide voter sub-arrays to optimize payload

    // Sort order logic
    if (sort === "popular") {
        queryBuilder.sort({ upvotesCount: -1, createdAt: -1 });
    } else if (sort === "unanswered") {
        // Find questions where status is open/no community answers
        filter.status = "open";
        queryBuilder.sort({ createdAt: -1 });
    } else {
        // default: recent
        queryBuilder.sort({ createdAt: -1 });
    }

    const questions = await queryBuilder.skip(skip).limit(Number(limit));
    const total = await Question.countDocuments(filter);

    // Map to include total upvotes / replies count
    const formatted = questions.map(q => {
        const doc = q.toObject();
        doc.upvotesCount = q.upvotes.length;
        doc.answersCount = q.answers.length;
        delete doc.upvotes;
        return doc;
    });

    sendSuccess(res, 200, "Questions list retrieved", {
        questions: formatted,
        total,
        page: Number(page),
        pages: Math.ceil(total / limit)
    });
});

// @desc    Create new question & get AI expert response
// @route   POST /api/questions
// @access  Private
const createQuestion = asyncHandler(async (req, res) => {
    const { title, body, category, tags, cropName, province, district, isUrgent } = req.body;

    if (!title || !body || !category) {
        return sendError(res, 400, "Please provide title, body, and category");
    }

    const question = await Question.create({
        user: req.user._id,
        title,
        body,
        category,
        tags: tags || [],
        cropName,
        location: { province, district },
        isUrgent: isUrgent || false
    });

    // Generate AI Expert advice in the background / immediate
    let aiAnswerText = "";
    try {
        const prompt = `
You are AgriGrow Expert AI. Solve this issue reported by a farmer:
Title: "${title}"
Category: "${category}"
Crop: "${cropName || "unspecified"}"
Location: ${province || "unspecified"}, ${district || "unspecified"}

Farmer's question details:
"${body}"

Provide a farmer-friendly expert advice:
1. Explain what is likely causing the problem.
2. Outline specific, easy-to-follow actions (both organic and chemical solutions).
3. Suggest preventative advice to stop this from happening again.

Keep it simple, clear, and action-oriented. Max 350 words.
`;
        const aiResult = await geminiService.getAdvisory(prompt, {}, req.user._id);
        aiAnswerText = aiResult.text;
        
        question.aiAnswer = aiAnswerText;
        question.status = "answered";
        await question.save();
    } catch (err) {
        console.error("AI Expert consultation generation failed:", err);
        question.aiAnswer = "Expert AI response is currently pending. An advisor will review your question shortly.";
        await question.save();
    }

    sendSuccess(res, 201, "Question submitted successfully", question);
});

// @desc    Get questions asked by the logged-in user
// @route   GET /api/questions/my
// @access  Private
const getMyQuestions = asyncHandler(async (req, res) => {
    const questions = await Question.find({ user: req.user._id })
        .sort({ createdAt: -1 });
    sendSuccess(res, 200, "My questions retrieved", questions);
});

// @desc    Get single question detail & increment views
// @route   GET /api/questions/:id
// @access  Public
const getQuestion = asyncHandler(async (req, res) => {
    const question = await Question.findByIdAndUpdate(
        req.params.id,
        { $inc: { viewCount: 1 } },
        { new: true }
    )
    .populate("user", "name avatar role experience specializations")
    .populate("answers.user", "name avatar role experience specializations");

    if (!question) {
        return sendError(res, 404, "Question not found");
    }

    sendSuccess(res, 200, "Question details retrieved", question);
});

// @desc    Submit an answer to a question
// @route   POST /api/questions/:id/answers
// @access  Private
const postAnswer = asyncHandler(async (req, res) => {
    const { body } = req.body;

    if (!body) {
        return sendError(res, 400, "Please provide answer body");
    }

    const question = await Question.findById(req.params.id);
    if (!question) {
        return sendError(res, 404, "Question not found");
    }

    const isExpert = ["superadmin", "admin", "editor"].includes(req.user.role) || (req.user.experience && req.user.experience > 5);

    question.answers.push({
        user: req.user._id,
        authorName: req.user.name,
        body,
        isExpert: !!isExpert
    });

    question.status = "answered";
    await question.save();

    const updated = await Question.findById(req.params.id)
        .populate("answers.user", "name avatar role experience specializations");

    sendSuccess(res, 201, "Answer posted successfully", updated.answers[updated.answers.length - 1]);
});

// @desc    Accept an answer (by question owner)
// @route   PATCH /api/questions/:id/answers/:answerId/accept
// @access  Private
const acceptAnswer = asyncHandler(async (req, res) => {
    const question = await Question.findById(req.params.id);
    
    if (!question) {
        return sendError(res, 404, "Question not found");
    }

    if (question.user.toString() !== req.user._id.toString()) {
        return sendError(res, 403, "Only the author of the question can accept an answer");
    }

    let found = false;
    question.answers.forEach(ans => {
        if (ans._id.toString() === req.params.answerId) {
            ans.isAccepted = true;
            found = true;
        } else {
            ans.isAccepted = false; // Reset others
        }
    });

    if (!found) {
        return sendError(res, 404, "Answer not found");
    }

    question.status = "resolved";
    await question.save();

    sendSuccess(res, 200, "Answer accepted successfully", question);
});

// @desc    Upvote a question
// @route   POST /api/questions/:id/upvote
// @access  Private
const upvoteQuestion = asyncHandler(async (req, res) => {
    const question = await Question.findById(req.params.id);

    if (!question) {
        return sendError(res, 404, "Question not found");
    }

    const voterId = req.user._id;
    const index = question.upvotes.indexOf(voterId);

    if (index > -1) {
        // Already upvoted, so toggle/remove
        question.upvotes.splice(index, 1);
    } else {
        // Add upvote
        question.upvotes.push(voterId);
    }

    await question.save();
    sendSuccess(res, 200, "Upvote toggled", { upvotesCount: question.upvotes.length });
});

// @desc    Upvote an answer
// @route   POST /api/questions/:id/answers/:answerId/upvote
// @access  Private
const upvoteAnswer = asyncHandler(async (req, res) => {
    const question = await Question.findById(req.params.id);

    if (!question) {
        return sendError(res, 404, "Question not found");
    }

    const answer = question.answers.id(req.params.answerId);
    if (!answer) {
        return sendError(res, 404, "Answer not found");
    }

    const voterId = req.user._id;
    const index = answer.upvotes.indexOf(voterId);

    if (index > -1) {
        answer.upvotes.splice(index, 1);
    } else {
        answer.upvotes.push(voterId);
    }

    await question.save();
    sendSuccess(res, 200, "Answer upvote toggled", { upvotesCount: answer.upvotes.length });
});

module.exports = {
    getQuestions,
    createQuestion,
    getMyQuestions,
    getQuestion,
    postAnswer,
    acceptAnswer,
    upvoteQuestion,
    upvoteAnswer
};
