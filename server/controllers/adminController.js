const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const Disease = require("../models/Disease");
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

module.exports = {
    listUsers,
    updateUser,
    listDiseaseReports,
    updateDiseaseReport,
};
