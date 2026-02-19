const Database = require('better-sqlite3');
const db = new Database('retro.db', { readonly: true });

try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Таблицы:', tables);
  
  for (const table of tables) {
    const name = table.name;
    console.log(`\n=== Таблица: ${name} ===`);
    const rows = db.prepare(`SELECT * FROM ${name} LIMIT 10`).all();
    console.log(rows);
  }
} finally {
  db.close();
}
