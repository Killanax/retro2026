// Глобальные переменные
let socket;
let currentSession = null;
let currentUserId = null;
let isAdmin = false;
let userReactions = {}; // { itemId: reactionName } - реакция пользователя на каждой карточке
let participants = new Map();
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let joinSent = false; // Флаг для предотвращения дублирования join

// Лимит голосов
let voteLimit = 5;

// Настроение пользователя
let userMood = null;

// Мемы сессии (синхронизируются через сервер)
let sessionMemes = [];
// Глобальные мемы (с сервера)
let globalMemes = [];
// Пользовательские мемы (локальные, из localStorage)
let customMemes = JSON.parse(localStorage.getItem('customMemes') || '[]');
let memeToDelete = null;
let longPressTimer = null;

// Шаблоны ретроспектив
const TEMPLATES = {
  'classic': {
    name: 'Классический',
    columns: [
      { id: 'start', name: '🚀 Начать делать', category: 'start' },
      { id: 'stop', name: '🛑 Перестать делать', category: 'stop' },
      { id: 'continue', name: '✅ Продолжать делать', category: 'continue' }
    ]
  },
  'mad-sad-glad': {
    name: 'Mad, Sad, Glad',
    columns: [
      { id: 'mad', name: '😡 Злит', category: 'mad' },
      { id: 'sad', name: '😢 Расстраивает', category: 'sad' },
      { id: 'glad', name: '😄 Радует', category: 'glad' }
    ]
  },
  'good-bad-ideas': {
    name: 'Good, Bad, Ideas',
    columns: [
      { id: 'good', name: '👍 Хорошо', category: 'good' },
      { id: 'bad', name: '👎 Плохо', category: 'bad' },
      { id: 'ideas', name: '💡 Идеи', category: 'ideas' }
    ]
  },
  'kiss': {
    name: 'KISS',
    columns: [
      { id: 'keep', name: '📌 Keep (Сохранить)', category: 'keep' },
      { id: 'improve', name: '🔧 Improve (Улучшить)', category: 'improve' },
      { id: 'start', name: '🚀 Start (Начать)', category: 'start' },
      { id: 'stop', name: '🛑 Stop (Прекратить)', category: 'stop' }
    ]
  },
  'sailboat': {
    name: 'Парусник',
    columns: [
      { id: 'wind', name: '💨 Ветер (Что помогает)', category: 'wind' },
      { id: 'anchor', name: '⚓ Якорь (Что мешает)', category: 'anchor' },
      { id: 'rocks', name: '🪨 Скалы (Риски)', category: 'rocks' },
      { id: 'island', name: '🏝️ Остров (Цель)', category: 'island' }
    ]
  },
  'freeform': {
    name: 'Свободный',
    columns: [
      { id: 'general', name: '📝 Общее', category: 'general' }
    ]
  }
};

// Смайлы для реакций
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

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
  initSocket();
  setupEventListeners();
  setupMoodSelector();
  setupCreateTabPassword();
  renderQuickMemesButtons(); // Рендерим базовые мемы (globalMemes ещё пустой)

  // Сначала пробуем восстановить сессию из localStorage
  restoreSession().then(restored => {
    // Если не восстановили, проверяем URL
    if (!restored) {
      checkUrlForSession();
    }
  });
});

// Настройка пароля на вкладку создания
const CREATE_TAB_PASSWORD = 'yurassss';
let createTabUnlocked = false;

function setupCreateTabPassword() {
  // Проверяем, разблокирована ли вкладка в sessionStorage
  const unlocked = sessionStorage.getItem('createTabUnlocked');
  if (unlocked === 'true') {
    unlockCreateTab();
  } else {
    // Если не разблокирована, переключаем на вкладку "Присоединиться"
    const joinTab = document.querySelector('[data-bs-target="#join-tab"]');
    if (joinTab) {
      const tab = new bootstrap.Tab(joinTab);
      tab.show();
    }
  }
  
  // Обработчик нажатия Enter в поле пароля
  const passwordInput = document.getElementById('create-tab-password');
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        checkPassword();
      }
    });
  }
  
  // Блокируем вкладку при переключении на неё, если не разблокирована
  const createTabBtn = document.getElementById('create-tab-btn');
  if (createTabBtn) {
    createTabBtn.addEventListener('click', (e) => {
      if (!createTabUnlocked) {
        // Показываем модальное окно вместо переключения вкладки
        e.preventDefault();
        showPasswordModal();
      }
    });
  }
}

function showPasswordModal() {
  const modal = new bootstrap.Modal(document.getElementById('passwordModal'));
  modal.show();
  
  // Фокус на поле ввода после показа
  document.getElementById('passwordModal').addEventListener('shown.bs.modal', () => {
    document.getElementById('create-tab-password').focus();
  });
}

function checkPassword() {
  const password = document.getElementById('create-tab-password').value;
  
  if (password === CREATE_TAB_PASSWORD) {
    unlockCreateTab();
    sessionStorage.setItem('createTabUnlocked', 'true');
    
    // Закрываем модальное окно
    const modalEl = document.getElementById('passwordModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) {
      modal.hide();
    }
    
    // Очищаем поле пароля
    document.getElementById('create-tab-password').value = '';
    
    // Переключаем на вкладку создания
    const createTab = document.querySelector('[data-bs-target="#create-tab"]');
    if (createTab) {
      const tab = new bootstrap.Tab(createTab);
      tab.show();
    }
    
    showToast('Доступ разрешён', 'success');
  } else {
    showToast('Неверный пароль', 'danger');
    document.getElementById('create-tab-password').value = '';
    document.getElementById('create-tab-password').focus();
  }
}

function unlockCreateTab() {
  const locked = document.getElementById('create-tab-locked');
  const unlocked = document.getElementById('create-tab-unlocked');
  
  if (locked && unlocked) {
    locked.style.display = 'none';
    unlocked.style.display = 'block';
    createTabUnlocked = true;
  }
}

function lockCreateTab() {
  const locked = document.getElementById('create-tab-locked');
  const unlocked = document.getElementById('create-tab-unlocked');
  
  if (locked && unlocked) {
    locked.style.display = 'block';
    unlocked.style.display = 'none';
    createTabUnlocked = false;
    sessionStorage.removeItem('createTabUnlocked');
    
    // Переключаем на вкладку "Присоединиться"
    const joinTab = document.querySelector('[data-bs-target="#join-tab"]');
    if (joinTab) {
      const tab = new bootstrap.Tab(joinTab);
      tab.show();
    }
  }
}

// Проверка URL на наличие ID сессии
function checkUrlForSession() {
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session');

  if (sessionId) {
    document.getElementById('join-session-id').value = sessionId;
    document.getElementById('join-session-id').readOnly = true;
    document.getElementById('join-btn-text').textContent = `Войти в сессию`;
    document.getElementById('join-session-id-container').innerHTML = `
      <label class="form-label">ID сессии</label>
      <input type="text" class="form-control" id="join-session-id" value="${sessionId}" readonly>
      <small class="text-success">✓ Сессия найдена в ссылке</small>
    `;

    // Скрываем вкладку "Создать" при входе по ссылке
    const createTab = document.querySelector('[data-bs-target="#create-tab"]');
    if (createTab) {
      createTab.parentElement.style.display = 'none';
    }

    // Переключаем на вкладку входа
    const joinTab = document.querySelector('[data-bs-target="#join-tab"]');
    if (joinTab) {
      const tab = new bootstrap.Tab(joinTab);
      tab.show();
    }

    // Фокус на поле имени
    setTimeout(() => {
      document.getElementById('join-name').focus();
    }, 500);
  }
}

