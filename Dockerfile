FROM node:18-alpine

WORKDIR /app

# Копируем package files
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY . .

# Порт по умолчанию
EXPOSE 3000

# Команда запуска
CMD ["node", "server.js"]
