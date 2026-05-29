const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'diet2fit_diets',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
  },
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// GET /api/diets/:clientId - Get diets for a specific client
// Admins can view any, clients can only view their own
router.get('/:clientId', authenticate, async (req, res) => {
  const clientId = parseInt(req.params.clientId, 10);
  
  // NOTE: req.user.id is used because in our JWT we attach id, not userId
  if (req.user.role !== 'admin' && req.user.id !== clientId) {
    return res.status(403).json({ error: 'Unauthorized to view these diet plans.' });
  }

  try {
    const plansRes = await db.query('SELECT * FROM diet_plans WHERE client_id = $1 ORDER BY created_at DESC', [clientId]);
    res.json({ plans: plansRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error fetching diet plans.' });
  }
});

// POST /api/diets - Upload a new diet plan (Admin only)
router.post('/', authenticate, requireAdmin, upload.single('diet_file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const { client_id, notes } = req.body;
  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required.' });
  }

  try {
    // req.file.path contains the secure URL from Cloudinary
    const filepath = req.file.path;
    const filename = req.file.filename;
    const original_name = req.file.originalname || filename;
    
    const result = await db.query(`
      INSERT INTO diet_plans (client_id, filename, original_name, filepath, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [client_id, filename, original_name, filepath, notes || '']);

    const newPlanRes = await db.query('SELECT * FROM diet_plans WHERE id = $1', [result.rows[0].id]);
    res.status(201).json({ message: 'Diet plan uploaded successfully.', plan: newPlanRes.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error saving diet plan.' });
  }
});

// DELETE /api/diets/:id - Delete a diet plan (Admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    // Optionally: fetch the plan first and delete it from Cloudinary as well
    // const planRes = await db.query('SELECT filename FROM diet_plans WHERE id = $1', [id]);
    // if (planRes.rows.length > 0) {
    //   await cloudinary.uploader.destroy(planRes.rows[0].filename);
    // }

    await db.query('DELETE FROM diet_plans WHERE id = $1', [id]);
    res.json({ message: 'Diet plan deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error deleting diet plan.' });
  }
});

module.exports = router;