// Инициализация Socket.IO
function initSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('[WS] Connected to server, socket id:', socket.id);
    // Сбрасываем флаг при переподключении
    joinSent = false;

    if (currentSession) {
      console.log('[WS] sendJoinToSession from connect handler, isAdmin:', isAdmin);
      sendJoinToSession(currentSession.id);
    } else {
      console.log('[WS] No currentSession, skipping join');
    }
  });
  
  socket.on('item:created', (item) => {
    if (item.session_id === currentSession?.id) {
      addItemToColumn(item);
      showToast('Новый элемент добавлен!', 'info');
    }
  });
  
  socket.on('item:updated', (item) => {
    console.log('[WS] item:updated received:', { id: item.id, category: item.category, session_id: item.session_id });
    if (currentSession && item.session_id === currentSession.id) {
      console.log('[UI] Calling updateItemInColumn for item', item.id, 'in column', item.category);
      updateItemInColumn(item);
    } else {
      console.warn('[WS] item:updated skipped - session mismatch', { currentSession: currentSession?.id, itemSession: item.session_id });
    }
  });

  // Обработка обновления реакций от других пользователей
  socket.on('reaction:updated', (data) => {
    if (currentSession && data.itemId) {
      // Парсим user_reactions если это строка
      let itemUserReactions = data.user_reactions;
      if (typeof itemUserReactions === 'string') {
        try {
          itemUserReactions = JSON.parse(itemUserReactions);
        } catch (e) {
          itemUserReactions = {};
        }
      }
      
      // Обновляем глобальную переменную userReactions для текущего пользователя
      if (itemUserReactions[currentUserId]) {
        userReactions[data.itemId] = itemUserReactions[currentUserId];
      } else {
        delete userReactions[data.itemId];
      }
      
      updateItemReactions(data.itemId, data.reactions, itemUserReactions);
    }
  });
  
  socket.on('item:deleted', (data) => {
    console.log('[WS] item:deleted received:', { id: data.id });
    if (currentSession) {
      console.log('[UI] Calling removeItemFromColumn for item', data.id);
      removeItemFromColumn(data.id);
    }
  });
  
  socket.on('session:ended', (data) => {
    showToast('Сессия завершена!', 'success');
    localStorage.removeItem('retroSession');
    setTimeout(() => goHome(), 2000);
  });

  // Мемы - добавление нового мема
  socket.on('meme:added', (meme) => {
    console.log('[WS] meme:added received:', meme);
    if (currentSession && meme.session_id === currentSession.id) {
      sessionMemes.push(meme);
      renderQuickMemesButtons();
      renderCustomMemesList();
      showToast('Новый мем добавлен!', 'info');
      console.log('[WS] Meme added to list, total memes:', sessionMemes.length);
    } else {
      console.warn('[WS] meme:added session mismatch:', { memeSession: meme.session_id, currentSession: currentSession?.id });
    }
  });

  // Мемы - удаление мема
  socket.on('meme:removed', (data) => {
    console.log('[WS] meme:removed received:', data);
    if (currentSession) {
      const index = sessionMemes.findIndex(m => m.id === data.id);
      if (index >= 0) {
        sessionMemes.splice(index, 1);
        renderQuickMemesButtons();
        renderCustomMemesList();
      }
    }
  });

  // Лимит голосов - обновление от сервера
  socket.on('vote-limit:updated', (data) => {
    if (currentSession) {
      voteLimit = data.voteLimit;
      document.getElementById('vote-limit-input').value = voteLimit;
      document.getElementById('vote-limit-value').textContent = voteLimit;
      showToast(`Лимит голосов изменён: ${voteLimit}`, 'info');
    }
  });

  // Глобальные мемы - добавление
  socket.on('meme:added:global', (meme) => {
    globalMemes.push(meme);
    renderQuickMemesButtons();
    renderCustomMemesList();
    showToast('Новый мем добавлен в глобальный список!', 'info');
  });

  // Глобальные мемы - удаление
  socket.on('meme:removed:global', (data) => {
    const index = globalMemes.findIndex(m => m.id === data.id);
    if (index >= 0) {
      globalMemes.splice(index, 1);
      renderQuickMemesButtons();
      renderCustomMemesList();
      showToast('Мем удалён из глобального списка', 'info');
    }
  });

  // Настроение пользователя - обновление
  socket.on('mood:updated', (data) => {
    if (currentSession) {
      loadMoodCounts(); // Перезагружаем счётчики
      updateUserMoodDisplay(data.userId, data.mood);
    }
  });

  // Таймер
  socket.on('timer:update', (data) => {
    timerSeconds = data.seconds;
    timerRunning = data.running;
    updateTimerDisplay();
  });
  
  socket.on('timer:started', (data) => {
    timerSeconds = data.seconds;
    timerRunning = true;
    startTimerInterval();
    updateTimerDisplay();
  });
  
  socket.on('timer:stopped', () => {
    timerRunning = false;
    stopTimerInterval();
  });
  
  socket.on('timer:reset', () => {
    timerSeconds = 0;
    timerRunning = false;
    stopTimerInterval();
    updateTimerDisplay();
  });
  
  // Участники
  socket.on('participant:joined', (data) => {
    participants.set(data.userId, { name: data.name, isAdmin: data.isAdmin });
    updateParticipantsList();
    showToast(`${data.name} присоединился`, 'info');
  });
  
  socket.on('participant:left', (data) => {
    participants.delete(data.userId);
    updateParticipantsList();
  });
  
  socket.on('participants:list', (data) => {
    participants = new Map(data.map(p => [p.userId, { name: p.name, isAdmin: p.isAdmin }]));
    updateParticipantsList();
  });

  socket.on('columns:updated', (data) => {
    console.log('[WS] Columns updated:', data);
    if (currentSession) {
      // Обновляем column_headers в текущей сессии
      const columnHeaders = {};
      data.columns.forEach(col => {
        columnHeaders[col.category] = col.name;
      });
      currentSession.column_headers = JSON.stringify(columnHeaders);
      renderColumns();
    }
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
}

// Отправка join и participant:join с флагом для предотвращения дублирования
function sendJoinToSession(sessionId) {
  if (joinSent) {
    console.log('[WS] Join already sent, skipping');
    return;
  }

  console.log('[WS] Emitting join for session', sessionId, 'isAdmin:', isAdmin);
  socket.emit('join', sessionId);
  console.log('[WS] Emitting participant:join for session', sessionId, 'userId:', currentUserId, 'isAdmin:', isAdmin);
  socket.emit('participant:join', {
    sessionId: sessionId,
    userId: currentUserId,
    name: currentUserId.replace(/^(admin_|user_)/, ''),
    isAdmin
  });
  joinSent = true;
}

// Настройка обработчиков событий
function setupEventListeners() {
  document.getElementById('create-session-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    // Проверяем, разблокирована ли вкладка
    if (!createTabUnlocked) {
      showToast('Введите пароль для доступа к созданию сессии', 'warning');
      showPasswordModal();
      return;
    }
    await createSession();
  });

  document.getElementById('join-session-form').addEventListener('submit', (e) => {
    e.preventDefault();
    joinSession();
  });

  document.getElementById('add-item-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitItem();
  });

  // Переключатели админ панели
  document.getElementById('allow-memes')?.addEventListener('change', (e) => {
    showToast(`Мемы ${e.target.checked ? 'разрешены' : 'запрещены'}`, 'info');
  });

  document.getElementById('allow-emoji')?.addEventListener('change', (e) => {
    showToast(`Смайлы ${e.target.checked ? 'разрешены' : 'запрещены'}`, 'info');
  });

  document.getElementById('voting-enabled')?.addEventListener('change', (e) => {
    showToast(`Голосование ${e.target.checked ? 'включено' : 'выключено'}`, 'info');
  });

  // Закрытие dropdown при клике вне
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.emoji-dropdown')) {
      document.querySelectorAll('.emoji-dropdown-menu').forEach(menu => {
        menu.classList.remove('show');
      });
    }
  });
}

// Настройка селектора настроения
function setupMoodSelector() {
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mood = btn.dataset.mood;
      setMood(mood);
    });
  });
}

// Установка настроения
function setMood(mood) {
  if (!currentSession) return;
  
  // Отправляем на сервер
  fetch(`/api/sessions/${currentSession.id}/mood`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: currentUserId,
      mood
    })
  })
  .then(response => response.json())
  .then(data => {
    userMood = mood;
    // Обновляем UI
    document.querySelectorAll('.mood-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mood === mood);
    });
  })
  .catch(error => {
    console.error('Error setting mood:', error);
  });
}

// Обновление отображения настроения пользователя
function updateUserMoodDisplay(userId, mood) {
  // Обновляем только если это текущий пользователь
  if (userId === currentUserId) {
    document.querySelectorAll('.mood-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mood === mood);
    });
  }
}

// Загрузка счётчиков настроения
function loadMoodCounts() {
  if (!currentSession) return;

  fetch(`/api/sessions/${currentSession.id}/moods`)
    .then(response => response.json())
    .then(moods => {
      // Сбрасываем все счётчики
      ['happy', 'smile', 'neutral', 'tired', 'dead'].forEach(mood => {
        document.getElementById(`mood-count-${mood}`).textContent = '0';
      });

      // Устанавливаем счётчики
      moods.forEach(m => {
        const countEl = document.getElementById(`mood-count-${m.mood}`);
        if (countEl) {
          countEl.textContent = m.count;
        }
      });
    })
    .catch(error => {
      console.error('Error loading moods:', error);
    });

  // Загружаем настроение текущего пользователя
  fetch(`/api/sessions/${currentSession.id}/mood/${currentUserId}`)
    .then(response => response.json())
    .then(data => {
      if (data.mood) {
        userMood = data.mood;
        document.querySelectorAll('.mood-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.mood === data.mood);
        });
      }
    })
    .catch(error => {
      console.error('Error loading user mood:', error);
    });
}

// Восстановление сессии из localStorage
async function restoreSession() {
  const saved = localStorage.getItem('retroSession');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      currentSession = data.session;
      currentUserId = data.userId;
      isAdmin = data.isAdmin;
      console.log('[WS] Restored session from localStorage:', { sessionId: currentSession.id, userId: currentUserId, isAdmin, socketConnected: socket?.connected });

      showSessionPage();
      
      // Ждём подключения WebSocket перед загрузкой данных
      if (!socket?.connected) {
        await new Promise(resolve => {
          const checkConnection = setInterval(() => {
            if (socket?.connected) {
              clearInterval(checkConnection);
              resolve();
            }
          }, 100);
          setTimeout(resolve, 3000);
        });
      }
      
      // Отправляем join если сокет подключён
      if (socket?.connected) {
        sendJoinToSession(currentSession.id);
      }
      
      await loadSessionData();
      
      // Если это админ, скрываем вкладку "Создать"
      if (isAdmin) {
        const createTab = document.querySelector('[data-bs-target="#create-tab"]');
        if (createTab) {
          createTab.parentElement.style.display = 'none';
        }
      }
      
      return true;
    } catch (e) {
      console.error('Error restoring session:', e);
      localStorage.removeItem('retroSession');
    }
  }
  return false;
}

// Сохранение сессии в localStorage
function saveSession() {
  if (currentSession) {
    localStorage.setItem('retroSession', JSON.stringify({
      session: currentSession,
      userId: currentUserId,
      isAdmin
    }));
    // Также сохраняем в URL
    const url = new URL(window.location);
    url.searchParams.set('session', currentSession.id);
    window.history.pushState({}, '', url);
  }
}

