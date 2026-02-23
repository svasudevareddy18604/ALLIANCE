const express = require("express");
const db = require("../db");

const router = express.Router();

/* =========================
   FACULTY AUTH
========================= */
function facultyAuth(req, res, next) {
  if (!req.session || !req.session.faculty?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/* ==================================================
   GET VIDEO STATUS (ONLY ALLOCATED STUDENTS)
================================================== */
/*
 RETURNS:
 [
   {
     student_id,
     name,
     register_no,
     section,
     status,        // DONE | PROCESSING | NOT_SUBMITTED
     created_at
   }
 ]
*/
router.get("/", facultyAuth, async (req, res) => {
  try {
    const facultyId = req.session.faculty.id;

    const [rows] = await db.query(
      `
      SELECT
        s.id AS student_id,
        s.full_name AS name,
        s.register_no,
        s.section,
        v.status,
        v.created_at
      FROM mentors m
      JOIN students s
        ON s.course = m.course
       AND s.section = m.section
      LEFT JOIN student_videos v
        ON v.student_id = s.id
      WHERE m.faculty_id = ?
      ORDER BY s.section, s.register_no
      `,
      [facultyId]
    );

    const result = rows.map(r => ({
      student_id: r.student_id,
      name: r.name,
      register_no: r.register_no,
      section: r.section,
      status: r.status || "NOT_SUBMITTED",
      created_at: r.created_at
    }));

    res.json(result);
  } catch (err) {
    console.error("FACULTY VIDEO ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
