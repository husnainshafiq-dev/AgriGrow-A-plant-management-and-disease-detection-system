const express = require("express");
const { getAlerts, getFieldAlerts, markRead, dismissAlert, checkAlerts } = require("../controllers/weatherAlertController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.route("/alerts")
    .get(protect, getAlerts);

router.route("/alerts/field/:fieldId")
    .get(protect, getFieldAlerts);

router.route("/alerts/:id/read")
    .patch(protect, markRead);

router.route("/alerts/:id/dismiss")
    .patch(protect, dismissAlert);

router.route("/alerts/check")
    .post(protect, checkAlerts);

module.exports = router;
