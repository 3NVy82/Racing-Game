import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js'
import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js'

console.log('✅ client.js загружен (жесткое управление без торка)')

let socket = io()
let scene, camera, renderer
let world, carBody
let keys = {}
let gameActive = false
let playerId = null
let lobbyId = null
let myCar = null
let enemyCar = null
let trafficMeshes = []
let currentSpeed = 0

const MAX_SPEED = 28
const ACCELERATION = 18
const BRAKE_FORCE = 25
const FRICTION = 0.97
const ROAD_HALF = 9.0

// ----- ЖЁСТКИЕ НАСТРОЙКИ ПОВОРОТА -----
const MAX_ANGULAR_SPEED = 1.2       // очень высокая скорость поворота
const ANGULAR_DAMPING = 0.9         // почти полное гашение колебаний

// --- Инициализация Three.js ---
function initThree() {
    console.log('🔧 initThree вызван')
    const canvas = document.getElementById('gameCanvas')
    if (!canvas) {
        console.error('❌ Canvas не найден')
        return false
    }
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0x87CEEB)

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.shadowMap.enabled = true

    window.addEventListener('resize', () => {
        if (!camera || !renderer) return
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
    })

    const ambient = new THREE.AmbientLight(0x404060)
    scene.add(ambient)
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(50, 100, 50)
    dirLight.castShadow = true
    scene.add(dirLight)

    const roadGeom = new THREE.PlaneGeometry(20, 1000)
    const roadMat = new THREE.MeshPhongMaterial({ color: 0x444444 })
    const road = new THREE.Mesh(roadGeom, roadMat)
    road.rotation.x = -Math.PI / 2
    road.position.z = 500
    road.receiveShadow = true
    scene.add(road)

    for (let i = 0; i < 100; i++) {
        const line = new THREE.Mesh(
            new THREE.PlaneGeometry(0.5, 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        )
        line.rotation.x = -Math.PI / 2
        line.position.set(0, 0.1, i * 10)
        scene.add(line)
    }

    for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 100; i++) {
            const curb = new THREE.Mesh(
                new THREE.BoxGeometry(0.5, 0.3, 2),
                new THREE.MeshPhongMaterial({ color: 0xff0000 })
            )
            curb.position.set(side * 10.5, 0.15, i * 10)
            scene.add(curb)
        }
    }

    console.log('✅ Three.js инициализирован')
    return true
}

// --- Физика ---
function initPhysics() {
    world = new CANNON.World()
    world.gravity.set(0, -20, 0)
    world.broadphase = new CANNON.NaiveBroadphase()
    world.solver.iterations = 15

    const groundMaterial = new CANNON.Material('ground')
    const carMaterial = new CANNON.Material('car')

    const groundShape = new CANNON.Plane()
    const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial })
    groundBody.addShape(groundShape)
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2)
    world.addBody(groundBody)

    const carShape = new CANNON.Box(new CANNON.Vec3(1, 0.5, 2))
    carBody = new CANNON.Body({ mass: 800, material: carMaterial })
    carBody.addShape(carShape)
    carBody.position.set(0, 0.8, 0)
    carBody.quaternion.set(0, 0, 0, 1)
    carBody.linearDamping = 0.3
    carBody.angularDamping = ANGULAR_DAMPING   // почти максимальное гашение
    world.addBody(carBody)

    const contactMat = new CANNON.ContactMaterial(groundMaterial, carMaterial, {
        friction: 3.5,
        restitution: 0.0
    })
    world.addContactMaterial(contactMat)
}

function createCar(color) {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.5, 4),
        new THREE.MeshPhongMaterial({ color })
    )
    body.position.y = 0.5
    group.add(body)

    const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.5, 2),
        new THREE.MeshPhongMaterial({ color: 0x333333, transparent: true, opacity: 0.6 })
    )
    cabin.position.set(0, 0.75, -0.5)
    group.add(cabin)

    const wheelPositions = [[-1, 0, 1.5], [1, 0, 1.5], [-1, 0, -1.5], [1, 0, -1.5]]
    for (const pos of wheelPositions) {
        const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8),
            new THREE.MeshPhongMaterial({ color: 0x222222 })
        )
        wheel.rotation.x = Math.PI / 2
        wheel.position.set(pos[0], pos[1], pos[2])
        group.add(wheel)
    }
    return group
}

