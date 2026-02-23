const express = require("express");
const db = require("../db");

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
   GET STUDENT OVERALL REPORT
========================= */
router.get("/overall", async (req, res) => {
  try {
    if (!req.session || !req.session.student) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const registerNo = req.session.student.register_no;

    const [[row]] = await db.query(`
      SELECT op.*
      FROM overall_performance op
      JOIN students s ON s.id = op.student_id
      WHERE s.register_no = ?
      ORDER BY op.generated_at DESC
      LIMIT 1
    `, [registerNo]);

    if (!row) {
      return res.json(null);
    }

    res.json(row);

  } catch (err) {
    console.error("STUDENT OVERALL ERROR:", err);
    res.status(500).json({ error: "Failed to fetch overall report" });
  }
});


module.exports = router;
