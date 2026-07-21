const express = require("express");
const router = express.Router();

const {
    listUsers,
    updateUser,
    listDiseaseReports,
    updateDiseaseReport,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect, authorize("admin"));

router.get("/users", listUsers);
router.patch("/users/:id", updateUser);
router.get("/disease-reports", listDiseaseReports);
router.patch("/disease-reports/:id", updateDiseaseReport);

module.exports = router;