function createTrafficCar() {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1, 2),
        new THREE.MeshPhongMaterial({ color: 0xff4444 })
    )
    body.position.y = 0.5
    group.add(body)
    return group
}

// --- Камера ---
function updateCamera() {
    if (!myCar || !camera) return
    const pos = myCar.position
    const rot = myCar.rotation.y

    const height = 6
    const distance = 14
    const offset = new THREE.Vector3(0, height, -distance)
    const rotatedOffset = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot)
    const targetPos = pos.clone().add(rotatedOffset)
    camera.position.copy(targetPos)

    const lookAhead = new THREE.Vector3(0, 1.5, 15)
    const rotatedLook = lookAhead.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot)
    const targetLook = pos.clone().add(rotatedLook)
    camera.lookAt(targetLook)
}

// --- Стабилизация (очень жёсткая) ---
function stabilizeCar() {
    if (!carBody) return
    const q = carBody.quaternion
    const euler = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion(q.x, q.y, q.z, q.w)
    )
    const maxAngle = 0.05   // почти не даём крениться
    euler.x = Math.max(-maxAngle, Math.min(maxAngle, euler.x))
    euler.z = Math.max(-maxAngle, Math.min(maxAngle, euler.z))
    const newQuat = new THREE.Quaternion().setFromEuler(euler)
    carBody.quaternion.set(newQuat.x, newQuat.y, newQuat.z, newQuat.w)

    // Гасим вращения по X и Z
    const angVel = carBody.angularVelocity
    angVel.x *= 0.5
    angVel.z *= 0.5
}

// --- Игровой цикл ---
function update() {
    if (!gameActive || !carBody || !myCar) return

    let throttle = 0
    let brake = 0
    let turn = 0
    let emergencyBrake = false

    if (keys['w']) throttle = 1
    if (keys['s']) brake = 1
    if (keys['a']) turn = 1
    if (keys['d']) turn = -1
    if (keys[' ']) emergencyBrake = true

    // Скорость
    if (emergencyBrake) {
        currentSpeed *= 0.85
        if (Math.abs(currentSpeed) < 0.1) currentSpeed = 0
    } else if (throttle) {
        currentSpeed = Math.min(currentSpeed + ACCELERATION * 0.016, MAX_SPEED)
    } else if (brake) {
        currentSpeed = Math.max(currentSpeed - BRAKE_FORCE * 0.016, -MAX_SPEED * 0.3)
    } else {
        currentSpeed *= FRICTION
        if (Math.abs(currentSpeed) < 0.1) currentSpeed = 0
    }

    // Прижим
    if (Math.abs(currentSpeed) > 0.3) {
        const downforceMag = Math.abs(currentSpeed) * 12.0
        const downforce = new CANNON.Vec3(0, -downforceMag, 0)
        carBody.applyForce(downforce, new CANNON.Vec3(0, -0.7, 0))
    }

    if (carBody.velocity.y > 0.2) carBody.velocity.y *= 0.8

    // Движение вперёд
    if (Math.abs(currentSpeed) > 0.01) {
        const forward = new CANNON.Vec3(0, 0, 1)
        const worldForward = new CANNON.Vec3()
        carBody.quaternion.vmult(forward, worldForward)
        worldForward.scale(currentSpeed * 10, worldForward)
        carBody.velocity.x = worldForward.x
        carBody.velocity.z = worldForward.z
    } else {
        carBody.velocity.x *= 0.95
        carBody.velocity.z *= 0.95
    }

    // Боковое трение (усиленное)
    const vel = carBody.velocity
    const forwardVec = new CANNON.Vec3(0, 0, 1)
    const worldForwardVec = new CANNON.Vec3()
    carBody.quaternion.vmult(forwardVec, worldForwardVec)
    const forwardSpeed = vel.dot(worldForwardVec)
    const lateralX = vel.x - forwardSpeed * worldForwardVec.x
    const lateralZ = vel.z - forwardSpeed * worldForwardVec.z
    vel.x -= lateralX * 0.3   // сильнее трение
    vel.z -= lateralZ * 0.3

    // ----- ПОВОРОТ: ЖЁСТКО И БЫСТРО -----
    // Чем выше скорость, тем сильнее поворот (но ограничиваем)
    const speedFactor = Math.min(Math.abs(currentSpeed) / 10, 1.5) + 0.5
    const targetAngular = turn * MAX_ANGULAR_SPEED * speedFactor

    // Устанавливаем угловую скорость напрямую (без интерполяции) – мгновенный отклик
    carBody.angularVelocity.y = targetAngular

    // Ограничим, чтобы не перекрутить
    const maxAng = MAX_ANGULAR_SPEED * 1.5
    carBody.angularVelocity.y = Math.max(-maxAng, Math.min(maxAng, carBody.angularVelocity.y))

    // Ограничение общей скорости
    const speed = Math.sqrt(vel.x*vel.x + vel.z*vel.z)
    if (speed > MAX_SPEED) {
        vel.x = (vel.x / speed) * MAX_SPEED
        vel.z = (vel.z / speed) * MAX_SPEED
    }

    // Бордюры
    const x = carBody.position.x
    if (x > ROAD_HALF) {
        carBody.position.x = ROAD_HALF
        carBody.velocity.x *= -0.3
    } else if (x < -ROAD_HALF) {
        carBody.position.x = -ROAD_HALF
        carBody.velocity.x *= -0.3
    }

    stabilizeCar()

    const euler = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion(carBody.quaternion.x, carBody.quaternion.y, carBody.quaternion.z, carBody.quaternion.w)
    )
    socket.emit('gameUpdate', {
        speed: currentSpeed,
        rotation: euler.y,
        position: { x: carBody.position.x, y: carBody.position.y, z: carBody.position.z }
    })

    world.step(1/60)

    myCar.position.copy(carBody.position)
    myCar.position.y = 1
    myCar.quaternion.set(carBody.quaternion.x, carBody.quaternion.y, carBody.quaternion.z, carBody.quaternion.w)

    updateCamera()
}

