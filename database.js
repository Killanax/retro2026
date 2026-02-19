const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'retro.db'));

function initDatabase() {
  // Таблица сессий
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      template TEXT DEFAULT 'classic',
      admin_name TEXT,
      status TEXT DEFAULT 'active',
      summary TEXT,
      action_items TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME
    )
  `);

  // Таблица элементов (идеи, мемы, смайлы)
  db.exec(`
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  // Таблица голосов
  db.exec(`
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (item_id) REFERENCES items(id),
      UNIQUE(session_id, user_id, item_id)
    )
  `);

  // Таблица участников
  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'participant',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  // Добавляем новые колонки если их нет (для существующих БД)
  try {
    db.exec("ALTER TABLE items ADD COLUMN reactions TEXT DEFAULT '{}'");
  } catch (e) {
    // Колонка уже существует
  }
  
  try {
    db.exec("ALTER TABLE items ADD COLUMN user_reactions TEXT DEFAULT '{}'");
  } catch (e) {
    // Колонка уже существует
  }

  try {
    db.exec('ALTER TABLE items ADD COLUMN "order" INTEGER DEFAULT 0');
  } catch (e) {
    // Колонка уже существует
  }

  // Таблица пользовательских мемов
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_memes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )
  `);

  // Добавляем поле vote_limit если его нет
  try {
    db.exec('ALTER TABLE sessions ADD COLUMN vote_limit INTEGER DEFAULT 5');
  } catch (e) {
    // Колонка уже существует
  }

  // Глобальная таблица мемов (общие для всех сессий)
  db.exec(`
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_moods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      mood TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      UNIQUE(session_id, user_id)
    )
  `);

  console.log('✅ Database initialized');
}

// Загрузка мемов из retro.db при запуске
function loadMemesFromDb() {
  try {
    // Проверяем, есть ли уже мемы в global_memes
    const existingCount = db.prepare('SELECT COUNT(*) as count FROM global_memes').get();
    if (existingCount.count > 0) {
      console.log(`📌 Global memes already exist: ${existingCount.count}`);
      return;
    }

    // Если мемов нет, проверяем есть ли данные в user_moods (значит БД не пустая)
    const moodCount = db.prepare('SELECT COUNT(*) as count FROM user_moods').get();
    if (moodCount.count === 0) {
      console.log('📌 No existing data to load memes from');
      return;
    }

    // Мемы уже есть в global_memes - они сохраняются в retro.db
    const memes = db.prepare('SELECT * FROM global_memes WHERE is_active = 1').all();
    console.log(`📌 Loaded ${memes.length} global meme(s) from retro.db`);
  } catch (err) {
    console.error('⚠️ Error loading memes:', err.message);
  }
}

module.exports = { db, initDatabase, loadMemesFromDb };
