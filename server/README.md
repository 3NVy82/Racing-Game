# 🏎️ Racing Game 3D

Многопользовательская 3D гоночная игра с локальным мультиплеером, физикой и системой очков.

## 📋 План проекта

### Технологии
- **Backend**: Node.js, Express, Socket.IO
- **База данных**: PostgreSQL + Prisma ORM
- **Frontend**: Three.js (3D), Cannon.js (физика)
- **Мультиплеер**: WebSockets (Socket.IO)

### Функционал
- ✅ Локальный мультиплеер (2 игрока)
- ✅ Система лобби и сессий
- ✅ 3D графика с Three.js
- ✅ Физика автомобилей (Cannon.js)
- ✅ Система коллизий
- ✅ Чат в реальном времени
- ✅ Система очков за опасные маневры
- ✅ Сохранение результатов в PostgreSQL
- ✅ Определение победителя
- ✅ Статистика игр

### Архитектура
Client (Browser) ←→ Socket.IO ←→ Server (Node.js)
↓ ↓
Three.js Game Logic
Cannon.js Prisma ORM
↓
PostgreSQL DB