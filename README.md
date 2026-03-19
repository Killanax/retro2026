# Retro Board - Доска для ретроспектив

**Версия:** 2.2 (Рабочая версия)

Современное приложение для проведения Scrum ретроспектив с поддержкой real-time collaboration.

---

## ✨ Новая версия 2.2 - Улучшения голосования и UI

### 🔧 Исправления и улучшения (v2.2)

**Голосование:**
- ✅ После нажатия "СТОП" голосование блокируется для всех пользователей
- ✅ Голосование доступно только когда активен режим голосования (кнопка "Голосовать")
- ✅ При попытке голосовать после остановки показывается уведомление

**Выбор карточек для обсуждения:**
- ✅ После начала голосования выбор карточек заблокирован для обычных пользователей
- ✅ Админ может выбирать карточки для обсуждения после выключения голосования (нажатия "СТОП")
- ✅ После завершения сессии все могут выбирать карточки для обсуждения

**Вкладка "Обсуждение":**
- ✅ Карточки группируются по категориям с заголовками столбцов
- ✅ Названия столбцов соответствуют названиям из вкладки "Brain storm"
- ✅ Учитываются кастомные заголовки колонок
- ✅ Убран дублирующий блок категории из каждой карточки
- ✅ Порядок столбцов соответствует порядку в Brain storm