// Создание сессии
async function createSession() {
  const name = document.getElementById('session-name').value;
  const adminName = document.getElementById('admin-name').value;
  const template = document.getElementById('session-template').value;

  try {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, template, adminName })
    });

    const data = await response.json();

    if (data.success) {
      currentUserId = 'admin_' + adminName;
      isAdmin = true;

      // Ждём подключения WebSocket перед загрузкой сессии
      if (!socket?.connected) {
        await new Promise(resolve => {
          const checkConnection = setInterval(() => {
            if (socket?.connected) {
              clearInterval(checkConnection);
              resolve();
            }
          }, 100);
          setTimeout(resolve, 5000); // Таймаут 5 секунд
        });
      }
      
      // Дополнительная задержка для стабильности WebSocket
      await new Promise(resolve => setTimeout(resolve, 500));

      await loadSession(data.sessionId);
      
      // Скрываем вкладку "Создать" для админа
      const createTab = document.querySelector('[data-bs-target="#create-tab"]');
      if (createTab) {
        createTab.parentElement.style.display = 'none';
      }
    } else {
      showToast('Ошибка создания сессии', 'danger');
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Ошибка подключения к серверу', 'danger');
  }
}

// Присоединение к сессии
async function joinSession() {
  const sessionId = document.getElementById('join-session-id').value.trim();
  const name = document.getElementById('join-name').value.trim();

  if (!sessionId || !name) {
    showToast('Заполните все поля', 'warning');
    return;
  }

  try {
    const response = await fetch(`/api/sessions/${sessionId}`);

    if (!response.ok) {
      showToast('Сессия не найдена', 'danger');
      return;
    }

    currentSession = await response.json();
    currentUserId = 'user_' + name;
    isAdmin = false;

    sendJoinToSession(sessionId);

    saveSession();
    showSessionPage();
    await loadSessionData(); // Здесь загружаются мемы

  } catch (error) {
    console.error('Error:', error);
    showToast('Ошибка подключения', 'danger');
  }
}

// Загрузка сессии
async function loadSession(sessionId) {
  try {
    const response = await fetch(`/api/sessions/${sessionId}`);
    currentSession = await response.json();

    sendJoinToSession(sessionId);

    saveSession();
    showSessionPage();
    await loadSessionData();

  } catch (error) {
    console.error('Error:', error);
    showToast('Ошибка загрузки сессии', 'danger');
  }
}

// Загрузка данных сессии
async function loadSessionData() {
  if (!currentSession) return;
  
  document.getElementById('session-title').textContent = currentSession.name;
  const templateName = TEMPLATES[currentSession.template]?.name || currentSession.template;
  document.getElementById('session-info').textContent = `${templateName} • ${currentSession.status}`;
  document.getElementById('session-id-display').textContent = currentSession.id;
  document.getElementById('user-display').textContent = currentUserId.replace(/^(admin_|user_)/, '');
  
  // Показываем кнопки только админу
  const isAdm = isAdmin;
  document.getElementById('admin-panel-btn').style.display = isAdm ? 'block' : 'none';
  document.getElementById('end-session-btn').style.display = isAdm ? 'block' : 'none';
  
  // Показываем контроль лимита голосов только админу
  document.getElementById('admin-votes-control').style.display = isAdm ? 'block' : 'none';
  document.getElementById('vote-limit-display').style.display = isAdm ? 'none' : 'block';
  document.getElementById('vote-limit-input').value = voteLimit;
  document.getElementById('vote-limit-value').textContent = voteLimit;

  renderColumns();
  
  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/items`);
    const items = await response.json();

    document.querySelectorAll('.column-items').forEach(col => col.innerHTML = '');
    // Сортируем элементы по порядку внутри каждой категории
    items.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return (a.order || 0) - (b.order || 0);
    });
    items.forEach(item => addItemToColumn(item));
  } catch (error) {
    console.error('Error loading items:', error);
  }

  // Инициализируем userReactions из загруженных элементов
  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/items`);
    const items = await response.json();
    userReactions = {};
    items.forEach(item => {
      let itemUserReactions = item.user_reactions;
      if (typeof itemUserReactions === 'string') {
        try {
          itemUserReactions = JSON.parse(itemUserReactions);
        } catch (e) {
          itemUserReactions = {};
        }
      }
      if (itemUserReactions[currentUserId]) {
        userReactions[item.id] = itemUserReactions[currentUserId];
      }
    });
  } catch (error) {
    console.error('Error initializing userReactions:', error);
  }

  // Загружаем мемы сессии
  try {
    const memesResponse = await fetch(`/api/sessions/${currentSession.id}/memes`);
    const memes = await memesResponse.json();
    sessionMemes = memes;
    console.log('[Meme] Loaded session memes:', sessionMemes);
  } catch (error) {
    console.error('Error loading session memes:', error);
  }

  // Загружаем глобальные мемы
  try {
    const globalMemesResponse = await fetch(`/api/memes`);
    const memes = await globalMemesResponse.json();
    console.log('[Meme] Loaded global memes:', memes);
    globalMemes = memes;
  } catch (error) {
    console.error('Error loading global memes:', error);
  }

  // Рендерим кнопки после загрузки всех мемов
  renderQuickMemesButtons();
  renderCustomMemesList();

  // Загружаем лимит голосов из сессии
  try {
    const sessionResponse = await fetch(`/api/sessions/${currentSession.id}`);
    const sessionData = await sessionResponse.json();
    if (sessionData.vote_limit) {
      voteLimit = sessionData.vote_limit;
      document.getElementById('vote-limit-input').value = voteLimit;
      document.getElementById('vote-limit-value').textContent = voteLimit;
    }
  } catch (error) {
    console.error('Error loading vote limit:', error);
  }

  // Загружаем настроения
  loadMoodCounts();
  
  // Восстанавливаем подсветку настроения пользователя
  if (userMood) {
    document.querySelectorAll('.mood-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mood === userMood);
    });
  }

  socket.emit('participant:list', currentSession.id);
}

// Рендер колонок
function renderColumns() {
  const container = document.getElementById('columns-container');
  const template = TEMPLATES[currentSession.template] || TEMPLATES['freeform'];

  container.className = `col template-${currentSession.template}`;

  // Получаем кастомные заголовки из сессии
  const columnHeaders = currentSession.column_headers ? JSON.parse(currentSession.column_headers) : {};

  container.innerHTML = template.columns.map((col, index) => {
    // Используем кастомный заголовок или заголовок по умолчанию
    const columnHeader = columnHeaders[col.category] || col.name;

    // Обработчики drag-n-drop только для админа
    const dragAttrs = isAdmin ? `
      ondragover="handleColumnDragOver(event, '${col.category}')"
      ondragleave="handleColumnDragLeave(event)"
      ondrop="handleDrop(event, '${col.category}')"` : 'draggable="false"';

    const columnItemsDragAttrs = isAdmin ? `
      ondragover="handleColumnDragOver(event, '${col.category}')"
      ondragleave="handleColumnDragLeave(event)"
      ondrop="handleDrop(event, '${col.category}')"` : '';

    const buttonDragAttrs = isAdmin ? `
      ondragover="handleButtonDragOver(event)"
      ondragleave="handleButtonDragLeave(event)"
      ondrop="handleDropOnButton(event, '${col.category}')"` : '';

    // Кнопка редактирования только для админа
    const editButton = isAdmin ? `
      <button class="btn-edit-column" onclick="openEditColumnModal('${col.category}', '${columnHeader.replace(/'/g, "\\'")}')">
        <span class="material-icons">edit</span>
      </button>` : '';

    return `
      <div class="retro-column column-${index + 1}" data-category="${col.category}" ${dragAttrs}>
        <div class="column-header">
          <h5 class="column-title">
            <span class="material-icons">label</span>
            ${columnHeader}
            ${editButton}
          </h5>
          <span class="column-badge" id="badge-${col.category}">0</span>
        </div>
        <div class="column-items" id="column-${col.category}" data-category="${col.category}" ${columnItemsDragAttrs}>
        </div>
        <button class="add-item-btn mt-3"
                data-category="${col.category}"
                onclick="openAddItemModal('${col.category}')" ${buttonDragAttrs}>
          <span class="material-icons">add</span>
          Добавить элемент
        </button>
      </div>
    `;
  }).join('');
}

// Открытие модального окна добавления
function openAddItemModal(category) {
  document.getElementById('item-category').value = category;
  document.getElementById('item-text').value = '';
  document.getElementById('item-meme-url').value = '';
  document.getElementById('item-emoji').value = '';
  document.getElementById('emoji-preview').style.display = 'none';
  
  document.querySelectorAll('.emoji-btn').forEach(btn => btn.classList.remove('selected'));
  document.querySelectorAll('.meme-preview').forEach(img => img.classList.remove('selected'));
  
  document.querySelectorAll('#addItemModal .nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('#addItemModal .tab-pane').forEach(p => {
    p.classList.remove('show', 'active');
  });
  
  const firstTab = document.querySelector('[data-bs-target="#tab-text"]');
  if (firstTab) {
    firstTab.classList.add('active');
    document.getElementById('tab-text').classList.add('show', 'active');
  }
  
  const modal = new bootstrap.Modal(document.getElementById('addItemModal'));
  modal.show();
}

// Открытие модального окна редактирования заголовка колонки
function openEditColumnModal(category, currentTitle) {
  document.getElementById('edit-column-category').value = category;
  document.getElementById('edit-column-title').value = currentTitle;
  
  const modal = new bootstrap.Modal(document.getElementById('editColumnModal'));
  modal.show();
}

