const mysql = require("mysql2/promise");
require("dotenv").config();

const isSSL = process.env.DB_SSL === "true";

const db = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "alliance",

    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    connectTimeout: 30000,

    ssl: isSSL
        ? {
              rejectUnauthorized: false
          }
        : undefined
});

/* =========================
   CONNECTION TEST
========================= */
(async () => {
    try {
        const conn = await db.getConnection();
        console.log("✅ Connected to MySQL successfully");
        conn.release();
    } catch (err) {
        console.error("❌ MySQL connection failed:");
        console.error(err);
    }
})();

module.exports = db;