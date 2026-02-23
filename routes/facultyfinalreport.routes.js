const express = require("express");
const db = require("../db");
const { spawnSync } = require("child_process");
const path = require("path");

const router = express.Router();

/* =========================
   AUTH GUARD (FACULTY)
========================= */
router.use((req, res, next) => {
  if (!req.session || !req.session.faculty) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

/* =========================
   HELPER: WEIGHTED LOGIC
========================= */
function calculateOverall(academic, survey, video) {
  const score = 0.5 * academic + 0.25 * survey + 0.25 * video;

  let level = "Poor";
  if (score >= 0.8) level = "Excellent";
  else if (score >= 0.65) level = "Good";
  else if (score >= 0.5) level = "Average";

  return {
    overall_level: level,
    overall_confidence: Number(score.toFixed(3))
  };
}

/* ==================================================
   GET OVERALL REPORT (READ ONLY – FAST)
================================================== */
router.get("/overall", async (req, res) => {
  try {
    const facultyId = req.session.faculty.id;

    const [rows] = await db.query(
      `
      SELECT s.full_name AS student_name,
             s.register_no AS register_number,
             o.academic_confidence,
             o.survey_confidence,
             o.video_confidence,
             o.overall_level,
             o.overall_confidence
      FROM overall_performance o
      JOIN students s ON s.id = o.student_id
      WHERE o.generated_by = ?
      ORDER BY s.full_name
      `,
      [facultyId]
    );

    res.json(rows);
  } catch (err) {
    console.error("LOAD REPORT ERROR:", err);
    res.status(500).json({ error: "Failed to load report" });
  }
});

/* ==================================================
   GENERATE OVERALL REPORT (WRITE ONCE)
================================================== */
router.post("/overall/generate", async (req, res) => {
  try {
    const facultyId = req.session.faculty.id;

    /* DELETE OLD REPORT FOR THIS FACULTY */
    await db.query(
      "DELETE FROM overall_performance WHERE generated_by = ?",
      [facultyId]
    );

    /* GET ALLOCATED STUDENTS */
    const [students] = await db.query(
      `
      SELECT s.id, s.full_name, s.register_no
      FROM mentors m
      INNER JOIN students s
        ON s.course = m.course
       AND s.section = m.section
      WHERE m.faculty_id = ?
      ORDER BY s.full_name
      `,
      [facultyId]
    );

    for (const s of students) {

      /* ===== ACADEMIC ===== */
      const [[acad]] = await db.query(
        `
        SELECT row_data
        FROM academic_uploads
        WHERE register_number = ?
        ORDER BY uploaded_at DESC
        LIMIT 1
        `,
        [s.register_no]
      );

      let academic_confidence = 0;
      if (acad?.row_data) {
        const d = typeof acad.row_data === "string"
          ? JSON.parse(acad.row_data)
          : acad.row_data;

        academic_confidence =
          Number(d?._features?.overall_percentage || 0) / 100;
      }

      /* ===== SURVEY ===== */
      const [[survey]] = await db.query(
        `
        SELECT confidence
        FROM survey_evaluation
        WHERE student_id = ?
        ORDER BY evaluated_at DESC
        LIMIT 1
        `,
        [s.id]
      );

      const survey_confidence = Number(survey?.confidence || 0);

      /* ===== VIDEO ===== */
      const [[video]] = await db.query(
        `
        SELECT va.confidence_score
        FROM video_analysis va
        JOIN student_videos sv ON sv.id = va.video_id
        WHERE sv.student_id = ?
        ORDER BY va.created_at DESC
        LIMIT 1
        `,
        [s.id]
      );

      const video_confidence =
        Number(video?.confidence_score || 0) / 100;

      /* ===== FINAL SCORE ===== */
      const finalResult = calculateOverall(
        academic_confidence,
        survey_confidence,
        video_confidence
      );

      /* ===== OPTIONAL ML CALL ===== */
      spawnSync(
        "python",
        [
          path.join(__dirname, "..", "ai", "predict_overall.py"),
          JSON.stringify({
            academic_confidence,
            survey_confidence,
            video_confidence
          })
        ],
        { encoding: "utf-8" }
      );

      /* ===== SAVE ===== */
      await db.query(
        `
        INSERT INTO overall_performance
        (student_id, academic_confidence, survey_confidence,
         video_confidence, overall_level, overall_confidence, generated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          s.id,
          academic_confidence,
          survey_confidence,
          video_confidence,
          finalResult.overall_level,
          finalResult.overall_confidence,
          facultyId
        ]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("GENERATE REPORT ERROR:", err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

module.exports = router;