function animate() {
    requestAnimationFrame(animate)
    update()
    if (renderer && scene && camera) {
        renderer.render(scene, camera)
    }
}

// --- Сокеты (без изменений) ---
socket.on('lobbyCreated', (data) => {
    lobbyId = data.lobbyId
    playerId = data.playerId
    const info = document.getElementById('lobbyInfo')
    if (info) {
        info.innerHTML = `<h3>Лобби создано!</h3><p>ID: ${lobbyId}</p><p>Ожидание второго игрока...</p>`
    }
})

socket.on('lobbyJoined', (data) => {
    playerId = data.playerId
})

socket.on('lobbyUpdate', (data) => {
    const info = document.getElementById('lobbyInfo')
    if (info) {
        const players = data.players.map(p => p.name).join(', ')
        info.innerHTML = `<h3>Лобби ${data.id}</h3><p>Игроки: ${players}</p><p>Статус: ${data.status}</p>`
    }
})

socket.on('gameStart', () => {
    console.log('🏁 gameStart получен')
    document.getElementById('menu').style.display = 'none'
    const container = document.getElementById('gameContainer')
    container.style.display = 'block'
    container.style.width = '100vw'
    container.style.height = '100vh'

    if (!initThree()) {
        console.error('❌ initThree вернул false')
        return
    }
    initPhysics()

    myCar = createCar(0xff0000)
    myCar.position.set(-4, 0.8, 0)
    scene.add(myCar)

    if (carBody) {
        carBody.position.set(-4, 0.8, 0)
        carBody.velocity.set(0, 0, 0)
        carBody.quaternion.set(0, 0, 0, 1)
        carBody.angularVelocity.set(0, 0, 0)
    }

    enemyCar = createCar(0x0000ff)
    enemyCar.position.set(4, 0.8, 0)
    scene.add(enemyCar)

    setTimeout(() => {
        updateCamera()
        renderer.render(scene, camera)
    }, 50)

    gameActive = true
    animate()
    console.log('✅ Игра запущена, машины разъеханы далеко')
})