**UI/UX улучшения:**
- ✅ Кнопки редактирования и удаления колонок стали яркими (активными)
- ✅ Кнопка редактирования: фиолетовый фон и иконка indigo (#6366f1)
- ✅ Кнопка удаления: красный фон и иконка red (#ef4444)
- ✅ При наведении кнопки увеличиваются (scale 1.1)

**Серверные изменения:**
- ✅ Добавлено хранилище состояния голосования (sessionStates)
- ✅ При подключении клиента сервер отправляет состояние голосования
- ✅ Сохранение voteMode и sessionEnded в сессии

---

## ⚡ Быстрый старт (для ИИ-ассистента)

**Команды для запуска:**

```bash
# 1. Проверка статуса git (если нужно задеплоить)
git status && git log -3 --oneline

# 2. Запуск сервера (фон)
npm start

# 3. Остановка сервера
taskkill /F /PID <pid>
# или найти PID: netstat -ano | findstr :3000

# 4. Деплой на прод (пуш в main)
git add -A && git commit -m "feat: описание изменений" && git push origin main
```

**Сервер доступен:** http://localhost:3000
**Продакшен:** https://retroboard-1wvk.onrender.com

---

## 🚀 Полная инструкция по запуску

### Требования

- Node.js 16+
- Доступ к PostgreSQL (Supabase)

### Установка и запуск

```bash
# Установка зависимостей
npm install

# Запуск сервера (используется Supabase PostgreSQL)
npm start

# Или в режиме разработки с авто-перезагрузкой
npm run dev
```

Сервер запустится на **http://localhost:3000**

---

## 🖥️ Локальная разработка

### 1. Настройка .env файла

Скопируйте `.env.example` в `.env` и настройте подключение:

```bash
cp .env.example .env
```

**Содержимое `.env` для локальной разработки:**

```env
# PostgreSQL (Supabase)
DATABASE_URL=postgresql://postgres.hcrptymibbiryvxhmjjh:E8fReBp7Mp!@aws-1-eu-west-3.pooler.supabase.com:6543/postgres?pgbouncer=true

# Порт сервера
PORT=3000

# Окружение
NODE_ENV=development
```

> ⚠️ **Важно:** Локальная разработка использует ту же базу данных Supabase, что и продакшен.

### 2. Запуск локального сервера

```bash
# 1. Установка зависимостей (если ещё не установлены)
npm install

# 2. Запуск сервера
npm start

# 3. Режим разработки с авто-перезагрузкой (рекомендуется)
npm run dev
```

**Сервер доступен:** http://localhost:3000

### 3. Проверка работы

1. Откройте http://localhost:3000 в браузере
2. Создайте новую сессию (вкладка "Создать")
3. Пароль для вкладки создания: `yurassss`
4. Скопируйте ID сессии и откройте в другом браузере/вкладке для тестирования real-time

### 4. Остановка сервера

```bash
# В терминале нажмите Ctrl+C
```

### 5. Перезапуск при проблемах

```bash
# Остановить сервер (Ctrl+C)
# Очистить кэш npm (опционально)
npm cache clean --force

# Перезапустить
npm start
```

---

## ✨ Новая версия 2.1 - Редизайн и исправления

### 🎨 Редизайн UI/UX (Февраль 2026)

**Современная дизайн-система:**
- ✅ **Цветовая палитра**: градиенты indigo/purple (#6366f1 → #8b5cf6)
- ✅ **Стекломорфизм**: эффекты матового стекла для навигации и карточек
- ✅ **Плавные анимации**: transition, transform, hover-эффекты
- ✅ **Скругления**: radius-sm/md/lg/xl/full для всех элементов
- ✅ **Тени нового поколения**: shadow-sm/md/lg/xl/2xl/glow

**Обновлённые компоненты:**
- ✅ Навигационная панель с backdrop-filter blur(20px)
- ✅ Карточки ретроспективы с hover-эффектами
- ✅ Кнопки с градиентами и анимациями
- ✅ Формы и input-поля с focus-эффектами
- ✅ Модальные окна с современными тенями
- ✅ Таймер с градиентным фоном
- ✅ Смайлы настроения с text-shadow
- ✅ Список участников с аватарами
- ✅ Скроллбары с кастомным дизайном

**Дизайн блоков:**
- ✅ Блок настроений: `border-radius: var(--radius-full)` + backdrop-filter
- ✅ Группа голосования: оригинальные стили сохранены
- ✅ Кнопки "Админ", "Завершить": `border-radius: var(--radius-full)`
- ✅ ID сессии: расположен над кнопками

### 🔧 Исправления (v2.1)

**Экспорт Confluence:**
- ✅ Добавлена поддержка **кастомных колонок** в экспорте
- ✅ Собираются все колонки: стандартные из шаблона + пользовательские
- ✅ Универсальный CSS стиль для кастомных заголовков
- ✅ Исправлена ошибка с отображением CSS внутри тега `<style>`

**Дублирование карточек в Обсуждении:**
- ✅ `renderDiscussionTab()`: проверка на дублирование через Set
- ✅ `toggleDiscussionItem()`: синхронизация `for_discussion` в `currentSession.items`
- ✅ `toggleVoteMode()`: синхронизация `selectedDiscussionItems` при выключении голосования
- ✅ Сервер: отправка `discussion:toggle` события при обновлении `for_discussion`

**Прочее:**
- ✅ Удалено имя 'ПчёлкаАнал' из RANDOM_NAMES (заменено на 'ПчёлкаАналитик')
- ✅ Обновлены стили для всех Bootstrap кнопок и форм

---

## ✨ Новые функции (v2.0)

### Вкладки Brain storm и Обсуждение
- ✅ Переключение между вкладками "Brain storm" и "Обсуждение"
- ✅ Карточки отображаются в обеих вкладках одновременно
- ✅ Чекбоксы для выбора карточек в обсуждение
- ✅ Сохранение вкладки в localStorage

### План действий
- ✅ Rich-text редактор с форматированием (жирный, курсив, цвет, размер шрифта)
- ✅ Поля "Кому" и "Когда" для назначения ответственных
- ✅ Автосохранение каждые 5 секунд
- ✅ Real-time синхронизация между клиентами
- ✅ Сохранение форматирования в БД (HTML)

### Экспорт
- ✅ JSON - полный экспорт сессии
- ✅ PDF/TXT - текстовый экспорт с планами действий
- ✅ Confluence (HTML) - таблица с карточками, реакциями, планами

### Голосование
- ✅ Круглые лайки для голосования
- ✅ Блокировка объединения/разъединения после голосования
- ✅ Сохранение голосов в БД

### Режим просмотра
- ✅ Просмотр завершённых сессий из истории
- ✅ Режим только чтения для пользователей
- ✅ Экспорт из режима просмотра

### Улучшения
- ✅ Автоматический вход по ссылке с случайным именем
- ✅ Изменение размера контейнера "Обсуждение"
- ✅ Сохранение настроек отображения (скрыть карточки других)
- ✅ Миграции БД для новых полей

---

## 🔧 Исправленные проблемы (v1.1)

### Обмен карточек местами
- ✅ Исправлено ложное сообщение "Ошибка обмена местами"
- ✅ Убран ручной DOM exchange (WebSocket автоматически обновляет)

### Сохранение реакций при объединении/разъединении
- ✅ Реакции сохраняются по индексу части (не по тексту)
- ✅ Синхронизация userReactions при item:created и item:updated
- ✅ Сохранение оригинальных реакций при повторном объединении

---

## 🌐 Продакшен (Render + PostgreSQL)

**Сайт:** https://retroboard-1wvk.onrender.com

### ✅ Статус компонентов

| Компонент              | Статус                               |
|------------------------|--------------------------------------|
| Render (хостинг)       | ✅ Работает                          |
| Supabase (база данных) | ✅ Подключена                        |
| Socket.IO (WebSocket)  | ✅ Работает                          |

### 🔗 Ссылки

| Сервис             | Ссылка                                                      |
|--------------------|-------------------------------------------------------------|
| Ваш сайт           | https://retroboard-1wvk.onrender.com                        |
| Render Dashboard   | https://render.com/dashboard                                |
| Supabase Dashboard | https://supabase.com/dashboard/project/hcrptymibbiryvxhmjjh |
| GitHub репозиторий | https://github.com/Killanax/retro2026                       |

> ⚠️ **Важно:** Free тариф Render засыпает через 15 минут без активности. Первый запрос после простоя будет загружаться ~30-50 секунд.

---

## 📦 Как залить проект на сервер (Render)

### 1. Подготовка базы данных (Supabase)

1. Зайдите в [Supabase Dashboard](https://supabase.com/dashboard/project/hcrptymibbiryvxhmjjh)
2. Таблицы создаются автоматически при первом запуске приложения
3. Получите connection string в разделе **Settings → Database**

### 2. Настройка Render

1. Зайдите в [Render Dashboard](https://render.com/dashboard)
2. Создайте новый сервис **Web Service**
3. Подключите ваш GitHub репозиторий
4. Настройте переменные окружения:

```env
DATABASE_URL=postgresql://postgres.hcrptymibbiryvxhmjjh:E8fReBp7Mp!@aws-1-eu-west-3.pooler.supabase.com:6543/postgres?pgbouncer=true
NODE_ENV=production
PORT=3000
```

5. Нажмите **Create Web Service**

### 3. Обновление проекта на сервере

**Автоматически:** При пуше в ветку `main` деплой запустится автоматически.

**Вручную:**
1. Откройте [Render Dashboard](https://render.com/dashboard)
2. Найдите сервис `retro-board`
3. Нажмите **Manual Deploy → Deploy**

### 4. Обновление базы данных на Supabase

1. Откройте [SQL Editor](https://supabase.com/dashboard/project/hcrptymibbiryvxhmjjh/sql)
2. Выполните необходимые миграции:

```sql
-- Миграции для новых функций v2.0
ALTER TABLE items ADD COLUMN IF NOT EXISTS for_discussion BOOLEAN DEFAULT false;
ALTER TABLE items ADD COLUMN IF NOT EXISTS action_plan_text TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS action_plan_who TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS action_plan_when TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS merged_parts_data TEXT;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hide_others_cards BOOLEAN DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS hide_others_votes BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS vote_mode_votes (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, item_id, user_id)
);
```

---

## 🔧 Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `DATABASE_URL` | Connection string для PostgreSQL (Supabase) | - |
| `PORT` | Порт сервера | `3000` |
| `NODE_ENV` | Окружение: `development` или `production` | `development` |

> **Важно:** Проект использует только PostgreSQL (Supabase) как для локальной разработки, так и для продакшена.

---

## 📋 Доступные команды

```bash
# Установка зависимостей
npm install

# Запуск сервера
npm start

# Разработка с авто-перезагрузкой
npm run dev

# Docker (опционально)
npm run docker:build           # Сборка образа
npm run docker:run             # Запуск контейнера
npm run docker:compose         # Запуск app + PostgreSQL
npm run docker:compose:down    # Остановка
```

---

## 🗄️ Структура базы данных

### Таблицы:
- `sessions` - сессии ретроспектив
- `items` - идеи, мемы, карточки (с планами действий)
- `votes` - голоса за идеи
- `participants` - участники сессий
- `custom_memes` - пользовательские мемы сессии
- `global_memes` - глобальные мемы
- `user_moods` - настроение пользователей
- `vote_mode_votes` - голоса в режиме голосования

### Новые колонки в items:
- `for_discussion` - выбрана ли карточка для обсуждения
- `action_plan_text` - текст плана действий (HTML с форматированием)
- `action_plan_who` - ответственный (Кому)
- `action_plan_when` - срок (Когда)
- `merged_parts_data` - данные объединённых частей

---

## 🔌 API

### Основные эндпоинты:
- `POST /api/sessions` - создать сессию
- `GET /api/sessions/:id` - получить сессию
- `GET /api/sessions/:id/items` - получить все идеи
- `POST /api/sessions/:id/items` - добавить идею
- `PATCH /api/sessions/:id/items/:itemId` - обновить идею
- `DELETE /api/sessions/:id/items/:itemId` - удалить идею
- `POST /api/sessions/:id/items/:itemId/vote` - голосовать
- `PATCH /api/sessions/:id/items/:itemId/action-plan` - сохранить план действий
- `PATCH /api/sessions/:id/items/:itemId/discussion` - выбрать для обсуждения

### WebSocket события:
- `join` - присоединиться к сессии
- `timer:start/stop/reset` - управление таймером
- `participant:join/leave` - участники
- `item:created/updated/deleted` - идеи
- `meme:add/remove` - мемы
- `vote:mode` - режим голосования
- `vote:submit/updated` - голоса
- `discussion:toggle` - выбор карточки для обсуждения
- `action-plan:update` - обновление плана действий (real-time)
- `view:settings` - настройки отображения

---

## 📝 Лицензия

ISC
