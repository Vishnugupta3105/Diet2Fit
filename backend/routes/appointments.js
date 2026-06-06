const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/appointments
 * Book a consultation (public or authenticated)
 */
router.post('/', async (req, res) => {
  try {
    const { client_name, client_email, client_phone, type, goal, preferred_date, preferred_time, notes, client_id } = req.body;

    if (!client_name || !client_phone) {
      return res.status(400).json({ error: 'Name and phone number are required.' });
    }

    const roomId = uuidv4().slice(0, 8);

    const result = await db.query(`
      INSERT INTO appointments (client_id, client_name, client_email, client_phone, type, goal, preferred_date, preferred_time, notes, room_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `, [
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
    ]);

    // Mark the slot as booked if a matching slot exists
    if (preferred_date && preferred_time) {
      await db.query(
        'UPDATE available_slots SET is_booked = true, booked_by = $1 WHERE slot_date = $2 AND slot_time = $3 AND is_booked = false',
        [client_id || null, preferred_date, preferred_time]
      );
    }

    const appointmentRes = await db.query('SELECT * FROM appointments WHERE id = $1', [result.rows[0].id]);
    res.status(201).json({ appointment: appointmentRes.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/appointments
 * Get appointments (filtered by role)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, from, to } = req.query;

    let query, params;
    let paramIndex = 1;

    if (req.user.role === 'admin') {
      query = 'SELECT * FROM appointments WHERE 1=1';
      params = [];
    } else {
      query = 'SELECT * FROM appointments WHERE client_id = $1';
      params = [req.user.id];
      paramIndex = 2;
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(status);
    }
    if (from) {
      query += ` AND preferred_date >= $${paramIndex++}`;
      params.push(from);
    }
    if (to) {
      query += ` AND preferred_date <= $${paramIndex++}`;
      params.push(to);
    }

    query += ' ORDER BY created_at DESC';

    const appointmentsRes = await db.query(query, params);
    res.json({ appointments: appointmentsRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/appointments/:id
 * Get single appointment details
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const appointmentRes = await db.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    const appointment = appointmentRes.rows[0];
    
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    // Only admin or the appointment's client can view
    if (req.user.role !== 'admin' && appointment.client_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    res.json({ appointment });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/appointments/:id
 * Update appointment status (admin only)
 */
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { status, preferred_date, preferred_time, notes, type } = req.body;

    const existingRes = await db.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    await db.query(`
      UPDATE appointments SET 
        status = COALESCE($1, status),
        preferred_date = COALESCE($2, preferred_date),
        preferred_time = COALESCE($3, preferred_time),
        notes = COALESCE($4, notes),
        type = COALESCE($5, type),
        updated_at = NOW()
      WHERE id = $6
    `, [status, preferred_date, preferred_time, notes, type, req.params.id]);

    const appointmentRes = await db.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    res.json({ appointment: appointmentRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/appointments/:id
 * Cancel appointment (admin only)
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const existingRes = await db.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    await db.query('DELETE FROM appointments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Appointment deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/appointments/:id/link
 * Link an appointment to a newly registered client
 */
router.put('/:id/link', async (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required.' });
    }

    const existingRes = await db.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    await db.query(
      'UPDATE appointments SET client_id = $1, updated_at = NOW() WHERE id = $2',
      [client_id, req.params.id]
    );

    // Also update the slot's booked_by
    const appt = existingRes.rows[0];
    if (appt.preferred_date && appt.preferred_time) {
      await db.query(
        'UPDATE available_slots SET booked_by = $1 WHERE slot_date = $2 AND slot_time = $3',
        [client_id, appt.preferred_date, appt.preferred_time]
      );
    }

    const updatedRes = await db.query('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    res.json({ appointment: updatedRes.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
