import prisma from './prisma/client.js'

class Game {
  constructor(lobby, io) {
    this.lobby = lobby
    this.io = io
    this.players = lobby.players.map(p => ({
      id: p.id,
      name: p.name,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      speed: 0,
      score: 0,
      distance: 0,
      carColor: p.id === lobby.players[0].id ? 0xff0000 : 0x0000ff,
      finished: false,
      dangerousManeuvers: 0,
      collisions: 0,
      maxSpeed: 0
    }))

    this.traffic = []
    this.maxTraffic = 20
    this.roadLength = 1000
    this.gameActive = true
    this.startTime = Date.now()
    this.updateCount = 0

    // Генерируем трафик и сохраняем в БД
    this.initTraffic()

    // Запускаем игровой цикл
    this.gameLoop = setInterval(() => this.update(), 1000/60)
  }

  async initTraffic() {
    for (let i = 0; i < this.maxTraffic; i++) {
      const car = {
        x: (Math.random() - 0.5) * 10,
        z: Math.random() * this.roadLength,
        speed: 20 + Math.random() * 30,
        width: 1.5 + Math.random(),
        height: 1 + Math.random() * 0.5,
        color: `#${Math.floor(Math.random()*16777215).toString(16)}`
      }
      this.traffic.push(car)
    }
  }

  updatePlayer(playerId, data) {
    const player = this.players.find(p => p.id === playerId)
    if (!player || !this.gameActive) return

    const speed = data.speed || 0
    const rotation = data.rotation || 0

    // Обновляем максимальную скорость
    if (speed > player.maxSpeed) {
      player.maxSpeed = speed
    }

    // Проверяем на опасный маневр
    if (Math.abs(rotation) > 0.5 && speed > 30) {
      player.dangerousManeuvers++
      player.score += 10
    }

    // Обновляем позицию
    player.position.x += Math.sin(rotation) * speed * 0.016
    player.position.z += Math.cos(rotation) * speed * 0.016
    player.rotation = rotation
    player.speed = speed

    // Обновляем дистанцию
    if (player.position.z > player.distance) {
      player.distance = player.position.z
    }

    // Проверка коллизий с трафиком
    this.checkCollisions(player)

    // Проверка финиша
    if (player.position.z >= this.roadLength) {
      player.finished = true
      this.checkGameEnd()
    }
  }

  checkCollisions(player) {
    for (const traffic of this.traffic) {
      const dx = player.position.x - traffic.x
      const dz = player.position.z - traffic.z
      const distance = Math.sqrt(dx * dx + dz * dz)

      if (distance < 2) {
        player.collisions++
        player.position.z -= 10
        player.score = Math.max(0, player.score - 5)
        player.speed = 0
        break
      }
    }
  }

  async checkGameEnd() {
    const finishedPlayers = this.players.filter(p => p.finished)
    if (finishedPlayers.length === this.players.length) {
      await this.endGame()
    }
  }

  async endGame() {
    this.gameActive = false
    clearInterval(this.gameLoop)

    // Определяем победителя
    let winner = this.players[0]
    for (const player of this.players) {
      if (player.distance > winner.distance ||
          (player.distance === winner.distance && player.score > winner.score)) {
        winner = player
      }
    }

    // Сохраняем результаты в БД
    try {
      const session = await prisma.gameSession.findUnique({
        where: { lobbyId: this.lobby.id }
      })

      if (session) {
        // Обновляем каждого игрока
        for (const player of this.players) {
          await prisma.player.update({
            where: { id: player.id },
            data: {
              score: player.score,
              distance: player.distance,
              maxSpeed: player.maxSpeed,
              dangerousManeuvers: player.dangerousManeuvers,
              collisions: player.collisions,
              finished: player.finished,
              gamesPlayed: { increment: 1 },
              ...(player.id === winner.id ? { gamesWon: { increment: 1 } } : {})
            }
          })
        }

        // Обновляем сессию
        await prisma.gameSession.update({
          where: { id: session.id },
          data: {
            status: 'ENDED',
            endedAt: new Date(),
            winnerId: winner.id,
            totalDistance: Math.max(...this.players.map(p => p.distance)),
            maxScore: Math.max(...this.players.map(p => p.score)),
            duration: Math.floor((Date.now() - this.startTime) / 1000)
          }
        })

        // Обновляем или создаем статистику
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        await prisma.gameStats.upsert({
          where: { date: today },
          update: {
            totalSessions: { increment: 1 },
            activePlayers: this.players.length,
            averageDuration: {
              // В реальном приложении нужно вычислять среднее
            },
            maxDistance: {
              max: Math.max(...this.players.map(p => p.distance))
            }
          },
          create: {
            date: today,
            totalSessions: 1,
            activePlayers: this.players.length,
            averageDuration: Math.floor((Date.now() - this.startTime) / 1000),
            maxDistance: Math.max(...this.players.map(p => p.distance))
          }
        })
      }
    } catch (error) {
      console.error('❌ Ошибка сохранения результатов:', error)
    }

    this.lobby.endGame(winner)
    this.io.to(this.lobby.id).emit('gameEnd', {
      winner: winner.name,
      players: this.players.map(p => ({
        name: p.name,
        distance: p.distance,
        score: p.score,
        finished: p.finished,
        maxSpeed: p.maxSpeed,
        dangerousManeuvers: p.dangerousManeuvers,
        collisions: p.collisions
      }))
    })

    console.log(`🏆 Игра завершена! Победитель: ${winner.name}`)
  }

  stopGame() {
    this.gameActive = false
    clearInterval(this.gameLoop)
  }

  update() {
    if (!this.gameActive) return

    this.updateCount++

    // Обновляем трафик
    for (const traffic of this.traffic) {
      traffic.z += traffic.speed * 0.016
      if (traffic.z > this.roadLength) {
        traffic.z = 0
        traffic.x = (Math.random() - 0.5) * 10
        traffic.speed = 20 + Math.random() * 30
      }
    }

    // Отправляем обновление всем игрокам (каждый 2-й кадр для оптимизации)
    if (this.updateCount % 2 === 0) {
      this.io.to(this.lobby.id).emit('gameState', {
        players: this.players.map(p => ({
          id: p.id,
          name: p.name,
          position: p.position,
          rotation: p.rotation,
          speed: p.speed,
          score: p.score,
          distance: p.distance,
          finished: p.finished,
          carColor: p.carColor
        })),
        traffic: this.traffic
      })
    }
  }
}

export default Game