// Сохранение отредактированного заголовка
async function saveColumnTitle() {
  const category = document.getElementById('edit-column-category').value;
  const newTitle = document.getElementById('edit-column-title').value.trim();
  
  if (!newTitle) {
    alert('Заголовок не может быть пустым');
    return;
  }
  
  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/columns`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columns: [{ category, name: newTitle }]
      })
    });
    
    if (response.ok) {
      const modal = bootstrap.Modal.getInstance(document.getElementById('editColumnModal'));
      modal.hide();
    } else {
      const error = await response.json();
      alert('Ошибка: ' + error.error);
    }
  } catch (err) {
    alert('Ошибка при сохранении: ' + err.message);
  }
}

// Вставка смайла в текст
function insertEmoji(emoji) {
  const textarea = document.getElementById('item-text');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const before = text.substring(0, start);
  const after = text.substring(end);
  textarea.value = before + emoji + after;
  textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
  textarea.focus();
}

// Вставка мема в текст
function insertMeme(url, name) {
  const textarea = document.getElementById('item-text');
  const memeText = `![${name}](${url})`;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const before = text.substring(0, start);
  const after = text.substring(end);
  textarea.value = before + memeText + after;
  textarea.selectionStart = textarea.selectionEnd = start + memeText.length;
  textarea.focus();
  
  document.querySelectorAll('.meme-preview').forEach(img => {
    img.classList.toggle('selected', img.src === url);
  });
}

// Выбор мема
function selectMeme(url) {
  document.getElementById('item-meme-url').value = url;
  showToast('Мем выбран!', 'success');
}

// Открытие модального окна добавления мема
function openAddMemeModal() {
  document.getElementById('meme-name').value = '';
  document.getElementById('meme-url').value = '';
  renderCustomMemesList();
  const modal = new bootstrap.Modal(document.getElementById('addMemeModal'));
  modal.show();
}

// Рендер списка пользовательских мемов
function renderCustomMemesList() {
  const container = document.getElementById('custom-memes-list');
  if (!container) return;

  // Глобальные мемы (с пометкой)
  const globalMemesHtml = globalMemes.map((meme, index) => `
    <button type="button" class="btn btn-outline-primary btn-sm position-relative meme-btn"
            data-meme-index="${index}"
            data-meme-type="global"
            title="${escapeHtml(meme.name)} (глобальный)">
      ${escapeHtml(meme.name)} 🌍
    </button>
  `).join('');

  // Мемы сессии
  const sessionMemesHtml = sessionMemes.map((meme, index) => `
    <button type="button" class="btn btn-outline-info btn-sm position-relative meme-btn"
            data-meme-index="${index}"
            data-meme-type="session"
            title="${escapeHtml(meme.name)} (сессия)">
      ${escapeHtml(meme.name)} 📡
    </button>
  `).join('');

  // Локальные мемы
  const customMemesHtml = customMemes.map((meme, index) => `
    <button type="button" class="btn btn-outline-secondary btn-sm position-relative meme-btn"
            data-meme-index="${index}"
            data-meme-type="custom"
            title="${escapeHtml(meme.name)} (локальный)">
      ${escapeHtml(meme.name)}
    </button>
  `).join('');

  if (globalMemes.length === 0 && sessionMemes.length === 0 && customMemes.length === 0) {
    container.innerHTML = '<span class="text-muted">Нет сохранённых мемов</span>';
    return;
  }

  container.innerHTML = globalMemesHtml + sessionMemesHtml + customMemesHtml;

  // Добавляем обработчики долгого нажатия
  container.querySelectorAll('.meme-btn').forEach(btn => {
    const index = parseInt(btn.dataset.memeIndex, 10);
    const type = btn.dataset.memeType;
    
    // Удалять можно только глобальные мемы и только админу
    const canDelete = type === 'global' && isAdmin;

    // Desktop - контекстное меню (правый клик)
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (canDelete) {
        confirmDeleteGlobalMeme(index);
      } else if (isAdmin) {
        showToast('Этот мем нельзя удалить', 'info');
      }
    });

    // Mobile - долгое нажатие
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (canDelete) {
        longPressTimer = setTimeout(() => {
          confirmDeleteGlobalMeme(index);
        }, 800);
      }
    });

    btn.addEventListener('touchend', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });

    btn.addEventListener('touchcancel', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });

    // Desktop - mousedown/mouseup
    btn.addEventListener('mousedown', (e) => {
      if (e.button === 0 && canDelete) {
        longPressTimer = setTimeout(() => {
          confirmDeleteGlobalMeme(index);
        }, 800);
      }
    });

    btn.addEventListener('mouseup', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });

    btn.addEventListener('mouseleave', () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });
  });
}

// Подтверждение удаления мема
function confirmDeleteMeme(index, isSessionMeme = false) {
  memeToDelete = { index, isSessionMeme };
  const modal = new bootstrap.Modal(document.getElementById('deleteMemeConfirmModal'));
  modal.show();

  // Устанавливаем обработчик кнопки удаления
  const confirmBtn = document.getElementById('confirm-delete-meme-btn');
  confirmBtn.onclick = () => {
    if (isSessionMeme) {
      deleteSessionMeme(index);
    } else {
      deleteCustomMeme(index);
    }
    modal.hide();
  };
}

// Добавление мема через WebSocket (сохраняется глобально на сервере)
function addCustomMeme() {
  const name = document.getElementById('meme-name').value.trim();
  const url = document.getElementById('meme-url').value.trim();

  if (!name || !url) {
    showToast('Введите название и URL мема', 'warning');
    return;
  }

  // Отправляем мем на сервер через API
  fetch(`/api/memes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      url,
      createdBy: currentUserId,
      sessionId: currentSession?.id
    })
  })
  .then(response => response.json())
  .then(meme => {
    console.log('[Meme] Added meme:', meme);
    // НЕ добавляем локально - придёт через WebSocket meme:added:global
    showToast('Мем добавлен в глобальный список!', 'success');
  })
  .catch(error => {
    console.error('Error adding meme:', error);
    showToast('Ошибка добавления мема', 'danger');
  });

  document.getElementById('meme-name').value = '';
  document.getElementById('meme-url').value = '';
}

// Подтверждение удаления глобального мема
function confirmDeleteGlobalMeme(index) {
  const meme = globalMemes[index];
  if (!meme) return;

  const modal = new bootstrap.Modal(document.getElementById('deleteMemeConfirmModal'));
  modal.show();

  const confirmBtn = document.getElementById('confirm-delete-meme-btn');
  confirmBtn.onclick = () => {
    deleteGlobalMeme(index);
    modal.hide();
  };
}

// Удаление глобального мема (только админ)
function deleteGlobalMeme(index) {
  const meme = globalMemes[index];
  if (!meme) return;

  fetch(`/api/memes/${meme.id}`, {
    method: 'DELETE'
  })
  .then(response => {
    if (response.ok) {
      globalMemes.splice(index, 1);
      renderQuickMemesButtons();
      renderCustomMemesList();
      showToast('Мем удалён из глобального списка', 'success');
    } else {
      showToast('Ошибка удаления мема', 'danger');
    }
  })
  .catch(error => {
    console.error('Error deleting meme:', error);
    showToast('Ошибка удаления мема', 'danger');
  });
}

// Рендер кнопок быстрых мемов
function renderQuickMemesButtons() {
  const container = document.getElementById('quick-memes-container');
  if (!container) return;

  // Базовый мем + глобальные мемы + мемы сессии + локальные мемы
  const defaultMeme = { name: 'Meme', url: 'https://lh5.googleusercontent.com/avS6QMu-9IxfATwVoY96o2GHhDWX1Y_VmSV1YU7XgZ-RyOWaRXNoVvdy4mL65ngnY93chePJ5fGciB33wevXxfhnwhtvveg9TxYL54Vs7NTAOoOiBT1v69kZgMjjEvnXusZjqKCh' };
  const allMemes = [defaultMeme, ...globalMemes, ...sessionMemes, ...customMemes];

  container.innerHTML = allMemes.map(meme => `
    <button type="button" class="btn btn-outline-secondary btn-sm" onclick="selectMeme('${meme.url}')">
      ${escapeHtml(meme.name)}
    </button>
  `).join('');

  // Рендер миниатюр на вкладке Текст
  renderTextTabMemes(allMemes);
}

// Рендер миниатюр мемов на вкладке Текст
function renderTextTabMemes(allMemes) {
  const container = document.getElementById('text-tab-memes-container');
  if (!container) return;

  container.innerHTML = allMemes.map(meme => `
    <img src="${meme.url}" class="meme-preview" onclick="insertMeme('${meme.url}', '${escapeHtml(meme.name)}')" title="${escapeHtml(meme.name)}">
  `).join('');
}

// Выбор смайла
function selectEmoji(emoji) {
  document.getElementById('item-emoji').value = emoji;
  document.querySelectorAll('.emoji-btn').forEach(btn => btn.classList.remove('selected'));
  event.target.classList.add('selected');
  document.getElementById('emoji-preview-text').textContent = emoji;
  document.getElementById('emoji-preview').style.display = 'block';
}

// Отправка элемента
async function submitItem() {
  const category = document.getElementById('item-category').value;
  const text = document.getElementById('item-text').value.trim();
  const memeUrl = document.getElementById('item-meme-url').value.trim();
  const emoji = document.getElementById('item-emoji').value;

  let type = 'text';
  let content = text;

  if (memeUrl) {
    type = 'meme';
    content = memeUrl;
  } else if (emoji && !text) {
    type = 'emoji';
    content = emoji;
  } else if (!text) {
    showToast('Введите текст идеи или выберите смайл/мем', 'warning');
    return;
  }

  // Вычисляем порядок - количество элементов в категории + 1
  const column = document.getElementById(`column-${category}`);
  const existingItems = column ? column.querySelectorAll('.retro-item').length : 0;
  const order = existingItems;

  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: content,
        category,
        author: currentUserId.replace(/^(admin_|user_)/, ''),
        type,
        meme_url: type === 'meme' ? memeUrl : null,
        emoji: type === 'emoji' ? emoji : null,
        order
      })
    });

    const item = await response.json();

    const modal = bootstrap.Modal.getInstance(document.getElementById('addItemModal'));
    if (modal) modal.hide();

    showToast('Элемент добавлен!', 'success');

  } catch (error) {
    console.error('Error:', error);
    showToast('Ошибка добавления элемента', 'danger');
  }
}

