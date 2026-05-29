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
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required').trim(),
  validate
], async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

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

module.exports = router;
