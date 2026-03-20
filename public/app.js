// Глобальные переменные
let socket;
let currentSession = null;
let currentUserId = null;
let isAdmin = false;
let isViewOnly = false; // Режим только для просмотра (из истории)
let userReactions = {}; // { itemId: reactionName } - реакция пользователя на каждой карточке
let participants = new Map();
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;
let joinSent = false; // Флаг для предотвращения дублирования join
let addedItems = new Set(); // Set для отслеживания добавленных элементов (предотвращение дубликатов)
let isSessionLoading = false; // Флаг загрузки сессии

// Сохранённая позиция курсора для contenteditable
let savedSelection = null;

// Лимит голосов
let voteLimit = 5;

// Режимы отображения (только для админа)
let hideOthersCards = false; // Скрыть карточки других пользователей
let hideOthersVotes = false; // Скрыть голоса других участников
let hideAdminVotes = false; // Скрыть голоса админа при трансляции экрана
let voteMode = false; // Режим голосования
let votingStarted = false; // Голосование было начато в этой сессии (блокирует объединение/разъединение)
let sessionEnded = false; // Сессия завершена (после нажатия "Стоп")

// Голоса голосования (отдельно от реакций)
let voteModeVotes = {}; // { itemId: count } - количество голосов на карточке
let userVoteModeVotes = []; // [itemId1, itemId2] - куда пользователь отдал голос в режиме голосования

// Вкладки сессии
let currentTab = 'brainstorm'; // 'brainstorm' или 'discussion'

// Выбранные карточки для обсуждения
let selectedDiscussionItems = new Set(); // Set itemId

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
    // Проверяем наличие активной сессии и показываем кнопку "Вернуться в сессию"
    checkActiveSession();

    // Если не восстановили, проверяем URL
    if (!restored) {
      checkUrlForSession();
    }
  });
});

// Проверка наличия активной сессии и отображение кнопок "Вернуться в сессию"
async function checkActiveSession() {
  const saved = localStorage.getItem('retroSession');
  const noticeDiv = document.getElementById('active-session-notice');

  console.log('[checkActiveSession] localStorage:', saved);

  // Проверяем, является ли пользователь админом (по флагу или по сохранённым именам)
  const isAdmin = localStorage.getItem('isAdmin') === 'true';
  const adminNames = JSON.parse(localStorage.getItem('retroAdminNames') || '[]');

  if (isAdmin || adminNames.length > 0) {
    // Загружаем все сессии и ищем активные
    try {
      const response = await fetch('/api/sessions');
      const sessions = await response.json();

      // Ищем активные сессии
      const activeSessions = sessions.filter(s => s.status === 'active');

      if (activeSessions.length > 0) {
        // Показываем кнопки для всех активных сессий
        if (noticeDiv) {
          noticeDiv.style.display = 'block';
          const buttonsHtml = activeSessions.map(s => `
            <button class="btn btn-sm btn-primary" onclick="returnToSession('${s.id}')" style="margin-left: 10px; margin-right: 10px; margin-top: 5px; margin-bottom: 5px;">
              <span class="material-icons" style="font-size: 16px;">login</span>
              ${escapeHtml(s.name)} (${s.id})
            </button>
          `).join('');
          noticeDiv.innerHTML = `
            <div class="alert alert-info mb-0" style="display: inline-block; margin-left: auto; text-align: center;">
              <div style="margin-bottom: 5px;">
                <span class="material-icons me-2 align-middle">info</span>
                Активные сессии
              </div>
              <div>${buttonsHtml}</div>
            </div>
          `;
        }
        console.log('[checkActiveSession] showing return buttons for sessions:', activeSessions.map(s => s.id));

        // Разблокируем вкладку "Создать" для админа
        unlockCreateTab();
        return;
      }
    } catch (err) {
      console.error('Error checking active sessions:', err);
    }
  }

  // Скрываем кнопки если нет активной сессии или пользователь не админ
  if (noticeDiv) {
    noticeDiv.style.display = 'none';
    noticeDiv.innerHTML = '';
  }
}

// Настройка пароля на вкладку создания
const CREATE_TAB_PASSWORD = 'yurassss';
let createTabUnlocked = false;

function setupCreateTabPassword() {
  // Проверяем, разблокирована ли вкладка в sessionStorage или localStorage
  const unlocked = sessionStorage.getItem('createTabUnlocked');
  const isAdmin = localStorage.getItem('isAdmin');
  
  if (unlocked === 'true' || isAdmin === 'true') {
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
    // Сохраняем флаг админа в localStorage
    localStorage.setItem('isAdmin', 'true');

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

    // Обновляем список активных сессий
    checkActiveSession();

    showToast('Доступ разрешён. Вы администратор.', 'success');
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
    localStorage.setItem('isAdmin', 'true');
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
    localStorage.removeItem('isAdmin');

    // Переключаем на вкладку "Присоединиться"
    const joinTab = document.querySelector('[data-bs-target="#join-tab"]');
    if (joinTab) {
      const tab = new bootstrap.Tab(joinTab);
      tab.show();
    }
  }
}

// Список имён для авто-входа
const RANDOM_NAMES = [
  'БагБаг', 'КодДок', 'Тестер', 'Логикс', 'Плюсик', 'БайтТрик', 'Нулик', 'СкриптоНяш', 'Глитчик', 'Пингвин',
  'ФокусПокус', 'БлокЧек', 'РитмИКод', 'ПлюсМинус', 'ГлитчКот', 'СвичБич', 'ТвикТак', 'КрэшТэш', 'МиксСникс', 'ТокенОкен',
  'КотоБайт', 'Пингвинчик', 'ЗайкаКод', 'ЛисаЛогик', 'СоваСкрипт', 'ЕнотикТест', 'МышаФокус', 'КроликПик', 'СлоникБаг', 'ТигрёнокПлюс',
  'ПумаПикс', 'Волчица-Вижн', 'Медвежонок-Блок', 'Панда-Пауза', 'ОбезьянаКлик', 'Пчёлка-Данные', 'Орлик-Идея', 'ЧерепашкаТим', 'АкулаАналитик', 'КотоПсихолог',
  'БобрКод', 'КотоМыш', 'ПингвТест', 'ЛисаБаг', 'СоваSQL', 'ЕнотДанные', 'КроликПикс', 'МышаСкрипт', 'ТигрЛогик', 'ПумаПлюс',
  'ВолкФокус', 'Медвежонок-Блок', 'Панда-Чарт', 'ОбезьянаФича', 'ПчёлкаАналитик', 'ОрёлИдея', 'ЧерепаФлоу', 'АкулаТест', 'СоваМетрика', 'КотикКэш',
  'ЗайкаСессия', 'ЛисёнокБайт', 'ПингвинПинг', 'КотДетектив', 'БурёнкаБаг', 'КотоКлик', 'Сова-Ретро', 'Енот-Инсайт', 'Кролик-Клик', 'Мышь-Мета',
  'Тигр-Тикет', 'Пума-Пайплайн', 'Волчица-Виз', 'Медведь-Модель', 'Панда-Пауза', 'Обезьяна-Оценка', 'ПтичкаПрогноз', 'Слоник-Сессия', 'Кот-Коммит', 'Заяц-Запрос',
  'ЛисаЛуп', 'Пингвин-Пулл', 'Сова-Сейф', 'Енот-Эффект', 'Кролик-Ковер', 'Мыш-Монитор', 'Тигр-Тренд', 'ПумаПротокол', 'Волк-Валидация', 'Котик-Коннект',
  'ДизайнерКот', 'ПрограмЕнот', 'ТестерПёс', 'АналитикСова', 'АрхитекторБобр', 'ДевопсПингвин', 'СеошникКот', 'СкрамКотик', 'Дата-Енот', 'Смм-Птичка',
  'Фулстек-Волк', 'Мобайл-Кот', 'Бекенд-Медведь', 'Фронт-Лиса', 'Системщик-Слон', 'Админ-Хомяк', 'Пентестер-Акула', 'Сто-Череп', 'Дев-Панда', 'КодерКот',
  'СайтоЕнот', 'Тест-Тигр', 'Скрипт-Сова', 'Сео-Собака', 'Ба-Барсук', 'Пм-Пума', 'Дизайн-Ёж', 'Смм-Сова', 'Фулл-Лев', 'Моб-Мышь',
  'Бэк-Бык', 'Фронт-Феникс', 'Сист-Слон', 'Админ-Аист', 'Секур-Сурок', 'Сто-Сова', 'Арх-Акула', 'Дата-Дельфин', 'DevOps-Ёжик', 'Тимлид-Тигр',
  'Сеньор-Слон', 'Джун-Зайка', 'Мидл-Мышь', 'Секьюр-Сова', 'Контр-Кот', 'Рецен-Рыба', 'Док-Дельфин', 'ТехПис-Пингвин', 'QA-Котик', 'BA-Бобр',
  'PM-Панда', 'UX-Енот', 'UI-Лиса', 'Сисадмин-Сова', 'Прогр-Пёс', 'Тестер-Тюлень', 'Арх-Аист'
];

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

    // Генерируем случайное имя
    const randomName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    document.getElementById('join-name').value = randomName;

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

    // Автоматический вход через 1 секунду
    setTimeout(() => {
      joinSession();
    }, 1000);
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
    // Проверяем что сессия загружена
    if (!currentSession) {
      console.log('[WS] item:created ignored - currentSession is null');
      return;
    }

    // Игнорируем если сессия ещё загружается (предотвращение дубликатов)
    if (isSessionLoading) {
      console.log('[WS] item:created ignored (session loading):', item.id);
      return;
    }

    // Игнорируем если элемент уже есть в currentSession.items (предотвращение дубликатов)
    if (currentSession.items?.some(i => i.id === item.id)) {
      console.log('[WS] item:created ignored (already in currentSession):', item.id);
      return;
    }

    // Игнорируем если элемент уже был добавлен локально (предотвращение дубликатов)
    if (addedItems.has(item.id)) {
      console.log('[WS] item:created ignored (already added locally):', item.id);
      // Всё равно добавляем в currentSession.items
      if (currentSession?.items) {
        currentSession.items.push(item);
      }
      // Применяем настройки отображения
      applyViewSettings();
      return;
    }
    if (item.session_id === currentSession?.id) {
      // Добавляем в currentSession.items
      if (currentSession?.items) {
        currentSession.items.push(item);
      }

      // Синхронизируем реакцию текущего пользователя
      let itemUserReactions = item.user_reactions;
      if (typeof itemUserReactions === 'string') {
        try {
          itemUserReactions = JSON.parse(itemUserReactions);
        } catch (e) {
          itemUserReactions = {};
        }
      }
      if (currentUserId && itemUserReactions && itemUserReactions[currentUserId]) {
        userReactions[item.id] = itemUserReactions[currentUserId];
      } else {
        delete userReactions[item.id];
      }

      addItemToColumn(item);
      showToast('Новый элемент добавлен!', 'info');
    }
  });

  socket.on('item:updated', (item) => {
    console.log('[WS] item:updated received:', {
      id: item.id,
      action_plan_text: item.action_plan_text?.substring(0, 30),
      action_plan_who: item.action_plan_who,
      action_plan_when: item.action_plan_when
    });

    if (currentSession && item.session_id === currentSession.id) {
      // Обновляем в currentSession.items
      if (currentSession?.items) {
        const index = currentSession.items.findIndex(i => i.id === item.id);
        if (index >= 0) {
          currentSession.items[index] = item;
        }
      }

      // Синхронизируем реакцию текущего пользователя
      let itemUserReactions = item.user_reactions;
      if (typeof itemUserReactions === 'string') {
        try {
          itemUserReactions = JSON.parse(item.user_reactions);
        } catch (e) {
          itemUserReactions = {};
        }
      }
      if (currentUserId && itemUserReactions && typeof itemUserReactions === 'object' && itemUserReactions[currentUserId]) {
        userReactions[item.id] = itemUserReactions[currentUserId];
      } else {
        delete userReactions[item.id];
      }

      // Если пришло user_reactions — это обновление реакции, не перерисовываем карточку
      // Реакции обновит обработчик reaction:updated
      // ИСКЛЮЧЕНИЕ: если пришло merged_parts_data — это объединение карточек, нужно перерисовать
      if (item.user_reactions !== undefined && item.user_reactions !== null) {
        if (item.merged_parts_data === undefined) {
          console.log('[WS] Reaction update - skipping re-render');
          return;
        }
        console.log('[WS] Merge detected (merged_parts_data present) - will re-render');
      }

      updateItemInColumn(item);

      // Обновляем поля плана действий в обсуждении если они есть
      if (currentTab === 'discussion') {
        const editor = document.querySelector(`.action-plan-editor[data-item-id="${item.id}"]`);
        const wrapper = editor?.closest('.discussion-item-plan') || editor?.closest('.action-plan-section');
        const inputs = wrapper?.querySelectorAll(`input[data-item-id="${item.id}"]`) || [];
        const whoInput = inputs[0];
        const whenInput = inputs[1];

        // Обновляем только если элемент не в фокусе (чтобы не мешать редактированию)
        // И только если данные отличаются от текущих в DOM
        if (editor && document.activeElement !== editor && item.action_plan_text !== undefined) {
          const currentEditorHtml = editor.innerHTML;
          if (currentEditorHtml !== (item.action_plan_text || '')) {
            editor.innerHTML = item.action_plan_text || '';
          }
        }
        if (whoInput && document.activeElement !== whoInput && item.action_plan_who !== undefined) {
          if (whoInput.value !== (item.action_plan_who || '')) {
            whoInput.value = item.action_plan_who || '';
          }
        }
        if (whenInput && document.activeElement !== whenInput && item.action_plan_when !== undefined) {
          if (whenInput.value !== (item.action_plan_when || '')) {
            whenInput.value = item.action_plan_when || '';
          }
        }
      }
    }
  });

  // Обработка обновления реакций от других пользователей
  socket.on('reaction:updated', (data) => {
    if (currentSession && data.itemId) {
      // Обновляем в currentSession.items
      if (currentSession?.items) {
        const item = currentSession.items.find(i => i.id === data.itemId);
        if (item) {
          item.user_reactions = data.user_reactions;
        }
      }
      
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
      // Удаляем из currentSession.items
      if (currentSession?.items) {
        currentSession.items = currentSession.items.filter(i => i.id !== data.id);
      }
      console.log('[UI] Calling removeItemFromColumn for item', data.id);
      removeItemFromColumn(data.id);
    }
  });

  socket.on('category:deleted', (data) => {
    console.log('[WS] category:deleted received:', { category: data.category });
    if (currentSession) {
      // Удаляем все карточки этой категории из currentSession.items
      if (currentSession?.items) {
        currentSession.items = currentSession.items.filter(i => i.category !== data.category);
      }
      // Перерисовываем колонки
      renderColumns();
      showToast('Колонка удалена', 'info');
    }
  });

  socket.on('session:ended', (data) => {
    sessionEnded = true;
    saveSession();
    showToast('Сессия завершена!', 'success');
    // Очищаем localStorage после завершения сессии
    localStorage.removeItem('retroSession');
    setTimeout(() => goHome(true), 2000);
  });

  // Настройки отображения от админа
  socket.on('view:settings', (data) => {
    console.log('[WS] Received view:settings', data);
    hideOthersCards = data.hideOthersCards;
    hideOthersVotes = data.hideOthersVotes;
    // Сохраняем в localStorage
    if (currentSession) {
      localStorage.setItem(`hideOthersCards_${currentSession.id}`, hideOthersCards);
      localStorage.setItem(`hideOthersVotes_${currentSession.id}`, hideOthersVotes);
    }
    applyViewSettings();
    applyVoteMode(); // Обновляем отображение голосов голосования
  });

  // Режим голосования от админа
  socket.on('vote:mode', (data) => {
    voteMode = data.voteMode;
    // Если голосование включено - устанавливаем флаг блокировки
    if (voteMode) {
      votingStarted = true;
    }
    // Если сессия завершена (sessionEnded = true) - показываем чекбоксы
    if (data.sessionEnded) {
      sessionEnded = true;
      saveSession();
      document.getElementById('session-tabs').style.display = 'flex';
      // Перерисовываем карточки с чекбоксами - обновляем каждую карточку
      document.querySelectorAll('.retro-item').forEach(itemEl => {
        const itemId = itemEl.dataset.id;
        const item = currentSession?.items?.find(i => i.id === itemId);
        if (item) {
          const newHtml = createItemHtml(item);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = newHtml;
          const newItemEl = tempDiv.firstElementChild;
          if (newItemEl) {
            itemEl.replaceWith(newItemEl);
            initDraggable(newItemEl);
          }
        }
      });
    } else if (!voteMode && votingStarted && isAdmin) {
      // Если голосование выключено (нажат "СТОП") - показываем чекбоксы админу
      // Перерисовываем карточки с чекбоксами
      document.querySelectorAll('.retro-item').forEach(itemEl => {
        const itemId = itemEl.dataset.id;
        const item = currentSession?.items?.find(i => i.id === itemId);
        if (item) {
          const newHtml = createItemHtml(item);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = newHtml;
          const newItemEl = tempDiv.firstElementChild;
          if (newItemEl) {
            itemEl.replaceWith(newItemEl);
            initDraggable(newItemEl);
          }
        }
      });
    }
    applyVoteMode();
    showToast(voteMode ? 'Режим голосования включён' : 'Режим голосования выключен', 'info');
  });

  // Сброс голосования (от сервера)
  socket.on('vote:reset', () => {
    // Сбрасываем все голоса
    voteModeVotes = {};
    userVoteModeVotes = [];
    voteMode = false;
    votingStarted = false;
    sessionEnded = false;
    
    // Сбрасываем выбранные карточки
    selectedDiscussionItems.clear();

    // Перерисовываем карточки без кнопок голосования
    document.querySelectorAll('.retro-item').forEach(itemEl => {
      const itemId = itemEl.dataset.id;
      const item = currentSession?.items?.find(i => i.id === itemId);
      if (item) {
        const newHtml = createItemHtml(item);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newHtml;
        const newItemEl = tempDiv.firstElementChild;
        if (newItemEl) {
          itemEl.replaceWith(newItemEl);
          initDraggable(newItemEl);
        }
      }
    });

    // Скрываем кнопки голосования
    document.querySelectorAll('.quick-vote-btn').forEach(btn => btn.remove());

    // Если мы во вкладке Обсуждение - переключаем на Brain storm
    if (currentTab === 'discussion') {
      switchToTab('brainstorm');
    }
    
    // Обновляем счётчик обсуждения
    updateDiscussionCount();

    applyVoteMode();
    showToast('Голосование сброшено', 'success');
  });

  // Обновление голоса голосования (от других пользователей)
  socket.on('vote:updated', (data) => {
    const { itemId, userId, voted } = data;

    // Не обновляем если это наш голос (чтобы избежать дублирования)
    if (userId === currentUserId) return;

    if (voted) {
      voteModeVotes[itemId] = (voteModeVotes[itemId] || 0) + 1;
    } else {
      voteModeVotes[itemId] = Math.max(0, (voteModeVotes[itemId] || 0) - 1);
      if (voteModeVotes[itemId] === 0) delete voteModeVotes[itemId];
    }

    applyVoteMode();
  });

  // Обсуждение - выбор карточки другим участником
  socket.on('discussion:toggle', (data) => {
    const { itemId, userId, selected } = data;

    // Не обновляем если это наш выбор
    if (userId === currentUserId) return;

    if (selected) {
      selectedDiscussionItems.add(itemId);
    } else {
      selectedDiscussionItems.delete(itemId);
    }

    updateDiscussionCount();

    // Если мы во вкладке обсуждения - перерисовываем
    if (currentTab === 'discussion') {
      renderDiscussionTab();
    }

    // Обновляем чекбокс в Brain storm
    const checkbox = document.querySelector(`.discussion-checkbox input[data-item-id="${itemId}"]`);
    if (checkbox) {
      checkbox.checked = selected;
    }
  });

  // Переключение вкладки админом - все пользователи переключаются
  socket.on('tab:switch', (data) => {
    const { tab, isAdmin: fromAdmin } = data;
    
    // Переключаемся только если это команда от админа и мы не админ
    if (fromAdmin && !isAdmin && currentSession) {
      console.log('[WS] Switching to tab:', tab, '(from admin)');
      switchToTab(tab);
      showToast(`Админ переключил на вкладку "${tab === 'discussion' ? 'Обсуждение' : 'Brain storm'}"`, 'info');
    }
  });

  // Обновление плана действий в реальном времени
  socket.on('action-plan:update', (data) => {
    const { itemId, action_plan_text, action_plan_who, action_plan_when } = data;

    console.log('[ActionPlan WS] Received update:', { itemId, action_plan_text: action_plan_text?.substring(0, 30), action_plan_who, action_plan_when });

    // Не обновляем если это наши изменения
    if (currentUserId && data.userId === currentUserId) {
      console.log('[ActionPlan WS] Skipping - our own update');
      return;
    }

    // Обновляем в currentSession
    const item = currentSession?.items?.find(i => i.id === itemId);
    if (item) {
      if (action_plan_text !== undefined) item.action_plan_text = action_plan_text;
      if (action_plan_who !== undefined) item.action_plan_who = action_plan_who;
      if (action_plan_when !== undefined) item.action_plan_when = action_plan_when;
    }

    // Функция для обновления полей плана действий
    function updateActionPlanFields(editor, whoInput, whenInput) {
      if (editor && document.activeElement !== editor && action_plan_text !== undefined) {
        if (editor.innerHTML !== (action_plan_text || '')) {
          editor.innerHTML = action_plan_text || '';
          console.log('[ActionPlan WS] Updated editor:', itemId);
        }
      }
      if (whoInput && document.activeElement !== whoInput && action_plan_who !== undefined) {
        if (whoInput.value !== (action_plan_who || '')) {
          whoInput.value = action_plan_who || '';
          console.log('[ActionPlan WS] Updated who:', action_plan_who);
        }
      }
      if (whenInput && document.activeElement !== whenInput && action_plan_when !== undefined) {
        if (whenInput.value !== (action_plan_when || '')) {
          whenInput.value = action_plan_when || '';
          console.log('[ActionPlan WS] Updated when:', action_plan_when);
        }
      }
    }

    // Обновляем все редакторы и поля на странице (и в обсуждении, и в brain storm)
    const allEditors = document.querySelectorAll(`.action-plan-editor[data-item-id="${itemId}"]`);
    allEditors.forEach(editor => {
      const wrapper = editor.closest('.discussion-item-plan') || editor.closest('.action-plan-section');
      if (wrapper) {
        const inputs = wrapper.querySelectorAll(`input[data-item-id="${itemId}"]`);
        const whoInput = inputs[0];
        const whenInput = inputs[1];
        updateActionPlanFields(editor, whoInput, whenInput);
      }
    });

    console.log('[ActionPlan WS] Update complete for item:', itemId);
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
    console.log('[Timer] Received update:', data);
    timerSeconds = data.seconds;
    timerRunning = data.running;
    // Если таймер запущен, запускаем интервал
    if (timerRunning) {
      startTimerInterval();
    }
    updateTimerDisplay();
  });

  socket.on('timer:started', (data) => {
    console.log('[Timer] Started:', data);
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

      // Обновляем customColumns - это критически важно для синхронизации
      const standardCategories = ['start', 'stop', 'continue', 'mad', 'sad', 'glad', 'good', 'bad', 'ideas', 'keep', 'improve', 'wind', 'anchor', 'rocks', 'island', 'general'];
      currentSession.customColumns = data.columns
        .filter(col => !standardCategories.includes(col.category))
        .map(col => ({
          id: col.id || col.category,
          name: col.name,
          category: col.category
        }));

      // Перерисовываем колонки и добавляем карточки
      renderColumns();
      renderColumnsForBrainstorm();
    }
  });

  // Обработчик изменения порядка столбцов
  socket.on('columns:reordered', (data) => {
    console.log('[WS] Columns reordered:', data);
    if (currentSession) {
      // Обновляем порядок в template_columns
      currentSession.template_columns = JSON.stringify(data.columns);

      // Сохраняем в localStorage
      saveSession();

      // Перерисовываем колонки
      renderColumns();

      // Перераспределяем карточки по новым колонкам только если сессия уже загружена
      if (currentSession.items && !isSessionLoading) {
        currentSession.items.forEach(item => {
          addItemToColumn(item);
        });
      }
    }
  });

  // Обработчик удаления колонки
  socket.on('column:deleted', (data) => {
    console.log('[WS] Column deleted:', data);
    if (currentSession) {
      // Удаляем колонку из customColumns
      if (currentSession.customColumns) {
        currentSession.customColumns = currentSession.customColumns.filter(col => col.category !== data.category);
      }

      // Удаляем из column_headers
      if (currentSession.column_headers) {
        const columnHeaders = JSON.parse(currentSession.column_headers);
        delete columnHeaders[data.category];
        currentSession.column_headers = JSON.stringify(columnHeaders);
      }

      // Удаляем из template_columns
      if (currentSession.template_columns && currentSession.template_columns.trim() !== '') {
        try {
          let templateColumns = JSON.parse(currentSession.template_columns);
          templateColumns = templateColumns.filter(col => col.category !== data.category);
          currentSession.template_columns = JSON.stringify(templateColumns);
        } catch (e) {
          console.error('Error parsing template_columns on delete:', e);
        }
      }

      // Удаляем карточки этой категории из items
      if (currentSession.items) {
        currentSession.items = currentSession.items.filter(item => item.category !== data.category);
      }

      // Перерисовываем колонки и добавляем карточки
      renderColumns();
      renderColumnsForBrainstorm();

      showToast('Колонка удалена', 'info');
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

  console.log('[WS] Emitting join for session', sessionId, 'isAdmin:', isAdmin, 'socket.connected:', socket?.connected);
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

  // Обработчик для contenteditable div - отправка по Ctrl+Enter
  const itemTextDiv = document.getElementById('item-text');
  if (itemTextDiv) {
    // Сохраняем позицию курсора при потере фокуса
    itemTextDiv.addEventListener('blur', () => {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        savedSelection = selection.getRangeAt(0).cloneRange();
      }
    });

    // Восстанавливаем позицию курсора при фокусе
    itemTextDiv.addEventListener('focus', () => {
      if (savedSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(savedSelection);
      }
    });

    itemTextDiv.addEventListener('keydown', (e) => {
      // Отправка только по Ctrl+Enter или Cmd+Enter
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        submitItem();
      }
      // Enter без модификаторов - перевод строки (разрешаем default поведение)
    });

    // Очистка форматирования при вставке
    itemTextDiv.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  }

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
      // Восстанавливаем флаги голосования и завершения сессии из currentSession
      // Игнорируем data.sessionEnded и data.votingStarted (они могут быть устаревшими)
      sessionEnded = currentSession.sessionEnded || false;
      votingStarted = currentSession.votingStarted || false;
      
      // Сбрасываем joinSent, чтобы при подключении сокета отправился join
      joinSent = false;

      // Проверяем статус сессии через API
      try {
        const response = await fetch(`/api/sessions/${data.session.id}/status`);
        const statusData = await response.json();

        // Если сессия завершена на сервере - не восстанавливаем
        if (statusData.status !== 'active') {
          console.log('[WS] Session is not active (status:', statusData.status + '), not restoring');
          localStorage.removeItem('retroSession');
          return false;
        }
      } catch (err) {
        console.error('Error checking session status during restore:', err);
      }

      console.log('[WS] Restored session from localStorage:', { sessionId: currentSession.id, userId: currentUserId, isAdmin, sessionEnded, socketConnected: socket?.connected });

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

      // Отправляем join если сокет подключён - это запросит состояние таймера у сервера
      if (socket?.connected) {
        console.log('[WS] Sending join after restore to get timer state');
        sendJoinToSession(currentSession.id);
      }

      await loadSessionData();

      // Восстанавливаем последнюю активную вкладку
      const savedTab = localStorage.getItem(`retroSessionTab_${currentSession.id}`);
      const tabToRestore = savedTab || 'brainstorm';

      // Показываем вкладки всегда (и для активных, и для завершённых сессий)
      document.getElementById('session-tabs').style.display = 'flex';
      switchToTab(tabToRestore);

      // Если это админ, скрываем вкладку "Создать"
      if (isAdmin) {
        const createTab = document.querySelector('[data-bs-target="#create-tab"]');
        if (createTab) {
          createTab.parentElement.style.display = 'none';
        }
      }

      return true;
    } catch (e) {
      // Не удаляем сессию при ошибке - даём пользователю возможность вернуться через кнопку
      console.error('Error restoring session (session preserved in localStorage):', e);
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
      isAdmin,
      sessionEnded,
      votingStarted
    }));
    
    // Сохраняем список всех имён админа для проверки прав в истории
    if (isAdmin && currentSession.admin_name) {
      const adminNames = JSON.parse(localStorage.getItem('retroAdminNames') || '[]');
      if (!adminNames.includes(currentSession.admin_name)) {
        adminNames.push(currentSession.admin_name);
        localStorage.setItem('retroAdminNames', JSON.stringify(adminNames));
      }
    }
    
    // Также сохраняем в URL
    const url = new URL(window.location);
    url.searchParams.set('session', currentSession.id);
    window.history.pushState({}, '', url);
  }
}

// Вернуться в активную сессию (для админа)
// Возврат в сессию по ID
async function returnToSession(sessionId) {
  // Если ID не передан, пробуем восстановить из localStorage
  if (!sessionId) {
    const saved = localStorage.getItem('retroSession');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        // Восстанавливаем сессию если пользователь админ и сессия существует
        if (data.isAdmin && data.session) {
          sessionId = data.session.id;
        }
      } catch (e) {
        console.error('Error parsing saved session:', e);
      }
    }
  }

  if (!sessionId) {
    showToast('Нет активной сессии для возврата', 'warning');
    return;
  }

  try {
    // Проверяем статус сессии
    const response = await fetch(`/api/sessions/${sessionId}/status`);
    const statusData = await response.json();

    // Если сессия завершена - не восстанавливаем
    if (statusData.status !== 'active') {
      console.log('[returnToSession] Cannot return to session: status is', statusData.status);
      localStorage.removeItem('retroSession');
      showToast('Сессия завершена', 'info');
      checkActiveSession();
      return;
    }

    // Загружаем данные сессии
    const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
    const session = await sessionResponse.json();

    // Сбрасываем состояние предыдущей сессии
    currentSession = null;
    currentUserId = null;
    isAdmin = false;
    selectedDiscussionItems.clear();
    userReactions = {};
    voteModeVotes = {};
    userVoteModeVotes = [];
    participants.clear();
    addedItems.clear();
    joinSent = false; // Сбрасываем флаг join для новой сессии

    // Очищаем DOM от карточек предыдущей сессии
    document.querySelectorAll('.column-items').forEach(col => {
      col.innerHTML = '';
    });
    const discussionContainer = document.getElementById('discussion-items-container');
    if (discussionContainer) {
      discussionContainer.innerHTML = '';
    }

    // Всегда устанавливаем currentSession
    currentSession = session;

    // Проверяем, является ли текущий пользователь админом этой сессии
    const adminNames = JSON.parse(localStorage.getItem('retroAdminNames') || '[]');
    const isSessionAdmin = adminNames.includes(session.admin_name);
    // Проверяем, разблокирована ли вкладка "Создать" (пользователь ввёл пароль)
    const isCreateTabUnlocked = localStorage.getItem('isAdmin') === 'true';

    if (isSessionAdmin || isCreateTabUnlocked) {
      // Восстанавливаем статус админа
      // Если вкладка разблокирована, используем admin_name из сессии
      isAdmin = true;
      currentUserId = 'admin_' + session.admin_name;
      // Сохраняем флаг админа и имя админа
      localStorage.setItem('isAdmin', 'true');
      if (isCreateTabUnlocked && !isSessionAdmin) {
        // Добавляем имя админа в список для будущих проверок
        adminNames.push(session.admin_name);
        localStorage.setItem('retroAdminNames', JSON.stringify(adminNames));
      }
      console.log('[returnToSession] Entering session as admin:', session.admin_name);
    } else {
      // Если не админ, заходим как обычный пользователь
      isAdmin = false;
      // Генерируем ID пользователя
      const userName = prompt('Введите ваше имя для участия в сессии:', '') || 'Аноним';
      currentUserId = 'user_' + userName;
    }

    // Сохраняем текущую сессию в localStorage
    saveSession();

    console.log('[returnToSession] Returning to session:', { sessionId: currentSession.id, userId: currentUserId, isAdmin });

    showSessionPage();

    // Ждём подключения WebSocket
    if (!socket?.connected) {
      socket.once('connect', () => {
        sendJoinToSession(currentSession.id);
        loadSessionData();
      });
    } else {
      sendJoinToSession(currentSession.id);
      loadSessionData();
    }
  } catch (err) {
    console.error('Error returning to session:', err);
    showToast('Не удалось вернуться в сессию', 'danger');
  }
}

