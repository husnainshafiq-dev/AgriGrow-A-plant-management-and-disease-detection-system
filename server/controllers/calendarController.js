const CropCalendar = require("../models/CropCalendar");
const GeoField = require("../models/GeoField");
const Farm = require("../models/Farm");
const geminiService = require("../services/geminiService");
const asyncHandler = require("express-async-handler");
const { sendSuccess, sendError } = require("../utils/apiResponse");

// @desc    Get calendar events for user
// @route   GET /api/calendar
// @access  Private
const getEvents = asyncHandler(async (req, res) => {
    const { start, end, eventType } = req.query;
    const filter = { user: req.user._id };

    if (eventType) {
        filter.eventType = eventType;
    }

    if (start || end) {
        filter.startDate = {};
        if (start) filter.startDate.$gte = new Date(start);
        if (end) filter.startDate.$lte = new Date(end);
    }

    const events = await CropCalendar.find(filter)
        .populate("field", "name locationName")
        .populate("farm", "name")
        .sort({ startDate: 1 });

    sendSuccess(res, 200, "Calendar events retrieved successfully", events);
});

// @desc    Create new calendar event
// @route   POST /api/calendar
// @access  Private
const createEvent = asyncHandler(async (req, res) => {
    const eventData = {
        user: req.user._id,
        ...req.body
    };

    if (eventData.startDate) {
        eventData.startDate = new Date(eventData.startDate);
    }
    if (eventData.endDate) {
        eventData.endDate = new Date(eventData.endDate);
    }

    const event = await CropCalendar.create(eventData);
    sendSuccess(res, 201, "Calendar event created successfully", event);
});

// @desc    Update calendar event
// @route   PUT /api/calendar/:id
// @access  Private
const updateEvent = asyncHandler(async (req, res) => {
    const event = await CropCalendar.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id },
        req.body,
        { new: true, runValidators: true }
    );

    if (!event) {
        return sendError(res, 404, "Calendar event not found");
    }

    sendSuccess(res, 200, "Calendar event updated successfully", event);
});

// @desc    Delete calendar event
// @route   DELETE /api/calendar/:id
// @access  Private
const deleteEvent = asyncHandler(async (req, res) => {
    const event = await CropCalendar.findOneAndDelete({
        _id: req.params.id,
        user: req.user._id
    });

    if (!event) {
        return sendError(res, 404, "Calendar event not found");
    }

    sendSuccess(res, 200, "Calendar event deleted successfully", event);
});

// @desc    Mark calendar event completed
// @route   PATCH /api/calendar/:id/complete
// @access  Private
const completeEvent = asyncHandler(async (req, res) => {
    const { isCompleted } = req.body;
    const completedAt = isCompleted ? new Date() : null;

    const event = await CropCalendar.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id },
        { isCompleted, completedAt },
        { new: true }
    );

    if (!event) {
        return sendError(res, 404, "Calendar event not found");
    }

    sendSuccess(res, 200, "Event completion status updated", event);
});

// @desc    Get upcoming events for next 7 days
// @route   GET /api/calendar/upcoming
// @access  Private
const getUpcoming = asyncHandler(async (req, res) => {
    const today = new Date();
    const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const events = await CropCalendar.find({
        user: req.user._id,
        startDate: { $gte: today, $lte: sevenDaysLater },
        isCompleted: false
    })
    .populate("field", "name")
    .sort({ startDate: 1 });

    sendSuccess(res, 200, "Upcoming calendar events retrieved", events);
});

// @desc    Get due reminders
// @route   GET /api/calendar/reminders
// @access  Private
const getDueReminders = asyncHandler(async (req, res) => {
    const now = new Date();
    const upcomingRange = new Date(Date.now() + 24 * 60 * 60 * 1000); // Check within 24h

    // Retrieve uncompleted events
    const events = await CropCalendar.find({
        user: req.user._id,
        startDate: { $gte: now, $lte: upcomingRange },
        isCompleted: false
    }).populate("field", "name");

    // Filter events where (startDate - reminderBefore minutes) <= now
    const reminders = events.filter(event => {
        if (!event.reminderBefore) return false;
        const reminderTime = new Date(event.startDate.getTime() - event.reminderBefore * 60 * 1000);
        return reminderTime <= now;
    });

    sendSuccess(res, 200, "Active reminders retrieved", reminders);
});

