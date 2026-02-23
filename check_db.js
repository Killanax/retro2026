require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkDatabase() {
  const client = await pool.connect();
  try {
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('Таблицы:', tables.rows.map(r => r.table_name));

    for (const table of tables.rows) {
      const name = table.table_name;
      console.log(`\n=== Таблица: ${name} ===`);
      const rows = await client.query(`SELECT * FROM ${name} LIMIT 10`);
      console.log(rows.rows);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

checkDatabase().catch(console.error);
