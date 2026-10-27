const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Catch pool errors to prevent the entire Node.js server from crashing
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

const initializeDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'client' CHECK(role IN ('admin', 'client')),
        goal_weight REAL,
        height_cm REAL,
        date_of_birth TEXT,
        gender TEXT,
        age INTEGER,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS weight_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        weight_kg REAL NOT NULL,
        date TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id SERIAL PRIMARY KEY,
        client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        client_name TEXT,
        client_email TEXT,
        client_phone TEXT,
        client_weight_kg REAL,
        client_height_cm REAL,
        client_age INTEGER,
        client_gender TEXT,
        client_bmi REAL,
        type TEXT NOT NULL DEFAULT 'whatsapp',
        goal TEXT,
        preferred_date TEXT,
        preferred_time TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'completed', 'cancelled')),
        room_id TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_weight_user_date ON weight_logs(user_id, date);
      CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);
      CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

      CREATE TABLE IF NOT EXISTS diet_plans (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        filepath TEXT NOT NULL,
        public_id TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_diet_plans_client ON diet_plans(client_id);

      CREATE TABLE IF NOT EXISTS available_slots (
        id SERIAL PRIMARY KEY,
        slot_date TEXT NOT NULL,
        slot_time TEXT NOT NULL,
        is_booked BOOLEAN DEFAULT FALSE,
        booked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(slot_date, slot_time)
      );

      CREATE TABLE IF NOT EXISTS device_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        platform TEXT DEFAULT 'android',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS subscription_plans (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        price_monthly INTEGER NOT NULL,
        display_price TEXT NOT NULL,
        price_monthly_usd INTEGER,
        display_price_usd TEXT,
        tagline TEXT,
        features JSONB NOT NULL DEFAULT '{}',
        is_popular BOOLEAN DEFAULT FALSE,
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS plan_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        plan_id INTEGER REFERENCES subscription_plans(id),
        plan_name TEXT,
        razorpay_order_id TEXT,
        razorpay_payment_id TEXT,
        razorpay_signature TEXT,
        amount INTEGER NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT DEFAULT 'created' CHECK(status IN ('created','paid','failed','refunded')),
        starts_at TIMESTAMP,
        expires_at TIMESTAMP,
        buyer_name TEXT,
        buyer_email TEXT,
        buyer_phone TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_plan_orders_user ON plan_orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_plan_orders_status ON plan_orders(status);
      CREATE TABLE IF NOT EXISTS offers (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        subtitle TEXT,
        tagline TEXT,
        badge TEXT DEFAULT 'DIWALI SPECIAL OFFER',
        price INTEGER NOT NULL,
        original_price INTEGER NOT NULL,
        display_price TEXT NOT NULL,
        display_original_price TEXT NOT NULL,
        currency TEXT DEFAULT 'INR',
        duration_days INTEGER DEFAULT 30,
        duration_label TEXT DEFAULT '30 Days (1 Month)',
        total_slots INTEGER DEFAULT 20,
        banner_text TEXT,
        cta_text TEXT DEFAULT 'Claim Diwali Offer — ₹799',
        features JSONB NOT NULL DEFAULT '[]',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_offers_code ON offers(code);
      CREATE INDEX IF NOT EXISTS idx_offers_active ON offers(is_active);
    `);

    // Run migrations for existing databases
    try { await pool.query('ALTER TABLE diet_plans ADD COLUMN IF NOT EXISTS public_id TEXT'); } catch(e) {}
    try { await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_weight_kg REAL'); } catch(e) {}
    try { await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_height_cm REAL'); } catch(e) {}
    try { await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_age INTEGER'); } catch(e) {}
    try { await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_gender TEXT'); } catch(e) {}
    try { await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_bmi REAL'); } catch(e) {}
    try { await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER'); } catch(e) {}
    try { await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_followup BOOLEAN DEFAULT FALSE'); } catch(e) {}
    try { await pool.query('ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_monthly_usd INTEGER'); } catch(e) {}
    try { await pool.query('ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS display_price_usd TEXT'); } catch(e) {}

    // Backfill USD prices for existing plans in production
    try {
      await pool.query("UPDATE subscription_plans SET price_monthly_usd = 14900, display_price_usd = '$149' WHERE slug = 'starter' AND price_monthly_usd IS NULL");
      await pool.query("UPDATE subscription_plans SET price_monthly_usd = 19900, display_price_usd = '$199' WHERE slug = 'signature' AND price_monthly_usd IS NULL");
      await pool.query("UPDATE subscription_plans SET price_monthly_usd = 34900, display_price_usd = '$349' WHERE slug = 'complete-care' AND price_monthly_usd IS NULL");
    } catch(e) { console.error('Error backfilling USD prices:', e); }

    // Seed or sync Diwali Glow Reset in subscription_plans
    try {
      const diwaliPlanRes = await pool.query("SELECT id FROM subscription_plans WHERE slug = 'diwali-glow-reset'");
      if (diwaliPlanRes.rows.length === 0) {
        await pool.query(`
          INSERT INTO subscription_plans (name, slug, price_monthly, display_price, price_monthly_usd, display_price_usd, tagline, features, is_popular, sort_order, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          'Diwali Glow Reset',
          'diwali-glow-reset',
          79900,
          '₹799',
          7900,
          '$79',
          'Glow from within. Diwali-ready. Transform in 30 days.',
          JSON.stringify({
            duration: '30-Day Personalized Plan',
            consultations: '2 One-on-One Consultations',
            glow_guide: 'DIY Glow Guide (PDF)',
            whatsapp_support: 'WhatsApp check-ins & festive guidance',
            slots: 'Limited 20 slots'
          }),
          false,
          99,
          true
        ]);
        console.log('✅ Diwali Glow Reset seeded into subscription_plans');
      }
    } catch(e) { console.error('Error seeding diwali plan in subscription_plans:', e); }

    // Seed Barter plan in subscription_plans (Internal Admin / Content Creator Barter)
    try {
      const barterPlanRes = await pool.query("SELECT id FROM subscription_plans WHERE slug = 'barter'");
      if (barterPlanRes.rows.length === 0) {
        const signatureFeatures = {
          lab_report: true,
          travel_plan: true,
          fasting_plan: true,
          plan_revisions: '4/month',
          recipe_library: 'Full (100+ recipes)',
          family_meal_plan: false,
          whatsapp_support: '24-hour',
          education_modules: true,
          video_consultations: '4/month (weekly)'
        };
        await pool.query(`
          INSERT INTO subscription_plans (name, slug, price_monthly, display_price, price_monthly_usd, display_price_usd, tagline, features, is_popular, sort_order, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          'Barter',
          'barter',
          0,
          '₹0',
          0,
          '$0',
          'Content Creator / Influencer Barter Collaboration (Signature Tier)',
          JSON.stringify(signatureFeatures),
          false,
          50,
          true
        ]);
        console.log('✅ Barter plan seeded into subscription_plans');
      }
    } catch(e) { console.error('Error seeding barter plan in subscription_plans:', e); }

    // Seed Diwali Glow Reset offer
    try {
      const offerRes = await pool.query("SELECT id FROM offers WHERE code = 'diwali-glow-reset'");
      if (offerRes.rows.length === 0) {
        const diwaliFeatures = [
          { title: '30-Day Personalized Plan', desc: 'Made around your body & lifestyle' },
          { title: '2 One-on-One Consultations', desc: 'Start strong, stay on track' },
          { title: 'DIY Glow Guide (PDF)', desc: 'Face-pack & hair remedies for festive glow' },
          { title: 'WhatsApp Check-ins', desc: 'Festive sweet management & guidance' }
        ];
        await pool.query(`
          INSERT INTO offers (
            code, title, subtitle, tagline, badge, price, original_price, display_price, display_original_price, duration_days, duration_label, total_slots, banner_text, cta_text, features, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `, [
          'diwali-glow-reset',
          'Diwali Glow Reset',
          'Start today • Glow by Diwali • Transform in 30 days',
          'Glow from within. Diwali-ready.',
          'DIWALI SPECIAL OFFER',
          79900,
          350000,
          '₹799',
          '₹3,500+',
          30,
          '30 Days (1 Month)',
          20,
          '🪔 Diwali Glow Reset — 30-Day Personalized Plan + 2 Consultations + DIY Glow Guide for ₹799 (Worth ₹3,500+). Limited 20 slots!',
          'Claim Diwali Offer — ₹799',
          JSON.stringify(diwaliFeatures),
          true
        ]);
        console.log('✅ Diwali Glow Reset offer seeded into offers table');
      }
    } catch(e) { console.error('Error seeding diwali offer:', e); }


    // Seed Admin Account
    const adminRes = await pool.query('SELECT id FROM users WHERE role = $1', ['admin']);
    if (adminRes.rows.length === 0) {
      const hash = bcrypt.hashSync('admin123', 10);
      await pool.query(`
        INSERT INTO users (name, email, phone, password_hash, role)
        VALUES ($1, $2, $3, $4, $5)
      `, ['Dt. Disha', 'admin@diet2fit.com', '+918306404335', hash, 'admin']);
      console.log('✅ Admin account seeded: admin@diet2fit.com / admin123');
    }

    // Seed Subscription Plans
    const plansRes = await pool.query('SELECT id FROM subscription_plans LIMIT 1');
    if (plansRes.rows.length === 0) {
      const plans = [
        {
          name: 'Starter',
          slug: 'starter',
          price_monthly: 149900,
          display_price: '₹1,499',
          price_monthly_usd: 14900,
          display_price_usd: '$149',
          tagline: 'Perfect to begin your health journey',
          is_popular: false,
          sort_order: 1,
          features: {
            video_consultations: '2/month',
            whatsapp_support: '9am–7pm, next-day reply',
            plan_revisions: '2/month',
            lab_report: true,
            travel_plan: false,
            fasting_plan: false,
            recipe_library: 'Core (30 recipes)',
            education_modules: true,
            family_meal_plan: false
          }
        },
        {
          name: 'Signature',
          slug: 'signature',
          price_monthly: 199900,
          display_price: '₹1,999',
          price_monthly_usd: 19900,
          display_price_usd: '$199',
          tagline: 'Our most popular — weekly guidance & full access',
          is_popular: true,
          sort_order: 2,
          features: {
            video_consultations: '4/month (weekly)',
            whatsapp_support: '24-hour',
            plan_revisions: '4/month',
            lab_report: true,
            travel_plan: true,
            fasting_plan: true,
            recipe_library: 'Full (100+ recipes)',
            education_modules: true,
            family_meal_plan: false
          }
        },
        {
          name: 'Complete Care',
          slug: 'complete-care',
          price_monthly: 349900,
          display_price: '₹3,499',
          price_monthly_usd: 34900,
          display_price_usd: '$349',
          tagline: 'Premium care with priority access & family plan',
          is_popular: false,
          sort_order: 3,
          features: {
            video_consultations: '4/month + on-demand calls',
            whatsapp_support: 'Priority, under 4hr reply',
            plan_revisions: 'Unlimited',
            lab_report: true,
            travel_plan: true,
            fasting_plan: true,
            recipe_library: 'Full (100+ recipes)',
            education_modules: true,
            family_meal_plan: '1 included'
          }
        }
      ];

      for (const p of plans) {
        await pool.query(`
          INSERT INTO subscription_plans (name, slug, price_monthly, display_price, price_monthly_usd, display_price_usd, tagline, features, is_popular, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [p.name, p.slug, p.price_monthly, p.display_price, p.price_monthly_usd, p.display_price_usd, p.tagline, JSON.stringify(p.features), p.is_popular, p.sort_order]);
      }
      console.log('✅ Subscription plans seeded: Starter, Signature, Complete Care');
    }
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
};

if (process.env.DATABASE_URL) {
  initializeDB();
} else {
  console.log('⚠️ DATABASE_URL not set. Skipping DB initialization.');
}

module.exports = pool;
