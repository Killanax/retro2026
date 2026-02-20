const path = require('path');

// Определяем тип БД из переменных окружения
// По умолчанию postgres для продакшена, sqlite только для локальной разработки
const DB_TYPE = process.env.DB_TYPE || 'postgres';
const isPostgres = DB_TYPE === 'postgres' || DB_TYPE === 'postgresql';

let pool;
let db;

if (isPostgres) {
  // ==================== PostgreSQL ====================
  const { Pool } = require('pg');

  // Инициализация пула соединений
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  // Проверка подключения
  pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL');
  });

  pool.on('error', (err) => {
    console.error('❌ Unexpected PostgreSQL error:', err.message);
  });

  // Объект для эмуляции better-sqlite3 API
  db = {
    prepare(sql) {
      return {
        run: async (...params) => {
          const client = await pool.connect();
          try {
            // Обработка INSERT с возвратом ID
            if (sql.trim().toUpperCase().startsWith('INSERT')) {
              const returnSql = sql.replace(/;?$/, ' RETURNING *');
              const result = await client.query(returnSql, params);
              return { id: result.rows[0]?.id, changes: 1 };
            }

            // Обработка UPDATE/DELETE
            const result = await client.query(sql, params);
            return { changes: result.rowCount };
          } finally {
            client.release();
          }
        },
        get: async (...params) => {
          const client = await pool.connect();
          try {
            const result = await client.query(sql, params);
            return result.rows[0] || null;
          } finally {
            client.release();
          }
        },
        all: async (...params) => {
          const client = await pool.connect();
          try {
            const result = await client.query(sql, params);
            return result.rows;
          } finally {
            client.release();
          }
        }
      };
    },
    exec: async (sql) => {
      const client = await pool.connect();
      try {
        await client.query(sql);
      } finally {
        client.release();
      }
    },
    query: async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return { rows: result.rows, rowCount: result.rowCount };
    }
  };

  async function initDatabase() {
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL is not set!');
      throw new Error('DATABASE_URL is required for PostgreSQL');
    }

    const client = await pool.connect();
    try {
      await createTables(client);
      console.log('✅ PostgreSQL database initialized');
    } finally {
      client.release();
    }
  }

  async function createTables(client) {
    // Таблица сессий
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        template TEXT DEFAULT 'classic',
        admin_name TEXT,
        status TEXT DEFAULT 'active',
        summary TEXT,
        action_items TEXT,
        vote_limit INTEGER DEFAULT 5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP
      )
    `);

    // Таблица элементов (идеи, мемы, смайлы)
    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        text TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        author TEXT DEFAULT 'Anonymous',
        type TEXT DEFAULT 'text',
        meme_url TEXT,
        emoji TEXT,
        votes INTEGER DEFAULT 0,
        reactions TEXT DEFAULT '{}',
        user_reactions TEXT DEFAULT '{}',
        status TEXT DEFAULT 'new',
        "order" INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица голосов
    await client.query(`
      CREATE TABLE IF NOT EXISTS votes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, user_id, item_id)
      )
    `);

    // Таблица участников
    await client.query(`
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'participant',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица пользовательских мемов
    await client.query(`
      CREATE TABLE IF NOT EXISTS custom_memes (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        created_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Глобальная таблица мемов (общие для всех сессий)
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_memes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        created_by TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица настроения пользователей
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_moods (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        mood TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, user_id)
      )
    `);
  }

  async function loadMemesFromDb() {
    try {
      const result = await pool.query('SELECT COUNT(*) as count FROM global_memes');
      const count = parseInt(result.rows[0]?.count || 0);

      if (count > 0) {
        console.log(`📌 Global memes already exist: ${count}`);
        return;
      }

      console.log('📌 No existing memes to load');
    } catch (err) {
      console.error('⚠️ Error loading memes:', err.message);
    }
  }

  async function closeDatabase() {
    await pool.end();
  }

  module.exports = { db, pool, initDatabase, loadMemesFromDb, closeDatabase };

} else {
  // ==================== SQLite ====================
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    console.error('❌ better-sqlite3 not installed. Run: npm install better-sqlite3');
    console.error('   Or use PostgreSQL by setting DB_TYPE=postgres');
    throw new Error('SQLite module not available');
  }

  const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, 'retro.db');
  const database = new Database(dbPath);

  console.log(`✅ Connected to SQLite: ${dbPath}`);

  // Объект с API, совместимым с PostgreSQL версией
  db = {
    prepare(sql) {
      const stmt = database.prepare(sql);
      return {
        run: (...params) => {
          const result = stmt.run(...params);
          return { id: result.lastInsertRowid, changes: result.changes };
        },
        get: (...params) => stmt.get(...params),
        all: (...params) => stmt.all(...params)
      };
    },
    exec: (sql) => database.exec(sql),
    query: (sql, params = []) => {
      const stmt = database.prepare(sql);
      const rows = stmt.all(...params);
      return { rows, rowCount: rows.length };
    }
  };

  // Пул для совместимости (заглушка)
  pool = {
    query: async (sql, params = []) => {
      const stmt = database.prepare(sql);
      const rows = stmt.all(...params);
      return { rows, rowCount: rows.length };
    }
  };

  function initDatabase() {
    // Включаем внешние ключи
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');

    // Таблица сессий
    database.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        template TEXT DEFAULT 'classic',
        admin_name TEXT,
        status TEXT DEFAULT 'active',
        summary TEXT,
        action_items TEXT,
        vote_limit INTEGER DEFAULT 5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME
      )
    `);

    // Таблица элементов (идеи, мемы, смайлы)
    database.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        text TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        author TEXT DEFAULT 'Anonymous',
        type TEXT DEFAULT 'text',
        meme_url TEXT,
        emoji TEXT,
        votes INTEGER DEFAULT 0,
        reactions TEXT DEFAULT '{}',
        user_reactions TEXT DEFAULT '{}',
        status TEXT DEFAULT 'new',
        "order" INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица голосов
    database.exec(`
      CREATE TABLE IF NOT EXISTS votes (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, user_id, item_id)
      )
    `);

    // Таблица участников
    database.exec(`
      CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'participant',
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица пользовательских мемов
    database.exec(`
      CREATE TABLE IF NOT EXISTS custom_memes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Глобальная таблица мемов (общие для всех сессий)
    database.exec(`
      CREATE TABLE IF NOT EXISTS global_memes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        created_by TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица настроения пользователей
    database.exec(`
      CREATE TABLE IF NOT EXISTS user_moods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        mood TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, user_id)
      )
    `);

    console.log('✅ SQLite database initialized');
  }

  async function loadMemesFromDb() {
    try {
      const result = database.prepare('SELECT COUNT(*) as count FROM global_memes').get();
      const count = result.count;

      if (count > 0) {
        console.log(`📌 Global memes already exist: ${count}`);
        return;
      }

      console.log('📌 No existing memes to load');
    } catch (err) {
      console.error('⚠️ Error loading memes:', err.message);
    }
  }

  function closeDatabase() {
    database.close();
  }

  module.exports = { db, pool, initDatabase, loadMemesFromDb, closeDatabase };
}
