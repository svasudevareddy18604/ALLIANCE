const express = require("express");
const db = require("../db"); // mysql2/promise pool
const router = express.Router();

/* =========================
   STUDENT AUTH MIDDLEWARE
========================= */
function studentAuth(req, res, next) {
  if (!req.session.student) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/* =========================
   GET STUDENT MENTOR
========================= */
router.get("/", studentAuth, async (req, res) => {
  try {
    const { section } = req.session.student;

    const [rows] = await db.query(
      `
      SELECT 
        f.full_name,
        f.email,
        f.phone,
        f.department,
        f.designation,
        f.profile_image,
        m.course,
        m.section
      FROM mentors m
      INNER JOIN faculty f ON f.id = m.faculty_id
      WHERE m.section = ?
      LIMIT 1
      `,
      [section]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "No mentor assigned" });
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("STUDENT MENTOR ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
