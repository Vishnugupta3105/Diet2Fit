const express = require('express');
const router = express.Router();
const multer = require('multer');
// Removed Cloudinary configs since we are storing in PostgreSQL DB now

const storage = multer.memoryStorage();
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
    const plansRes = await db.query('SELECT id, client_id, filename, original_name, filepath, notes, created_at FROM diet_plans WHERE client_id = $1 ORDER BY created_at DESC', [clientId]);
    
    // Extract token to append to local URLs
    const tokenStr = req.headers.authorization ? req.headers.authorization.split(' ')[1] : '';

    // Build proper URLs for each plan
    const plans = plansRes.rows.map(plan => {
      // If it has a file_data entry in the DB, route to our local endpoint
      let downloadUrl = plan.filepath;
      let previewUrl = plan.filepath;
      
      if (plan.filepath && plan.filepath.includes('/api/diets/download/')) {
        // Safe to attach token since we're using our own backend.
        downloadUrl = `/api/diets/download/${plan.id}?token=${tokenStr}`;
        previewUrl = `/api/diets/download/${plan.id}?token=${tokenStr}`;
      } else if (plan.filepath && plan.filepath.includes('/image/upload/')) {
        // Legacy Cloudinary fallback
        downloadUrl = plan.filepath.replace('/image/upload/', '/image/upload/fl_attachment/');
      }

      return {
        ...plan,
        preview_url: previewUrl,
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
    const filename = req.file.originalname;
    const original_name = req.file.originalname;
    const file_data = req.file.buffer; // Binary PDF data
    
    // We set filepath to point to our new local download route
    const filepath = `/api/diets/download/`; 
    
    const result = await db.query(`
      INSERT INTO diet_plans (client_id, filename, original_name, filepath, file_data, notes)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [client_id, filename, original_name, filepath, file_data, notes || '']);

    const newPlanRes = await db.query('SELECT id, client_id, filename, original_name, filepath, notes, created_at FROM diet_plans WHERE id = $1', [result.rows[0].id]);
    res.status(201).json({ message: 'Diet plan uploaded successfully.', plan: newPlanRes.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error saving diet plan.' });
  }
});

// GET /api/diets/download/:id - Download a diet plan directly from DB
router.get('/download/:id', authenticate, async (req, res) => {
  const id = req.params.id;
  try {
    const planRes = await db.query('SELECT client_id, filename, file_data FROM diet_plans WHERE id = $1', [id]);
    if (planRes.rows.length === 0 || !planRes.rows[0].file_data) {
      return res.status(404).send('File not found in database.');
    }
    
    const plan = planRes.rows[0];
    
    // Admins can view any, clients can only view their own
    if (req.user.role !== 'admin' && req.user.id !== plan.client_id) {
      return res.status(403).send('Unauthorized to view this file.');
    }

    res.setHeader('Content-Type', 'application/pdf');
    // If we want it to open in browser (preview) vs force download
    // Since browser can open PDF, 'inline' is usually preferred for preview, 'attachment' for download
    res.setHeader('Content-Disposition', `inline; filename="${plan.filename}"`);
    res.send(plan.file_data);
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error fetching file.');
  }
});

// DELETE /api/diets/:id - Delete a diet plan (Admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    // Note: We don't need to delete from Cloudinary anymore for new files, 
    // but we can try for legacy files if public_id exists.
    const planRes = await db.query('SELECT public_id, filepath FROM diet_plans WHERE id = $1', [id]);
    if (planRes.rows.length > 0 && planRes.rows[0].public_id) {
      try {
        const { v2: cloudinary } = require('cloudinary');
        const isImage = planRes.rows[0].filepath.includes('/image/upload/');
        await cloudinary.uploader.destroy(planRes.rows[0].public_id, { resource_type: isImage ? 'image' : 'raw' });
      } catch (e) {
        console.error('Cloudinary delete legacy error:', e.message);
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
