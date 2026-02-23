const express = require("express");
const db = require("../db");
const Groq = require("groq-sdk");

const router = express.Router();

/* ================= GROQ CLIENT ================= */
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

/* ================= AUTH ================= */
router.use((req, res, next) => {
  if (!req.session?.faculty) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

/* =====================================================
   HELPER: QUALITATIVE CONVERSION
===================================================== */
function qualitativeLevel(value) {
  if (value === null || value === undefined) return "No data available";
  const num = Number(value);
  if (Number.isNaN(num)) return "No data available";

  if (num <= 2) return "Needs significant improvement";
  if (num <= 4) return "Needs improvement";
  if (num <= 6) return "Satisfactory";
  if (num <= 8) return "Good";
  return "Strong";
}

/* =====================================================
   1. FEEDBACK LIST (RETURNS feedback_id ✅)
===================================================== */
router.get("/", async (req, res) => {
  const facultyId = req.session.faculty.id;

  const [rows] = await db.query(`
    SELECT 
      s.id AS student_id,
      s.full_name,
      s.register_no,
      f.id AS feedback_id,
      f.feedback_text,
      f.generated_at
    FROM mentors m
    JOIN students s
      ON s.course = m.course
     AND s.section = m.section
    LEFT JOIN student_feedback f
      ON f.student_id = s.id
    WHERE m.faculty_id = ?
    ORDER BY s.full_name
  `, [facultyId]);

  res.json(rows);
});

/* =====================================================
   2. SINGLE FEEDBACK VIEW (BY feedback_id ✅ FIX)
===================================================== */
router.get("/:feedbackId", async (req, res) => {
  const facultyId = req.session.faculty.id;
  const feedbackId = req.params.feedbackId;

  const [[row]] = await db.query(`
    SELECT
      f.id AS feedback_id,
      f.feedback_text,
      f.generated_at,
      s.id AS student_id,
      s.full_name,
      s.register_no
    FROM student_feedback f
    JOIN students s ON s.id = f.student_id
    JOIN mentors m
      ON s.course = m.course
     AND s.section = m.section
    WHERE m.faculty_id = ?
      AND f.id = ?
  `, [facultyId, feedbackId]);

  if (!row) {
    return res.status(404).json({ error: "Feedback not found" });
  }

  res.json({
    feedback_id: row.feedback_id,
    feedback_text: row.feedback_text,
    generated_at: row.generated_at,
    student: {
      id: row.student_id,
      full_name: row.full_name,
      register_no: row.register_no
    }
  });
});

/* =====================================================
   3. GENERATE FEEDBACK (STUDENT BASED – UNCHANGED)
===================================================== */
router.post("/generate/:studentId", async (req, res) => {
  const facultyId = req.session.faculty.id;
  const studentId = req.params.studentId;

  const [[allowed]] = await db.query(`
    SELECT 1
    FROM mentors m
    JOIN students s
      ON s.course = m.course
     AND s.section = m.section
    WHERE m.faculty_id = ?
      AND s.id = ?
  `, [facultyId, studentId]);

  if (!allowed) {
    return res.status(403).json({ error: "Access denied" });
  }

  const data = await collectStudentData(studentId);
  const feedback = await generateAIFeedback(data);

  await saveFeedback(studentId, feedback, facultyId);

  res.json({ success: true });
});

/* ================= DATA COLLECTION ================= */
async function collectStudentData(studentId) {
  const [[academicRow]] = await db.query(`
    SELECT row_data
    FROM academic_uploads
    WHERE register_number = (
      SELECT register_no FROM students WHERE id = ?
    )
    ORDER BY uploaded_at DESC
    LIMIT 1
  `, [studentId]);

  let academic = "No academic data available";

  if (academicRow?.row_data) {
    const raw =
      typeof academicRow.row_data === "string"
        ? JSON.parse(academicRow.row_data)
        : academicRow.row_data;

    academic = {
      core_exam_understanding: qualitativeLevel(raw?._features?.core_exam_score),
      engagement_consistency: qualitativeLevel(raw?._features?.engagement_score),
      continuous_assessment: qualitativeLevel(raw?._features?.continuous_assessment_score),
      assignment_participation: qualitativeLevel(raw?.assignment),
      class_test_preparedness: qualitativeLevel(raw?.class_test),
      microproject_involvement: qualitativeLevel(raw?.microproject),
      presentation_effectiveness: qualitativeLevel(raw?.presentation)
    };
  }

  const [[survey]] = await db.query(`
    SELECT confidence
    FROM survey_evaluation
    WHERE student_id = ?
    ORDER BY evaluated_at DESC
    LIMIT 1
  `, [studentId]);

  const [[video]] = await db.query(`
    SELECT posture, nervousness, stress
    FROM student_videos sv
    JOIN video_analysis va ON va.video_id = sv.id
    WHERE sv.student_id = ?
    ORDER BY va.created_at DESC
    LIMIT 1
  `, [studentId]);

  const [[overall]] = await db.query(`
    SELECT overall_level
    FROM overall_performance
    WHERE student_id = ?
    ORDER BY generated_at DESC
    LIMIT 1
  `, [studentId]);

  return {
    academic,
    survey: survey || "No survey data available",
    video: video || "No video data available",
    overall: overall?.overall_level || "No overall performance data available"
  };
}

/* ================= PROMPT (UNCHANGED) ================= */
function buildPrompt(d) {
  return `
You are a university academic evaluator.

STRICT RULES:
- Do NOT mention marks or numeric scores.
- Write ONLY about Academic, Survey, Video, and Overall Performance.
- Clearly state strengths, weaknesses, and improvement actions.
- Maintain professional academic tone.
- Explicitly mention missing data.

DATA:

ACADEMIC:
${JSON.stringify(d.academic, null, 2)}

SURVEY:
${JSON.stringify(d.survey, null, 2)}

VIDEO:
${JSON.stringify(d.video, null, 2)}

OVERALL:
${d.overall}
`;
}

/* ================= AI ================= */
async function generateAIFeedback(data) {
  const res = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    temperature: 0.1,
    messages: [
      { role: "system", content: "Professional academic feedback generator." },
      { role: "user", content: buildPrompt(data) }
    ]
  });

  return res.choices[0].message.content.trim();
}

/* ================= SAVE ================= */
async function saveFeedback(studentId, feedback, facultyId) {
  await db.query(`
    INSERT INTO student_feedback (student_id, feedback_text, generated_by)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      feedback_text = VALUES(feedback_text),
      generated_by = VALUES(generated_by),
      generated_at = NOW()
  `, [studentId, feedback, facultyId]);
}

module.exports = router;
