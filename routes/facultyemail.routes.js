const express = require("express");
const db = require("../db");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");

const router = express.Router();

/* =========================
   MAIL TRANSPORTER
========================= */
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS
    }
});

/* =========================
   SEND OTP (PUBLIC)
========================= */
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: "Email is required" });
        }

        if (!email.endsWith("@ced.alliance.edu.in")) {
            return res.status(400).json({
                error: "Only Alliance University email is allowed"
            });
        }

        // 1️⃣ Check faculty
        const [rows] = await db.query(
            "SELECT id FROM faculty WHERE email = ? AND status = 'ACTIVE'",
            [email]
        );

        if (!rows.length) {
            return res.status(404).json({
                error: "Email is wrong. Please check once again."
            });
        }

        // 2️⃣ Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000);

        // 3️⃣ Save OTP
        await db.query(
            `UPDATE faculty
             SET otp = ?, otp_expiry = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
             WHERE email = ?`,
            [otp, email]
        );

        // 4️⃣ Send email
        await transporter.sendMail({
            from: `"Alliance University" <${process.env.MAIL_USER}>`,
            to: email,
            subject: "Password Reset OTP",
            html: `
                <p>Your OTP is:</p>
                <h2>${otp}</h2>
                <p>Valid for 10 minutes.</p>
            `
        });

        res.json({ message: "OTP sent successfully" });

    } catch (err) {
        console.error("FORGOT PASSWORD ERROR:", err);
        res.status(500).json({ error: "Failed to send OTP" });
    }
});

/* =========================
   VERIFY OTP
========================= */
router.post("/verify-otp", async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: "Email and OTP required" });
        }

        const [rows] = await db.query(
            `SELECT id FROM faculty
             WHERE email = ?
               AND otp = ?
               AND otp_expiry > NOW()`,
            [email, otp]
        );

        if (!rows.length) {
            return res.status(400).json({
                error: "Invalid or expired OTP"
            });
        }

        res.json({ message: "OTP verified successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

/* =========================
   RESET PASSWORD
========================= */
router.post("/reset-password", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "Email and password are required"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                error: "Password must be at least 8 characters long"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await db.query(
            `UPDATE faculty
             SET password = ?, otp = NULL, otp_expiry = NULL
             WHERE email = ?`,
            [hashedPassword, email]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({ message: "Password reset successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to reset password" });
    }
});

module.exports = router;
