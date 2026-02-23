const express = require("express");
const db = require("../db");
const { spawnSync } = require("child_process");

const router = express.Router();

/* =========================
   AUTH GUARD (STUDENT)
========================= */
router.use((req, res, next) => {
  if (!req.session || !req.session.student) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

/* =========================
   STUDENT ACADEMIC REPORT (ML)
========================= */
router.get("/academic", async (req, res) => {
  try {
    const registerNo = req.session.student.register_no;

    const [rows] = await db.query(
      `
      SELECT subject_code, subject_name,
             semester, exam_phase, row_data
      FROM academic_uploads
      WHERE register_number = ?
      ORDER BY semester DESC
      `,
      [registerNo]
    );

    const result = [];

    for (const r of rows) {
      const rowData =
        typeof r.row_data === "string"
          ? JSON.parse(r.row_data)
          : r.row_data;

      let prediction = null;
      let confidence = null;

      if (rowData && rowData._features) {
        const py = spawnSync(
          "python",
          ["ai/predict_academic.py", JSON.stringify(rowData._features)],
          { encoding: "utf-8" }
        );

        if (!py.error && py.stdout) {
          try {
            const out = JSON.parse(py.stdout);
            prediction = out.prediction ?? null;
            confidence = out.confidence ?? null;
          } catch {}
        }
      }

      result.push({
        subject_code: r.subject_code,
        subject_name: r.subject_name,
        semester: r.semester,
        exam_phase: r.exam_phase,
        mse: rowData?.mse ?? null,
        assignment: rowData?.assignment ?? null,
        class_test: rowData?.class_test ?? null,
        microproject: rowData?.microproject ?? null,
        presentation: rowData?.presentation ?? null,
        prediction,
        confidence,
        overall_percentage: rowData?._features?.overall_percentage ?? null,
        engagement_score: rowData?._features?.engagement_score ?? null
      });
    }

    res.json(result);

  } catch (err) {
    console.error("STUDENT ACADEMIC REPORT ERROR:", err);
    res.status(500).json({ error: "Failed to load academic report" });
  }
});

/* =========================
   STUDENT SURVEY EVALUATION
========================= */
router.get("/survey", async (req, res) => {
  try {
    const studentId = req.session.student.id;

    const [[row]] = await db.query(
      `
      SELECT risk_level, evaluated_at, confidence
      FROM survey_evaluation
      WHERE student_id = ?
      ORDER BY evaluated_at DESC
      LIMIT 1
      `,
      [studentId]
    );

    if (!row) return res.json({});

    res.json(row);

  } catch (err) {
    console.error("STUDENT SURVEY REPORT ERROR:", err);
    res.status(500).json({ error: "Failed to load survey evaluation" });
  }
});

/* =========================
   STUDENT VIDEO ANALYSIS REPORT
========================= */
router.get("/video", async (req, res) => {
  try {
    const studentId = req.session.student.id;

    const [rows] = await db.query(
      `
      SELECT va.eye_contact_ratio, va.head_movement,
             va.posture, va.nervousness, va.stress,
             va.confidence_score, va.created_at
      FROM video_analysis va
      JOIN student_videos v ON va.video_id = v.id
      WHERE v.student_id = ?
      ORDER BY va.created_at DESC
      `,
      [studentId]
    );

    res.json(rows);

  } catch (err) {
    console.error("STUDENT VIDEO REPORT ERROR:", err);
    res.status(500).json({ error: "Failed to load video analysis report" });
  }
});

/* =========================
   OVERALL STUDENT PERFORMANCE (FUSION)
========================= */
router.get("/overall", async (req, res) => {
  try {
    const studentId = req.session.student.id;
    const registerNo = req.session.student.register_no;

    /* -------- ACADEMIC -------- */
    const [[academic]] = await db.query(
      `
      SELECT
        JSON_EXTRACT(row_data,'$._features.overall_percentage') AS percentage,
        JSON_EXTRACT(row_data,'$._features.engagement_score') AS engagement
      FROM academic_uploads
      WHERE register_number = ?
      ORDER BY uploaded_at DESC
      LIMIT 1
      `,
      [registerNo]
    );

    /* -------- SURVEY -------- */
    const [[survey]] = await db.query(
      `
      SELECT risk_level, confidence
      FROM survey_evaluation
      WHERE student_id = ?
      ORDER BY evaluated_at DESC
      LIMIT 1
      `,
      [studentId]
    );

    /* -------- VIDEO -------- */
    const [[video]] = await db.query(
      `
      SELECT confidence_score, stress
      FROM video_analysis va
      JOIN student_videos v ON va.video_id = v.id
      WHERE v.student_id = ?
      ORDER BY va.created_at DESC
      LIMIT 1
      `,
      [studentId]
    );

    const availability = {
      academic: !!academic?.percentage,
      survey: !!survey?.confidence,
      video: !!video?.confidence_score
    };

    let score = 0;
    let weight = 0;

    if (availability.academic) {
      score += Number(academic.percentage) * 0.4;
      weight += 0.4;
    }

    if (availability.survey) {
      score += survey.confidence * 100 * 0.3;
      weight += 0.3;
    }

    if (availability.video) {
      score += video.confidence_score * 0.3;
      weight += 0.3;
    }

    let finalScore = null;
    let finalRisk = "Insufficient Data";

    if (weight > 0) {
      finalScore = (score / weight).toFixed(2);

      if (finalScore < 40) finalRisk = "High_Risk";
      else if (finalScore < 60) finalRisk = "Medium_Risk";
      else finalRisk = "Low_Risk";
    }

    res.json({
      availability,
      academic,
      survey,
      video,
      finalScore,
      finalRisk
    });

  } catch (err) {
    console.error("OVERALL PERFORMANCE ERROR:", err);
    res.status(500).json({ error: "Failed to compute overall performance" });
  }
});

module.exports = router;
