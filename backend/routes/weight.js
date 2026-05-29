const express = require('express');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/weight
 * Log a weight entry (client only)
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { weight_kg, date, notes } = req.body;

    if (!weight_kg || !date) {
      return res.status(400).json({ error: 'Weight and date are required.' });
    }

    if (weight_kg <= 0 || weight_kg > 500) {
      return res.status(400).json({ error: 'Please enter a valid weight.' });
    }

    // Check if entry already exists for this date
    const existingRes = await db.query('SELECT id FROM weight_logs WHERE user_id = $1 AND date = $2', [req.user.id, date]);
    
    if (existingRes.rows.length > 0) {
      // Update existing entry for the same date
      const existingId = existingRes.rows[0].id;
      await db.query('UPDATE weight_logs SET weight_kg = $1, notes = $2 WHERE id = $3', [weight_kg, notes || null, existingId]);
      const entryRes = await db.query('SELECT * FROM weight_logs WHERE id = $1', [existingId]);
      return res.json({ entry: entryRes.rows[0], updated: true });
    }

    const result = await db.query(`
      INSERT INTO weight_logs (user_id, weight_kg, date, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [req.user.id, weight_kg, date, notes || null]);

    const entryRes = await db.query('SELECT * FROM weight_logs WHERE id = $1', [result.rows[0].id]);
    res.status(201).json({ entry: entryRes.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/weight
 * Get weight history for logged-in client
 * Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=30
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.role === 'admin' ? req.query.client_id : req.user.id;
    
    if (!userId) {
      return res.status(400).json({ error: 'Client ID is required for admin.' });
    }

    let query = 'SELECT * FROM weight_logs WHERE user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (req.query.from) {
      query += ` AND date >= $${paramIndex++}`;
      params.push(req.query.from);
    }
    if (req.query.to) {
      query += ` AND date <= $${paramIndex++}`;
      params.push(req.query.to);
    }

    query += ' ORDER BY date ASC';

    if (req.query.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(parseInt(req.query.limit, 10));
    }

    const entriesRes = await db.query(query, params);
    const entries = entriesRes.rows;

    // Calculate stats
    let stats = null;
    if (entries.length > 0) {
      const weights = entries.map(e => parseFloat(e.weight_kg));
      const firstWeight = weights[0];
      const currentWeight = weights[weights.length - 1];
      const totalChange = currentWeight - firstWeight;
      const minWeight = Math.min(...weights);
      const maxWeight = Math.max(...weights);
      const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;

      // Weekly average change
      const daysDiff = (new Date(entries[entries.length - 1].date) - new Date(entries[0].date)) / (1000 * 60 * 60 * 24);
      const weeksDiff = daysDiff / 7 || 1;
      const weeklyChange = totalChange / weeksDiff;

      stats = {
        first_weight: firstWeight,
        current_weight: currentWeight,
        total_change: Math.round(totalChange * 100) / 100,
        min_weight: minWeight,
        max_weight: maxWeight,
        avg_weight: Math.round(avgWeight * 100) / 100,
        weekly_change: Math.round(weeklyChange * 100) / 100,
        total_entries: entries.length,
      };
    }

    res.json({ entries, stats });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/weight/:clientId
 * Admin views a specific client's weight history
 */
router.get('/:clientId', authenticate, requireAdmin, async (req, res) => {
  try {
    const entriesRes = await db.query('SELECT * FROM weight_logs WHERE user_id = $1 ORDER BY date ASC', [req.params.clientId]);
    const entries = entriesRes.rows;

    let stats = null;
    if (entries.length > 0) {
      const weights = entries.map(e => parseFloat(e.weight_kg));
      const firstWeight = weights[0];
      const currentWeight = weights[weights.length - 1];
      const totalChange = currentWeight - firstWeight;
      
      stats = {
        first_weight: firstWeight,
        current_weight: currentWeight,
        total_change: Math.round(totalChange * 100) / 100,
        total_entries: entries.length,
      };
    }

    res.json({ entries, stats });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/weight/:id
 * Delete a weight entry (own entry or admin)
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const entryRes = await db.query('SELECT * FROM weight_logs WHERE id = $1', [req.params.id]);
    const entry = entryRes.rows[0];
    
    if (!entry) {
      return res.status(404).json({ error: 'Weight entry not found.' });
    }

    // Only owner or admin can delete
    if (req.user.role !== 'admin' && entry.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized.' });
    }

    await db.query('DELETE FROM weight_logs WHERE id = $1', [req.params.id]);
    res.json({ message: 'Entry deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
