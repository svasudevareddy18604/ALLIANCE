require("dotenv").config();
require("./db");

const express = require("express");
const path = require("path");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const db = require("./db");

const app = express();

/* =========================
   SERVER CONFIG
========================= */
const PORT = process.env.PORT || 3000;

/*
 IMPORTANT:
 - Bind to ALL interfaces
 - Do NOT bind to WSL IP or localhost
*/
const HOST = "0.0.0.0";

/* =========================
   WORKING DIRECTORY
========================= */
process.chdir(__dirname);

/* =========================
   SESSION STORE (MYSQL)
========================= */
const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 30 * 60 * 1000
  },
  db
);

/* =========================
   SESSION CONFIG (CORRECT FOR HTTP + MOBILE)
========================= */
app.use(
  session({
    name: "alliance.sid",
    secret: process.env.SESSION_SECRET || "alliance_dev_secret",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: false,      // HTTP only
      sameSite: "lax",    // ✅ CORRECT (DO NOT USE "none" on HTTP)
      maxAge: 30 * 60 * 1000
    }
  })
);

/* =========================
   BODY PARSERS
========================= */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   STATIC FILES
========================= */
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* =========================
   DEFAULT ENTRY
========================= */
app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public/student/studentlogin.html")
  );
});

/* =========================
   ROUTE IMPORTS
========================= */

/* ---- DEAN ---- */
const deanLoginRoutes = require("./routes/deanlogin.routes");
const deanDashboardRoutes = require("./routes/deandashboard.routes");
const deanFacultyRoutes = require("./routes/deanfaculty.routes");
const deanStudentRoutes = require("./routes/deanstudent.routes");
const deanMentorRoutes = require("./routes/deansection.routes");
const deanSectionCourseRoutes = require("./routes/deansectioncourse.routes");

/* ---- FACULTY ---- */
const facultyStudentsRoutes = require("./routes/facultystudents.routes");
const facultyRoutes = require("./routes/faculty.routes");
const facultyEmailRoutes = require("./routes/facultyemail.routes");
const facultySurveyRoutes = require("./routes/facultysurvey.routes");
const facultyCreateSurveyRoutes = require("./routes/facultycreatesurvey.routes");
const facultyUploadMarksRoutes = require("./routes/facultyuploadmarks.routes");
const facultyReportsRoutes = require("./routes/facultyreports.routes");
const facultyFinalReportRoutes = require("./routes/facultyfinalreport.routes");
const facultyVideoRoutes = require("./routes/facultyvideo.routes");
const facultyFeedbackRoutes = require("./routes/facultyFeedback.routes");
const facultyFeedbackEmailRoutes = require("./routes/facultyfeedbackemail.routes");
const facultyChatRoutes = require("./routes/facultychat.routes");
const facultyStudentSurveyAnswersRoutes =
  require("./routes/facultystudentsurveyanswers.routes");

/* ---- STUDENT ---- */
const studentRoutes = require("./routes/student.routes");
const studentSurveyRoutes = require("./routes/studentsurvey.routes");
const studentAcademicRoutes = require("./routes/studentacademic.routes");
const studentMentorRoutes = require("./routes/studentmentor.routes");
const studentVideoRoutes = require("./routes/studentvideo.routes");
const studentReportsRoutes = require("./routes/studentreports.routes");
const studentFullReportRoutes = require("./routes/studentfullreport.routes");
const studentFeedbackRoutes = require("./routes/studentFeedback.routes");
const studentChatRoutes = require("./routes/studentchat.routes");

/* =========================
   ROUTE MOUNTING
========================= */

/* ---- DEAN ---- */
app.use("/dean", deanLoginRoutes);
app.use("/dean/dashboard", deanDashboardRoutes);
app.use("/dean/faculty", deanFacultyRoutes);
app.use("/dean/students", deanStudentRoutes);
app.use("/dean/mentors", deanMentorRoutes);
app.use("/api/dean/sections", deanSectionCourseRoutes);

/* ---- FACULTY ---- */
app.use("/faculty/students", facultyStudentsRoutes);
app.use("/faculty", facultyRoutes);
app.use("/faculty", facultyEmailRoutes);
app.use("/faculty", facultySurveyRoutes);
app.use("/faculty", facultyCreateSurveyRoutes);
app.use("/faculty", facultyUploadMarksRoutes);
app.use("/faculty/reports", facultyReportsRoutes);
app.use("/faculty/reports", facultyFinalReportRoutes);
app.use("/faculty/videos", facultyVideoRoutes);
app.use("/faculty/feedback", facultyFeedbackRoutes);
app.use("/faculty/feedback-email", facultyFeedbackEmailRoutes);
app.use("/faculty/chat", facultyChatRoutes);
app.use("/faculty", facultyStudentSurveyAnswersRoutes);

/* ---- STUDENT ---- */
app.use("/student", studentRoutes);
app.use("/student", studentSurveyRoutes);
app.use("/student", studentAcademicRoutes);
app.use("/student/mentor", studentMentorRoutes);
app.use("/student/videos", studentVideoRoutes);
app.use("/student/reports", studentReportsRoutes);
app.use("/student/final-report", studentFullReportRoutes);
app.use("/student/feedback", studentFeedbackRoutes);
app.use("/student/chat", studentChatRoutes);

/* =========================
   DEBUG SESSION
========================= */
app.get("/debug-session", (req, res) => {
  res.json({
    sessionExists: !!req.session,
    student: req.session.student || null,
    faculty: req.session.faculty || null,
    dean: req.session.dean || null,
    expiresAt: req.session.cookie?.expires || null
  });
});

/* =========================
   404 FALLBACK
========================= */
app.use((req, res) => {
  res.status(404).send("❌ Page not found");
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, HOST, () => {
  console.log("✅ Alliance Server started");
  console.log(`➡ Open on mobile: http://10.1.72.74:${PORT}`);
});
