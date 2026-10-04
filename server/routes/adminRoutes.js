const express = require("express");
const router = express.Router();

const {
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
} = require("../controllers/adminController");
const { protect, authorize } = require("../middleware/auth");

// Apply authentication to all admin routes
router.use(protect);

// ── User Management (Restricted to Superadmin & Admin) ───────
router.get("/users", authorize("admin", "superadmin"), listUsers);
router.post("/users", authorize("admin", "superadmin"), createUser);
router.patch("/users/:id", authorize("admin", "superadmin"), updateUser);
router.delete("/users/:id", authorize("admin", "superadmin"), deleteUser);

// ── Disease Reports Moderation (Accessible to Editor, Admin, Superadmin) ─
router.get("/disease-reports", authorize("editor", "admin", "superadmin"), listDiseaseReports);
router.patch("/disease-reports/:id", authorize("editor", "admin", "superadmin"), updateDiseaseReport);

// ── User Queries Moderation & Editing (Accessible to Editor, Admin, Superadmin) ─
router.get("/queries", authorize("editor", "admin", "superadmin"), listQueries);
router.post("/queries", authorize("editor", "admin", "superadmin"), createQuery);
router.patch("/queries/:id", authorize("editor", "admin", "superadmin"), updateQueryStatus);
router.delete("/queries/:id", authorize("editor", "admin", "superadmin"), deleteQuery);

module.exports = router;
