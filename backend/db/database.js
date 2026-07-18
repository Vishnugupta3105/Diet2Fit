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
          INSERT INTO subscription_plans (name, slug, price_monthly, display_price, tagline, features, is_popular, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [p.name, p.slug, p.price_monthly, p.display_price, p.tagline, JSON.stringify(p.features), p.is_popular, p.sort_order]);
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
