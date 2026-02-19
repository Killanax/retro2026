const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDatabase, db, loadMemesFromDb } = require('./database');
const { v4: uuidv4 } = require('uuid');

// Телеграм-смайлы для реакций
const TELEGRAM_EMOJIS = [
  { emoji: '👍', name: 'like' },
  { emoji: '👎', name: 'dislike' },
  { emoji: '❤️', name: 'heart' },
  { emoji: '🔥', name: 'fire' },
  { emoji: '🎉', name: 'party' },
  { emoji: '😄', name: 'happy' },
  { emoji: '😢', name: 'sad' },
  { emoji: '😡', name: 'angry' },
  { emoji: '🤔', name: 'think' },
  { emoji: '💩', name: 'poop' },
  { emoji: '💯', name: 'hundred' },
  { emoji: '🙏', name: 'pray' }
];

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Инициализация БД
initDatabase();
loadMemesFromDb();

// ==================== API ====================

// Создать новую сессию ретро
app.post('/api/sessions', (req, res) => {
  const { name, template, adminName } = req.body;
  const id = uuidv4();
  
  const stmt = db.prepare(`
    INSERT INTO sessions (id, name, template, admin_name, status)
    VALUES (?, ?, ?, ?, 'active')
  `);
  
  try {
    stmt.run(id, name, template || 'classic', adminName || 'Admin');
    res.json({ success: true, sessionId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить сессию
app.get('/api/sessions/:id', (req, res) => {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const session = stmt.get(req.params.id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json(session);
});

// Получить все идеи сессии
app.get('/api/sessions/:id/items', (req, res) => {
  const stmt = db.prepare('SELECT * FROM items WHERE session_id = ? ORDER BY created_at');
  const items = stmt.all(req.params.id);
  res.json(items);
});

// Получить одну идею
app.get('/api/sessions/:id/items/:itemId', (req, res) => {
  const stmt = db.prepare('SELECT * FROM items WHERE id = ?');
  const item = stmt.get(req.params.itemId);
  
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  res.json(item);
});

// Добавить идею
app.post('/api/sessions/:id/items', (req, res) => {
  const { text, category, author, type, order } = req.body;
  const sessionId = req.params.id;
  const id = uuidv4();

  const stmt = db.prepare(`
    INSERT INTO items (id, session_id, text, category, author, type, "order")
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    stmt.run(id, sessionId, text, category || 'general', author || 'Anonymous', type || 'text', order || 0);
    const newItem = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    io.to(sessionId).emit('item:created', newItem);
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Обновить идею (голосование, статус, категория для drag-n-drop, порядок)
app.patch('/api/sessions/:id/items/:itemId', (req, res) => {
  const { votes, status, category, text, order } = req.body;
  const { id: sessionId, itemId } = req.params;

  const updates = [];
  const params = [];

  if (votes !== undefined) {
    updates.push('votes = ?');
    params.push(votes);
  }
  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }
  if (category !== undefined) {
    updates.push('category = ?');
    params.push(category);
  }
  if (text !== undefined) {
    updates.push('text = ?');
    params.push(text);
  }
  if (order !== undefined) {
    updates.push('"order" = ?');
    params.push(order);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(itemId);

  const stmt = db.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`);

  try {
    stmt.run(...params);
    const updatedItem = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
    console.log(`[WS] Emitting item:updated to session ${sessionId}:`, { id: updatedItem.id, category: updatedItem.category });
    io.to(sessionId).emit('item:updated', updatedItem);
    res.json(updatedItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Удалить идею
app.delete('/api/sessions/:id/items/:itemId', (req, res) => {
  const { id: sessionId, itemId } = req.params;

  const stmt = db.prepare('DELETE FROM items WHERE id = ?');

  try {
    const result = stmt.run(itemId);
    console.log(`[WS] Emitting item:deleted to session ${sessionId}:`, { id: itemId, changes: result.changes });
    io.to(sessionId).emit('item:deleted', { id: itemId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Голосовать за идею
app.post('/api/sessions/:id/items/:itemId/vote', (req, res) => {
  const { itemId } = req.params;
  const { id: sessionId } = req.params;
  const { userId } = req.body;
  
  // Проверка, голосовал ли уже пользователь
  const existingVote = db.prepare(
    'SELECT * FROM votes WHERE session_id = ? AND user_id = ? AND item_id = ?'
  ).get(sessionId, userId, itemId);
  
  if (existingVote) {
    // Удалить голос
    db.prepare('DELETE FROM votes WHERE id = ?').run(existingVote.id);
    db.prepare('UPDATE items SET votes = votes - 1 WHERE id = ?').run(itemId);
  } else {
    // Добавить голос
    const voteId = uuidv4();
    db.prepare(`
      INSERT INTO votes (id, session_id, user_id, item_id)
      VALUES (?, ?, ?, ?)
    `).run(voteId, sessionId, userId, itemId);
    db.prepare('UPDATE items SET votes = votes + 1 WHERE id = ?').run(itemId);
  }
  
  const updatedItem = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  io.to(sessionId).emit('item:updated', updatedItem);
  res.json(updatedItem);
});

// Добавить/удалить реакцию (смайл)
app.post('/api/sessions/:id/items/:itemId/react', (req, res) => {
  const { itemId } = req.params;
  const { id: sessionId } = req.params;
  const { userId, emoji, reactionName, remove } = req.body;

  // Получаем текущие реакции
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }

  let reactions = item.reactions ? JSON.parse(item.reactions) : {};

  // Инициализируем реакции если нет
  TELEGRAM_EMOJIS.forEach(({ name }) => {
    if (!reactions[name]) reactions[name] = 0;
  });

  // Проверяем реакцию пользователя
  let userReactions = item.user_reactions ? JSON.parse(item.user_reactions) : {};

  if (remove) {
    // Удаляем реакцию
    if (userReactions[userId]) {
      const prevReaction = userReactions[userId];
      if (reactions[prevReaction] > 0) {
        reactions[prevReaction]--;
      }
      delete userReactions[userId];
    }
  } else {
    // Добавляем/меняем реакцию
    if (userReactions[userId] && userReactions[userId] !== reactionName) {
      // Удаляем старую реакцию
      if (reactions[userReactions[userId]] > 0) {
        reactions[userReactions[userId]]--;
      }
    }
    // Добавляем новую
    reactions[reactionName] = (reactions[reactionName] || 0) + 1;
    userReactions[userId] = reactionName;
  }

  // Обновляем в БД
  db.prepare('UPDATE items SET reactions = ?, user_reactions = ? WHERE id = ?')
    .run(JSON.stringify(reactions), JSON.stringify(userReactions), itemId);

  const updatedItem = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  
  // Отправляем через WebSocket всем клиентам в сессии
  io.to(sessionId).emit('reaction:updated', { 
    itemId, 
    reactions, 
    user_reactions: userReactions,
    userId 
  });
  io.to(sessionId).emit('item:updated', updatedItem);
  
  res.json(updatedItem);
});

// Завершить сессию
app.post('/api/sessions/:id/end', (req, res) => {
  const { summary, actionItems } = req.body;
  const { id } = req.params;
  
  const stmt = db.prepare(`
    UPDATE sessions SET status = 'completed', summary = ?, action_items = ?, ended_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  
  try {
    stmt.run(summary || null, actionItems ? JSON.stringify(actionItems) : null, id);
    io.to(id).emit('session:ended', { summary, actionItems });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить историю сессий
app.get('/api/sessions', (req, res) => {
  const stmt = db.prepare(`
    SELECT id, name, template, admin_name, status, created_at, ended_at
    FROM sessions
    ORDER BY created_at DESC
  `);
  const sessions = stmt.all();
  res.json(sessions);
});

// Удалить сессию
app.delete('/api/sessions/:id', (req, res) => {
  const { id } = req.params;

  // Сначала удаляем все связанные записи
  const deleteItems = db.prepare('DELETE FROM items WHERE session_id = ?');
  const deleteVotes = db.prepare('DELETE FROM votes WHERE session_id = ?');
  const deleteMoods = db.prepare('DELETE FROM user_moods WHERE session_id = ?');
  const deleteSession = db.prepare('DELETE FROM sessions WHERE id = ?');

  try {
    deleteItems.run(id);
    deleteVotes.run(id);
    deleteMoods.run(id);
    deleteSession.run(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== API для мемов ====================

// Получить мемы сессии
app.get('/api/sessions/:id/memes', (req, res) => {
  const stmt = db.prepare('SELECT * FROM custom_memes WHERE session_id = ? ORDER BY created_at');
  const memes = stmt.all(req.params.id);
  res.json(memes);
});

// Добавить мем
app.post('/api/sessions/:id/memes', (req, res) => {
  const { name, url, createdBy } = req.body;
  const sessionId = req.params.id;

  const stmt = db.prepare(`
    INSERT INTO custom_memes (session_id, name, url, created_by)
    VALUES (?, ?, ?, ?)
  `);

  try {
    stmt.run(sessionId, name, url, createdBy || 'unknown');
    const newMeme = db.prepare('SELECT * FROM custom_memes WHERE id = last_insert_rowid()').get();
    io.to(sessionId).emit('meme:added', newMeme);
    res.json(newMeme);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Удалить мем
app.delete('/api/sessions/:id/memes/:memeId', (req, res) => {
  const { id: sessionId, memeId } = req.params;

  const stmt = db.prepare('DELETE FROM custom_memes WHERE id = ? AND session_id = ?');

  try {
    const result = stmt.run(memeId, sessionId);
    if (result.changes > 0) {
      io.to(sessionId).emit('meme:removed', { id: memeId });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Meme not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Обновить лимит голосов
app.post('/api/sessions/:id/vote-limit', (req, res) => {
  const { voteLimit } = req.body;
  const { id: sessionId } = req.params;

  if (!voteLimit || voteLimit < 1 || voteLimit > 100) {
    return res.status(400).json({ error: 'Invalid vote limit' });
  }

  const stmt = db.prepare('UPDATE sessions SET vote_limit = ? WHERE id = ?');

  try {
    stmt.run(voteLimit, sessionId);
    io.to(sessionId).emit('vote-limit:updated', { voteLimit });
    res.json({ success: true, voteLimit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== API для глобальных мемов ====================

// Получить все глобальные мемы
app.get('/api/memes', (req, res) => {
  const stmt = db.prepare('SELECT * FROM global_memes WHERE is_active = 1 ORDER BY created_at DESC');
  const memes = stmt.all();
  res.json(memes);
});

// Добавить глобальный мем (только админ сессии)
app.post('/api/memes', (req, res) => {
  const { name, url, createdBy, sessionId } = req.body;

  // Проверяем, является ли пользователь админом сессии
  if (sessionId) {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!session || !session.admin_name) {
      return res.status(403).json({ error: 'Only session admin can add memes' });
    }
  }

  const stmt = db.prepare(`
    INSERT INTO global_memes (name, url, created_by)
    VALUES (?, ?, ?)
  `);

  try {
    stmt.run(name, url, createdBy || 'unknown');
    const newMeme = db.prepare('SELECT * FROM global_memes WHERE id = last_insert_rowid()').get();
    io.emit('meme:added:global', newMeme);
    res.json(newMeme);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Удалить глобальный мем (только админ)
app.delete('/api/memes/:memeId', (req, res) => {
  const { memeId } = req.params;

  const stmt = db.prepare('UPDATE global_memes SET is_active = 0 WHERE id = ?');

  try {
    const result = stmt.run(memeId);
    if (result.changes > 0) {
      io.emit('meme:removed:global', { id: memeId });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Meme not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Обновить настроение пользователя
app.post('/api/sessions/:id/mood', (req, res) => {
  const { userId, mood } = req.body;
  const { id: sessionId } = req.params;

  const stmt = db.prepare(`
    INSERT INTO user_moods (session_id, user_id, mood)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id, user_id) DO UPDATE SET mood = ?, updated_at = CURRENT_TIMESTAMP
  `);

  try {
    stmt.run(sessionId, userId, mood, mood);
    io.to(sessionId).emit('mood:updated', { userId, mood });
    res.json({ success: true, mood });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить счётчики настроения
app.get('/api/sessions/:id/moods', (req, res) => {
  const { id: sessionId } = req.params;

  const stmt = db.prepare(`
    SELECT mood, COUNT(*) as count
    FROM user_moods
    WHERE session_id = ?
    GROUP BY mood
  `);

  try {
    const moods = stmt.all(sessionId);
    res.json(moods);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== WebSocket ====================

// Хранилище таймеров по сессиям
const sessionTimers = new Map();
// Хранилище участников по сессиям
const sessionParticipants = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (sessionId) => {
    socket.join(sessionId);
    console.log(`[WS] User ${socket.id} joined session ${sessionId}`);

    // Отправляем текущее состояние таймера
    const timer = sessionTimers.get(sessionId);
    if (timer) {
      socket.emit('timer:update', timer);
    }

    // Отправляем список участников
    const participants = sessionParticipants.get(sessionId) || [];
    socket.emit('participants:list', participants);
  });

  socket.on('participant:join', (data) => {
    const { sessionId, userId, name, isAdmin } = data;
    socket.join(sessionId);
    console.log(`[WS] Participant ${name} (${userId}) joined session ${sessionId}, isAdmin: ${isAdmin}, socket.id: ${socket.id}`);

    // Добавляем участника с socket.id
    if (!sessionParticipants.has(sessionId)) {
      sessionParticipants.set(sessionId, []);
    }
    const participants = sessionParticipants.get(sessionId);

    // Удаляем если уже был (переподключение)
    const existingIndex = participants.findIndex(p => p.userId === userId);
    if (existingIndex >= 0) {
      participants.splice(existingIndex, 1);
    }

    // Сохраняем socketId для отслеживания отключений
    participants.push({ userId, name, isAdmin, socketId: socket.id });
    sessionParticipants.set(sessionId, participants);

    // Сообщаем всем о новом участнике
    io.to(sessionId).emit('participant:joined', { userId, name, isAdmin });

    console.log(`[WS] Emitted participant:joined to session ${sessionId}:`, { userId, name, isAdmin });
  });
  
  socket.on('participant:list', (sessionId) => {
    const participants = sessionParticipants.get(sessionId) || [];
    socket.emit('participants:list', participants);
  });

  // Таймер
  socket.on('timer:start', (data) => {
    const { sessionId, seconds } = data;
    sessionTimers.set(sessionId, { seconds, running: true });
    io.to(sessionId).emit('timer:started', { seconds });
    console.log(`Timer started in session ${sessionId}: ${seconds}s`);
  });
  
  socket.on('timer:stop', (data) => {
    const { sessionId } = data;
    const timer = sessionTimers.get(sessionId);
    if (timer) {
      timer.running = false;
      sessionTimers.set(sessionId, timer);
    }
    io.to(sessionId).emit('timer:stopped');
    console.log(`Timer stopped in session ${sessionId}`);
  });
  
  socket.on('timer:reset', (data) => {
    const { sessionId } = data;
    sessionTimers.set(sessionId, { seconds: 0, running: false });
    io.to(sessionId).emit('timer:reset');
    console.log(`Timer reset in session ${sessionId}`);
  });

  // Явный выход участника из сессии
  socket.on('participant:leave', (data) => {
    const { sessionId, userId } = data;
    
    sessionParticipants.forEach((participants, sid) => {
      const index = participants.findIndex(p => p.userId === userId && (!sessionId || sid === sessionId));
      if (index >= 0) {
        const removed = participants.splice(index, 1)[0];
        sessionParticipants.set(sid, participants);
        io.to(sid).emit('participant:left', {
          userId: removed.userId,
          name: removed.name
        });
        console.log(`Participant ${removed.name} left session ${sid}`);
      }
    });
  });
  
  socket.on('timer:finished', (data) => {
    const { sessionId } = data;
    sessionTimers.set(sessionId, { seconds: 0, running: false });
    io.to(sessionId).emit('timer:reset');
  });

  socket.on('item:created', (data) => {
    socket.to(data.session_id).emit('item:created', data);
  });

  // Мемы - добавление через WebSocket
  socket.on('meme:add', (data) => {
    const { sessionId, name, url, createdBy } = data;
    const stmt = db.prepare(`
      INSERT INTO custom_memes (session_id, name, url, created_by)
      VALUES (?, ?, ?, ?)
    `);
    try {
      stmt.run(sessionId, name, url, createdBy || 'unknown');
      const newMeme = db.prepare('SELECT * FROM custom_memes WHERE id = last_insert_rowid()').get();
      // Отправляем всем в сессии включая отправителя
      io.in(sessionId).emit('meme:added', newMeme);
      console.log(`[WS] Meme added to session ${sessionId}: ${name}`);
    } catch (err) {
      console.error('[WS] Error adding meme:', err.message);
    }
  });

  // Мемы - удаление через WebSocket
  socket.on('meme:remove', (data) => {
    const { sessionId, memeId } = data;
    const stmt = db.prepare('DELETE FROM custom_memes WHERE id = ? AND session_id = ?');
    try {
      const result = stmt.run(memeId, sessionId);
      if (result.changes > 0) {
        io.in(sessionId).emit('meme:removed', { id: memeId });
        console.log(`[WS] Meme removed from session ${sessionId}`);
      }
    } catch (err) {
      console.error('[WS] Error removing meme:', err.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    // Удаляем участника из всех сессий по socketId
    sessionParticipants.forEach((participants, sessionId) => {
      const index = participants.findIndex(p => p.socketId === socket.id);
      if (index >= 0) {
        const removed = participants.splice(index, 1)[0];
        sessionParticipants.set(sessionId, participants);
        io.to(sessionId).emit('participant:left', {
          userId: removed.userId,
          name: removed.name
        });
        console.log(`Participant ${removed.name} left session ${sessionId}`);
      }
    });
  });
});

// Запуск сервера
server.listen(PORT, () => {
  console.log(`🚀 Retro server running on http://localhost:${PORT}`);
});