// Создание сессии
async function createSession() {
  const name = document.getElementById('session-name').value;
  let adminName = document.getElementById('admin-name').value;
  const template = document.getElementById('session-template').value;

  // Если имя ведущего не введено, генерируем случайное
  if (!adminName || adminName.trim() === '') {
    adminName = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    document.getElementById('admin-name').value = adminName;
  }

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

  // Устанавливаем флаг загрузки
  isSessionLoading = true;

  // Очищаем Set добавленных элементов при загрузке новой сессии
  addedItems.clear();

  document.getElementById('session-title').textContent = currentSession.name;
  const templateName = TEMPLATES[currentSession.template]?.name || currentSession.template;
  document.getElementById('session-info').textContent = `${templateName} • ${currentSession.status}`;
  document.getElementById('session-id-display').textContent = currentSession.id;
  document.getElementById('user-display').textContent = currentUserId.replace(/^(admin_|user_)/, '');

  // Загружаем настройки отображения из сессии
  try {
    const response = await fetch(`/api/sessions/${currentSession.id}`);
    const sessionData = await response.json();
    hideOthersCards = sessionData.hide_others_cards || false;
    hideOthersVotes = sessionData.hide_others_votes || false;

    // Загружаем column_headers и инициализируем customColumns
    let columnHeaders = {};
    if (sessionData.column_headers) {
      columnHeaders = JSON.parse(sessionData.column_headers);
      // Инициализируем customColumns из column_headers (для кастомных колонок)
      currentSession.column_headers = sessionData.column_headers;
      currentSession.customColumns = currentSession.customColumns || [];

      // Для каждого заголовка, которого нет в стандартных шаблонах, создаём customColumn
      const standardCategories = ['start', 'stop', 'continue', 'mad', 'sad', 'glad', 'good', 'bad', 'ideas', 'keep', 'improve', 'wind', 'anchor', 'rocks', 'island', 'general'];
      Object.keys(columnHeaders).forEach(category => {
        if (!standardCategories.includes(category) && !currentSession.customColumns.find(c => c.category === category)) {
          currentSession.customColumns.push({
            id: category,
            name: columnHeaders[category],
            category: category
          });
        }
      });
    }

    // Загружаем template_columns (порядок колонок)
    if (sessionData.template_columns && sessionData.template_columns.trim() !== '') {
      try {
        currentSession.template_columns = sessionData.template_columns;
      } catch (e) {
        console.error('Error parsing template_columns:', e);
      }
    }

    // Если есть кастомные колонки, но их нет в template_columns, добавляем их
    if (currentSession.customColumns && currentSession.customColumns.length > 0) {
      try {
        let templateColumns = [];
        if (currentSession.template_columns && currentSession.template_columns.trim() !== '') {
          templateColumns = JSON.parse(currentSession.template_columns);
        } else {
          // Если template_columns пуст, инициализируем из шаблона
          const template = TEMPLATES[currentSession.template] || TEMPLATES['freeform'];
          templateColumns = [...template.columns];
        }

        // Добавляем кастомные колонки, если их нет
        currentSession.customColumns.forEach(customCol => {
          if (!templateColumns.find(c => c.category === customCol.category)) {
            templateColumns.push({
              id: customCol.id,
              name: customCol.name,
              category: customCol.category
            });
          }
        });

        currentSession.template_columns = JSON.stringify(templateColumns);
      } catch (e) {
        console.error('Error adding custom columns to template_columns:', e);
      }
    }

    // Обновляем чекбоксы
    const hideCardsCheckbox = document.getElementById('hide-others-cards');
    const hideVotesCheckbox = document.getElementById('hide-others-votes');
    if (hideCardsCheckbox) hideCardsCheckbox.checked = hideOthersCards;
    if (hideVotesCheckbox) hideVotesCheckbox.checked = hideOthersVotes;

    // Сохраняем в localStorage
    localStorage.setItem(`hideOthersCards_${currentSession.id}`, hideOthersCards);
    localStorage.setItem(`hideOthersVotes_${currentSession.id}`, hideOthersVotes);
  } catch (error) {
    console.error('Error loading session settings:', error);
  }
  
  // Показываем кнопки только админу
  const isAdm = isAdmin;
  document.getElementById('admin-panel-btn').style.display = isAdm ? 'block' : 'none';
  document.getElementById('end-session-btn').style.display = isAdm ? 'block' : 'none';

  // Показываем контроль лимита голосов только админу
  document.getElementById('admin-vote-group').style.display = isAdm ? 'flex' : 'none';
  document.getElementById('vote-limit-display').style.display = isAdm ? 'none' : 'block';
  document.getElementById('vote-limit-input').value = voteLimit;
  document.getElementById('vote-limit-value').textContent = voteLimit;

  // Показываем кнопку добавления колонки только админу
  const addColumnBtn = document.getElementById('add-column-btn');
  if (addColumnBtn) {
    addColumnBtn.style.display = isAdm ? 'block' : 'none';
  }

  renderColumns();

  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/items`);
    const items = await response.json();

    // Сохраняем items в currentSession для редактирования
    currentSession.items = items;
    
    // Логируем action_plan_text для отладки
    console.log('[LoadSession] Items loaded:', items.map(i => ({ 
      id: i.id, 
      action_plan_text: i.action_plan_text ? '✅' : '❌',
      action_plan_who: i.action_plan_who || '-',
      action_plan_when: i.action_plan_when || '-'
    })));

    // Загружаем выбранные карточки для обсуждения из БД
    selectedDiscussionItems.clear();
    items.forEach(item => {
      if (item.for_discussion) {
        selectedDiscussionItems.add(item.id);
      }
    });
    updateDiscussionCount();

    // Восстанавливаем сохраненную вкладку ДО рендера колонок
    const savedTab = localStorage.getItem(`retroSessionTab_${currentSession.id}`);
    
    // Показываем вкладки всегда (и для активных, и для завершённых сессий)
    document.getElementById('session-tabs').style.display = 'flex';
    
    // Определяем какую вкладку показать — устанавливаем currentTab ДО рендера
    currentTab = savedTab || 'brainstorm';

    if (currentTab === 'discussion') {
      // Переключаем на вкладку обсуждения
      document.getElementById('columns-container').style.display = 'none';
      document.getElementById('columns-container').classList.add('d-none');
      document.getElementById('discussion-container').style.display = '';
      document.getElementById('discussion-container').classList.remove('d-none');
      document.getElementById('brainstorm-tab-btn').classList.remove('active');
      document.getElementById('discussion-tab-btn').classList.add('active');
      // renderDiscussionTab вызывается позже, после загрузки items
    } else {
      // Вкладка brain storm - показываем колонки
      document.getElementById('columns-container').style.display = '';
      document.getElementById('columns-container').classList.remove('d-none');
      document.getElementById('discussion-container').style.display = 'none';
      document.getElementById('discussion-container').classList.add('d-none');
      document.getElementById('brainstorm-tab-btn').classList.add('active');
      document.getElementById('discussion-tab-btn').classList.remove('active');
    }

    document.querySelectorAll('.column-items').forEach(col => col.innerHTML = '');
    // Сортируем элементы по порядку внутри каждой категории
    items.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return (a.order || 0) - (b.order || 0);
    });
    
    // Заполняем addedItems чтобы предотвратить дублирование от WebSocket
    items.forEach(item => addedItems.add(item.id));
    
    items.forEach(item => addItemToColumn(item));

    // Применяем настройки отображения после загрузки всех карточек
    applyViewSettings();

    // Восстанавливаем размеры мемов после полной загрузки DOM
    console.log('[MemeSize] Scheduling restore after 200ms');
    setTimeout(() => {
      console.log('[MemeSize] Restoring now, currentSession.items:', currentSession?.items?.length);
      restoreMemeSizes();
    }, 200);

    // Если выбрана вкладка обсуждения - рендерим её после загрузки items
    if (sessionEnded && currentTab === 'discussion') {
      renderDiscussionTab();
      // startActionPlanAutoSave вызывается внутри renderDiscussionTab
    }
    
    // Сбрасываем флаг загрузки
    isSessionLoading = false;
    console.log('[LoadSession] Completed, addedItems:', addedItems.size);
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
      // Проверяем что currentUserId и itemUserReactions существуют
      if (currentUserId && itemUserReactions && typeof itemUserReactions === 'object' && itemUserReactions[currentUserId]) {
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

  // Показываем панель управления только админу
  const adminViewControls = document.getElementById('admin-view-controls');
  const adminPanelBtn = document.getElementById('admin-panel-btn');
  const endSessionBtn = document.getElementById('end-session-btn');
  const adminVoteGroup = document.getElementById('admin-vote-group');
  const voteLimitDisplay = document.getElementById('vote-limit-display');
  const userDisplay = document.getElementById('user-display');

  if (isAdmin) {
    if (adminViewControls) adminViewControls.style.setProperty('display', 'flex', 'important');
    if (adminPanelBtn) adminPanelBtn.style.display = 'block';
    if (endSessionBtn) endSessionBtn.style.display = 'block';
    if (adminVoteGroup) adminVoteGroup.style.display = 'flex';
    if (voteLimitDisplay) voteLimitDisplay.style.display = 'none';
    // Скрываем имя у админа
    if (userDisplay) userDisplay.style.display = 'none';
  } else {
    if (adminViewControls) adminViewControls.style.display = 'none';
    if (adminPanelBtn) adminPanelBtn.style.display = 'none';
    if (endSessionBtn) endSessionBtn.style.display = 'none';
    if (adminVoteGroup) adminVoteGroup.style.display = 'none';
    if (voteLimitDisplay) voteLimitDisplay.style.display = 'block';
    // Показываем имя у обычного пользователя
    if (userDisplay) userDisplay.style.display = 'inline';
  }

  socket.emit('participant:list', currentSession.id);
  
  // Загружаем голоса голосования из базы данных (асинхронно, не блокируя UI)
  setTimeout(() => loadVoteModeVotes(), 100);
}

// Загрузка голосов голосования из БД
async function loadVoteModeVotes() {
  if (!currentSession) return;

  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/votes`);
    const votesByItem = await response.json();

    // Преобразуем в формат voteModeVotes { itemId: count }
    voteModeVotes = {};
    for (const [itemId, userIds] of Object.entries(votesByItem)) {
      voteModeVotes[itemId] = userIds.length;
    }

    // Если текущий пользователь уже голосовал, добавляем в userVoteModeVotes
    userVoteModeVotes = [];
    for (const [itemId, userIds] of Object.entries(votesByItem)) {
      if (userIds.includes(currentUserId)) {
        userVoteModeVotes.push(itemId);
      }
    }

    // Обновляем UI - показываем голоса всегда (не только в режиме голосования)
    applyVoteMode();
    console.log('[VoteMode] Loaded votes:', { voteModeVotes, userVoteModeVotes });
  } catch (error) {
    console.error('Error loading vote mode votes:', error);
  }
}

// Рендер колонок
function renderColumns() {
  const container = document.getElementById('columns-container');
  
  container.className = `col template-${currentSession.template}`;

  // Получаем кастомные заголовки из сессии
  const columnHeaders = currentSession.column_headers ? JSON.parse(currentSession.column_headers) : {};

  // Получаем колонки из template_columns или из шаблона по умолчанию
  let allColumns = [];
  if (currentSession.template_columns && currentSession.template_columns.trim() !== '') {
    try {
      allColumns = JSON.parse(currentSession.template_columns);
    } catch (e) {
      console.error('Error parsing template_columns:', e);
      const template = TEMPLATES[currentSession.template] || TEMPLATES['freeform'];
      allColumns = [...template.columns];
    }
  } else {
    const template = TEMPLATES[currentSession.template] || TEMPLATES['freeform'];
    allColumns = [...template.columns];
  }

  // Добавляем кастомные колонки если их нет в template_columns
  if (currentSession.customColumns) {
    currentSession.customColumns.forEach(customCol => {
      // Проверяем, нет ли уже такой колонки
      if (!allColumns.find(c => c.category === customCol.category)) {
        allColumns.push({
          id: customCol.id,
          name: customCol.name,
          category: customCol.category
        });
      }
    });
  }

  container.innerHTML = allColumns.map((col, index) => {
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

    // Кнопка удаления для пользовательских колонок (только для админа)
    const deleteButton = (col.id && col.id.startsWith('custom_')) && isAdmin ? `
      <button class="btn-delete-column" onclick="deleteCustomColumn('${col.category}')" title="Удалить колонку">
        <span class="material-icons">delete</span>
      </button>` : '';

    // Drag-n-drop для столбцов (только для админа)
    const columnDragAttrs = isAdmin ? `draggable="true" ondragstart="handleColumnStartDrag(event, '${col.category}')" ondragover="handleColumnReorderDragOver(event, '${col.category}')" ondragleave="handleColumnReorderDragLeave(event)" ondrop="handleColumnReorderDrop(event, '${col.category}')"` : '';

    return `
      <div class="retro-column column-${index + 1}" data-category="${col.category}" data-column-id="${col.id || ''}" ${columnDragAttrs} ${dragAttrs}>
        <div class="column-header">
          <h5 class="column-title">
            <span class="material-icons">drag_indicator</span>
            ${columnHeader}
            ${editButton}
            ${deleteButton}
          </h5>
          <span class="column-badge" id="badge-${col.category}">0</span>
        </div>
        <div class="column-items" id="column-${col.category}" data-category="${col.category}" ${columnItemsDragAttrs}>
          <div class="column-items-placeholder" data-category="${col.category}">
            <span class="icon">📥</span>
            <span>Перетащите карточку сюда</span>
          </div>
        </div>
        <button class="add-item-btn mt-3"
                data-category="${col.category}"
                onclick="openAddItemModal('${col.category}')" ${buttonDragAttrs}>
          <span class="material-icons">add</span>
          Добавить элемент
        </button>
        <div class="retro-column-resize-handle" data-category="${col.category}"></div>
      </div>
    `;
  }).join('');

  // Инициализация resize handle для столбцов
  initColumnResize();
}

