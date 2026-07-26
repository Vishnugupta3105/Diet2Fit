const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../db/database');
const { authenticate, generateToken } = require('../middleware/auth');

const router = express.Router();

// Helper middleware for validation results
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  next();
};

/**
 * POST /api/auth/login
 * Login with email + password, returns JWT
 */
router.post('/login', [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail({ gmail_remove_dots: false }),
  body('password').notEmpty().withMessage('Password is required').trim(),
  validate
], async (req, res) => {
  try {
    const { email, password } = req.body;

    let result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    let user = result.rows[0];

    // Backward compatibility: old accounts may have been stored with dots removed from Gmail
    if (!user && email.includes('@gmail.com')) {
      const [localPart, domain] = email.split('@');
      const dotlessEmail = localPart.replace(/\./g, '') + '@' + domain;
      if (dotlessEmail !== email) {
        result = await db.query('SELECT * FROM users WHERE email = $1', [dotlessEmail]);
        user = result.rows[0];
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        goal_weight: user.goal_weight,
        height_cm: user.height_cm,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile (requires auth)
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, email, phone, role, goal_weight, height_cm, gender, date_of_birth, created_at FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/auth/profile
 * Update own profile (requires auth)
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name, phone, goal_weight, height_cm, gender, date_of_birth } = req.body;
    
    await db.query(`
      UPDATE users SET 
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        goal_weight = COALESCE($3, goal_weight),
        height_cm = COALESCE($4, height_cm),
        gender = COALESCE($5, gender),
        date_of_birth = COALESCE($6, date_of_birth),
        updated_at = NOW()
      WHERE id = $7
    `, [name, phone, goal_weight, height_cm, gender, date_of_birth, req.user.id]);

    const result = await db.query('SELECT id, name, email, phone, role, goal_weight, height_cm, gender, date_of_birth FROM users WHERE id = $1', [req.user.id]);
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/auth/password
 * Change own password (requires auth)
 */
router.put('/password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const userRes = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    const hash = bcrypt.hashSync(new_password, 10);
    await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/register
 * Register a new client account (public endpoint, used after booking)
 */
router.post('/register', [
  body('name').notEmpty().withMessage('Name is required').trim(),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail({ gmail_remove_dots: false }),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters').trim(),
  validate
], async (req, res) => {
  try {
    const { name, email, phone, password, weight_kg, height_cm } = req.body;

    // Check if email already exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = await db.query(`
      INSERT INTO users (name, email, phone, password_hash, role, height_cm)
      VALUES ($1, $2, $3, $4, 'client', $5)
      RETURNING id, name, email, phone, role
    `, [name, email, phone || null, hash, height_cm || null]);

    const user = result.rows[0];
    
    if (weight_kg) {
      // Log initial weight
      const today = new Date().toISOString().split('T')[0];
      await db.query(`
        INSERT INTO weight_logs (user_id, weight_kg, date, notes)
        VALUES ($1, $2, $3, 'Initial weight from booking')
      `, [user.id, weight_kg, today]);
    }

    const token = generateToken(user);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
