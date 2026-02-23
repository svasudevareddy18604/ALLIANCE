const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================
   FACULTY AUTH
========================= */
function facultyAuth(req, res, next) {
  if (!req.session || !req.session.faculty) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

/* =========================
   CREATE SURVEY
========================= */
router.post("/surveys/create", facultyAuth, async (req, res) => {
  try {
    console.log("🚀 CREATE SURVEY HIT");

    const { title, questions } = req.body;
    if (!title || !Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ message: "Invalid survey data" });
    }

    const facultyId = req.session.faculty.id;

    /* GET SECTION */
    const [mentorRows] = await db.query(
      "SELECT section FROM mentors WHERE faculty_id = ?",
      [facultyId]
    );

    if (!mentorRows.length) {
      return res.status(400).json({ message: "Faculty not assigned section" });
    }

    const section = mentorRows[0].section;

    /* INSERT SURVEY */
    const [surveyRes] = await db.query(
      `INSERT INTO surveys (faculty_id, section, title, status)
       VALUES (?, ?, ?, 'DRAFT')`,
      [facultyId, section, title]
    );

    const surveyId = surveyRes.insertId;

    const ALLOWED_TYPES = ["likert", "yesno", "numeric", "mcq"];

    /* INSERT QUESTIONS */
    for (const q of questions) {
      if (!q.text || !q.feature || !ALLOWED_TYPES.includes(q.type)) {
        return res.status(400).json({ message: "Invalid question format" });
      }

      const [qRes] = await db.query(
        `INSERT INTO survey_questions
         (survey_id, question_text, feature_name, question_type)
         VALUES (?, ?, ?, ?)`,
        [surveyId, q.text, q.feature, q.type]
      );

      if (q.type === "mcq") {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          return res.status(400).json({ message: "MCQ must have at least 2 options" });
        }

        for (const opt of q.options) {
          await db.query(
            `INSERT INTO survey_options (question_id, option_text)
             VALUES (?, ?)`,
            [qRes.insertId, opt]
          );
        }
      }
    }

    res.json({
      message: "Survey created successfully",
      survey_id: surveyId
    });

  } catch (err) {
    console.error("CREATE SURVEY ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