// Открытие модального окна добавления
function openAddItemModal(category) {
  document.getElementById('item-category').value = category;
  
  const textField = document.getElementById('item-text');
  const memeUrlField = document.getElementById('item-meme-url');
  const emojiField = document.getElementById('item-emoji');
  const emojiPreview = document.getElementById('emoji-preview');
  
  if (textField) textField.value = '';
  if (memeUrlField) memeUrlField.value = '';
  if (emojiField) emojiField.value = '';
  if (emojiPreview) emojiPreview.style.display = 'none';

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

  const modalElement = document.getElementById('addItemModal');
  const modal = new bootstrap.Modal(modalElement);
  modal.show();

  // Перерендериваем мемы при открытии модального окна
  const defaultMeme = { name: 'Meme', url: 'https://lh5.googleusercontent.com/avS6QMu-9IxfATwVoY96o2GHhDWX1Y_VmSV1YU7XgZ-RyOWaRXNoVvdy4mL65ngnY93chePJ5fGciB33wevXxfhnwhtvveg9TxYL54Vs7NTAOoOiBT1v69kZgMjjEvnXusZjqKCh' };
  const allMemes = [defaultMeme, ...globalMemes, ...sessionMemes, ...customMemes];
  renderTextTabMemes(allMemes);

  // Устанавливаем фокус на текстовое поле после показа модального окна
  modalElement.addEventListener('shown.bs.modal', function () {
    if (textField) {
      textField.focus();
    }
  }, { once: true });
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
function insertEmoji(emoji, event) {
  // Предотвращаем потерю фокуса
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  const textarea = document.getElementById('item-text');
  if (!textarea) return;

  // Используем сохранённую позицию курсора или текущую
  const selection = window.getSelection();
  let range;
  
  if (savedSelection) {
    // Используем сохранённую позицию
    selection.removeAllRanges();
    selection.addRange(savedSelection);
    range = savedSelection;
  } else if (selection.rangeCount > 0) {
    range = selection.getRangeAt(0);
    // Проверяем, находится ли range внутри нашего textarea
    if (!textarea.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(textarea);
      range.collapse(false);
    }
  } else {
    range = document.createRange();
    range.selectNodeContents(textarea);
    range.collapse(false);
  }

  range.deleteContents();

  // Вставляем текст смайла
  const textNode = document.createTextNode(emoji);
  range.insertNode(textNode);

  // Перемещаем курсор после смайла
  range.setStartAfter(textNode);
  range.setEndAfter(textNode);
  selection.removeAllRanges();
  selection.addRange(range);
  
  // Сохраняем новую позицию
  savedSelection = range.cloneRange();
  
  // Возвращаем фокус
  textarea.focus();
}

// Вставка мема в текст
function insertMeme(url, name) {
  const textarea = document.getElementById('item-text');
  if (!textarea) return;

  // Вставляем HTML изображение с размерами
  const imgHtml = `<img src="${url}" alt="${name}" style="max-width: 200px; max-height: 100px; border-radius: 6px; margin: 4px; vertical-align: middle; cursor: pointer;" onmouseover="this.style.maxHeight='200px'" onmouseout="this.style.maxHeight='100px'">`;

  // Фокусируемся на textarea
  textarea.focus();

  // Для contenteditable используем document.execCommand или вставку через range
  const selection = window.getSelection();

  // Если нет выделения, создаем range в конце содержимого
  let range;
  if (selection.rangeCount > 0) {
    range = selection.getRangeAt(0);
  } else {
    range = document.createRange();
    range.selectNodeContents(textarea);
    range.collapse(false);
  }

  range.deleteContents();

  // Создаем временный контейнер для HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = imgHtml;

  // Вставляем изображение
  while (tempDiv.firstChild) {
    range.insertNode(tempDiv.firstChild);
  }

  // Перемещаем курсор после изображения
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

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

// Проверка URL мема - показываем предупреждение для Instagram и других сайтов
function checkMemeUrl() {
  const url = document.getElementById('meme-url').value.trim();
  const alertDiv = document.getElementById('meme-warning-alert');
  
  const blockedDomains = ['instagram.com', 'facebook.com', 'fbcdn.net', 'cdninstagram.com', 'twitter.com', 'twimg.com', 'pinterest.com', 'tiktok.com'];
  const isBlocked = blockedDomains.some(domain => url.includes(domain));
  
  if (alertDiv) {
    alertDiv.style.display = isBlocked ? 'block' : 'none';
  }
}

// Добавление мема через прокси (для обхода hotlinking ограничений)
async function addMemeViaProxy() {
  const name = document.getElementById('meme-name').value.trim();
  const url = document.getElementById('meme-url').value.trim();

  if (!name || !url) {
    showToast('Введите название и URL мема', 'warning');
    return;
  }

  // Используем CORS proxy для загрузки изображения
  // В production можно использовать свой серверный прокси
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  
  showToast('Загрузка через прокси...', 'info');

  try {
    // Пробуем загрузить изображение через прокси
    const response = await fetch(proxyUrl);
    const blob = await response.blob();
    
    // Проверяем, что это изображение
    const contentType = blob.type;
    if (!contentType.startsWith('image/')) {
      showToast('Ошибка: URL не является изображением', 'danger');
      return;
    }

    // Конвертируем blob в base64 для отображения
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result;
      
      // Сохраняем base64 изображение
      fetch(`/api/memes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          url: base64Data,
          createdBy: currentUserId,
          sessionId: currentSession?.id
        })
      })
      .then(response => response.json())
      .then(meme => {
        console.log('[Meme] Added meme via proxy:', meme);
        showToast('Мем добавлен через прокси!', 'success');
        document.getElementById('meme-name').value = '';
        document.getElementById('meme-url').value = '';
        const modal = bootstrap.Modal.getInstance(document.getElementById('addMemeModal'));
        if (modal) modal.hide();
      })
      .catch(error => {
        console.error('Error adding meme via proxy:', error);
        showToast('Ошибка добавления мема', 'danger');
      });
    };
    reader.readAsDataURL(blob);
  } catch (error) {
    console.error('Error loading via proxy:', error);
    showToast('Ошибка загрузки через прокси', 'danger');
  }
}

// Подтверждение удаления глобального мема
function confirmDeleteGlobalMeme(index) {
  const meme = globalMemes[index];
  if (!meme) return;

  const modal = new bootstrap.Modal(document.getElementById('deleteMemeConfirmModal'));
  document.getElementById('delete-meme-message').textContent = `Удалить мем "${meme.name}" из глобального списка?`;
  document.getElementById('delete-meme-url').value = meme.url;
  document.getElementById('delete-meme-type').value = 'global';
  
  const confirmBtn = document.getElementById('confirm-delete-meme-btn');
  confirmBtn.onclick = () => {
    deleteGlobalMeme(index);
    modal.hide();
  };
  
  modal.show();
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

// Удаление мема сессии
function deleteSessionMeme(index) {
  const meme = sessionMemes[index];
  if (!meme) return;

  fetch(`/api/sessions/${currentSession.id}/memes/${meme.id}`, {
    method: 'DELETE'
  })
  .then(response => {
    if (response.ok) {
      sessionMemes.splice(index, 1);
      renderQuickMemesButtons();
      renderCustomMemesList();
      showToast('Мем удалён из сессии', 'success');
    } else {
      showToast('Ошибка удаления мема', 'danger');
    }
  })
  .catch(error => {
    console.error('Error deleting session meme:', error);
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

  container.innerHTML = allMemes.map((meme, index) => {
    // Определяем тип мема
    let memeType = 'custom';
    if (index < 1 + globalMemes.length) {
      memeType = index === 0 ? 'default' : 'global';
    } else if (index < 1 + globalMemes.length + sessionMemes.length) {
      memeType = 'session';
    }
    
    // Для админа добавляем контекстное меню
    const contextMenuAttr = isAdmin ? `oncontextmenu="showMemeContextMenu(event, '${meme.url}', '${memeType}')"` : '';
    
    return `<img src="${meme.url}" class="meme-preview" onclick="insertMeme('${meme.url}', '${escapeHtml(meme.name)}')" title="${escapeHtml(meme.name)}" ${contextMenuAttr}>`;
  }).join('');
}

// Показать контекстное меню для мема
function showMemeContextMenu(event, memeUrl, memeType) {
  event.preventDefault();
  event.stopPropagation();
  
  // Показываем контекстное меню только для админа
  if (!isAdmin) return;
  
  // Удаляем существующее меню если есть
  const existingMenu = document.querySelector('.meme-context-menu');
  if (existingMenu) {
    existingMenu.remove();
  }
  
  // Создаём контекстное меню
  const menu = document.createElement('div');
  menu.className = 'meme-context-menu';
  menu.innerHTML = `
    <div class="meme-context-menu-item" onclick="copyMemeUrl('${escapeHtml(memeUrl)}')">
      <span class="material-icons">content_copy</span>
      Копировать URL
    </div>
    <div class="meme-context-menu-item delete" onclick="confirmDeleteMemeFromContext('${escapeHtml(memeUrl)}', '${memeType}')">
      <span class="material-icons">delete</span>
      Удалить мем
    </div>
  `;
  
  // Позиционируем меню
  menu.style.left = event.pageX + 'px';
  menu.style.top = event.pageY + 'px';
  
  // Корректируем позицию чтобы меню не уходило за экран
  const rect = menu.getBoundingClientRect();
  if (event.pageX + rect.width > window.innerWidth) {
    menu.style.left = (event.pageX - rect.width) + 'px';
  }
  if (event.pageY + rect.height > window.innerHeight) {
    menu.style.top = (event.pageY - rect.height) + 'px';
  }
  
  document.body.appendChild(menu);
  
  // Сохраняем URL и тип для удаления
  menu.dataset.memeUrl = memeUrl;
  menu.dataset.memeType = memeType;
}

// Копировать URL мема
function copyMemeUrl(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('URL скопирован в буфер обмена', 'success');
  }).catch(() => {
    showToast('Не удалось скопировать URL', 'warning');
  });
  closeMemeContextMenu();
}

// Подтверждение удаления мема из контекстного меню
function confirmDeleteMemeFromContext(memeUrl, memeType) {
  closeMemeContextMenu();
  
  // Находим индекс мема и вызываем подтверждение
  let index = -1;
  
  if (memeType === 'global') {
    index = globalMemes.findIndex(m => m.url === memeUrl);
    if (index >= 0) {
      confirmDeleteGlobalMeme(index);
    }
  } else if (memeType === 'session') {
    index = sessionMemes.findIndex(m => m.url === memeUrl);
    if (index >= 0) {
      confirmDeleteSessionMeme(index);
    }
  } else if (memeType === 'custom') {
    index = customMemes.findIndex(m => m.url === memeUrl);
    if (index >= 0) {
      confirmDeleteCustomMemeLocal(index);
    }
  } else {
    showToast('Этот мем нельзя удалить', 'warning');
  }
}

// Закрыть контекстное меню
function closeMemeContextMenu() {
  const menu = document.querySelector('.meme-context-menu');
  if (menu) {
    menu.remove();
  }
}

// Закрытие контекстного меню при клике вне его
document.addEventListener('click', () => {
  closeMemeContextMenu();
});

document.addEventListener('scroll', () => {
  closeMemeContextMenu();
});

// Подтверждение удаления локального мема
function confirmDeleteCustomMemeLocal(index) {
  const meme = customMemes[index];
  if (!meme) return;
  
  const modal = new bootstrap.Modal(document.getElementById('deleteMemeConfirmModal'));
  document.getElementById('delete-meme-message').textContent = `Удалить мем "${meme.name}" из локального списка?`;
  document.getElementById('delete-meme-url').value = meme.url;
  document.getElementById('delete-meme-type').value = 'custom';
  
  const confirmBtn = document.getElementById('confirm-delete-meme-btn');
  confirmBtn.onclick = () => {
    deleteCustomMemeLocal(index);
    modal.hide();
  };
  
  modal.show();
}

// Удаление локального мема
function deleteCustomMemeLocal(index) {
  const meme = customMemes[index];
  if (!meme) return;
  
  customMemes.splice(index, 1);
  localStorage.setItem('customMemes', JSON.stringify(customMemes));
  renderQuickMemesButtons();
  showToast('Мем удалён из локального списка', 'success');
}

// Подтверждение удаления мема сессии
function confirmDeleteSessionMeme(index) {
  const meme = sessionMemes[index];
  if (!meme) return;
  
  const modal = new bootstrap.Modal(document.getElementById('deleteMemeConfirmModal'));
  document.getElementById('delete-meme-message').textContent = `Удалить мем "${meme.name}" из сессии?`;
  document.getElementById('delete-meme-url').value = meme.url;
  document.getElementById('delete-meme-type').value = 'session';
  
  const confirmBtn = document.getElementById('confirm-delete-meme-btn');
  confirmBtn.onclick = () => {
    deleteSessionMeme(index);
    modal.hide();
  };
  
  modal.show();
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
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    showToast('Режим только для просмотра', 'warning');
    return;
  }

  const category = document.getElementById('item-category').value;
  const itemTextDiv = document.getElementById('item-text');
  const memeUrlInput = document.getElementById('item-meme-url');
  const emojiInput = document.getElementById('item-emoji');

  const memeUrl = memeUrlInput ? memeUrlInput.value.trim() : '';
  const emoji = emojiInput ? emojiInput.value : '';

  // Получаем HTML и текст из contenteditable div
  const htmlContent = itemTextDiv.innerHTML.trim();
  const textContent = itemTextDiv.innerText.trim();

  // Извлекаем все URL изображений из HTML
  const imgRegex = /<img[^>]+src="([^"]+)"/g;
  const imgMatches = [...htmlContent.matchAll(imgRegex)];
  const imageUrls = imgMatches.map(match => match[1]);
  const imageAlts = imgMatches.map(match => {
    const altMatch = match[0].match(/alt="([^"]*)"/);
    return altMatch ? altMatch[1] : 'Мем';
  });

  let type = 'text';
  let content = '';
  let memeUrlToSend = null;

  // Если есть изображения в contenteditable
  if (imageUrls.length > 0) {
    type = 'meme';
    memeUrlToSend = imageUrls[0];

    // Сохраняем текст + markdown изображения
    // Сначала заменяем <br> на \n
    let markdownContent = htmlContent.replace(/<br\s*\/?>/gi, '\n');

    // Сохраняем разделитель объединённых карточек перед удалением HTML тегов
    markdownContent = markdownContent.replace(/<hr[^>]*class="item-divider"[^>]*>/gi, '\n\n─────────────\n\n');

    // Заменяем все img на markdown с правильным форматом
    markdownContent = markdownContent
      .replace(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/g, '![$2]($1)')
      .replace(/<img[^>]+src="([^"]+)"[^>]*>/g, '![Мем]($1)');

    // Удаляем остальные HTML теги, сохраняя markdown
    content = markdownContent
      .replace(/<[^>]+>/g, '') // Удаляем все HTML теги
      .replace(/&nbsp;/g, ' ')
      .trim();
  } else if (memeUrl) {
    // Если выбран мем во вкладке "Мем"
    type = 'meme';
    content = memeUrl;
    memeUrlToSend = memeUrl;
  } else if (emoji && !textContent) {
    // Только смайл
    type = 'emoji';
    content = emoji;
  } else if (textContent) {
    // Только текст
    type = 'text';
    content = textContent;
  } else {
    showToast('Введите текст идеи или выберите смайл/мем', 'warning');
    return;
  }

  // Проверяем, редактируем ли мы существующий элемент
  const editItemId = itemTextDiv.dataset.editItemId;

  try {
    let response;
    let item;

    if (editItemId) {
      // Режим редактирования - обновляем существующий элемент
      response = await fetch(`/api/sessions/${currentSession.id}/items/${editItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: content,
          category,
          type,
          meme_url: type === 'meme' ? memeUrlToSend : null,
          emoji: type === 'emoji' ? emoji : null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update item');
      }

      item = await response.json();

      // Обновляем UI
      updateItemInColumn(item);

      // Обновляем в currentSession.items
      if (currentSession?.items) {
        const index = currentSession.items.findIndex(i => i.id === editItemId);
        if (index >= 0) {
          currentSession.items[index] = item;
        }
      }

      // Очищаем атрибут редактирования
      delete itemTextDiv.dataset.editItemId;

      showToast('Элемент обновлен!', 'success');
    } else {
      // Режим создания - создаем новый элемент
      // Вычисляем порядок - количество элементов в категории + 1
      const column = document.getElementById(`column-${category}`);
      const existingItems = column ? column.querySelectorAll('.retro-item').length : 0;
      const order = existingItems;

      response = await fetch(`/api/sessions/${currentSession.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: content,
          category,
          author: currentUserId.replace(/^(admin_|user_)/, ''),
          type,
          meme_url: type === 'meme' ? memeUrlToSend : null,
          emoji: type === 'emoji' ? emoji : null,
          order
        })
      });

      item = await response.json();

      // Добавляем элемент в UI сразу, не дожидаясь WebSocket события
      addItemToColumn(item);
      // Помечаем элемент как добавленный (для предотвращения дубликатов)
      addedItems.add(item.id);
      
      // Добавляем в currentSession.items
      if (currentSession?.items) {
        currentSession.items.push(item);
      }

      showToast('Элемент добавлен!', 'success');
    }

    // Очищаем форму
    itemTextDiv.innerHTML = '';
    itemTextDiv.innerText = '';
    if (memeUrlInput) memeUrlInput.value = '';
    if (emojiInput) emojiInput.value = '';
    document.getElementById('emoji-preview').style.display = 'none';
    document.querySelectorAll('.emoji-btn').forEach(btn => btn.classList.remove('selected'));

    const modal = bootstrap.Modal.getInstance(document.getElementById('addItemModal'));
    if (modal) modal.hide();

  } catch (error) {
    console.error('Error:', error);
    showToast('Ошибка: ' + error.message, 'danger');
  }
}

// Добавление элемента в колонку
function addItemToColumn(item) {
  const column = document.getElementById(`column-${item.category}`);
  if (!column) {
    console.error('[UI] Column not found:', item.category);
    return;
  }

  // Проверяем, нет ли уже такого элемента в колонках (не в обсуждении)
  const existingElement = column.querySelector(`#item-${item.id}`);
  if (existingElement) {
    console.log('[UI] Item already exists in column, skipping:', item.id);
    return;
  }

  console.log('[UI] Adding item to column:', { id: item.id, category: item.category, text: item.text?.substring(0, 50), author: item.author });

  const itemHtml = createItemHtml(item);
  column.insertAdjacentHTML('beforeend', itemHtml);

  const newElement = document.getElementById(`item-${item.id}`);
  if (newElement) {
    initDraggable(newElement);
    console.log('[UI] Item added and draggable initialized:', item.id);
    // Применяем настройки отображения (скрытие карточек)
    applyViewSettings();
    // Применяем режим голосования (показываем кнопки голосования если есть голоса)
    applyVoteMode();
    // Обновляем счётчик после добавления элемента
    updateColumnCount(item.category);
  } else {
    console.error('[UI] Failed to find added element:', item.id);
  }
}

// Получение названия категории
function getCategoryName(category) {
  const categories = {
    'start': '🚀 Начать делать',
    'stop': '🛑 Перестать делать',
    'continue': '✅ Продолжать делать',
    'mad': '😡 Mad',
    'sad': '😢 Sad',
    'glad': '😄 Glad',
    'good': '👍 Good',
    'bad': '👎 Bad',
    'ideas': '💡 Ideas',
    'keep': '✅ Keep',
    'improve': '🔧 Improve',
    'start': '🚀 Start',
    'sailboat': '⛵ Sailboat',
    'wind': '💨 Wind',
    'anchor': '⚓ Anchor',
    'rocks': '🪨 Rocks',
    'island': '🏝️ Island',
    'general': '📋 General'
  };
  return categories[category] || category || '📋';
}

// Форматирование текста плана действий
function formatActionPlan(itemId, command, value = null) {
  const editor = document.querySelector(`.action-plan-editor[data-item-id="${itemId}"]`);
  if (!editor) return;
  
  // Сохраняем выделение перед форматированием
  const selection = window.getSelection();
  let range = null;
  if (selection.rangeCount > 0) {
    range = selection.getRangeAt(0);
  }
  
  // Фокусируемся на редакторе
  editor.focus();
  
  // Восстанавливаем выделение если было
  if (range) {
    selection.removeAllRanges();
    selection.addRange(range);
  }
  
  // Выполняем команду форматирования
  document.execCommand(command, false, value);
  
  // Сохраняем план действий
  saveActionPlan(itemId, 'text');
}

// Сброс форматирования плана действий
function resetActionPlanFormat(itemId) {
  const editor = document.querySelector(`.action-plan-editor[data-item-id="${itemId}"]`);
  if (editor) {
    // Сбрасываем всё форматирование
    document.execCommand('removeFormat', false, null);
    document.execCommand('fontName', false, 'Arial');
    document.execCommand('fontSize', false, '3');
    document.execCommand('foreColor', false, '#000000');
    editor.focus();
    saveActionPlan(itemId, 'text');
  }
}

// Выбор карточки для редактирования плана действий
let selectedActionPlanItemId = null;

function selectActionPlanItem(itemId) {
  selectedActionPlanItemId = itemId;
  
  // Подсвечиваем выбранную карточку
  document.querySelectorAll('.discussion-item').forEach(el => {
    el.classList.remove('selected');
  });
  const selectedEl = document.querySelector(`.discussion-item[data-id="${itemId}"]`);
  if (selectedEl) {
    selectedEl.classList.add('selected');
  }
}

// Сохранение плана действий
let saveActionPlanTimeout = null;

// Сохранение плана действий в localStorage для резервного копирования
function saveActionPlanToLocalStorage(itemId, data) {
  if (!currentSession) return;
  
  const storageKey = `actionPlan_${currentSession.id}_${itemId}`;
  const saveData = {
    action_plan_text: data.action_plan_text || '',
    action_plan_who: data.action_plan_who || '',
    action_plan_when: data.action_plan_when || '',
    savedAt: Date.now()
  };
  localStorage.setItem(storageKey, JSON.stringify(saveData));
  console.log('[ActionPlan Local] Saved to localStorage:', storageKey);
}

// Восстановление плана действий из localStorage
function restoreActionPlanFromLocalStorage(itemId) {
  if (!currentSession) return null;
  
  const storageKey = `actionPlan_${currentSession.id}_${itemId}`;
  const savedData = localStorage.getItem(storageKey);
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      console.log('[ActionPlan Local] Restored from localStorage:', storageKey);
      return parsed;
    } catch (e) {
      console.error('[ActionPlan Local] Failed to parse saved data:', e);
    }
  }
  return null;
}

// Удаление плана действий из localStorage после успешной синхронизации
function removeActionPlanFromLocalStorage(itemId) {
  if (!currentSession) return;
  
  const storageKey = `actionPlan_${currentSession.id}_${itemId}`;
  localStorage.removeItem(storageKey);
  console.log('[ActionPlan Local] Removed from localStorage:', storageKey);
}

// Очистка всех планов действий сессии из localStorage
function clearAllActionPlansFromLocalStorage(sessionId) {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`actionPlan_${sessionId}_`)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
  console.log('[ActionPlan Local] Cleared all action plans for session:', sessionId);
}

async function saveActionPlan(itemId, field = 'text', value = null, realtime = false) {
  // Блокируем в режиме просмотра
  if (isViewOnly) return;

  if (saveActionPlanTimeout && !realtime) {
    clearTimeout(saveActionPlanTimeout);
  }

  const doSave = async () => {
    try {
      const editor = document.querySelector(`.action-plan-editor[data-item-id="${itemId}"]`);
      const wrapper = editor?.closest('.discussion-item-plan') || editor?.closest('.action-plan-section');
      const inputs = wrapper?.querySelectorAll(`input[data-item-id="${itemId}"]`) || [];
      const whoInput = inputs[0];
      const whenInput = inputs[1];

      // Получаем текущие значения из DOM, если они не переданы напрямую
      const currentText = editor?.innerHTML || '';
      const currentWho = whoInput?.value || '';
      const currentWhen = whenInput?.value || '';

      const data = {
        // Сохраняем HTML с форматированием
        action_plan_text: field === 'text' ? (value !== null ? value : currentText) : currentText,
        action_plan_who: field === 'who' ? (value !== null ? value : currentWho) : currentWho,
        action_plan_when: field === 'when' ? (value !== null ? value : currentWhen) : currentWhen
      };

      console.log('[ActionPlan] Saving data:', { itemId, data });

      // Сначала сохраняем в localStorage для резервного копирования
      saveActionPlanToLocalStorage(itemId, data);

      // Отправляем на сервер для сохранения в БД
      const response = await fetch(`/api/sessions/${currentSession.id}/items/${itemId}/action-plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ActionPlan] Save failed:', response.status, errorText);
        throw new Error(`Save failed: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('[ActionPlan] Server response:', result);

      // Обновляем локально
      const item = currentSession?.items?.find(i => i.id === itemId);
      if (item) {
        if (result.action_plan_text !== undefined) item.action_plan_text = result.action_plan_text;
        if (result.action_plan_who !== undefined) item.action_plan_who = result.action_plan_who;
        if (result.action_plan_when !== undefined) item.action_plan_when = result.action_plan_when;
      }

      // Отправляем через WebSocket для real-time обновления у других пользователей
      socket.emit('action-plan:update', {
        sessionId: currentSession.id,
        itemId,
        userId: currentUserId,
        action_plan_text: result.action_plan_text,
        action_plan_who: result.action_plan_who,
        action_plan_when: result.action_plan_when
      });

      // После успешного сохранения в БД удаляем из localStorage
      removeActionPlanFromLocalStorage(itemId);

      console.log('[ActionPlan] Saved successfully:', { itemId, field, who: data.action_plan_who, when: data.action_plan_when });
    } catch (error) {
      console.error('[ActionPlan] Error saving:', error);
      // Данные уже сохранены в localStorage, попробуем позже
      showToast('Ошибка сохранения. Данные сохранены локально.', 'warning');
    }
  };

  if (realtime) {
    // Realtime - сохраняем сразу в БД и отправляем WebSocket
    doSave();
  } else {
    // Отложенное сохранение
    saveActionPlanTimeout = setTimeout(doSave, 500);
  }
}

// Сохранение при расфокусировке редактора (только текст!)
function handleActionPlanBlur(itemId) {
  // Не сохраняем здесь — saveActionPlan с realtime=true уже вызвался на oninput
  console.log('[ActionPlan] Text blur (already saved on input):', itemId);
}

// Сохранение при расфокусировке поля "Кому" (вызывается с event)
function handleActionPlanWhoBlur(event, itemId) {
  const input = event.target;
  const wrapper = input.closest('.discussion-item-plan') || input.closest('.action-plan-section');
  const editor = wrapper?.querySelector(`.action-plan-editor[data-item-id="${itemId}"]`);
  const inputs = wrapper?.querySelectorAll(`input[data-item-id="${itemId}"]`) || [];
  const whoInput = inputs[0];
  const whenInput = inputs[1];

  // Помечаем что только что сохранили
  if (editor) editor.dataset.justSaved = 'true';
  input.dataset.justSaved = 'true';
  if (whenInput) whenInput.dataset.justSaved = 'true';
  
  // Получаем текущие значения из DOM
  const text = editor?.innerHTML || '';
  const who = whoInput?.value || '';
  const when = whenInput?.value || '';
  
  // Обновляем item сразу чтобы автосохранение не видело "изменений"
  const item = currentSession?.items?.find(i => i.id === itemId);
  if (item) {
    item.action_plan_text = text;
    item.action_plan_who = who;
    item.action_plan_when = when;
  }
  
  // Сохраняем все поля с текущими значениями
  saveActionPlanOnBlur(itemId, text, who, when);
}

// Сохранение при расфокусировке поля "Когда" (вызывается с event)
function handleActionPlanWhenBlur(event, itemId) {
  const input = event.target;
  const wrapper = input.closest('.discussion-item-plan') || input.closest('.action-plan-section');
  const editor = wrapper?.querySelector(`.action-plan-editor[data-item-id="${itemId}"]`);
  const inputs = wrapper?.querySelectorAll(`input[data-item-id="${itemId}"]`) || [];
  const whoInput = inputs[0];
  const whenInput = inputs[1];

  // Помечаем что только что сохранили
  if (editor) editor.dataset.justSaved = 'true';
  if (whoInput) whoInput.dataset.justSaved = 'true';
  input.dataset.justSaved = 'true';
  
  // Получаем текущие значения из DOM
  const text = editor?.innerHTML || '';
  const who = whoInput?.value || '';
  const when = whenInput?.value || '';
  
  // Обновляем item сразу чтобы автосохранение не видело "изменений"
  const item = currentSession?.items?.find(i => i.id === itemId);
  if (item) {
    item.action_plan_text = text;
    item.action_plan_who = who;
    item.action_plan_when = when;
  }
  
  // Сохраняем все поля с текущими значениями
  saveActionPlanOnBlur(itemId, text, who, when);
}

// Функция сохранения при blur (отправляет на сервер и обновляет локально)
async function saveActionPlanOnBlur(itemId, text, who, when) {
  try {
    const item = currentSession?.items?.find(i => i.id === itemId);
    
    console.log('[ActionPlan] Before save:', { itemId, text: text?.substring(0, 50), who, when });
    
    // Формируем данные для отправки
    const data = {
      action_plan_text: text,
      action_plan_who: who,
      action_plan_when: when
    };

    // Отправляем на сервер
    const res = await fetch(`/api/sessions/${currentSession.id}/items/${itemId}/action-plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await res.json();
    console.log('[ActionPlan] Server response:', result);

    // Обновляем локально — это критично чтобы автосохранение не видело "изменений"
    if (item) {
      if (result.action_plan_text !== undefined) item.action_plan_text = result.action_plan_text;
      if (result.action_plan_who !== undefined) item.action_plan_who = result.action_plan_who;
      if (result.action_plan_when !== undefined) item.action_plan_when = result.action_plan_when;
    }

    // Отправляем через WebSocket для real-time обновления у других пользователей
    socket.emit('action-plan:update', {
      sessionId: currentSession.id,
      itemId,
      userId: currentUserId,
      action_plan_text: result.action_plan_text,
      action_plan_who: result.action_plan_who,
      action_plan_when: result.action_plan_when
    });

    console.log('[ActionPlan] Saved on blur:', itemId, data);
  } catch (error) {
    console.error('[ActionPlan] Error saving on blur:', error);
  }
}

// Автосохранение планов действий каждые 3 секунды
let actionPlanAutoSaveInterval = null;

function startActionPlanAutoSave() {
  // Очищаем предыдущий интервал если есть
  if (actionPlanAutoSaveInterval) {
    clearInterval(actionPlanAutoSaveInterval);
  }

  actionPlanAutoSaveInterval = setInterval(async () => {
    if (!currentSession || currentTab !== 'discussion') return;

    // Находим все редакторы планов действий
    const editors = document.querySelectorAll('.action-plan-editor');
    for (const editor of editors) {
      const itemId = editor.dataset.itemId;
      if (!itemId) continue;

      const item = currentSession?.items?.find(i => i.id === itemId);
      if (!item) continue;

      // Пропускаем если только что сохранили через blur
      if (editor.dataset.justSaved === 'true') {
        delete editor.dataset.justSaved;
        continue;
      }

      // Используем innerHTML для сохранения форматирования
      const currentHtml = editor.innerHTML;
      // Ищем input в том же wrapper
      const wrapper = editor.closest('.discussion-item-plan') || editor.closest('.action-plan-section');
      const inputs = wrapper?.querySelectorAll(`input[data-item-id="${itemId}"]`) || [];
      const whoInput = inputs[0];
      const whenInput = inputs[1];

      // Пропускаем если input только что сохранили
      if (whoInput?.dataset.justSaved === 'true') delete whoInput.dataset.justSaved;
      if (whenInput?.dataset.justSaved === 'true') delete whenInput.dataset.justSaved;

      // Проверяем есть ли изменения (сравниваем с item, а не с '')
      const hasChanges = currentHtml !== (item.action_plan_text || '') ||
                        (whoInput && whoInput.value !== (item.action_plan_who || '')) ||
                        (whenInput && whenInput.value !== (item.action_plan_when || ''));

      if (!hasChanges) continue;

      try {
        const data = {
          action_plan_text: currentHtml !== '' ? currentHtml : (item.action_plan_text || null),
          action_plan_who: whoInput ? (whoInput.value !== '' ? whoInput.value : (item.action_plan_who || null)) : null,
          action_plan_when: whenInput ? (whenInput.value !== '' ? whenInput.value : (item.action_plan_when || null)) : null
        };

        // Сначала сохраняем в localStorage для резервного копирования
        saveActionPlanToLocalStorage(itemId, data);

        const response = await fetch(`/api/sessions/${currentSession.id}/items/${itemId}/action-plan`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[ActionPlan] Auto-save failed:', response.status, errorText);
          throw new Error(`Auto-save failed: ${response.status} ${errorText}`);
        }

        const result = await response.json();

        // Обновляем локально
        if (result.action_plan_text !== undefined) item.action_plan_text = result.action_plan_text;
        if (result.action_plan_who !== undefined) item.action_plan_who = result.action_plan_who;
        if (result.action_plan_when !== undefined) item.action_plan_when = result.action_plan_when;

        // Отправляем через WebSocket для real-time обновления у других пользователей
        socket.emit('action-plan:update', {
          sessionId: currentSession.id,
          itemId,
          userId: currentUserId,
          action_plan_text: result.action_plan_text,
          action_plan_who: result.action_plan_who,
          action_plan_when: result.action_plan_when
        });

        // После успешного сохранения в БД удаляем из localStorage
        removeActionPlanFromLocalStorage(itemId);

        console.log('[ActionPlan] Auto-saved:', itemId, { who: whoInput?.value, when: whenInput?.value });
      } catch (error) {
        console.error('[ActionPlan] Auto-save error:', error);
        // Данные уже сохранены в localStorage, попробуем позже
      }
    }
  }, 3000); // Каждые 3 секунды

  console.log('[ActionPlan] Auto-save started');
}

function stopActionPlanAutoSave() {
  if (actionPlanAutoSaveInterval) {
    clearInterval(actionPlanAutoSaveInterval);
    actionPlanAutoSaveInterval = null;
    console.log('[ActionPlan] Auto-save stopped');
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
  if (item.type === 'meme' || (item.text && /!\[(.*?)\]\((.*?)\)/g.test(item.text))) {
    // Для типа meme или текста с markdown картинками
    // Проверяем, есть ли в тексте markdown картинки
    const hasMarkdownImages = /!\[(.*?)\]\((.*?)\)/g.test(item.text || '');

    if (hasMarkdownImages) {
      // Рендерим как смешанный контент - текст + картинки
      let processedText = escapeHtml(item.text || '');
      const parts = processedText.split(/(!\[.*?\]\(.*?\))/g);
      content = '<div class="retro-item-mixed-content">';
      parts.forEach(part => {
        const imgMatch = part.match(/!\[(.*?)\]\((.*?)\)/);
        if (imgMatch) {
          content += `<img src="${imgMatch[2]}" alt="${imgMatch[1]}" class="retro-item-meme" data-meme-src="${imgMatch[2]}">`;
        } else {
          // Обрабатываем переносы строк и разделители
          const textPart = part
            .replace(/─────────────/g, '<hr class="item-divider">')
            .replace(/\n/g, '<br>');
          if (textPart.trim()) {
            content += `<p class="retro-item-text">${textPart}</p>`;
          }
        }
      });
      content += '</div>';
    } else if (item.type === 'meme') {
      // Только мем без текста
      let memeUrl = item.meme_url || item.text || '';
      content = `<img src="${memeUrl}" alt="Meme" class="retro-item-meme" data-meme-src="${memeUrl}" onerror="this.style.display='none'">`;
    }
  } else if (item.type === 'emoji') {
    content = `<div class="retro-item-emoji">${item.text}</div>`;
  } else {
    // Преобразуем \n в <br> для отображения переносов строк
    let processedText = escapeHtml(item.text);
    const textClass = 'retro-item-text';
    const textWithBreaks = processedText.replace(/\n/g, '<br>');
    content = `<p class="${textClass}">${textWithBreaks}</p>`;
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

  // Проверяем, является ли карточка объединённой (содержит разделитель)
  const isMerged = item.text && item.text.includes('─────────────');
  const mergedBadge = isMerged ? `<span class="merged-badge" title="Объединённая карточка (можно разъединить)"><span class="material-icons" style="font-size: 12px;">call_merge</span></span>` : '';

  // Проверяем, может ли пользователь редактировать карточку
  // Для объединённых карточек - только админ, для обычных - создатель или админ
  const canEdit = isAdmin || (!isMerged && currentUserId && currentUserId.replace(/^(admin_|user_)/, '') === author);

  // Чекбокс для обсуждения (показывается после завершения сессии ИЛИ после выключения голосования для админа)
  const showDiscussionCheckbox = sessionEnded || (isAdmin && votingStarted && !voteMode);
  const discussionCheckbox = showDiscussionCheckbox ? `
    <label class="discussion-checkbox" title="Добобавить в обсуждение">
      <input type="checkbox" class="form-check-input" data-item-id="${item.id}"
             ${selectedDiscussionItems.has(item.id) ? 'checked' : ''}
             onchange="toggleDiscussionItem('${item.id}')">
      <span class="material-icons" style="font-size: 16px;">forum</span>
    </label>
  ` : '';

  // Кнопка редактирования
  const editButton = canEdit ? `
    <button class="item-action-btn" onclick="editItem('${item.id}')" title="Редактировать">
      <span class="material-icons" style="font-size: 16px;">edit</span>
    </button>
  ` : '';

  // Кнопка разделения показывается только для объединённых карточек
  const splitButton = (isAdmin && isMerged && !sessionEnded) ? `
    <button class="item-action-btn split" onclick="splitItem('${item.id}')" title="Разъединить карточку">
      <span class="material-icons" style="font-size: 16px;">call_split</span>
    </button>
  ` : '';

  return `
    <div class="retro-item status-${item.status} ${isMerged ? 'merged-item' : ''} ${currentTab === 'discussion' ? 'discussion-item' : ''}" id="item-${item.id}" data-id="${item.id}" data-order="${item.order || 0}" data-category="${item.category || ''}" draggable="${currentTab !== 'discussion'}">
      <div class="retro-item-header">
        ${discussionCheckbox}
        ${currentTab === 'discussion' ? `
          <div class="category-badge-full" title="Категория: ${escapeHtml(item.category || '')}">
            <span class="material-icons" style="font-size: 24px;">label</span>
            <strong style="font-size: 18px;">${getCategoryName(item.category)}</strong>
          </div>
        ` : ''}
        <span class="retro-item-author">
          <span class="material-icons" style="font-size: 14px;">person</span>
          ${escapeHtml(author)}
        </span>
        <div style="display: flex; align-items: center; gap: 4px;">
          ${mergedBadge}
          <small class="text-muted">${new Date(item.created_at).toLocaleString()}</small>
        </div>
      </div>
      ${content}
      <div class="retro-item-footer">
        ${reactionsHtml}
        <div class="item-actions">
          ${editButton}
          ${isAdmin ? splitButton : ''}
          ${isAdmin ? `
            <button class="item-action-btn delete" onclick="deleteItem('${item.id}')" title="Удалить">
              <span class="material-icons" style="font-size: 16px;">delete</span>
            </button>
          ` : ''}
        </div>
      </div>
      ${currentTab === 'discussion' ? `
        <div class="action-plan-section" style="display:none;">
          <div class="action-plan-header">
            <span class="material-icons" style="font-size: 16px;">assignment</span>
            <strong>План действий</strong>
          </div>
          <div class="action-plan-toolbar" id="toolbar-${item.id}">
            <button class="toolbar-btn" type="button" onclick="event.stopPropagation(); formatActionPlan('${item.id}', 'bold')" title="Жирный">
              <span class="material-icons">format_bold</span>
            </button>
            <button class="toolbar-btn" type="button" onclick="event.stopPropagation(); formatActionPlan('${item.id}', 'italic')" title="Курсив">
              <span class="material-icons">format_italic</span>
            </button>
            <button class="toolbar-btn" type="button" onclick="event.stopPropagation(); formatActionPlan('${item.id}', 'underline')" title="Подчёркнутый">
              <span class="material-icons">format_underlined</span>
            </button>
            <button class="toolbar-btn reset-btn" type="button" onclick="event.stopPropagation(); resetActionPlanFormat('${item.id}')" title="Сбросить форматирование">
              <span class="material-icons">format_clear</span>
            </button>
            <select class="toolbar-select" onclick="event.stopPropagation();" onchange="formatActionPlan('${item.id}', 'fontName', this.value)" title="Шрифт">
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
              <option value="Georgia">Georgia</option>
              <option value="Verdana">Verdana</option>
            </select>
            <select class="toolbar-select" onclick="event.stopPropagation();" onchange="formatActionPlan('${item.id}', 'fontSize', this.value)" title="Размер">
              <option value="1">Маленький</option>
              <option value="3" selected>Средний</option>
              <option value="5">Большой</option>
              <option value="7">Огромный</option>
            </select>
            <input type="color" class="toolbar-color" onclick="event.stopPropagation();" onchange="formatActionPlan('${item.id}', 'foreColor', this.value)" title="Цвет текста" value="#000000">
          </div>
          <div class="action-plan-editor" contenteditable="true"
               data-item-id="${item.id}"
               oninput="saveActionPlan('${item.id}', 'text', null, true)"
               onblur="handleActionPlanBlur('${item.id}')"
               placeholder="Введите план действий...">${item.action_plan_text || ''}</div>
          <div class="action-plan-fields">
            <div class="action-plan-field">
              <label><span class="material-icons" style="font-size: 14px;">person</span> Кому:</label>
              <input type="text" class="form-control form-control-sm"
                     data-item-id="${item.id}"
                     value="${item.action_plan_who || ''}"
                     onblur="handleActionPlanWhoBlur(event, '${item.id}')"
                     placeholder="ФИО ответственного">
            </div>
            <div class="action-plan-field">
              <label><span class="material-icons" style="font-size: 14px;">event</span> Когда:</label>
              <input type="text" class="form-control form-control-sm"
                     data-item-id="${item.id}"
                     value="${item.action_plan_when || ''}"
                     onblur="handleActionPlanWhenBlur(event, '${item.id}')"
                     placeholder="Срок выполнения">
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// Создание HTML для карточки в обсуждении (без ID чтобы избежать дубликатов)
function createDiscussionItemHtml(item) {
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
  if (item.type === 'meme' || (item.text && /!\[(.*?)\]\((.*?)\)/g.test(item.text))) {
    const hasMarkdownImages = /!\[(.*?)\]\((.*?)\)/g.test(item.text || '');

    if (hasMarkdownImages) {
      let processedText = escapeHtml(item.text || '');
      const parts = processedText.split(/(!\[.*?\]\(.*?\))/g);
      content = '<div class="retro-item-mixed-content">';
      parts.forEach(part => {
        const imgMatch = part.match(/!\[(.*?)\]\((.*?)\)/);
        if (imgMatch) {
          content += `<img src="${imgMatch[2]}" alt="${imgMatch[1]}" class="retro-item-meme">`;
        } else {
          const textPart = part
            .replace(/─────────────/g, '<hr class="item-divider">')
            .replace(/\n/g, '<br>');
          if (textPart.trim()) {
            content += `<p class="retro-item-text">${textPart}</p>`;
          }
        }
      });
      content += '</div>';
    } else if (item.type === 'meme') {
      let memeUrl = item.meme_url || item.text || '';
      content = `<img src="${memeUrl}" alt="Meme" class="retro-item-meme" onerror="this.style.display='none'">`;
    }
  } else if (item.type === 'emoji') {
    content = `<div class="retro-item-emoji">${item.text}</div>`;
  } else {
    let processedText = escapeHtml(item.text);
    const textClass = 'retro-item-text';
    const textWithBreaks = processedText.replace(/\n/g, '<br>');
    content = `<p class="${textClass}">${textWithBreaks}</p>`;
  }

  const activeReactions = TELEGRAM_EMOJIS.filter(({ name }) => (reactions[name] || 0) > 0);
  const userReaction = userReactionsData[currentUserId];

  let reactionsHtml = '<div class="reactions-container">';
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

  reactionsHtml += '</div>';

  const isMerged = item.text && item.text.includes('─────────────');
  const mergedBadge = isMerged ? `<span class="merged-badge" title="Объединённая карточка"><span class="material-icons" style="font-size: 12px;">call_merge</span></span>` : '';

  return `
    <div class="retro-item discussion-item-only" data-id="${item.id}" data-order="${item.order || 0}" data-category="${item.category || ''}">
      <div class="retro-item-header">
        <span class="retro-item-author">
          <span class="material-icons" style="font-size: 14px;">person</span>
          ${escapeHtml(author)}
        </span>
        <div style="display: flex; align-items: center; gap: 4px;">
          ${mergedBadge}
          <small class="text-muted">${new Date(item.created_at).toLocaleString()}</small>
        </div>
      </div>
      ${content}
      <div class="retro-item-footer">
        ${reactionsHtml}
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
    
    // Позиционируем dropdown так, чтобы он не выходил за границы экрана
    if (menu.classList.contains('show')) {
      const button = event.target.closest('.emoji-dropdown-btn');
      if (button) {
        // Сначала устанавливаем базовую позицию (по центру кнопки)
        menu.style.left = '50%';
        menu.style.transform = 'translateX(-50%)';
        
        // Ждем следующего кадра, чтобы получить размеры элемента
        setTimeout(() => {
          const rect = menu.getBoundingClientRect();
          const buttonRect = button.getBoundingClientRect();
          
          // Вычисляем доступное пространство слева и справа от кнопки
          const spaceLeft = buttonRect.left;
          const spaceRight = window.innerWidth - buttonRect.right;
          
          // Ширина dropdown-меню
          const menuWidth = rect.width;
          
          // Определяем, нужно ли корректировать позицию
          let adjustedPosition = '50%';
          
          // Если выпадающее меню выходит за правую границу экрана
          if (rect.right > window.innerWidth) {
            // Выравниваем по правому краю кнопки
            adjustedPosition = '100%';
            menu.style.left = adjustedPosition;
            menu.style.transform = 'translateX(calc(-100% - 8px))'; // 8px отступ от края кнопки
          } 
          // Если выпадающее меню выходит за левую границу экрана
          else if (rect.left < 0) {
            // Выравниваем по левому краю кнопки
            adjustedPosition = '0%';
            menu.style.left = adjustedPosition;
            menu.style.transform = 'translateX(8px)'; // 8px отступ от края кнопки
          } 
          // Если выпадающее меню помещается нормально
          else {
            // Оставляем по центру
            menu.style.left = '50%';
            menu.style.transform = 'translateX(-50%)';
          }
        }, 1);
      }
    }
  }
}

// Установка реакции (только одна на пользователя на карточку)
async function setReaction(itemId, emoji, reactionName) {
  if (!currentSession) return;

  // Проверяем, есть ли уже реакция у пользователя на этой карточке
  const currentReaction = userReactions[itemId];
  const isSameReaction = currentReaction === reactionName;

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
  if (!isAdmin || isViewOnly) return;

  element.setAttribute('draggable', 'true');
  element.addEventListener('dragstart', handleDragStart);
  element.addEventListener('dragend', handleDragEnd);
  element.addEventListener('dragover', handleItemDragOver);
  element.addEventListener('dragleave', handleItemDragLeave);
  element.addEventListener('drop', handleItemDrop);

  // Инициализация обработки двойного клика на мемах
  initMemeResize(element);
}

// Инициализация изменения размера мемов по двойному клику
function initMemeResize(element) {
  const memes = element.querySelectorAll('.retro-item-meme');
  memes.forEach(meme => {
    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    meme.addEventListener('dblclick', function(e) {
      e.stopPropagation();

      // Если уже в режиме редактирования - выключаем
      if (this.classList.contains('editing')) {
        this.classList.remove('editing');
        saveMemeSize(this);
        // Включаем drag-and-drop обратно
        element.setAttribute('draggable', 'true');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      } else {
        // Включаем режим редактирования
        document.querySelectorAll('.retro-item-meme.editing').forEach(m => {
          m.classList.remove('editing');
          saveMemeSize(m);
          // Включаем drag-and-drop для всех карточек
          document.querySelectorAll('.retro-item').forEach(item => {
            item.setAttribute('draggable', 'true');
          });
        });
        this.classList.add('editing');
        // Отключаем drag-and-drop для этой карточки
        element.setAttribute('draggable', 'false');

        // Добавляем обработчики для изменения размера
        const memeEl = this;
        const handleMouseMove = (e) => {
          if (!isResizing) return;
          e.preventDefault();
          e.stopPropagation();

          const newWidth = startWidth + (e.clientX - startX);
          const newHeight = startHeight + (e.clientY - startY);

          // Ограничиваем минимальный размер
          if (newWidth >= 100) {
            memeEl.style.width = newWidth + 'px';
          }
          if (newHeight >= 100) {
            memeEl.style.height = newHeight + 'px';
          }
        };

        const handleMouseUp = (e) => {
          if (!isResizing) return;
          isResizing = false;
          e.preventDefault();
          e.stopPropagation();
          saveMemeSize(memeEl);
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };

        // Обработчик начала изменения размера (правый нижний угол)
        memeEl.addEventListener('mousedown', function(e) {
          // Проверяем, что клик в правом нижнем углу (20px)
          const rect = this.getBoundingClientRect();
          const offsetX = e.clientX - rect.left;
          const offsetY = e.clientY - rect.top;

          if (offsetX >= rect.width - 20 && offsetY >= rect.height - 20) {
            e.preventDefault();
            e.stopPropagation();
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = rect.width;
            startHeight = rect.height;

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }
        });
      }
    });
  });

  // Клик вне мема выключает режим редактирования
  element.addEventListener('click', function(e) {
    if (!e.target.classList.contains('retro-item-meme')) {
      document.querySelectorAll('.retro-item-meme.editing').forEach(m => {
        m.classList.remove('editing');
        saveMemeSize(m);
        // Включаем drag-and-drop обратно
        document.querySelectorAll('.retro-item').forEach(item => {
          item.setAttribute('draggable', 'true');
        });
      });
    }
  });
}

// Сохранение размера мема в localStorage и currentSession
function saveMemeSize(memeElement) {
  const itemElement = memeElement.closest('.retro-item');
  const itemId = itemElement?.dataset.id;
  if (!itemId) return;

  const width = memeElement.style.width || '';
  const height = memeElement.style.height || '';

  // Сохраняем в currentSession.items если есть
  if (currentSession?.items) {
    const item = currentSession.items.find(i => i.id === itemId);
    if (item) {
      item.meme_width = width;
      item.meme_height = height;
    }
  }

  // Сохраняем в localStorage
  if (width || height) {
    const savedSizes = JSON.parse(localStorage.getItem('memeSizes') || '{}');
    savedSizes[itemId] = { width, height };
    localStorage.setItem('memeSizes', JSON.stringify(savedSizes));
  }
}

// Восстановление размера мема из currentSession.items (загружено с сервера) и localStorage
function restoreMemeSizes() {
  const savedSizes = JSON.parse(localStorage.getItem('memeSizes') || '{}');

  // Применяем размеры ко всем мемам на странице
  document.querySelectorAll('.retro-item-meme').forEach(meme => {
    const itemElement = meme.closest('.retro-item');
    const itemId = itemElement?.dataset.id;
    if (!itemId) return;

    // Сначала пробуем из currentSession
    if (currentSession?.items) {
      const item = currentSession.items.find(i => i.id === itemId);
      if (item && item.meme_width && item.meme_height) {
        meme.style.width = item.meme_width;
        meme.style.height = item.meme_height;
        meme.dataset.memeWidth = item.meme_width;
        meme.dataset.memeHeight = item.meme_height;
        console.log('[MemeSize] Restored from currentSession:', itemId, item.meme_width, item.meme_height);
        return;
      }
    }

    // Затем из localStorage
    if (savedSizes[itemId] && savedSizes[itemId].width && savedSizes[itemId].height) {
      meme.style.width = savedSizes[itemId].width;
      meme.style.height = savedSizes[itemId].height;
      meme.dataset.memeWidth = savedSizes[itemId].width;
      meme.dataset.memeHeight = savedSizes[itemId].height;
      console.log('[MemeSize] Restored from localStorage:', itemId, savedSizes[itemId].width, savedSizes[itemId].height);
    }

    // Если есть data-атрибуты (сохранены после предыдущего восстановления)
    if (meme.dataset.memeWidth && meme.dataset.memeHeight) {
      meme.style.width = meme.dataset.memeWidth;
      meme.style.height = meme.dataset.memeHeight;
    }
  });
}

function handleDragStart(e) {
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    e.preventDefault();
    return;
  }

  // Не разрешаем drag если мем в режиме редактирования
  const editingMeme = this.querySelector('.retro-item-meme.editing');
  if (editingMeme) {
    e.preventDefault();
    return;
  }

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

  // Если голосование было начато - не показываем группировку
  if (votingStarted) {
    return;
  }

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
  // Если голосование было начато - не показываем группировку
  if (votingStarted) {
    return;
  }

  targetItem.style.boxShadow = '0 0 0 3px #6366f1';
  shouldGroupItems = true;
  showToast('Отпустите для объединения карточек', 'info');
}

function handleItemDrop(e) {
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

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
    // Если голосование было начато - не объединяем
    if (votingStarted) {
      showToast('Объединение карточек недоступно после начала голосования', 'warning');
      return;
    }
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
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ DRAG-N-DROP ====================

// Переменные для drag-n-drop столбцов
let draggedColumnCategory = null;
let draggedColumnElement = null;

// Обработчики для перетаскивания столбцов (смена порядка)
function handleColumnStartDrag(e, category) {
  e.stopPropagation();
  draggedColumnCategory = category;
  draggedColumnElement = e.currentTarget;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', category);
  // Добавляем класс для визуализации
  const element = e.currentTarget;
  setTimeout(() => {
    if (element) element.classList.add('dragging-column');
  }, 0);
  
  // Добавляем обработчик dragend для снятия выделения
  e.currentTarget.addEventListener('dragend', function dragEndHandler() {
    if (draggedColumnElement) {
      draggedColumnElement.classList.remove('dragging-column');
    }
    draggedColumnCategory = null;
    draggedColumnElement = null;
    // Проверяем, существует ли ещё элемент в DOM перед удалением обработчика
    if (e.currentTarget && e.currentTarget.parentNode) {
      e.currentTarget.removeEventListener('dragend', dragEndHandler);
    }
  });
}

function handleColumnReorderDragOver(e, category) {
  e.preventDefault();
  e.stopPropagation();
  if (draggedColumnCategory && draggedColumnCategory !== category) {
    e.dataTransfer.dropEffect = 'move';
    if (e.currentTarget) e.currentTarget.classList.add('drag-over-column');
  }
  return false;
}

function handleColumnReorderDragLeave(e, category) {
  e.stopPropagation();
  if (e.currentTarget) e.currentTarget.classList.remove('drag-over-column');
}

async function handleColumnReorderDrop(e, targetCategory) {
  e.preventDefault();
  e.stopPropagation();
  if (e.currentTarget) e.currentTarget.classList.remove('drag-over-column');

  if (!draggedColumnCategory || draggedColumnCategory === targetCategory) {
    draggedColumnCategory = null;
    draggedColumnElement = null;
    return;
  }

  // Меняем порядок столбцов
  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/columns/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromCategory: draggedColumnCategory,
        toCategory: targetCategory
      })
    });

    if (response.ok) {
      // Столбцы будут переупорядочены через WebSocket событие columns:reordered
    } else {
      const error = await response.json();
      alert('Ошибка: ' + error.error);
    }
  } catch (err) {
    console.error('Error reordering columns:', err);
  }

  // Очищаем
  if (draggedColumnElement) {
    draggedColumnElement.classList.remove('dragging-column');
  }
  draggedColumnCategory = null;
  draggedColumnElement = null;
}

