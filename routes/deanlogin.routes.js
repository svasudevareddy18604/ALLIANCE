const express = require("express");
const bcrypt = require("bcrypt");
const path = require("path");
const db = require("../db");

const router = express.Router();

/* =========================
   DEAN LOGIN
========================= */
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: "Username and password required" });
        }

        // ✅ PROMISE-BASED QUERY (IMPORTANT)
        const [results] = await db.query(
            "SELECT * FROM deans WHERE username = ?",
            [username]
        );

        if (results.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const dean = results[0];

        const match = await bcrypt.compare(password, dean.password);
        if (!match) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // ✅ STORE SESSION
        req.session.dean = {
            id: dean.id,
            username: dean.username
        };

        // ✅ FORCE SESSION SAVE BEFORE RESPONSE
        req.session.save(() => {
            res.json({ message: "Login success" });
        });

    } catch (err) {
        console.error("Dean login error:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* =========================
   LOGIN PAGE
========================= */
router.get("/login", (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "public", "dean", "dean_login.html")
    );
});

/* =========================
   LOGOUT
========================= */
router.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/dean/login");
    });
});

module.exports = router;
