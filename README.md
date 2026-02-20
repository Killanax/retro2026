# Retro Board - Доска для ретроспектив

Современное приложение для проведения Scrum ретроспектив с поддержкой real-time collaboration.

## 🌐 Продакшен

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
| Supabase Dashboard | https://supabase.com/dashboard/project/hcrptymibbiryvxhmjjh │
| GitHub репозиторий | https://github.com/Killanax/retro2026                       |

> ⚠️ **Важно:** Free тариф Render засыпает через 15 минут без активности. Первый запрос после простоя будет загружаться ~30-50 секунд.

---

## 🚀 Быстрый старт

### Локальная разработка с PostgreSQL (рекомендуется)

**Вариант 1: Docker Compose (самый простой)**

```bash
# Запуск PostgreSQL и приложения
npm run docker:compose

# Остановка
npm run docker:compose:down
```

**Вариант 2: Локальный PostgreSQL**

1. Установите PostgreSQL
2. Создайте базу данных:
```bash
createdb retro_db
```

3. Создайте файл `.env` на основе `.env.example`:
```env
DB_TYPE=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/retro_db
NODE_ENV=development
PORT=3000
```

4. Запустите сервер:
```bash
npm run dev
```

### Локальная разработка с SQLite

```bash
# Установка better-sqlite3 (требуется компиляция)
npm install better-sqlite3

# Запуск в режиме разработки (SQLite)
npm run dev:sqlite

# Или продакшен режим (SQLite)
npm run start:sqlite
```

> **Примечание:** better-sqlite3 требует компиляции. На Windows может потребоваться Visual Studio Build Tools.

## 📦 Деплой на сервер

### ✅ Текущий деплой

Проект уже развёрнут:
- **Хостинг:** Render
- **База данных:** Supabase PostgreSQL
- **URL:** https://retroboard-1wvk.onrender.com

### Обновление на Render

При пуше в GitHub автоматический деплой запустится автоматически.

Или вручную в Render Dashboard:
1. Откройте https://render.com/dashboard
2. Найдите сервис `retro-board`
3. Нажмите **Manual Deploy → Deploy**

### Обновление базы данных на Supabase

1. Откройте https://supabase.com/dashboard/project/hcrptymibbiryvxhmjjh
2. Перейдите в **SQL Editor**
3. Выполните миграции при необходимости

---

### Вариант 1: Docker (локально)

```bash
# Сборка образа
npm run docker:build

# Запуск контейнера
npm run docker:run
```

Или вручную:
```bash
docker build -t retro-board .
docker run -p 3000:3000 -e DB_TYPE=postgres -e DATABASE_URL=your_postgres_url retro-board
```

### Вариант 2: VPS (Ubuntu/Debian)

```bash
# Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установка PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Создание БД
sudo -u postgres psql
CREATE DATABASE retro_db;
CREATE USER retro WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE retro_db TO retro;
\q

# Клонирование проекта
git clone <your-repo>
cd Retro
npm install --production

# Создание .env
cat > .env << EOF
DB_TYPE=postgres
DATABASE_URL=postgresql://retro:your_password@localhost:5432/retro_db
NODE_ENV=production
PORT=3000
EOF

# Запуск через PM2
sudo npm install -g pm2
pm2 start server.js --name retro-board
pm2 save
pm2 startup
```

## 🔧 Переменные окружения

| Переменная | Описание | По умолчанию |
|------------|----------|--------------|
| `DB_TYPE` | Тип БД: `postgres` или `sqlite` | `postgres` |
| `DATABASE_URL` | Connection string для PostgreSQL (обязательно для postgres) | - |
| `SQLITE_DB_PATH` | Путь к SQLite файлу (только для sqlite) | `./retro.db` |
| `PORT` | Порт сервера | `3000` |
| `NODE_ENV` | Окружение: `development` или `production` | `development` |

> **Важно:** По умолчанию используется PostgreSQL. Для использования SQLite установите `DB_TYPE=sqlite` и установите пакет `better-sqlite3`.

## 📋 Доступные команды

```bash
# Разработка
npm run dev              # Запуск с nodemon (авто-перезагрузка)
npm run dev:sqlite       # Разработка с SQLite
npm run dev:postgres     # Разработка с PostgreSQL

# Продакшен
npm start                # Обычный запуск
npm run start:sqlite     # Запуск с SQLite
npm run start:postgres   # Запуск с PostgreSQL

# Docker
npm run docker:build     # Сборка Docker образа
npm run docker:run       # Запуск контейнера
npm run docker:compose   # Запуск docker-compose (app + PostgreSQL)
npm run docker:compose:down  # Остановка docker-compose
```

## 🗄️ Структура базы данных

### Таблицы:
- `sessions` - сессии ретроспектив
- `items` - идеи, мемы, карточки
- `votes` - голоса за идеи
- `participants` - участники сессий
- `custom_memes` - пользовательские мемы сессии
- `global_memes` - глобальные мемы
- `user_moods` - настроение пользователей

## 🔌 API

### Основные эндпоинты:
- `POST /api/sessions` - создать сессию
- `GET /api/sessions/:id` - получить сессию
- `GET /api/sessions/:id/items` - получить все идеи
- `POST /api/sessions/:id/items` - добавить идею
- `PATCH /api/sessions/:id/items/:itemId` - обновить идею
- `DELETE /api/sessions/:id/items/:itemId` - удалить идею
- `POST /api/sessions/:id/items/:itemId/vote` - голосовать

### WebSocket события:
- `join` - присоединиться к сессии
- `timer:start/stop/reset` - управление таймером
- `participant:join/leave` - участники
- `item:created/updated/deleted` - идеи
- `meme:add/remove` - мемы

## 📝 Лицензия

ISC
