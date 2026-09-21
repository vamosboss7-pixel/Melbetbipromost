import { usePlayer } from '../context/PlayerContext'

export default function WalletPage() {
  const { player, loading } = usePlayer()

  const depositBal = parseFloat(player?.depositBalance ?? '0')
  const mainBal = parseFloat(player?.mainBalance ?? '0')
  const bonusBal = parseFloat(player?.bonusBalance ?? '0')
  const bonusWithdrawable = player?.bonusWithdrawable ?? false

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at 50% 35%, #06452a 0%, #031b14 70%)',
        display: 'flex',
        flexDirection: 'column',
        padding: '0 16px 100px',
      }}
    >
      {/* Header */}
      <div style={{ paddingTop: 48, marginBottom: 24, textAlign: 'center' }}>
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 36 }}>💰</span>
        </div>
        <h1
          className="font-condensed"
          style={{ fontSize: 28, fontWeight: 800, letterSpacing: '0.08em', color: '#D4A017' }}
        >
          ዋሌት
        </h1>
        <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>ሂሳብ ዝርዝር</p>
      </div>

      {/* Balance Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Deposit Balance — non-withdrawable, for gameplay */}
        <div
          className="game-card"
          style={{ padding: '20px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-sq" style={{ width: 44, height: 44 }}>
              <span style={{ fontSize: 20 }}>💳</span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 2 }}>
                ዲፖዚት ባላንስ
              </div>
              <div style={{ fontSize: 11, color: '#e05c00' }}>ማውጣት አይቻልም · ለጨዋታ ብቻ</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              className="font-condensed"
              style={{ fontSize: 22, fontWeight: 700, color: '#f97316' }}
            >
              {loading ? '...' : depositBal.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>ETB</div>
          </div>
        </div>

        {/* Main Balance — withdrawable game winnings */}
        <div
          className="game-card"
          style={{ padding: '20px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="icon-sq" style={{ width: 44, height: 44 }}>
              <span style={{ fontSize: 20 }}>💵</span>
            </div>
            <div>
              <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 2 }}>
                ሜን ዋሌት
              </div>
              <div style={{ fontSize: 11, color: '#e05c00' }}>100 ብር ዲፖዚት ታሪክ ካለ ማውጣት ይቻላል</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              className="font-condensed"
              style={{ fontSize: 22, fontWeight: 700, color: '#D4A017' }}
            >
              {loading ? '...' : mainBal.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, color: '#888' }}>ETB</div>
          </div>
        </div>

        {/* Bonus Balance — withdrawable only after a lifetime deposit >= 100 ETB */}
        <div
          className="game-card"
          style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="icon-sq" style={{ width: 44, height: 44 }}>
                <span style={{ fontSize: 20 }}>🎁</span>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#aaa', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 2 }}>
                  ቦነስ ባላንስ
                </div>
                <div style={{ fontSize: 11, color: bonusWithdrawable ? '#22c55e' : '#e05c00' }}>
                  {bonusWithdrawable ? 'ማውጣት ይቻላል' : 'ማውጣት አይቻልም · 100 ብር ዲፖዚት ያስፈልጋል'}
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                className="font-condensed"
                style={{ fontSize: 22, fontWeight: 700, color: '#E91E8C' }}
              >
                {loading ? '...' : bonusBal.toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>ETB</div>
            </div>
          </div>

          {!bonusWithdrawable && bonusBal > 0 && (
            <div style={{ paddingTop: 4 }}>
              <p style={{ fontSize: 10, color: '#aaa', lineHeight: 1.6, margin: 0 }}>
                ⓘ ቦነስ ባላንስ ለማውጣት በላይፍታይም ቢያንስ አንድ ጊዜ <b style={{ color: '#E91E8C' }}>100 ብር</b> ዲፖዚት ማድረግ ያስፈልጋል።
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button
          className="btn-enter"
          style={{
            flex: 1,
            padding: '14px 0',
            fontSize: 14,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 16 }}>⬇️</span>
          <span className="font-condensed" style={{ letterSpacing: '0.08em', fontWeight: 700 }}>
            ያስገቡ
          </span>
        </button>
        <button
          style={{
            flex: 1,
            padding: '14px 0',
            fontSize: 14,
            border: '1.5px solid #00ff8c',
            background: 'transparent',
            borderRadius: 50,
            color: '#D4A017',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 16 }}>⬆️</span>
          <span className="font-condensed" style={{ letterSpacing: '0.08em', fontWeight: 700 }}>
            ያውጡ
          </span>
        </button>
      </div>

      {/* Info note */}
      <div
        style={{
          marginTop: 20,
          padding: '12px 14px',
          background: '#05251a',
          border: '1px solid #3a1010',
          borderRadius: 10,
        }}
      >
        <p style={{ fontSize: 11, color: '#888', lineHeight: 1.7 }}>
          💳 <b style={{ color: '#f97316' }}>ዲፖዚት ባላንስ</b> — ያስገቡት ብር ለጨዋታ ይውላል፣ ማውጣት አይቻልም።<br />
          💵 <b style={{ color: '#D4A017' }}>ሜን ዋሌት</b> — ከጨዋታ ያሸነፉት ብር፣ 100 ብር ዲፖዚት ታሪክ ካለ ማውጣት ይቻላል።<br />
          🎁 <b style={{ color: '#E91E8C' }}>ቦነስ ባላንስ</b> — ቦነስ ብር፣ Wagering እና 100 ብር ዲፖዚት ታሪክ ሲሟሉ ማውጣት ይቻላል።
        </p>
      </div>
    </div>
  )
}
