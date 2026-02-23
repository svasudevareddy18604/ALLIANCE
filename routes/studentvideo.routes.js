const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const db = require("../db");

const router = express.Router();

/* =========================
   AUTH
========================= */
function studentAuth(req, res, next) {
    if (!req.session.student?.id) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

/* =========================
   UPLOAD DIR
========================= */
const uploadDir = path.join(__dirname, "..", "uploads", "student_videos");
fs.mkdirSync(uploadDir, { recursive: true });

/* =========================
   MULTER
========================= */
const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (_, file, cb) => {
        if (!file.mimetype.startsWith("video/")) {
            return cb(new Error("Only video files allowed"));
        }
        cb(null, true);
    }
});

/* =========================
   PYTHON ANALYZER
========================= */
function runAnalyzer(videoPath, videoId) {
    const python = spawn("python", [
        path.join(__dirname, "..", "video_analyzer.py"),
        path.join(__dirname, "..", videoPath)
    ]);

    let output = "";

    python.stdout.on("data", d => output += d.toString());
    python.stderr.on("data", e => console.error("PYTHON:", e.toString()));

    python.on("close", async () => {
        try {
            const result = JSON.parse(output.replace(/'/g, '"'));

            await db.query(
                `INSERT INTO video_analysis
                (video_id, eye_contact_ratio, head_movement, posture, nervousness, stress, confidence_score)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    videoId,
                    result.eye_contact_ratio,
                    result.head_movement,
                    result.posture,
                    result.nervousness,
                    result.stress,
                    result.confidence_score
                ]
            );

            await db.query(
                "UPDATE student_videos SET status='DONE' WHERE id=?",
                [videoId]
            );

        } catch (err) {
            console.error("Analysis failed:", err);
        }
    });
}

/* =========================
   UPLOAD VIDEO
========================= */
router.post("/upload", studentAuth, upload.single("video"), async (req, res) => {
    const studentId = req.session.student.id;
    const videoPath = `/uploads/student_videos/${req.file.filename}`;

    const [r] = await db.query(
        `INSERT INTO student_videos (student_id, video_path, status)
         VALUES (?, ?, 'PROCESSING')`,
        [studentId, videoPath]
    );

    runAnalyzer(videoPath, r.insertId);

    res.json({ message: "Uploaded & processing started" });
});

/* =========================
   GET VIDEOS
========================= */
router.get("/", studentAuth, async (req, res) => {
    const studentId = req.session.student.id;

    const [rows] = await db.query(`
        SELECT v.id, v.video_path, v.status, v.created_at,
               a.eye_contact_ratio, a.posture, a.nervousness, a.stress, a.confidence_score
        FROM student_videos v
        LEFT JOIN video_analysis a ON a.video_id = v.id
        WHERE v.student_id = ?
        ORDER BY v.created_at DESC
    `, [studentId]);

    res.json(rows.map(v => ({
        id: v.id,
        video_url: v.video_path,
        status: v.status,
        created_at: v.created_at,
        analysis: v.status === "DONE" ? {
            eye_contact_ratio: v.eye_contact_ratio,
            posture: v.posture,
            nervousness: v.nervousness,
            stress: v.stress,
            confidence_score: v.confidence_score
        } : null
    })));
});

/* =========================
   DELETE VIDEO (FIXED)
========================= */
router.delete("/:id", studentAuth, async (req, res) => {
    const videoId = req.params.id;
    const studentId = req.session.student.id;

    const [rows] = await db.query(
        `SELECT video_path, status
         FROM student_videos
         WHERE id=? AND student_id=?`,
        [videoId, studentId]
    );

    if (!rows.length) {
        return res.status(404).json({ error: "Video not found" });
    }

    if (rows[0].status === "PROCESSING") {
        return res.status(400).json({ error: "Cannot delete while processing" });
    }

    // delete file safely
    const fullPath = path.join(__dirname, "..", rows[0].video_path);
    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }

    // delete analysis if exists
    await db.query("DELETE FROM video_analysis WHERE video_id=?", [videoId]);

    // delete video record
    await db.query("DELETE FROM student_videos WHERE id=?", [videoId]);

    res.json({ message: "Video deleted successfully" });
});

module.exports = router;
