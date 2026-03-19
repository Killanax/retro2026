require('dotenv').config({ override: true });

const { Pool } = require('pg');

// Инициализация пула соединений PostgreSQL
const pool = new Pool({
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

// Объект для эмуляции better-sqlite3 API (для совместимости)
const db = {
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
      ended_at TIMESTAMP,
      column_headers TEXT,
      created_by_user_id TEXT,
      is_admin_session BOOLEAN DEFAULT false,
      hide_others_cards BOOLEAN DEFAULT false,
      hide_others_votes BOOLEAN DEFAULT false,
      template_columns TEXT,
      timer_seconds INTEGER,
      timer_started_at TIMESTAMP,
      timer_running BOOLEAN DEFAULT false
    )
  `);

  // Добавляем поле template_columns если его нет (для старых баз)
  await client.query(`
    ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS template_columns TEXT
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
      merged_parts_data TEXT,
      for_discussion BOOLEAN DEFAULT false,
      action_plan_text TEXT,
      action_plan_who TEXT,
      action_plan_when TEXT,
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

  // Миграции для существующих таблиц
  await runMigrations(client);
}

async function runMigrations(client) {
  try {
    // Добавляем колонки action_plan если их нет
    await client.query(`
      ALTER TABLE items 
      ADD COLUMN IF NOT EXISTS for_discussion BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS action_plan_text TEXT,
      ADD COLUMN IF NOT EXISTS action_plan_who TEXT,
      ADD COLUMN IF NOT EXISTS action_plan_when TEXT
    `);
    
    await client.query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS hide_others_cards BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS hide_others_votes BOOLEAN DEFAULT false
    `);
    
    // Создаём таблицу vote_mode_votes если нет
    await client.query(`
      CREATE TABLE IF NOT EXISTS vote_mode_votes (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, item_id, user_id)
      )
    `);
    
    console.log('✅ Database migrations completed');
  } catch (err) {
    console.error('⚠️ Migration error:', err.message);
  }
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
