const express = require("express");
const bcrypt = require("bcrypt");
const path = require("path");
const db = require("../db");

const router = express.Router();

/* =========================
   FACULTY LOGIN (PUBLIC)
========================= */
router.post("/login", async (req, res) => {
  try {
    const { faculty_id, password } = req.body;

    if (!faculty_id || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }

    const [rows] = await db.query(
      `
      SELECT id, faculty_id, password, status
      FROM faculty
      WHERE faculty_id = ?
      `,
      [faculty_id]
    );

    if (!rows.length) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const faculty = rows[0];

    /* 🔒 HARD BLOCK INACTIVE FACULTY */
    if (faculty.status !== "ACTIVE") {
      return res.status(403).json({
        error: "Faculty account is inactive. Contact administration."
      });
    }

    const match = await bcrypt.compare(password, faculty.password);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    /* SAVE SESSION */
    req.session.faculty = {
      id: faculty.id,
      faculty_id: faculty.faculty_id,
      role: "FACULTY"
    };

    /* FORCE PASSWORD CHANGE IF DEFAULT */
    const forceChange = await bcrypt.compare("1234", faculty.password);

    req.session.save(() => {
      res.json({ forceChange });
    });

  } catch (err) {
    console.error("FACULTY LOGIN ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   PUBLIC PAGES
========================= */
router.get("/login", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../public/faculty/faculty_login.html")
  );
});

router.get("/change_password", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../public/faculty/change_password.html")
  );
});

router.get("/change-password", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../public/faculty/change_password.html")
  );
});

/* =========================
   CHANGE PASSWORD
========================= */
router.post("/change-password", async (req, res) => {
  try {
    if (!req.session.faculty) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { newPass } = req.body;
    if (!newPass || newPass.length < 4) {
      return res.status(400).json({ error: "Password must be at least 4 characters" });
    }

    const hash = await bcrypt.hash(newPass, 10);

    await db.query(
      `
      UPDATE faculty
      SET password = ?
      WHERE id = ? AND status = 'ACTIVE'
      `,
      [hash, req.session.faculty.id]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   DASHBOARD PAGE
========================= */
router.get("/dashboard", async (req, res) => {
  if (!req.session.faculty) {
    return res.redirect("/faculty/login");
  }

  /* 🔒 SESSION STATUS RECHECK */
  const [[faculty]] = await db.query(
    "SELECT status FROM faculty WHERE id = ?",
    [req.session.faculty.id]
  );

  if (!faculty || faculty.status !== "ACTIVE") {
    req.session.destroy(() => {});
    return res.redirect("/faculty/login");
  }

  res.sendFile(
    path.join(__dirname, "../public/faculty/faculty_dashboard.html")
  );
});

/* =========================
   PROFILE API
========================= */
router.get("/dashboard/profile", async (req, res) => {
  try {
    if (!req.session.faculty) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [[faculty]] = await db.query(
      `
      SELECT full_name, email, phone, profile_image, status
      FROM faculty
      WHERE id = ?
      `,
      [req.session.faculty.id]
    );

    if (!faculty || faculty.status !== "ACTIVE") {
      req.session.destroy(() => {});
      return res.status(403).json({
        error: "Faculty account inactive"
      });
    }

    res.json({
      full_name: faculty.full_name,
      email: faculty.email,
      phone: faculty.phone,
      profile_image: faculty.profile_image
    });

  } catch (err) {
    console.error("PROFILE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   LOGOUT
========================= */
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/faculty/login");
  });
});

module.exports = router;
