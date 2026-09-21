import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import { io, type Socket } from 'socket.io-client'
import { CARTELAS } from '../data/cartelas'
import { usePlayer } from '../context/PlayerContext'

interface GameState {
  phase: 'waiting' | 'playing' | 'finished'
  countdown: number
  playersWithCards: number
  playerCount: number
  netPrizePool: number
  stakePerCard?: number
}

export default function SlotSelectionPage() {
  const [, navigate] = useLocation()
  const [selectedSlots, setSelectedSlots] = useState<number[]>([])
  const [stakePerCard, setStakePerCard] = useState<number>(0)
  const [showNoBalance, setShowNoBalance] = useState(false)
  const { player, refresh } = usePlayer()
  // Live play-balance updated immediately via balance_update socket events
  const [livePlayBalance, setLivePlayBalance] = useState<number | null>(null)

  // ── Server-side state ─────────────────────────────────────────────────────
  const [serverCountdown, setServerCountdown] = useState<number>(30)
  const [gamePhase, setGamePhase] = useState<GameState['phase']>('waiting')
  const [totalCards, setTotalCards] = useState<number>(0)
  const [netPrizePool, setNetPrizePool] = useState<number>(0)
  const [takenCards, setTakenCards] = useState<Set<number>>(new Set())
  const socketRef = useRef<Socket | null>(null)
  const playerRef = useRef(player)
  const selectedSlotsRef = useRef(selectedSlots)

  useEffect(() => { playerRef.current = player }, [player])
  useEffect(() => { selectedSlotsRef.current = selectedSlots }, [selectedSlots])

  // Refresh balance when returning to this page (e.g. after a game finishes)
  useEffect(() => {
    void refresh()
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Connect to socket and listen to server countdown/phase
  useEffect(() => {
    const socket = io({ path: '/api/socket.io', transports: ['websocket', 'polling'] })
    socketRef.current = socket

    const emitJoin = () => {
      const p = playerRef.current
      if (p) socket.emit('join_room', { telegramId: p.telegramId, firstName: p.firstName })
    }

    socket.on('connect', emitJoin)

    socket.on('game_state', (state: GameState) => {
      setServerCountdown(state.countdown)
      setGamePhase(state.phase)
      setTotalCards(state.playersWithCards ?? 0)
      setNetPrizePool(state.netPrizePool ?? 0)
    })

    socket.on('balance_update', (data: { depositBalance?: string; mainBalance: string; bonusBalance: string }) => {
      // Use combined ETB balance for stake affordability check
      setLivePlayBalance(parseFloat(data.depositBalance ?? '0') + parseFloat(data.mainBalance) + parseFloat(data.bonusBalance))
    })

    // Receive which card IDs are already taken by other players
    socket.on('cards_taken', (data: { cardIds: number[] }) => {
      setTakenCards(new Set(data.cardIds))
    })

    // When a round resets, clear local card selection and taken-cards set
    socket.on('round_reset', () => {
      setSelectedSlots([])
      setTakenCards(new Set())
      setGamePhase('waiting')
    })

    return () => { socket.disconnect(); socketRef.current = null }
  }, [])

  // If player loads after socket is already connected, emit join
  useEffect(() => {
    if (player && socketRef.current?.connected) {
      socketRef.current.emit('join_room', { telegramId: player.telegramId, firstName: player.firstName })
    }
  }, [player])

  // ── Navigate to game only when server starts the round AND player has cards ─
  useEffect(() => {
    if (gamePhase === 'playing') {
      const cards = selectedSlotsRef.current
      if (cards.length > 0) {
        sessionStorage.setItem('selectedSlots', JSON.stringify(cards))
        navigate('/game')
      }
      // No cards selected → stay on /slots, wait for round_reset → next round
    }
  }, [gamePhase, navigate])

  // ── Fetch stake ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/game/rooms')
      .then(r => r.json())
      .then((data: { room10?: { stakePerCard: number } | null }) => {
        setStakePerCard(data?.room10?.stakePerCard ?? 0)
      })
      .catch(() => {})
  }, [])

  // ── Balance helpers ───────────────────────────────────────────────────────
  // Staking deducts from depositBalance first, then mainBalance/bonusBalance.
  // livePlayBalance tracks the combined total, updated via balance_update socket events.
  const totalBalanceNum = livePlayBalance ?? (player ? (parseFloat(player.depositBalance ?? '0') + parseFloat(player.mainBalance) + parseFloat(player.bonusBalance)) : 0)

  const canAffordOneMore = () => {
    if (stakePerCard <= 0) return true
    // Already-selected cards have been deducted from the balance — check only for 1 more
    return totalBalanceNum >= stakePerCard
  }

  // ── Card selection — emit to server immediately ───────────────────────────
  const toggleSlot = (n: number) => {
    // Block only if taken by another player; own selected cards must remain deselectable
    if (takenCards.has(n) && !selectedSlots.includes(n)) return
    setSelectedSlots(prev => {
      if (prev.includes(n)) {
        socketRef.current?.emit('deselect_card', n)
        return prev.filter(x => x !== n)
      }
      if (prev.length >= 2) return prev
      if (!canAffordOneMore()) { setShowNoBalance(true); return prev }
      socketRef.current?.emit('select_card', n)
      return [...prev, n]
    })
  }

  const randomPick = (count: 1 | 2) => {
    // Account for refunds from currently-selected cards before checking affordability
    const balanceAfterRefund = stakePerCard > 0
      ? totalBalanceNum + selectedSlotsRef.current.length * stakePerCard
      : totalBalanceNum
    if (stakePerCard > 0 && balanceAfterRefund < count * stakePerCard) { setShowNoBalance(true); return }
    const available = Array.from({ length: 500 }, (_, i) => i + 1).filter(n => !takenCards.has(n) && !selectedSlotsRef.current.includes(n))
    const picked = available.sort(() => Math.random() - 0.5).slice(0, count)
    // Deselect old, select new on server
    selectedSlotsRef.current.forEach(n => socketRef.current?.emit('deselect_card', n))
    picked.forEach(n => socketRef.current?.emit('select_card', n))
    setSelectedSlots(picked)
  }

  const formatTime = (s: number) => `00:${String(Math.max(0, s)).padStart(2, '0')}`

  const numbers = Array.from({ length: 500 }, (_, i) => i + 1)

  const displayName = player
    ? (player.username ? `@${player.username}` : player.firstName)
    : '...'

  const totalBalance = (player || livePlayBalance !== null) ? totalBalanceNum.toFixed(2) : '—'

  // Show a dimmed overlay when game is in progress and this player has no cards
  const waitingForNextRound = gamePhase === 'playing' && selectedSlots.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'radial-gradient(ellipse at 50% 30%, #06452a 0%, #031b14 70%)', position: 'relative' }}>

      {/* Insufficient Balance Modal */}
      {showNoBalance && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #05251a, #2d1212)',
            border: '1.5px solid #b8860b',
            borderRadius: 20,
            padding: '32px 24px 24px',
            width: '100%',
            maxWidth: 340,
            textAlign: 'center',
            boxShadow: '0 0 32px rgba(212,160,23,0.2)',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, #00ff8c, #00c96b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: 28,
            }}>👛</div>
            <div className="font-condensed" style={{
              fontSize: 20, fontWeight: 900, color: '#fff',
              letterSpacing: '0.08em', marginBottom: 10,
            }}>INSUFFICIENT BALANCE</div>
            <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.5, marginBottom: 6 }}>
              ካርቴላ ለመምረጥ ETB ያስፈልጋል። ዲፖዚት ያድርጉ።
            </div>
            {stakePerCard > 0 && (
              <div style={{ fontSize: 12, color: '#D4A017', fontWeight: 700, marginBottom: 20 }}>
                ለ 1 ካርቴላ: {stakePerCard} ETB ያስፈልጋል
              </div>
            )}
            <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
              ETB: <span style={{ color: '#fff', fontWeight: 700 }}>💰 {totalBalance}</span>
            </div>
            <button
              onClick={() => setShowNoBalance(false)}
              style={{
                width: '100%', padding: '13px 0',
                borderRadius: 50, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(to right, #00ff8c, #b7ff00)',
                fontSize: 15, fontWeight: 800, color: '#fff',
                letterSpacing: '0.08em',
              }}
            >CLOSE</button>
          </div>
        </div>
      )}

      {/* "Game in progress — wait for next round" overlay */}
      {waitingForNextRound && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 90,
          background: 'rgba(0,0,0,0.72)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 16,
        }}>
          <div style={{ fontSize: 40 }}>⏳</div>
          <div className="font-condensed" style={{
            fontSize: 22, fontWeight: 900, color: '#D4A017',
            letterSpacing: '0.06em', textAlign: 'center',
          }}>GAME IN PROGRESS</div>
          <div style={{ fontSize: 14, color: '#aaa', textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
            ካርቴላ አልመረጡም። ጨዋታው ሲጠናቀቅ ቀጣዩ ዙር ይጀምራል።
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#05251a', borderBottom: '1px solid #08734a', padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, #00ff8c, #b7ff00)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
                border: '2px solid #d4a017'
              }}>
                🪙
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#D4A017', letterSpacing: '0.04em' }}>{displayName}</div>
                <div style={{ fontSize: 10, color: '#999', letterSpacing: '0.02em' }}>KEFTA BINGO</div>
              </div>
            </div>
            {gamePhase === 'waiting' && (
              <button
                onClick={() => navigate('/')}
                style={{
                  background: 'none', border: '1.5px solid #08734a', borderRadius: 8,
                  color: '#aaa', cursor: 'pointer', padding: '5px 8px',
                  fontSize: 15, lineHeight: 1, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="ወደ ሎቢ ተመለስ"
              >
                ←
              </button>
            )}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0, overflowX: 'auto', paddingTop: 2 }}>
            <div className="stat-chip" style={{ flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: '#999', letterSpacing: '0.05em', fontWeight: 600 }}>
                {gamePhase === 'playing' ? 'NEXT ROUND' : 'CLOSES IN'}
              </span>
              <span style={{
                fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
                color: gamePhase === 'playing' ? '#888' : serverCountdown <= 5 ? '#ff4444' : '#39ff88',
              }}>
                {gamePhase === 'playing' ? '—' : formatTime(serverCountdown)}
              </span>
            </div>
            <div className="stat-chip" style={{ flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: '#999', letterSpacing: '0.05em', fontWeight: 600 }}>🎴 CARDS</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{totalCards}</span>
            </div>
            <div className="stat-chip" style={{ flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: '#999', letterSpacing: '0.05em', fontWeight: 600 }}>🏆 ደራሽ</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#D4A017' }}>{netPrizePool.toFixed(0)} ETB</span>
            </div>
            <div className="stat-chip" style={{ flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: '#999', letterSpacing: '0.05em', fontWeight: 600 }}>💰 ETB</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#D4A017' }}>{totalBalance}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable grid only */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px' }}>

        {/* Grand Slots label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="6" height="6" rx="1" stroke="#D4A017" strokeWidth="1.5"/>
            <rect x="9" y="1" width="6" height="6" rx="1" stroke="#D4A017" strokeWidth="1.5"/>
            <rect x="1" y="9" width="6" height="6" rx="1" stroke="#D4A017" strokeWidth="1.5"/>
            <rect x="9" y="9" width="6" height="6" rx="1" stroke="#D4A017" strokeWidth="1.5"/>
          </svg>
          <span className="font-condensed" style={{ fontSize: 14, fontWeight: 700, color: '#D4A017', letterSpacing: '0.06em' }}>
            GRAND SLOTS (1 - 500)
          </span>
        </div>

        {/* Number Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 5 }}>
          {numbers.map(n => {
            const isTaken = takenCards.has(n) && !selectedSlots.includes(n)
            const isSelected = selectedSlots.includes(n)
            return (
              <div
                key={n}
                className={`slot-cell${isTaken ? ' highlighted' : ''}${isSelected ? ' highlighted' : ''}`}
                onClick={() => toggleSlot(n)}
                style={{
                  ...(isSelected ? { background: '#06452a', boxShadow: '0 0 8px rgba(255,140,0,0.5)' } : {}),
                  ...(isTaken ? { cursor: 'not-allowed', opacity: 0.5 } : {}),
                }}
              >
                {n}
              </div>
            )
          })}
        </div>
      </div>

      {/* MY CARTELAS — fixed, never scrolls */}
      <div style={{
        flexShrink: 0,
        background: '#031b14',
        borderTop: '1px solid #3a1212',
        padding: '10px 12px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15 }}>🎴</span>
            <span className="font-condensed" style={{ fontSize: 14, fontWeight: 700, color: '#D4A017', letterSpacing: '0.06em' }}>
              MY CARTELAS ({selectedSlots.length}/2)
            </span>
          </div>
        </div>

        {/* Two cartela slot previews */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          {[0, 1].map(i => {
            const cardNum = selectedSlots[i]
            const card = cardNum ? CARTELAS[cardNum - 1] : null
            const COLS = ['B','I','N','G','O']
            return (
            <div
              key={i}
              className="cartela-placeholder"
              style={{ padding: card ? '8px 6px' : '18px 10px', minHeight: 100 }}
              onClick={() => { if (!card) randomPick(1) }}
            >
              {card ? (
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#888', letterSpacing: '0.05em' }}>SLOT #{i+1}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#D4A017' }}>#{cardNum}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, marginBottom: 2 }}>
                    {COLS.map(c => (
                      <div key={c} style={{
                        textAlign: 'center', fontSize: 9, fontWeight: 800,
                        color: '#D4A017', letterSpacing: '0.04em', lineHeight: 1,
                      }}>{c}</div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2 }}>
                    {card.map((row, r) =>
                      row.map((num, c) => (
                        <div key={`${r}-${c}`} style={{
                          aspectRatio: '1',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 3,
                          background: num === 0 ? 'linear-gradient(135deg,#00ff8c,#b7ff00)' : '#05251a',
                          border: num === 0 ? 'none' : '1px solid #3a1212',
                          fontSize: num === 0 ? 10 : 8,
                          fontWeight: 700,
                          color: num === 0 ? '#fff' : '#ccc',
                          lineHeight: 1,
                        }}>
                          {num === 0 ? '★' : num}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    border: '1.5px dashed #08734a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, color: '#08734a'
                  }}>+</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.04em' }}>SLOT #{i + 1} EMPTY</div>
                  <div style={{ fontSize: 9, color: '#555', textAlign: 'center', letterSpacing: '0.03em' }}>TAP GRID (1-500) OR RANDOM PICK</div>
                </>
              )}
            </div>
          )})}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <button
            onClick={() => randomPick(1)}
            style={{
              flex: 1, padding: '11px 0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              border: 'none', cursor: 'pointer', borderRadius: 50,
              background: 'linear-gradient(to right, #7c3aed, #a855f7)',
            }}
          >
            <span style={{ fontSize: 13 }}>🎲</span>
            <span className="font-condensed" style={{ letterSpacing: '0.08em', fontSize: 15, fontWeight: 700, color: '#fff' }}>RANDOM PICK 1</span>
          </button>
          <button
            onClick={() => randomPick(2)}
            style={{
              flex: 1, padding: '11px 0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              border: 'none', cursor: 'pointer', borderRadius: 50,
              background: 'linear-gradient(to right, #00ff8c, #b7ff00)',
            }}
          >
            <span style={{ fontSize: 13 }}>🎲</span>
            <span className="font-condensed" style={{ letterSpacing: '0.08em', fontSize: 15, fontWeight: 700, color: '#fff' }}>RANDOM PICK 2</span>
          </button>
        </div>
        <div style={{ paddingBottom: 20 }} />
      </div>
    </div>
  )
}
