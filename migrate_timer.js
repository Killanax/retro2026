require('dotenv').config({ override: true });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Adding timer columns to sessions table...');
    
    await client.query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS timer_seconds INTEGER,
      ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS timer_running BOOLEAN DEFAULT false
    `);
    
    console.log('✅ Migration completed successfully');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
