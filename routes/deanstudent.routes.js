const express = require("express");
const bcrypt = require("bcrypt");
const multer = require("multer");
const csvParser = require("csv-parser");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;
const db = require("../db");
const auth = require("../middleware/auth");

const router = express.Router();

/* =========================
   CLOUDINARY CONFIG
========================= */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* =========================
   MULTER (MEMORY)
========================= */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

/* =========================
   GET ALL STUDENTS
========================= */
router.get("/", auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        register_no,
        full_name,
        course,
        email,
        phone,
        section,
        status,
        profile_image
      FROM students
      ORDER BY id DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("Get students error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

/* =========================
   ADD / REACTIVATE STUDENT
========================= */
router.post("/", auth, upload.single("profile_image"), async (req, res) => {
  try {
    const { register_no, full_name, course, email, phone, section } = req.body;

    if (!register_no || !full_name) {
      return res.status(400).json({ error: "Required fields missing" });
    }

    let profileImage = null;

    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(
        `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
        { folder: "alliance_students" }
      );
      profileImage = uploadResult.secure_url;
    }

    const hashedPassword = await bcrypt.hash("1234", 10);

    await db.query(
      `
      INSERT INTO students
      (register_no, full_name, course, email, phone, section, password, profile_image, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      ON DUPLICATE KEY UPDATE
        full_name = VALUES(full_name),
        course = VALUES(course),
        email = VALUES(email),
        phone = VALUES(phone),
        section = VALUES(section),
        password = VALUES(password),
        profile_image = COALESCE(VALUES(profile_image), profile_image),
        status = 'ACTIVE'
      `,
      [
        register_no,
        full_name,
        course,
        email,
        phone,
        section,
        hashedPassword,
        profileImage
      ]
    );

    res.json({ message: "Student added / reactivated successfully" });

  } catch (err) {
    console.error("Add student error:", err);
    res.status(500).json({ error: "Insert failed" });
  }
});

/* =========================
   UPDATE STUDENT
========================= */
router.put("/:id", auth, upload.single("profile_image"), async (req, res) => {
  try {
    const { full_name, course, email, phone, section } = req.body;

    let sql = `
      UPDATE students
      SET full_name=?, course=?, email=?, phone=?, section=?
    `;
    const values = [full_name, course, email, phone, section];

    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(
        `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
        { folder: "alliance_students" }
      );
      sql += `, profile_image=?`;
      values.push(uploadResult.secure_url);
    }

    sql += ` WHERE id=?`;
    values.push(req.params.id);

    await db.query(sql, values);

    res.json({ message: "Student updated successfully" });

  } catch (err) {
    console.error("Update student error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

/* =========================
   SOFT DELETE STUDENT
========================= */
router.delete("/:id", auth, async (req, res) => {
  try {
    await db.query(
      `UPDATE students SET status='INACTIVE' WHERE id=?`,
      [req.params.id]
    );

    res.json({ message: "Student deactivated successfully" });
  } catch (err) {
    console.error("Deactivate student error:", err);
    res.status(500).json({ error: "Operation failed" });
  }
});

/* =========================
   CSV UPLOAD (REACTIVATE SAFE)
========================= */
router.post(
  "/upload-csv",
  auth,
  multer({ dest: "uploads/" }).single("csv"),
  async (req, res) => {
    try {
      const rows = [];
      const hashedPassword = await bcrypt.hash("1234", 10);

      await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(csvParser())
          .on("data", row => rows.push(row))
          .on("end", resolve)
          .on("error", reject);
      });

      if (!rows.length) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "CSV empty" });
      }

      const values = rows.map(r => [
        r.register_no,
        r.full_name,
        r.course,
        r.email,
        r.phone,
        r.section,
        hashedPassword
      ]);

      await db.query(
        `
        INSERT INTO students
        (register_no, full_name, course, email, phone, section, password, status)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name),
          course = VALUES(course),
          email = VALUES(email),
          phone = VALUES(phone),
          section = VALUES(section),
          password = VALUES(password),
          status = 'ACTIVE'
        `,
        [values]
      );

      fs.unlinkSync(req.file.path);
      res.json({ message: "CSV upload successful (reactivated safely)" });

    } catch (err) {
      console.error("CSV upload error:", err);
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: "CSV insert failed" });
    }
  }
);

module.exports = router;