// @desc    AI Generate crop calendar/schedule using Gemini
// @route   POST /api/calendar/generate
// @access  Private
const generateSchedule = asyncHandler(async (req, res) => {
    const { cropName, plantingDate, fieldId, farmId } = req.body;
    
    if (!cropName || !plantingDate) {
        return sendError(res, 400, "Please provide crop name and planting date");
    }

    const start = new Date(plantingDate);
    
    // Get contextual farm info if supplied
    let farmInfo = "";
    if (fieldId) {
        const field = await GeoField.findOne({ _id: fieldId, user: req.user._id });
        if (field) {
            farmInfo = `Field name: ${field.name}, soil type: ${field.soilType || "unknown"}, location: ${field.locationName || "unknown"}.`;
        }
    } else if (farmId) {
        const farm = await Farm.findOne({ _id: farmId, user: req.user._id });
        if (farm) {
            farmInfo = `Farm name: ${farm.name}, soil type: ${farm.soilType || "unknown"}, water source: ${farm.waterSource?.primary || "unknown"}.`;
        }
    }

    const prompt = `
You are AgriGrow AI, a professional agricultural scheduler. Create a complete, detailed task calendar for cultivating "${cropName}" starting from planting date ${start.toDateString()}.
Contextual information: ${farmInfo || "Regional farming conditions in Pakistan."}

Generate exactly 6 to 10 crop care calendar events including watering, fertilizing, pesticide application, inspection, and harvesting.
You must output ONLY valid JSON in this exact structure. Do not wrap in markdown or add explanations.

JSON format:
[
  {
    "title": "Watering fields",
    "eventType": "watering",
    "description": "Provide shallow irrigation for early roots",
    "daysAfterPlanting": 3,
    "priority": "high"
  },
  {
    "title": "Apply Nitrogen Fertilizer",
    "eventType": "fertilizer",
    "description": "Add Urea or NPK compound for vegetative growth",
    "daysAfterPlanting": 15,
    "priority": "medium"
  }
]

Allowed eventType values: "watering", "fertilizer", "pesticide", "harvest", "sowing", "soil-prep", "pruning", "inspection", "other".
`;

    try {
        const aiResponse = await geminiService.getAdvisory(prompt, {}, req.user._id);
        
        let cleanedText = aiResponse.text;
        // Strip markdown fences if present
        if (cleanedText.includes("```json")) {
            cleanedText = cleanedText.split("```json")[1].split("```")[0].trim();
        } else if (cleanedText.includes("```")) {
            cleanedText = cleanedText.split("```")[1].split("```")[0].trim();
        }

        const rawEvents = JSON.parse(cleanedText.trim());

        const parsedEvents = rawEvents.map(evt => {
            const eventDate = new Date(start);
            eventDate.setDate(eventDate.getDate() + (evt.daysAfterPlanting || 0));

            return {
                title: evt.title,
                eventType: evt.eventType || "other",
                description: evt.description || "",
                cropName,
                startDate: eventDate,
                endDate: eventDate,
                priority: evt.priority || "medium",
                isAllDay: true,
                field: fieldId || null,
                farm: farmId || null
            };
        });

        sendSuccess(res, 200, "AI schedule generated successfully", parsedEvents);
    } catch (err) {
        console.error("Gemini calendar generation failed:", err);
        return sendError(res, 500, "Failed to generate calendar events using AI. Please add events manually.");
    }
});

module.exports = {
    getEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    completeEvent,
    getUpcoming,
    getDueReminders,
    generateSchedule
};