// Добавление элемента в колонку
function addItemToColumn(item) {
  const column = document.getElementById(`column-${item.category}`);
  if (!column) {
    console.error('[UI] Column not found:', item.category);
    return;
  }

  console.log('[UI] Adding item to column:', { id: item.id, category: item.category, text: item.text?.substring(0, 50) });
  
  updateColumnCount(item.category);

  const itemHtml = createItemHtml(item);
  column.insertAdjacentHTML('beforeend', itemHtml);

  const newElement = document.getElementById(`item-${item.id}`);
  if (newElement) {
    initDraggable(newElement);
    console.log('[UI] Item added and draggable initialized:', item.id);
  } else {
    console.error('[UI] Failed to find added element:', item.id);
  }
}

// Создание HTML элемента
function createItemHtml(item) {
  const author = item.author || 'Аноним';
  
  // Безопасный парсинг reactions
  let reactions = {};
  try {
    reactions = item.reactions ? (typeof item.reactions === 'string' ? JSON.parse(item.reactions) : item.reactions) : {};
  } catch (e) {
    console.warn('[UI] Failed to parse reactions for item:', item.id, e);
  }
  
  let userReactionsData = {};
  try {
    userReactionsData = item.user_reactions ? (typeof item.user_reactions === 'string' ? JSON.parse(item.user_reactions) : item.user_reactions) : {};
  } catch (e) {
    console.warn('[UI] Failed to parse user_reactions for item:', item.id, e);
  }

  let content = '';
  if (item.type === 'meme') {
    content = `<img src="${item.text}" alt="Meme" class="retro-item-meme" onerror="this.src='https://via.placeholder.com/300x200?text=Image+not+found'">`;
  } else if (item.type === 'emoji') {
    content = `<div class="retro-item-emoji">${item.text}</div>`;
  } else {
    // Преобразуем \n в <br> для отображения переносов строк
    const textWithBreaks = escapeHtml(item.text)
      .replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" class="retro-item-meme">')
      .replace(/\n/g, '<br>');
    content = `<p class="retro-item-text">${textWithBreaks}</p>`;
  }
  
  // Фильтруем только те реакции, которые имеют count > 0
  const activeReactions = TELEGRAM_EMOJIS.filter(({ name }) => (reactions[name] || 0) > 0);
  
  // Проверяем, есть ли у текущего пользователя реакция
  const userReaction = userReactionsData[currentUserId];
  
  let reactionsHtml = '<div class="reactions-container">';
  
  // Показываем выбранные смайлы
  activeReactions.forEach(({ emoji, name }) => {
    const count = reactions[name] || 0;
    const isUserReaction = userReaction === name;
    reactionsHtml += `
      <button class="reaction-btn ${name} ${isUserReaction ? 'active' : ''}" 
              onclick="toggleReaction('${item.id}', '${emoji}', '${name}')">
        <span>${emoji}</span>
        <span class="reaction-count">${count}</span>
      </button>
    `;
  });
  
  // Dropdown для добавления реакции
  reactionsHtml += `
    <div class="emoji-dropdown">
      <button class="emoji-dropdown-btn" onclick="toggleEmojiDropdown(event, '${item.id}')">
        <span class="material-icons" style="font-size: 18px;">emoji_emotions</span>
      </button>
      <div class="emoji-dropdown-menu" id="emoji-menu-${item.id}">
        <div class="emoji-grid">
          ${TELEGRAM_EMOJIS.map(({ emoji, name }) => `
            <span class="emoji-btn" onclick="setReaction('${item.id}', '${emoji}', '${name}')">${emoji}</span>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  
  reactionsHtml += '</div>';
  
  return `
    <div class="retro-item status-${item.status}" id="item-${item.id}" data-id="${item.id}" data-order="${item.order || 0}" draggable="true">
      <div class="retro-item-header">
        <span class="retro-item-author">
          <span class="material-icons" style="font-size: 14px;">person</span>
          ${escapeHtml(author)}
        </span>
        <small class="text-muted">${new Date(item.created_at).toLocaleString()}</small>
      </div>
      ${content}
      <div class="retro-item-footer">
        ${reactionsHtml}
        <div class="item-actions">
          ${isAdmin ? `<button class="item-action-btn delete" onclick="deleteItem('${item.id}')" title="Удалить">
            <span class="material-icons" style="font-size: 16px;">delete</span>
          </button>` : ''}
        </div>
      </div>
    </div>
  `;
}

// Переключение dropdown смайлов
function toggleEmojiDropdown(event, itemId) {
  event.stopPropagation();
  
  // Закрываем все остальные dropdown
  document.querySelectorAll('.emoji-dropdown-menu').forEach(menu => {
    if (menu.id !== `emoji-menu-${itemId}`) {
      menu.classList.remove('show');
    }
  });
  
  const menu = document.getElementById(`emoji-menu-${itemId}`);
  if (menu) {
    menu.classList.toggle('show');
  }
}

// Установка реакции (только одна на пользователя)
async function setReaction(itemId, emoji, reactionName) {
  if (!currentSession) return;

  // Проверяем, есть ли уже реакция у пользователя на этой карточке
  const currentReaction = userReactions[itemId];
  const isSameReaction = currentReaction === reactionName;

  // Проверяем лимит голосов (для не-админов) - только если ставим новую реакцию
  if (!isAdmin && !isSameReaction) {
    // Считаем количество УНИКАЛЬНЫХ карточек, где пользователь поставил реакцию
    const userReactionItems = Object.keys(userReactions);
    const hasReactionOnThisItem = currentReaction;

    // Если на этой карточке ещё нет реакции и лимит исчерпан — блокируем
    if (!hasReactionOnThisItem && userReactionItems.length >= voteLimit) {
      showToast(`Максимум ${voteLimit} голосов!`, 'warning');
      return;
    }
  }

  // Закрываем dropdown
  const menu = document.getElementById(`emoji-menu-${itemId}`);
  if (menu) menu.classList.remove('show');

  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/items/${itemId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        emoji,
        reactionName,
        remove: isSameReaction // Если та же реакция - удаляем
      })
    });

    // Обновляем локально сразу (для отзывчивости)
    if (isSameReaction) {
      delete userReactions[itemId];
    } else {
      userReactions[itemId] = reactionName;
    }

    // НЕ ждём reaction:updated/item:updated от сервера
  } catch (error) {
    console.error('Error setting reaction:', error);
  }
}

// Обновление лимита голосов (админ)
function updateVoteLimit(value) {
  const limit = parseInt(value, 10);
  if (limit < 1 || limit > 100) {
    showToast('Лимит от 1 до 100', 'warning');
    return;
  }
  
  voteLimit = limit;
  document.getElementById('vote-limit-input').value = limit;
  document.getElementById('vote-limit-value').textContent = limit;
  
  // Отправляем на сервер
  fetch(`/api/sessions/${currentSession.id}/vote-limit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voteLimit: limit })
  }).catch(err => console.error('Error updating vote limit:', err));
  
  showToast(`Лимит голосов: ${limit}`, 'success');
}

// ==================== DRAG-N-DROP ====================
let draggedItem = null;
let draggedItemId = null;
let dragOverItem = null;
let dragOverTimer = null;
let groupThreshold = 1000; // 1 секунда для группировки
let groupingPreviewTimer = null;
let shouldGroupItems = false;

// Инициализация drag-n-drop (только для админа)
function initDraggable(element) {
  if (!isAdmin) return;

  element.setAttribute('draggable', 'true');
  element.addEventListener('dragstart', handleDragStart);
  element.addEventListener('dragend', handleDragEnd);
  element.addEventListener('dragover', handleItemDragOver);
  element.addEventListener('dragleave', handleItemDragLeave);
  element.addEventListener('drop', handleItemDrop);
}

function handleDragStart(e) {
  draggedItem = this;
  draggedItemId = this.dataset.id;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', draggedItemId);

  setTimeout(() => {
    this.style.opacity = '0.4';
  }, 0);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  this.style.opacity = '1';
  document.querySelectorAll('.retro-column, .column-items, .add-item-btn').forEach(el => {
    el.classList.remove('drag-over');
  });
  document.querySelectorAll('.retro-item').forEach(item => {
    item.classList.remove('drag-over-item');
  });

  if (dragOverTimer) {
    clearTimeout(dragOverTimer);
    dragOverTimer = null;
  }
  if (groupingPreviewTimer) {
    clearTimeout(groupingPreviewTimer);
    groupingPreviewTimer = null;
  }

  draggedItem = null;
  draggedItemId = null;
  dragOverItem = null;
  shouldGroupItems = false;
}

// Обработчики для карточек
function handleItemDragOver(e) {
  e.preventDefault();
  e.stopPropagation();

  if (this === draggedItem) return;

  dragOverItem = this;
  this.classList.add('drag-over-item');

  // Запускаем таймер для группировки (1 секунда)
  if (!dragOverTimer) {
    dragOverTimer = setTimeout(() => {
      if (dragOverItem === this) {
        showGroupingPreview(this);
      }
    }, groupThreshold);
  }
}

function handleItemDragLeave(e) {
  e.stopPropagation();
  this.classList.remove('drag-over-item');
  
  if (dragOverTimer) {
    clearTimeout(dragOverTimer);
    dragOverTimer = null;
  }
  if (groupingPreviewTimer) {
    clearTimeout(groupingPreviewTimer);
    groupingPreviewTimer = null;
    this.style.boxShadow = '';
  }
}

function showGroupingPreview(targetItem) {
  targetItem.style.boxShadow = '0 0 0 3px #6366f1';
  shouldGroupItems = true;
  showToast('Отпустите для объединения карточек', 'info');
}

function handleItemDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('drag-over-item');

  if (dragOverTimer) {
    clearTimeout(dragOverTimer);
    dragOverTimer = null;
  }
  if (groupingPreviewTimer) {
    clearTimeout(groupingPreviewTimer);
    groupingPreviewTimer = null;
    this.style.boxShadow = '';
  }

  if (!draggedItemId || this.dataset.id === draggedItemId) return;

  const targetElement = this;
  const sourceElement = draggedItem;

  const sourceColumn = sourceElement.closest('.column-items');
  const targetColumn = targetElement.closest('.column-items');
  const sourceCategory = sourceColumn?.dataset.category;
  const targetCategory = targetColumn?.dataset.category;

  // Группировка (удержание 1 секунду)
  if (shouldGroupItems) {
    shouldGroupItems = false;
    mergeItems(sourceElement, targetElement);
    return;
  }

  // Разные колонки - перемещение
  if (sourceCategory !== targetCategory) {
    moveItemToCategory(draggedItemId, targetCategory);
    return;
  }

  // Одинаковая колонка - меняем местами
  swapItems(sourceElement, targetElement);
  showToast('Элементы обменены местами', 'success');
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ DRAG-N-DROP ====================

// Обработчики для колонки
function handleColumnDragOver(e, category) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
}

function handleColumnDragLeave(e) {
  e.stopPropagation();
  this.classList.remove('drag-over');
}

// Обработчики для кнопки "Добавить элемент"
function handleButtonDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
}

function handleButtonDragLeave(e) {
  e.stopPropagation();
  this.classList.remove('drag-over');
}

function handleDropOnButton(e, category) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('drag-over');

  if (!draggedItemId || !category) return;

  const oldColumn = draggedItem?.closest('.column-items');
  const oldCategory = oldColumn?.dataset.category;

  if (oldCategory === category) return;

  moveItemToCategory(draggedItemId, category);
}

function handleDrop(e, category) {
  e.preventDefault();
  e.stopPropagation();
  this.classList.remove('drag-over');

  if (!draggedItemId || !category) return;

  const oldColumn = draggedItem?.closest('.column-items');
  const oldCategory = oldColumn?.dataset.category;

  if (oldCategory === category) return;

  moveItemToCategory(draggedItemId, category);
}

// Перемещение карточки в другую категорию
function moveItemToCategory(itemId, category) {
  console.log('[Drag] Moving item', itemId, 'to category', category);

  fetch(`/api/sessions/${currentSession.id}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category })
  })
  .then(response => response.json())
  .then(item => {
    console.log('[Drag] Item moved successfully:', item.id, 'new category:', item.category);
    // Обновляем UI немедленно - перемещаем элемент в новую колонку
    updateItemInColumn(item);
    showToast('Элемент перемещён', 'success');
  })
  .catch(error => {
    console.error('[Drag] Move failed:', error);
    showToast('Ошибка перемещения', 'danger');
  });
}

