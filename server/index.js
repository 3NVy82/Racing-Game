import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import Game from './game.js'
import Lobby from './lobby.js'
import prisma from './prisma/client.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"]
  }
})

app.use(express.static(path.join(__dirname, './public')))

const lobbies = new Map()
const games = new Map()

io.on('connection', (socket) => {
  console.log(`🎮 Игрок подключен: ${socket.id}`)

  // Создание лобби
  socket.on('createLobby', async (data) => {
    try {
      const lobbyId = Math.random().toString(36).substring(2, 8).toUpperCase()
      const lobby = new Lobby(lobbyId, data.playerName)
      lobbies.set(lobbyId, lobby)
      socket.join(lobbyId)
      socket.data.lobbyId = lobbyId
      socket.data.playerName = data.playerName

      const session = await prisma.gameSession.create({
        data: {
          lobbyId: lobbyId,
          status: 'WAITING',
          players: {
            create: {
              name: data.playerName,
              socketId: socket.id,
              score: 0,
              distance: 0,
              joinTime: new Date()
            }
          }
        },
        include: { players: true }
      })

      lobby.sessionId = session.id
      const playerId = session.players[0].id
      socket.data.playerId = playerId

      socket.emit('lobbyCreated', {
        lobbyId,
        sessionId: session.id,
        playerId: playerId
      })
      io.to(lobbyId).emit('lobbyUpdate', lobby.getInfo())
      console.log(`📋 Создано лобби ${lobbyId} игроком ${data.playerName}`)
    } catch (error) {
      console.error('❌ Ошибка создания лобби:', error)
      socket.emit('error', 'Не удалось создать лобби')
    }
  })

  // Подключение к лобби
  socket.on('joinLobby', async (data) => {
    try {
      const lobby = lobbies.get(data.lobbyId)
      if (!lobby) {
        socket.emit('error', 'Лобби не найдено')
        return
      }
      if (lobby.players.length >= 2) {
        socket.emit('error', 'Лобби заполнено')
        return
      }

      const session = await prisma.gameSession.findUnique({
        where: { lobbyId: data.lobbyId },
        include: { players: true }
      })
      if (!session) {
        socket.emit('error', 'Сессия не найдена')
        return
      }

      socket.join(data.lobbyId)
      socket.data.lobbyId = data.lobbyId
      socket.data.playerName = data.playerName
      lobby.addPlayer(data.playerName, socket.id)

      const player = await prisma.player.create({
        data: {
          name: data.playerName,
          socketId: socket.id,
          score: 0,
          distance: 0,
          joinTime: new Date(),
          gameSessionId: session.id
        }
      })

      socket.data.playerId = player.id
      socket.emit('lobbyJoined', { playerId: player.id })

      io.to(data.lobbyId).emit('lobbyUpdate', lobby.getInfo())
      console.log(`👥 Игрок ${data.playerName} подключился к лобби ${data.lobbyId}`)

      // Запускаем игру, когда два игрока
      if (lobby.players.length === 2) {
        await prisma.gameSession.update({
          where: { id: session.id },
          data: { status: 'PLAYING', updatedAt: new Date() }
        })

        const game = new Game(lobby, io)
        games.set(data.lobbyId, game)
        lobby.startGame()

        const playersData = lobby.players.map(p => {
          const gp = game.players.find(g => g.id === p.id)
          return {
            id: p.id,
            name: p.name,
            position: gp ? gp.position : { x: 0, y: 0.8, z: 0 }
          }
        })

        io.to(data.lobbyId).emit('gameStart', {
          players: playersData,
          sessionId: session.id
        })
        console.log(`🏁 Игра началась в лобби ${data.lobbyId}`)
      }
    } catch (error) {
      console.error('❌ Ошибка подключения к лобби:', error)
      socket.emit('error', 'Не удалось подключиться к лобби')
    }
  })

  // Обработка игровых событий
  socket.on('gameUpdate', (data) => {
    const lobbyId = socket.data.lobbyId
    if (!lobbyId) return
    const game = games.get(lobbyId)
    if (!game) return
    game.updatePlayer(socket.id, data)
  })

  // Чат
  socket.on('chatMessage', async (data) => {
    const lobbyId = socket.data.lobbyId
    if (!lobbyId) return
    try {
      const session = await prisma.gameSession.findUnique({ where: { lobbyId } })
      if (session) {
        await prisma.chatMessage.create({
          data: {
            sessionId: session.id,
            playerId: socket.data.playerId || '',
            message: data.message,
            timestamp: new Date()
          }
        })
      }
    } catch (error) {
      console.error('❌ Ошибка сохранения сообщения:', error)
    }
    io.to(lobbyId).emit('chatMessage', {
      playerName: data.playerName || 'Аноним',
      message: data.message,
      timestamp: Date.now()
    })
  })

  // Отключение
  socket.on('disconnect', async () => {
    console.log(`👋 Игрок отключен: ${socket.id}`)
    const lobbyId = socket.data.lobbyId
    if (!lobbyId) return
    const lobby = lobbies.get(lobbyId)
    if (lobby) {
      lobby.removePlayer(socket.id)
      io.to(lobbyId).emit('lobbyUpdate', lobby.getInfo())
      if (socket.data.playerId) {
        try {
          await prisma.player.update({
            where: { id: socket.data.playerId },
            data: { leaveTime: new Date(), gamesPlayed: { increment: 1 } }
          })
        } catch (error) {
          console.error('❌ Ошибка обновления игрока:', error)
        }
      }
      if (lobby.players.length === 0) {
        lobbies.delete(lobbyId)
        const game = games.get(lobbyId)
        if (game) { game.stopGame(); games.delete(lobbyId) }
        try {
          const session = await prisma.gameSession.findUnique({ where: { lobbyId } })
          if (session && session.status !== 'ENDED') {
            await prisma.gameSession.update({
              where: { id: session.id },
              data: {
                status: 'ENDED',
                endedAt: new Date(),
                duration: Math.floor((Date.now() - session.createdAt.getTime()) / 1000)
              }
            })
            console.log(`📊 Сессия ${lobbyId} завершена`)
          }
        } catch (error) {
          console.error('❌ Ошибка закрытия сессии:', error)
        }
      }
    }
  })
})

// API эндпоинты
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await prisma.gameStats.findFirst({ orderBy: { date: 'desc' } })
    res.json(stats)
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения статистики' })
  }
})

app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await prisma.gameSession.findMany({
      include: { players: { select: { name: true, score: true, distance: true, finished: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20
    })
    res.json(sessions)
  } catch (error) {
    res.status(500).json({ error: 'Ошибка получения сессий' })
  }
})

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`)
  console.log(`📊 База данных: PostgreSQL`)
  console.log(`🔗 http://localhost:${PORT}`)
})

process.on('SIGTERM', async () => {
  console.log('🔄 Завершение...')
  await prisma.$disconnect()
  httpServer.close()
  process.exit(0)
})

