import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { CARTELAS } from '../data/cartelas'

export type GamePhase = 'waiting' | 'playing' | 'finished'

export interface GameState {
  roundId: string
  phase: GamePhase
  countdown: number
  playerCount: number
  playersWithCards: number
  prizePool: number
  netPrizePool: number
  calledBalls: number[]
  currentBall: number | null
}

export interface Winner {
  telegramId: number
  firstName: string
  cardId: number
  card: number[][]
  winPattern: number[]
}

export interface WinnerEvent {
  roundId: string
  winners: Winner[]
  prizePerWinner: number
}

const DEFAULT_STATE: GameState = {
  roundId: '',
  phase: 'waiting',
  countdown: 0,
  playerCount: 0,
  playersWithCards: 0,
  prizePool: 0,
  netPrizePool: 0,
  calledBalls: [],
  currentBall: null,
}

/** Mirrors server getWinPattern — returns true if any winning pattern is complete */
function checkWin(card: number[][], calledSet: Set<number>): boolean {
  const isMarked = (r: number, c: number) =>
    card[r]![c] === 0 || calledSet.has(card[r]![c]!)

  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every(c => isMarked(r, c))) return true
  }
  for (let c = 0; c < 5; c++) {
    if ([0, 1, 2, 3, 4].every(r => isMarked(r, c))) return true
  }
  if ([0, 1, 2, 3, 4].every(i => isMarked(i, i))) return true
  if ([0, 1, 2, 3, 4].every(i => isMarked(i, 4 - i))) return true
  if (([[0, 0], [0, 4], [4, 0], [4, 4]] as [number, number][]).every(([r, c]) => isMarked(r, c))) return true

  return false
}

export function useGame(
  selectedCardIds: number[],
  identity: { telegramId: number; firstName: string } | null,
) {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [gameState, setGameState] = useState<GameState>(DEFAULT_STATE)
  const [winner, setWinner] = useState<WinnerEvent | null>(null)
  const [myCardIds, setMyCardIds] = useState<number[]>([])
  const [takenCardIds, setTakenCardIds] = useState<number[]>([])
  const cardsSelectedRef = useRef(false)

  // Refs so the socket event closures always see current values
  const selectedCardIdsRef = useRef(selectedCardIds)
  const identityRef = useRef(identity)
  const gameStateRef = useRef<GameState>(DEFAULT_STATE)
  const claimedRoundRef = useRef<string | null>(null)

  useEffect(() => { selectedCardIdsRef.current = selectedCardIds }, [selectedCardIds])
  useEffect(() => { identityRef.current = identity }, [identity])

  /** Checks all player cards against calledSet; emits claim_bingo on the first win */
  function tryClaimWin(socket: Socket, calledBalls: number[], roundId: string) {
    if (!roundId || claimedRoundRef.current === roundId) return
    const calledSet = new Set(calledBalls)
    for (const cardId of selectedCardIdsRef.current) {
      const card = CARTELAS[cardId - 1]
      if (card && checkWin(card, calledSet)) {
        claimedRoundRef.current = roundId
        sessionStorage.setItem('claimedRound', roundId)
        socket.emit('claim_bingo', { roundId, cardId })
        break
      }
    }
  }

  useEffect(() => {
    // Restore claimed round from sessionStorage so a refresh within the same round
    // doesn't re-emit claim_bingo
    const storedClaimed = sessionStorage.getItem('claimedRound')
    if (storedClaimed) claimedRoundRef.current = storedClaimed

    const socket = io({
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      const id = identityRef.current
      if (id) {
        socket.emit('join_room', { telegramId: id.telegramId, firstName: id.firstName })
      }
      // Select cards immediately after joining
      if (selectedCardIdsRef.current.length > 0) {
        selectedCardIdsRef.current.forEach(id => socket.emit('select_card', id))
        cardsSelectedRef.current = true
      }
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('game_state', (state: GameState) => {
      gameStateRef.current = state
      setGameState(state)
      // If we haven't sent our cards yet and it's waiting phase, send them now
      if (!cardsSelectedRef.current && state.phase === 'waiting' && selectedCardIdsRef.current.length > 0) {
        selectedCardIdsRef.current.forEach(id => socket.emit('select_card', id))
        cardsSelectedRef.current = true
      }
      // Check for a win on reconnect/state sync during a live round
      if (state.phase === 'playing') {
        tryClaimWin(socket, state.calledBalls, state.roundId)
      }
    })

    socket.on('ball_called', (data: { ball: number; col: string; calledBalls: number[] }) => {
      if (data.ball != null) {
        const currentRoundId = gameStateRef.current.roundId
        const newState: GameState = {
          ...gameStateRef.current,
          calledBalls: data.calledBalls,
          currentBall: data.ball,
        }
        gameStateRef.current = newState
        setGameState(newState)

        // Win detection — check every card after every ball
        if (gameStateRef.current.phase === 'playing') {
          tryClaimWin(socket, data.calledBalls, currentRoundId)
        }
      }
    })

    socket.on('winner_declared', (data: WinnerEvent) => {
      // Persist both the winner event and the final called balls so WinnerPage can
      // correctly highlight all called cells (not just the win pattern)
      sessionStorage.setItem('winnerData', JSON.stringify(data))
      sessionStorage.setItem('calledBalls', JSON.stringify(gameStateRef.current.calledBalls))
      setWinner(data)
    })

    socket.on('round_reset', () => {
      setWinner(null)
      setMyCardIds([])
      cardsSelectedRef.current = false
      claimedRoundRef.current = null
      sessionStorage.removeItem('claimedRound')
      gameStateRef.current = DEFAULT_STATE
      setGameState(DEFAULT_STATE)
    })

    socket.on('my_cards', (data: { cardIds: number[] }) => {
      setMyCardIds(data.cardIds)
    })

    socket.on('cards_taken', (data: { cardIds: number[] }) => {
      setTakenCardIds(data.cardIds)
    })

    socket.on('player_count', (data: { count: number }) => {
      setGameState(prev => {
        const next = { ...prev, playerCount: data.count }
        gameStateRef.current = next
        return next
      })
    })

    return () => { socket.disconnect() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { connected, gameState, winner, myCardIds, takenCardIds }
}
