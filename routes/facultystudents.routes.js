const express = require("express");
const db = require("../db");

const router = express.Router();

/* =========================
   FACULTY → MY STUDENTS
========================= */
router.get("/", async (req, res) => {
    try {
        /* ---------- AUTH CHECK ---------- */
        if (!req.session || !req.session.faculty) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const facultyId = req.session.faculty.id;

        /* ---------- CHECK MENTOR ASSIGNMENT ---------- */
        const mentorSql = `
            SELECT course, section
            FROM mentors
            WHERE faculty_id = ?
        `;

        const [mentorRows] = await db.query(mentorSql, [facultyId]);

        // CASE 1: Faculty not assigned as mentor at all
        if (mentorRows.length === 0) {
            return res.json([]); // frontend shows "No students allocated"
        }

        /* ---------- FETCH STUDENTS ---------- */
        const studentsSql = `
            SELECT
                s.id,
                s.register_no,
                s.full_name,
                s.course,
                s.section,
                s.email,
                s.phone,
                s.profile_image
            FROM students s
            INNER JOIN mentors m
                ON s.course = m.course
               AND s.section = m.section
            WHERE m.faculty_id = ?
              AND s.status = 'ACTIVE'
            ORDER BY s.full_name ASC
        `;

        const [students] = await db.query(studentsSql, [facultyId]);

        // Always return array (never undefined / null)
        return res.json(students);

    } catch (err) {
        console.error("Faculty Students Error:", err);
        return res.status(500).json({ error: "Database error" });
    }
});

module.exports = router;
