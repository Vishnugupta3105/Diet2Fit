const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db/database');

// ── Auth Middleware ──────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'beyond-kilos-secret-key';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  next();
}

// ── Initialize Razorpay ──────────────────────────────────────────
let razorpayInstance = null;

function getRazorpay() {
  if (razorpayInstance) return razorpayInstance;
  
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  
  if (!keyId || !keySecret) {
    return null;
  }
  
  const Razorpay = require('razorpay');
  razorpayInstance = new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
  return razorpayInstance;
}

// ══════════════════════════════════════════════════════════════════
// GET /api/plans — List all active plans (PUBLIC)
// ══════════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, slug, price_monthly, display_price, tagline, features, is_popular, sort_order FROM subscription_plans WHERE is_active = true ORDER BY sort_order ASC'
    );
    res.json({ plans: result.rows });
  } catch (err) {
    console.error('Error fetching plans:', err);
    res.status(500).json({ error: 'Failed to fetch plans.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/plans/razorpay-key — Get Razorpay public key (PUBLIC)
// ══════════════════════════════════════════════════════════════════
router.get('/razorpay-key', (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    return res.status(503).json({ error: 'Payment gateway not configured.' });
  }
  res.json({ key: keyId });
});

// ══════════════════════════════════════════════════════════════════
// POST /api/plans/create-order — Create a Razorpay order (AUTH)
// ══════════════════════════════════════════════════════════════════
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id) return res.status(400).json({ error: 'plan_id is required.' });

    // Get plan details
    const planRes = await db.query('SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true', [plan_id]);
    if (planRes.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found or inactive.' });
    }
    const plan = planRes.rows[0];

    // Get user details
    const userRes = await db.query('SELECT name, email, phone FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];

    const razorpay = getRazorpay();
    if (!razorpay) {
      return res.status(503).json({ error: 'Payment gateway not configured. Please contact support.' });
    }

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: plan.price_monthly,
      currency: 'INR',
      receipt: `plan_${plan.slug}_${req.user.id}_${Date.now()}`,
      notes: {
        plan_id: plan.id.toString(),
        plan_name: plan.name,
        user_id: req.user.id.toString(),
        user_email: user.email
      }
    });

    // Save order in DB
    await db.query(`
      INSERT INTO plan_orders (user_id, plan_id, plan_name, razorpay_order_id, amount, currency, status, buyer_name, buyer_email, buyer_phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [req.user.id, plan.id, plan.name, order.id, plan.price_monthly, 'INR', 'created', user.name, user.email, user.phone]);

    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      plan_name: plan.name,
      key: process.env.RAZORPAY_KEY_ID,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Failed to create payment order.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/plans/verify-payment — Verify Razorpay payment (AUTH)
// ══════════════════════════════════════════════════════════════════
router.post('/verify-payment', authMiddleware, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification data.' });
    }

    // Verify signature
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
      // Mark order as failed
      await db.query(
        'UPDATE plan_orders SET status = $1 WHERE razorpay_order_id = $2',
        ['failed', razorpay_order_id]
      );
      return res.status(400).json({ error: 'Payment verification failed. Invalid signature.' });
    }

    // Payment verified! Update order
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1); // 1 month subscription

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

    res.json({
      success: true,
      message: 'Payment verified successfully!',
      order: {
        id: order.id,
        plan_name: order.plan_name,
        amount: order.amount,
        status: order.status,
        starts_at: order.starts_at,
        expires_at: order.expires_at
      }
    });
  } catch (err) {
    console.error('Error verifying payment:', err);
    res.status(500).json({ error: 'Payment verification failed.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/plans/my-plan — Get current user's active plan (AUTH)
// ══════════════════════════════════════════════════════════════════
router.get('/my-plan', authMiddleware, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT po.*, sp.features, sp.slug, sp.tagline
      FROM plan_orders po
      JOIN subscription_plans sp ON po.plan_id = sp.id
      WHERE po.user_id = $1 AND po.status = 'paid' AND po.expires_at > NOW()
      ORDER BY po.expires_at DESC
      LIMIT 1
    `, [req.user.id]);

    if (result.rows.length === 0) {
      return res.json({ active_plan: null });
    }

    const plan = result.rows[0];
    res.json({
      active_plan: {
        order_id: plan.id,
        plan_name: plan.plan_name,
        slug: plan.slug,
        tagline: plan.tagline,
        features: plan.features,
        amount: plan.amount,
        starts_at: plan.starts_at,
        expires_at: plan.expires_at,
        days_remaining: Math.ceil((new Date(plan.expires_at) - new Date()) / (1000 * 60 * 60 * 24))
      }
    });
  } catch (err) {
    console.error('Error fetching user plan:', err);
    res.status(500).json({ error: 'Failed to fetch active plan.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/plans/orders — Get all plan orders (ADMIN)
// ══════════════════════════════════════════════════════════════════
router.get('/orders', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT po.*, u.name as user_name, u.email as user_email
      FROM plan_orders po
      LEFT JOIN users u ON po.user_id = u.id
      ORDER BY po.created_at DESC
    `);
    res.json({ orders: result.rows });
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/plans/stats — Get plan subscription stats (ADMIN)
// ══════════════════════════════════════════════════════════════════
router.get('/stats', authMiddleware, adminOnly, async (req, res) => {
  try {
    const totalOrders = await db.query("SELECT COUNT(*) as count FROM plan_orders WHERE status = 'paid'");
    const activeSubscriptions = await db.query("SELECT COUNT(*) as count FROM plan_orders WHERE status = 'paid' AND expires_at > NOW()");
    const totalRevenue = await db.query("SELECT COALESCE(SUM(amount), 0) as total FROM plan_orders WHERE status = 'paid'");
    const recentOrders = await db.query(`
      SELECT po.plan_name, po.amount, po.status, po.created_at, u.name as user_name
      FROM plan_orders po
      LEFT JOIN users u ON po.user_id = u.id
      WHERE po.status = 'paid'
      ORDER BY po.created_at DESC
      LIMIT 5
    `);

    res.json({
      total_orders: parseInt(totalOrders.rows[0].count),
      active_subscriptions: parseInt(activeSubscriptions.rows[0].count),
      total_revenue: parseInt(totalRevenue.rows[0].total),
      recent_orders: recentOrders.rows
    });
  } catch (err) {
    console.error('Error fetching plan stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/plans/assign — Admin manually assigns a plan (ADMIN)
// For clients who paid offline (cash, UPI to personal account, etc.)
// ══════════════════════════════════════════════════════════════════
router.post('/assign', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { user_id, plan_id, payment_method, duration_months, start_date } = req.body;

    if (!user_id || !plan_id) {
      return res.status(400).json({ error: 'user_id and plan_id are required.' });
    }

    // Verify user exists
    const userRes = await db.query('SELECT id, name, email, phone FROM users WHERE id = $1 AND role = $2', [user_id, 'client']);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found.' });
    }
    const user = userRes.rows[0];

    // Verify plan exists
    const planRes = await db.query('SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true', [plan_id]);
    if (planRes.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found or inactive.' });
    }
    const plan = planRes.rows[0];

    const months = parseInt(duration_months) || 1;
    const startsAt = start_date ? new Date(start_date) : new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    // Create a paid order entry (manual/offline)
    const orderRes = await db.query(`
      INSERT INTO plan_orders (user_id, plan_id, plan_name, razorpay_order_id, razorpay_payment_id, amount, currency, status, starts_at, expires_at, buyer_name, buyer_email, buyer_phone)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      user_id,
      plan.id,
      plan.name,
      `manual_${Date.now()}`,
      `offline_${payment_method || 'cash'}_${Date.now()}`,
      plan.price_monthly * months,
      'INR',
      'paid',
      startsAt,
      expiresAt,
      user.name,
      user.email,
      user.phone
    ]);

    res.status(201).json({
      success: true,
      message: `${plan.name} plan assigned to ${user.name} for ${months} month(s).`,
      order: orderRes.rows[0]
    });
  } catch (err) {
    console.error('Error assigning plan:', err);
    res.status(500).json({ error: 'Failed to assign plan.' });
  }
});

module.exports = router;
