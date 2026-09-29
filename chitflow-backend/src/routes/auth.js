const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || null
  };
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, role = "member", phone = null } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required.",
        code: "VALIDATION"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters.",
        code: "VALIDATION"
      });
    }

    if (!["organizer", "member"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account role.",
        code: "VALIDATION"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);

    if (existing.rowCount) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
        code: "DUPLICATE"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, phone`,
      [name.trim(), normalizedEmail, passwordHash, role, phone]
    );

    const user = result.rows[0];

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description)
       VALUES ($1, 'REGISTER_USER', 'User', $2, $3)`,
      [user.id, user.id, `Created ${user.role} account for ${user.email}.`]
    );

    return res.status(201).json({
      success: true,
      data: { user: publicUser(user), token: createToken(user) }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Enter your email and password.",
        code: "VALIDATION"
      });
    }

    const result = await pool.query(
      `SELECT id, name, email, role, phone, password_hash
       FROM users
       WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
        code: "UNAUTHORIZED"
      });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
        code: "UNAUTHORIZED"
      });
    }

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, description)
       VALUES ($1, 'LOGIN', 'User', $2, $3)`,
      [user.id, user.id, `Successful login for ${user.email}.`]
    );

    return res.json({
      success: true,
      data: { user: publicUser(user), token: createToken(user) }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, role, phone FROM users WHERE id = $1",
      [req.user.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "User account not found.",
        code: "NOT_FOUND"
      });
    }

    res.json({ success: true, data: publicUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
