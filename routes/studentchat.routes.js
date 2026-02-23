const express = require("express");
const db = require("../db");

const router = express.Router();

/* ================= AUTH ================= */
router.use((req, res, next) => {
  if (!req.session?.student) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

/* =====================================================
   GET CHAT (Student View)
   GET /student/chat/:feedbackId
===================================================== */
router.get("/:feedbackId", async (req, res) => {
  try {
    const studentId = req.session.student.id;
    const feedbackId = req.params.feedbackId;

    /* Verify feedback belongs to this student */
    const [[allowed]] = await db.query(`
      SELECT id
      FROM student_feedback
      WHERE id = ?
        AND student_id = ?
    `, [feedbackId, studentId]);

    if (!allowed) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [messages] = await db.query(`
      SELECT sender, message, created_at
      FROM student_feedback_messages
      WHERE feedback_id = ?
      ORDER BY created_at ASC
    `, [feedbackId]);

    res.json({ messages });

  } catch (err) {
    console.error("STUDENT CHAT LOAD ERROR:", err);
    res.status(500).json({ error: "Failed to load chat" });
  }
});

/* =====================================================
   SEND MESSAGE (Student)
   POST /student/chat/:feedbackId
===================================================== */
router.post("/:feedbackId", async (req, res) => {
  try {
    const studentId = req.session.student.id;
    const feedbackId = req.params.feedbackId;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message required" });
    }

    /* Verify ownership */
    const [[allowed]] = await db.query(`
      SELECT id
      FROM student_feedback
      WHERE id = ?
        AND student_id = ?
    `, [feedbackId, studentId]);

    if (!allowed) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.query(`
      INSERT INTO student_feedback_messages
        (feedback_id, sender, message)
      VALUES (?, 'student', ?)
    `, [feedbackId, message.trim()]);

    res.json({ success: true });

  } catch (err) {
    console.error("STUDENT CHAT SEND ERROR:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

module.exports = router;
