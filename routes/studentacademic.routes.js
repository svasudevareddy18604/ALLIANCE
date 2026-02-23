const express = require("express");
const db = require("../db");

const router = express.Router();

/* =========================
   STUDENT AUTH MIDDLEWARE
========================= */
function studentAuth(req, res, next) {
    if (!req.session || !req.session.student) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

/* =========================
   SAFE JSON PARSE
========================= */
function safeParse(value) {
    if (!value) return {};
    if (typeof value === "object") return value;

    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch (err) {
            console.error("Corrupt row_data:", value);
            return {};
        }
    }
    return {};
}

/* =========================
   GET STUDENT ACADEMIC MARKS
========================= */
router.get("/academic-marks", studentAuth, async (req, res) => {
    try {
        const registerNo = req.session.student.register_no;

        const [rows] = await db.query(
            `
            SELECT
                id,
                subject_code,
                subject_name,
                semester,
                exam_phase,
                row_data,
                uploaded_at
            FROM academic_uploads
            WHERE register_number = ?
            ORDER BY semester, subject_code, uploaded_at DESC
            `,
            [registerNo]
        );

        const result = rows.map(r => {
            const parsed = safeParse(r.row_data);

            return {
                id: r.id,
                subject_code: r.subject_code,
                subject_name: r.subject_name,
                semester: r.semester,
                exam_phase: r.exam_phase,
                uploaded_at: r.uploaded_at,
                ...parsed
            };
        });

        res.json(result);

    } catch (err) {
        console.error("STUDENT ACADEMIC FETCH ERROR:", err);
        res.status(500).json({ error: "Failed to fetch academic data" });
    }
});

module.exports = router;