// Обмен местами двух карточек в одной колонке
async function swapItems(sourceElement, targetElement) {
  const sourceId = sourceElement.dataset.id;
  const targetId = targetElement.dataset.id;

  console.log('[Swap] Swapping', sourceId, 'and', targetId);

  try {
    // Получаем текущие данные элементов
    const [sourceRes, targetRes] = await Promise.all([
      fetch(`/api/sessions/${currentSession.id}/items/${sourceId}`),
      fetch(`/api/sessions/${currentSession.id}/items/${targetId}`)
    ]);

    if (!sourceRes.ok || !targetRes.ok) {
      throw new Error('Failed to fetch items');
    }

    const sourceItem = await sourceRes.json();
    const targetItem = await targetRes.json();

    // Меняем порядок местами
    await Promise.all([
      fetch(`/api/sessions/${currentSession.id}/items/${sourceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: targetItem.order })
      }),
      fetch(`/api/sessions/${currentSession.id}/items/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: sourceItem.order })
      })
    ]);

    // Визуально меняем местами в DOM
    const tempDiv = document.createElement('div');
    targetElement.parentNode.insertBefore(tempDiv, targetElement);
    sourceElement.parentNode.insertBefore(targetElement, sourceElement);
    tempDiv.parentNode.insertBefore(sourceElement, tempDiv);
    tempDiv.parentNode.removeChild(tempDiv);

    showToast('Элементы обменены местами', 'success');
  } catch (error) {
    console.error('[Swap] Error:', error);
    showToast('Ошибка обмена местами', 'danger');
  }
}

