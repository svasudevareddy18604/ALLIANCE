const express = require("express");
const mysql = require("mysql2");
const router = express.Router();
require("dotenv").config();

/* =====================================================
   MYSQL CONNECTION (USING .env — INLINE, NO config/db)
   ===================================================== */
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,   // MUST come from .env
    database: process.env.DB_NAME || "alliance"
});

db.connect(err => {
    if (err) {
        console.error("❌ MySQL connection failed:", err.message);
    } else {
        console.log("✅ MySQL connected (Dean Sections)");
    }
});

/* =====================================================
   GET ALL SECTIONS (course + section)
   ===================================================== */
router.get("/", (req, res) => {
    const sql = `
        SELECT DISTINCT
            course,
            section,
            assigned_at
        FROM mentors
        ORDER BY course, section
    `;

    db.query(sql, (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "Database error" });
        }
        res.json(rows);
    });
});

/* =====================================================
   ADD SECTION (course + section)
   ===================================================== */
router.post("/", (req, res) => {
    const { course, section } = req.body;

    if (!course || !section) {
        return res.status(400).json({
            message: "Course and Section are required"
        });
    }

    const checkSql = `
        SELECT id FROM mentors
        WHERE course = ? AND section = ?
    `;

    db.query(checkSql, [course, section], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ message: "Database error" });
        }

        if (rows.length > 0) {
            return res.status(409).json({
                message: "Section already exists"
            });
        }

        const insertSql = `
            INSERT INTO mentors (faculty_id, course, section)
            VALUES (NULL, ?, ?)
        `;

        db.query(insertSql, [course, section], err => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    message: "Failed to create section"
                });
            }

            res.status(201).json({
                message: "Section created successfully",
                course,
                section
            });
        });
    });
});

/* =====================================================
   DELETE SECTION (course + section)
   ===================================================== */
router.delete("/", (req, res) => {
    const { course, section } = req.body;

    if (!course || !section) {
        return res.status(400).json({
            message: "Course and Section are required"
        });
    }

    const deleteSql = `
        DELETE FROM mentors
        WHERE course = ? AND section = ?
    `;

    db.query(deleteSql, [course, section], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({
                message: "Delete failed"
            });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Section not found"
            });
        }

        res.json({
            message: "Section deleted successfully"
        });
    });
});

module.exports = router;
