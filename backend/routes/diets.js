const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'uploads', 'diets'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// GET /api/diets/:clientId - Get diets for a specific client
// Admins can view any, clients can only view their own
router.get('/:clientId', authenticate, (req, res) => {
  const clientId = parseInt(req.params.clientId, 10);
  
  if (req.user.role !== 'admin' && req.user.userId !== clientId) {
    return res.status(403).json({ error: 'Unauthorized to view these diet plans.' });
  }

  try {
    const plans = db.prepare('SELECT * FROM diet_plans WHERE client_id = ? ORDER BY created_at DESC').all(clientId);
    res.json({ plans });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error fetching diet plans.' });
  }
});

// POST /api/diets - Upload a new diet plan (Admin only)
router.post('/', authenticate, requireAdmin, upload.single('diet_file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const { client_id, notes } = req.body;
  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required.' });
  }

  try {
    const filepath = `/uploads/diets/${req.file.filename}`;
    
    const result = db.prepare(`
      INSERT INTO diet_plans (client_id, filename, original_name, filepath, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(client_id, req.file.filename, req.file.originalname, filepath, notes || '');

    const newPlan = db.prepare('SELECT * FROM diet_plans WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message: 'Diet plan uploaded successfully.', plan: newPlan });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error saving diet plan.' });
  }
});

// DELETE /api/diets/:id - Delete a diet plan (Admin only)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const id = req.params.id;
  try {
    db.prepare('DELETE FROM diet_plans WHERE id = ?').run(id);
    res.json({ message: 'Diet plan deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error deleting diet plan.' });
  }
});

module.exports = router;