// Объединение двух карточек
async function mergeItems(sourceElement, targetElement) {
  const sourceId = sourceElement.dataset.id;
  const targetId = targetElement.dataset.id;

  console.log('[Group] Merging', sourceId, 'into', targetId);

  try {
    const [sourceRes, targetRes] = await Promise.all([
      fetch(`/api/sessions/${currentSession.id}/items/${sourceId}`),
      fetch(`/api/sessions/${currentSession.id}/items/${targetId}`)
    ]);

    if (!sourceRes.ok || !targetRes.ok) {
      throw new Error('Failed to fetch items');
    }

    const sourceItem = await sourceRes.json();
    const targetItem = await targetRes.json();

    // Объединяем содержимое: текст source добавляется в конец target с нового абзаца
    let mergedText = targetItem.text || '';

    if (sourceItem.text && sourceItem.text !== targetItem.text) {
      if (mergedText) {
        // Добавляем визуальный разделитель и новый абзац
        mergedText = mergedText + '\n\n─────────────\n\n' + sourceItem.text;
      } else {
        mergedText = sourceItem.text;
      }
    }

    const updateData = { text: mergedText };

    if (sourceItem.type === 'meme' && !targetItem.meme_url) {
      updateData.meme_url = sourceItem.meme_url;
    }

    // Сначала обновляем целевую карточку
    await fetch(`/api/sessions/${currentSession.id}/items/${targetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    });

    // Затем удаляем исходную карточку
    await fetch(`/api/sessions/${currentSession.id}/items/${sourceId}`, {
      method: 'DELETE'
    });

    showToast('Карточки объединены!', 'success');
  } catch (error) {
    console.error('Error merging items:', error);
    showToast('Ошибка объединения', 'danger');
  }
}

// Переключение реакции (старая функция для совместимости)
async function toggleReaction(itemId, emoji, reactionName) {
  if (!currentSession) return;

  // Проверяем, есть ли уже реакция у пользователя на этой карточке
  const currentReaction = userReactions[itemId];
  const isSameReaction = currentReaction === reactionName;

  // Проверяем лимит голосов (для не-админов) - только если ставим новую реакцию
  if (!isAdmin && !isSameReaction) {
    const userReactionItems = Object.keys(userReactions);
    const hasReactionOnThisItem = currentReaction;

    if (!hasReactionOnThisItem && userReactionItems.length >= voteLimit) {
      showToast(`Максимум ${voteLimit} голосов!`, 'warning');
      return;
    }
  }

  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/items/${itemId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUserId,
        emoji,
        reactionName,
        remove: isSameReaction // Если та же реакция - удаляем
      })
    });

    // Обновляем локально сразу (для отзывчивости)
    if (isSameReaction) {
      delete userReactions[itemId];
    } else {
      userReactions[itemId] = reactionName;
    }
  } catch (error) {
    console.error('Error toggling reaction:', error);
  }
}

// Обновление элемента
function updateItemInColumn(item) {
  const element = document.getElementById(`item-${item.id}`);
  console.log('[UI] updateItemInColumn:', { id: item.id, category: item.category, elementExists: !!element, order: item.order });

  // Если элемента нет в DOM - создаём его в правильной колонке
  if (!element) {
    const column = document.getElementById(`column-${item.category}`);
    if (column) {
      const newHtml = createItemHtml(item);
      column.insertAdjacentHTML('beforeend', newHtml);
      const newElement = document.getElementById(`item-${item.id}`);
      if (newElement) {
        initDraggable(newElement);
        sortColumnByOrder(item.category);
        console.log('[UI] Created new element in column', item.category);
      }
      updateColumnCount(item.category);
    } else {
      console.warn('[UI] Column not found for item', item.id, 'category', item.category);
    }
    return;
  }

  // Проверяем, изменилась ли категория
  const currentColumn = element.closest('.column-items');
  const currentCategory = currentColumn?.dataset.category;
  console.log('[UI] Element exists, currentCategory:', currentCategory, 'new category:', item.category);

  if (currentCategory !== item.category) {
    // Перемещаем в другую колонку
    const newColumn = document.getElementById(`column-${item.category}`);
    if (newColumn) {
      // Сначала обновляем счётчики
      updateColumnCount(currentCategory);
      // Перемещаем элемент в новую колонку
      newColumn.appendChild(element);
      // Обновляем содержимое элемента
      const newHtml = createItemHtml(item);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newHtml;
      const newElement = tempDiv.firstElementChild;
      element.replaceWith(newElement);
      initDraggable(newElement);
      // Сортируем колонку по порядку
      sortColumnByOrder(item.category);
      // Обновляем счётчик новой колонки
      updateColumnCount(item.category);
      console.log('[UI] Moved element from', currentCategory, 'to', item.category);
    } else {
      console.warn('[UI] New column not found for category', item.category);
    }
  } else {
    // Та же колонка - обновляем содержимое и сортируем
    const newHtml = createItemHtml(item);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = newHtml;
    const newElement = tempDiv.firstElementChild;

    element.replaceWith(newElement);
    initDraggable(newElement);
    // Сортируем колонку по порядку
    sortColumnByOrder(item.category);
    console.log('[UI] Updated element in same column', item.category);
  }
}

// Обновление только реакций в элементе (без полной перерисовки)
function updateItemReactions(itemId, reactions, userReactions) {
  const element = document.getElementById(`item-${itemId}`);
  if (!element) return;

  // Парсим reactions если это строка
  if (typeof reactions === 'string') {
    try {
      reactions = JSON.parse(reactions);
    } catch (e) {
      reactions = {};
    }
  }

  // Парсим user_reactions если это строка
  if (typeof userReactions === 'string') {
    try {
      userReactions = JSON.parse(userReactions);
    } catch (e) {
      userReactions = {};
    }
  }

  // Находим контейнер реакций
  const reactionsContainer = element.querySelector('.reactions-container');
  if (!reactionsContainer) return;

  // Фильтруем активные реакции (count > 0)
  const activeReactions = TELEGRAM_EMOJIS.filter(({ name }) => (reactions[name] || 0) > 0);
  const currentUserIdForCheck = currentUserId;

  // Генерируем новый HTML для реакций
  let reactionsHtml = '<div class="reactions-container">';

  // Показываем выбранные смайлы
  activeReactions.forEach(({ emoji, name }) => {
    const count = reactions[name] || 0;
    const isUserReaction = userReactions[currentUserIdForCheck] === name;
    reactionsHtml += `
      <button class="reaction-btn ${name} ${isUserReaction ? 'active' : ''}"
              onclick="toggleReaction('${itemId}', '${emoji}', '${name}')">
        <span>${emoji}</span>
        <span class="reaction-count">${count}</span>
      </button>
    `;
  });

  // Dropdown для добавления реакции
  reactionsHtml += `
    <div class="emoji-dropdown">
      <button class="emoji-dropdown-btn" onclick="toggleEmojiDropdown(event, '${itemId}')">
        <span class="material-icons" style="font-size: 18px;">emoji_emotions</span>
      </button>
      <div class="emoji-dropdown-menu" id="emoji-menu-${itemId}">
        <div class="emoji-grid">
          ${TELEGRAM_EMOJIS.map(({ emoji, name }) => `
            <span class="emoji-btn" onclick="setReaction('${itemId}', '${emoji}', '${name}')">${emoji}</span>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  reactionsHtml += '</div>';

  reactionsContainer.outerHTML = reactionsHtml;
}

// Сортировка колонки по порядку элементов
function sortColumnByOrder(category) {
  const column = document.getElementById(`column-${category}`);
  if (!column) return;

  const items = Array.from(column.querySelectorAll('.retro-item'));
  if (items.length <= 1) return;

  // Сортируем элементы по data-order атрибуту или order из items
  items.sort((a, b) => {
    const orderA = parseInt(a.dataset.order || '0', 10);
    const orderB = parseInt(b.dataset.order || '0', 10);
    return orderA - orderB;
  });

  // Перемещаем элементы в отсортированном порядке
  items.forEach(item => column.appendChild(item));
}

// Удаление элемента из DOM
function removeItemFromColumn(itemId) {
  const element = document.getElementById(`item-${itemId}`);
  console.log('[UI] removeItemFromColumn:', { id: itemId, elementExists: !!element });
  if (element) {
    const category = element.closest('.column-items')?.dataset.category;
    element.remove();
    if (category) updateColumnCount(category);
    console.log('[UI] Removed element from column', category);
  } else {
    console.warn('[UI] Element not found for removal', itemId);
  }
}

// Удаление элемента (для админа)
async function deleteItem(itemId) {
  if (!confirm('Удалить этот элемент?')) return;
  
  try {
    await fetch(`/api/sessions/${currentSession.id}/items/${itemId}`, {
      method: 'DELETE'
    });
    showToast('Элемент удален', 'success');
  } catch (error) {
    showToast('Ошибка удаления', 'danger');
  }
}

// Обновление счетчика колонки
function updateColumnCount(category) {
  const column = document.getElementById(`column-${category}`);
  if (!column) return;
  
  const count = column.querySelectorAll('.retro-item').length;
  const badge = document.getElementById(`badge-${category}`);
  if (badge) {
    badge.textContent = count;
  }
}

// Переключение панели админа
function toggleAdminPanel() {
  const panel = document.getElementById('admin-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// Изменение шаблона
async function changeTemplate() {
  const newTemplate = document.getElementById('admin-template-select').value;
  currentSession.template = newTemplate;
  renderColumns();
  await loadSessionData();
  showToast('Шаблон изменен', 'success');
}

// Копирование ID сессии
function copySessionId() {
  if (currentSession && currentSession.id) {
    const url = `${window.location.origin}${window.location.pathname}?session=${currentSession.id}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Ссылка на сессию скопирована!', 'success');
    }).catch(() => {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      showToast('Ссылка на сессию скопирована!', 'success');
    });
  }
}

// ==================== ТАЙМЕР ====================

function renderTimer() {
  const container = document.getElementById('timer-container');
  container.innerHTML = `
    <div class="timer-display ${timerRunning ? 'timer-running' : ''}" id="timer-display">
      <span class="material-icons">timer</span>
      <span class="timer-time" id="timer-time">00:00</span>
      ${isAdmin ? `
        <div class="timer-controls">
          <input type="number" class="timer-input" id="timer-minutes" min="1" max="60" value="5" placeholder="Мин">
          <button class="btn btn-sm btn-light" onclick="startTimer()" title="Запустить">
            <span class="material-icons" style="font-size: 18px;">play_arrow</span>
          </button>
          <button class="btn btn-sm btn-warning" onclick="stopTimer()" title="Пауза">
            <span class="material-icons" style="font-size: 18px;">pause</span>
          </button>
          <button class="btn btn-sm btn-danger" onclick="resetTimer()" title="Сброс">
            <span class="material-icons" style="font-size: 18px;">refresh</span>
          </button>
        </div>
      ` : ''}
    </div>
  `;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const timeEl = document.getElementById('timer-time');
  const display = document.getElementById('timer-display');
  
  if (!timeEl) return;
  
  const mins = Math.floor(timerSeconds / 60);
  const secs = timerSeconds % 60;
  timeEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  
  if (timerRunning) {
    display?.classList.add('timer-running');
  } else {
    display?.classList.remove('timer-running');
  }
}

function startTimer() {
  if (!isAdmin) return;
  
  const minutes = parseInt(document.getElementById('timer-minutes')?.value) || 5;
  if (timerSeconds === 0) {
    timerSeconds = minutes * 60;
  }
  
  socket.emit('timer:start', { sessionId: currentSession.id, seconds: timerSeconds });
}

function stopTimer() {
  if (!isAdmin) return;
  socket.emit('timer:stop', { sessionId: currentSession.id });
}

function resetTimer() {
  if (!isAdmin) return;
  socket.emit('timer:reset', { sessionId: currentSession.id });
}

function startTimerInterval() {
  stopTimerInterval();
  timerInterval = setInterval(() => {
    if (timerRunning && timerSeconds > 0) {
      timerSeconds--;
      updateTimerDisplay();
      
      if (timerSeconds === 0) {
        socket.emit('timer:finished', { sessionId: currentSession.id });
        showToast('Время вышло!', 'warning');
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbqWEyMmih0NupYTIyaKHQ26lhMjJoodDbqWEyMmih0NupYTIyaKHQ26lhMjJoodDbqWEyMmih0NupYTIy');
        audio.play().catch(() => {});
      }
    }
  }, 1000);
}

function stopTimerInterval() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ==================== УЧАСТНИКИ ====================

function updateParticipantsList() {
  const container = document.getElementById('participants-list');
  if (!container) return;
  
  if (participants.size === 0) {
    container.innerHTML = '<span class="text-muted">Нет участников</span>';
    return;
  }
  
  container.innerHTML = Array.from(participants.values()).map(p => `
    <div class="participant-badge ${p.isAdmin ? 'admin' : ''}">
      <div class="participant-avatar">${p.name.charAt(0).toUpperCase()}</div>
      ${escapeHtml(p.name)}
      ${p.isAdmin ? '<span class="material-icons" style="font-size: 14px; color: #f59e0b;">verified</span>' : ''}
    </div>
  `).join('');
}

// Завершение сессии
function endSession() {
  const modal = new bootstrap.Modal(document.getElementById('endSessionModal'));
  modal.show();
}

// Добавление задачи
function addActionItem() {
  const container = document.getElementById('action-items-container');
  container.insertAdjacentHTML('beforeend', `
    <div class="input-group mb-2">
      <input type="text" class="form-control action-item-input" placeholder="Задача">
      <button class="btn btn-outline-danger" onclick="removeActionItem(this)">×</button>
    </div>
  `);
}

// Удаление задачи
function removeActionItem(btn) {
  btn.closest('.input-group').remove();
}

// Подтверждение завершения
async function confirmEndSession() {
  const summary = document.getElementById('session-summary').value;
  const actionItems = Array.from(document.querySelectorAll('.action-item-input'))
    .map(input => input.value.trim())
    .filter(v => v);
  
  try {
    await fetch(`/api/sessions/${currentSession.id}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary, actionItems })
    });
    
    bootstrap.Modal.getInstance(document.getElementById('endSessionModal')).hide();
    localStorage.removeItem('retroSession');
    showToast('Сессия завершена!', 'success');
    
    setTimeout(() => goHome(), 2000);
  } catch (error) {
    showToast('Ошибка завершения сессии', 'danger');
  }
}

// Быстрое завершение сессии из истории
async function quickEndSession(sessionId, sessionName) {
  if (!confirm(`Завершить сессию "${sessionName}"?`)) {
    return;
  }

  try {
    await fetch(`/api/sessions/${sessionId}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: '', actionItems: [] })
    });

    showToast('Сессия завершена!', 'success');
    loadHistory(); // Обновляем список истории
  } catch (error) {
    console.error('Error ending session:', error);
    showToast('Ошибка завершения сессии', 'danger');
  }
}

