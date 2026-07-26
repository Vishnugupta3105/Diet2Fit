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
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { search, sort = 'created_at', order = 'DESC' } = req.query;

    let query = `SELECT id, name, email, phone, goal_weight, height_cm, gender, created_at FROM users WHERE role = 'client'`;
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex + 1} OR phone ILIKE $${paramIndex + 2})`;
      const s = `%${search}%`;
      params.push(s, s, s);
      paramIndex += 3;
    }

    const allowedSorts = ['name', 'email', 'created_at'];
    const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortCol} ${sortOrder}`;

    const clientsRes = await db.query(query, params);
    const clients = clientsRes.rows;

    // Attach latest weight, appt count, and active plan for each client
    const enriched = await Promise.all(clients.map(async (client) => {
      const weightRes = await db.query(`
        SELECT weight_kg, date FROM weight_logs 
        WHERE user_id = $1 ORDER BY date DESC LIMIT 1
      `, [client.id]);
      const apptCountRes = await db.query(`
        SELECT COUNT(*) as count FROM appointments WHERE client_id = $1
      `, [client.id]);
      const planRes = await db.query(`
        SELECT plan_name, expires_at FROM plan_orders 
        WHERE user_id = $1 AND status = 'paid' AND expires_at > NOW() 
        ORDER BY expires_at DESC LIMIT 1
      `, [client.id]);

      let days_left = null;
      if (planRes.rows.length > 0) {
        const expiresAt = new Date(planRes.rows[0].expires_at);
        days_left = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
      }

      return {
        ...client,
        latest_weight: weightRes.rows.length > 0 ? weightRes.rows[0].weight_kg : null,
        appointment_count: apptCountRes.rows[0].count,
        active_plan: planRes.rows.length > 0 ? planRes.rows[0].plan_name : null,
        plan_days_left: days_left
      };
    }));

    res.json({ clients: enriched });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
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
], async (req, res) => {
  try {
    const { name, email, phone, password, current_weight, goal_weight, height_cm, gender, date_of_birth, notes } = req.body;

    const existingRes = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingRes.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }

    const hash = bcrypt.hashSync(password, 10);

    const result = await db.query(`
      INSERT INTO users (name, email, phone, password_hash, role, goal_weight, height_cm, gender, date_of_birth, notes)
      VALUES ($1, $2, $3, $4, 'client', $5, $6, $7, $8, $9)
      RETURNING id
    `, [name, email, phone, hash, goal_weight || null, height_cm || null, gender || null, date_of_birth || null, notes || null]);
    
    const newUserId = result.rows[0].id;

    if (current_weight) {
      await db.query(`
        INSERT INTO weight_logs (user_id, weight_kg, date, notes)
        VALUES ($1, $2, CURRENT_DATE, 'Initial weight')
      `, [newUserId, current_weight]);
    }

    const clientRes = await db.query('SELECT id, name, email, phone, role, goal_weight, height_cm, gender, created_at FROM users WHERE id = $1', [newUserId]);
    res.status(201).json({ client: clientRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/clients/:id
 * Get single client details (admin only)
 */
router.get('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const clientRes = await db.query(`
      SELECT id, name, email, phone, role, goal_weight, height_cm, gender, age, date_of_birth, notes, created_at 
      FROM users WHERE id = $1 AND role = 'client'
    `, [req.params.id]);

    if (clientRes.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    const weightsRes = await db.query('SELECT * FROM weight_logs WHERE user_id = $1 ORDER BY date DESC', [req.params.id]);
    const appointmentsRes = await db.query('SELECT * FROM appointments WHERE client_id = $1 ORDER BY created_at DESC', [req.params.id]);

    res.json({ client: clientRes.rows[0], weights: weightsRes.rows, appointments: appointmentsRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/clients/:id
 * Update client (admin only)
 */
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, goal_weight, height_cm, gender, date_of_birth, notes, password } = req.body;

    const existingRes = await db.query('SELECT id FROM users WHERE id = $1 AND role = $2', [req.params.id, 'client']);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    if (email) {
      const emailCheckRes = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, req.params.id]);
      if (emailCheckRes.rows.length > 0) {
        return res.status(409).json({ error: 'Email already in use by another user.' });
      }
    }

    await db.query(`
      UPDATE users SET 
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        goal_weight = COALESCE($4, goal_weight),
        height_cm = COALESCE($5, height_cm),
        gender = COALESCE($6, gender),
        date_of_birth = COALESCE($7, date_of_birth),
        notes = COALESCE($8, notes),
        updated_at = NOW()
      WHERE id = $9
    `, [name, email || null, phone, goal_weight, height_cm, gender, date_of_birth, notes, req.params.id]);

    if (password && password.length >= 6) {
      const hash = bcrypt.hashSync(password, 10);
      await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.id]);
    }

    const clientRes = await db.query('SELECT id, name, email, phone, role, goal_weight, height_cm, gender, age, date_of_birth, notes, created_at FROM users WHERE id = $1', [req.params.id]);
    res.json({ client: clientRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/clients/:id
 * Remove client (admin only)
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const existingRes = await db.query('SELECT id FROM users WHERE id = $1 AND role = $2', [req.params.id, 'client']);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'Client deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
