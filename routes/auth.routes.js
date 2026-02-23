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
            if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });

            const dean = rows[0];
            const ok = await bcrypt.compare(password, dean.password);
            if (!ok) return res.status(401).json({ error: "Invalid credentials" });

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
   FACULTY LOGIN
========================= */
router.post("/faculty/login", (req, res) => {
    const { faculty_id, password } = req.body;

    db.query(
        "SELECT * FROM faculty WHERE faculty_id = ? AND status='ACTIVE'",
        [faculty_id],
        async (err, rows) => {
            if (err) return res.status(500).json({ error: "DB error" });
            if (!rows.length) return res.status(401).json({ error: "Invalid credentials" });

            const faculty = rows[0];
            const ok = await bcrypt.compare(password, faculty.password);
            if (!ok) return res.status(401).json({ error: "Invalid credentials" });

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
   LOGOUT (ALL ROLES)
========================= */
router.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.clearCookie("alliance.sid");
        res.json({ message: "Logged out" });
    });
});

/* =========================
   SESSION CHECK
========================= */
router.get("/me", (req, res) => {
    if (req.session.dean) return res.json(req.session.dean);
    if (req.session.faculty) return res.json(req.session.faculty);
    res.status(401).json({ error: "Not logged in" });
});

/* =========================
   FACULTY – SEND OTP
========================= */
router.post("/faculty/forgot-password", (req, res) => {
    const { email } = req.body;

    if (!email.endsWith("@alliance.edu.in")) {
        return res.status(400).json({ error: "Invalid university email" });
    }

    db.query(
        "SELECT id FROM faculty WHERE email = ?",
        [email],
        (err, rows) => {
            if (!rows.length) return res.status(404).json({ error: "Email not found" });

            const otp = Math.floor(100000 + Math.random() * 900000);

            db.query(
                "UPDATE faculty SET otp=?, otp_expiry=NOW()+INTERVAL 5 MINUTE WHERE email=?",
                [otp, email]
            );

            // 🔔 EMAIL
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
   VERIFY OTP
========================= */
router.post("/faculty/verify-otp", (req, res) => {
    const { email, otp } = req.body;

    db.query(
        "SELECT id FROM faculty WHERE email=? AND otp=? AND otp_expiry > NOW()",
        [email, otp],
        (err, rows) => {
            if (!rows.length) {
                return res.status(400).json({ error: "Invalid or expired OTP" });
            }
            res.json({ message: "OTP verified" });
        }
    );
});

/* =========================
   RESET PASSWORD
========================= */
router.post("/faculty/reset-password", async (req, res) => {
    const { email, password } = req.body;

    const hash = await bcrypt.hash(password, 10);

    db.query(
        "UPDATE faculty SET password=?, otp=NULL, otp_expiry=NULL WHERE email=?",
        [hash, email],
        () => res.json({ message: "Password updated" })
    );
});

module.exports = router;
