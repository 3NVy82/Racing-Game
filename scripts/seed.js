import prisma from '../server/prisma/client.js'

async function seed() {
    console.log('🌱 Заполнение базы данных тестовыми данными...')

    // Создаем тестовую сессию
    const session = await prisma.gameSession.create({
        data: {
            lobbyId: 'TEST001',
            status: 'ENDED',
            totalDistance: 500,
            maxScore: 150,
            duration: 120,
            players: {
                create: [
                    {
                        name: 'Тестовый игрок 1',
                        score: 100,
                        distance: 300,
                        maxSpeed: 80,
                        dangerousManeuvers: 5,
                        collisions: 2,
                        finished: true,
                        gamesPlayed: 1,
                        gamesWon: 1
                    },
                    {
                        name: 'Тестовый игрок 2',
                        score: 80,
                        distance: 250,
                        maxSpeed: 75,
                        dangerousManeuvers: 3,
                        collisions: 3,
                        finished: true,
                        gamesPlayed: 1,
                        gamesWon: 0
                    }
                ]
            }
        },
        include: {
            players: true
        }
    })

    console.log('✅ Тестовые данные созданы!')
    console.log(`📊 Сессия: ${session.id}`)
}

seed()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect()
    })