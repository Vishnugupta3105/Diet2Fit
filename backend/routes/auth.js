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
], (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
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
});

/**
 * GET /api/auth/me
 * Get current user profile (requires auth)
 */
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare('SELECT id, name, email, phone, role, goal_weight, height_cm, gender, date_of_birth, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json({ user });
});

/**
 * PUT /api/auth/profile
 * Update own profile (requires auth)
 */
router.put('/profile', authenticate, (req, res) => {
  const { name, phone, goal_weight, height_cm, gender, date_of_birth } = req.body;
  
  db.prepare(`
    UPDATE users SET 
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      goal_weight = COALESCE(?, goal_weight),
      height_cm = COALESCE(?, height_cm),
      gender = COALESCE(?, gender),
      date_of_birth = COALESCE(?, date_of_birth),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(name, phone, goal_weight, height_cm, gender, date_of_birth, req.user.id);

  const user = db.prepare('SELECT id, name, email, phone, role, goal_weight, height_cm, gender, date_of_birth FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

/**
 * PUT /api/auth/password
 * Change own password (requires auth)
 */
router.put('/password', authenticate, (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Password updated successfully.' });
});

module.exports = router;