// Обработчики для колонки
function handleColumnDragOver(e, category) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  const columnItems = e.currentTarget;
  if (columnItems) {
    columnItems.classList.add('drag-over');
  }
}

function handleColumnDragLeave(e) {
  e.stopPropagation();
  const columnItems = e.currentTarget;
  if (columnItems) {
    columnItems.classList.remove('drag-over');
  }
}

// Обработчики для кнопки "Добавить элемент"
function handleButtonDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'move';
  if (e.currentTarget) e.currentTarget.classList.add('drag-over');
}

function handleButtonDragLeave(e) {
  e.stopPropagation();
  if (e.currentTarget) e.currentTarget.classList.remove('drag-over');
}

function handleDropOnButton(e, category) {
  e.preventDefault();
  e.stopPropagation();
  if (e.currentTarget) e.currentTarget.classList.remove('drag-over');

  if (!draggedItemId || !category) return;

  const oldColumn = draggedItem?.closest('.column-items');
  const oldCategory = oldColumn?.dataset.category;

  if (oldCategory === category) return;

  moveItemToCategory(draggedItemId, category);
}

function handleDrop(e, category) {
  e.preventDefault();
  e.stopPropagation();
  const columnItems = e.currentTarget;
  if (columnItems) {
    columnItems.classList.remove('drag-over');
  }

  if (!draggedItemId || !category) return;

  const oldColumn = draggedItem?.closest('.column-items');
  const oldCategory = oldColumn?.dataset.category;

  if (oldCategory === category) return;

  moveItemToCategory(draggedItemId, category);
}

// ==================== ИЗМЕНЕНИЕ РАЗМЕРА СТОЛБЦОВ ====================

// Инициализация изменения размера столбцов
function initColumnResize() {
  const resizeHandles = document.querySelectorAll('.retro-column-resize-handle');
  
  resizeHandles.forEach(handle => {
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    let column = null;

    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      column = handle.closest('.retro-column');
      startX = e.pageX;
      startWidth = column.offsetWidth;
      handle.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing || !column) return;
      
      const width = startWidth + (e.pageX - startX);
      if (width >= 250 && width <= 800) {
        column.style.width = width + 'px';
        column.style.minWidth = width + 'px';
        column.style.maxWidth = width + 'px';
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        handle.classList.remove('resizing');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        column = null;
      }
    });
  });
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
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    showToast('Режим только для просмотра', 'warning');
    return;
  }

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

    // Меняем порядок местами (последовательно, чтобы избежать race condition)
    const sourceOrder = sourceItem.order;
    const targetOrder = targetItem.order;

    console.log('[Swap] Orders:', { sourceOrder, targetOrder });

    // Сначала обновляем source с временным значением
    const sourceUpdateRes = await fetch(`/api/sessions/${currentSession.id}/items/${sourceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: -1 }) // временное значение
    });

    console.log('[Swap] Source update response:', sourceUpdateRes.status, sourceUpdateRes.ok);

    // Затем обновляем target на порядок source
    const targetUpdateRes = await fetch(`/api/sessions/${currentSession.id}/items/${targetId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: sourceOrder })
    });

    console.log('[Swap] Target update response:', targetUpdateRes.status, targetUpdateRes.ok);

    // И наконец обновляем source на порядок target
    const sourceFinalRes = await fetch(`/api/sessions/${currentSession.id}/items/${sourceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: targetOrder })
    });

    console.log('[Swap] Source final response:', sourceFinalRes.status, sourceFinalRes.ok);

    // Визуальный обмен происходит автоматически через WebSocket (item:updated)
    showToast('Элементы обменены местами', 'success');
  } catch (error) {
    console.error('[Swap] Error:', error);
    showToast('Ошибка обмена местами', 'danger');
  }
}

// Объединение двух карточек
async function mergeItems(sourceElement, targetElement) {
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    showToast('Режим только для просмотра', 'warning');
    return;
  }

  // Проверяем, было ли начато голосование в этой сессии
  if (votingStarted) {
    showToast('Объединение карточек недоступно после начала голосования', 'warning');
    return;
  }

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

    // Парсим реакции target карточки
    let targetReactions = {};
    let targetUserReactions = {};
    try {
      targetReactions = targetItem.reactions ? (typeof targetItem.reactions === 'string' ? JSON.parse(targetItem.reactions) : targetItem.reactions) : {};
      targetUserReactions = targetItem.user_reactions ? (typeof targetItem.user_reactions === 'string' ? JSON.parse(targetItem.user_reactions) : targetItem.user_reactions) : {};
    } catch (e) {
      console.warn('Failed to parse target reactions:', e);
    }

    // Парсим реакции source карточки
    let sourceReactions = {};
    let sourceUserReactions = {};
    try {
      sourceReactions = sourceItem.reactions ? (typeof sourceItem.reactions === 'string' ? JSON.parse(sourceItem.reactions) : sourceItem.reactions) : {};
      sourceUserReactions = sourceItem.user_reactions ? (typeof sourceItem.user_reactions === 'string' ? JSON.parse(sourceItem.user_reactions) : sourceItem.user_reactions) : {};
    } catch (e) {
      console.warn('Failed to parse source reactions:', e);
    }

    // Если target уже был объединён, берём оригинальные реакции первой части из merged_parts_data
    let existingMergedPartsData = [];
    try {
      if (targetItem.merged_parts_data) {
        existingMergedPartsData = typeof targetItem.merged_parts_data === 'string'
          ? JSON.parse(targetItem.merged_parts_data)
          : targetItem.merged_parts_data;
        // Используем реакции первой части вместо суммарных
        if (existingMergedPartsData.length > 0 && existingMergedPartsData[0].reactions) {
          targetReactions = existingMergedPartsData[0].reactions;
          targetUserReactions = existingMergedPartsData[0].user_reactions || {};
        }
      }
    } catch (e) {
      console.warn('Failed to parse existing merged_parts_data:', e);
    }

    // Суммируем реакции для отображения на объединённой карточке
    let mergedReactions = {};
    for (const [name, count] of Object.entries(targetReactions)) {
      mergedReactions[name] = (mergedReactions[name] || 0) + count;
    }
    for (const [name, count] of Object.entries(sourceReactions)) {
      mergedReactions[name] = (mergedReactions[name] || 0) + count;
    }

    // Объединяем user_reactions (приоритет у source, если есть конфликт)
    let mergedUserReactions = { ...targetUserReactions, ...sourceUserReactions };

    // Сохраняем данные о каждой части для последующего разделения
    let mergedPartsData = [];

    // Если target уже был объединён, используем существующие части
    if (existingMergedPartsData.length > 0) {
      // Копируем существующие части
      mergedPartsData = existingMergedPartsData.map(part => ({...part}));
      
      // Обновляем первую часть с актуальными реакциями target (но сохраняем оригинальный текст и author)
      const firstPartText = mergedPartsData[0]?.text || targetItem.text || '';
      const firstPartAuthor = mergedPartsData[0]?.author || targetItem.author || 'Аноним';
      mergedPartsData[0] = {
        text: firstPartText,
        reactions: targetReactions,
        user_reactions: targetUserReactions,
        meme_url: targetItem.meme_url,
        type: targetItem.type,
        author: firstPartAuthor
      };
    } else {
      // Target не был объединён, создаём новую запись для первой части
      mergedPartsData.push({
        text: targetItem.text || '',
        reactions: targetReactions,
        user_reactions: targetUserReactions,
        meme_url: targetItem.meme_url,
        type: targetItem.type,
        author: targetItem.author || 'Аноним'
      });
    }

    // Добавляем source как новую часть
    mergedPartsData.push({
      text: sourceItem.text || '',
      reactions: sourceReactions,
      user_reactions: sourceUserReactions,
      meme_url: sourceItem.meme_url,
      type: sourceItem.type,
      author: sourceItem.author || 'Аноним'
    });

    console.log('[Merge] mergedPartsData:', mergedPartsData);

    // Обновляем author объединённой карточки на автора первой части (target)
    const firstPartAuthor = mergedPartsData[0]?.author || targetItem.author || 'Аноним';

    const updateData = {
      text: mergedText,
      reactions: JSON.stringify(mergedReactions),
      user_reactions: JSON.stringify(mergedUserReactions),
      merged_parts_data: JSON.stringify(mergedPartsData),
      author: firstPartAuthor
    };

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
  // Блокируем в режиме просмотра
  if (isViewOnly) return;

  if (!currentSession) return;

  // Проверяем, есть ли уже реакция у пользователя на этой карточке
  const currentReaction = userReactions[itemId];
  const isSameReaction = currentReaction === reactionName;

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

// Разъединение карточки (разделение на отдельные карточки)
// Открывает модальное окно для выбора какой фрагмент отделить
async function splitItem(itemId) {
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    showToast('Режим только для просмотра', 'warning');
    return;
  }

  // Проверяем, было ли начато голосование в этой сессии
  if (votingStarted) {
    showToast('Разъединение карточек недоступно после начала голосования', 'warning');
    return;
  }

  if (!currentSession) return;

  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/items/${itemId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch item');
    }

    const item = await response.json();

    // Проверяем, есть ли в тексте разделители
    const hasDivider = item.text && item.text.includes('─────────────');

    if (!hasDivider) {
      showToast('Эту карточку нельзя разъединить', 'info');
      return;
    }

    // Разделяем текст по разделителю (поддерживаем разные форматы)
    const parts = item.text.split(/\n{1,2}─────────────\n{1,2}/).filter(p => p.trim());

    if (parts.length < 2) {
      showToast('Нечего разъединять', 'info');
      return;
    }

    // Сохраняем информацию для модального окна
    window.splitItemData = {
      itemId: itemId,
      item: item,
      parts: parts
    };

    // Показываем модальное окно выбора
    showSplitModal(parts);
  } catch (error) {
    console.error('Error splitting item:', error);
    showToast('Ошибка разъединения', 'danger');
  }
}

// Показ модального окна для выбора фрагмента
function showSplitModal(parts) {
  const modal = new bootstrap.Modal(document.getElementById('splitItemModal'));

  // Генерируем список частей для выбора
  const listContainer = document.getElementById('split-parts-list');
  if (listContainer) {
    // Добавляем чекбокс "Выбрать всё"
    let html = `
      <div class="split-part-item">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="select-all-parts" onchange="toggleSelectAllParts(this)">
          <label class="form-check-label" for="select-all-parts">
            <strong>Выбрать все части</strong>
          </label>
        </div>
      </div>
    `;
    
    // Добавляем чекбоксы для каждой части
    html += parts.map((part, index) => {
      // Обрезаем текст для предпросмотра, но сохраняем переносы строк
      const previewLength = 150;
      let previewText = part;
      let isTruncated = false;
      
      // Если текст очень длинный, обрезаем его
      if (part.length > previewLength) {
        previewText = part.substring(0, previewLength);
        isTruncated = true;
      }
      
      // Экранируем HTML и заменяем разделители на текст
      const escapedText = escapeHtml(previewText)
        .replace(/─────────────/g, '<br><strong>─── РАЗДЕЛИТЕЛЬ ───</strong><br>');
      
      return `
        <div class="split-part-item">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" value="${index}" id="split-part-${index}" onchange="updateSelectAllState()">
            <label class="form-check-label" for="split-part-${index}">
              <div class="d-flex justify-content-between align-items-center w-100">
                <div>
                  <strong>Часть ${index + 1}</strong>
                  <div class="split-part-preview">${escapedText}${isTruncated ? '...' : ''}</div>
                </div>
                <span class="badge bg-secondary">${part.length} симв.</span>
              </div>
            </label>
          </div>
        </div>
      `;
    }).join('');
    
    listContainer.innerHTML = html;
  }

  modal.show();
}

// Функция для обработки чекбокса "Выбрать всё"
function toggleSelectAllParts(checkbox) {
  const isChecked = checkbox.checked;
  const individualCheckboxes = document.querySelectorAll('#split-parts-list .form-check-input:not(#select-all-parts)');
  individualCheckboxes.forEach(cb => {
    cb.checked = isChecked;
    // Trigger change event to update the UI properly
    cb.dispatchEvent(new Event('change'));
  });
}

// Функция для обновления состояния чекбокса "Выбрать всё"
function updateSelectAllState() {
  const allCheckboxes = document.querySelectorAll('#split-parts-list .form-check-input:not(#select-all-parts)');
  const checkedBoxes = document.querySelectorAll('#split-parts-list .form-check-input:not(#select-all-parts):checked');
  const selectAllCheckbox = document.getElementById('select-all-parts');
  
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = allCheckboxes.length > 0 && allCheckboxes.length === checkedBoxes.length;
  }
}

// Функция для обновления состояния индивидуальных чекбоксов при изменении "Выбрать всё"
function updateIndividualCheckboxesState() {
  const selectAllCheckbox = document.getElementById('select-all-parts');
  const individualCheckboxes = document.querySelectorAll('#split-parts-list .form-check-input:not(#select-all-parts)');
  
  if (selectAllCheckbox) {
    const isSelectAllChecked = selectAllCheckbox.checked;
    individualCheckboxes.forEach(checkbox => {
      checkbox.checked = isSelectAllChecked;
    });
  }
}

// Выполнение разъединения выбранных частей
async function confirmSplitItem() {
  if (!window.splitItemData) return;

  const { itemId, item, parts } = window.splitItemData;
  
  // Получаем выбранные части
  const selectedIndices = [];
  document.querySelectorAll('#split-parts-list input[type="checkbox"]:checked').forEach(checkbox => {
    selectedIndices.push(parseInt(checkbox.value, 10));
  });

  if (selectedIndices.length === 0) {
    showToast('Выберите хотя бы одну часть', 'warning');
    return;
  }

  if (selectedIndices.length === parts.length && selectedIndices.every((v, i) => v === i)) {
    // Если выбраны все части - разъединяем все
    await splitAllParts(itemId, item, parts);
  } else {
    // Разъединяем только выбранные
    await splitSelectedParts(itemId, item, parts, selectedIndices);
  }

  // Закрываем модальное окно
  const modal = bootstrap.Modal.getInstance(document.getElementById('splitItemModal'));
  if (modal) modal.hide();

  // Очищаем данные
  window.splitItemData = null;
}

// Найти данные части по тексту (сопоставление по содержимому, а не по индексу)
function findPartDataByText(text, mergedPartsData) {
  const trimmedText = text.trim();
  
  // Ищем точное совпадение текста
  let partData = mergedPartsData.find(p => p.text && p.text.trim() === trimmedText);
  if (partData) return partData;
  
  // Ищем совпадение по подстроке (на случай если текст был немного изменён)
  partData = mergedPartsData.find(p => p.text && p.text.trim().includes(trimmedText));
  if (partData) return partData;
  
  // Ищем обратное совпадение (если текст был дополнен)
  partData = mergedPartsData.find(p => p.text && trimmedText.includes(p.text.trim()));
  if (partData) return partData;
  
  // Ищем по первому предложению/строке (для случаев когда текст обрезан)
  const textFirstLine = trimmedText.split('\n')[0].trim();
  partData = mergedPartsData.find(p => p.text && p.text.trim().split('\n')[0].trim() === textFirstLine);
  if (partData) return partData;
  
  // Для emoji-карточек ищем по содержимому (без пробелов)
  const textNoSpaces = trimmedText.replace(/\s+/g, '');
  partData = mergedPartsData.find(p => p.text && p.text.replace(/\s+/g, '') === textNoSpaces);
  if (partData) return partData;
  
  // Возвращаем пустые данные если не нашли совпадений
  return { reactions: {}, user_reactions: {}, type: 'text', meme_url: null };
}

// Разъединение всех частей (старая логика)
async function splitAllParts(itemId, item, parts) {
  const element = document.getElementById(`item-${itemId}`);
  const column = element?.closest('.column-items');
  const category = column?.dataset.category || item.category;
  const baseOrder = item.order || 0;

  // Пытаемся получить сохранённые данные о частях
  let mergedPartsData = [];
  try {
    if (item.merged_parts_data) {
      mergedPartsData = typeof item.merged_parts_data === 'string'
        ? JSON.parse(item.merged_parts_data)
        : item.merged_parts_data;
    }
  } catch (e) {
    console.warn('Failed to parse merged_parts_data:', e);
  }

  console.log('[Split] mergedPartsData:', mergedPartsData);
  console.log('[Split] parts:', parts);

  // Создаём новые карточки для каждой части
  const newItemsPromises = [];
  for (let i = 0; i < parts.length; i++) {
    const newOrder = baseOrder + i;
    const partText = parts[i].trim();

    // Сначала пытаемся найти по индексу (для простого случая: target + source)
    let partData = mergedPartsData[i];
    
    // Если не нашли по индексу, ищем по тексту
    if (!partData) {
      partData = findPartDataByText(partText, mergedPartsData);
    }
    
    // Если всё ещё не нашли, используем первую часть как fallback
    if (!partData && mergedPartsData.length > 0) {
      console.warn('[Split] Could not find part data for index', i, 'using first part as fallback');
      partData = mergedPartsData[0];
    }
    
    const partReactions = partData?.reactions || {};
    const partUserReactions = partData?.user_reactions || {};
    // Приоритет: partData.author > mergedPartsData[0].author (автор первой части) > item.author
    const partAuthor = partData?.author || (mergedPartsData[0]?.author && i === 0 ? mergedPartsData[0].author : item.author) || 'Аноним';

    console.log('[Split] Part', i, ':', { partText: partText.substring(0, 30), partAuthor, partData });

    const promise = fetch(`/api/sessions/${currentSession.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: partText,
        category: category,
        author: partAuthor,
        type: partData?.type || 'text',
        meme_url: partData?.meme_url || null,
        order: newOrder,
        reactions: JSON.stringify(partReactions),
        user_reactions: JSON.stringify(partUserReactions)
      })
    });

    newItemsPromises.push(promise);
  }

  // Создаём все новые карточки параллельно
  await Promise.all(newItemsPromises);

  // Удаляем исходную объединённую карточку
  await fetch(`/api/sessions/${currentSession.id}/items/${itemId}`, {
    method: 'DELETE'
  });

  // Обновляем currentSession.items - удаляем старую карточку
  if (currentSession?.items) {
    currentSession.items = currentSession.items.filter(i => i.id !== itemId);
  }

  // Удаляем из DOM
  const oldElement = document.getElementById(`item-${itemId}`);
  if (oldElement) {
    oldElement.remove();
  }

  showToast(`Карточка разъединена на ${parts.length} части!`, 'success');
}

// Разъединение выбранных частей
async function splitSelectedParts(itemId, item, parts, selectedIndices) {
  const element = document.getElementById(`item-${itemId}`);
  const column = element?.closest('.column-items');
  const category = column?.dataset.category || item.category;
  const baseOrder = item.order || 0;

  // Пытаемся получить сохранённые данные о частях
  let mergedPartsData = [];
  try {
    if (item.merged_parts_data) {
      mergedPartsData = typeof item.merged_parts_data === 'string'
        ? JSON.parse(item.merged_parts_data)
        : item.merged_parts_data;
    }
  } catch (e) {
    console.warn('Failed to parse merged_parts_data:', e);
    // Если не удалось распарсить, создаем массив с пустыми объектами
    mergedPartsData = parts.map(() => ({ reactions: {}, user_reactions: {} }));
  }

  // Собираем текст для исходной карточки (невыбранные части)
  const unselectedParts = parts.filter((_, index) => !selectedIndices.includes(index));
  const selectedParts = selectedIndices.map(i => parts[i]);

  console.log('[SplitSelected] mergedPartsData:', mergedPartsData);
  console.log('[SplitSelected] selectedIndices:', selectedIndices);
  console.log('[SplitSelected] selectedParts:', selectedParts);

  // Создаём новые карточки для выбранных частей с их оригинальными реакциями
  const newItemsPromises = [];
  for (let i = 0; i < selectedParts.length; i++) {
    const newOrder = baseOrder + i + 1;
    const partText = selectedParts[i].trim();

    // Используем индекс оригинальной части для сопоставления
    const originalIndex = selectedIndices[i];
    const partData = mergedPartsData[originalIndex] || findPartDataByText(partText, mergedPartsData);
    const partReactions = partData?.reactions || {};
    const partUserReactions = partData?.user_reactions || {};
    const partType = partData?.type || 'text';
    const partMemeUrl = partData?.meme_url || null;
    const partAuthor = partData?.author || item.author || 'Аноним';

    console.log(`[SplitSelected] Part ${i}: originalIndex=${originalIndex}, partAuthor=${partAuthor}, partData=`, partData);

    const promise = fetch(`/api/sessions/${currentSession.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: partText,
        category: category,
        author: partAuthor,
        type: partType,
        meme_url: partMemeUrl,
        order: newOrder,
        reactions: JSON.stringify(partReactions),
        user_reactions: JSON.stringify(partUserReactions)
      })
    });

    newItemsPromises.push(promise);
  }

  // Создаём все новые карточки параллельно
  await Promise.all(newItemsPromises);

  // Если остались неразделенные части, обновляем исходную карточку
  if (unselectedParts.length > 0) {
    // Обновляем исходную карточку с оставшимися частями и их реакциями
    const remainingText = unselectedParts.join('\n\n─────────────\n\n');

    // Собираем реакции для оставшихся частей
    let remainingReactions = {};
    let remainingUserReactions = {};
    let remainingType = 'text';
    let remainingMemeUrl = null;
    let remainingAuthor = item.author || 'Аноним';

    // Если осталась одна часть - используем её данные по индексу
    if (unselectedParts.length === 1) {
      const unselectedIndex = parts.findIndex((_, index) => !selectedIndices.includes(index));
      const remainingPartData = mergedPartsData[unselectedIndex] || findPartDataByText(unselectedParts[0], mergedPartsData);
      remainingReactions = remainingPartData?.reactions || {};
      remainingUserReactions = remainingPartData?.user_reactions || {};
      remainingType = remainingPartData?.type || 'text';
      remainingMemeUrl = remainingPartData?.meme_url || null;
      remainingAuthor = remainingPartData?.author || item.author || 'Аноним';
      console.log('[SplitSelected] Remaining (1 part):', { unselectedIndex, remainingAuthor, remainingPartData });
    } else {
      // Если несколько частей - суммируем реакции используя индексы
      const unselectedIndices = parts
        .map((_, index) => !selectedIndices.includes(index) ? index : -1)
        .filter(i => i !== -1);

      for (let i = 0; i < unselectedParts.length; i++) {
        const partData = mergedPartsData[unselectedIndices[i]] || findPartDataByText(unselectedParts[i], mergedPartsData);
        const partReactions = partData?.reactions || {};
        const partUserReactions = partData?.user_reactions || {};

        // Суммируем реакции
        for (const [name, count] of Object.entries(partReactions)) {
          remainingReactions[name] = (remainingReactions[name] || 0) + count;
        }
        remainingUserReactions = { ...remainingUserReactions, ...partUserReactions };

        if (partData?.type === 'meme' && !remainingMemeUrl) {
          remainingMemeUrl = partData.meme_url;
          remainingType = 'meme';
        }
        
        // Для первой части сохраняем author
        if (i === 0) {
          remainingAuthor = partData?.author || item.author || 'Аноним';
        }
      }
    }

    console.log('[SplitSelected] Updating remaining item:', { remainingAuthor, remainingText: remainingText.trim() });

    await fetch(`/api/sessions/${currentSession.id}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: remainingText.trim(),
        order: baseOrder,
        author: remainingAuthor,
        type: remainingType,
        meme_url: remainingMemeUrl,
        reactions: JSON.stringify(remainingReactions),
        user_reactions: JSON.stringify(remainingUserReactions),
        merged_parts_data: unselectedParts.length > 1 ? JSON.stringify(
          unselectedParts.map(part => {
            // Найти данные части по тексту
            return findPartDataByText(part, mergedPartsData);
          })
        ) : null
      })
    });

    // Обновляем currentSession.items - обновляем старую карточку
    if (currentSession?.items) {
      const index = currentSession.items.findIndex(i => i.id === itemId);
      if (index >= 0) {
        currentSession.items[index] = {
          ...currentSession.items[index],
          text: remainingText.trim(),
          order: baseOrder,
          author: remainingAuthor,
          type: remainingType,
          meme_url: remainingMemeUrl,
          reactions: remainingReactions,
          user_reactions: remainingUserReactions
        };
      }
    }
    
    // Обновляем DOM вручную - перерисовываем оставшуюся карточку
    const element = document.getElementById(`item-${itemId}`);
    if (element) {
      const newHtml = createItemHtml(currentSession.items.find(i => i.id === itemId));
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newHtml;
      const newElement = tempDiv.firstElementChild;
      if (newElement) {
        element.replaceWith(newElement);
        initDraggable(newElement);
      }
    }
  } else {
    // Если не осталось частей, удаляем карточку
    await fetch(`/api/sessions/${currentSession.id}/items/${itemId}`, {
      method: 'DELETE'
    });

    // Обновляем currentSession.items - удаляем старую карточку
    if (currentSession?.items) {
      currentSession.items = currentSession.items.filter(i => i.id !== itemId);
    }
    
    // Удаляем из DOM
    const element = document.getElementById(`item-${itemId}`);
    if (element) {
      element.remove();
    }
  }

  showToast(`Отделено ${selectedParts.length} части(ей)!`, 'success');
}

