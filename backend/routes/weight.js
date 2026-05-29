const express = require('express');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/weight
 * Log a weight entry (client only)
 */
router.post('/', authenticate, (req, res) => {
  const { weight_kg, date, notes } = req.body;

  if (!weight_kg || !date) {
    return res.status(400).json({ error: 'Weight and date are required.' });
  }

  if (weight_kg <= 0 || weight_kg > 500) {
    return res.status(400).json({ error: 'Please enter a valid weight.' });
  }

  // Check if entry already exists for this date
  const existing = db.prepare('SELECT id FROM weight_logs WHERE user_id = ? AND date = ?').get(req.user.id, date);
  
  if (existing) {
    // Update existing entry for the same date
    db.prepare('UPDATE weight_logs SET weight_kg = ?, notes = ? WHERE id = ?').run(weight_kg, notes || null, existing.id);
    const entry = db.prepare('SELECT * FROM weight_logs WHERE id = ?').get(existing.id);
    return res.json({ entry, updated: true });
  }

  const result = db.prepare(`
    INSERT INTO weight_logs (user_id, weight_kg, date, notes)
    VALUES (?, ?, ?, ?)
  `).run(req.user.id, weight_kg, date, notes || null);

  const entry = db.prepare('SELECT * FROM weight_logs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ entry });
});

/**
 * GET /api/weight
 * Get weight history for logged-in client
 * Query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=30
 */
router.get('/', authenticate, (req, res) => {
  const userId = req.user.role === 'admin' ? req.query.client_id : req.user.id;
  
  if (!userId) {
    return res.status(400).json({ error: 'Client ID is required for admin.' });
  }

  let query = 'SELECT * FROM weight_logs WHERE user_id = ?';
  const params = [userId];

  if (req.query.from) {
    query += ' AND date >= ?';
    params.push(req.query.from);
  }
  if (req.query.to) {
    query += ' AND date <= ?';
    params.push(req.query.to);
  }

  query += ' ORDER BY date ASC';

  if (req.query.limit) {
    query += ' LIMIT ?';
    params.push(parseInt(req.query.limit));
  }

  const entries = db.prepare(query).all(...params);

  // Calculate stats
  let stats = null;
  if (entries.length > 0) {
    const weights = entries.map(e => e.weight_kg);
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
});

/**
 * GET /api/weight/:clientId
 * Admin views a specific client's weight history
 */
router.get('/:clientId', authenticate, requireAdmin, (req, res) => {
  const entries = db.prepare('SELECT * FROM weight_logs WHERE user_id = ? ORDER BY date ASC').all(req.params.clientId);

  let stats = null;
  if (entries.length > 0) {
    const weights = entries.map(e => e.weight_kg);
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
});

/**
 * DELETE /api/weight/:id
 * Delete a weight entry (own entry or admin)
 */
router.delete('/:id', authenticate, (req, res) => {
  const entry = db.prepare('SELECT * FROM weight_logs WHERE id = ?').get(req.params.id);
  
  if (!entry) {
    return res.status(404).json({ error: 'Weight entry not found.' });
  }

  // Only owner or admin can delete
  if (req.user.role !== 'admin' && entry.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized.' });
  }

  db.prepare('DELETE FROM weight_logs WHERE id = ?').run(req.params.id);
  res.json({ message: 'Entry deleted.' });
});

module.exports = router;
