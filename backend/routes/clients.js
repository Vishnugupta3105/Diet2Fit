const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  next();
};

/**
 * GET /api/clients
 * List all clients (admin only)
 */
router.get('/', authenticate, requireAdmin, (req, res) => {
  const { search, sort = 'created_at', order = 'DESC' } = req.query;

  let query = `SELECT id, name, email, phone, goal_weight, height_cm, gender, created_at FROM users WHERE role = 'client'`;
  const params = [];

  if (search) {
    query += ` AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  // Sanitize sort column
  const allowedSorts = ['name', 'email', 'created_at'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
  const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${sortCol} ${sortOrder}`;

  const clients = db.prepare(query).all(...params);

  // Attach latest weight for each client
  const weightStmt = db.prepare(`
    SELECT weight_kg, date FROM weight_logs 
    WHERE user_id = ? ORDER BY date DESC LIMIT 1
  `);
  const appointmentCountStmt = db.prepare(`
    SELECT COUNT(*) as count FROM appointments WHERE client_id = ?
  `);

  const enriched = clients.map(client => {
    const latestWeight = weightStmt.get(client.id);
    const apptCount = appointmentCountStmt.get(client.id);
    return {
      ...client,
      latest_weight: latestWeight ? latestWeight.weight_kg : null,
      latest_weight_date: latestWeight ? latestWeight.date : null,
      appointment_count: apptCount.count,
    };
  });

  res.json({ clients: enriched });
});

/**
 * POST /api/clients
 * Create a new client (admin only)
 */
router.post('/', authenticate, requireAdmin, [
  body('name').notEmpty().withMessage('Name is required').trim().escape(),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('phone').optional({ checkFalsy: true }).trim().escape(),
  body('notes').optional({ checkFalsy: true }).trim().escape(),
  validate
], (req, res) => {
  const { name, email, phone, password, current_weight, goal_weight, height_cm, gender, date_of_birth, notes } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'A user with this email already exists.' });
  }

  const hash = bcrypt.hashSync(password, 10);

  const result = db.prepare(`
    INSERT INTO users (name, email, phone, password_hash, role, goal_weight, height_cm, gender, date_of_birth, notes)
    VALUES (?, ?, ?, ?, 'client', ?, ?, ?, ?, ?)
  `).run(name, email.toLowerCase().trim(), phone, hash, goal_weight || null, height_cm || null, gender || null, date_of_birth || null, notes || null);

  if (current_weight) {
    db.prepare(`
      INSERT INTO weight_logs (user_id, weight_kg, date, notes)
      VALUES (?, ?, date('now', 'localtime'), 'Initial weight')
    `).run(result.lastInsertRowid, current_weight);
  }

  const client = db.prepare('SELECT id, name, email, phone, role, goal_weight, height_cm, gender, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json({ client });
});

/**
 * GET /api/clients/:id
 * Get single client details (admin only)
 */
router.get('/:id', authenticate, requireAdmin, (req, res) => {
  const client = db.prepare(`
    SELECT id, name, email, phone, role, goal_weight, height_cm, gender, date_of_birth, notes, created_at 
    FROM users WHERE id = ? AND role = 'client'
  `).get(req.params.id);

  if (!client) {
    return res.status(404).json({ error: 'Client not found.' });
  }

  // Get weight history
  const weights = db.prepare('SELECT * FROM weight_logs WHERE user_id = ? ORDER BY date DESC').all(req.params.id);

  // Get appointments
  const appointments = db.prepare('SELECT * FROM appointments WHERE client_id = ? ORDER BY created_at DESC').all(req.params.id);

  res.json({ client, weights, appointments });
});

/**
 * PUT /api/clients/:id
 * Update client (admin only)
 */
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { name, email, phone, goal_weight, height_cm, gender, date_of_birth, notes, password } = req.body;

  const existing = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(req.params.id, 'client');
  if (!existing) {
    return res.status(404).json({ error: 'Client not found.' });
  }

  // Check email uniqueness if changing
  if (email) {
    const emailCheck = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.toLowerCase().trim(), req.params.id);
    if (emailCheck) {
      return res.status(409).json({ error: 'Email already in use by another user.' });
    }
  }

  db.prepare(`
    UPDATE users SET 
      name = COALESCE(?, name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      goal_weight = COALESCE(?, goal_weight),
      height_cm = COALESCE(?, height_cm),
      gender = COALESCE(?, gender),
      date_of_birth = COALESCE(?, date_of_birth),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(name, email ? email.toLowerCase().trim() : null, phone, goal_weight, height_cm, gender, date_of_birth, notes, req.params.id);

  // Update password if provided
  if (password && password.length >= 6) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  }

  const client = db.prepare('SELECT id, name, email, phone, role, goal_weight, height_cm, gender, date_of_birth, notes, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json({ client });
});

/**
 * DELETE /api/clients/:id
 * Remove client (admin only)
 */
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT id FROM users WHERE id = ? AND role = ?').get(req.params.id, 'client');
  if (!existing) {
    return res.status(404).json({ error: 'Client not found.' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Client deleted successfully.' });
});

module.exports = router;
