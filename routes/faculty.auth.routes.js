const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const nodemailer = require("nodemailer");

const router = express.Router();

/* =========================
   DEAN LOGIN
========================= */
router.post("/dean/login", (req, res) => {
  const { username, password } = req.body;

  db.query(
    "SELECT * FROM deans WHERE username = ?",
    [username],
    async (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!rows.length) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const dean = rows[0];
      const ok = await bcrypt.compare(password, dean.password);
      if (!ok) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      req.session.dean = {
        id: dean.id,
        username: dean.username,
        role: "DEAN"
      };

      res.json({ message: "Dean login success" });
    }
  );
});

/* =========================
   FACULTY LOGIN (ACTIVE ONLY)
========================= */
router.post("/faculty/login", (req, res) => {
  const { faculty_id, password } = req.body;

  db.query(
    `
    SELECT id, faculty_id, password, status
    FROM faculty
    WHERE faculty_id = ?
    `,
    [faculty_id],
    async (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!rows.length) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const faculty = rows[0];

      if (faculty.status !== "ACTIVE") {
        return res.status(403).json({
          error: "Faculty account is inactive. Contact administration."
        });
      }

      const ok = await bcrypt.compare(password, faculty.password);
      if (!ok) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      req.session.faculty = {
        id: faculty.id,
        faculty_id: faculty.faculty_id,
        role: "FACULTY"
      };

      res.json({ message: "Faculty login success" });
    }
  );
});

/* =========================
   LOGOUT
========================= */
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("alliance.sid");
    res.json({ message: "Logged out" });
  });
});

/* =========================
   SESSION CHECK (STATUS SAFE)
========================= */
router.get("/me", async (req, res) => {
  if (req.session.dean) return res.json(req.session.dean);

  if (req.session.faculty) {
    const facultyId = req.session.faculty.id;

    const [[faculty]] = await db.query(
      "SELECT status FROM faculty WHERE id = ?",
      [facultyId]
    );

    if (!faculty || faculty.status !== "ACTIVE") {
      req.session.destroy(() => {});
      return res.status(403).json({
        error: "Faculty account is inactive. Session terminated."
      });
    }

    return res.json(req.session.faculty);
  }

  res.status(401).json({ error: "Not logged in" });
});

/* =========================
   FACULTY – SEND OTP (ACTIVE ONLY)
========================= */
router.post("/faculty/forgot-password", (req, res) => {
  const { email } = req.body;

  if (!email || !email.endsWith("@alliance.edu.in")) {
    return res.status(400).json({ error: "Invalid university email" });
  }

  db.query(
    `
    SELECT id, status
    FROM faculty
    WHERE email = ?
    `,
    [email],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!rows.length) {
        return res.status(404).json({ error: "Email not found" });
      }

      const faculty = rows[0];

      if (faculty.status !== "ACTIVE") {
        return res.status(403).json({
          error: "Faculty account is inactive. Contact administration."
        });
      }

      const otp = Math.floor(100000 + Math.random() * 900000);

      db.query(
        `
        UPDATE faculty
        SET otp = ?, otp_expiry = NOW() + INTERVAL 5 MINUTE
        WHERE email = ?
        `,
        [otp, email]
      );

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS
        }
      });

      transporter.sendMail({
        to: email,
        subject: "Alliance University OTP",
        text: `Your OTP is ${otp}`
      });

      res.json({ message: "OTP sent" });
    }
  );
});

/* =========================
   VERIFY OTP (ACTIVE ONLY)
========================= */
router.post("/faculty/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  db.query(
    `
    SELECT id
    FROM faculty
    WHERE email = ?
      AND otp = ?
      AND otp_expiry > NOW()
      AND status = 'ACTIVE'
    `,
    [email, otp],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!rows.length) {
        return res.status(400).json({
          error: "Invalid OTP, expired OTP, or inactive account"
        });
      }

      res.json({ message: "OTP verified" });
    }
  );
});

/* =========================
   RESET PASSWORD (ACTIVE ONLY)
========================= */
router.post("/faculty/reset-password", async (req, res) => {
  const { email, password } = req.body;

  if (!password || password.length < 4) {
    return res.status(400).json({
      error: "Password must be at least 4 characters"
    });
  }

  const hash = await bcrypt.hash(password, 10);

  db.query(
    `
    UPDATE faculty
    SET password = ?, otp = NULL, otp_expiry = NULL
    WHERE email = ?
      AND otp IS NOT NULL
      AND status = 'ACTIVE'
    `,
    [hash, email],
    (err, result) => {
      if (err) return res.status(500).json({ error: "DB error" });

      if (result.affectedRows === 0) {
        return res.status(400).json({
          error: "OTP verification required or account inactive"
        });
      }

      res.json({ message: "Password updated successfully" });
    }
  );
});

module.exports = router;
