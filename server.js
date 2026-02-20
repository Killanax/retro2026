const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { initDatabase, pool, loadMemesFromDb } = require('./database');
const crypto = require('crypto');

const uuidv4 = () => crypto.randomUUID();

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

// ==================== API ====================

// Создать новую сессию ретро
app.post('/api/sessions', async (req, res) => {
  const { name, template, adminName } = req.body;
  const id = uuidv4();

  try {
    await pool.query(
      'INSERT INTO sessions (id, name, template, admin_name, status) VALUES ($1, $2, $3, $4, $5)',
      [id, name, template || 'classic', adminName || 'Admin', 'active']
    );
    res.json({ success: true, sessionId: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить сессию
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    const session = result.rows[0];

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить все идеи сессии
app.get('/api/sessions/:id/items', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM items WHERE session_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить одну идею
app.get('/api/sessions/:id/items/:itemId', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [req.params.itemId]);
    const item = result.rows[0];

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Добавить идею
app.post('/api/sessions/:id/items', async (req, res) => {
  const { text, category, author, type, order } = req.body;
  const sessionId = req.params.id;
  const id = uuidv4();

  try {
    await pool.query(
      `INSERT INTO items (id, session_id, text, category, author, type, "order")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, sessionId, text, category || 'general', author || 'Anonymous', type || 'text', order || 0]
    );
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
    const newItem = result.rows[0];
    io.to(sessionId).emit('item:created', newItem);
    res.json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Обновить идею (голосование, статус, категория для drag-n-drop, порядок)
app.patch('/api/sessions/:id/items/:itemId', async (req, res) => {
  const { votes, status, category, text, order } = req.body;
  const { id: sessionId, itemId } = req.params;

  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (votes !== undefined) {
    updates.push(`votes = $${paramIndex++}`);
    params.push(votes);
  }
  if (status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    params.push(status);
  }
  if (category !== undefined) {
    updates.push(`category = $${paramIndex++}`);
    params.push(category);
  }
  if (text !== undefined) {
    updates.push(`text = $${paramIndex++}`);
    params.push(text);
  }
  if (order !== undefined) {
    updates.push(`"order" = $${paramIndex++}`);
    params.push(order);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(itemId);

  try {
    await pool.query(`UPDATE items SET ${updates.join(', ')} WHERE id = $${paramIndex}`, params);
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [itemId]);
    const updatedItem = result.rows[0];
    console.log(`[WS] Emitting item:updated to session ${sessionId}:`, { id: updatedItem.id, category: updatedItem.category });
    io.to(sessionId).emit('item:updated', updatedItem);
    res.json(updatedItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Удалить идею
app.delete('/api/sessions/:id/items/:itemId', async (req, res) => {
  const { id: sessionId, itemId } = req.params;

  try {
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING *', [itemId]);
    console.log(`[WS] Emitting item:deleted to session ${sessionId}:`, { id: itemId, changes: result.rowCount });
    io.to(sessionId).emit('item:deleted', { id: itemId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Голосовать за идею
app.post('/api/sessions/:id/items/:itemId/vote', async (req, res) => {
  const { itemId } = req.params;
  const { id: sessionId } = req.params;
  const { userId } = req.body;

  try {
    // Проверка, голосовал ли уже пользователь
    const existingVote = await pool.query(
      'SELECT * FROM votes WHERE session_id = $1 AND user_id = $2 AND item_id = $3',
      [sessionId, userId, itemId]
    );

    if (existingVote.rows[0]) {
      // Удалить голос
      await pool.query('DELETE FROM votes WHERE id = $1', [existingVote.rows[0].id]);
      await pool.query('UPDATE items SET votes = votes - 1 WHERE id = $1', [itemId]);
    } else {
      // Добавить голос
      const voteId = uuidv4();
      await pool.query(
        'INSERT INTO votes (id, session_id, user_id, item_id) VALUES ($1, $2, $3, $4)',
        [voteId, sessionId, userId, itemId]
      );
      await pool.query('UPDATE items SET votes = votes + 1 WHERE id = $1', [itemId]);
    }

    const result = await pool.query('SELECT * FROM items WHERE id = $1', [itemId]);
    const updatedItem = result.rows[0];
    io.to(sessionId).emit('item:updated', updatedItem);
    res.json(updatedItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Добавить/удалить реакцию (смайл)
app.post('/api/sessions/:id/items/:itemId/react', async (req, res) => {
  const { itemId } = req.params;
  const { id: sessionId } = req.params;
  const { userId, emoji, reactionName, remove } = req.body;

  try {
    // Получаем текущие реакции
    const itemResult = await pool.query('SELECT * FROM items WHERE id = $1', [itemId]);
    const item = itemResult.rows[0];
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    let reactions = item.reactions ? JSON.parse(item.reactions) : {};
    let userReactions = item.user_reactions ? JSON.parse(item.user_reactions) : {};

    // Инициализируем реакции если нет
    TELEGRAM_EMOJIS.forEach(({ name }) => {
      if (!reactions[name]) reactions[name] = 0;
    });

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
    await pool.query(
      'UPDATE items SET reactions = $1, user_reactions = $2 WHERE id = $3',
      [JSON.stringify(reactions), JSON.stringify(userReactions), itemId]
    );

    const updatedResult = await pool.query('SELECT * FROM items WHERE id = $1', [itemId]);
    const updatedItem = updatedResult.rows[0];

    io.to(sessionId).emit('reaction:updated', { itemId, reactions, user_reactions: userReactions, userId });
    io.to(sessionId).emit('item:updated', updatedItem);

    res.json(updatedItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Завершить сессию
app.post('/api/sessions/:id/end', async (req, res) => {
  const { summary, actionItems } = req.body;
  const { id } = req.params;

  try {
    await pool.query(
      `UPDATE sessions SET status = $1, summary = $2, action_items = $3, ended_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      ['completed', summary || null, actionItems ? JSON.stringify(actionItems) : null, id]
    );
    io.to(id).emit('session:ended', { summary, actionItems });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить историю сессий
app.get('/api/sessions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, template, admin_name, status, created_at, ended_at
      FROM sessions
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Удалить сессию
app.delete('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM items WHERE session_id = $1', [id]);
    await pool.query('DELETE FROM votes WHERE session_id = $1', [id]);
    await pool.query('DELETE FROM user_moods WHERE session_id = $1', [id]);
    await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== API для мемов ====================

// Получить мемы сессии
app.get('/api/sessions/:id/memes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM custom_memes WHERE session_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Добавить мем
app.post('/api/sessions/:id/memes', async (req, res) => {
  const { name, url, createdBy } = req.body;
  const sessionId = req.params.id;

  try {
    const result = await pool.query(
      `INSERT INTO custom_memes (session_id, name, url, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [sessionId, name, url, createdBy || 'unknown']
    );
    const newMeme = result.rows[0];
    io.to(sessionId).emit('meme:added', newMeme);
    res.json(newMeme);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Удалить мем
app.delete('/api/sessions/:id/memes/:memeId', async (req, res) => {
  const { id: sessionId, memeId } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM custom_memes WHERE id = $1 AND session_id = $2 RETURNING *',
      [memeId, sessionId]
    );
    if (result.rows[0]) {
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
app.post('/api/sessions/:id/vote-limit', async (req, res) => {
  const { voteLimit } = req.body;
  const { id: sessionId } = req.params;

  if (!voteLimit || voteLimit < 1 || voteLimit > 100) {
    return res.status(400).json({ error: 'Invalid vote limit' });
  }

  try {
    await pool.query('UPDATE sessions SET vote_limit = $1 WHERE id = $2', [voteLimit, sessionId]);
    io.to(sessionId).emit('vote-limit:updated', { voteLimit });
    res.json({ success: true, voteLimit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== API для глобальных мемов ====================

// Получить все глобальные мемы
app.get('/api/memes', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM global_memes WHERE is_active = 1 ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Добавить глобальный мем (только админ сессии)
app.post('/api/memes', async (req, res) => {
  const { name, url, createdBy, sessionId } = req.body;

  // Проверяем, является ли пользователь админом сессии
  if (sessionId) {
    const sessionResult = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    const session = sessionResult.rows[0];
    if (!session || !session.admin_name) {
      return res.status(403).json({ error: 'Only session admin can add memes' });
    }
  }

  try {
    const result = await pool.query(
      `INSERT INTO global_memes (name, url, created_by) VALUES ($1, $2, $3) RETURNING *`,
      [name, url, createdBy || 'unknown']
    );
    const newMeme = result.rows[0];
    io.emit('meme:added:global', newMeme);
    res.json(newMeme);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Удалить глобальный мем (только админ)
app.delete('/api/memes/:memeId', async (req, res) => {
  const { memeId } = req.params;

  try {
    const result = await pool.query(
      'UPDATE global_memes SET is_active = 0 WHERE id = $1 RETURNING *',
      [memeId]
    );
    if (result.rows[0]) {
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
app.post('/api/sessions/:id/mood', async (req, res) => {
  const { userId, mood } = req.body;
  const { id: sessionId } = req.params;

  try {
    await pool.query(
      `INSERT INTO user_moods (session_id, user_id, mood)
       VALUES ($1, $2, $3)
       ON CONFLICT(session_id, user_id) DO UPDATE SET mood = $3, updated_at = CURRENT_TIMESTAMP`,
      [sessionId, userId, mood]
    );
    io.to(sessionId).emit('mood:updated', { userId, mood });
    res.json({ success: true, mood });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить счётчики настроения
app.get('/api/sessions/:id/moods', async (req, res) => {
  const { id: sessionId } = req.params;

  try {
    const result = await pool.query(
      `SELECT mood, COUNT(*) as count FROM user_moods WHERE session_id = $1 GROUP BY mood`,
      [sessionId]
    );
    res.json(result.rows);
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
  socket.on('meme:add', async (data) => {
    const { sessionId, name, url, createdBy } = data;
    try {
      const result = await pool.query(
        `INSERT INTO custom_memes (session_id, name, url, created_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [sessionId, name, url, createdBy || 'unknown']
      );
      const newMeme = result.rows[0];
      io.in(sessionId).emit('meme:added', newMeme);
      console.log(`[WS] Meme added to session ${sessionId}: ${name}`);
    } catch (err) {
      console.error('[WS] Error adding meme:', err.message);
    }
  });

  // Мемы - удаление через WebSocket
  socket.on('meme:remove', async (data) => {
    const { sessionId, memeId } = data;
    try {
      const result = await pool.query(
        'DELETE FROM custom_memes WHERE id = $1 AND session_id = $2 RETURNING *',
        [memeId, sessionId]
      );
      if (result.rows[0]) {
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
async function startServer() {
  await initDatabase();
  await loadMemesFromDb();
  
  server.listen(PORT, () => {
    console.log(`🚀 Retro server running on http://localhost:${PORT}`);
  });
}

startServer();
