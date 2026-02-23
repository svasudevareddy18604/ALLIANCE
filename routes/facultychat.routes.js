const express = require("express");
const db = require("../db");

const router = express.Router();

/* ================= FILE LOAD CHECK ================= */
console.log("✅ facultychat.routes.js loaded");

/* ================= AUTH ================= */
router.use((req, res, next) => {
  console.log("🔐 CHAT AUTH HIT");
  console.log("SESSION FACULTY:", req.session?.faculty);

  if (!req.session?.faculty) {
    console.log("❌ UNAUTHORIZED FACULTY CHAT ACCESS");
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

/* =====================================================
   GET CHAT MESSAGES
   GET /faculty/chat/:feedbackId
===================================================== */
router.get("/:feedbackId", async (req, res) => {
  const feedbackId = req.params.feedbackId;
  console.log("📥 GET CHAT HIT", feedbackId);

  try {
    /* ✅ Validate feedback exists */
    const [feedback] = await db.query(
      "SELECT id FROM student_feedback WHERE id = ?",
      [feedbackId]
    );

    if (feedback.length === 0) {
      console.log("❌ INVALID FEEDBACK ID:", feedbackId);
      return res.status(404).json({
        error: "Feedback not found"
      });
    }

    const [messages] = await db.query(
      `SELECT sender, message, created_at
       FROM student_feedback_messages
       WHERE feedback_id = ?
       ORDER BY created_at ASC`,
      [feedbackId]
    );

    res.json({ messages });

  } catch (err) {
    console.error("❌ GET CHAT ERROR:", err);
    res.status(500).json({ error: "Failed to load chat" });
  }
});

/* =====================================================
   SEND FACULTY MESSAGE
   POST /faculty/chat/:feedbackId
===================================================== */
router.post("/:feedbackId", async (req, res) => {
  const feedbackId = req.params.feedbackId;
  const { message } = req.body;

  console.log("📩 FACULTY CHAT POST HIT");
  console.log("PARAMS:", req.params);
  console.log("BODY:", req.body);

  try {
    if (!message || !message.trim()) {
      console.log("❌ EMPTY MESSAGE BLOCKED");
      return res.status(400).json({ error: "Message required" });
    }

    /* ✅ CRITICAL FIX: validate parent row exists */
    const [feedback] = await db.query(
      "SELECT id FROM student_feedback WHERE id = ?",
      [feedbackId]
    );

    if (feedback.length === 0) {
      console.log("❌ INVALID FEEDBACK ID:", feedbackId);
      return res.status(400).json({
        error: "Invalid feedback ID"
      });
    }

    await db.query(
      `INSERT INTO student_feedback_messages
       (feedback_id, sender, message)
       VALUES (?, 'faculty', ?)`,
      [feedbackId, message.trim()]
    );

    console.log("✅ FACULTY MESSAGE INSERTED");
    res.json({ success: true });

  } catch (err) {
    console.error("❌ SEND CHAT ERROR:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

module.exports = router;
