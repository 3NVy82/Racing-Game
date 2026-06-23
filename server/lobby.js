class Lobby {
  constructor(id, hostName) {
    this.id = id
    this.hostName = hostName
    this.players = []
    this.maxPlayers = 2
    this.status = 'waiting' // waiting, playing, ended
    this.sessionId = null
  }

  addPlayer(name, socketId) {
    if (this.players.length >= this.maxPlayers) return false
    this.players.push({ id: socketId, name })
    return true
  }

  removePlayer(socketId) {
    this.players = this.players.filter(p => p.id !== socketId)
  }

  startGame() {
    this.status = 'playing'
  }

  endGame(winner) {
    this.status = 'ended'
  }

  getInfo() {
    return {
      id: this.id,
      players: this.players,
      status: this.status,
      maxPlayers: this.maxPlayers
    }
  }
}

export default Lobby