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
    `);

    // Run migrations for existing databases
    try { await pool.query('ALTER TABLE diet_plans ADD COLUMN IF NOT EXISTS public_id TEXT'); } catch(e) {}
    try { await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_weight_kg REAL'); } catch(e) {}
    try { await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_height_cm REAL'); } catch(e) {}
    try { await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_age INTEGER'); } catch(e) {}
    try { await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_gender TEXT'); } catch(e) {}
    try { await pool.query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS client_bmi REAL'); } catch(e) {}
    try { await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER'); } catch(e) {}

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
