const WeatherAlert = require("../models/WeatherAlert");
const GeoField = require("../models/GeoField");
const weatherAlertService = require("../services/weatherAlertService");
const asyncHandler = require("express-async-handler");
const { sendSuccess, sendError } = require("../utils/apiResponse");

// @desc    Get user's active weather alerts
// @route   GET /api/weather/alerts
// @access  Private
const getAlerts = asyncHandler(async (req, res) => {
    const filter = { user: req.user._id, isDismissed: false };
    
    if (req.query.fieldId) {
        filter.field = req.query.fieldId;
    }
    if (req.query.isRead !== undefined) {
        filter.isRead = req.query.isRead === "true";
    }
    if (req.query.severity) {
        filter.severity = req.query.severity;
    }

    const alerts = await WeatherAlert.find(filter)
        .populate("field", "name locationName")
        .sort({ createdAt: -1 });

    sendSuccess(res, 200, "Weather alerts retrieved successfully", alerts);
});

// @desc    Get alerts for a specific field
// @route   GET /api/weather/alerts/field/:fieldId
// @access  Private
const getFieldAlerts = asyncHandler(async (req, res) => {
    const alerts = await WeatherAlert.find({
        user: req.user._id,
        field: req.params.fieldId,
        isDismissed: false
    }).sort({ createdAt: -1 });

    sendSuccess(res, 200, "Field weather alerts retrieved", alerts);
});

// @desc    Mark alert as read
// @route   PATCH /api/weather/alerts/:id/read
// @access  Private
const markRead = asyncHandler(async (req, res) => {
    const alert = await WeatherAlert.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id },
        { isRead: true },
        { new: true }
    );

    if (!alert) {
        return sendError(res, 404, "Alert not found");
    }

    sendSuccess(res, 200, "Alert marked as read", alert);
});

// @desc    Dismiss alert
// @route   PATCH /api/weather/alerts/:id/dismiss
// @access  Private
const dismissAlert = asyncHandler(async (req, res) => {
    const alert = await WeatherAlert.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id },
        { isDismissed: true },
        { new: true }
    );

    if (!alert) {
        return sendError(res, 404, "Alert not found");
    }

    sendSuccess(res, 200, "Alert dismissed successfully", alert);
});

// @desc    Trigger checking of weather alerts for all saved fields of the user
// @route   POST /api/weather/alerts/check
// @access  Private
const checkAlerts = asyncHandler(async (req, res) => {
    const fields = await GeoField.find({ user: req.user._id, isActive: true });
    
    if (!fields || fields.length === 0) {
        return sendSuccess(res, 200, "No fields found to check alerts for", []);
    }

    const createdAlerts = [];

    for (const field of fields) {
        try {
            const triggered = await weatherAlertService.checkFieldWeather(field);
            
            for (const alertData of triggered) {
                // Check if alert of same type was created in last 24h to prevent duplicates
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const existing = await WeatherAlert.findOne({
                    field: field._id,
                    alertType: alertData.alertType,
                    createdAt: { $gte: oneDayAgo },
                    isDismissed: false
                });

                if (!existing) {
                    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // Expires in 48 hours
                    const alert = await WeatherAlert.create({
                        user: req.user._id,
                        field: field._id,
                        expiresAt,
                        ...alertData
                    });
                    createdAlerts.push(alert);
                }
            }
        } catch (err) {
            console.error(`Alert check failed for field ${field.name}:`, err);
        }
    }

    sendSuccess(res, 200, `${createdAlerts.length} new weather alerts triggered`, createdAlerts);
});

module.exports = {
    getAlerts,
    getFieldAlerts,
    markRead,
    dismissAlert,
    checkAlerts
};
