const express = require('express');
const router = express.Router();
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const db = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

// ── Supabase Storage Setup ────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service_role key bypasses RLS for server-side uploads
);

const BUCKET = 'diet-plans';

// Use memory storage so we get the file buffer to upload to Supabase
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ── IMPORTANT: Put /download/:id BEFORE /:clientId ────────────────
// Otherwise Express matches "download" as a clientId parameter

// GET /api/diets/download/:id - Serve the file from Supabase Storage
router.get('/download/:id', authenticate, async (req, res) => {
  const id = req.params.id;
  try {
    const planRes = await db.query('SELECT client_id, filename, original_name, filepath FROM diet_plans WHERE id = $1', [id]);
    if (planRes.rows.length === 0) {
      return res.status(404).json({ error: 'Diet plan not found.' });
    }

    const plan = planRes.rows[0];

    // Auth check: admins can view any, clients only their own
    if (req.user.role !== 'admin' && req.user.id !== plan.client_id) {
      return res.status(403).json({ error: 'Unauthorized to view this file.' });
    }

    // Redirect to the public Supabase Storage URL
    res.redirect(plan.filepath);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Error fetching diet plan.' });
  }
});

// GET /api/diets/:clientId - Get diets for a specific client
router.get('/:clientId', authenticate, async (req, res) => {
  const clientId = parseInt(req.params.clientId, 10);

  if (req.user.role !== 'admin' && req.user.id !== clientId) {
    return res.status(403).json({ error: 'Unauthorized to view these diet plans.' });
  }

  try {
    const plansRes = await db.query(
      'SELECT id, client_id, filename, original_name, filepath, notes, created_at FROM diet_plans WHERE client_id = $1 ORDER BY created_at DESC',
      [clientId]
    );

    const plans = plansRes.rows.map(plan => {
      return {
        ...plan,
        preview_url: plan.filepath,   // Direct Supabase public URL - opens in browser
        download_url: plan.filepath,  // Same URL - browser handles PDF download
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
    // Generate a unique filename for Supabase Storage
    const ext = req.file.originalname.split('.').pop() || 'pdf';
    const uniqueName = `client_${client_id}/${Date.now()}_${Math.round(Math.random() * 1E9)}.${ext}`;

    // Upload file buffer to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(uniqueName, req.file.buffer, {
        contentType: req.file.mimetype || 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload file to storage: ' + uploadError.message });
    }

    // Get the public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(uniqueName);

    const publicUrl = urlData.publicUrl;
    const original_name = req.file.originalname;

    // Save to database
    const result = await db.query(`
      INSERT INTO diet_plans (client_id, filename, original_name, filepath, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [client_id, uniqueName, original_name, publicUrl, notes || '']);

    const newPlanRes = await db.query(
      'SELECT id, client_id, filename, original_name, filepath, notes, created_at FROM diet_plans WHERE id = $1',
      [result.rows[0].id]
    );

    res.status(201).json({ message: 'Diet plan uploaded successfully.', plan: newPlanRes.rows[0] });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Database error saving diet plan.' });
  }
});

// DELETE /api/diets/:id - Delete a diet plan (Admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const planRes = await db.query('SELECT filename, filepath FROM diet_plans WHERE id = $1', [id]);
    if (planRes.rows.length === 0) {
      return res.status(404).json({ error: 'Diet plan not found.' });
    }

    const plan = planRes.rows[0];

    // Delete from Supabase Storage (if it's a Supabase URL)
    if (plan.filepath && plan.filepath.includes('supabase.co')) {
      const { error: deleteError } = await supabase.storage
        .from(BUCKET)
        .remove([plan.filename]);

      if (deleteError) {
        console.error('Supabase delete error:', deleteError.message);
      }
    }

    // Delete from database
    await db.query('DELETE FROM diet_plans WHERE id = $1', [id]);
    res.json({ message: 'Diet plan deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error deleting diet plan.' });
  }
});

module.exports = router;
