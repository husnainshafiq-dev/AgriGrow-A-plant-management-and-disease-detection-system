const express = require("express");
const { getEvents, createEvent, updateEvent, deleteEvent, completeEvent, getUpcoming, getDueReminders, generateSchedule } = require("../controllers/calendarController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.use(protect); // All calendar endpoints require authentication

router.route("/")
    .get(getEvents)
    .post(createEvent);

router.route("/upcoming")
    .get(getUpcoming);

router.route("/reminders")
    .get(getDueReminders);

router.route("/generate")
    .post(generateSchedule);

router.route("/:id")
    .put(updateEvent)
    .delete(deleteEvent);

router.route("/:id/complete")
    .patch(completeEvent);

module.exports = router;
