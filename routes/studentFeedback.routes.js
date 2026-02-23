const express = require("express");
const db = require("../db");

const router = express.Router();

/* ==================================================
   AUTH GUARD (STUDENT ONLY)
================================================== */
router.use((req, res, next) => {
  if (!req.session || !req.session.student) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

/* ==================================================
   GET FEEDBACK FOR LOGGED-IN STUDENT
   GET /student/feedback
================================================== */
router.get("/", async (req, res) => {
  try {
    const studentId = req.session.student.id;

    const [[row]] = await db.query(`
      SELECT 
        id,                 -- 🔴 REQUIRED FOR CHAT
        feedback_text,
        student_reply,
        generated_at
      FROM student_feedback
      WHERE student_id = ?
      LIMIT 1
    `, [studentId]);

    // No feedback yet
    if (!row) {
      return res.json(null);
    }

    res.json({
      id: row.id,                    // 🔥 THIS FIXES CHAT
      feedback_text: row.feedback_text,
      student_reply: row.student_reply,
      generated_at: row.generated_at
    });

  } catch (err) {
    console.error("STUDENT FEEDBACK LOAD ERROR:", err);
    res.status(500).json({ error: "Failed to load feedback" });
  }
});

/* ==================================================
   SUBMIT STUDENT REPLY (LEGACY – OPTIONAL)
   POST /student/feedback/reply
================================================== */
router.post("/reply", async (req, res) => {
  try {
    const studentId = req.session.student.id;
    const { reply } = req.body;

    if (!reply || !reply.trim()) {
      return res.status(400).json({ error: "Reply cannot be empty" });
    }

    const [[exists]] = await db.query(`
      SELECT 1
      FROM student_feedback
      WHERE student_id = ?
    `, [studentId]);

    if (!exists) {
      return res.status(404).json({ error: "No feedback available to reply to" });
    }

    await db.query(`
      UPDATE student_feedback
      SET student_reply = ?, replied_at = NOW()
      WHERE student_id = ?
    `, [reply.trim(), studentId]);

    res.json({ success: true });

  } catch (err) {
    console.error("STUDENT REPLY ERROR:", err);
    res.status(500).json({ error: "Failed to submit reply" });
  }
});

module.exports = router;