socket.on('gameState', (data) => {
    if (enemyCar && playerId) {
        const enemyPlayer = data.players.find(p => p.id !== playerId)
        if (enemyPlayer) {
            enemyCar.position.set(enemyPlayer.position.x, 1, enemyPlayer.position.z)
            enemyCar.rotation.y = enemyPlayer.rotation || 0
        }
    }

    if (data.traffic) {
        while (trafficMeshes.length < data.traffic.length) {
            const car = createTrafficCar()
            scene.add(car)
            trafficMeshes.push(car)
        }
        while (trafficMeshes.length > data.traffic.length) {
            const car = trafficMeshes.pop()
            scene.remove(car)
        }
        data.traffic.forEach((carData, i) => {
            const mesh = trafficMeshes[i]
            if (mesh) {
                mesh.position.set(carData.x, 1, carData.z)
            }
        })
    }

    const myPlayer = data.players.find(p => p.id === playerId)
    if (myPlayer) {
        document.getElementById('speed').textContent = `Скорость: ${Math.round(myPlayer.speed || 0)}`
        document.getElementById('distance').textContent = `Дистанция: ${Math.round(myPlayer.distance || 0)}м`
        document.getElementById('score').textContent = `Очки: ${myPlayer.score || 0}`
    }
})

socket.on('gameEnd', (data) => {
    gameActive = false
    document.getElementById('gameOver').style.display = 'block'
    document.getElementById('winnerText').textContent = `🏆 Победитель: ${data.winner}`
    let resultsHTML = ''
    data.players.forEach(p => {
        resultsHTML += `<div>${p.name}: Дистанция ${Math.round(p.distance)}м, Очки ${p.score}, ${p.finished ? '✅ Финишировал' : '❌ Не финишировал'}</div>`
    })
    document.getElementById('results').innerHTML = resultsHTML
})

socket.on('chatMessage', (data) => {
    const messages = document.getElementById('chatMessages')
    if (messages) {
        const msg = document.createElement('div')
        msg.innerHTML = `<strong>${data.playerName}:</strong> ${data.message}`
        messages.appendChild(msg)
        messages.scrollTop = messages.scrollHeight
    }
})

// --- UI ---
function createLobby() {
    const name = document.getElementById('playerName').value || 'Игрок'
    socket.emit('createLobby', { playerName: name })
}

function joinLobby() {
    const name = document.getElementById('playerName').value || 'Игрок'
    const id = document.getElementById('lobbyIdInput').value
    if (!id) {
        alert('Введите ID лобби')
        return
    }
    socket.emit('joinLobby', { lobbyId: id, playerName: name })
}

function sendChat(e) {
    if (e.key === 'Enter') {
        const input = document.getElementById('chatInput')
        const msg = input.value
        if (msg) {
            socket.emit('chatMessage', {
                playerName: document.getElementById('playerName').value,
                message: msg
            })
            input.value = ''
        }
    }
}

function backToMenu() {
    document.getElementById('gameOver').style.display = 'none'
    document.getElementById('gameContainer').style.display = 'none'
    document.getElementById('menu').style.display = 'flex'
    gameActive = false
}

document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true
    if (e.key === ' ') {
        e.preventDefault()
        keys[' '] = true
    }
})
document.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false
    if (e.key === ' ') {
        keys[' '] = false
    }
})

document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM загружен')
    const createBtn = document.getElementById('createLobbyBtn')
    if (createBtn) createBtn.addEventListener('click', createLobby)
    else console.error('❌ Кнопка createLobbyBtn не найдена')

    const joinBtn = document.getElementById('joinLobbyBtn')
    if (joinBtn) joinBtn.addEventListener('click', joinLobby)
    else console.error('❌ Кнопка joinLobbyBtn не найдена')

    const chatInput = document.getElementById('chatInput')
    if (chatInput) chatInput.addEventListener('keypress', sendChat)
    else console.error('❌ Поле chatInput не найдено')

    const backBtn = document.getElementById('backToMenuBtn')
    if (backBtn) backBtn.addEventListener('click', backToMenu)
    else console.warn('⚠️ Кнопка backToMenuBtn не найдена')
})

