const express = require("express");
const db = require("../db");
const router = express.Router();

/* =========================
   AUTH MIDDLEWARE
========================= */
function studentAuth(req, res, next) {
    if (!req.session.student) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

/* =========================
   GET ACTIVE SURVEY
========================= */
router.get("/surveys/active", studentAuth, async (req, res) => {
    try {
        const { section, id: studentId } = req.session.student;

        const [[survey]] = await db.query(
            `SELECT id, title
             FROM surveys
             WHERE section = ?
               AND status = 'PUBLISHED'
             ORDER BY created_at DESC
             LIMIT 1`,
            [section]
        );

        if (!survey) return res.json({});

        const [[submitted]] = await db.query(
            `SELECT 1
             FROM survey_submissions
             WHERE survey_id = ? AND student_id = ?
             LIMIT 1`,
            [survey.id, studentId]
        );

        if (submitted) {
            return res.json({
                id: survey.id,
                title: survey.title,
                submitted: true
            });
        }

        const [questions] = await db.query(
            `SELECT id, question_text, question_type
             FROM survey_questions
             WHERE survey_id = ?`,
            [survey.id]
        );

        for (const q of questions) {
            if (q.question_type === "mcq") {
                const [opts] = await db.query(
                    `SELECT option_text
                     FROM survey_options
                     WHERE question_id = ?`,
                    [q.id]
                );
                q.options = opts.map(o => o.option_text);
            } else {
                q.options = [];
            }
        }

        res.json({
            id: survey.id,
            title: survey.title,
            submitted: false,
            questions
        });

    } catch (err) {
        console.error("ACTIVE SURVEY ERROR:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/* =========================
   SUBMIT SURVEY (CORRECT)
========================= */
router.post("/surveys/submit", studentAuth, async (req, res) => {
    const conn = await db.getConnection();

    try {
        const { survey_id, responses } = req.body;
        const studentId = req.session.student.id;

        if (!survey_id || !Array.isArray(responses) || responses.length === 0) {
            return res.status(400).json({ error: "Invalid submission payload" });
        }

        await conn.beginTransaction();

        /* BLOCK DUPLICATE */
        const [[exists]] = await conn.query(
            `SELECT 1
             FROM survey_submissions
             WHERE survey_id = ? AND student_id = ?
             LIMIT 1`,
            [survey_id, studentId]
        );

        if (exists) {
            await conn.rollback();
            return res.status(403).json({ error: "Survey already submitted" });
        }

        /* VALIDATE ALL QUESTIONS FIRST */
        for (const r of responses) {
            if (!r.question_id || r.answer_value === undefined || r.answer_value === "") {
                throw new Error("Empty answer detected");
            }

            const [[q]] = await conn.query(
                `SELECT feature_name
                 FROM survey_questions
                 WHERE id = ? AND survey_id = ?`,
                [r.question_id, survey_id]
            );

            if (!q || !q.feature_name) {
                throw new Error(`Invalid question_id ${r.question_id}`);
            }
        }

        /* CREATE SUBMISSION ONLY AFTER VALIDATION */
        const [subRes] = await conn.query(
            `INSERT INTO survey_submissions (survey_id, student_id)
             VALUES (?, ?)`,
            [survey_id, studentId]
        );

        const submissionId = subRes.insertId;

        /* INSERT ANSWERS */
        for (const r of responses) {

            const [[q]] = await conn.query(
                `SELECT feature_name
                 FROM survey_questions
                 WHERE id = ?`,
                [r.question_id]
            );

            await conn.query(
                `INSERT INTO survey_responses
                 (survey_id, question_id, student_id, answer_text)
                 VALUES (?, ?, ?, ?)`,
                [survey_id, r.question_id, studentId, r.answer_value]
            );

            await conn.query(
                `INSERT INTO survey_answers_ml
                 (submission_id, feature_name, answer_value)
                 VALUES (?, ?, ?)`,
                [submissionId, q.feature_name, r.answer_value]
            );
        }

        await conn.commit();
        res.json({ success: true });

    } catch (err) {
        await conn.rollback();
        console.error("SUBMIT SURVEY ERROR:", err);
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

/* =========================
   GET SUBMITTED SURVEYS
========================= */
router.get("/surveys/submitted", studentAuth, async (req, res) => {
    try {
        const studentId = req.session.student.id;

        const [rows] = await db.query(
            `SELECT
                s.id AS survey_id,
                s.title,
                sub.created_at AS submitted_at,
                q.question_text,
                r.answer_text
             FROM survey_submissions sub
             JOIN surveys s ON s.id = sub.survey_id
             JOIN survey_responses r 
               ON r.survey_id = sub.survey_id 
              AND r.student_id = sub.student_id
             JOIN survey_questions q ON q.id = r.question_id
             WHERE sub.student_id = ?
             ORDER BY sub.created_at DESC`,
            [studentId]
        );

        const result = {};
        for (const row of rows) {
            if (!result[row.survey_id]) {
                result[row.survey_id] = {
                    title: row.title,
                    submitted_at: row.submitted_at,
                    responses: []
                };
            }
            result[row.survey_id].responses.push({
                question: row.question_text,
                answer: row.answer_text
            });
        }

        res.json(Object.values(result));

    } catch (err) {
        console.error("FETCH SUBMITTED SURVEYS ERROR:", err);
        res.status(500).json({ error: "Server error" });
    }
});

module.exports = router;