// Обновление элемента
function updateItemInColumn(item) {
  // Ищем элемент только в Brain storm (в колонках), игнорируя Discussion
  const element = document.querySelector(`#columns-container #item-${item.id}`);
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
      // Применяем режим голосования (показываем кнопки голосования если есть голоса)
      applyVoteMode();
      // Восстанавливаем размер мема если есть
      restoreMemeSizes();
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
      // Обновляем счётчики обеих колонок после перемещения
      updateColumnCount(currentCategory);
      updateColumnCount(item.category);
      console.log('[UI] Moved element from', currentCategory, 'to', item.category);
      // Восстанавливаем размер мема если есть
      restoreMemeSizes();
    } else {
      console.warn('[UI] New column not found for category', item.category);
    }
  } else {
    // Та же колонка - проверяем, нужно ли обновлять содержимое
    // Не перерисовываем если обновилась только реакция (это делает updateItemReactions)
    // Перерисовываем только если изменился текст, тип, мем, или action plan
    
    const existingAuthorEl = element.querySelector('.retro-item-author');
    const existingAuthor = existingAuthorEl ? existingAuthorEl.textContent.trim().replace(/\s+/g, ' ') : '';
    const currentAuthor = (item.author || 'Аноним').trim();
    
    const existingTextEl = element.querySelector('.retro-item-text');
    const existingText = existingTextEl ? existingTextEl.innerText : '';
    const currentText = item.text || '';
    
    const existingMemeEl = element.querySelector('.retro-item-meme');
    const hasMeme = !!existingMemeEl;
    const hasMemeInItem = item.type === 'meme' || (item.text && item.text.includes('!['));
    
    // Проверяем, есть ли значимые изменения
    // merged_parts_data означает объединение карточек - нужно перерисовать
    const hasSignificantChanges = (
      item.merged_parts_data !== undefined || // Объединение карточек
      existingAuthor !== currentAuthor ||
      (existingTextEl && !currentText) || // Текст был но стал пустым
      (!existingTextEl && currentText && !hasMemeInItem) || // Текста не было (был мем) но появился текст
      (existingText && currentText && existingText.trim() !== currentText.trim())
    );
    
    if (hasSignificantChanges) {
      // Та же колонка - обновляем содержимое и сортируем
      const newHtml = createItemHtml(item);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newHtml;
      const newElement = tempDiv.firstElementChild;

      element.replaceWith(newElement);
      initDraggable(newElement);
      // Сортируем колонку по порядку
      sortColumnByOrder(item.category);
      // Применяем режим голосования (показываем кнопки голосования если есть голоса)
      applyVoteMode();
      console.log('[UI] Updated element in same column', item.category);
      // Восстанавливаем размер мема если есть
      restoreMemeSizes();
    } else {
      console.log('[UI] Skipping re-render for item', item.id, '- no significant changes (reactions only)');
    }
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

  const currentUserIdForCheck = currentUserId;

  // Получаем dropdown (его не трогаем)
  const existingDropdown = reactionsContainer.querySelector('.emoji-dropdown');

  // Фильтруем активные реакции (count > 0)
  const activeReactions = TELEGRAM_EMOJIS.filter(({ name }) => (reactions[name] || 0) > 0);

  // Создаём мапу активных реакций
  const activeMap = new Map();
  activeReactions.forEach(({ emoji, name }) => {
    activeMap.set(name, {
      emoji,
      count: reactions[name] || 0,
      isUserReaction: userReactions[currentUserIdForCheck] === name
    });
  });

  // Получаем все существующие кнопки реакций
  const existingBtns = reactionsContainer.querySelectorAll('.reaction-btn');

  // Обновляем или скрываем существующие кнопки
  existingBtns.forEach(btn => {
    const btnName = btn.classList.contains('like') ? 'like' :
                    btn.classList.contains('dislike') ? 'dislike' :
                    btn.classList.contains('heart') ? 'heart' :
                    btn.classList.contains('fire') ? 'fire' :
                    btn.classList.contains('party') ? 'party' :
                    btn.classList.contains('happy') ? 'happy' :
                    btn.classList.contains('sad') ? 'sad' :
                    btn.classList.contains('angry') ? 'angry' :
                    btn.classList.contains('think') ? 'think' :
                    btn.classList.contains('poop') ? 'poop' :
                    btn.classList.contains('hundred') ? 'hundred' :
                    btn.classList.contains('pray') ? 'pray' : null;

    if (!btnName) return;

    const activeData = activeMap.get(btnName);
    if (activeData) {
      // Обновляем существующую кнопку
      const emojiSpan = btn.querySelector('span:first-child');
      const countSpan = btn.querySelector('.reaction-count');
      if (emojiSpan && emojiSpan.textContent !== activeData.emoji) {
        emojiSpan.textContent = activeData.emoji;
      }
      if (countSpan && countSpan.textContent !== String(activeData.count)) {
        countSpan.textContent = activeData.count;
      }
      const isActive = activeData.isUserReaction;
      if (btn.classList.contains('active') !== isActive) {
        btn.classList.toggle('active', isActive);
      }
      activeMap.delete(btnName); // Удаляем из мапы
      btn.style.display = ''; // Показываем кнопку
    } else {
      // Скрываем кнопку (реакция больше не активна)
      btn.style.display = 'none';
    }
  });

  // Создаём новые кнопки для реакций которых не было
  activeMap.forEach(({ emoji, count, isUserReaction }, name) => {
    const newBtn = document.createElement('button');
    newBtn.className = `reaction-btn ${name} ${isUserReaction ? 'active' : ''}`;
    newBtn.onclick = () => toggleReaction(itemId, emoji, name);
    newBtn.innerHTML = `<span>${emoji}</span><span class="reaction-count">${count}</span>`;

    // Вставляем перед dropdown или в конец
    if (existingDropdown) {
      reactionsContainer.insertBefore(newBtn, existingDropdown);
    } else {
      reactionsContainer.appendChild(newBtn);
    }
  });

  // Показываем/скрываем контейнер - считаем только видимые кнопки
  let visibleCount = 0;
  reactionsContainer.querySelectorAll('.reaction-btn').forEach(btn => {
    if (btn.style.display !== 'none') visibleCount++;
  });
  reactionsContainer.style.display = (visibleCount > 0 || existingDropdown) ? 'flex' : 'none';
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
    // Очищаем голоса за эту карточку перед удалением
    if (voteModeVotes[itemId]) {
      delete voteModeVotes[itemId];
    }
    if (userVoteModeVotes.includes(itemId)) {
      userVoteModeVotes = userVoteModeVotes.filter(id => id !== itemId);
    }
    element.remove();
    if (category) updateColumnCount(category);
    // Применяем режим голосования (обновляем кнопки голосования)
    applyVoteMode();
    console.log('[UI] Removed element from column', category);
  } else {
    console.warn('[UI] Element not found for removal', itemId);
  }
}

// Редактирование элемента
async function editItem(itemId) {
  const itemElement = document.getElementById(`item-${itemId}`);
  if (!itemElement) return;

  // Находим данные элемента (можно получить из currentSession.items)
  const item = currentSession.items?.find(i => i.id === itemId);
  if (!item) {
    showToast('Элемент не найден', 'warning');
    return;
  }

  // Открываем модальное окно сначала
  const modal = new bootstrap.Modal(document.getElementById('addItemModal'));
  modal.show();

  // Ждём пока модальное окно откроется
  document.getElementById('addItemModal').addEventListener('shown.bs.modal', function initEditModal() {
    // Заполняем форму редактирования
    const itemTextDiv = document.getElementById('item-text');
    const categorySelect = document.getElementById('item-category');
    const memeUrlInput = document.getElementById('item-meme-url');
    const emojiInput = document.getElementById('item-emoji');
    const submitButton = document.querySelector('#addItemModal .btn-primary');

    // Очищаем форму
    if (itemTextDiv) itemTextDiv.innerHTML = '';
    if (memeUrlInput) memeUrlInput.value = '';
    if (emojiInput) emojiInput.value = '';
    
    const emojiPreview = document.getElementById('emoji-preview');
    if (emojiPreview) emojiPreview.style.display = 'none';

    // Если это мем с картинкой или объединённая карточка
    if (item.type === 'meme' && item.text) {
      // Проверяем, есть ли в тексте markdown изображения
      const imgMatch = item.text.match(/!\[(.*?)\]\((.*?)\)/);
      if (imgMatch) {
        // Вставляем изображение в contenteditable
        const imgHtml = `<img src="${imgMatch[2]}" alt="${imgMatch[1]}" style="max-width: 200px; max-height: 150px; border-radius: 6px; margin: 4px; vertical-align: middle;">`;
        if (itemTextDiv) {
          // Разделяем текст на части до и после изображения
          const parts = item.text.split(imgMatch[0]);
          const textBefore = parts[0] || '';
          const textAfter = parts[1] || '';
          
          // Формируем HTML: текст до + изображение + текст после
          let contentHtml = '';
          if (textBefore) {
            contentHtml += textBefore.replace(/\n/g, '<br>');
          }
          contentHtml += imgHtml;
          if (textAfter) {
            contentHtml += textAfter.replace(/\n/g, '<br>');
          }
          itemTextDiv.innerHTML = contentHtml;
        }
      } else if (item.meme_url) {
        // Просто URL мема
        const imgHtml = `<img src="${item.meme_url}" alt="Meme" style="max-width: 200px; max-height: 150px; border-radius: 6px; margin: 4px; vertical-align: middle;">`;
        if (itemTextDiv) itemTextDiv.innerHTML = imgHtml;
      }
    } else if (item.type === 'emoji') {
      if (emojiInput) emojiInput.value = item.text;
      const previewText = document.getElementById('emoji-preview-text');
      if (previewText) previewText.textContent = item.text;
      if (emojiPreview) emojiPreview.style.display = 'block';
    } else {
      // Текст - вставляем с обработкой переносов строк и разделителей
      if (itemTextDiv) {
        // Проверяем, есть ли разделитель объединённых карточек
        if (item.text && item.text.includes('─────────────')) {
          // Заменяем разделитель на HTML для отображения
          itemTextDiv.innerHTML = item.text
            .replace(/\n/g, '<br>')
            .replace(/─────────────/g, '<hr class="item-divider" style="border: 2px dashed #ccc; margin: 10px 0;">');
        } else {
          itemTextDiv.innerText = item.text;
        }
      }
    }

    // Устанавливаем категорию
    if (categorySelect) categorySelect.value = item.category;

    // Сохраняем ID редактируемого элемента для обновления
    if (itemTextDiv) itemTextDiv.dataset.editItemId = itemId;

    // Меняем текст кнопки на "Сохранить"
    if (submitButton) {
      submitButton.textContent = 'Сохранить';
    }

    // При закрытии модального окна сбрасываем текст кнопки
    document.getElementById('addItemModal').addEventListener('hidden.bs.modal', function() {
      if (submitButton) {
        submitButton.textContent = 'Добавить';
      }
      if (itemTextDiv) delete itemTextDiv.dataset.editItemId;
    }, { once: true });

    // Удаляем этот обработчик после выполнения
    document.getElementById('addItemModal').removeEventListener('shown.bs.modal', initEditModal);
  }, { once: true });
}

// Удаление элемента (для админа)
async function deleteItem(itemId) {
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    showToast('Режим только для просмотра', 'warning');
    return;
  }

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

  // Показываем/скрываем placeholder
  if (count > 0) {
    column.classList.add('has-items');
    column.querySelector('.column-items')?.classList.add('has-items');
  } else {
    column.classList.remove('has-items');
    column.querySelector('.column-items')?.classList.remove('has-items');
  }
}

// Переключение панели админа
function toggleAdminPanel() {
  const panel = document.getElementById('admin-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// Переключение скрытия карточек других пользователей
function toggleHideOthersCards(checked) {
  hideOthersCards = checked;
  // Отправляем событие всем участникам
  socket.emit('view:settings', {
    sessionId: currentSession.id,
    hideOthersCards,
    hideOthersVotes
  });
  // Сохраняем в localStorage для текущей сессии
  if (currentSession) {
    localStorage.setItem(`hideOthersCards_${currentSession.id}`, hideOthersCards);
  }
  applyViewSettings();
  showToast(checked ? 'Показаны только ваши карточки' : 'Показаны все карточки', 'info');
}

// Переключение скрытия голосов других участников
function toggleHideOthersVotes(checked) {
  hideOthersVotes = checked;
  // Отправляем событие всем участникам
  socket.emit('view:settings', {
    sessionId: currentSession.id,
    hideOthersCards,
    hideOthersVotes
  });
  applyViewSettings();
  applyVoteMode(); // Обновляем голоса голосования
  showToast(checked ? 'Голоса других участников скрыты' : 'Все голоса видны', 'info');
}

// Переключение скрытия голосов админа (для трансляции экрана)
function toggleHideAdminVotes(checked) {
  hideAdminVotes = checked;
  // Сохраняем в localStorage для текущей сессии
  if (currentSession) {
    localStorage.setItem(`hideAdminVotes_${currentSession.id}`, hideAdminVotes);
  }
  applyVoteMode(); // Обновляем голоса голосования
  showToast(checked ? 'Ваши голоса скрыты (для трансляции экрана)' : 'Ваши голоса видны', 'info');
}

// Переключение режима голосования
function toggleVoteMode() {
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    showToast('Режим только для просмотра', 'warning');
    return;
  }

  // Если включаем голосование - показываем подтверждение
  if (!voteMode) {
    showVoteModeConfirmModal();
    return;
  }

  // Если выключаем - просто выключаем
  voteMode = false;
  sessionEnded = true;
  saveSession();

  // Показываем чекбоксы админу для выбора карточек
  document.querySelectorAll('.retro-item').forEach(itemEl => {
    const itemId = itemEl.dataset.id;
    const item = currentSession?.items?.find(i => i.id === itemId);
    if (item) {
      const newHtml = createItemHtml(item);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newHtml;
      const newItemEl = tempDiv.firstElementChild;
      if (newItemEl) {
        itemEl.replaceWith(newItemEl);
        initDraggable(newItemEl);
      }
    }
  });

  // Показываем вкладки
  document.getElementById('session-tabs').style.display = 'flex';

  // Отправляем на сервер
  socket.emit('vote:mode', {
    sessionId: currentSession.id,
    voteMode: false,
    sessionEnded: true
  });

  applyVoteMode();
  showToast('Голосование завершено', 'info');
}

// Модальное окно подтверждения голосования
function showVoteModeConfirmModal() {
  const modal = new bootstrap.Modal(document.getElementById('voteModeConfirmModal'));
  modal.show();

  const confirmBtn = document.getElementById('confirm-start-vote-btn');
  confirmBtn.onclick = () => {
    startVoteMode();
    modal.hide();
  };
}

// Начало режима голосования (после подтверждения)
function startVoteMode() {
  voteMode = true;
  votingStarted = true;
  sessionEnded = false;
  saveSession();

  // Отправляем на сервер
  socket.emit('vote:mode', {
    sessionId: currentSession.id,
    voteMode: true,
    sessionEnded: false
  });

  // Показываем вкладки
  document.getElementById('session-tabs').style.display = 'flex';

  applyVoteMode();
  showToast('Режим голосования включён', 'success');
}

// Сброс режима голосования
function resetVoteMode() {
  const modal = new bootstrap.Modal(document.getElementById('resetVoteModeModal'));
  modal.show();

  const confirmBtn = document.getElementById('confirm-reset-vote-btn');
  confirmBtn.onclick = () => {
    doResetVoteMode();
    modal.hide();
  };
}

// Выполнение сброса голосования
function doResetVoteMode() {
  // Сбрасываем все голоса
  voteModeVotes = {};
  userVoteModeVotes = [];
  voteMode = false;
  votingStarted = false;
  sessionEnded = false;
  
  // Сбрасываем флаг в currentSession
  if (currentSession) {
    currentSession.sessionEnded = false;
  }

  // Сбрасываем все выбранные карточки для обсуждения
  selectedDiscussionItems.clear();

  // Сохраняем в localStorage с сброшенными флагами
  if (currentSession) {
    localStorage.setItem('retroSession', JSON.stringify({
      session: currentSession,
      userId: currentUserId,
      isAdmin,
      sessionEnded: false,
      votingStarted: false
    }));
  }

  // Отправляем на сервер для сброса
  socket.emit('vote:reset', {
    sessionId: currentSession.id
  });

  // Сбрасываем голоса в БД через API
  fetch(`/api/sessions/${currentSession.id}/votes/reset`, {
    method: 'POST'
  }).catch(err => console.error('Error resetting votes:', err));

  // Сбрасываем for_discussion у всех карточек в БД и локально
  if (currentSession?.items) {
    currentSession.items.forEach(item => {
      if (item.for_discussion) {
        item.for_discussion = false;
        // Отправляем на сервер сброс
        fetch(`/api/sessions/${currentSession.id}/items/${item.id}/discussion`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ for_discussion: false, userId: currentUserId })
        }).catch(err => console.error('Error resetting discussion:', err));
      }
    });
  }

  // Перерисовываем карточки без кнопок голосования
  document.querySelectorAll('.retro-item').forEach(itemEl => {
    const itemId = itemEl.dataset.id;
    const item = currentSession?.items?.find(i => i.id === itemId);
    if (item) {
      const newHtml = createItemHtml(item);
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newHtml;
      const newItemEl = tempDiv.firstElementChild;
      if (newItemEl) {
        itemEl.replaceWith(newItemEl);
        initDraggable(newItemEl);
      }
    }
  });

  // Скрываем кнопки голосования
  document.querySelectorAll('.quick-vote-btn').forEach(btn => btn.remove());

  // Если мы во вкладке Обсуждение - переключаем на Brain storm
  if (currentTab === 'discussion') {
    switchToTab('brainstorm');
  }

  // Обновляем счётчик обсуждения
  updateDiscussionCount();

  applyVoteMode();
  showToast('Голосование сброшено', 'success');
}

// Переключение между вкладками Brain storm и Обсуждение
function switchToTab(tabName) {
  currentTab = tabName;

  // Сохраняем в localStorage
  if (currentSession) {
    localStorage.setItem(`retroSessionTab_${currentSession.id}`, tabName);
  }

  // Если переключаемся на обсуждение - запускаем автосохранение
  if (tabName === 'discussion') {
    currentTab = 'discussion';
    startActionPlanAutoSave();

    // Если это админ - переключаем всех пользователей на вкладку обсуждения
    if (isAdmin && currentSession) {
      socket.emit('tab:switch', {
        sessionId: currentSession.id,
        tab: 'discussion',
        isAdmin: true
      });
    }
  } else {
    currentTab = 'brainstorm';
    stopActionPlanAutoSave();
    
    // Если это админ - переключаем всех пользователей на Brain storm
    if (isAdmin && currentSession) {
      socket.emit('tab:switch', {
        sessionId: currentSession.id,
        tab: 'brainstorm',
        isAdmin: true
      });
    }
  }

  const brainstormContainer = document.getElementById('columns-container');
  const discussionContainer = document.getElementById('discussion-container');
  const brainstormTabBtn = document.getElementById('brainstorm-tab-btn');
  const discussionTabBtn = document.getElementById('discussion-tab-btn');

  if (tabName === 'brainstorm') {
    brainstormContainer.style.display = '';
    brainstormContainer.classList.remove('d-none');
    discussionContainer.style.display = 'none';
    discussionContainer.classList.add('d-none');
    brainstormTabBtn.classList.add('active');
    discussionTabBtn.classList.remove('active');
    // Перерисовываем колонки чтобы убрать поля плана действий
    renderColumnsForBrainstorm();
  } else {
    brainstormContainer.style.display = 'none';
    brainstormContainer.classList.add('d-none');
    discussionContainer.style.display = '';
    discussionContainer.classList.remove('d-none');
    brainstormTabBtn.classList.remove('active');
    discussionTabBtn.classList.add('active');
    // Загружаем голоса перед рендером обсуждения
    loadVoteModeVotes();
    renderDiscussionTab();
  }
}

// Добавление пользовательской колонки (для админа)
function addCustomColumn() {
  if (!currentSession || !isAdmin) return;

  // Генерируем уникальный ID для колонки
  const customColumnId = 'custom_' + Date.now();

  // Добавляем колонку в customColumns
  if (!currentSession.customColumns) {
    currentSession.customColumns = [];
  }
  currentSession.customColumns.push({
    id: customColumnId,
    name: 'Дополнительно',
    category: customColumnId
  });

  // Добавляем колонку в template_columns
  if (!currentSession.template_columns || currentSession.template_columns.trim() === '') {
    // Если template_columns пустой, инициализируем из шаблона
    const template = TEMPLATES[currentSession.template] || TEMPLATES['freeform'];
    currentSession.template_columns = JSON.stringify([...template.columns]);
  }

  try {
    let templateColumns = JSON.parse(currentSession.template_columns);
    templateColumns.push({
      id: customColumnId,
      name: 'Дополнительно',
      category: customColumnId
    });
    currentSession.template_columns = JSON.stringify(templateColumns);
  } catch (e) {
    console.error('Error parsing template_columns:', e);
  }

  // Сохраняем в БД через column_headers
  saveCustomColumnsToDB();

  // Сохраняем в localStorage
  saveSession();

  // Перерисовываем колонки и добавляем карточки
  renderColumns();
  renderColumnsForBrainstorm();

  showToast('Колонка добавлена', 'success');
}

// Сохранение пользовательских колонок в БД
async function saveCustomColumnsToDB() {
  if (!currentSession) return;

  try {
    // Получаем существующие column_headers
    let columnHeaders = {};
    if (currentSession.column_headers) {
      columnHeaders = JSON.parse(currentSession.column_headers);
    }

    // Добавляем заголовки из customColumns
    if (currentSession.customColumns) {
      currentSession.customColumns.forEach(col => {
        columnHeaders[col.category] = col.name;
      });
    }

    // Сохраняем в БД - передаём id для custom колонок
    const columnsResponse = await fetch(`/api/sessions/${currentSession.id}/columns`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columns: Object.keys(columnHeaders).map(category => {
          const customCol = currentSession.customColumns?.find(c => c.category === category);
          return {
            category,
            name: columnHeaders[category],
            id: customCol?.id || null
          };
        })
      })
    });

    const columnsResult = await columnsResponse.json();
    if (columnsResult.success) {
      // Обновляем column_headers в текущей сессии
      currentSession.column_headers = JSON.stringify(columnHeaders);
    }

    // Сохраняем template_columns
    if (currentSession.template_columns) {
      await fetch(`/api/sessions/${currentSession.id}/template-columns`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_columns: currentSession.template_columns
        })
      });
    }
  } catch (error) {
    console.error('Error saving custom columns:', error);
  }
}

// Удаление пользовательской колонки (для админа)
async function deleteCustomColumn(category) {
  if (!currentSession || !isAdmin) return;
  if (!confirm('Удалить эту колонку и все карточки в ней?')) return;

  // Вызываем API для удаления колонки (оно отправит WebSocket событие всем клиентам)
  try {
    const response = await fetch(`/api/sessions/${currentSession.id}/columns/${category}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    if (result.success) {
      // Обновляем локально column_headers
      currentSession.column_headers = JSON.stringify(result.column_headers);
      
      // Удаляем колонку из customColumns
      if (currentSession.customColumns) {
        currentSession.customColumns = currentSession.customColumns.filter(col => col.category !== category);
      }
      
      // Удаляем карточки этой категории из items
      if (currentSession.items) {
        currentSession.items = currentSession.items.filter(item => item.category !== category);
      }
      
      // Перерисовываем колонки и добавляем карточки
      renderColumns();
      renderColumnsForBrainstorm();
      
      showToast('Колонка удалена', 'success');
    } else {
      showToast('Ошибка удаления колонки', 'danger');
    }
  } catch (error) {
    console.error('Error deleting column:', error);
    showToast('Ошибка удаления колонки', 'danger');
  }
}

// Перерисовка колонок для Brain storm (без полей плана действий)
function renderColumnsForBrainstorm() {
  if (!currentSession) return;

  // Очищаем колонки и перерисовываем все карточки из currentSession.items
  document.querySelectorAll('.column-items').forEach(col => col.innerHTML = '');
  
  // Сортируем и добавляем элементы
  const items = currentSession?.items || [];
  items.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return (a.order || 0) - (b.order || 0);
  });
  
  // Добавляем все карточки
  items.forEach(item => addItemToColumn(item));
  
  // Загружаем голоса и применяем режим голосования после добавления всех карточек
  setTimeout(() => {
    loadVoteModeVotes();
  }, 100);
}

// Переключение карточки для обсуждения
async function toggleDiscussionItem(itemId) {
  // Блокируем выбор карточек после начала голосования (кроме админа после выключения голосования)
  if (votingStarted && !sessionEnded && !(isAdmin && !voteMode)) {
    showToast('Выбор карточек заблокирован после начала голосования', 'warning');
    return;
  }

  const isSelected = !selectedDiscussionItems.has(itemId);

  if (isSelected) {
    selectedDiscussionItems.add(itemId);
  } else {
    selectedDiscussionItems.delete(itemId);
  }

  // Обновляем for_discussion в currentSession.items
  if (currentSession?.items) {
    const item = currentSession.items.find(i => i.id === itemId);
    if (item) {
      item.for_discussion = isSelected;
    }
  }

  // Сохраняем в БД
  try {
    await fetch(`/api/sessions/${currentSession.id}/items/${itemId}/discussion`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ for_discussion: isSelected })
    });
  } catch (error) {
    console.error('Error updating discussion status:', error);
    // Откатываем локальное изменение при ошибке
    if (isSelected) {
      selectedDiscussionItems.delete(itemId);
    } else {
      selectedDiscussionItems.add(itemId);
    }
    showToast('Ошибка обновления статуса обсуждения', 'danger');
    return;
  }

  // Отправляем событие всем участникам
  socket.emit('discussion:toggle', {
    sessionId: currentSession.id,
    itemId,
    selected: isSelected
  });

  // Обновляем счётчик
  updateDiscussionCount();

  // Если мы во вкладке обсуждения - перерисовываем
  if (currentTab === 'discussion') {
    renderDiscussionTab();
  }

  showToast(selectedDiscussionItems.has(itemId) ? 'Добавлено в обсуждение' : 'Удалено из обсуждения', 'info');
}

// Обновление счётчика карточек в обсуждении
function updateDiscussionCount() {
  const badge = document.getElementById('discussion-count-badge');
  if (badge) {
    badge.textContent = selectedDiscussionItems.size;
  }
}

// Рендер вкладки обсуждения
function renderDiscussionTab() {
  const container = document.getElementById('discussion-items-container');
  if (!container) return;

  if (selectedDiscussionItems.size === 0) {
    container.innerHTML = '<p class="text-muted text-center">Выберите карточки во вкладке "Brain storm" для обсуждения</p>';
    return;
  }

  // Находим выбранные карточки в currentSession.items
  // Используем Set для предотвращения дублирования
  const renderedItemIds = new Set();
  const discussionItemsByCategory = {};

  if (currentSession?.items) {
    currentSession.items.forEach(item => {
      // Проверяем что карточка выбрана для обсуждения и ещё не была добавлена
      if (selectedDiscussionItems.has(item.id) && !renderedItemIds.has(item.id)) {
        const category = item.category || 'general';
        if (!discussionItemsByCategory[category]) {
          discussionItemsByCategory[category] = [];
        }
        discussionItemsByCategory[category].push(item);
        renderedItemIds.add(item.id);
      }
    });
  }

  // Также синхронизируем selectedDiscussionItems с actual items
  // Удаляем из selectedDiscussionItems itemId которых нет в currentSession.items
  selectedDiscussionItems.forEach(itemId => {
    const itemExists = currentSession?.items?.some(i => i.id === itemId);
    if (!itemExists) {
      selectedDiscussionItems.delete(itemId);
    }
  });

  // Проверяем есть ли карточки
  const totalItems = Object.values(discussionItemsByCategory).reduce((sum, items) => sum + items.length, 0);
  if (totalItems === 0) {
    container.innerHTML = '<p class="text-muted text-center">Выбранные карточки не найдены</p>';
    return;
  }

  // Получаем порядок колонок из template_columns
  let columnOrder = [];
  if (currentSession?.template_columns && currentSession.template_columns.trim() !== '') {
    try {
      columnOrder = JSON.parse(currentSession.template_columns);
    } catch (e) {
      console.error('Error parsing template_columns:', e);
    }
  }
  
  // Если нет template_columns, используем шаблон по умолчанию
  if (columnOrder.length === 0) {
    const template = TEMPLATES[currentSession.template] || TEMPLATES['freeform'];
    columnOrder = [...template.columns];
  }

  // Получаем кастомные заголовки
  const columnHeaders = currentSession?.column_headers ? JSON.parse(currentSession.column_headers) : {};

  // Сортируем категории по порядку колонок
  const sortedCategories = columnOrder.map(col => col.category).filter(cat => discussionItemsByCategory[cat]);
  
  // Добавляем категории которых нет в columnOrder (если есть)
  Object.keys(discussionItemsByCategory).forEach(cat => {
    if (!sortedCategories.includes(cat)) {
      sortedCategories.push(cat);
    }
  });

  // Рендерим карточки по категориям
  let html = '';
  sortedCategories.forEach(category => {
    const items = discussionItemsByCategory[category];
    if (!items || items.length === 0) return;

    // Получаем название колонки
    // 1. Сначала пробуем взять из column_headers (кастомные заголовки)
    // 2. Затем из template_columns (оригинальное название из шаблона)
    // 3. Затем из getCategoryName (дефолтное название)
    let columnHeader = columnHeaders[category];
    
    if (!columnHeader && columnOrder.length > 0) {
      const colFromTemplate = columnOrder.find(col => col.category === category);
      if (colFromTemplate && colFromTemplate.name) {
        columnHeader = colFromTemplate.name;
      }
    }
    
    if (!columnHeader) {
      columnHeader = getCategoryName(category);
    }

    // Сортируем items по порядку
    items.sort((a, b) => (a.order || 0) - (b.order || 0));

    html += `
      <div class="discussion-category-section" data-category="${category}">
        <div class="column-header">
          <h5 class="column-title">${columnHeader}</h5>
          <span class="column-badge">${items.length}</span>
        </div>
        <div class="discussion-category-items">
    `;

    items.forEach(item => {
      html += `
        <div class="discussion-item-wrapper" data-item-id="${item.id}">
          <div class="discussion-item-card" data-item-id="${item.id}">
            ${createDiscussionItemHtml(item)}
          </div>
          <div class="discussion-item-plan">
            <div class="action-plan-section">
              <div class="action-plan-header">
                <span class="material-icons" style="font-size: 16px;">assignment</span>
                <strong>План действий</strong>
              </div>
              <div class="action-plan-toolbar" id="toolbar-${item.id}">
                <button class="toolbar-btn" type="button" onclick="formatActionPlan('${item.id}', 'bold')" title="Жирный">
                  <span class="material-icons">format_bold</span>
                </button>
                <button class="toolbar-btn" type="button" onclick="formatActionPlan('${item.id}', 'italic')" title="Курсив">
                  <span class="material-icons">format_italic</span>
                </button>
                <button class="toolbar-btn" type="button" onclick="formatActionPlan('${item.id}', 'underline')" title="Подчёркнутый">
                  <span class="material-icons">format_underlined</span>
                </button>
                <button class="toolbar-btn reset-btn" type="button" onclick="resetActionPlanFormat('${item.id}')" title="Сбросить форматирование">
                  <span class="material-icons">format_clear</span>
                </button>
                <select class="toolbar-select" onchange="formatActionPlan('${item.id}', 'fontName', this.value)" title="Шрифт">
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Courier New">Courier New</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Verdana">Verdana</option>
                </select>
                <select class="toolbar-select" onchange="formatActionPlan('${item.id}', 'fontSize', this.value)" title="Размер">
                  <option value="1">Маленький</option>
                  <option value="3" selected>Средний</option>
                  <option value="5">Большой</option>
                  <option value="7">Огромный</option>
                </select>
                <input type="color" class="toolbar-color" onchange="formatActionPlan('${item.id}', 'foreColor', this.value)" title="Цвет текста" value="#000000">
              </div>
              <div class="action-plan-editor" contenteditable="true"
                   data-item-id="${item.id}"
                   oninput="saveActionPlan('${item.id}', 'text', null, false)"
                   onblur="handleActionPlanBlur('${item.id}')"
                   placeholder="Введите план действий...">${item.action_plan_text || ''}</div>
              <div class="action-plan-fields">
                <div class="action-plan-field">
                  <label><span class="material-icons" style="font-size: 14px;">person</span> Кому:</label>
                  <input type="text" class="form-control form-control-sm"
                         data-item-id="${item.id}"
                         value="${escapeHtml(item.action_plan_who || '')}"
                         onblur="handleActionPlanWhoBlur(event, '${item.id}')"
                         placeholder="ФИО ответственного">
                </div>
                <div class="action-plan-field">
                  <label><span class="material-icons" style="font-size: 14px;">event</span> Когда:</label>
                  <input type="text" class="form-control form-control-sm"
                         data-item-id="${item.id}"
                         value="${escapeHtml(item.action_plan_when || '')}"
                         onblur="handleActionPlanWhenBlur(event, '${item.id}')"
                         placeholder="Срок выполнения">
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Инициализируем drag-n-drop для карточек
  container.querySelectorAll('.retro-item').forEach(item => {
    initDraggable(item);
  });

  // Восстанавливаем данные из localStorage если они есть (резервная копия)
  // Это нужно для случаев когда БД недоступна или данные не успели сохраниться
  const actionPlanEditors = container.querySelectorAll('.action-plan-editor');
  actionPlanEditors.forEach(editor => {
    const itemId = editor.dataset.itemId;
    const savedData = restoreActionPlanFromLocalStorage(itemId);
    if (savedData) {
      // Восстанавливаем текст плана действий
      if (savedData.action_plan_text && editor.innerHTML === (currentSession?.items?.find(i => i.id === itemId)?.action_plan_text || '')) {
        editor.innerHTML = savedData.action_plan_text;
        console.log('[ActionPlan Local] Restored text from localStorage for item:', itemId);
      }
      
      // Восстанавливаем поля "Кому" и "Когда"
      const wrapper = editor.closest('.discussion-item-plan');
      const inputs = wrapper?.querySelectorAll(`input[data-item-id="${itemId}"]`) || [];
      const whoInput = inputs[0];
      const whenInput = inputs[1];
      
      if (whoInput && savedData.action_plan_who) {
        whoInput.value = savedData.action_plan_who;
        console.log('[ActionPlan Local] Restored who from localStorage for item:', itemId);
      }
      if (whenInput && savedData.action_plan_when) {
        whenInput.value = savedData.action_plan_when;
        console.log('[ActionPlan Local] Restored when from localStorage for item:', itemId);
      }
    }
  });

  // Для пользователей делаем поля только для чтения
  if (!isAdmin) {
    container.querySelectorAll('.action-plan-editor').forEach(editor => {
      editor.contentEditable = 'false';
      editor.style.background = '#f5f5f5';
      editor.style.cursor = 'not-allowed';
    });
    container.querySelectorAll('.action-plan-field input').forEach(input => {
      input.readOnly = true;
      input.style.background = '#f5f5f5';
      input.style.cursor = 'not-allowed';
    });
    container.querySelectorAll('.toolbar-btn, .toolbar-select, .toolbar-color').forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
    });
  } else {
    // Запускаем автосохранение только для админа
    startActionPlanAutoSave();
  }

  // Инициализируем изменение размера панелей
  setTimeout(() => {
    initDiscussionResize();
    recalculatePlanWidths();
  }, 100);

  // Восстанавливаем размеры мемов после рендера обсуждения
  setTimeout(() => restoreMemeSizes(), 50);
}

