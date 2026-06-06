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
  params: async (req, file) => {
    const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    return {
      folder: 'diet2fit_diets',
      resource_type: isPdf ? 'raw' : 'image', // PDFs must be 'raw' to download correctly
      format: isPdf ? 'pdf' : undefined,      // Ensure PDF extension
    };
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
    
    // Build proper URLs for each plan
    const plans = plansRes.rows.map(plan => {
      // Inject fl_attachment to force download. This works for both raw and image resource types on Cloudinary.
      const downloadUrl = plan.filepath.includes('/upload/') 
        ? plan.filepath.replace('/upload/', '/upload/fl_attachment/') 
        : plan.filepath;

      return {
        ...plan,
        preview_url: plan.filepath, // Original URL for browser viewing
        download_url: downloadUrl,
      };
    });
    
    res.json({ plans });
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
    const public_id = req.file.filename || null; // Cloudinary public_id
    
    const result = await db.query(`
      INSERT INTO diet_plans (client_id, filename, original_name, filepath, public_id, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [client_id, filename, original_name, filepath, public_id, notes || '']);

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
    // Delete from Cloudinary if we have the public_id
    const planRes = await db.query('SELECT public_id FROM diet_plans WHERE id = $1', [id]);
    if (planRes.rows.length > 0 && planRes.rows[0].public_id) {
      try {
        await cloudinary.uploader.destroy(planRes.rows[0].public_id, { resource_type: 'raw' });
      } catch (e) {
        console.error('Cloudinary delete error:', e.message);
      }
    }

    await db.query('DELETE FROM diet_plans WHERE id = $1', [id]);
    res.json({ message: 'Diet plan deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error deleting diet plan.' });
  }
});

module.exports = router;
