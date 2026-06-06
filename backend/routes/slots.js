const express = require('express');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/slots?date=YYYY-MM-DD
 * Public — Returns available (unbooked) slots for a given date
 */
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'date query parameter is required (YYYY-MM-DD)' });
    }

    const result = await db.query(
      'SELECT id, slot_date, slot_time, is_booked FROM available_slots WHERE slot_date = $1 AND is_booked = false ORDER BY slot_time ASC',
      [date]
    );
    res.json({ slots: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/slots/dates?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Public — Returns dates that have available slots in the given range
 */
router.get('/dates', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query parameters are required' });
    }

    const result = await db.query(
      `SELECT DISTINCT slot_date FROM available_slots 
       WHERE slot_date >= $1 AND slot_date <= $2 AND is_booked = false 
       ORDER BY slot_date ASC`,
      [from, to]
    );
    res.json({ dates: result.rows.map(r => r.slot_date) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/slots/all
 * Admin only — Returns all slots (booked + unbooked) 
 */
router.get('/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    let query = 'SELECT s.*, u.name as booked_by_name FROM available_slots s LEFT JOIN users u ON s.booked_by = u.id';
    const params = [];
    let paramIndex = 1;

    if (from && to) {
      query += ` WHERE s.slot_date >= $${paramIndex++} AND s.slot_date <= $${paramIndex++}`;
      params.push(from, to);
    }
    query += ' ORDER BY s.slot_date ASC, s.slot_time ASC';

    const result = await db.query(query, params);
    res.json({ slots: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/slots
 * Admin only — Create available slots (supports bulk creation)
 * Body: { slots: [{ date: "2026-06-10", time: "09:00" }, ...] }
 */
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { slots } = req.body;
    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'slots array is required. Each slot needs date and time.' });
    }

    const created = [];
    const skipped = [];

    for (const slot of slots) {
      if (!slot.date || !slot.time) {
        skipped.push({ ...slot, reason: 'Missing date or time' });
        continue;
      }
      try {
        const result = await db.query(
          'INSERT INTO available_slots (slot_date, slot_time) VALUES ($1, $2) ON CONFLICT (slot_date, slot_time) DO NOTHING RETURNING *',
          [slot.date, slot.time]
        );
        if (result.rows.length > 0) {
          created.push(result.rows[0]);
        } else {
          skipped.push({ ...slot, reason: 'Slot already exists' });
        }
      } catch (e) {
        skipped.push({ ...slot, reason: e.message });
      }
    }

    res.status(201).json({ message: `${created.length} slot(s) created, ${skipped.length} skipped.`, created, skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/slots/:id
 * Admin only — Delete a slot
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM available_slots WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Slot not found.' });
    }

    await db.query('DELETE FROM available_slots WHERE id = $1', [req.params.id]);
    res.json({ message: 'Slot deleted.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