// Инициализация изменения размера панелей обсуждения
function initDiscussionResize() {
  // Изменение размера всего контейнера "Обсуждение"
  const resizeHandle = document.getElementById('discussion-resize-handle');
  const discussionContainer = document.getElementById('discussion-container');
  
  if (!resizeHandle || !discussionContainer) return;
  
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;
  
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = discussionContainer.offsetWidth;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
    e.stopPropagation();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const deltaX = e.clientX - startX;
    const newWidth = startWidth + deltaX;
    
    // Минимальная ширина 600px, максимальная 90% экрана
    const maxWidth = window.innerWidth * 0.9;
    if (newWidth >= 600 && newWidth <= maxWidth) {
      discussionContainer.style.flex = 'none';
      discussionContainer.style.maxWidth = newWidth + 'px';
      // Пересчитываем ширину блоков "План действий"
      recalculatePlanWidths();
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      // После изменения размера контейнера пересчитываем все блоки
      recalculatePlanWidths();
    }
  });
  
  // Изменение размера блока "План действий" (левый край)
  const wrappers = document.querySelectorAll('.discussion-item-wrapper');
  
  wrappers.forEach(wrapper => {
    const plan = wrapper.querySelector('.discussion-item-plan');
    const card = wrapper.querySelector('.discussion-item-card');
    if (!plan || !card) return;
    
    let planIsResizing = false;
    let planStartX = 0;
    let planStartWidth = 0;
    let cardStartWidth = 0;
    
    plan.addEventListener('mousedown', (e) => {
      const rect = plan.getBoundingClientRect();
      const leftEdge = e.clientX <= rect.left + 8;
      
      if (leftEdge) {
        planIsResizing = true;
        planStartX = e.clientX;
        planStartWidth = plan.offsetWidth;
        cardStartWidth = card.offsetWidth;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
        e.stopPropagation();
      }
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!planIsResizing) return;
      
      const deltaX = planStartX - e.clientX; // Инвертируем для правильного направления
      const newPlanWidth = planStartWidth + deltaX;
      const newCardWidth = cardStartWidth - deltaX;
      
      // Минимальная ширина 250px для каждой панели
      if (newPlanWidth >= 250 && newCardWidth >= 250) {
        plan.style.flex = 'none';
        plan.style.width = newPlanWidth + 'px';
        card.style.flex = 'none';
        card.style.width = newCardWidth + 'px';
      } else if (newPlanWidth < 250) {
        // План действий слишком маленький - фиксируем на минимуме
        plan.style.flex = 'none';
        plan.style.width = '250px';
        card.style.flex = 'none';
        card.style.width = (wrapper.offsetWidth - 250 - 10) + 'px';
      } else if (newCardWidth < 250) {
        // Карточка слишком маленькая - фиксируем на минимуме, план действий занимает остальное
        card.style.flex = 'none';
        card.style.width = '250px';
        plan.style.flex = 'none';
        plan.style.width = (wrapper.offsetWidth - 250 - 10) + 'px';
      }
    });
    
    document.addEventListener('mouseup', () => {
      if (planIsResizing) {
        planIsResizing = false;
        document.body.style.cursor = '';
      }
    });
  });
  
  // Обработчик изменения размера окна
  window.addEventListener('resize', () => {
    recalculatePlanWidths();
  });
}

// Пересчёт ширины блоков "План действий" при изменении размера контейнера
function recalculatePlanWidths() {
  const wrappers = document.querySelectorAll('.discussion-item-wrapper');
  wrappers.forEach(wrapper => {
    const plan = wrapper.querySelector('.discussion-item-plan');
    const card = wrapper.querySelector('.discussion-item-card');
    if (!plan || !card) return;
    
    // План действий занимает оставшееся место после карточки
    const wrapperWidth = wrapper.offsetWidth;
    const cardWidth = card.offsetWidth;
    const newPlanWidth = wrapperWidth - cardWidth - 10; // 10px gap
    
    if (newPlanWidth >= 250) {
      plan.style.flex = 'none';
      plan.style.width = newPlanWidth + 'px';
    }
  });
}


// Применение настроек отображения
function applyViewSettings() {
  let visibleCount = 0;
  let hiddenCount = 0;
  
  // Обновляем видимость карточек
  document.querySelectorAll('.retro-item').forEach(item => {
    const authorElement = item.querySelector('.retro-item-author');
    if (!authorElement) return;

    // Получаем только текст автора (второй child node после иконки)
    // childNodes[0] = text node (пробел), childNodes[1] = material-icons, childNodes[2] = текст автора
    let author = '';
    authorElement.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) author = text;
      }
    });
    
    // Получаем имя текущего пользователя без префикса
    const currentUserName = currentUserId?.replace(/^(admin_|user_)/, '') || '';

    // Админ всегда видит все карточки
    if (isAdmin) {
      item.style.display = '';
      visibleCount++;
    } else if (hideOthersCards) {
      // Пользователь видит только свои карточки
      if (author === currentUserName) {
        item.style.display = '';
        visibleCount++;
      } else {
        item.style.display = 'none';
        hiddenCount++;
      }
    } else {
      // Все видят все карточки
      item.style.display = '';
      visibleCount++;
    }
  });

  // Обновляем видимость голосов (реакций)
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    if (hideOthersVotes && !btn.classList.contains('active')) {
      btn.style.opacity = '0.3';
    } else {
      btn.style.opacity = '1';
    }
  });

  // Обновляем чекбоксы
  const hideCardsCheckbox = document.getElementById('hide-others-cards');
  const hideVotesCheckbox = document.getElementById('hide-others-votes');
  const hideAdminVotesCheckbox = document.getElementById('hide-admin-votes');
  if (hideCardsCheckbox) hideCardsCheckbox.checked = hideOthersCards;
  if (hideVotesCheckbox) hideVotesCheckbox.checked = hideOthersVotes;
  if (hideAdminVotesCheckbox) hideAdminVotesCheckbox.checked = hideAdminVotes;
}

// Применение режима голосования
function applyVoteMode() {
  const voteModeBtn = document.getElementById('vote-mode-btn');
  if (voteModeBtn) {
    voteModeBtn.classList.toggle('btn-success', voteMode);
    voteModeBtn.classList.toggle('btn-light', !voteMode);
    voteModeBtn.innerHTML = voteMode
      ? '<span class="material-icons" style="font-size: 16px; vertical-align: middle;">check</span> Стоп'
      : '<span class="material-icons" style="font-size: 16px; vertical-align: middle;">thumb_up</span> Голосовать';
  }

  // Показываем кнопку голосования на карточках (всегда если есть голоса)
  document.querySelectorAll('.retro-item').forEach(item => {
    let voteBtn = item.querySelector('.quick-vote-btn');
    const itemId = item.dataset.id;

    // Проверяем условия для скрытия голосов
    const adminHideOwnVote = hideAdminVotes && isAdmin && userVoteModeVotes.includes(itemId);

    // Если скрытие голосов включено, показываем только свой голос
    let voteCount = 0;
    let showMyVoteOnly = false;

    if (hideOthersVotes && !isAdmin) {
      // Обычный пользователь видит только свой голос
      showMyVoteOnly = true;
    }

    if (showMyVoteOnly) {
      voteCount = userVoteModeVotes.includes(itemId) ? 1 : 0;
    } else {
      voteCount = voteModeVotes[itemId] || 0;
    }

    // Показываем кнопку если есть голоса ИЛИ режим голосования активен
    const hasVotes = voteModeVotes[itemId] > 0;
    const showButton = voteMode || hasVotes;

    if (showButton) {
      if (!voteBtn) {
        // Создаём кнопку голосования
        voteBtn = document.createElement('button');
        voteBtn.className = 'quick-vote-btn';
        voteBtn.innerHTML = '<span class="material-icons">thumb_up</span><span class="vote-count">' + voteCount + '</span>';
        voteBtn.onclick = () => quickVote(itemId);
        item.appendChild(voteBtn);
      } else {
        // Обновляем счётчик
        const countSpan = voteBtn.querySelector('.vote-count');
        if (countSpan) countSpan.textContent = voteCount;
      }

      // Обновляем активное состояние
      // Если hideAdminVotes включён и админ проголосовал - кнопка синяя вместо красной
      const isActive = userVoteModeVotes.includes(itemId);
      if (isActive) {
        voteBtn.classList.add('active');
        // Если админ скрыл свой голос - меняем цвет на синий
        if (adminHideOwnVote) {
          voteBtn.classList.add('admin-hidden');
        } else {
          voteBtn.classList.remove('admin-hidden');
        }
      } else {
        voteBtn.classList.remove('active');
        voteBtn.classList.remove('admin-hidden');
      }

      // Кнопки активны только когда режим голосования включён
      if (voteMode) {
        voteBtn.style.display = 'flex';
        voteBtn.style.pointerEvents = 'auto'; // Разрешаем клики
        voteBtn.style.opacity = '1';
      } else {
        // После выключения режима - показываем но блокируем
        voteBtn.style.display = 'flex';
        voteBtn.style.pointerEvents = 'none'; // Блокируем клики
        voteBtn.style.opacity = '0.7';
      }
    } else {
      if (voteBtn) {
        voteBtn.style.display = 'none';
      }
    }
  });
}

// Быстрое голосование (крупный лайк)
function quickVote(itemId) {
  // Голосование разрешено только когда активен режим голосования (voteMode === true)
  if (!voteMode) {
    showToast('Голосование остановлено админом', 'warning');
    return;
  }

  // Проверяем, использовал ли уже голос на этой карточке
  const alreadyVoted = userVoteModeVotes.includes(itemId);

  if (alreadyVoted) {
    // Забираем голос обратно
    userVoteModeVotes = userVoteModeVotes.filter(id => id !== itemId);
    voteModeVotes[itemId] = Math.max(0, (voteModeVotes[itemId] || 1) - 1);
    if (voteModeVotes[itemId] === 0) delete voteModeVotes[itemId];
  } else {
    // Проверяем лимит
    if (userVoteModeVotes.length >= voteLimit) {
      showToast(`Максимум ${voteLimit} голосов!`, 'warning');
      return;
    }

    // Отдаём голос
    userVoteModeVotes.push(itemId);
    voteModeVotes[itemId] = (voteModeVotes[itemId] || 0) + 1;
  }

  // Отправляем на сервер
  socket.emit('vote:submit', {
    sessionId: currentSession.id,
    itemId,
    userId: currentUserId,
    voted: !alreadyVoted
  });

  // Обновляем UI сразу для отзывчивости
  applyVoteMode();
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
      <span class="timer-time" id="timer-time">00:00</span>
      <span class="material-icons">timer</span>
      ${isAdmin ? `
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="display: flex; gap: 2px;">
            <button class="btn btn-sm btn-light" onclick="startTimer()" title="Запустить">
              <span class="material-icons">play_arrow</span>
            </button>
            <button class="btn btn-sm btn-warning" onclick="stopTimer()" title="Пауза">
              <span class="material-icons">pause</span>
            </button>
            <button class="btn btn-sm btn-danger" onclick="resetTimer()" title="Сброс">
              <span class="material-icons">refresh</span>
            </button>
          </div>
          <input type="number" class="timer-input" id="timer-minutes" min="1" max="60" value="5" placeholder="Мин">
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
  console.log('[Timer] Display updated:', { timerSeconds, timerRunning, display: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` });

  if (timerRunning) {
    display?.classList.add('timer-running');
  } else {
    display?.classList.remove('timer-running');
  }
}

function startTimer() {
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    showToast('Режим только для просмотра', 'warning');
    return;
  }

  if (!isAdmin) return;

  const minutes = parseInt(document.getElementById('timer-minutes')?.value) || 5;
  if (timerSeconds === 0) {
    timerSeconds = minutes * 60;
  }

  socket.emit('timer:start', { sessionId: currentSession.id, seconds: timerSeconds });
}

function stopTimer() {
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    showToast('Режим только для просмотра', 'warning');
    return;
  }

  if (!isAdmin) return;
  socket.emit('timer:stop', { sessionId: currentSession.id });
}

function resetTimer() {
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    showToast('Режим только для просмотра', 'warning');
    return;
  }

  if (!isAdmin) return;
  socket.emit('timer:reset', { sessionId: currentSession.id });
}

function startTimerInterval() {
  stopTimerInterval();
  console.log('[Timer] Starting interval with seconds:', timerSeconds, 'running:', timerRunning);
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
  const countInline = document.getElementById('participants-count-inline');
  
  if (!container) return;

  // Обновляем цифру в заголовке
  if (countInline) {
    countInline.textContent = participants.size;
  }

  if (participants.size === 0) {
    container.innerHTML = '<span class="text-muted">Нет участников</span>';
    return;
  }

  // Цвета для аватаров участников
  const avatarColors = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)'
  ];

  container.innerHTML = `
    <div class="participants-avatars">
      ${Array.from(participants.values()).map((p, index) => `
        <div class="participant-badge">
          <div class="participant-avatar" style="background: ${avatarColors[index % avatarColors.length]}">${p.name.charAt(0).toUpperCase()}</div>
          ${escapeHtml(p.name)}
        </div>
      `).join('')}
    </div>
  `;
}

// Завершение сессии
function endSession() {
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    showToast('Режим только для просмотра', 'warning');
    return;
  }

  const modal = new bootstrap.Modal(document.getElementById('endSessionModal'));
  modal.show();
}

// Подтверждение завершения
async function confirmEndSession() {
  // Блокируем в режиме просмотра
  if (isViewOnly) {
    showToast('Режим только для просмотра', 'warning');
    return;
  }

  // Сохраняем все планы действий перед завершением
  await saveAllActionPlans();

  try {
    await fetch(`/api/sessions/${currentSession.id}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: '', actionItems: [] })
    });

    // Устанавливаем флаг завершения сессии
    sessionEnded = true;
    saveSession();

    // Очищаем localStorage планов действий после успешного завершения сессии
    // Данные уже сохранены на сервере
    if (currentSession?.id) {
      clearAllActionPlansFromLocalStorage(currentSession.id);
    }

    bootstrap.Modal.getInstance(document.getElementById('endSessionModal')).hide();
    // Очищаем localStorage после завершения сессии
    localStorage.removeItem('retroSession');
    showToast('Сессия завершена!', 'success');

    setTimeout(() => goHome(true), 2000);
  } catch (error) {
    console.error('Error ending session:', error);
    showToast('Ошибка завершения сессии', 'danger');
  }
}

// Сохранение всех планов действий
async function saveAllActionPlans() {
  if (!currentSession) return;
  
  const editors = document.querySelectorAll('.action-plan-editor');
  const promises = [];
  
  editors.forEach(editor => {
    const itemId = editor.dataset.itemId;
    if (!itemId) return;

    const wrapper = editor.closest('.discussion-item-plan') || editor.closest('.action-plan-section');
    const inputs = wrapper?.querySelectorAll(`input[data-item-id="${itemId}"]`) || [];
    const whoInput = inputs[0];
    const whenInput = inputs[1];

    const data = {
      action_plan_text: editor.innerHTML,
      action_plan_who: whoInput?.value || null,
      action_plan_when: whenInput?.value || null
    };
    
    promises.push(
      fetch(`/api/sessions/${currentSession.id}/items/${itemId}/action-plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
    );
  });
  
  await Promise.all(promises);
  console.log('[EndSession] All action plans saved');
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
    checkActiveSession(); // Обновляем кнопки активных сессий
  } catch (error) {
    console.error('Error ending session:', error);
    showToast('Ошибка завершения сессии', 'danger');
  }
}

