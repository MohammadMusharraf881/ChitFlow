require("dotenv").config();
const bcrypt = require("bcryptjs");
const pool = require("../src/db/pool");

async function seed() {
  const passwordHash = await bcrypt.hash("demo-password", 12);

  const users = [
    ["Vikram Malhotra", "organizer@chitflow.test", "organizer"],
    ["Rahul Sharma", "member@chitflow.test", "member"]
  ];

  for (const [name, email, role] of users) {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [name, email, passwordHash, role]
    );
  }

  console.log("Demo users ready.");
  console.log("Organizer: organizer@chitflow.test / demo-password");
  console.log("Member: member@chitflow.test / demo-password");
  await pool.end();
}

seed().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