// Экспорт результатов
async function exportResults(format) {
  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/items`);
    const items = await response.json();
    
    const data = {
      session: currentSession,
      items,
      exportedAt: new Date().toISOString()
    };
    
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `retro-${currentSession.id}.json`);
    } else if (format === 'pdf') {
      let text = `Ретроспектива: ${currentSession.name}\n`;
      text += `ID: ${currentSession.id}\n`;
      text += `Дата: ${new Date(currentSession.created_at).toLocaleString()}\n`;
      text += `=${'='.repeat(50)}\n\n`;
      
      const template = TEMPLATES[currentSession.template] || TEMPLATES['freeform'];
      template.columns.forEach(col => {
        text += `${col.name}\n${'-'.repeat(30)}\n`;
        const colItems = items.filter(i => i.category === col.category);
        colItems.forEach(item => {
          text += `  • ${item.text} (${item.author})\n`;
        });
        text += '\n';
      });
      
      const blob = new Blob([text], { type: 'text/plain' });
      downloadBlob(blob, `retro-${currentSession.id}.txt`);
    }
    
    showToast('Экспорт выполнен!', 'success');
  } catch (error) {
    showToast('Ошибка экспорта', 'danger');
  }
}

// Скачивание blob
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Загрузка истории
async function loadHistory() {
  try {
    const response = await fetch('/api/sessions');
    const sessions = await response.json();

    const container = document.getElementById('history-list');

    if (sessions.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-4">История пуста</div>';
      return;
    }

    container.innerHTML = sessions.map(s => {
      const isActive = s.status === 'active';
      return `
        <div class="list-group-item list-group-item-action session-history-item">
          <div class="d-flex w-100 justify-content-between align-items-center">
            <div onclick="viewSessionDetails('${s.id}')" style="cursor: pointer;">
              <h6 class="mb-1">${escapeHtml(s.name)}</h6>
              <small class="text-muted">ID: ${s.id}</small><br>
              <small class="text-muted">Шаблон: ${s.template} • Ведущий: ${s.admin_name}</small><br>
              <small class="text-muted">${new Date(s.created_at).toLocaleString()}</small>
            </div>
            <div class="text-end">
              <span class="session-status-badge status-${s.status} mb-2">${isActive ? 'Активна' : 'Завершена'}</span><br>
              ${isActive ? `<button class="btn btn-sm btn-outline-danger me-1" onclick="event.stopPropagation(); quickEndSession('${s.id}', '${escapeHtml(s.name)}')">Завершить</button>` : ''}
              ${!isActive ? `<button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); deleteSession('${s.id}')">Удалить</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error('Error loading history:', error);
    document.getElementById('history-list').innerHTML = '<div class="text-center text-danger py-4">Ошибка загрузки</div>';
  }
}

// Просмотр деталей сессии
let currentViewSessionId = null;
async function viewSessionDetails(sessionId) {
  currentViewSessionId = sessionId;

  try {
    const response = await fetch(`/api/sessions/${sessionId}`);
    const session = await response.json();

    // Показываем итоги
    const summaryEl = document.getElementById('session-summary-view');
    if (session.summary) {
      summaryEl.innerHTML = `<p class="mb-0">${escapeHtml(session.summary).replace(/\n/g, '<br>')}</p>`;
    } else {
      summaryEl.innerHTML = '<p class="text-muted mb-0">Нет итогов</p>';
    }

    // Показываем план действий
    const actionsEl = document.getElementById('session-actions-view');
    if (session.action_items) {
      let actions = [];
      try {
        actions = JSON.parse(session.action_items);
      } catch (e) {}

      if (actions.length > 0) {
        actionsEl.innerHTML = '<ul class="mb-0">' + actions.map(a => `<li>${escapeHtml(a)}</li>`).join('') + '</ul>';
      } else {
        actionsEl.innerHTML = '<p class="text-muted mb-0">Нет плана действий</p>';
      }
    } else {
      actionsEl.innerHTML = '<p class="text-muted mb-0">Нет плана действий</p>';
    }

    // Загружаем и показываем все идеи
    await loadSessionItemsView(sessionId);

    // Показываем кнопку удаления только для завершённых
    document.getElementById('delete-session-btn').style.display = session.status === 'active' ? 'none' : 'block';

    const modal = new bootstrap.Modal(document.getElementById('viewSessionModal'));
    modal.show();
  } catch (error) {
    console.error('Error loading session details:', error);
    showToast('Ошибка загрузки деталей', 'danger');
  }
}

// Загрузка идей для просмотра сессии
async function loadSessionItemsView(sessionId) {
  const container = document.getElementById('session-items-view');
  
  try {
    const response = await fetch(`/api/sessions/${sessionId}/items`);
    const items = await response.json();

    if (items.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-4">В этой сессии нет идей</div>';
      return;
    }

    // Группируем по категориям
    const categories = {
      'general': { name: 'Общее', icon: 'lightbulb', color: 'bg-secondary' },
      'start': { name: 'Начать', icon: 'rocket_launch', color: 'bg-success' },
      'stop': { name: 'Перестать', icon: 'stop', color: 'bg-danger' },
      'continue': { name: 'Продолжать', icon: 'play_arrow', color: 'bg-primary' },
      'mad': { name: 'Злит', icon: 'anger', color: 'bg-danger' },
      'sad': { name: 'Расстраивает', icon: 'sentiment_dissatisfied', color: 'bg-warning' },
      'glad': { name: 'Радует', icon: 'sentiment_satisfied', color: 'bg-success' },
      'good': { name: 'Хорошо', icon: 'thumb_up', color: 'bg-success' },
      'bad': { name: 'Плохо', icon: 'thumb_down', color: 'bg-danger' },
      'ideas': { name: 'Идеи', icon: 'lightbulb', color: 'bg-info' },
      'keep': { name: 'Сохранить', icon: 'bookmark', color: 'bg-primary' },
      'improve': { name: 'Улучшить', icon: 'trending_up', color: 'bg-warning' },
      'wind': { name: 'Ветер', icon: 'air', color: 'bg-info' },
      'anchor': { name: 'Якорь', icon: 'anchor', color: 'bg-secondary' },
      'rocks': { name: 'Скалы', icon: 'rock', color: 'bg-danger' },
      'island': { name: 'Остров', icon: 'travel_explore', color: 'bg-success' }
    };

    const grouped = {};
    items.forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });

    let html = '';
    for (const [catKey, catItems] of Object.entries(grouped)) {
      const cat = categories[catKey] || { name: catKey, icon: 'folder', color: 'bg-secondary' };
      html += `
        <div class="card mb-3">
          <div class="card-header ${cat.color} text-white">
            <span class="material-icons me-1 align-middle" style="font-size: 18px;">${cat.icon}</span>
            <strong>${cat.name}</strong>
            <span class="badge bg-white text-dark ms-2">${catItems.length}</span>
          </div>
          <div class="card-body">
      `;

      for (const item of catItems) {
        let reactions = '';
        try {
          const itemReactions = JSON.parse(item.reactions || '{}');
          const totalReactions = Object.values(itemReactions).reduce((a, b) => a + b, 0);
          if (totalReactions > 0) {
            reactions = `<span class="badge bg-secondary ms-2">😊 ${totalReactions}</span>`;
          }
        } catch (e) {}

        const voteBadge = item.votes > 0 ? `<span class="badge bg-primary ms-2">👍 ${item.votes}</span>` : '';
        const authorBadge = item.author ? `<small class="text-muted"> — ${escapeHtml(item.author)}</small>` : '';
        const createdAt = item.created_at ? `<br><small class="text-muted">${new Date(item.created_at).toLocaleString()}</small>` : '';

        html += `
          <div class="card mb-2 ${item.type === 'meme' ? 'bg-light' : ''}">
            <div class="card-body py-2">
              ${item.type === 'meme' && item.meme_url ? `<img src="${escapeHtml(item.meme_url)}" alt="Meme" class="img-fluid rounded mb-2" style="max-height: 200px;"><br>` : ''}
              <p class="mb-1">${escapeHtml(item.text)}</p>
              <small class="text-muted">${voteBadge}${reactions}${authorBadge}${createdAt}</small>
            </div>
          </div>
        `;
      }

      html += `
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (error) {
    console.error('Error loading items:', error);
    container.innerHTML = '<div class="text-center text-danger py-4">Ошибка загрузки идей</div>';
  }
}

// Удаление сессии
async function deleteSession(sessionId) {
  if (!confirm('Вы уверены, что хотите удалить эту сессию? Это действие нельзя отменить.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/sessions/${sessionId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      showToast('Сессия удалена', 'success');
      loadHistory();
    } else {
      showToast('Ошибка удаления', 'danger');
    }
  } catch (error) {
    console.error('Error deleting session:', error);
    showToast('Ошибка удаления', 'danger');
  }
}

// Удаление текущей просматриваемой сессии
function deleteCurrentSession() {
  if (currentViewSessionId) {
    deleteSession(currentViewSessionId);
    bootstrap.Modal.getInstance(document.getElementById('viewSessionModal'))?.hide();
  }
}

// Показать страницу сессии
function showSessionPage() {
  document.getElementById('home-page').classList.add('d-none');
  document.getElementById('session-page').classList.remove('d-none');
  renderTimer();
  if (timerRunning) startTimerInterval();
}

// Вернуться домой
function goHome() {
  // Уведомляем сервер о выходе из сессии
  if (currentSession && currentUserId) {
    socket.emit('participant:leave', {
      sessionId: currentSession.id,
      userId: currentUserId
    });
  }

  currentSession = null;
  isAdmin = false;
  userReactions = {};
  participants.clear();
  stopTimerInterval();
  timerSeconds = 0;
  timerRunning = false;

  // Очищаем URL
  const url = new URL(window.location);
  url.searchParams.delete('session');
  window.history.pushState({}, '', url);

  document.getElementById('session-page').classList.add('d-none');
  document.getElementById('home-page').classList.remove('d-none');
  document.getElementById('create-session-form').reset();
  document.getElementById('join-session-form').reset();
}

// Обработчик закрытия вкладки/браузера
window.addEventListener('beforeunload', (e) => {
  if (currentSession && currentUserId && socket?.connected) {
    // Отправляем синхронное уведомление о выходе
    socket.emit('participant:leave', {
      sessionId: currentSession.id,
      userId: currentUserId
    });
  }
});

// Уведомления
function showToast(message, type = 'info') {
  const container = document.querySelector('.toast-container') || createToastContainer();
  
  const toast = document.createElement('div');
  toast.className = `toast align-items-center text-white bg-${type} border-0 show`;
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${escapeHtml(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

function createToastContainer() {
  const container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

// Экранирование HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
