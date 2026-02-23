const express = require("express");
const path = require("path");
const db = require("../db");              // promise pool
const auth = require("../middleware/auth");

const router = express.Router();

/* =========================
   DASHBOARD PAGE (PROTECTED)
========================= */
router.get("/", auth, (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "public", "dean", "deandashboard.html")
    );
});

/* =========================
   PROFILE DATA (SESSION)
========================= */
router.get("/profile", auth, async (req, res) => {
    try {
        const deanId = req.session.dean.id;

        const [rows] = await db.query(
            `
            SELECT username, email, phone, profile_image
            FROM deans
            WHERE id = ?
            `,
            [deanId]
        );

        if (!rows.length) {
            return res.status(404).json({ error: "Dean not found" });
        }

        res.json(rows[0]);

    } catch (err) {
        console.error("Dean profile fetch error:", err);
        res.status(500).json({ error: "DB error" });
    }
});

module.exports = router;