// Экспорт результатов
async function exportResults(format) {
  try {
    // Загружаем полную сессию для получения column_headers и template_columns
    const sessionResponse = await fetch(`/api/sessions/${currentSession.id}`);
    const fullSession = await sessionResponse.json();
    
    console.log('[Export] Full session loaded:', {
      column_headers: fullSession.column_headers,
      template_columns: fullSession.template_columns
    });

    // Обновляем currentSession актуальными данными
    // Парсим column_headers если это строка
    currentSession.column_headers = fullSession.column_headers;
    if (typeof fullSession.column_headers === 'string') {
      try {
        currentSession.column_headers = JSON.parse(fullSession.column_headers);
      } catch (e) {
        console.error('[Export] Failed to parse column_headers:', e);
        currentSession.column_headers = {};
      }
    }
    currentSession.template_columns = fullSession.template_columns;
    currentSession.customColumns = fullSession.customColumns;
    
    const itemsResponse = await fetch(`/api/sessions/${currentSession.id}/items`);
    let items = await itemsResponse.json();

    console.log('[Export] Items loaded:', items.length, 'Sample:', items.slice(0, 2).map(i => ({ 
      id: i.id, 
      category: i.category, 
      text: i.text?.substring(0, 30),
      merged_parts_data: i.merged_parts_data ? '✅' : '❌'
    })));

    // Загружаем голоса голосования
    const votesResponse = await fetch(`/api/sessions/${currentSession.id}/votes`);
    const votesData = await votesResponse.json();

    // Добавляем vote_mode_votes к каждой карточке
    items = items.map(item => ({
      ...item,
      vote_mode_votes: votesData[item.id] || []
    }));

    // Отладка - логируем объединённые карточки
    const mergedItems = items.filter(i => i.text && i.text.includes('─────────────'));
    console.log('[Export] Found merged items:', mergedItems.length, mergedItems.map(i => ({ 
      id: i.id, 
      category: i.category,
      has_merged_parts_data: !!i.merged_parts_data,
      merged_parts_data_preview: i.merged_parts_data?.substring(0, 50)
    })));

    const data = {
      session: currentSession,
      items,
      exportedAt: new Date().toISOString()
    };

    // Вспомогательная функция для получения названия колонки
    function getColumnHeader(col, columnHeaders) {
      return columnHeaders[col.category] || col.name;
    }
    
    // Вспомогательная функция для рендеринга содержимого карточки
    function renderCardContent(item) {
      let html = '';
      const isMerged = item.text && item.text.includes('─────────────');
      let mergedPartsData = null;
      if (item.merged_parts_data) {
        try {
          mergedPartsData = typeof item.merged_parts_data === 'string' 
            ? JSON.parse(item.merged_parts_data) 
            : item.merged_parts_data;
        } catch (e) {
          console.error('[Export] Failed to parse merged_parts_data:', e);
        }
      }

      if (isMerged) {
        const parts = item.text.split(/\n{1,2}─────────────\n{1,2}/).filter(p => p.trim());
        if (mergedPartsData && mergedPartsData.length > 0) {
          mergedPartsData.forEach((part, index) => {
            const partText = part.text || parts[index] || '';
            const partMemeMatch = partText.match(/!\[(.*?)\]\((.*?)\)/);
            if (partMemeMatch) {
              html += `<img src="${escapeHtml(partMemeMatch[2])}" alt="${escapeHtml(partMemeMatch[1])}" class="card-meme" style="margin-bottom: 8px;">\n`;
              const remainingText = partText.replace(/!\[(.*?)\]\((.*?)\)/g, '').trim();
              if (remainingText) {
                html += `<div style="margin-bottom: 8px; padding: 8px; background: #f9f9f9; border-left: 3px solid #6366f1;">${index + 1}. ${escapeHtml(remainingText)}</div>\n`;
              }
            } else if (partText.startsWith('😄') || partText.startsWith('😊') || partText.startsWith('😐') || partText.startsWith('😫') || partText.startsWith('💀')) {
              html += `<div class="card-emoji">${escapeHtml(partText)}</div>\n`;
            } else {
              html += `<div style="margin-bottom: 8px; padding: 8px; background: #f9f9f9; border-left: 3px solid #6366f1;">${index + 1}. ${escapeHtml(partText)}</div>\n`;
            }
          });
          html += `<div style="margin-top: 8px; padding: 4px 8px; background: #e5e7eb; border-radius: 4px; display: inline-block; font-size: 0.75rem; color: #666;"><span style="display: flex; align-items: center; gap: 4px;"><span class="material-icons" style="font-size: 12px;">call_merge</span>Объединённая карточка (${parts.length} частей)</span></div>\n`;
        } else {
          parts.forEach((part, index) => {
            const partMemeMatch = part.match(/!\[(.*?)\]\((.*?)\)/);
            if (partMemeMatch) {
              html += `<img src="${escapeHtml(partMemeMatch[2])}" alt="${escapeHtml(partMemeMatch[1])}" class="card-meme" style="margin-bottom: 8px;">\n`;
              const remainingText = part.replace(/!\[(.*?)\]\((.*?)\)/g, '').trim();
              if (remainingText) {
                html += `<div style="margin-bottom: 8px; padding: 8px; background: #f9f9f9; border-left: 3px solid #6366f1;">${index + 1}. ${escapeHtml(remainingText)}</div>\n`;
              }
            } else if (part.startsWith('😄') || part.startsWith('😊') || part.startsWith('😐') || part.startsWith('😫') || part.startsWith('💀')) {
              html += `<div class="card-emoji">${escapeHtml(part)}</div>\n`;
            } else {
              html += `<div style="margin-bottom: 8px; padding: 8px; background: #f9f9f9; border-left: 3px solid #6366f1;">${index + 1}. ${escapeHtml(part)}</div>\n`;
            }
          });
          html += `<div style="margin-top: 8px; padding: 4px 8px; background: #e5e7eb; border-radius: 4px; display: inline-block; font-size: 0.75rem; color: #666;"><span style="display: flex; align-items: center; gap: 4px;"><span class="material-icons" style="font-size: 12px;">call_merge</span>Объединённая карточка (${parts.length} частей)</span></div>\n`;
        }
      } else if (item.meme_url) {
        html += `<img src="${escapeHtml(item.meme_url)}" alt="Meme" class="card-meme">\n`;
      } else if (item.text) {
        const markdownMemeMatch = item.text.match(/!\[(.*?)\]\((.*?)\)/g);
        if (markdownMemeMatch && markdownMemeMatch.length > 0) {
          markdownMemeMatch.forEach(match => {
            const [, alt, url] = match.match(/!\[(.*?)\]\((.*?)\)/);
            html += `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" class="card-meme">\n`;
          });
          const remainingText = item.text.replace(/!\[(.*?)\]\((.*?)\)/g, '').trim();
          if (remainingText) {
            html += `<div style="margin-top: 8px;">${escapeHtml(remainingText)}</div>\n`;
          }
        } else if (item.text.startsWith('😄') || item.text.startsWith('😊') || item.text.startsWith('😐') || item.text.startsWith('😫') || item.text.startsWith('💀')) {
          html += `<div class="card-emoji">${escapeHtml(item.text)}</div>\n`;
        } else {
          html += `<div>${escapeHtml(item.text)}</div>\n`;
        }
      }
      return html;
    }

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      downloadBlob(blob, `retro-${currentSession.id}.json`);
    } else if (format === 'pdf') {
      // PDF экспорт - HTML формат для печати (по аналогии с Confluence)
      let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Ретроспектива: ${escapeHtml(currentSession.name)}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .card { break-inside: avoid; }
    }
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
    h2 { color: #6366f1; margin-top: 30px; page-break-before: auto; }
    .session-info { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .tab-section { margin-bottom: 40px; }
    .columns-container { display: flex; gap: 15px; }
    .discussion-single-column { display: block; }
    .column { flex: 1; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 15px; min-width: 0; }
    .column-header { padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; text-align: center; color: #000; font-weight: bold; }
    .card { padding: 12px; margin: 10px 0; border-radius: 8px; border-left: 5px solid; page-break-inside: avoid; }
    .card-content { margin: 10px 0; word-wrap: break-word; }
    .card-meme { max-width: 100%; max-height: 200px; border-radius: 6px; margin: 8px 0; }
    .card-emoji { font-size: 2.5rem; text-align: center; margin: 10px 0; }
    .reactions { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; align-items: center; }
    .reaction { background: #e5e7eb; padding: 4px 10px; border-radius: 16px; font-size: 0.875rem; display: flex; align-items: center; gap: 4px; }
    .vote-reaction { background: #ef4444; color: white; padding: 6px 12px; border-radius: 50%; font-size: 0.875rem; display: inline-flex; align-items: center; gap: 4px; min-width: 40px; justify-content: center; }
    .vote-reaction .icon { font-size: 1.2rem; }
    .action-plan { background: #f0f2ff; border: 1px solid #6366f1; border-radius: 6px; padding: 10px; margin-top: 10px; }
    .action-plan-header { color: #6366f1; font-weight: bold; margin-bottom: 8px; }
    .discussion-card { background: #fff8e1; border-left-color: #f59e0b !important; }
    /* Цвета карточек по категориям */
    .card.template-classic-start { background-color: rgba(16, 185, 129, 0.08); border-left-color: #10b981; }
    .card.template-classic-stop { background-color: rgba(239, 68, 68, 0.08); border-left-color: #ef4444; }
    .card.template-classic-continue { background-color: rgba(59, 130, 246, 0.08); border-left-color: #3b82f6; }
    .card.template-mad-sad-glad-mad { background-color: rgba(239, 68, 68, 0.08); border-left-color: #ef4444; }
    .card.template-mad-sad-glad-sad { background-color: rgba(245, 158, 11, 0.08); border-left-color: #f59e0b; }
    .card.template-mad-sad-glad-glad { background-color: rgba(16, 185, 129, 0.08); border-left-color: #10b981; }
    .card.template-good-bad-ideas-good { background-color: rgba(16, 185, 129, 0.08); border-left-color: #10b981; }
    .card.template-good-bad-ideas-bad { background-color: rgba(239, 68, 68, 0.08); border-left-color: #ef4444; }
    .card.template-good-bad-ideas-ideas { background-color: rgba(245, 158, 11, 0.08); border-left-color: #f59e0b; }
    .card.template-kiss-keep { background-color: rgba(59, 130, 246, 0.08); border-left-color: #3b82f6; }
    .card.template-kiss-improve { background-color: rgba(245, 158, 11, 0.08); border-left-color: #f59e0b; }
    .card.template-kiss-start { background-color: rgba(16, 185, 129, 0.08); border-left-color: #10b981; }
    .card.template-kiss-stop { background-color: rgba(239, 68, 68, 0.08); border-left-color: #ef4444; }
    .card.template-sailboat-wind { background-color: rgba(6, 182, 212, 0.08); border-left-color: #06b6d4; }
    .card.template-sailboat-anchor { background-color: rgba(245, 158, 11, 0.08); border-left-color: #f59e0b; }
    .card.template-sailboat-rocks { background-color: rgba(107, 114, 128, 0.08); border-left-color: #6b7280; }
    .card.template-sailboat-island { background-color: rgba(16, 185, 129, 0.08); border-left-color: #10b981; }
    .card.template-freeform-general { background-color: rgba(99, 102, 241, 0.08); border-left-color: #6366f1; }
    /* Цвета заголовков по шаблонам */
    .header-template-classic-start { background-color: #10b981; }
    .header-template-classic-stop { background-color: #ef4444; }
    .header-template-classic-continue { background-color: #3b82f6; }
    .header-template-mad-sad-glad-mad { background-color: #ef4444; }
    .header-template-mad-sad-glad-sad { background-color: #f59e0b; }
    .header-template-mad-sad-glad-glad { background-color: #10b981; }
    .header-template-good-bad-ideas-good { background-color: #10b981; }
    .header-template-good-bad-ideas-bad { background-color: #ef4444; }
    .header-template-good-bad-ideas-ideas { background-color: #f59e0b; }
    .header-template-kiss-keep { background-color: #3b82f6; }
    .header-template-kiss-improve { background-color: #f59e0b; }
    .header-template-kiss-start { background-color: #10b981; }
    .header-template-kiss-stop { background-color: #ef4444; }
    .header-template-sailboat-wind { background-color: #06b6d4; }
    .header-template-sailboat-anchor { background-color: #f59e0b; }
    .header-template-sailboat-rocks { background-color: #6b7280; }
    .header-template-sailboat-island { background-color: #10b981; }
    .header-template-freeform-general { background-color: #6366f1; }
    /* Универсальный стиль для кастомных колонок */
    .column-header[class*="header-template-freeform-"] { background-color: #6366f1; }
  </style>
</head>
<body>
  <h1>🎯 Ретроспектива: ${escapeHtml(currentSession.name)}</h1>
  
  <div class="session-info">
    <p><strong>ID:</strong> ${currentSession.id}<br>
    <strong>Дата:</strong> ${new Date(currentSession.created_at).toLocaleString()}<br>
    <strong>Статус:</strong> ${currentSession.status}<br>
    <strong>Шаблон:</strong> ${currentSession.template}<br>
    <strong>Ведущий:</strong> ${escapeHtml(currentSession.admin_name)}</p>
  </div>

  <div class="tab-section">
    <h2>🧠 Brain Storm</h2>
    <div class="columns-container">
`;

      const template = TEMPLATES[currentSession.template] || TEMPLATES['freeform'];
      const templateName = currentSession.template;

      // Получаем кастомные заголовки (уже распаршено в начале функции)
      const columnHeaders = currentSession.column_headers || {};

      // Собираем все колонки: стандартные из шаблона + кастомные
      let allColumns = [...template.columns];

      // Используем template_columns если есть (уже распаршено в начале функции)
      if (currentSession.template_columns && currentSession.template_columns.trim() !== '') {
        try {
          allColumns = typeof currentSession.template_columns === 'string'
            ? JSON.parse(currentSession.template_columns)
            : currentSession.template_columns;
        } catch (e) {
          console.error('Error parsing template_columns:', e);
        }
      }

      // Добавляем кастомные колонки, если они есть
      if (currentSession.customColumns && currentSession.customColumns.length > 0) {
        currentSession.customColumns.forEach(customCol => {
          if (!allColumns.find(col => col.category === customCol.category)) {
            allColumns.push({
              id: customCol.id,
              name: customCol.name,
              category: customCol.category,
              icon: customCol.icon || 'add_column'
            });
          }
        });
      }

      // Экспорт по всем колонкам с полным содержимым
      allColumns.forEach(col => {
        const colItems = items.filter(i => i.category === col.category);
        const categoryClass = `template-${templateName}-${col.category}`;
        const headerClass = `header-${templateName}-${col.category.replace(/\s+/g, '-').toLowerCase()}`;
        const columnHeader = getColumnHeader(col, columnHeaders);

        html += `      <div class="column">
        <div class="column-header ${headerClass}">
          <h3>${escapeHtml(columnHeader)}</h3>
        </div>
`;

        colItems.forEach(item => {
          html += `        <div class="card ${categoryClass}">
`;
          html += `          <div style="font-size: 0.75rem; color: #666; margin-bottom: 8px;">
            <span style="display: flex; align-items: center; gap: 4px;">
              <span style="font-weight: bold;">👤 ${escapeHtml(item.author)}</span>
            </span>
            <span style="color: #999; margin-left: 10px;">📅 ${new Date(item.created_at).toLocaleString()}</span>
          </div>
`;
          html += `          <div class="card-content">\n`;
          html += renderCardContent(item);
          html += `          </div>\n`;

          // Реакции
          if (item.reactions) {
            const reactions = typeof item.reactions === 'string' ? JSON.parse(item.reactions) : item.reactions;
            const emojiMap = {
              'like':'👍', 'dislike':'👎', 'heart':'❤️', 'fire':'🔥', 'party':'🎉',
              'happy':'😄', 'sad':'😢', 'angry':'😡', 'think':'🤔', 'poop':'💩',
              'hundred':'💯', 'pray':'🙏', 'laugh':'🤣', 'love':'😍', 'surprised':'😮'
            };
            const activeReactions = Object.entries(reactions).filter(([_, count]) => count > 0);
            if (activeReactions.length > 0) {
              html += `          <div class="reactions">\n`;
              activeReactions.forEach(([name, count]) => {
                html += `            <span class="reaction">${emojiMap[name] || name} ${count}</span>\n`;
              });
              html += `          </div>\n`;
            }
          }

          // Голоса голосования (круглые красные лайки)
          if (item.vote_mode_votes) {
            const voteCount = typeof item.vote_mode_votes === 'string' ?
              JSON.parse(item.vote_mode_votes).length :
              (Array.isArray(item.vote_mode_votes) ? item.vote_mode_votes.length : 0);
            if (voteCount > 0) {
              html += `          <div class="reactions">\n`;
              html += `            <span class="vote-reaction"><span class="icon">👍</span> ${voteCount}</span>\n`;
              html += `          </div>\n`;
            }
          }

          html += `        </div>\n`;
        });

        html += `      </div>\n`;
      });

      html += `    </div>
  </div>

  <div class="tab-section">
    <h2>💬 Обсуждение</h2>
    <div class="discussion-single-column">
`;

      // Обсуждение - выбранные карточки в один столбец
      const discussionItems = items.filter(i => i.for_discussion);
      discussionItems.sort((a, b) => (a.order || 0) - (b.order || 0));

      discussionItems.forEach(item => {
        const categoryClass = `template-${templateName}-${item.category}`;
        
        // Получаем название колонки с учётом кастомных заголовков (как в Brain Storm)
        let columnHeader = columnHeaders[item.category];
        if (!columnHeader && allColumns) {
          const colFromAllColumns = allColumns.find(c => c.category === item.category);
          if (colFromAllColumns && colFromAllColumns.name) {
            columnHeader = colFromAllColumns.name;
          }
        }
        if (!columnHeader) {
          const template_col = template.columns.find(c => c.category === item.category);
          columnHeader = template_col ? template_col.name : item.category;
        }

        html += `      <div class="card discussion-card ${categoryClass}">
`;
        html += `        <div style="background: #f59e0b; color: #000; padding: 8px 12px; border-radius: 6px 6px 0 0; margin: -12px -12px 12px -12px; font-weight: bold; text-align: center;">
          ${escapeHtml(columnHeader)}
        </div>
`;
        html += `        <div style="font-size: 0.75rem; color: #666; margin-bottom: 8px;">
          <span style="display: flex; align-items: center; gap: 4px;">
            <span style="font-weight: bold;">👤 ${escapeHtml(item.author)}</span>
          </span>
          <span style="color: #999; margin-left: 10px;">📅 ${new Date(item.created_at).toLocaleString()}</span>
        </div>
`;
        html += `        <div class="card-content">\n`;
        html += renderCardContent(item);
        html += `        </div>\n`;

        // Реакции
        if (item.reactions) {
          const reactions = typeof item.reactions === 'string' ? JSON.parse(item.reactions) : item.reactions;
          const emojiMap = {
            'like':'👍', 'dislike':'👎', 'heart':'❤️', 'fire':'🔥', 'party':'🎉',
            'happy':'😄', 'sad':'😢', 'angry':'😡', 'think':'🤔', 'poop':'💩',
            'hundred':'💯', 'pray':'🙏', 'laugh':'🤣', 'love':'😍', 'surprised':'😮'
          };
          const activeReactions = Object.entries(reactions).filter(([_, count]) => count > 0);
          if (activeReactions.length > 0) {
            html += `        <div class="reactions">\n`;
            activeReactions.forEach(([name, count]) => {
              html += `          <span class="reaction">${emojiMap[name] || name} ${count}</span>\n`;
            });
            html += `        </div>\n`;
          }
        }

        // Голоса голосования
        if (item.vote_mode_votes) {
          const voteCount = typeof item.vote_mode_votes === 'string' ?
            JSON.parse(item.vote_mode_votes).length :
            (Array.isArray(item.vote_mode_votes) ? item.vote_mode_votes.length : 0);
          if (voteCount > 0) {
            html += `        <div class="reactions">\n`;
            html += `          <span class="vote-reaction"><span class="icon">👍</span> ${voteCount}</span>\n`;
            html += `        </div>\n`;
          }
        }

        // План действий
        if (item.action_plan_text || item.action_plan_who || item.action_plan_when) {
          html += `        <div class="action-plan">
          <div class="action-plan-header">📋 План действий</div>
`;
          if (item.action_plan_text) {
            html += `            <div style="margin-bottom: 8px;"><strong>Текст:</strong> ${item.action_plan_text}</div>\n`;
          }
          if (item.action_plan_who) {
            html += `            <div style="margin-bottom: 8px;"><strong>👤 Кому:</strong> ${escapeHtml(item.action_plan_who)}</div>\n`;
          }
          if (item.action_plan_when) {
            html += `            <div><strong>📅 Когда:</strong> ${escapeHtml(item.action_plan_when)}</div>\n`;
          }
          html += `        </div>\n`;
        }

        html += `      </div>\n`;
      });

      if (discussionItems.length === 0) {
        html += `      <p style="color: #999; text-align: center; padding: 40px;">Нет карточек для обсуждения</p>\n`;
      }

      html += `    </div>
  </div>
  <script>window.print();<\/script>
</body>
</html>`;

      const blob = new Blob([html], { type: 'text/html' });
      downloadBlob(blob, `retro-${currentSession.id}-print.html`);
    } else if (format === 'confluence') {
      // Confluence экспорт - HTML формат с полным сохранением структуры
      let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Ретроспектива: ${escapeHtml(currentSession.name)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
    h2 { color: #6366f1; margin-top: 30px; }
    .session-info { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    .tab-section { margin-bottom: 40px; }
    .columns-container { display: flex; gap: 15px; }
    .discussion-single-column { display: block; }
    .column { flex: 1; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 15px; }
    .column-header { padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; text-align: center; color: #333; font-weight: bold; }
    .column-header h3 { margin: 0; color: inherit; }
    /* Цвета заголовков по шаблонам */
    .header-template-classic-start { background-color: #10b981; }
    .header-template-classic-stop { background-color: #ef4444; }
    .header-template-classic-continue { background-color: #3b82f6; }
    .header-template-mad-sad-glad-mad { background-color: #ef4444; }
    .header-template-mad-sad-glad-sad { background-color: #f59e0b; }
    .header-template-mad-sad-glad-glad { background-color: #10b981; }
    .header-template-good-bad-ideas-good { background-color: #10b981; }
    .header-template-good-bad-ideas-bad { background-color: #ef4444; }
    .header-template-good-bad-ideas-ideas { background-color: #f59e0b; }
    .header-template-kiss-keep { background-color: #3b82f6; }
    .header-template-kiss-improve { background-color: #f59e0b; }
    .header-template-kiss-start { background-color: #10b981; }
    .header-template-kiss-stop { background-color: #ef4444; }
    .header-template-sailboat-wind { background-color: #06b6d4; }
    .header-template-sailboat-anchor { background-color: #f59e0b; }
    .header-template-sailboat-rocks { background-color: #6b7280; }
    .header-template-sailboat-island { background-color: #10b981; }
    .header-template-freeform-general { background-color: #6366f1; }
    /* Универсальный стиль для кастомных колонок */
    .column-header[class*="header-template-freeform-"] { background-color: #6366f1; }
    .card { padding: 12px; margin: 10px 0; border-radius: 8px; border-left: 5px solid; }
    .card-content { margin: 10px 0; word-wrap: break-word; }
    .card-meme { max-width: 100%; max-height: 200px; border-radius: 6px; margin: 8px 0; }
    .card-emoji { font-size: 2.5rem; text-align: center; margin: 10px 0; }
    .reactions { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; align-items: center; }
    .reaction { background: #e5e7eb; padding: 4px 10px; border-radius: 16px; font-size: 0.875rem; display: flex; align-items: center; gap: 4px; }
    .vote-reaction { background: #ef4444; color: white; padding: 6px 12px; border-radius: 50%; font-size: 0.875rem; display: inline-flex; align-items: center; gap: 4px; min-width: 40px; justify-content: center; }
    .vote-reaction .icon { font-size: 1.2rem; }
    .action-plan { background: #f0f2ff; border: 1px solid #6366f1; border-radius: 6px; padding: 10px; margin-top: 10px; }
    .action-plan-header { color: #6366f1; font-weight: bold; margin-bottom: 8px; }
    .discussion-card { background: #fff8e1; border-left-color: #f59e0b !important; }
    /* Цвета карточек по категориям */
    .card.template-classic-start { background-color: rgba(16, 185, 129, 0.08); border-left-color: #10b981; }
    .card.template-classic-stop { background-color: rgba(239, 68, 68, 0.08); border-left-color: #ef4444; }
    .card.template-classic-continue { background-color: rgba(59, 130, 246, 0.08); border-left-color: #3b82f6; }
    .card.template-mad-sad-glad-mad { background-color: rgba(239, 68, 68, 0.08); border-left-color: #ef4444; }
    .card.template-mad-sad-glad-sad { background-color: rgba(245, 158, 11, 0.08); border-left-color: #f59e0b; }
    .card.template-mad-sad-glad-glad { background-color: rgba(16, 185, 129, 0.08); border-left-color: #10b981; }
    .card.template-good-bad-ideas-good { background-color: rgba(16, 185, 129, 0.08); border-left-color: #10b981; }
    .card.template-good-bad-ideas-bad { background-color: rgba(239, 68, 68, 0.08); border-left-color: #ef4444; }
    .card.template-good-bad-ideas-ideas { background-color: rgba(245, 158, 11, 0.08); border-left-color: #f59e0b; }
    .card.template-kiss-keep { background-color: rgba(59, 130, 246, 0.08); border-left-color: #3b82f6; }
    .card.template-kiss-improve { background-color: rgba(245, 158, 11, 0.08); border-left-color: #f59e0b; }
    .card.template-kiss-start { background-color: rgba(16, 185, 129, 0.08); border-left-color: #10b981; }
    .card.template-kiss-stop { background-color: rgba(239, 68, 68, 0.08); border-left-color: #ef4444; }
    .card.template-sailboat-wind { background-color: rgba(6, 182, 212, 0.08); border-left-color: #06b6d4; }
    .card.template-sailboat-anchor { background-color: rgba(245, 158, 11, 0.08); border-left-color: #f59e0b; }
    .card.template-sailboat-rocks { background-color: rgba(107, 114, 128, 0.08); border-left-color: #6b7280; }
    .card.template-sailboat-island { background-color: rgba(16, 185, 129, 0.08); border-left-color: #10b981; }
    .card.template-freeform-general { background-color: rgba(99, 102, 241, 0.08); border-left-color: #6366f1; }
    /* Цвета заголовков по шаблонам */
    .header-template-classic-start { background-color: #10b981; }
    .header-template-classic-stop { background-color: #ef4444; }
    .header-template-classic-continue { background-color: #3b82f6; }
    .header-template-mad-sad-glad-mad { background-color: #ef4444; }
    .header-template-mad-sad-glad-sad { background-color: #f59e0b; }
    .header-template-mad-sad-glad-glad { background-color: #10b981; }
    .header-template-good-bad-ideas-good { background-color: #10b981; }
    .header-template-good-bad-ideas-bad { background-color: #ef4444; }
    .header-template-good-bad-ideas-ideas { background-color: #f59e0b; }
    .header-template-kiss-keep { background-color: #3b82f6; }
    .header-template-kiss-improve { background-color: #f59e0b; }
    .header-template-kiss-start { background-color: #10b981; }
    .header-template-kiss-stop { background-color: #ef4444; }
    .header-template-sailboat-wind { background-color: #06b6d4; }
    .header-template-sailboat-anchor { background-color: #f59e0b; }
    .header-template-sailboat-rocks { background-color: #6b7280; }
    .header-template-sailboat-island { background-color: #10b981; }
    .header-template-freeform-general { background-color: #6366f1; }
    /* Универсальный стиль для кастомных колонок */
    .column-header[class*="header-template-freeform-"] { background-color: #6366f1; }
  </style>
</head>
<body>
  <h1>🎯 Ретроспектива: ${escapeHtml(currentSession.name)}</h1>

  <div class="session-info">
    <p><strong>ID:</strong> ${currentSession.id}<br>
    <strong>Дата:</strong> ${new Date(currentSession.created_at).toLocaleString()}<br>
    <strong>Статус:</strong> ${currentSession.status}<br>
    <strong>Шаблон:</strong> ${currentSession.template}<br>
    <strong>Ведущий:</strong> ${escapeHtml(currentSession.admin_name)}</p>
  </div>

  <div class="tab-section">
    <h2>🧠 Brain Storm</h2>
    <div class="columns-container">
`;

      // Получаем кастомные заголовки колонок (уже распаршено в начале функции)
      const columnHeaders = currentSession.column_headers || {};

      console.log('[Export] Column headers:', columnHeaders);
      console.log('[Export] Template columns:', currentSession.template_columns);

      // Получаем шаблон для определения стандартных колонок
      const template = TEMPLATES[currentSession.template] || TEMPLATES['freeform'];
      const templateName = currentSession.template;

      // Собираем все колонки: стандартные из шаблона + кастомные
      let allColumns = [...template.columns];

      // Добавляем кастомные колонки из template_columns если есть
      if (currentSession.template_columns && currentSession.template_columns.trim() !== '') {
        try {
          const templateColumns = typeof currentSession.template_columns === 'string'
            ? JSON.parse(currentSession.template_columns)
            : currentSession.template_columns;
          // Используем template_columns вместо стандартных колонок шаблона
          allColumns = templateColumns;
          console.log('[Export] Using template_columns:', allColumns);
        } catch (e) {
          console.error('Error parsing template_columns:', e);
        }
      }

      // Добавляем кастомные колонки, если они есть
      if (currentSession.customColumns && currentSession.customColumns.length > 0) {
        currentSession.customColumns.forEach(customCol => {
          // Проверяем, нет ли уже такой колонки (чтобы избежать дублирования)
          if (!allColumns.find(col => col.category === customCol.category)) {
            allColumns.push({
              id: customCol.id,
              name: customCol.name,
              category: customCol.category,
              icon: customCol.icon || 'add_column'
            });
          }
        });
      }

      // Экспорт по всем колонкам с полным содержимым
      allColumns.forEach(col => {
        const colItems = items.filter(i => i.category === col.category);
        const categoryClass = `template-${templateName}-${col.category}`;
        const headerClass = `header-${templateName}-${col.category.replace(/\s+/g, '-').toLowerCase()}`;

        // Используем кастомный заголовок если есть, иначе название из шаблона
        const columnHeader = columnHeaders[col.category] || col.name;

        console.log('[Export] Column:', col.category, 'columnHeader:', columnHeader, 'col.name:', col.name, 'columnHeaders:', columnHeaders);

        html += `      <div class="column">
        <div class="column-header ${headerClass}">
          <h3>${escapeHtml(columnHeader)}</h3>
        </div>
`;

        colItems.forEach(item => {
          html += `        <div class="card ${categoryClass}">
`;
          html += `          <div style="font-size: 0.75rem; color: #666; margin-bottom: 8px;">
            <span style="display: flex; align-items: center; gap: 4px;">
              <span style="font-weight: bold;">👤 ${escapeHtml(item.author)}</span>
            </span>
            <span style="color: #999; margin-left: 10px;">📅 ${new Date(item.created_at).toLocaleString()}</span>
          </div>
`;
          html += `          <div class="card-content">\n`;
          html += renderCardContent(item);
          html += `          </div>\n`;

          // Реакции
          if (item.reactions) {
            const reactions = typeof item.reactions === 'string' ? JSON.parse(item.reactions) : item.reactions;
            const emojiMap = {
              'like':'👍', 'dislike':'👎', 'heart':'❤️', 'fire':'🔥', 'party':'🎉',
              'happy':'😄', 'sad':'😢', 'angry':'😡', 'think':'🤔', 'poop':'💩',
              'hundred':'💯', 'pray':'🙏', 'laugh':'🤣', 'love':'😍', 'surprised':'😮'
            };
            const activeReactions = Object.entries(reactions).filter(([_, count]) => count > 0);
            if (activeReactions.length > 0) {
              html += `          <div class="reactions">\n`;
              activeReactions.forEach(([name, count]) => {
                html += `            <span class="reaction">${emojiMap[name] || name} ${count}</span>\n`;
              });
              html += `          </div>\n`;
            }
          }

          // Голоса голосования (круглые красные лайки)
          if (item.vote_mode_votes) {
            const voteCount = typeof item.vote_mode_votes === 'string' ?
              JSON.parse(item.vote_mode_votes).length :
              (Array.isArray(item.vote_mode_votes) ? item.vote_mode_votes.length : 0);
            if (voteCount > 0) {
              html += `          <div class="reactions">\n`;
              html += `            <span class="vote-reaction"><span class="icon">👍</span> ${voteCount}</span>\n`;
              html += `          </div>\n`;
            }
          }

          html += `        </div>\n`;
        });

        html += `      </div>\n`;
      });

      html += `    </div>
  </div>

  <div class="tab-section">
    <h2>💬 Обсуждение</h2>
    <div class="discussion-single-column">
`;

      // Обсуждение - выбранные карточки в один столбец
      const discussionItems = items.filter(i => i.for_discussion);

      // Сортируем по порядку
      discussionItems.sort((a, b) => (a.order || 0) - (b.order || 0));

      // Добавляем стили для двухколоночного макета обсуждения
      html += `      <style>
        .discussion-item-container { display: flex; gap: 20px; margin-bottom: 20px; align-items: flex-start; }
        .discussion-card-left { flex: 0 0 40%; max-width: 40%; }
        .discussion-plan-right { flex: 1; background: #f0f2ff; border: 1px solid #6366f1; border-radius: 6px; padding: 15px; margin-top: 0; }
        .discussion-plan-header { color: #6366f1; font-weight: bold; margin-bottom: 10px; font-size: 14px; margin-top: 0; }
        .discussion-card-left .card { margin-top: 0; }
      </style>
`;

      discussionItems.forEach(item => {
        const categoryClass = `template-${templateName}-${item.category}`;

        // Получаем название колонки с учётом кастомных заголовков (как в Brain Storm)
        let columnHeader = columnHeaders[item.category];
        if (!columnHeader && allColumns) {
          const colFromAllColumns = allColumns.find(c => c.category === item.category);
          if (colFromAllColumns && colFromAllColumns.name) {
            columnHeader = colFromAllColumns.name;
          }
        }
        if (!columnHeader) {
          const template_col = template.columns.find(c => c.category === item.category);
          columnHeader = template_col ? template_col.name : item.category;
        }

        html += `      <div class="discussion-item-container">\n`;

        // Левая колонка - карточка
        html += `        <div class="discussion-card-left">\n`;
        html += `          <div class="card discussion-card ${categoryClass}">\n`;

        // Заголовок категории
        html += `            <div style="background: #f59e0b; color: #333; padding: 8px 12px; border-radius: 6px 6px 0 0; margin: -12px -12px 12px -12px; font-weight: bold; text-align: center;">
          ${escapeHtml(columnHeader)}
        </div>\n`;

        // Автор и дата
        html += `            <div style="font-size: 0.75rem; color: #666; margin-bottom: 8px;">
          <span style="display: flex; align-items: center; gap: 4px;">
            <span style="font-weight: bold;">👤 ${escapeHtml(item.author)}</span>
          </span>
          <span style="color: #999; margin-left: 10px;">📅 ${new Date(item.created_at).toLocaleString()}</span>
        </div>\n`;

        // Содержимое карточки - используем renderCardContent для поддержки объединённых
        html += `            <div class="card-content">\n`;
        html += renderCardContent(item);
        html += `            </div>\n`;

        html += `          </div>\n`;
        html += `        </div>\n`;

        // Правая колонка - План действий
        if (item.action_plan_text || item.action_plan_who || item.action_plan_when) {
          html += `        <div class="discussion-plan-right">\n`;
          html += `          <div class="discussion-plan-header">📋 План действий</div>\n`;
          if (item.action_plan_text) {
            html += `            <div style="margin-bottom: 10px; font-size: 14px;"><strong>Текст:</strong><br>${item.action_plan_text}</div>\n`;
          }
          if (item.action_plan_who) {
            html += `            <div style="margin-bottom: 10px; font-size: 14px;"><strong>👤 Кому:</strong> ${escapeHtml(item.action_plan_who)}</div>\n`;
          }
          if (item.action_plan_when) {
            html += `            <div style="font-size: 14px;"><strong>📅 Когда:</strong> ${escapeHtml(item.action_plan_when)}</div>\n`;
          }
          html += `        </div>\n`;
        }

        html += `      </div>\n`;
      });

      if (discussionItems.length === 0) {
        html += `      <p style="color: #999; text-align: center; padding: 40px;">Нет карточек для обсуждения</p>\n`;
      }

      html += `    </div>
  </div>
</body>
</html>`;

      const blob = new Blob([html], { type: 'text/html' });
      downloadBlob(blob, `retro-${currentSession.id}-confluence.html`);
    } else if (format === 'confluence_multi') {
      // Confluence экспорт - каждый столбец в отдельный файл в формате Wiki Markup
      const columnHeaders = currentSession.column_headers || {};

      console.log('[Export Multi] Column headers:', columnHeaders);
      console.log('[Export Multi] Template columns:', currentSession.template_columns);

      const template = TEMPLATES[currentSession.template] || TEMPLATES['freeform'];
      const templateName = currentSession.template;

      // Собираем все колонки
      let allColumns = [...template.columns];

      if (currentSession.template_columns && currentSession.template_columns.trim() !== '') {
        try {
          const templateColumns = typeof currentSession.template_columns === 'string'
            ? JSON.parse(currentSession.template_columns)
            : currentSession.template_columns;
          allColumns = templateColumns;
          console.log('[Export Multi] Using template_columns:', allColumns);
        } catch (e) {
          console.error('Error parsing template_columns:', e);
        }
      }

      if (currentSession.customColumns && currentSession.customColumns.length > 0) {
        currentSession.customColumns.forEach(customCol => {
          if (!allColumns.find(col => col.category === customCol.category)) {
            allColumns.push({
              id: customCol.id,
              name: customCol.name,
              category: customCol.category,
              icon: customCol.icon || 'add_column'
            });
          }
        });
      }

      // Функция для экранирования XML
      function escapeXml(text) {
        if (!text) return '';
        return String(text)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
      }

      // Функция для генерации Wiki Markup для одной колонки
      function generateColumnWiki(col, colItems, columnHeader, isDiscussion = false) {
        let wiki = `h1. ${isDiscussion ? '💬 Обсуждение' : '🧠 Brain Storm'}: ${columnHeader}\n\n`;

        if (colItems.length === 0) {
          wiki += `_Нет карточек в этой колонке_\n\n`;
        } else {
          colItems.forEach((item, idx) => {
            wiki += `h2. ${idx + 1}. Карточка от ${escapeXml(item.author)}\n\n`;

            // Содержимое карточки
            const isMerged = item.text && item.text.includes('─────────────');
            let mergedPartsData = null;
            if (item.merged_parts_data) {
              try {
                mergedPartsData = typeof item.merged_parts_data === 'string'
                  ? JSON.parse(item.merged_parts_data)
                  : item.merged_parts_data;
              } catch (e) {
                console.error('[Export] Failed to parse merged_parts_data:', e);
              }
            }

            if (isMerged) {
              const parts = item.text.split(/\n{1,2}─────────────\n{1,2}/).filter(p => p.trim());
              if (mergedPartsData && mergedPartsData.length > 0) {
                mergedPartsData.forEach((part, index) => {
                  const partText = part.text || parts[index] || '';
                  const partMemeMatch = partText.match(/!\[(.*?)\]\((.*?)\)/);
                  if (partMemeMatch) {
                    wiki += `!${escapeXml(partMemeMatch[2])}!\n\n`;
                    const remainingText = partText.replace(/!\[(.*?)\]\((.*?)\)/g, '').trim();
                    if (remainingText) {
                      wiki += `# ${index + 1}. ${escapeXml(remainingText)}\n\n`;
                    }
                  } else if (partText.startsWith('😄') || partText.startsWith('😊') || partText.startsWith('😐') || partText.startsWith('😫') || partText.startsWith('💀')) {
                    wiki += `h3. ${escapeXml(partText)}\n\n`;
                  } else {
                    wiki += `# ${index + 1}. ${escapeXml(partText)}\n\n`;
                  }
                });
                wiki += `_(${parts.length} частей в объединённой карточке)_\n\n`;
              } else {
                parts.forEach((part, index) => {
                  const partMemeMatch = part.match(/!\[(.*?)\]\((.*?)\)/);
                  if (partMemeMatch) {
                    wiki += `!${escapeXml(partMemeMatch[2])}!\n\n`;
                    const remainingText = part.replace(/!\[(.*?)\]\((.*?)\)/g, '').trim();
                    if (remainingText) {
                      wiki += `# ${index + 1}. ${escapeXml(remainingText)}\n\n`;
                    }
                  } else if (part.startsWith('😄') || part.startsWith('😊') || part.startsWith('😐') || part.startsWith('😫') || part.startsWith('💀')) {
                    wiki += `h3. ${escapeXml(part)}\n\n`;
                  } else {
                    wiki += `# ${index + 1}. ${escapeXml(part)}\n\n`;
                  }
                });
                wiki += `_(${parts.length} частей в объединённой карточке)_\n\n`;
              }
            } else if (item.meme_url) {
              wiki += `!${escapeXml(item.meme_url)}!\n\n`;
            } else if (item.text) {
              const markdownMemeMatch = item.text.match(/!\[(.*?)\]\((.*?)\)/g);
              if (markdownMemeMatch && markdownMemeMatch.length > 0) {
                markdownMemeMatch.forEach(match => {
                  const [, alt, url] = match.match(/!\[(.*?)\]\((.*?)\)/);
                  wiki += `!${escapeXml(url)}!\n\n`;
                });
                const remainingText = item.text.replace(/!\[(.*?)\]\((.*?)\)/g, '').trim();
                if (remainingText) {
                  wiki += `${escapeXml(remainingText)}\n\n`;
                }
              } else if (item.text.startsWith('😄') || item.text.startsWith('😊') || item.text.startsWith('😐') || item.text.startsWith('😫') || item.text.startsWith('💀')) {
                wiki += `h3. ${escapeXml(item.text)}\n\n`;
              } else {
                wiki += `${escapeXml(item.text)}\n\n`;
              }
            }

            // Реакции
            if (item.reactions) {
              const reactions = typeof item.reactions === 'string' ? JSON.parse(item.reactions) : item.reactions;
              const emojiMap = {
                'like':'👍', 'dislike':'👎', 'heart':'❤️', 'fire':'🔥', 'party':'🎉',
                'happy':'😄', 'sad':'😢', 'angry':'😡', 'think':'🤔', 'poop':'💩',
                'hundred':'💯', 'pray':'🙏', 'laugh':'🤣', 'love':'😍', 'surprised':'😮'
              };
              const activeReactions = Object.entries(reactions).filter(([_, count]) => count > 0);
              if (activeReactions.length > 0) {
                wiki += `*Реакции:* `;
                wiki += activeReactions.map(([name, count]) => `${emojiMap[name] || name} ${count}`).join('  ');
                wiki += `\n\n`;
              }
            }

            // Голоса голосования
            if (item.vote_mode_votes) {
              const voteCount = typeof item.vote_mode_votes === 'string' ?
                JSON.parse(item.vote_mode_votes).length :
                (Array.isArray(item.vote_mode_votes) ? item.vote_mode_votes.length : 0);
              if (voteCount > 0) {
                wiki += `*Голоса:* 👍 ${voteCount}\n\n`;
              }
            }

            // План действий (только для обсуждения)
            if (isDiscussion && (item.action_plan_text || item.action_plan_who || item.action_plan_when)) {
              wiki += `----\n\n`;
              wiki += `h2. 📋 План действий\n\n`;
              if (item.action_plan_text) {
                wiki += `*Текст:*\n\n${escapeXml(item.action_plan_text)}\n\n`;
              }
              if (item.action_plan_who) {
                wiki += `*👤 Кому:* ${escapeXml(item.action_plan_who)}\n\n`;
              }
              if (item.action_plan_when) {
                wiki += `*📅 Когда:* ${escapeXml(item.action_plan_when)}\n\n`;
              }
            }

            wiki += `----\n\n`;
          });
        }
        return wiki;
      }

      // Экспортируем каждую колонку Brain Storm в отдельный файл
      allColumns.forEach((col, index) => {
        const colItems = items.filter(i => i.category === col.category);
        const columnHeader = columnHeaders[col.category] || col.name;
        const wiki = generateColumnWiki(col, colItems, columnHeader, false);
        const blob = new Blob([wiki], { type: 'text/plain' });
        const filename = `brainstorm-${index + 1}.txt`;
        downloadBlob(blob, filename);
      });

      // Экспортируем обсуждение - каждая карточка в отдельный файл
      const discussionItems = items.filter(i => i.for_discussion);
      discussionItems.sort((a, b) => (a.order || 0) - (b.order || 0));

      discussionItems.forEach((item, index) => {
        const columnHeader = columnHeaders[item.category] ||
          (allColumns ? allColumns.find(c => c.category === item.category)?.name : null) ||
          template.columns.find(c => c.category === item.category)?.name ||
          item.category;

        const colForItem = allColumns.find(c => c.category === item.category) || { category: item.category, name: columnHeader };
        const wiki = generateColumnWiki(colForItem, [item], columnHeader, true);
        const blob = new Blob([wiki], { type: 'text/plain' });
        const filename = `discussion-${index + 1}.txt`;
        downloadBlob(blob, filename);
      });

      // Экспортируем шапку сессии в отдельный файл
      let headerWiki = `h1. 🎯 Ретроспектива: ${escapeXml(currentSession.name)}\n\n`;
      headerWiki += `h2. 📋 Основная информация\n\n`;
      headerWiki += `|| Параметр || Значение ||\n`;
      headerWiki += `| *ID* | ${currentSession.id} |\n`;
      headerWiki += `| *Дата создания* | ${new Date(currentSession.created_at).toLocaleString()} |\n`;
      headerWiki += `| *Статус* | ${currentSession.status} |\n`;
      headerWiki += `| *Шаблон* | ${currentSession.template} |\n`;
      headerWiki += `| *Ведущий* | ${escapeXml(currentSession.admin_name)} |\n\n`;

      headerWiki += `h2. 🧠 Колонки Brain Storm\n\n`;
      headerWiki += `|| # || Название || Категория ||\n`;
      allColumns.forEach((col, index) => {
        const columnHeader = columnHeaders[col.category] || col.name;
        headerWiki += `| ${index + 1} | ${escapeXml(columnHeader)} | ${col.category} |\n`;
      });
      headerWiki += `\n`;

      headerWiki += `h2. 💬 Обсуждение\n\n`;
      headerWiki += `Всего карточек для обсуждения: *${discussionItems.length}*\n\n`;

      headerWiki += `h2. 📁 Структура экспортированных файлов\n\n`;
      headerWiki += `* *brainstorm-1, 2, 3...* - файлы колонок Brain Storm\n`;
      headerWiki += `* *discussion-1, 2, 3...* - файлы карточек обсуждения\n`;
      headerWiki += `* *shapka* - этот файл с общей информацией\n`;

      const headerBlob = new Blob([headerWiki], { type: 'text/plain' });
      downloadBlob(headerBlob, `shapka.txt`);

      const totalFiles = allColumns.length + discussionItems.length + 1;
      showToast(`Экспорт выполнен! Скачано файлов: ${totalFiles}`, 'success');
    } else if (format === 'jpg') {
      // Экспорт в JPG - скриншоты вкладок Brain Storm и Обсуждение
      // Используем html2canvas для создания скриншотов
      
      const columnHeaders = currentSession.column_headers || {};
      const template = TEMPLATES[currentSession.template] || TEMPLATES['freeform'];
      const templateName = currentSession.template;

      // Собираем все колонки
      let allColumns = [...template.columns];

      if (currentSession.template_columns && currentSession.template_columns.trim() !== '') {
        try {
          const templateColumns = typeof currentSession.template_columns === 'string'
            ? JSON.parse(currentSession.template_columns)
            : currentSession.template_columns;
          allColumns = templateColumns;
        } catch (e) {
          console.error('Error parsing template_columns:', e);
        }
      }

      if (currentSession.customColumns && currentSession.customColumns.length > 0) {
        currentSession.customColumns.forEach(customCol => {
          if (!allColumns.find(col => col.category === customCol.category)) {
            allColumns.push({
              id: customCol.id,
              name: customCol.name,
              category: customCol.category,
              icon: customCol.icon || 'add_column'
            });
          }
        });
      }

      // Функция для создания HTML для скриншота
      function createScreenshotHtml(title, content) {
        return `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
              .container { max-width: 1400px; margin: 0 auto; }
              h1 { color: white; text-align: center; font-size: 2.5rem; margin-bottom: 30px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
              .columns-container { display: flex; gap: 20px; flex-wrap: wrap; }
              .column { flex: 1; min-width: 280px; background: white; border-radius: 12px; padding: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
              .column-header { padding: 12px 16px; border-radius: 8px; margin-bottom: 15px; text-align: center; color: white; font-weight: bold; font-size: 1.1rem; }
              .header-template-classic-start { background: linear-gradient(135deg, #10b981, #059669); }
              .header-template-classic-stop { background: linear-gradient(135deg, #ef4444, #dc2626); }
              .header-template-classic-continue { background: linear-gradient(135deg, #3b82f6, #2563eb); }
              .header-template-mad-sad-glad-mad { background: linear-gradient(135deg, #ef4444, #dc2626); }
              .header-template-mad-sad-glad-sad { background: linear-gradient(135deg, #f59e0b, #d97706); }
              .header-template-mad-sad-glad-glad { background: linear-gradient(135deg, #10b981, #059669); }
              .header-template-good-bad-ideas-good { background: linear-gradient(135deg, #10b981, #059669); }
              .header-template-good-bad-ideas-bad { background: linear-gradient(135deg, #ef4444, #dc2626); }
              .header-template-good-bad-ideas-ideas { background: linear-gradient(135deg, #f59e0b, #d97706); }
              .header-template-kiss-keep { background: linear-gradient(135deg, #3b82f6, #2563eb); }
              .header-template-kiss-improve { background: linear-gradient(135deg, #f59e0b, #d97706); }
              .header-template-kiss-start { background: linear-gradient(135deg, #10b981, #059669); }
              .header-template-kiss-stop { background: linear-gradient(135deg, #ef4444, #dc2626); }
              .header-template-sailboat-wind { background: linear-gradient(135deg, #06b6d4, #0891b2); }
              .header-template-sailboat-anchor { background: linear-gradient(135deg, #f59e0b, #d97706); }
              .header-template-sailboat-rocks { background: linear-gradient(135deg, #6b7280, #4b5563); }
              .header-template-sailboat-island { background: linear-gradient(135deg, #10b981, #059669); }
              .header-template-freeform-general { background: linear-gradient(135deg, #6366f1, #4f46e5); }
              .column-header[class*="header-template-freeform-"] { background: linear-gradient(135deg, #6366f1, #4f46e5); }
              .card { padding: 15px; margin: 12px 0; border-radius: 10px; border-left: 5px solid; background: #f9fafb; }
              .card-content { margin: 10px 0; word-wrap: break-word; color: #1f2937; }
              .card-meme { max-width: 100%; max-height: 200px; border-radius: 8px; margin: 8px 0; }
              .card-emoji { font-size: 3rem; text-align: center; margin: 10px 0; }
              .reactions { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; align-items: center; }
              .reaction { background: #e5e7eb; padding: 5px 12px; border-radius: 20px; font-size: 0.9rem; display: flex; align-items: center; gap: 4px; }
              .vote-reaction { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; padding: 6px 14px; border-radius: 50%; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 4px; min-width: 40px; justify-content: center; }
              .card.template-classic-start { background: linear-gradient(135deg, #d1fae5, #a7f3d0); border-left-color: #10b981; }
              .card.template-classic-stop { background: linear-gradient(135deg, #fee2e2, #fecaca); border-left-color: #ef4444; }
              .card.template-classic-continue { background: linear-gradient(135deg, #dbeafe, #bfdbfe); border-left-color: #3b82f6; }
              .card.template-mad-sad-glad-mad { background: linear-gradient(135deg, #fee2e2, #fecaca); border-left-color: #ef4444; }
              .card.template-mad-sad-glad-sad { background: linear-gradient(135deg, #fef3c7, #fde68a); border-left-color: #f59e0b; }
              .card.template-mad-sad-glad-glad { background: linear-gradient(135deg, #d1fae5, #a7f3d0); border-left-color: #10b981; }
              .card.template-good-bad-ideas-good { background: linear-gradient(135deg, #d1fae5, #a7f3d0); border-left-color: #10b981; }
              .card.template-good-bad-ideas-bad { background: linear-gradient(135deg, #fee2e2, #fecaca); border-left-color: #ef4444; }
              .card.template-good-bad-ideas-ideas { background: linear-gradient(135deg, #fef3c7, #fde68a); border-left-color: #f59e0b; }
              .card.template-kiss-keep { background: linear-gradient(135deg, #dbeafe, #bfdbfe); border-left-color: #3b82f6; }
              .card.template-kiss-improve { background: linear-gradient(135deg, #fef3c7, #fde68a); border-left-color: #f59e0b; }
              .card.template-kiss-start { background: linear-gradient(135deg, #d1fae5, #a7f3d0); border-left-color: #10b981; }
              .card.template-kiss-stop { background: linear-gradient(135deg, #fee2e2, #fecaca); border-left-color: #ef4444; }
              .card.template-sailboat-wind { background: linear-gradient(135deg, #cffafe, #a5f3fc); border-left-color: #06b6d4; }
              .card.template-sailboat-anchor { background: linear-gradient(135deg, #fef3c7, #fde68a); border-left-color: #f59e0b; }
              .card.template-sailboat-rocks { background: linear-gradient(135deg, #f3f4f6, #e5e7eb); border-left-color: #6b7280; }
              .card.template-sailboat-island { background: linear-gradient(135deg, #d1fae5, #a7f3d0); border-left-color: #10b981; }
              .card.template-freeform-general { background: linear-gradient(135deg, #e0e7ff, #c7d2fe); border-left-color: #6366f1; }
              .author-info { font-size: 0.8rem; color: #6b7280; margin-bottom: 8px; }
              .author-info strong { color: #4b5563; }
              .action-plan { background: linear-gradient(135deg, #e0e7ff, #c7d2fe); border: 2px solid #6366f1; border-radius: 8px; padding: 12px; margin-top: 10px; }
              .action-plan-header { color: #6366f1; font-weight: bold; margin-bottom: 8px; }
              .discussion-single-column { display: block; }
              .discussion-item-container { display: flex; gap: 20px; margin-bottom: 20px; align-items: flex-start; }
              .discussion-card-left { flex: 0 0 45%; max-width: 45%; }
              .discussion-plan-right { flex: 1; background: linear-gradient(135deg, #e0e7ff, #c7d2fe); border: 2px solid #6366f1; border-radius: 8px; padding: 15px; }
              .discussion-plan-header { color: #6366f1; font-weight: bold; margin-bottom: 10px; font-size: 1rem; }
              .card.discussion-card { background: linear-gradient(135deg, #fef3c7, #fde68a); border-left-color: #f59e0b !important; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>${title}</h1>
              ${content}
            </div>
          </body>
          </html>
        `;
      }

      // Генерация содержимого для Brain Storm
      function generateBrainStormContent() {
        let content = '<div class="columns-container">\n';
        
        allColumns.forEach(col => {
          const colItems = items.filter(i => i.category === col.category);
          const columnHeader = columnHeaders[col.category] || col.name;
          const categoryClass = `template-${templateName}-${col.category}`;
          const headerClass = `header-${templateName}-${col.category.replace(/\s+/g, '-').toLowerCase()}`;

          content += `  <div class="column">\n`;
          content += `    <div class="column-header ${headerClass}">${escapeHtml(columnHeader)}</div>\n`;

          if (colItems.length === 0) {
            content += `    <p style="color: #999; text-align: center; padding: 20px;">Нет карточек</p>\n`;
          } else {
            colItems.forEach(item => {
              content += `    <div class="card ${categoryClass}">\n`;
              content += `      <div class="author-info">\n`;
              content += `        <strong>👤 ${escapeHtml(item.author)}</strong> | 📅 ${new Date(item.created_at).toLocaleString()}\n`;
              content += `      </div>\n`;
              content += `      <div class="card-content">\n`;
              
              // Содержимое карточки
              const isMerged = item.text && item.text.includes('─────────────');
              if (isMerged) {
                const parts = item.text.split(/\n{1,2}─────────────\n{1,2}/).filter(p => p.trim());
                parts.forEach((part, index) => {
                  const partMemeMatch = part.match(/!\[(.*?)\]\((.*?)\)/);
                  if (partMemeMatch) {
                    content += `<img src="${escapeHtml(partMemeMatch[2])}" class="card-meme">\n`;
                  } else if (part.startsWith('😄') || part.startsWith('😊') || part.startsWith('😐') || part.startsWith('😫') || part.startsWith('💀')) {
                    content += `<div class="card-emoji">${escapeHtml(part)}</div>\n`;
                  } else {
                    content += `<p>${escapeHtml(part)}</p>\n`;
                  }
                });
              } else if (item.meme_url) {
                content += `<img src="${escapeHtml(item.meme_url)}" class="card-meme">\n`;
              } else if (item.text) {
                const markdownMemeMatch = item.text.match(/!\[(.*?)\]\((.*?)\)/g);
                if (markdownMemeMatch) {
                  markdownMemeMatch.forEach(match => {
                    const [, alt, url] = match.match(/!\[(.*?)\]\((.*?)\)/);
                    content += `<img src="${escapeHtml(url)}" class="card-meme">\n`;
                  });
                } else if (item.text.startsWith('😄') || item.text.startsWith('😊') || item.text.startsWith('😐') || item.text.startsWith('😫') || item.text.startsWith('💀')) {
                  content += `<div class="card-emoji">${escapeHtml(item.text)}</div>\n`;
                } else {
                  content += `<p>${escapeHtml(item.text)}</p>\n`;
                }
              }
              
              content += `      </div>\n`;

              // Реакции
              if (item.reactions) {
                const reactions = typeof item.reactions === 'string' ? JSON.parse(item.reactions) : item.reactions;
                const emojiMap = {
                  'like':'👍', 'dislike':'👎', 'heart':'❤️', 'fire':'🔥', 'party':'🎉',
                  'happy':'😄', 'sad':'😢', 'angry':'😡', 'think':'🤔', 'poop':'💩',
                  'hundred':'💯', 'pray':'🙏', 'laugh':'🤣', 'love':'😍', 'surprised':'😮'
                };
                const activeReactions = Object.entries(reactions).filter(([_, count]) => count > 0);
                if (activeReactions.length > 0) {
                  content += `      <div class="reactions">\n`;
                  activeReactions.forEach(([name, count]) => {
                    content += `        <span class="reaction">${emojiMap[name] || name} ${count}</span>\n`;
                  });
                  content += `      </div>\n`;
                }
              }

              // Голоса голосования
              if (item.vote_mode_votes) {
                const voteCount = typeof item.vote_mode_votes === 'string' ?
                  JSON.parse(item.vote_mode_votes).length :
                  (Array.isArray(item.vote_mode_votes) ? item.vote_mode_votes.length : 0);
                if (voteCount > 0) {
                  content += `      <div class="reactions">\n`;
                  content += `        <span class="vote-reaction">👍 ${voteCount}</span>\n`;
                  content += `      </div>\n`;
                }
              }

              content += `    </div>\n`;
            });
          }

          content += `  </div>\n`;
        });

        content += '</div>\n';
        return content;
      }

      // Генерация содержимого для Обсуждения
      function generateDiscussionContent() {
        const discussionItems = items.filter(i => i.for_discussion);
        discussionItems.sort((a, b) => (a.order || 0) - (b.order || 0));

        let content = '<div class="discussion-single-column">\n';

        if (discussionItems.length === 0) {
          content += '<p style="color: #999; text-align: center; padding: 40px;">Нет карточек для обсуждения</p>\n';
        } else {
          discussionItems.forEach((item, idx) => {
            const columnHeader = columnHeaders[item.category] ||
              (allColumns ? allColumns.find(c => c.category === item.category)?.name : null) ||
              template.columns.find(c => c.category === item.category)?.name ||
              item.category;
            const categoryClass = `template-${templateName}-${item.category}`;

            content += `<div class="discussion-item-container">\n`;
            
            // Левая колонка - карточка
            content += `  <div class="discussion-card-left">\n`;
            content += `    <div class="card discussion-card ${categoryClass}">\n`;
            content += `      <div class="author-info">\n`;
            content += `        <strong>👤 ${escapeHtml(item.author)}</strong> | 📅 ${new Date(item.created_at).toLocaleString()}\n`;
            content += `      </div>\n`;
            content += `      <div class="card-content">\n`;
            
            const isMerged = item.text && item.text.includes('─────────────');
            if (isMerged) {
              const parts = item.text.split(/\n{1,2}─────────────\n{1,2}/).filter(p => p.trim());
              parts.forEach((part, index) => {
                const partMemeMatch = part.match(/!\[(.*?)\]\((.*?)\)/);
                if (partMemeMatch) {
                  content += `<img src="${escapeHtml(partMemeMatch[2])}" class="card-meme">\n`;
                } else if (part.startsWith('😄') || part.startsWith('😊') || part.startsWith('😐') || part.startsWith('😫') || part.startsWith('💀')) {
                  content += `<div class="card-emoji">${escapeHtml(part)}</div>\n`;
                } else {
                  content += `<p>${escapeHtml(part)}</p>\n`;
                }
              });
            } else if (item.meme_url) {
              content += `<img src="${escapeHtml(item.meme_url)}" class="card-meme">\n`;
            } else if (item.text) {
              const markdownMemeMatch = item.text.match(/!\[(.*?)\]\((.*?)\)/g);
              if (markdownMemeMatch) {
                markdownMemeMatch.forEach(match => {
                  const [, alt, url] = match.match(/!\[(.*?)\]\((.*?)\)/);
                  content += `<img src="${escapeHtml(url)}" class="card-meme">\n`;
                });
              } else if (item.text.startsWith('😄') || item.text.startsWith('😊') || item.text.startsWith('😐') || item.text.startsWith('😫') || item.text.startsWith('💀')) {
                content += `<div class="card-emoji">${escapeHtml(item.text)}</div>\n`;
              } else {
                content += `<p>${escapeHtml(item.text)}</p>\n`;
              }
            }
            
            content += `      </div>\n`;

            if (item.reactions) {
              const reactions = typeof item.reactions === 'string' ? JSON.parse(item.reactions) : item.reactions;
              const emojiMap = {
                'like':'👍', 'dislike':'👎', 'heart':'❤️', 'fire':'🔥', 'party':'🎉',
                'happy':'😄', 'sad':'😢', 'angry':'😡', 'think':'🤔', 'poop':'💩',
                'hundred':'💯', 'pray':'🙏', 'laugh':'🤣', 'love':'😍', 'surprised':'😮'
              };
              const activeReactions = Object.entries(reactions).filter(([_, count]) => count > 0);
              if (activeReactions.length > 0) {
                content += `      <div class="reactions">\n`;
                activeReactions.forEach(([name, count]) => {
                  content += `        <span class="reaction">${emojiMap[name] || name} ${count}</span>\n`;
                });
                content += `      </div>\n`;
              }
            }

            if (item.vote_mode_votes) {
              const voteCount = typeof item.vote_mode_votes === 'string' ?
                JSON.parse(item.vote_mode_votes).length :
                (Array.isArray(item.vote_mode_votes) ? item.vote_mode_votes.length : 0);
              if (voteCount > 0) {
                content += `      <div class="reactions">\n`;
                content += `        <span class="vote-reaction">👍 ${voteCount}</span>\n`;
                content += `      </div>\n`;
              }
            }

            content += `    </div>\n`;
            content += `  </div>\n`;

            // Правая колонка - План действий
            if (item.action_plan_text || item.action_plan_who || item.action_plan_when) {
              content += `  <div class="discussion-plan-right">\n`;
              content += `    <div class="discussion-plan-header">📋 План действий</div>\n`;
              if (item.action_plan_text) {
                content += `    <p><strong>Текст:</strong><br>${item.action_plan_text}</p>\n`;
              }
              if (item.action_plan_who) {
                content += `    <p><strong>👤 Кому:</strong> ${escapeHtml(item.action_plan_who)}</p>\n`;
              }
              if (item.action_plan_when) {
                content += `    <p><strong>📅 Когда:</strong> ${escapeHtml(item.action_plan_when)}</p>\n`;
              }
              content += `  </div>\n`;
            }

            content += `</div>\n`;
          });
        }

        content += '</div>\n';
        return content;
      }

      // Создаём iframe для рендеринга HTML и последующего скриншота
      const brainstormHtml = createScreenshotHtml(`🧠 Brain Storm - ${escapeHtml(currentSession.name)}`, generateBrainStormContent());
      const discussionHtml = createScreenshotHtml(`💬 Обсуждение - ${escapeHtml(currentSession.name)}`, generateDiscussionContent());

      // Функция для конвертации HTML в JPG
      function htmlToJpg(html, filename) {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-9999px';
        iframe.style.width = '1500px';
        iframe.style.height = '3000px';
        document.body.appendChild(iframe);

        iframe.contentWindow.document.open();
        iframe.contentWindow.document.write(html);
        iframe.contentWindow.document.close();

        // Ждём загрузки и делаем скриншот
        setTimeout(() => {
          html2canvas(iframe.contentWindow.document.body, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#667eea'
          }).then(canvas => {
            canvas.toBlob(blob => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = filename;
              a.click();
              URL.revokeObjectURL(url);
              document.body.removeChild(iframe);
            }, 'image/jpeg', 0.9);
          }).catch(err => {
            console.error('Error creating screenshot:', err);
            showToast('Ошибка создания скриншота', 'danger');
            document.body.removeChild(iframe);
          });
        }, 500);
      }

      // Функция для генерации HTML отчёта Action Points в виде таблицы
      function generateActionPointsHtml() {
        const discussionItems = items.filter(i => i.for_discussion && (i.action_plan_text || i.action_plan_who || i.action_plan_when));
        discussionItems.sort((a, b) => (a.order || 0) - (b.order || 0));

        let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Action Points - ${escapeHtml(currentSession.name)}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; }
    .container { max-width: 1400px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    h1 { color: #6366f1; border-bottom: 3px solid #6366f1; padding-bottom: 15px; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th { background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; padding: 15px 12px; text-align: left; font-weight: bold; font-size: 0.95rem; }
    td { padding: 15px 12px; border-bottom: 1px solid #e5e7eb; vertical-align: top; font-size: 0.9rem; }
    tr:nth-child(even) { background-color: #f9fafb; }
    tr:hover { background-color: #f3f4f6; }
    .card-text { color: #1f2937; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px dashed #d1d5db; }
    .plan-text { color: #4b5563; margin: 15px 0; white-space: pre-line; }
    .responsible { color: #4f46e5; font-weight: bold; margin-top: 15px; }
    .due-date { color: #dc2626; font-weight: bold; margin-top: 10px; }
    .item-number { background: #6366f1; color: white; width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 10px; }
    .status-cell { width: 150px; text-align: center; }
    .status-todo { background: #d1fae5; color: #059669; padding: 6px 16px; border-radius: 20px; font-weight: bold; display: inline-block; }
    .comment-cell { width: 200px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📋 Action Points - ${escapeHtml(currentSession.name)}</h1>
    <table>
      <thead>
        <tr>
          <th>Responsible, Description, Due Date</th>
          <th style="width: 150px;">Status</th>
          <th style="width: 200px;">Comment</th>
        </tr>
      </thead>
      <tbody>
`;

        discussionItems.forEach((item, idx) => {
          const columnHeader = columnHeaders[item.category] ||
            (allColumns ? allColumns.find(c => c.category === item.category)?.name : null) ||
            template.columns.find(c => c.category === item.category)?.name ||
            item.category;

          // Текст карточки из Brain Storm
          let cardText = '';
          if (item.text) {
            cardText = item.text.replace(/─────────────/g, '\n').replace(/!\[(.*?)\]\((.*?)\)/g, '').trim();
          }

          // Текст Плана действий
          let planText = item.action_plan_text || '';
          planText = planText.replace(/<[^>]*>/g, '').trim();

          const responsible = item.action_plan_who || 'Не назначен';
          const dueDate = item.action_plan_when || 'Не указана';
          const categoryLabel = columnHeader ? `[${columnHeader}]` : '';

          html += `        <tr>
          <td>
            <div style="margin-bottom: 10px;"><span class="item-number">${idx + 1}</span> <strong>${categoryLabel}</strong></div>
            <div class="card-text"><strong>Карточка:</strong><br>${escapeHtml(cardText)}</div>
            ${planText ? `<div class="plan-text"><strong>План действий:</strong><br>${escapeHtml(planText)}</div>` : ''}
            <div class="responsible"><strong>Кому:</strong> ${escapeHtml(responsible)}</div>
            <div class="due-date"><strong>Когда:</strong> ${escapeHtml(dueDate)}</div>
          </td>
          <td class="status-cell"><span class="status-todo">TO DO</span></td>
          <td class="comment-cell"></td>
        </tr>
`;
        });

        if (discussionItems.length === 0) {
          html += `        <tr>
          <td colspan="3" style="text-align: center; padding: 40px; color: #999;">Нет планов действий для экспорта</td>
        </tr>
`;
        }

        html += `      </tbody>
    </table>
  </div>
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html' });
        downloadBlob(blob, `action-points.html`);
      }

      // Проверяем наличие html2canvas
      if (typeof html2canvas === 'undefined') {
        // Загружаем библиотеку html2canvas
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => {
          htmlToJpg(brainstormHtml, `brainstorm.jpg`);
          setTimeout(() => htmlToJpg(discussionHtml, `discussion.jpg`), 1000);
          setTimeout(() => generateActionPointsHtml(), 1500);
          showToast('Экспорт JPG выполнен!', 'success');
        };
        script.onerror = () => {
          showToast('Ошибка загрузки библиотеки html2canvas', 'danger');
        };
        document.head.appendChild(script);
      } else {
        htmlToJpg(brainstormHtml, `brainstorm.jpg`);
        setTimeout(() => htmlToJpg(discussionHtml, `discussion.jpg`), 1000);
        setTimeout(() => generateActionPointsHtml(), 1500);
        showToast('Экспорт JPG выполнен!', 'success');
      }
    }

    showToast('Экспорт выполнен!', 'success');
  } catch (error) {
    console.error('Export error:', error);
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

    // Проверяем, является ли текущий пользователь админом
    const isAdmin = localStorage.getItem('isAdmin') === 'true';

    container.innerHTML = sessions.map(s => {
      const isActive = s.status === 'active';
      // Только админ может завершать активные и удалять завершённые сессии
      const canManage = isAdmin;
      return `
        <div class="list-group-item list-group-item-action session-history-item">
          <div class="d-flex w-100 justify-content-between align-items-center">
            <div onclick="viewSessionDetails('${s.id}')" style="cursor: pointer;">
              <h6 class="mb-1">${escapeHtml(s.name)}</h6>
              <small class="text-muted">ID: ${s.id}</small><br>
              <small class="text-muted">Шаблон: ${s.template} • Ведущий: ${escapeHtml(s.admin_name)}</small><br>
              <small class="text-muted">${new Date(s.created_at).toLocaleString()}</small>
            </div>
            <div class="text-end">
              <span class="session-status-badge status-${s.status} mb-2">${isActive ? 'Активна' : 'Завершена'}</span><br>
              ${isActive && canManage ? `<button class="btn btn-sm btn-outline-danger me-1" onclick="event.stopPropagation(); quickEndSession('${s.id}', '${escapeHtml(s.name)}')">Завершить</button>` : ''}
              ${!isActive && canManage ? `<button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); deleteSession('${s.id}')">Удалить</button>` : ''}
              ${!canManage ? '<small class="text-muted">Только просмотр</small>' : ''}
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
  // Открываем сессию в режиме просмотра
  await openSessionViewMode(sessionId);
}

// Открытие сессии в режиме просмотра (для завершённых сессий)
async function openSessionViewMode(sessionId) {
  try {
    const response = await fetch(`/api/sessions/${sessionId}`);
    const session = await response.json();

    // Сохраняем текущую сессию если есть
    const prevSession = currentSession;
    const prevUserId = currentUserId;
    const prevIsAdmin = isAdmin;

    // Устанавливаем сессию для просмотра
    currentSession = session;
    currentUserId = 'viewer_' + sessionId; // Временный ID для просмотра
    isAdmin = false;
    isViewOnly = true; // Включаем режим только для просмотра

    // Показываем страницу сессии
    showSessionPage();

    // Загружаем данные
    await loadSessionData();

    // Блокируем редактирование
    document.getElementById('admin-panel-btn').style.display = 'none';
    document.getElementById('end-session-btn').style.display = 'none';
    document.getElementById('admin-view-controls').style.display = 'none';
    document.getElementById('vote-mode-btn').style.display = 'none';
    // Скрываем форму добавления карточек
    const addItemForm = document.getElementById('add-item-form');
    if (addItemForm) addItemForm.style.display = 'none';
    // Скрываем кнопку очистки категории
    document.querySelectorAll('.clear-category-btn').forEach(btn => btn.style.display = 'none');

    // Добавляем кнопку экспорта в режим просмотра
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-outline-light btn-sm me-2';
    exportBtn.innerHTML = '<span class="material-icons">download</span> Экспорт';
    exportBtn.onclick = () => {
      // Открываем меню экспорта
      const exportMenu = document.createElement('div');
      exportMenu.style.position = 'absolute';
      exportMenu.style.top = '60px';
      exportMenu.style.right = '100px';
      exportMenu.style.background = 'white';
      exportMenu.style.borderRadius = '8px';
      exportMenu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
      exportMenu.style.zIndex = '1000';
      exportMenu.innerHTML = `
        <button class="btn btn-sm btn-link w-100 text-start" onclick="exportResults('pdf'); this.closest('div').remove();">PDF</button>
        <button class="btn btn-sm btn-link w-100 text-start" onclick="exportResults('confluence'); this.closest('div').remove();">HTML</button>
        <button class="btn btn-sm btn-link w-100 text-start" onclick="exportResults('confluence_multi'); this.closest('div').remove();">Confluence WIKI</button>
        <button class="btn btn-sm btn-link w-100 text-start" onclick="exportResults('jpg'); this.closest('div').remove();">JPG</button>
      `;
      document.body.appendChild(exportMenu);
      setTimeout(() => exportMenu.remove(), 5000);
    };

    // Показываем кнопку возврата
    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-outline-light btn-sm me-2';
    backBtn.innerHTML = '<span class="material-icons">arrow_back</span> Назад';
    backBtn.onclick = () => {
      currentSession = prevSession;
      currentUserId = prevUserId;
      isAdmin = prevIsAdmin;
      isViewOnly = false;
      goHome();
    };

    // Вставляем кнопки перед заголовком
    const header = document.querySelector('#session-page .d-flex.align-items-center');
    if (header) {
      const existingBack = header.querySelector('.back-to-history-btn');
      if (!existingBack) {
        backBtn.classList.add('back-to-history-btn');
        exportBtn.classList.add('back-to-history-btn');
        header.insertBefore(exportBtn, header.firstChild);
        header.insertBefore(backBtn, header.firstChild);
      }
    }

    showToast('Режим просмотра завершённой сессии', 'info');
  } catch (error) {
    console.error('Error opening session view:', error);
    showToast('Ошибка открытия сессии', 'danger');
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

  // Показываем панель управления только админу
  const adminViewControls = document.getElementById('admin-view-controls');
  const userDisplay = document.getElementById('user-display');
  if (adminViewControls) {
    adminViewControls.style.setProperty('display', isAdmin ? 'flex' : 'none', 'important');
  }
  if (userDisplay) {
    userDisplay.style.display = isAdmin ? 'none' : 'inline';
  }
  
  // Сразу обновляем список участников
  updateParticipantsList();
}

// Вернуться домой
function goHome(clearStorage = false) {
  // Уведомляем сервер о выходе из сессии
  if (currentSession && currentUserId) {
    socket.emit('participant:leave', {
      sessionId: currentSession.id,
      userId: currentUserId
    });
  }

  // Очищаем localStorage если нужно (после завершения сессии)
  if (clearStorage) {
    localStorage.removeItem('retroSession');
    if (currentSession) {
      localStorage.removeItem(`retroSessionTab_${currentSession.id}`);
      localStorage.removeItem(`hideOthersCards_${currentSession.id}`);
      localStorage.removeItem(`hideOthersVotes_${currentSession.id}`);
    }
  }

  currentSession = null;
  isAdmin = false;
  isViewOnly = false;
  userReactions = {};
  voteModeVotes = {};
  userVoteModeVotes = [];
  voteMode = false;
  votingStarted = false; // Сбрасываем при выходе из сессии
  sessionEnded = false; // Сбрасываем при выходе из сессии
  currentTab = 'brainstorm'; // Сбрасываем вкладку
  selectedDiscussionItems.clear(); // Очищаем выбранные карточки

  // Останавливаем автосохранение
  stopActionPlanAutoSave();

  participants.clear();
  addedItems.clear();
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

  // Возвращаем вкладку "Создать" обратно
  const createTab = document.querySelector('[data-bs-target="#create-tab"]');
  if (createTab) {
    createTab.parentElement.style.display = '';
  }

  // Проверяем наличие активной сессии и показываем кнопку "Вернуться в сессию"
  checkActiveSession();
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
