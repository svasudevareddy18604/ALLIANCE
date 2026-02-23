const express = require("express");
const router = express.Router();
const db = require("../db");
const { spawnSync } = require("child_process");

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
   GET ALL SURVEYS (COUNTS CORRECT)
================================================== */
router.get("/surveys", requireFaculty, async (req, res) => {
  try {
    const facultyId = req.session.faculty.id;

    const [rows] = await db.query(
      `
      SELECT 
        s.id AS survey_id,
        s.title,
        s.status,
        COUNT(DISTINCT sr.student_id) AS answered_count,
        (
          SELECT COUNT(*)
          FROM mentors m
          JOIN students st
            ON st.course = m.course
           AND st.section = m.section
          WHERE m.faculty_id = s.faculty_id
        ) - COUNT(DISTINCT sr.student_id) AS not_answered_count
      FROM surveys s
      LEFT JOIN survey_responses sr 
        ON sr.survey_id = s.id
      WHERE s.faculty_id = ?
      GROUP BY s.id
      ORDER BY s.created_at DESC
      `,
      [facultyId]
    );

    res.json(rows);
  } catch (err) {
    console.error("LOAD SURVEYS ERROR:", err);
    res.status(500).json({ error: "Failed to load surveys" });
  }
});

/* ==================================================
   GET SINGLE SURVEY (NO DUPLICATES, NO SQL ERRORS)
================================================== */
router.get("/surveys/:surveyId", requireFaculty, async (req, res) => {
  try {
    const surveyId = req.params.surveyId;
    const facultyId = req.session.faculty.id;

    /* ---------- SURVEY ---------- */
    const [[survey]] = await db.query(
      `
      SELECT id, title, status
      FROM surveys
      WHERE id = ? AND faculty_id = ?
      `,
      [surveyId, facultyId]
    );

    if (!survey) {
      return res.status(404).json({ error: "Survey not found" });
    }

    /* ---------- QUESTIONS ---------- */
    const [questions] = await db.query(
      `
      SELECT id, question_text, question_type, feature_name
      FROM survey_questions
      WHERE survey_id = ?
      `,
      [surveyId]
    );

    /* ==================================================
       ANSWERED STUDENTS (CORRECT LOGIC)
    ================================================== */
    const [answered] = await db.query(
      `
      SELECT 
        st.id AS student_id,
        st.full_name AS name,
        st.section,
        CASE 
          WHEN se.student_id IS NULL THEN 'NOT_EVALUATED'
          ELSE 'EVALUATED'
        END AS evaluation_status,
        se.risk_level,
        se.confidence
      FROM (
        SELECT DISTINCT student_id
        FROM survey_responses
        WHERE survey_id = ?
      ) r
      JOIN students st 
        ON st.id = r.student_id
      JOIN mentors m
        ON m.course = st.course
       AND m.section = st.section
      LEFT JOIN survey_evaluation se
        ON se.student_id = st.id
       AND se.submission_id = ?
      WHERE m.faculty_id = ?
      ORDER BY st.full_name
      `,
      [surveyId, surveyId, facultyId]
    );

    /* ==================================================
       NOT ANSWERED STUDENTS
    ================================================== */
    const [notAnswered] = await db.query(
      `
      SELECT 
        st.id AS student_id,
        st.full_name AS name,
        st.section
      FROM mentors m
      JOIN students st
        ON st.course = m.course
       AND st.section = m.section
      WHERE m.faculty_id = ?
        AND st.id NOT IN (
          SELECT DISTINCT student_id
          FROM survey_responses
          WHERE survey_id = ?
        )
      ORDER BY st.full_name
      `,
      [facultyId, surveyId]
    );

    res.json({ survey, questions, answered, notAnswered });
  } catch (err) {
    console.error("SURVEY LOAD ERROR:", err);
    res.status(500).json({ error: "Failed to load survey" });
  }
});

