const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const Disease = require("../models/Disease");
const Question = require("../models/Question");
const Advisory = require("../models/Advisory");
const { AppError } = require("../middleware/errorHandler");
const { sendSuccess } = require("../utils/apiResponse");

const listUsers = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === "true";

    const users = await User.find(filter)
        .select("name email phone role isActive lastLogin createdAt")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

    sendSuccess(res, 200, "Users retrieved", { users });
});

const updateUser = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError("User not found", 404));

    if (req.body.role && ["farmer", "admin"].includes(req.body.role)) {
        user.role = req.body.role;
    }
    if (req.body.isActive !== undefined) {
        user.isActive = req.body.isActive === true;
    }

    await user.save({ validateBeforeSave: false });
    sendSuccess(res, 200, "User updated", { user });
});

const listDiseaseReports = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.resolved !== undefined) filter.resolved = req.query.resolved === "true";
    if (req.query.isHealthy !== undefined) {
        filter["prediction.isHealthy"] = req.query.isHealthy === "true";
    }

    const reports = await Disease.find(filter)
        .sort({ createdAt: -1 })
        .limit(200)
        .populate("user", "name email")
        .populate("farm", "name")
        .populate("crop", "name")
        .lean();

    sendSuccess(res, 200, "Disease reports retrieved", { reports });
});

const updateDiseaseReport = asyncHandler(async (req, res, next) => {
    const report = await Disease.findById(req.params.id);
    if (!report) return next(new AppError("Disease report not found", 404));

    if (req.body.resolved !== undefined) report.resolved = req.body.resolved === true;
    if (req.body.treatmentApplied !== undefined) report.treatmentApplied = req.body.treatmentApplied;
    if (req.body.followUpDate !== undefined) report.followUpDate = req.body.followUpDate;

    await report.save();
    sendSuccess(res, 200, "Disease report updated", { report });
});

const listQueries = asyncHandler(async (req, res) => {
    const questions = await Question.find({})
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

    const advisories = await Advisory.find({})
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

    const formattedQuestions = questions.map((q) => ({
        _id: q._id,
        type: "question",
        title: q.title,
        body: q.body,
        category: q.category || "General",
        user: q.user,
        createdAt: q.createdAt,
        status: q.status || "open",
        kept: q.status === "kept" || q.status === "resolved",
    }));

    const formattedAdvisories = advisories.map((a) => ({
        _id: a._id,
        type: "advisory",
        title: a.query,
        body: a.response ? a.response.slice(0, 200) + "..." : "",
        category: a.category || "general",
        user: a.user,
        createdAt: a.createdAt,
        status: a.kept ? "kept" : "advisory",
        kept: !!a.kept,
    }));

    const queries = [...formattedQuestions, ...formattedAdvisories].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    sendSuccess(res, 200, "Queries retrieved", { queries });
});

const updateQueryStatus = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { type, kept, status } = req.body;

    if (type === "question" || (!type && await Question.findById(id))) {
        const q = await Question.findById(id);
        if (q) {
            q.status = kept ? "kept" : (status || "open");
            await q.save();
            return sendSuccess(res, 200, "Query updated", { query: q });
        }
    }

    if (type === "advisory" || (!type && await Advisory.findById(id))) {
        const a = await Advisory.findById(id);
        if (a) {
            a.kept = kept === true;
            await a.save();
            return sendSuccess(res, 200, "Advisory updated", { advisory: a });
        }
    }

    return next(new AppError("Query not found", 404));
});

const deleteQuery = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { type } = req.query;

    let deleted = null;
    if (type === "question") {
        deleted = await Question.findByIdAndDelete(id);
    } else if (type === "advisory") {
        deleted = await Advisory.findByIdAndDelete(id);
    } else {
        deleted = (await Question.findByIdAndDelete(id)) || (await Advisory.findByIdAndDelete(id));
    }

    if (!deleted) {
        return next(new AppError("Query not found", 404));
    }

    sendSuccess(res, 200, "Query deleted successfully");
});

module.exports = {
    listUsers,
    updateUser,
    listDiseaseReports,
    updateDiseaseReport,
    listQueries,
    updateQueryStatus,
    deleteQuery,
};
