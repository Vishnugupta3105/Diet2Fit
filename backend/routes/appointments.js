const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/appointments
 * Book a consultation (public or authenticated)
 */
router.post('/', (req, res) => {
  const { client_name, client_email, client_phone, type, goal, preferred_date, preferred_time, notes, client_id } = req.body;

  if (!client_name || !client_phone) {
    return res.status(400).json({ error: 'Name and phone number are required.' });
  }

  const roomId = uuidv4().slice(0, 8);

  const result = db.prepare(`
    INSERT INTO appointments (client_id, client_name, client_email, client_phone, type, goal, preferred_date, preferred_time, notes, room_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    client_id || null,
    client_name,
    client_email || null,
    client_phone,
    type || 'video',
    goal || null,
    preferred_date || null,
    preferred_time || null,
    notes || null,
    roomId
  );

  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ appointment });
});

/**
 * GET /api/appointments
 * Get appointments (filtered by role)
 */
router.get('/', authenticate, (req, res) => {
  const { status, from, to } = req.query;

  let query, params;

  if (req.user.role === 'admin') {
    query = 'SELECT * FROM appointments WHERE 1=1';
    params = [];
  } else {
    query = 'SELECT * FROM appointments WHERE client_id = ?';
    params = [req.user.id];
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (from) {
    query += ' AND preferred_date >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND preferred_date <= ?';
    params.push(to);
  }

  query += ' ORDER BY created_at DESC';

  const appointments = db.prepare(query).all(...params);
  res.json({ appointments });
});

/**
 * GET /api/appointments/:id
 * Get single appointment details
 */
router.get('/:id', authenticate, (req, res) => {
  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  
  if (!appointment) {
    return res.status(404).json({ error: 'Appointment not found.' });
  }

  // Only admin or the appointment's client can view
  if (req.user.role !== 'admin' && appointment.client_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized.' });
  }

  res.json({ appointment });
});

/**
 * PUT /api/appointments/:id
 * Update appointment status (admin only)
 */
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { status, preferred_date, preferred_time, notes, type } = req.body;

  const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Appointment not found.' });
  }

  db.prepare(`
    UPDATE appointments SET 
      status = COALESCE(?, status),
      preferred_date = COALESCE(?, preferred_date),
      preferred_time = COALESCE(?, preferred_time),
      notes = COALESCE(?, notes),
      type = COALESCE(?, type),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(status, preferred_date, preferred_time, notes, type, req.params.id);

  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  res.json({ appointment });
});

/**
 * DELETE /api/appointments/:id
 * Cancel appointment (admin only)
 */
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Appointment not found.' });
  }

  db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);
  res.json({ message: 'Appointment deleted.' });
});

module.exports = router;
