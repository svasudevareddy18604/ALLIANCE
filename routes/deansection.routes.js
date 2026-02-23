const express = require("express");
const db = require("../db");
// const auth = require("../middleware/auth"); // enable later

const router = express.Router();

/* =====================================================
   GET DATA FOR FORM
   - Courses (from ACTIVE students)
   - ACTIVE faculty only
===================================================== */
router.get("/data", async (req, res) => {
  try {
    const [students] = await db.query(`
      SELECT DISTINCT course
      FROM students
      WHERE status = 'ACTIVE'
        AND course IS NOT NULL
      ORDER BY course
    `);

    const [faculty] = await db.query(`
      SELECT id, full_name, department, email
      FROM faculty
      WHERE status = 'ACTIVE'
      ORDER BY full_name
    `);

    res.json({ students, faculty });

  } catch (err) {
    console.error("Mentor form data error:", err);
    res.status(500).json({ error: "Data fetch failed" });
  }
});

/* =====================================================
   GET SECTIONS FOR A COURSE
===================================================== */
router.get("/sections", async (req, res) => {
  try {
    const { course } = req.query;
    if (!course) return res.json([]);

    const [rows] = await db.query(`
      SELECT DISTINCT section
      FROM students
      WHERE course = ?
        AND status = 'ACTIVE'
        AND section IS NOT NULL
      ORDER BY section
    `, [course]);

    res.json(rows.map(r => r.section));

  } catch (err) {
    console.error("Fetch sections error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* =====================================================
   ASSIGN / CHANGE MENTOR
===================================================== */
router.post("/", async (req, res) => {
  try {
    const { faculty_id, course, section } = req.body;

    if (!faculty_id || !course || !section) {
      return res.status(400).json({ error: "Missing fields" });
    }

    /* 🔒 Ensure faculty exists AND is ACTIVE */
    const [faculty] = await db.query(
      `SELECT id FROM faculty WHERE id = ? AND status = 'ACTIVE'`,
      [faculty_id]
    );

    if (faculty.length === 0) {
      return res.status(400).json({
        error: "Faculty not active or does not exist"
      });
    }

    /* Remove existing mentor for course + section */
    await db.query(`
      DELETE FROM mentors
      WHERE course = ? AND section = ?
    `, [course, section]);

    /* Assign mentor */
    await db.query(`
      INSERT INTO mentors (faculty_id, course, section)
      VALUES (?, ?, ?)
    `, [faculty_id, course, section]);

    res.json({ message: "Mentor assigned successfully" });

  } catch (err) {
    console.error("Mentor assign error:", err);
    res.status(500).json({ error: "Mentor assignment failed" });
  }
});

/* =====================================================
   GET ALL MENTOR ALLOCATIONS
===================================================== */
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        m.course,
        m.section,
        m.assigned_at,
        f.id AS faculty_id,
        f.full_name,
        f.email
      FROM mentors m
      INNER JOIN faculty f ON m.faculty_id = f.id
      ORDER BY m.course, m.section
    `);

    res.json(rows);

  } catch (err) {
    console.error("Fetch mentors error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* =====================================================
   REMOVE MENTOR (MATCHES FRONTEND)
===================================================== */
router.delete("/", async (req, res) => {
  try {
    const { course, section } = req.body;

    if (!course || !section) {
      return res.status(400).json({ error: "Missing course or section" });
    }

    await db.query(`
      DELETE FROM mentors
      WHERE course = ? AND section = ?
    `, [course, section]);

    res.json({ message: "Mentor removed successfully" });

  } catch (err) {
    console.error("Remove mentor error:", err);
    res.status(500).json({ error: "Remove failed" });
  }
});

module.exports = router;
