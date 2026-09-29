require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const pool = require("../src/db/pool");

async function init() {
  try {
    const schema = fs.readFileSync(
      path.join(__dirname, "../src/db/schema.sql"),
      "utf8"
    );

    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    await pool.query(schema);

    console.log("ChitFlow database schema initialized.");
  } catch (error) {
    console.error("Database initialization failed:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

init();
