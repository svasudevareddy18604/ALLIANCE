const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================
   AUTH GUARD
========================= */
function requireFaculty(req, res, next) {
  if (!req.session || !req.session.faculty) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/* ==================================================
   GET STUDENT ANSWERS FOR A SURVEY
================================================== */
router.get(
  "/surveys/:surveyId/student/:studentId/answers",
  requireFaculty,
  async (req, res) => {
    try {
      const { surveyId, studentId } = req.params;
      const facultyId = req.session.faculty.id;

      /* ----- ALLOCATION CHECK ----- */
      const [[allowed]] = await db.query(
        `
        SELECT 1
        FROM mentors m
        JOIN students st
          ON st.course = m.course
         AND st.section = m.section
        WHERE m.faculty_id = ?
          AND st.id = ?
        `,
        [facultyId, studentId]
      );

      if (!allowed) {
        return res.status(403).json({ error: "Access denied" });
      }

      /* ----- FETCH ANSWERS ----- */
      const [rows] = await db.query(
        `
        SELECT 
          sq.question_text,
          sr.answer_text
        FROM survey_responses sr
        JOIN survey_questions sq
          ON sq.id = sr.question_id
        WHERE sr.survey_id = ?
          AND sr.student_id = ?
        ORDER BY sq.id
        `,
        [surveyId, studentId]
      );

      res.json(rows);
    } catch (err) {
      console.error("STUDENT ANSWERS ERROR:", err);
      res.status(500).json({ error: "Failed to load answers" });
    }
  }
);

module.exports = router;
