const express = require('express');
const router = express.Router();
const pool = require('../db/database');
const { authenticate } = require('../middleware/auth');

// Register a device token for push notifications
router.post('/', authenticate, async (req, res) => {
  try {
    const { token, platform } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Upsert token
    await pool.query(`
      INSERT INTO device_tokens (user_id, token, platform)
      VALUES ($1, $2, $3)
      ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform
    `, [userId, token, platform || 'android']);

    res.json({ success: true, message: 'Device token registered' });
  } catch (err) {
    console.error('Register token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove a device token (logout)
router.delete('/:token', authenticate, async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.id;

    await pool.query('DELETE FROM device_tokens WHERE token = $1 AND user_id = $2', [token, userId]);
    
    res.json({ success: true, message: 'Device token removed' });
  } catch (err) {
    console.error('Remove token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
