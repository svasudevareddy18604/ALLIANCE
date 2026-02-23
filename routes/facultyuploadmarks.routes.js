const express = require("express");
const db = require("../db");
const multer = require("multer");
const xlsx = require("xlsx");
const csv = require("csv-parser");
const fs = require("fs");

const router = express.Router();

/* =========================
   AUTH GUARD
========================= */
router.use((req, res, next) => {
    if (!req.session || !req.session.faculty) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
});

/* =========================
   MULTER
========================= */
const upload = multer({
    dest: "uploads/",
    fileFilter: (req, file, cb) => {
        const ext = file.originalname.split(".").pop().toLowerCase();
        if (!["csv", "xlsx"].includes(ext)) {
            return cb(new Error("Only CSV or XLSX allowed"));
        }
        cb(null, true);
    }
});

/* =========================
   NORMALIZE ROW
========================= */
function normalizeRow(row) {
    const out = {};
    for (const k in row) {
        out[k.toLowerCase().replace(/\s+/g, "_")] = row[k];
    }
    return out;
}

/* =========================
   SAFE JSON PARSE
========================= */
function safeParseJSON(value) {
    if (!value) return {};
    if (typeof value === "object") return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

/* =========================
   BUCKET DEFINITIONS (LOCKED)
========================= */
const BUCKET_MAP = {
    core_exam_score: ["mse", "ese", "see", "end_exam", "semester_end"],
    continuous_assessment_score: ["assignment", "class_test", "quiz", "test"],
    engagement_score: ["coursera", "lab", "microproject", "presentation", "seminar", "project"]
};

/* =========================
   FEATURE EXTRACTION (SAFE)
========================= */
function extractFeatures(rowData) {
    let core = 0;
    let continuous = 0;
    let engagement = 0;

    for (const key in rowData) {
        if (key === "_features") continue;

        const value = Number(rowData[key]);
        if (isNaN(value)) continue;

        if (BUCKET_MAP.core_exam_score.includes(key)) {
            core += value;
        } else if (BUCKET_MAP.continuous_assessment_score.includes(key)) {
            continuous += value;
        } else if (BUCKET_MAP.engagement_score.includes(key)) {
            engagement += value;
        }
    }

    const total = core + continuous + engagement;

    // 🔒 TOTAL MARKS = 100
    const overall_percentage = Math.max(
        0,
        Math.min(100, (total / 100) * 100)
    );

    return {
        core_exam_score: core,
        continuous_assessment_score: continuous,
        engagement_score: engagement,
        overall_percentage
    };
}

/* =========================
   GET VALID STUDENTS
========================= */
router.get("/students", async (req, res) => {
    const [rows] = await db.query(
        `SELECT register_no FROM students WHERE status='ACTIVE'`
    );
    res.json(rows);
});

/* =========================
   GET MARKS (READ ONLY)
========================= */
router.get("/marks", async (req, res) => {
    const facultyId = req.session.faculty.id;

    const [rows] = await db.query(
        `
        SELECT id, subject_code, subject_name,
               semester, exam_phase, row_data
        FROM academic_uploads
        WHERE uploaded_by = ?
        ORDER BY uploaded_at DESC
        `,
        [facultyId]
    );

    const result = rows.map(r => {
        const parsed = safeParseJSON(r.row_data);
        return {
            id: r.id,
            subject_code: r.subject_code,
            subject_name: r.subject_name,
            semester: r.semester,
            exam_phase: r.exam_phase,
            ...parsed
        };
    });

    res.json(result);
});

/* =========================
   UPLOAD MARKS
========================= */
router.post("/upload-marks", upload.single("file"), async (req, res) => {
    try {
        const { subject_code, subject_name, semester, exam_phase } = req.body;
        const facultyId = req.session.faculty.id;

        if (!req.file || !subject_code || !semester || !exam_phase) {
            return res.status(400).json({ error: "Missing data" });
        }

        const ext = req.file.originalname.split(".").pop().toLowerCase();
        let rawRows = [];

        if (ext === "xlsx") {
            const wb = xlsx.readFile(req.file.path);
            rawRows = xlsx.utils.sheet_to_json(
                wb.Sheets[wb.SheetNames[0]], { defval: "" }
            );
        } else {
            await new Promise((resolve, reject) => {
                fs.createReadStream(req.file.path)
                    .pipe(csv())
                    .on("data", r => rawRows.push(r))
                    .on("end", resolve)
                    .on("error", reject);
            });
        }

        fs.unlinkSync(req.file.path);

        const [students] = await db.query(
            `SELECT register_no FROM students WHERE status='ACTIVE'`
        );
        const validSet = new Set(students.map(s => s.register_no));

        let inserted = 0;

        for (const r of rawRows.map(normalizeRow)) {
            const reg = r.register_number || r.register_no || r.regno || r.reg_no;
            if (!reg) continue;

            const cleanReg = reg.toString().trim();
            if (!validSet.has(cleanReg)) continue;

            r._features = extractFeatures(r);

            await db.query(
                `
                INSERT INTO academic_uploads
                (register_number, subject_code, subject_name,
                 semester, exam_phase, row_data, uploaded_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    cleanReg,
                    subject_code,
                    subject_name || null,
                    semester,
                    exam_phase,
                    JSON.stringify(r),
                    facultyId
                ]
            );

            inserted++;
        }

        res.json({ message: `Stored ${inserted} valid rows` });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

/* =========================
   UPDATE MARK (SAFE)
========================= */
router.put("/update-mark/:id", async (req, res) => {
    const facultyId = req.session.faculty.id;
    const id = req.params.id;

    const [rows] = await db.query(
        `SELECT row_data FROM academic_uploads WHERE id=? AND uploaded_by=?`,
        [id, facultyId]
    );

    if (!rows.length) {
        return res.status(404).json({ error: "Not found" });
    }

    const existing = safeParseJSON(rows[0].row_data);

    // 🔒 Never trust client features
    delete existing._features;

    const updated = { ...existing, ...req.body };
    updated._features = extractFeatures(updated);

    await db.query(
        `UPDATE academic_uploads SET row_data=? WHERE id=?`,
        [JSON.stringify(updated), id]
    );

    res.json({ message: "Updated successfully" });
});

/* =========================
   DELETE MARK
========================= */
router.delete("/delete-mark/:id", async (req, res) => {
    const facultyId = req.session.faculty.id;
    const id = req.params.id;

    const [r] = await db.query(
        `DELETE FROM academic_uploads WHERE id=? AND uploaded_by=?`,
        [id, facultyId]
    );

    if (!r.affectedRows) {
        return res.status(404).json({ error: "Not found" });
    }

    res.json({ message: "Deleted successfully" });
});

module.exports = router;
