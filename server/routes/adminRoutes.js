const express = require("express");
const router = express.Router();

const {
    listUsers,
    updateUser,
    listDiseaseReports,
    updateDiseaseReport,
    listQueries,
    updateQueryStatus,
    deleteQuery,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/auth");

router.use(protect, authorize("admin"));

router.get("/users", listUsers);
router.patch("/users/:id", updateUser);
router.get("/disease-reports", listDiseaseReports);
router.patch("/disease-reports/:id", updateDiseaseReport);

router.get("/queries", listQueries);
router.patch("/queries/:id", updateQueryStatus);
router.delete("/queries/:id", deleteQuery);

module.exports = router;
