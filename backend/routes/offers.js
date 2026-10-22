const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { authenticate, requireAdmin, generateToken } = require('../middleware/auth');

const router = express.Router();

// ── Razorpay Helper ───────────────────────────────────────────────
let razorpayInstance = null;
function getRazorpay() {
  if (razorpayInstance) return razorpayInstance;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const Razorpay = require('razorpay');
  razorpayInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return razorpayInstance;
}

// ══════════════════════════════════════════════════════════════════
// GET /api/offers/active — Get active Diwali offer (PUBLIC)
// If inactive/closed, returns { active: false }
// ══════════════════════════════════════════════════════════════════
router.get('/active', async (req, res) => {
  try {
    const offerRes = await db.query(
      "SELECT * FROM offers WHERE code = 'diwali-glow-reset' LIMIT 1"
    );

    if (offerRes.rows.length === 0 || !offerRes.rows[0].is_active) {
      return res.json({ active: false });
    }

    const offer = offerRes.rows[0];

    // Count paid orders for this offer
    const slotsRes = await db.query(`
      SELECT COUNT(DISTINCT user_id) as count 
      FROM plan_orders 
      WHERE status = 'paid' 
        AND (plan_name ILIKE '%diwali%' OR plan_id = (SELECT id FROM subscription_plans WHERE slug = 'diwali-glow-reset' LIMIT 1))
    `);

    const slotsTaken = parseInt(slotsRes.rows[0].count) || 0;
    const slotsRemaining = Math.max(0, (offer.total_slots || 20) - slotsTaken);

    res.json({
      active: true,
      offer: {
        id: offer.id,
        code: offer.code,
        title: offer.title,
        subtitle: offer.subtitle,
        tagline: offer.tagline,
        badge: offer.badge,
        price: offer.price,
        original_price: offer.original_price,
        display_price: offer.display_price,
        display_original_price: offer.display_original_price,
        currency: offer.currency,
        duration_days: offer.duration_days,
        duration_label: offer.duration_label,
        total_slots: offer.total_slots,
        slots_taken: slotsTaken,
        slots_remaining: slotsRemaining,
        features: typeof offer.features === 'string' ? JSON.parse(offer.features) : offer.features,
        banner_text: offer.banner_text,
        cta_text: offer.cta_text,
      }
    });
  } catch (err) {
    console.error('Error fetching active offer:', err);
    res.status(500).json({ error: 'Failed to fetch active offer' });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/offers/admin/current — Offer details & client roster (ADMIN)
// ══════════════════════════════════════════════════════════════════
router.get('/admin/current', authenticate, requireAdmin, async (req, res) => {
  try {
    const offerRes = await db.query(
      "SELECT * FROM offers WHERE code = 'diwali-glow-reset' LIMIT 1"
    );

    if (offerRes.rows.length === 0) {
      return res.status(404).json({ error: 'Diwali offer not found.' });
    }

    const offer = offerRes.rows[0];

    // Clients enrolled in Diwali offer
    const clientsRes = await db.query(`
      SELECT 
        po.id as order_id,
        po.user_id,
        po.plan_name,
        po.amount,
        po.currency,
        po.status,
        po.razorpay_order_id,
        po.razorpay_payment_id,
        po.starts_at,
        po.expires_at,
        po.created_at as enrolled_at,
        COALESCE(u.name, po.buyer_name) as client_name,
        COALESCE(u.email, po.buyer_email) as client_email,
        COALESCE(u.phone, po.buyer_phone) as client_phone
      FROM plan_orders po
      LEFT JOIN users u ON po.user_id = u.id
      WHERE po.status = 'paid' 
        AND (po.plan_name ILIKE '%diwali%' OR po.plan_id = (SELECT id FROM subscription_plans WHERE slug = 'diwali-glow-reset' LIMIT 1))
      ORDER BY po.created_at DESC
    `);

    // Calculate revenue
    const revenueRes = await db.query(`
      SELECT COALESCE(SUM(amount), 0) as total_revenue, COUNT(DISTINCT user_id) as total_clients
      FROM plan_orders
      WHERE status = 'paid'
        AND (plan_name ILIKE '%diwali%' OR plan_id = (SELECT id FROM subscription_plans WHERE slug = 'diwali-glow-reset' LIMIT 1))
    `);

    const totalRevenue = parseInt(revenueRes.rows[0].total_revenue) || 0;
    const totalClients = parseInt(revenueRes.rows[0].total_clients) || 0;
    const slotsRemaining = Math.max(0, (offer.total_slots || 20) - totalClients);

    // Also get all registered clients for admin "Quick Assign" dropdown
    const allClientsRes = await db.query(
      "SELECT id, name, email, phone FROM users WHERE role = 'client' ORDER BY name ASC"
    );

    res.json({
      offer: {
        ...offer,
        features: typeof offer.features === 'string' ? JSON.parse(offer.features) : offer.features,
      },
      stats: {
        is_active: offer.is_active,
        total_clients: totalClients,
        total_revenue: totalRevenue,
        total_revenue_formatted: '₹' + (totalRevenue / 100).toLocaleString('en-IN'),
        total_slots: offer.total_slots,
        slots_taken: totalClients,
        slots_remaining: slotsRemaining,
      },
      clients: clientsRes.rows,
      all_clients: allClientsRes.rows,
    });
  } catch (err) {
    console.error('Error fetching admin offer:', err);
    res.status(500).json({ error: 'Failed to fetch offer data' });
  }
});

// ══════════════════════════════════════════════════════════════════
// PUT /api/offers/admin/toggle — Toggle or update offer (ADMIN)
// ══════════════════════════════════════════════════════════════════
router.put('/admin/toggle', authenticate, requireAdmin, async (req, res) => {
  try {
    const { is_active, total_slots, banner_text } = req.body;

    const currentOffer = await db.query("SELECT is_active FROM offers WHERE code = 'diwali-glow-reset'");
    if (currentOffer.rows.length === 0) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    const newActive = is_active !== undefined ? Boolean(is_active) : !currentOffer.rows[0].is_active;

    await db.query(`
      UPDATE offers 
      SET is_active = $1,
          total_slots = COALESCE($2, total_slots),
          banner_text = COALESCE($3, banner_text),
          updated_at = NOW()
      WHERE code = 'diwali-glow-reset'
    `, [newActive, total_slots || null, banner_text || null]);

    // Synchronize subscription_plans table as well
    await db.query(`
      UPDATE subscription_plans 
      SET is_active = $1 
      WHERE slug = 'diwali-glow-reset'
    `, [newActive]);

    res.json({
      success: true,
      is_active: newActive,
      message: newActive
        ? '🪔 Diwali Glow Reset offer is now LIVE on website & payment page!'
        : '⏸️ Diwali Glow Reset offer is now CLOSED. Everything has reverted to standard plans.'
    });
  } catch (err) {
    console.error('Error toggling offer:', err);
    res.status(500).json({ error: 'Failed to update offer' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/offers/create-order — Direct checkout for Diwali Offer (PUBLIC/AUTH)
// Supports both authenticated clients and guest visitors (creates account)
// ══════════════════════════════════════════════════════════════════
router.post('/create-order', async (req, res) => {
  try {
    // 1. Verify offer is active
    const offerRes = await db.query(
      "SELECT * FROM offers WHERE code = 'diwali-glow-reset' AND is_active = true LIMIT 1"
    );
    if (offerRes.rows.length === 0) {
      return res.status(400).json({
        error: 'The Diwali Glow Reset offer is currently closed or has ended.'
      });
    }
    const offer = offerRes.rows[0];

    // 2. Identify or create user
    let user = null;
    let token = null;

    // Check if auth token provided in headers
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const jwtToken = authHeader.split(' ')[1];
      const jwt = require('jsonwebtoken');
      const JWT_SECRET = process.env.JWT_SECRET || 'diet2fit_secret_key_change_in_production';
      try {
        const decoded = jwt.verify(jwtToken, JWT_SECRET);
        const userRes = await db.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
        if (userRes.rows.length > 0) {
          user = userRes.rows[0];
          token = jwtToken;
        }
      } catch (e) {
        // Token invalid, fallback to body credentials
      }
    }

    // If not authenticated via token, check guest input
    if (!user) {
      const { name, email, phone } = req.body;
      if (!name || !email || !phone) {
        return res.status(400).json({
          error: 'Please provide your Name, Email, and WhatsApp Phone number to proceed.'
        });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = phone.trim();
      const cleanName = name.trim();

      // Check if user already exists
      const existingUser = await db.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
      if (existingUser.rows.length > 0) {
        user = existingUser.rows[0];
        // If existing user has no phone or name, update them
        if (!user.phone && cleanPhone) {
          await db.query('UPDATE users SET phone = $1 WHERE id = $2', [cleanPhone, user.id]);
          user.phone = cleanPhone;
        }
      } else {
        // Create new user account with secure random initial password
        const tempPassword = 'BK_' + Math.random().toString(36).substring(2, 10);
        const passwordHash = bcrypt.hashSync(tempPassword, 10);

        const newUserRes = await db.query(`
          INSERT INTO users (name, email, phone, password_hash, role)
          VALUES ($1, $2, $3, $4, 'client')
          RETURNING *
        `, [cleanName, cleanEmail, cleanPhone, passwordHash]);
        user = newUserRes.rows[0];
      }

      token = generateToken(user);
    }

    // 3. Get plan reference from subscription_plans
    const planRes = await db.query(
      "SELECT id, name FROM subscription_plans WHERE slug = 'diwali-glow-reset' LIMIT 1"
    );
    const planId = planRes.rows.length > 0 ? planRes.rows[0].id : null;
    const planName = planRes.rows.length > 0 ? planRes.rows[0].name : offer.title;

    // 4. Create Razorpay order
    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(503).json({ error: 'Payment gateway not configured. Please contact support.' });
    }

    const orderAmount = offer.price; // 79900 paise = ₹799
    const order = await razorpay.orders.create({
      amount: orderAmount,
      currency: 'INR',
      receipt: `diwali_${user.id}_${Date.now()}`,
      notes: {
        offer_code: 'diwali-glow-reset',
        plan_name: planName,
        user_id: user.id.toString(),
        user_email: user.email,
        user_phone: user.phone || ''
      }
    });

    // 5. Store pending order in plan_orders
    await db.query(`
      INSERT INTO plan_orders (
        user_id, plan_id, plan_name, razorpay_order_id, amount, currency, status, buyer_name, buyer_email, buyer_phone
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'created', $7, $8, $9)
    `, [user.id, planId, planName, order.id, orderAmount, 'INR', user.name, user.email, user.phone]);

    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      plan_name: planName,
      key: process.env.RAZORPAY_KEY_ID,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (err) {
    console.error('Error creating Diwali offer order:', err);
    res.status(500).json({ error: 'Failed to create payment order.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/offers/verify-payment — Verify payment & activate plan (PUBLIC/AUTH)
// ══════════════════════════════════════════════════════════════════
router.post('/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification data.' });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      return res.status(503).json({ error: 'Payment verification not configured.' });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await db.query(
        "UPDATE plan_orders SET status = 'failed' WHERE razorpay_order_id = $1",
        [razorpay_order_id]
      );
      return res.status(400).json({ error: 'Payment verification failed. Invalid signature.' });
    }

    // Payment verified! Activate 30-day (1 month) plan
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day validity

    const updateRes = await db.query(`
      UPDATE plan_orders 
      SET status = 'paid', 
          razorpay_payment_id = $1, 
          razorpay_signature = $2, 
          starts_at = $3, 
          expires_at = $4
      WHERE razorpay_order_id = $5
      RETURNING *
    `, [razorpay_payment_id, razorpay_signature, now, expiresAt, razorpay_order_id]);

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = updateRes.rows[0];

    // Fetch user details for auth
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [order.user_id]);
    const user = userRes.rows[0];
    const token = user ? generateToken(user) : null;

    res.json({
      success: true,
      message: '🪔 Payment successful! Welcome to the Diwali Glow Reset.',
      order: {
        id: order.id,
        plan_name: order.plan_name,
        amount: order.amount,
        status: order.status,
        starts_at: order.starts_at,
        expires_at: order.expires_at
      },
      token,
      user: user ? {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      } : null
    });
  } catch (err) {
    console.error('Error verifying Diwali payment:', err);
    res.status(500).json({ error: 'Payment verification failed.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/offers/admin/assign — Admin manually assigns Diwali offer (ADMIN)
// ══════════════════════════════════════════════════════════════════
router.post('/admin/assign', authenticate, requireAdmin, async (req, res) => {
  try {
    const { user_id, payment_method = 'cash', start_date } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const userRes = await db.query(
      "SELECT id, name, email, phone FROM users WHERE id = $1 AND role = 'client'",
      [user_id]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found.' });
    }
    const user = userRes.rows[0];

    // Find Diwali plan in subscription_plans
    const planRes = await db.query(
      "SELECT id, name, price_monthly FROM subscription_plans WHERE slug = 'diwali-glow-reset' LIMIT 1"
    );
    const planId = planRes.rows.length > 0 ? planRes.rows[0].id : null;
    const planName = planRes.rows.length > 0 ? planRes.rows[0].name : 'Diwali Glow Reset';
    const amount = planRes.rows.length > 0 ? planRes.rows[0].price_monthly : 79900;

    const startsAt = start_date ? new Date(start_date) : new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day festive plan

    const orderRes = await db.query(`
      INSERT INTO plan_orders (
        user_id, plan_id, plan_name, razorpay_order_id, razorpay_payment_id, amount, currency, status, starts_at, expires_at, buyer_name, buyer_email, buyer_phone
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'INR', 'paid', $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      user.id,
      planId,
      planName,
      `manual_diwali_${Date.now()}`,
      `offline_${payment_method}_${Date.now()}`,
      amount,
      startsAt,
      expiresAt,
      user.name,
      user.email,
      user.phone
    ]);

    res.status(201).json({
      success: true,
      message: `Diwali Glow Reset successfully assigned to ${user.name} for 30 days!`,
      order: orderRes.rows[0]
    });
  } catch (err) {
    console.error('Error assigning Diwali offer:', err);
    res.status(500).json({ error: 'Failed to assign Diwali offer.' });
  }
});

module.exports = router;