/* ==================================================
   UPDATE SURVEY STATUS
================================================== */
router.patch("/surveys/:surveyId/status", requireFaculty, async (req, res) => {
  const { surveyId } = req.params;
  const { status } = req.body;
  const facultyId = req.session.faculty.id;

  if (!["DRAFT", "ACTIVE", "PUBLISHED"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const [r] = await db.query(
      `
      UPDATE surveys
      SET status = ?
      WHERE id = ? AND faculty_id = ?
      `,
      [status, surveyId, facultyId]
    );

    if (!r.affectedRows) {
      return res.status(404).json({ error: "Survey not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("STATUS UPDATE ERROR:", err);
    res.status(500).json({ error: "Status update failed" });
  }
});

/* =========================
   PYTHON ML RUNNER
========================= */
function runPrediction(features) {
  const py = spawnSync(
    "python",
    ["ai/predict_hybrid.py", JSON.stringify(features)],
    { encoding: "utf-8" }
  );

  if (py.error) throw new Error("Python execution failed");
  if (!py.stdout || !py.stdout.trim()) throw new Error("Empty Python output");

  return JSON.parse(py.stdout.trim());
}

/* ==================================================
   EVALUATE SINGLE STUDENT
================================================== */
router.post("/evaluate-survey/:studentId", requireFaculty, async (req, res) => {
  const studentId = req.params.studentId;
  const surveyId = req.query.surveyId;
  const facultyId = req.session.faculty.id;

  if (!surveyId) {
    return res.status(400).json({ error: "surveyId missing" });
  }

  try {
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

    const [responses] = await db.query(
      `
      SELECT sq.feature_name, sq.question_type, sr.answer_text
      FROM survey_responses sr
      JOIN survey_questions sq 
        ON sq.id = sr.question_id
      WHERE sr.survey_id = ?
        AND sr.student_id = ?
      `,
      [surveyId, studentId]
    );

    if (!responses.length) {
      return res.status(404).json({ error: "No responses found" });
    }

    const features = {};
    for (const r of responses) {
      features[r.feature_name] =
        r.question_type === "numeric"
          ? Number(r.answer_text)
          : r.answer_text;
    }

    const { prediction, confidence } = runPrediction(features);

    await db.query(
      `
      INSERT INTO survey_evaluation
        (student_id, submission_id, risk_level, confidence, evaluated_at)
      VALUES (?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        risk_level = VALUES(risk_level),
        confidence = VALUES(confidence),
        evaluated_at = NOW()
      `,
      [studentId, surveyId, prediction, confidence]
    );

    res.json({ success: true, prediction, confidence });
  } catch (err) {
    console.error("EVALUATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ==================================================
   EVALUATE ALL STUDENTS
================================================== */
router.post("/evaluate-survey-all/:surveyId", requireFaculty, async (req, res) => {
  const surveyId = req.params.surveyId;
  const facultyId = req.session.faculty.id;

  try {
    const [students] = await db.query(
      `
      SELECT DISTINCT student_id
      FROM survey_responses
      WHERE survey_id = ?
      `,
      [surveyId]
    );

    for (const { student_id } of students) {
      const [responses] = await db.query(
        `
        SELECT sq.feature_name, sq.question_type, sr.answer_text
        FROM survey_responses sr
        JOIN survey_questions sq 
          ON sq.id = sr.question_id
        WHERE sr.survey_id = ?
          AND sr.student_id = ?
        `,
        [surveyId, student_id]
      );

      if (!responses.length) continue;

      const features = {};
      for (const r of responses) {
        features[r.feature_name] =
          r.question_type === "numeric"
            ? Number(r.answer_text)
            : r.answer_text;
      }

      const { prediction, confidence } = runPrediction(features);

      await db.query(
        `
        INSERT INTO survey_evaluation
          (student_id, submission_id, risk_level, confidence, evaluated_at)
        VALUES (?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          risk_level = VALUES(risk_level),
          confidence = VALUES(confidence),
          evaluated_at = NOW()
        `,
        [student_id, surveyId, prediction, confidence]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("BULK EVALUATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
