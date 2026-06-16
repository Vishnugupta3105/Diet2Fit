const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost/diet2fit'
});

async function run() {
  const res = await pool.query('SELECT id, filename, filepath, public_id FROM diet_plans');
  console.log(res.rows);
  pool.end();
}
run();
