const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");

const router = express.Router();

/* =========================
   STUDENT LOGIN
========================= */
router.post("/login", async (req, res) => {
    try {
        const { register_no, password } = req.body;

        if (!register_no || !password) {
            return res.status(400).json({
                error: "Registration number and password are required"
            });
        }

        const [rows] = await db.query(
            "SELECT * FROM students WHERE register_no = ? AND status = 'ACTIVE'",
            [register_no]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                error: "Invalid registration number or password"
            });
        }

        const student = rows[0];

        const match = await bcrypt.compare(password, student.password);
        if (!match) {
            return res.status(401).json({
                error: "Invalid registration number or password"
            });
        }

        // ✅ SET SESSION
        req.session.student = {
            id: student.id,
            register_no: student.register_no,
            name: student.full_name,
            course: student.course,
            section: student.section,
            profile_image: student.profile_image || null
        };

        req.session.save(() => {
            res.json({ success: true });
        });

    } catch (err) {
        console.error("STUDENT LOGIN ERROR:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* =========================
   STUDENT DASHBOARD PROFILE
   (USED BY studentdashboard.html)
========================= */
router.get("/dashboard/profile", (req, res) => {
    if (!req.session.student) {
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    res.json({
        name: req.session.student.name,
        register_no: req.session.student.register_no,
        section: req.session.student.section,
        profile_image: req.session.student.profile_image
    });
});

/* =========================
   STUDENT LOGOUT
========================= */
router.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("LOGOUT ERROR:", err);
        }
        res.redirect("/");
    });
});

module.exports = router;
