import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'

interface WinnerData {
  roundId: string
  winners: { telegramId: number; firstName: string; cardId: number; card: number[][], winPattern: number[] }[]
  prizePerWinner: number
}

const TOTAL_COUNTDOWN = 8

// Confetti particles (stable — computed once)
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  left: `${(i * 37) % 100}%`,
  color: i % 4 === 0 ? '#D4A017' : i % 4 === 1 ? '#e53e3e' : i % 4 === 2 ? '#ff8c00' : '#fff',
  size: 4 + (i % 5),
  delay: `${(i * 0.37) % 3}s`,
  duration: `${2.8 + (i % 3) * 0.6}s`,
}))

const BINGO_COLS = ['B', 'I', 'N', 'G', 'O']

/** Returns which column index (0-4) is the win column, or null for row/diagonal/corners */
function getWinColumnIndex(card: number[][], winPattern: Set<number>): number | null {
  const winCols = new Set<number>()
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const n = card[r]![c]!
      if (n === 0 || winPattern.has(n)) winCols.add(c)
    }
  }
  // Pure column win = all 5 win cells share the same column
  if (winCols.size === 1) return [...winCols][0]!
  return null
}

export default function WinnerPage() {
  const [, navigate] = useLocation()
  const [countdown, setCountdown] = useState(TOTAL_COUNTDOWN)

  const isPreview = new URLSearchParams(window.location.search).has('preview')

  const [winnerData] = useState<WinnerData | null>(() => {
    if (isPreview) return {
      roundId: 'preview',
      winners: [{ telegramId: 383356, firstName: 'ALEM', cardId: 349,
        card: [[1,18,31,46,61],[5,21,33,53,63],[9,22,0,56,66],[10,23,38,59,70],[13,24,45,60,74]],
        winPattern: [31,33,38,45] }],
      prizePerWinner: 72,
    }
    try { return JSON.parse(sessionStorage.getItem('winnerData') ?? 'null') } catch { return null }
  })
  const [calledBalls] = useState<number[]>(() => {
    if (isPreview) return [10,63,70,53,31,33,38,45,13]
    try { return JSON.parse(sessionStorage.getItem('calledBalls') ?? '[]') } catch { return [] }
  })

  const winner = winnerData?.winners?.[0]
  const card = winner?.card ?? null
  const winPattern = new Set(winner?.winPattern ?? [])
  const calledSet = new Set(calledBalls)
  const prize = winnerData?.prizePerWinner ?? 0

  // The last called ball that completed the win pattern — shown glowing white
  const lastWinBall = [...calledBalls].reverse().find(b => winPattern.has(b)) ?? -1

  const winColIdx = card ? getWinColumnIndex(card, winPattern) : null

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); navigate('/slots'); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [navigate])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 25%, #06452a 0%, #031b14 55%, #02120d 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px 16px 28px',
      position: 'relative',
      overflowX: 'hidden',
    }}>

      {/* Confetti */}
      {CONFETTI.map(c => (
        <div key={c.id} style={{
          position: 'fixed', left: c.left, top: '-10px',
          width: c.size, height: c.size, borderRadius: 2,
          background: c.color, opacity: 0.7, pointerEvents: 'none', zIndex: 0,
          animation: `confetti-fall ${c.duration} ${c.delay} linear infinite`,
        }} />
      ))}

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ── Trophy + Title ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 4 }}>
          {/* Trophy SVG */}
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <path d="M16 7 L36 7 L36 29 C36 37 26 43 26 43 C26 43 16 37 16 29 Z" fill="#7a0020" stroke="#F06292" strokeWidth="1.8"/>
            <path d="M8 9 L16 9 L16 23 C8 23 4 17 8 9 Z" fill="#6b0018" stroke="#F06292" strokeWidth="1.2"/>
            <path d="M44 9 L36 9 L36 23 C44 23 48 17 44 9 Z" fill="#6b0018" stroke="#F06292" strokeWidth="1.2"/>
            <rect x="20" y="43" width="12" height="4" rx="1.5" fill="#F06292"/>
            <rect x="15" y="47" width="22" height="4" rx="2" fill="#F06292"/>
            <path d="M22 21 L24 25 L29 25 L25.5 28 L27 33 L22.5 30 L18 33 L20 28 L16.5 25 L21 25 Z" fill="#FFD700"/>
          </svg>

          <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: '#ffffff', letterSpacing: '0.04em', fontFamily: 'Oswald, sans-serif' }}>
              KEFTA CHAMPION
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, color: '#ffffff', letterSpacing: '0.04em', fontFamily: 'Oswald, sans-serif' }}>
              DECLARED
            </div>
          </div>

          <div style={{ fontSize: 10, color: '#9a7070', letterSpacing: '0.14em', fontWeight: 600, marginTop: 2 }}>
            TOTAL DERASH PRIZE POOL
          </div>
        </div>

        {/* ── Grand Pool ── */}
        <div style={{
          background: 'linear-gradient(135deg, #06452a 0%, #05251a 100%)',
          border: '1.5px solid #7a2525',
          borderRadius: 14,
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          boxShadow: '0 0 18px rgba(192,57,43,0.3)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#c87070', letterSpacing: '0.08em', fontFamily: 'Oswald, sans-serif' }}>
            GRAND POOL:
          </span>
          <span style={{ fontSize: 38, fontWeight: 900, color: '#D4A017', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>
            {prize > 0 ? prize : '—'}
          </span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#D4A017', fontFamily: 'Oswald, sans-serif' }}>ETB</span>
        </div>

        {/* ── Winner Info ── */}
        <div style={{
          background: 'linear-gradient(135deg, #06452a 0%, #05251a 100%)',
          border: '1.5px solid #7a2525',
          borderRadius: 14,
          padding: '12px 16px',
          boxShadow: '0 0 14px rgba(192,57,43,0.25)',
        }}>
          {/* Avatar row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            {/* @ avatar */}
            <div style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, #00ff8c, #00c96b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px solid #e85050',
              boxShadow: '0 0 10px rgba(192,57,43,0.5)',
            }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#fff', fontFamily: 'Oswald, sans-serif' }}>@</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#ffffff', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.03em' }}>
                @{winner?.firstName ?? '—'}
              </div>
              <div style={{ fontSize: 10, color: '#9a7070', letterSpacing: '0.06em', fontWeight: 600, marginTop: 1 }}>
                PLAYER NODE: {winner?.telegramId ?? '—'}
              </div>
            </div>
          </div>
          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(192,57,43,0.3)', margin: '4px 0 8px' }} />
          {/* Payout row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#c87070', letterSpacing: '0.08em', fontFamily: 'Oswald, sans-serif' }}>
              PAYOUT:
            </span>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#D4A017', fontFamily: 'Oswald, sans-serif', lineHeight: 1 }}>
              {prize > 0 ? `${prize} ETB` : '—'}
            </span>
          </div>
        </div>

        {/* ── Winning Cartela ── */}
        {card ? (
          <div style={{
            background: 'linear-gradient(160deg, #06452a 0%, #1c090c 100%)',
            border: '1.5px solid #7a2525',
            borderRadius: 16,
            padding: '12px 12px 14px',
            boxShadow: '0 0 20px rgba(192,57,43,0.3)',
          }}>
            {/* Card header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>👑</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#D4A017', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.05em' }}>
                Cartela #{winner?.cardId ?? '—'}
              </span>
              <span style={{
                background: '#166534', border: '1px solid #22c55e',
                borderRadius: 6, padding: '2px 8px',
                fontSize: 10, fontWeight: 800, color: '#86efac', letterSpacing: '0.06em',
              }}>VIP TICKET</span>
            </div>

            {/* BINGO header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 4 }}>
              {BINGO_COLS.map((letter, ci) => (
                <div key={letter} style={{
                  borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '6px 0',
                  fontSize: 16, fontWeight: 900, letterSpacing: '0.05em',
                  fontFamily: 'Oswald, sans-serif',
                  ...(winColIdx === ci
                    ? {
                        background: 'linear-gradient(135deg, #065f46, #047857)',
                        color: '#6ee7b7',
                        border: '1px solid #10b981',
                        boxShadow: '0 0 8px rgba(16,185,129,0.4)',
                      }
                    : {
                        background: '#200d10',
                        color: '#c0c0c0',
                        border: '1px solid #3a1515',
                      }),
                }}>
                  {letter}
                </div>
              ))}
            </div>

            {/* Number grid */}
            {card.map((row, ri) => (
              <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 4 }}>
                {row.map((num, ci) => {
                  const isFree = num === 0
                  const isLastWin = num === lastWinBall
                  const isWin = !isFree && winPattern.has(num)
                  const isCalled = !isFree && calledSet.has(num)

                  let cellStyle: React.CSSProperties = {}

                  if (isLastWin) {
                    // Bright glowing white — the winning ball
                    cellStyle = {
                      background: '#ffffff',
                      border: '2px solid #ffffff',
                      color: '#031b14',
                      boxShadow: '0 0 16px 4px rgba(255,255,255,0.9), 0 0 30px 8px rgba(255,255,255,0.4)',
                      fontWeight: 900,
                      fontSize: 16,
                    }
                  } else if (isFree) {
                    cellStyle = {
                      background: 'linear-gradient(135deg, #08734a, #05251a)',
                      border: '1.5px solid #7a2525',
                      color: '#D4A017',
                      fontSize: 18,
                    }
                  } else if (isWin && isCalled) {
                    // Win pattern cells — amber/gold
                    cellStyle = {
                      background: 'linear-gradient(135deg, #92400e, #b45309)',
                      border: '1.5px solid #D4A017',
                      color: '#fef3c7',
                      boxShadow: '0 0 8px rgba(212,160,23,0.5)',
                      fontWeight: 800,
                    }
                  } else if (isCalled) {
                    // Called but not in win pattern — red
                    cellStyle = {
                      background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                      border: '1px solid #dc2626',
                      color: '#fca5a5',
                    }
                  } else {
                    // Uncalled
                    cellStyle = {
                      background: '#200d10',
                      border: '1px solid #3a1515',
                      color: '#d0d0d0',
                    }
                  }

                  return (
                    <div key={ci} style={{
                      borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      aspectRatio: '1',
                      fontSize: 14, fontWeight: 700,
                      fontFamily: 'Oswald, sans-serif',
                      transition: 'box-shadow 0.2s',
                      ...cellStyle,
                    }}>
                      {isFree ? '👑' : num}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="game-card" style={{ padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#888' }}>ካርቴላ ዳታ አልተገኘም</div>
          </div>
        )}

        {/* ── Countdown ── */}
        <div>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#e05050', letterSpacing: '0.1em', fontFamily: 'Oswald, sans-serif' }}>
              NEXT MATCH STARTS IN {countdown}S
            </span>
          </div>
          <div style={{ height: 5, background: '#06452a', borderRadius: 4, overflow: 'hidden' }}>
            <div className="progress-fill" style={{ width: `${(countdown / TOTAL_COUNTDOWN) * 100}%` }} />
          </div>
        </div>

        {/* ── Back button ── */}
        <button
          className="btn-enter"
          onClick={() => navigate('/slots')}
          style={{ width: '100%', padding: '13px 0', border: 'none', cursor: 'pointer' }}
        >
          <span style={{ fontFamily: 'Oswald, sans-serif', letterSpacing: '0.12em', fontSize: 16, fontWeight: 800 }}>
            BACK TO LOBBY
          </span>
        </button>

      </div>
    </div>
  )
}
