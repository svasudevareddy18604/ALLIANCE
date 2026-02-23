const express = require("express");
const db = require("../db");
const bcrypt = require("bcrypt");
const auth = require("../middleware/auth");

const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const router = express.Router();

/* =========================
   CLOUDINARY CONFIG
========================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/* =========================
   MULTER STORAGE
========================= */
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "alliance/faculty",
    allowed_formats: ["jpg", "png", "jpeg"]
  }
});
const upload = multer({ storage });

/* =========================================================
   GET ALL FACULTY (ACTIVE + INACTIVE)
========================================================= */
router.get("/", auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        id,
        faculty_id,
        full_name,
        email,
        phone,
        department,
        designation,
        profile_image,
        status
      FROM faculty
      ORDER BY id DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("Get faculty error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* =========================================================
   ADD / REACTIVATE FACULTY
========================================================= */
router.post("/", auth, upload.single("profile_image"), async (req, res) => {
  try {
    const { full_name, email, phone, department, designation } = req.body;

    if (!full_name || !email) {
      return res.status(400).json({ error: "Full name and email required" });
    }

    const hashedPassword = await bcrypt.hash("1234", 10);
    const profileImageUrl = req.file ? req.file.path : null;

    const [result] = await db.query(
      `
      INSERT INTO faculty
      (full_name, email, phone, department, designation, password, profile_image, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        phone = VALUES(phone),
        department = VALUES(department),
        designation = VALUES(designation),
        password = VALUES(password),
        profile_image = COALESCE(VALUES(profile_image), profile_image),
        status = 'ACTIVE'
      `,
      [
        full_name,
        email,
        phone,
        department,
        designation,
        hashedPassword,
        profileImageUrl
      ]
    );

    /* Generate faculty_id ONLY for new insert */
    if (result.insertId) {
      const facultyId = "FAC" + String(result.insertId).padStart(4, "0");
      await db.query(
        `UPDATE faculty SET faculty_id = ? WHERE id = ?`,
        [facultyId, result.insertId]
      );
    }

    res.json({ message: "Faculty added / reactivated" });

  } catch (err) {
    console.error("Add faculty error:", err);
    res.status(500).json({ error: "Operation failed" });
  }
});

/* =========================================================
   UPDATE FACULTY (ACTIVE OR INACTIVE)
========================================================= */
router.put("/:id", auth, upload.single("profile_image"), async (req, res) => {
  try {
    const { full_name, email, phone, department, designation } = req.body;
    const profileImageUrl = req.file ? req.file.path : null;

    let sql = `
      UPDATE faculty SET
        full_name = ?,
        email = ?,
        phone = ?,
        department = ?,
        designation = ?
    `;
    const params = [
      full_name,
      email,
      phone,
      department,
      designation
    ];

    if (profileImageUrl) {
      sql += `, profile_image = ?`;
      params.push(profileImageUrl);
    }

    sql += ` WHERE id = ?`;
    params.push(req.params.id);

    await db.query(sql, params);

    res.json({ message: "Faculty updated" });

  } catch (err) {
    console.error("Update faculty error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

/* =========================================================
   TOGGLE ACTIVE / INACTIVE STATUS
========================================================= */
router.patch("/:id/status", auth, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    await db.query(
      `UPDATE faculty SET status = ? WHERE id = ?`,
      [status.toUpperCase(), req.params.id]
    );

    res.json({ message: `Faculty ${status}` });

  } catch (err) {
    console.error("Status update error:", err);
    res.status(500).json({ error: "Operation failed" });
  }
});

module.exports = router;
