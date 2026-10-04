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

const createUser = asyncHandler(async (req, res, next) => {
    const { name, email, password, role = "farmer", phone } = req.body;

    if (!name || name.trim().length < 2) {
        return next(new AppError("Name must be at least 2 characters", 400));
    }
    if (!email || !/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
        return next(new AppError("Please provide a valid email", 400));
    }
    if (!password || password.length < 6) {
        return next(new AppError("Password must be at least 6 characters", 400));
    }

    const validRoles = ["farmer", "editor", "admin", "superadmin"];
    if (!validRoles.includes(role)) {
        return next(new AppError("Invalid role specified", 400));
    }

    // Role-based creation restrictions:
    // Admin can ONLY create farmer or editor
    // Superadmin can create any role (farmer, editor, admin, superadmin)
    if (req.user.role === "admin" && (role === "admin" || role === "superadmin")) {
        return next(new AppError("Admins can only create farmer or editor accounts", 403));
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
        return next(new AppError("A user with this email already exists", 400));
    }

    const user = await User.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password,
        role,
        phone: phone ? phone.trim() : "",
        isActive: true,
    });

    sendSuccess(res, 201, "User created successfully", {
        user: {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            isActive: user.isActive,
            createdAt: user.createdAt,
        },
    });
});

const updateUser = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError("User not found", 404));

    const isSelf = user._id.toString() === req.user._id.toString();

    // Hierarchy protections:
    // 1. Admin cannot modify Superadmin or other Admin accounts
    if (req.user.role === "admin") {
        if (user.role === "superadmin" || user.role === "admin") {
            return next(new AppError("Admins cannot modify Admin or Superadmin accounts", 403));
        }
        if (req.body.role && !["farmer", "editor"].includes(req.body.role)) {
            return next(new AppError("Admins can only promote or demote users between farmer and editor", 403));
        }
    }

    // 2. Superadmin modifying self safeguards
    if (req.user.role === "superadmin" && isSelf) {
        if (req.body.role && req.body.role !== "superadmin") {
            const superadminCount = await User.countDocuments({ role: "superadmin" });
            if (superadminCount <= 1) {
                return next(new AppError("Cannot demote the only Superadmin in the system", 400));
            }
        }
        if (req.body.isActive === false) {
            return next(new AppError("You cannot deactivate your own account", 400));
        }
    }

    if (req.body.role) {
        if (!["farmer", "editor", "admin", "superadmin"].includes(req.body.role)) {
            return next(new AppError("Invalid role specified", 400));
        }
        user.role = req.body.role;
    }

    if (req.body.isActive !== undefined) {
        user.isActive = req.body.isActive === true;
    }

    if (req.body.name) {
        user.name = req.body.name.trim();
    }

    if (req.body.phone !== undefined) {
        user.phone = req.body.phone.trim();
    }

    await user.save({ validateBeforeSave: false });
    sendSuccess(res, 200, "User updated", { user });
});

const deleteUser = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError("User not found", 404));

    // Nobody can delete self
    if (user._id.toString() === req.user._id.toString()) {
        return next(new AppError("You cannot delete your own account", 400));
    }

    // Hierarchy protections:
    if (user.role === "superadmin") {
        if (req.user.role !== "superadmin") {
            return next(new AppError("Only Superadmin can delete other accounts", 403));
        }
        const superadminCount = await User.countDocuments({ role: "superadmin" });
        if (superadminCount <= 1) {
            return next(new AppError("Cannot delete the only Superadmin account", 400));
        }
    }

    if (user.role === "admin" && req.user.role !== "superadmin") {
        return next(new AppError("Only Superadmin can delete Admin accounts", 403));
    }

    await user.deleteOne();
    sendSuccess(res, 200, "User deleted successfully");
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

const createQuery = asyncHandler(async (req, res, next) => {
    const { type = "question", title, body, category = "general" } = req.body;

    if (!title || title.trim().length < 3) {
        return next(new AppError("Title must be at least 3 characters", 400));
    }

    if (type === "advisory") {
        const advisory = await Advisory.create({
            user: req.user._id,
            query: title.trim(),
            response: body ? body.trim() : "Advisory created by moderator.",
            category: category.toLowerCase(),
            kept: true,
        });
        return sendSuccess(res, 201, "Advisory created successfully", { query: advisory });
    }

    const validCategories = ["disease", "crop-planning", "soil", "irrigation", "market", "equipment", "livestock", "other"];
    const matchedCategory = validCategories.includes(category.toLowerCase()) ? category.toLowerCase() : "other";

    const question = await Question.create({
        user: req.user._id,
        title: title.trim(),
        body: body ? body.trim() : title.trim(),
        category: matchedCategory,
        status: "open",
    });

    sendSuccess(res, 201, "Question created successfully", { query: question });
});

const updateQueryStatus = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { type, kept, status, title, body, category } = req.body;

    if (type === "question" || (!type && (await Question.findById(id)))) {
        const q = await Question.findById(id);
        if (q) {
            if (kept !== undefined) q.status = kept ? "resolved" : "open";
            if (status !== undefined) {
                const validStatuses = ["open", "answered", "resolved", "closed"];
                if (validStatuses.includes(status)) q.status = status;
            }
            if (title) q.title = title.trim();
            if (body) q.body = body.trim();
            if (category) {
                const validCategories = ["disease", "crop-planning", "soil", "irrigation", "market", "equipment", "livestock", "other"];
                if (validCategories.includes(category.toLowerCase())) {
                    q.category = category.toLowerCase();
                }
            }
            await q.save();
            return sendSuccess(res, 200, "Query updated", { query: q });
        }
    }

    if (type === "advisory" || (!type && (await Advisory.findById(id)))) {
        const a = await Advisory.findById(id);
        if (a) {
            if (kept !== undefined) a.kept = kept === true;
            if (title) a.query = title.trim();
            if (body) a.response = body.trim();
            if (category) a.category = category.trim();
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
    createUser,
    updateUser,
    deleteUser,
    listDiseaseReports,
    updateDiseaseReport,
    listQueries,
    createQuery,
    updateQueryStatus,
    deleteQuery,
};
