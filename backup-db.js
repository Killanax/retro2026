// запускать из командрой строки командой node backup-db.js

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'aws-1-eu-west-3.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.hcrptymibbiryvxhmjjh',
  password: 'E8fReBp7Mp!',
  ssl: { rejectUnauthorized: false }
});

async function backup() {
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupFile = path.join(backupDir, `retro_backup_${timestamp}.sql`);

  console.log('Creating backup...');

  const tables = [
    'sessions',
    'items',
    'votes',
    'participants',
    'custom_memes',
    'global_memes',
    'user_moods'
  ];

  let sql = `-- Supabase Backup\n-- Created: ${new Date().toISOString()}\n\n`;

  for (const table of tables) {
    console.log(`Backing up ${table}...`);
    
    const result = await pool.query(`SELECT * FROM ${table}`);
    
    if (result.rows.length > 0) {
      sql += `-- Table: ${table}\n`;
      sql += `-- Rows: ${result.rows.length}\n\n`;
      
      for (const row of result.rows) {
        const columns = Object.keys(row).join(', ');
        const values = Object.values(row).map(v => {
          if (v === null) return 'NULL';
          if (typeof v === 'number') return v;
          if (typeof v === 'boolean') return v;
          return `'${String(v).replace(/'/g, "''")}'`;
        }).join(', ');
        
        sql += `INSERT INTO ${table} (${columns}) VALUES (${values});\n`;
      }
      sql += '\n';
    }
  }

  fs.writeFileSync(backupFile, sql);
  console.log(`Backup saved to: ${backupFile}`);
  
  await pool.end();
  console.log('Done!');
}

backup().catch(console.error);
