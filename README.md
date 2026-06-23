# 🏎️ Racing Game 3D

**Многопользовательская гоночная игра с физикой, мультиплеером и 3D-графикой**

![Three.js](https://img.shields.io/badge/Three.js-3D-blue)
![Node.js](https://img.shields.io/badge/Node.js-22.x-green)
![Socket.io](https://img.shields.io/badge/Socket.io-RealTime-cyan)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-blue)
![Prisma](https://img.shields.io/badge/Prisma-ORM-white)

---

## 📋 Оглавление

1. [Описание](#-описание)
2. [Функционал](#-функционал)
3. [Технологии](#-технологии)
4. [Архитектура](#-архитектура)
5. [Установка и запуск](#-установка-и-запуск)
6. [Управление](#-управление)
7. [База данных](#-база-данных)
8. [API Эндпоинты](#-api-эндпоинты)
9. [Мультиплеер](#-мультиплеер)
10. [Структура проекта](#-структура-проекта)
11. [Разработка и отладка](#-разработка-и-отладка)
12. [Лицензия и контакты](#-лицензия-и-контакты)



## 📝 Описание

**Racing Game 3D** — гоночная игра с видом от третьего лица, где два игрока соревнуются на одной трассе в реальном времени через локальную сеть. Игра построена на современных веб-технологиях и работает прямо в браузере.

### Основная механика
- Игроки управляют автомобилями на 3D-трассе длиной 1000 метров.
- Цель — проехать как можно дальше и финишировать первым.
- За опасные манёвры и обгоны начисляются очки (+10).
- Столкновения с трафиком штрафуются (-5) и отбрасывают назад.
- Победитель определяется по дистанции; при ничьей — по очкам.
- Экстренное торможение по пробелу.

---

## 🎯 Функционал

### Игровой процесс
- 🏁 **3D-трасса** с разметкой и красными бордюрами.
- 🚗 **Реалистичное управление** с физикой Cannon.js.
- 🚦 **Трафик** — 20 машин, движущихся с разной скоростью.
- 💥 **Коллизии** с трафиком и бордюрами.
- ⭐ **Система очков** за опасные манёвры.
- 🏆 **Финиш** по достижении 1000 метров.

### Мультиплеер
- 👥 **До 2 игроков** в одной сессии.
- 🏠 **Локальная сеть** через IP-адрес сервера.
- 🔗 **Лобби** — создание и подключение по ID.
- 💬 **Чат** в реальном времени.
- 🔄 **Синхронизация** позиций, трафика, дистанции и очков.

### База данных (PostgreSQL + Prisma)
- 💾 Хранение сессий, игроков, статистики и сообщений чата.
- 📊 История всех завершённых игр.
- 🕒 Автоматическое обновление статистики.

---

## ⚙️ Технологии

| Компонент | Технология | Версия |
|-----------|------------|--------|
| **Backend** | Node.js + Express | 22.x |
| **Сеть** | Socket.IO | 4.x |
| **База данных** | PostgreSQL | 15+ |
| **ORM** | Prisma | 5.x |
| **3D Графика** | Three.js | 0.155.0 |
| **Физика** | Cannon-es | 0.20.0 |
| **Frontend** | HTML5, CSS3, JavaScript | ES Modules |

---

## 🏗️ Архитектура

Client (Browser) ←→ Socket.IO ←→ Server (Node.js)
       ↓                    ↓
   Three.js              Game Logic
   Cannon.js             Prisma ORM
                         ↓
                    PostgreSQL DB

### Основные компоненты
1. **Клиент** (`public/`) — 3D-сцена, физика, управление, сокеты.
2. **Сервер** (`server/`) — HTTP-сервер, WebSockets, игровая логика, API.
3. **База данных** — PostgreSQL с Prisma ORM.

---

## 🚀 Установка и запуск

### Требования
- Node.js (v16+)
- PostgreSQL (v13+)
- npm

### Пошаговая установка

#### 1. Клонирование репозитория
```bash
git clone https://github.com/ваш-ник/racing-game.git
cd racing-game
```

#### 2. Установка зависимостей
```bash
npm install
```

#### 3. Настройка базы данных
Создайте базу данных и пользователя в PostgreSQL:
```sql
CREATE DATABASE racing_game;
CREATE USER racing_user WITH PASSWORD 'ваш_пароль';
GRANT ALL PRIVILEGES ON DATABASE racing_game TO racing_user;
```

#### 4. Настройка `.env`
Создайте файл `.env` в корне проекта:
```env
DATABASE_URL="postgresql://racing_user:ваш_пароль@localhost:5432/racing_game?schema=public"
PORT=3000
NODE_ENV=development
CORS_ORIGIN="*"
```

#### 5. Миграция базы данных
```bash
npx prisma generate
npx prisma migrate dev --name init
```

#### 6. Запуск сервера
```bash
npm start
```
Для разработки (авто-перезагрузка):
```bash
npm run dev
```

#### 7. Открыть в браузере
```
http://localhost:3000
```

---

## 🎮 Управление

| Клавиша | Действие |
|---------|----------|
| **W** | Ускорение (газ) |
| **S** | Торможение / задний ход |
| **A** | Поворот налево |
| **D** | Поворот направо |
| **Пробел** | Экстренное торможение |

---

## 🗄️ База данных

### Модели Prisma (упрощённо)

```prisma
model GameSession {
  id          String        @id @default(cuid())
  lobbyId     String        @unique
  status      SessionStatus @default(WAITING)
  players     Player[]
  chatMessages ChatMessage[]
  trafficCars TrafficCar[]
  createdAt   DateTime      @default(now())
  endedAt     DateTime?
  winnerId    String?
  winner      Player?       @relation("WinnerSession")
  totalDistance Float @default(0)
  maxScore      Int   @default(0)
  duration      Int?
}

model Player {
  id             String   @id @default(cuid())
  name           String
  socketId       String?  @unique
  score          Int      @default(0)
  distance       Float    @default(0)
  maxSpeed       Float    @default(0)
  dangerousManeuvers Int @default(0)
  collisions     Int      @default(0)
  finished       Boolean  @default(false)
  gamesPlayed    Int      @default(0)
  gamesWon       Int      @default(0)
  gameSessionId  String
  gameSession    GameSession @relation(...)
}

model ChatMessage {
  id          String   @id @default(cuid())
  sessionId   String
  session     GameSession @relation(...)
  playerId    String
  player      Player   @relation(...)
  message     String   @db.Text
  timestamp   DateTime @default(now())
}

model GameStats {
  id              String   @id @default(cuid())
  date            DateTime @default(now())
  totalSessions   Int      @default(0)
  activePlayers   Int      @default(0)
  averageDuration Float    @default(0)
  maxDistance     Float    @default(0)
}

enum SessionStatus {
  WAITING
  PLAYING
  ENDED
}
```

### ER-диаграмма
```
GameSession 1───* Player
GameSession 1───* ChatMessage
GameSession 1───* TrafficCar
Player 1───* GameSession (как победитель)
```

---

## 🔌 API Эндпоинты

### GET `/api/stats`
Получить общую статистику игр.

**Ответ:**
```json
{
  "id": "...",
  "date": "2026-06-23T...",
  "totalSessions": 42,
  "activePlayers": 2,
  "averageDuration": 120,
  "maxDistance": 980
}
```

### GET `/api/sessions`
Получить список последних 20 сессий.

**Ответ:**
```json
[
  {
    "id": "...",
    "lobbyId": "A1B2C3",
    "players": [
      {
        "name": "Игрок1",
        "score": 150,
        "distance": 750,
        "finished": true
      }
    ],
    "createdAt": "2026-06-23T..."
  }
]
```

---

## 🌐 Мультиплеер

### Локальная сеть
1. Запустите сервер на одном компьютере.
2. Узнайте локальный IP: `ipconfig` (Windows) или `ifconfig` (Linux/Mac).
3. На другом компьютере в той же сети откройте:
   ```
   http://IP_СЕРВЕРА:3000
   ```
4. Первый игрок создаёт лобби, получает ID.
5. Второй игрок вводит ID и подключается.

### Интернет (через интернет)
Варианты:
- **Проброс портов** на роутере (порт 3000).
- **ngrok** — `ngrok http 3000`.
- **serveo** — `ssh -R 80:localhost:3000 serveo.net`.

### Механика игры
- Оба игрока стартуют на одной трассе.
- Каждый управляет своей машиной (красной или синей).
- Позиции синхронизируются через сервер в реальном времени.
- При финише одного игрока игра завершается для обоих.
- Результаты сохраняются в базу данных.



## 📁 Структура проекта


racing-game/
├── server/
│   ├── index.js              # Главный сервер (Express + Socket.IO)
│   ├── game.js               # Игровая логика
│   ├── lobby.js              # Управление лобби
│   └── prisma/
│       ├── schema.prisma     # Схема базы данных
│       └── client.js         # Prisma Client
├── public/
│   ├── index.html            # Главная страница
│   ├── style.css             # Стили
│   └── client.js             # Клиентский код (Three.js, Cannon.js)
├── prisma/
│   └── migrations/           # Миграции
├── .env                      # Переменные окружения (не в репозитории)
├── .gitignore                # Игнорируемые файлы
├── package.json              # Зависимости и скрипты
└── README.md                 # Документация




## 🧪 Разработка и отладка

### Добавление новых фич
1. Измените `server/game.js` или `public/client.js`.
2. Если меняете схему БД, обновите `schema.prisma` и выполните миграцию:
   ```bash
   npx prisma migrate dev --name new_feature
   ```

### Отладка
- **Клиент**: F12 → Console / Network.
- **Сервер**: логи в терминале.
- **База данных**: `npx prisma studio`.

### Сборка для продакшена
```bash
npm install --production
npm start
```

### Частые проблемы и решение

| Проблема | Решение |
|----------|---------|
| `Cannot find module 'express'` | Выполните `npm install` |
| Ошибка подключения к БД | Проверьте `.env` и запущен ли PostgreSQL |
| Кнопки не работают | Проверьте, что `client.js` загружен как модуль (`type="module"`) |
| Нет 3D-сцены | Проверьте консоль на ошибки Three.js |
| Машины не синхронизируются | Проверьте, что оба игрока в одном лобби |

---

## 📝 Лицензия

**MIT License** — свободное использование, модификация и распространение.

```
MIT License

Copyright (c) 2026 [3NVy]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software...
```

---

## 📧 Контакты

- **Автор**: [3NVy]
- **GitHub**: [[ссылка на профиль](https://github.com/3NVy82)]
- **Email**: [laki30358@gmail.com]
- **Проект**: [[ссылка на репозиторий](https://github.com/3NVy82/Racing-Game)]

---

## 🙏 Благодарности

- [Three.js](https://threejs.org/) — 3D-движок
- [Cannon.js](https://github.com/pmndrs/cannon-es) — физика
- [Socket.IO](https://socket.io/) — веб-сокеты
- [Prisma](https://www.prisma.io/) — ORM
- [PostgreSQL](https://www.postgresql.org/) — база данных

---

**Удачи на трассе!** 🏁

---
*Последнее обновление: июнь 2026*
```
```
