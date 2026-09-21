import { useState, useEffect, useCallback, useRef } from 'react'

// ──────────────────────────────────────────────
// Auth helpers
// ──────────────────────────────────────────────
const TOKEN_KEY = 'admin_session_token'
function getToken() { return localStorage.getItem(TOKEN_KEY) ?? '' }
function saveToken(t: string) { localStorage.setItem(TOKEN_KEY, t) }
function clearToken() { localStorage.removeItem(TOKEN_KEY) }

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-admin-token': getToken(), ...extra }
}
async function apiPost(path: string, body: object) {
  const res = await fetch(path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) })
  return res.json()
}
async function apiPut(path: string, body: object) {
  const res = await fetch(path, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) })
  return res.json()
}
async function apiPatch(path: string, body: object) {
  const res = await fetch(path, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) })
  return res.json()
}
async function apiDelete(path: string, params?: string) {
  const url = params ? `${path}?${params}` : path
  const res = await fetch(url, { method: 'DELETE', headers: authHeaders() })
  return res.json()
}
async function apiGet(path: string) {
  const res = await fetch(path, { headers: authHeaders() })
  return res.json()
}

// ──────────────────────────────────────────────
// Shared UI helpers
// ──────────────────────────────────────────────
function Toast({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <div style={{
      position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
      background: '#1a1a1a', border: '1px solid #333', borderRadius: 10,
      padding: '10px 20px', color: '#fff', fontSize: 13, zIndex: 9999, whiteSpace: 'nowrap',
    }}>{msg}</div>
  )
}

function useToast() {
  const [msg, setMsg] = useState('')
  function show(m: string) { setMsg(m); setTimeout(() => setMsg(''), 2800) }
  return { msg, show }
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="game-card" style={{ padding: '14px 16px', ...style }}>
      {children}
    </div>
  )
}

function SubTabBar({ tabs, active, onChange }: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (k: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            padding: '7px 14px', fontSize: 12, fontWeight: 700,
            border: 'none', borderRadius: 20, cursor: 'pointer',
            background: active === t.key ? '#D4A017' : 'rgba(255,255,255,0.07)',
            color: active === t.key ? '#000' : '#aaa',
          }}
        >{t.label}</button>
      ))}
    </div>
  )
}

function Btn({
  onClick, disabled, children, color = 'gold', style,
}: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
  color?: 'gold' | 'green' | 'red' | 'blue' | 'ghost'; style?: React.CSSProperties
}) {
  const bg = {
    gold: 'linear-gradient(135deg,#D4A017,#b8860b)',
    green: 'linear-gradient(135deg,#16a34a,#15803d)',
    red: 'rgba(220,38,38,0.15)',
    blue: 'rgba(59,130,246,0.2)',
    ghost: 'rgba(255,255,255,0.07)',
  }[color]
  const cl = { gold: '#000', green: '#fff', red: '#f87171', blue: '#93c5fd', ghost: '#ccc' }[color]
  const brd = { gold: 'none', green: 'none', red: '1px solid rgba(220,38,38,0.4)', blue: '1px solid rgba(59,130,246,0.3)', ghost: '1px solid rgba(255,255,255,0.12)' }[color]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '9px 14px', fontSize: 12, fontWeight: 700,
        background: disabled ? '#333' : bg, color: disabled ? '#666' : cl,
        border: brd, borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >{children}</button>
  )
}

function Input({ value, onChange, placeholder, type = 'text', style }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; style?: React.CSSProperties
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        padding: '10px 12px', borderRadius: 10, fontSize: 13,
        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
        color: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box',
        ...style,
      }}
    />
  )
}

function Textarea({ value, onChange, placeholder, rows = 4 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        padding: '10px 12px', borderRadius: 10, fontSize: 13,
        border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
        color: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical',
      }}
    />
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: '#888', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 8, marginTop: 4 }}>
      {children}
    </div>
  )
}

function StatCard({ label, value, sub, color = '#D4A017' }: {
  label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="game-card" style={{ padding: '12px 14px', flex: 1, minWidth: 0, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: '#888', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      <div className="font-condensed" style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ──────────────────────────────────────────────
// Login screen
// ──────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/admin/verify-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const data = await res.json()
      if (data.ok && data.token) { saveToken(data.token); onLogin() }
      else setErr('❌ ፓስወርድ ትክክል አይደለም')
    } catch { setErr('❌ ሰርቨር ምላሽ አልሰጠም') }
    finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 30%, #0d1a2e 0%, #07080f 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 360,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 18, padding: '36px 28px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
        <h1 className="font-condensed" style={{ fontSize: 26, fontWeight: 800, color: '#D4A017', letterSpacing: '0.06em', marginBottom: 6 }}>
          ADMIN PANEL
        </h1>
        <p style={{ fontSize: 12, color: '#666', marginBottom: 28 }}>መልካም Bingo · አስተዳዳሪ</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="password" placeholder="ፓስወርድ ያስገቡ…" value={pw}
            onChange={e => setPw(e.target.value)} autoFocus
            style={{
              padding: '14px 16px', borderRadius: 12,
              border: '1.5px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.07)', color: '#fff',
              fontSize: 15, outline: 'none', textAlign: 'center', letterSpacing: '0.15em',
            }}
          />
          {err && <div style={{ fontSize: 13, color: '#f87171', marginTop: -4 }}>{err}</div>}
          <button
            type="submit" disabled={loading || !pw} className="btn-enter"
            style={{ padding: '14px 0', fontSize: 15, fontWeight: 700, border: 'none', cursor: loading || !pw ? 'not-allowed' : 'pointer', opacity: !pw ? 0.5 : 1 }}
          >
            {loading ? 'እየገባ…' : 'ግባ'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Stats Tab
// ──────────────────────────────────────────────
function StatsTab() {
  const [stats, setStats] = useState<{
    deposits: { pending: number; approved: number; rejected: number; total: number }
    withdrawals: { pending: number; approved: number; rejected: number; total: number }
    players: { total: number; totalBalance: number }
    invites: { totalReferred: number; totalAgents: number; joinBonusPaid: number; commissionPaid: number; topAgents?: { telegramId: number; firstName: string; username?: string; inviteCount: number }[] }
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet('/api/admin/stats?telegramId=0').then(d => { setStats(d); setLoading(false) })
  }, [])

  if (loading) return <div style={{ textAlign: 'center', color: '#666', padding: 32 }}>እየጫነ…</div>
  if (!stats) return <div style={{ textAlign: 'center', color: '#f87171', padding: 32 }}>ስህተት ተከሰተ</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <SectionLabel>💰 ዲፖዚቶች</SectionLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <StatCard label="ያልተፈቀዱ" value={stats.deposits.pending} color="#f97316" />
          <StatCard label="የተፈቀዱ" value={stats.deposits.approved} color="#22c55e" sub={`${stats.deposits.total.toFixed(0)} ETB`} />
          <StatCard label="የተሰረዙ" value={stats.deposits.rejected} color="#f87171" />
        </div>
      </div>
      <div>
        <SectionLabel>🏦 ዊዝድሮዎች</SectionLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <StatCard label="ያልተፈቀዱ" value={stats.withdrawals.pending} color="#f97316" />
          <StatCard label="የተፈቀዱ" value={stats.withdrawals.approved} color="#22c55e" sub={`${stats.withdrawals.total.toFixed(0)} ETB`} />
          <StatCard label="የተሰረዙ" value={stats.withdrawals.rejected} color="#f87171" />
        </div>
      </div>
      <div>
        <SectionLabel>👥 ተጫዋቾች</SectionLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <StatCard label="ጠቅላላ" value={stats.players.total} color="#D4A017" />
          <StatCard label="ጠቅላላ ባላንስ" value={`${stats.players.totalBalance.toFixed(0)} ETB`} color="#60a5fa" />
        </div>
      </div>
      <div>
        <SectionLabel>🤝 ሪፈራሎች</SectionLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatCard label="ጠቅላላ ሪፈሮች" value={stats.invites.totalReferred} color="#a78bfa" />
          <StatCard label="Agents" value={stats.invites.totalAgents} color="#fb923c" />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <StatCard label="Join Bonus ወጪ" value={`${stats.invites.joinBonusPaid.toFixed(0)} ETB`} color="#e879f9" />
          <StatCard label="Commission ወጪ" value={`${stats.invites.commissionPaid.toFixed(0)} ETB`} color="#34d399" />
        </div>
      </div>
      {stats.invites.topAgents && stats.invites.topAgents.length > 0 && (
        <div>
          <SectionLabel>🏆 ምርጥ Agents</SectionLabel>
          {stats.invites.topAgents.map((a, i) => (
            <Card key={a.telegramId} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#D4A017', fontWeight: 700, marginRight: 8 }}>#{i + 1}</span>
                  <span style={{ color: '#fff', fontSize: 13 }}>{a.firstName}</span>
                  {a.username && <span style={{ color: '#666', fontSize: 11, marginLeft: 6 }}>@{a.username}</span>}
                </div>
                <div style={{ color: '#a78bfa', fontWeight: 700, fontSize: 14 }}>{a.inviteCount} ሪፈር</div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Deposits Tab
// ──────────────────────────────────────────────
function DepositsTab() {
  const [items, setItems] = useState<{
    id: number; telegramId: number; amount: string; phone?: string; note?: string;
    screenshotUrl?: string; createdAt: string; status: string
  }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const { msg, show } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/api/admin/deposits?status=${tab}&telegramId=0`)
      setItems(data.deposits ?? [])
    } finally { setLoading(false) }
  }, [tab])

  useEffect(() => { void load() }, [load])

  async function approve(id: number) {
    setBusy(id)
    const res = await apiPost(`/api/admin/deposit/${id}/approve`, { telegramId: 0 })
    if (res.success) { show('✅ ዲፖዚት ተፈቅዷል'); setItems(prev => prev.filter(d => d.id !== id)) }
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(null)
  }

  async function reject(id: number) {
    setBusy(id)
    const res = await apiPost(`/api/admin/deposit/${id}/reject`, { telegramId: 0 })
    if (res.success) { show('🚫 ዲፖዚት ተሰርዟል'); setItems(prev => prev.filter(d => d.id !== id)) }
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Toast msg={msg} />
      <SubTabBar
        tabs={[{ key: 'pending', label: '⏳ ያልተፈቀዱ' }, { key: 'approved', label: '✅ የተፈቀዱ' }, { key: 'rejected', label: '❌ የተሰረዙ' }]}
        active={tab} onChange={k => setTab(k as typeof tab)}
      />
      {loading ? <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>እየጫነ…</div>
        : items.length === 0 ? <div style={{ textAlign: 'center', color: '#555', padding: 32, fontSize: 13 }}>ምንም ዝርዝር የለም</div>
        : items.map(dep => (
          <Card key={dep.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: '#D4A017', fontWeight: 700 }}>#{dep.id} · {Number(dep.amount).toFixed(0)} ብር</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Telegram: {dep.telegramId}</div>
                {dep.phone && <div style={{ fontSize: 11, color: '#aaa' }}>📞 {dep.phone}</div>}
                {dep.note && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>💬 {dep.note}</div>}
                <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>{new Date(dep.createdAt).toLocaleString('am-ET')}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#f97316' }}>{Number(dep.amount).toFixed(0)}<span style={{ fontSize: 10, color: '#888', marginLeft: 2 }}>ETB</span></div>
            </div>
            {dep.screenshotUrl && (
              <a href={dep.screenshotUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 11, color: '#60a5fa', marginBottom: 8 }}>📷 Screenshot ይመልከቱ</a>
            )}
            {tab === 'pending' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Btn onClick={() => approve(dep.id)} disabled={busy === dep.id} color="green" style={{ flex: 1 }}>{busy === dep.id ? '…' : '✅ ፍቀድ'}</Btn>
                <Btn onClick={() => reject(dep.id)} disabled={busy === dep.id} color="red" style={{ flex: 1 }}>❌ ሰርዝ</Btn>
              </div>
            )}
          </Card>
        ))
      }
    </div>
  )
}

// ──────────────────────────────────────────────
// Withdrawals Tab
// ──────────────────────────────────────────────
function WithdrawalsTab() {
  const [items, setItems] = useState<{
    id: number; telegramId: number; amount: string; phone: string; note?: string; createdAt: string; status: string
  }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const { msg, show } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/api/admin/withdrawals?status=${tab}&telegramId=0`)
      setItems(data.withdrawals ?? [])
    } finally { setLoading(false) }
  }, [tab])

  useEffect(() => { void load() }, [load])

  async function approve(id: number) {
    setBusy(id)
    const res = await apiPost(`/api/admin/withdrawal/${id}/approve`, { telegramId: 0 })
    if (res.success) { show('✅ ዊዝድሮው ተፈቅዷል'); setItems(prev => prev.filter(w => w.id !== id)) }
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(null)
  }

  async function reject(id: number) {
    setBusy(id)
    const res = await apiPost(`/api/admin/withdrawal/${id}/reject`, { telegramId: 0 })
    if (res.success) { show('🚫 ዊዝድሮው ተሰርዟል'); setItems(prev => prev.filter(w => w.id !== id)) }
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Toast msg={msg} />
      <SubTabBar
        tabs={[{ key: 'pending', label: '⏳ ያልተፈቀዱ' }, { key: 'approved', label: '✅ የተፈቀዱ' }, { key: 'rejected', label: '❌ የተሰረዙ' }]}
        active={tab} onChange={k => setTab(k as typeof tab)}
      />
      {loading ? <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>እየጫነ…</div>
        : items.length === 0 ? <div style={{ textAlign: 'center', color: '#555', padding: 32, fontSize: 13 }}>ምንም ዝርዝር የለም</div>
        : items.map(w => (
          <Card key={w.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 13, color: '#D4A017', fontWeight: 700 }}>#{w.id} · {Number(w.amount).toFixed(0)} ብር</div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Telegram: {w.telegramId}</div>
                <div style={{ fontSize: 11, color: '#aaa' }}>📞 Telebirr: {w.phone}</div>
                {w.note && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>💬 {w.note}</div>}
                <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>{new Date(w.createdAt).toLocaleString('am-ET')}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa' }}>{Number(w.amount).toFixed(0)}<span style={{ fontSize: 10, color: '#888', marginLeft: 2 }}>ETB</span></div>
            </div>
            {tab === 'pending' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Btn onClick={() => approve(w.id)} disabled={busy === w.id} color="green" style={{ flex: 1 }}>{busy === w.id ? '…' : '✅ ፍቀድ'}</Btn>
                <Btn onClick={() => reject(w.id)} disabled={busy === w.id} color="red" style={{ flex: 1 }}>❌ ሰርዝ</Btn>
              </div>
            )}
          </Card>
        ))
      }
    </div>
  )
}

// ──────────────────────────────────────────────
// Players Tab
// ──────────────────────────────────────────────
interface PlayerRow {
  telegramId: number; firstName: string; lastName?: string; username?: string
  depositBalance?: string; mainBalance: string; bonusBalance?: string; agentBalance?: string
  wageringRequired?: string; wageringCompleted?: string; hasActiveWagering?: boolean
  totalInviteBonus?: string; preferredBalance?: string; isActive?: boolean
  role: string; createdAt: string; updatedAt?: string; invitedBy?: number
}

interface PlayerDetail {
  player: PlayerRow
  stats: {
    totalGames: number; totalWins: number; totalLosses: number
    totalStakes: number; totalPrizes: number; netGameResult: number
    totalDeposited: number; totalWithdrawn: number; inviteCount: number
    approvedTransactionIn: number; approvedTransactionOut: number
    stakeTransactions: number; winTransactions: number
    pendingDeposits: number; pendingWithdrawals: number; lastGameAt?: string | null
  }
  wagering: { required: number; completed: number; remaining: number; progress: number; active: boolean }
  inviterName?: string
  deposits: { id: number; amount: string; status: string; createdAt: string }[]
  withdrawals: { id: number; amount: string; status: string; createdAt: string; phone: string }[]
  transactions: { id: number; type: string; amount: string; status: string; note?: string; createdAt: string }[]
  gameRounds?: { id: number; roundId: string; roomId: string; cardIds: string; stake: string; result: string; prize: string; createdAt: string }[]
}

function PlayerDetailModal({ telegramId, onClose }: { telegramId: number; onClose: () => void }) {
  const [data, setData] = useState<PlayerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [newRole, setNewRole] = useState('')
  const [busy, setBusy] = useState(false)
  const { msg, show } = useToast()

  useEffect(() => {
    apiGet(`/api/admin/players/${telegramId}/detail?telegramId=0`).then(d => {
      setData(d); setLoading(false)
      if (d?.player) setNewRole(d.player.role)
    })
  }, [telegramId])

  async function adjustBalance() {
    const delta = parseFloat(adjustDelta)
    if (isNaN(delta) || delta === 0) { show('❌ ትክክለኛ ቁጥር ያስገቡ'); return }
    setBusy(true)
    const res = await apiPost('/api/admin/players/balance-adjust', {
      telegramId: 0, targetTelegramId: telegramId, delta, note: adjustNote.trim() || undefined,
    })
    if (res.ok) { show(`✅ ባላንስ ተስተካክሏል — አዲስ: ${res.newBalance?.toFixed(2)} ETB`); setAdjustDelta(''); setAdjustNote('') }
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(false)
  }

  async function setRole() {
    if (!newRole) return
    setBusy(true)
    const res = await apiPost(`/api/admin/players/${telegramId}/set-role`, { telegramId: 0, role: newRole })
    if (res.ok) show(`✅ Role → ${newRole}`)
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(false)
  }

  async function unban() {
    setBusy(true)
    const res = await apiPost(`/api/admin/players/${telegramId}/unban`, { telegramId: 0 })
    if (res.ok) show('✅ ተጫዋቹ ተፈቷል')
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      zIndex: 100, overflowY: 'auto', padding: 16,
    }}>
      <Toast msg={msg} />
      <div style={{
        maxWidth: 480, margin: '0 auto',
        background: 'radial-gradient(ellipse at 50% 0%, #0d1a2e 0%, #07080f 100%)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#D4A017' }}>👤 ተጫዋች ዝርዝር</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {loading ? <div style={{ textAlign: 'center', color: '#666', padding: 32 }}>እየጫነ…</div>
          : !data?.player ? <div style={{ color: '#f87171', textAlign: 'center', padding: 24 }}>ተጫዋቹ አልተገኘም</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Player info */}
              <Card>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                  {data.player.firstName} {data.player.lastName ?? ''}
                  {data.player.username && <span style={{ color: '#666', fontSize: 12, marginLeft: 6 }}>@{data.player.username}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>ID: {data.player.telegramId}</div>
                <div style={{ fontSize: 12, color: '#a78bfa', marginTop: 2 }}>Role: {data.player.role}</div>
                {data.inviterName && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Inviter: {data.inviterName}</div>}
              </Card>

              {/* Balances */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StatCard label="Withdrawable" value={`${Number(data.player.mainBalance).toFixed(2)}`} color="#22c55e" sub="ETB" />
                <StatCard label="Deposit / Play" value={`${Number(data.player.depositBalance ?? 0).toFixed(2)}`} color="#60a5fa" sub="ETB" />
                <StatCard label="Bonus" value={`${Number(data.player.bonusBalance ?? 0).toFixed(2)}`} color="#f97316" sub="ETB" />
                <StatCard label="Agent Wallet" value={`${Number(data.player.agentBalance ?? 0).toFixed(2)}`} color="#a78bfa" sub="ETB" />
              </div>

              {/* Wagering progress */}
              <Card style={{ border: `1px solid ${data.wagering.active ? 'rgba(249,115,22,0.35)' : 'rgba(255,255,255,0.08)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <SectionLabel>🎯 Wagering Status</SectionLabel>
                  <span style={{ fontSize: 11, fontWeight: 700, color: data.wagering.active ? '#f97316' : '#22c55e' }}>
                    {data.wagering.active ? 'ACTIVE' : 'COMPLETED / NONE'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#aaa', marginBottom: 6 }}>
                  <span>Completed: <b style={{ color: '#fff' }}>{data.wagering.completed.toFixed(2)} ETB</b></span>
                  <span>Required: <b style={{ color: '#fff' }}>{data.wagering.required.toFixed(2)} ETB</b></span>
                </div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${data.wagering.progress}%`, height: '100%', background: data.wagering.active ? '#f97316' : '#22c55e', borderRadius: 8 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: '#888' }}>
                  <span>{data.wagering.progress.toFixed(0)}% complete</span>
                  <span>{data.wagering.remaining.toFixed(2)} ETB remaining</span>
                </div>
              </Card>

              {/* Game and financial stats */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StatCard label="ጨዋታዎች" value={data.stats.totalGames} color="#D4A017" />
                <StatCard label="ድሎች" value={data.stats.totalWins} color="#22c55e" />
                <StatCard label="Losses" value={data.stats.totalLosses} color="#f87171" />
                <StatCard label="ሪፈር" value={data.stats.inviteCount} color="#a78bfa" />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StatCard label="Total Stakes" value={`${data.stats.totalStakes.toFixed(2)}`} color="#f97316" sub="ETB" />
                <StatCard label="Total Prizes" value={`${data.stats.totalPrizes.toFixed(2)}`} color="#22c55e" sub="ETB" />
                <StatCard label="Net Game" value={`${data.stats.netGameResult.toFixed(2)}`} color={data.stats.netGameResult >= 0 ? '#22c55e' : '#f87171'} sub="ETB" />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <StatCard label="ዲፖዚት" value={`${data.stats.totalDeposited.toFixed(2)}`} color="#f97316" sub="ETB" />
                <StatCard label="ዊዝድሮው" value={`${data.stats.totalWithdrawn.toFixed(2)}`} color="#60a5fa" sub="ETB" />
                <StatCard label="Pending" value={data.stats.pendingDeposits + data.stats.pendingWithdrawals} color="#facc15" sub="requests" />
              </div>
              <Card>
                <SectionLabel>📊 Account Activity Summary</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 12 }}>
                  <div style={{ color: '#888' }}>Balance order <b style={{ color: '#ddd', float: 'right' }}>{data.player.preferredBalance === 'bonus_first' ? 'Bonus first' : 'Main first'}</b></div>
                  <div style={{ color: '#888' }}>Status <b style={{ color: data.player.isActive === false ? '#f87171' : '#22c55e', float: 'right' }}>{data.player.isActive === false ? 'Inactive' : 'Active'}</b></div>
                  <div style={{ color: '#888' }}>Stake records <b style={{ color: '#ddd', float: 'right' }}>{data.stats.stakeTransactions}</b></div>
                  <div style={{ color: '#888' }}>Win records <b style={{ color: '#ddd', float: 'right' }}>{data.stats.winTransactions}</b></div>
                  <div style={{ color: '#888' }}>Invite bonus total <b style={{ color: '#ddd', float: 'right' }}>{Number(data.player.totalInviteBonus ?? 0).toFixed(2)} ETB</b></div>
                  <div style={{ color: '#888' }}>Last game <b style={{ color: '#ddd', float: 'right' }}>{data.stats.lastGameAt ? new Date(data.stats.lastGameAt).toLocaleDateString('am-ET') : '—'}</b></div>
                </div>
              </Card>

              {/* Balance adjust */}
              <div>
                <SectionLabel>💳 ባላንስ አስተካክል</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Input value={adjustDelta} onChange={setAdjustDelta} placeholder="+100 ወይም -50 (ETB)" type="number" />
                  <Input value={adjustNote} onChange={setAdjustNote} placeholder="ምክንያት (ያለፈቃድ)" />
                  <Btn onClick={adjustBalance} disabled={busy} color="gold">💳 ባላንስ ለውጥ</Btn>
                </div>
              </div>

              {/* Role change */}
              <div>
                <SectionLabel>🎭 Role ቀይር</SectionLabel>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                    style={{
                      flex: 1, padding: '9px 12px', borderRadius: 10, fontSize: 13,
                      border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
                      color: '#fff', outline: 'none',
                    }}
                  >
                    {['player', 'agent', 'admin', 'moderator'].map(r => (
                      <option key={r} value={r} style={{ background: '#1a1a2e' }}>{r}</option>
                    ))}
                  </select>
                  <Btn onClick={setRole} disabled={busy} color="blue">✅ ቀይር</Btn>
                </div>
              </div>

              {/* Unban */}
              <Btn onClick={unban} disabled={busy} color="ghost">🔓 Unban (deposit attempts ሰርዝ)</Btn>

              {/* Recent transactions */}
              {data.transactions.length > 0 && (
                <div>
                  <SectionLabel>📋 የቅርብ ጊዜ ግብይቶች</SectionLabel>
                  {data.transactions.slice(0, 8).map(t => (
                    <div key={t.id} style={{ padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#aaa' }}>{t.type}</span>
                        <span style={{ color: t.type.includes('deduct') || t.type === 'stake' || t.type.includes('withdraw') ? '#f87171' : '#22c55e', fontWeight: 700 }}>
                          {Number(t.amount).toFixed(2)} ETB
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', fontSize: 10, marginTop: 2 }}>
                        <span>{t.status}{t.note ? ` · ${t.note}` : ''}</span>
                        <span>{new Date(t.createdAt).toLocaleString('am-ET')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  )
}

function PlayersTab() {
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const { msg, show } = useToast()
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet('/api/admin/players?telegramId=0')
      setPlayers(data.players ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadAll() }, [loadAll])

  function handleSearch(q: string) {
    setSearch(q)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!q.trim()) { void loadAll(); return }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      const data = await apiGet(`/api/admin/players/search?telegramId=0&q=${encodeURIComponent(q.trim())}`)
      setPlayers(data.players ?? [])
      setSearching(false)
    }, 400)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Toast msg={msg} />
      {detailId && <PlayerDetailModal telegramId={detailId} onClose={() => setDetailId(null)} />}

      <Input value={search} onChange={handleSearch} placeholder="🔍 ፈልግ (ስም, username, telegram ID)" />

      {(loading || searching) ? (
        <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>እየጫነ…</div>
      ) : players.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#555', padding: 32, fontSize: 13 }}>ምንም ተጫዋቾች አልተገኙም</div>
      ) : (
        players.map(p => (
          <Card key={p.telegramId}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  {p.firstName} {p.lastName ?? ''}
                  {p.username && <span style={{ color: '#666', fontSize: 11, marginLeft: 6 }}>@{p.username}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>ID: {p.telegramId}</div>
                <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 1 }}>{p.role}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>{Number(p.mainBalance).toFixed(2)} <span style={{ fontSize: 10, color: '#666' }}>ETB</span></div>
                <div style={{ fontSize: 10, color: '#60a5fa', marginTop: 2 }}>Play {Number(p.depositBalance ?? 0).toFixed(2)} · Bonus {Number(p.bonusBalance ?? 0).toFixed(2)}</div>
                <div style={{ fontSize: 10, color: p.hasActiveWagering ? '#f97316' : '#666', marginTop: 2 }}>
                  {p.hasActiveWagering
                    ? `Wager ${Number(p.wageringCompleted ?? 0).toFixed(0)}/${Number(p.wageringRequired ?? 0).toFixed(0)}`
                    : 'Wagering inactive'}
                </div>
                <Btn onClick={() => setDetailId(p.telegramId)} color="ghost" style={{ marginTop: 6, fontSize: 11, padding: '5px 10px' }}>ዝርዝር →</Btn>
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Promo Codes Tab
// ──────────────────────────────────────────────
interface PromoCode {
  id: number; code: string; bonusAmount: string; maxUses: number; usedCount: number
  isActive: boolean; expiresAt?: string; createdAt: string; gameType: string
}

function PromoCodesTab() {
  const [codes, setCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [form, setForm] = useState({ code: '', bonusAmount: '', maxUses: '', expiresAt: '' })
  const [creating, setCreating] = useState(false)
  const { msg, show } = useToast()

  async function load() {
    setLoading(true)
    try {
      const data = await apiGet('/api/admin/promo-codes?telegramId=0')
      setCodes(data.codes ?? [])
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function create() {
    if (!form.code || !form.bonusAmount || !form.maxUses) { show('❌ ሁሉም ግዴታ መስኮች ሙሉ'); return }
    setCreating(true)
    const res = await apiPost('/api/admin/promo-codes', {
      telegramId: 0, code: form.code, bonusAmount: parseFloat(form.bonusAmount),
      maxUses: parseInt(form.maxUses), expiresAt: form.expiresAt || undefined,
    })
    if (res.ok) {
      show('✅ ፕሮሞ ኮድ ተፈጥሯል')
      setForm({ code: '', bonusAmount: '', maxUses: '', expiresAt: '' })
      void load()
    } else show(`❌ ${res.error ?? 'ስህተት'}`)
    setCreating(false)
  }

  async function toggle(id: number) {
    setBusy(id)
    const res = await apiPatch(`/api/admin/promo-codes/${id}/toggle`, { telegramId: 0 })
    if (res.ok) setCodes(prev => prev.map(c => c.id === id ? { ...c, isActive: res.isActive } : c))
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(null)
  }

  async function del(id: number) {
    if (!confirm('ፕሮሞ ኮዱን ሙሉ በሙሉ ይሰርዙ?')) return
    setBusy(id)
    const res = await apiDelete(`/api/admin/promo-codes/${id}`, 'telegramId=0')
    if (res.ok) { show('🗑 ተሰርዟል'); setCodes(prev => prev.filter(c => c.id !== id)) }
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toast msg={msg} />

      {/* Create form */}
      <Card>
        <SectionLabel>➕ አዲስ ፕሮሞ ኮድ</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Input value={form.code} onChange={v => setForm(f => ({ ...f, code: v.toUpperCase() }))} placeholder="ኮድ (A-Z, 0-9)" />
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={form.bonusAmount} onChange={v => setForm(f => ({ ...f, bonusAmount: v }))} placeholder="ቦነስ (ETB)" type="number" />
            <Input value={form.maxUses} onChange={v => setForm(f => ({ ...f, maxUses: v }))} placeholder="ከፍ. ጥቅም" type="number" />
          </div>
          <Input value={form.expiresAt} onChange={v => setForm(f => ({ ...f, expiresAt: v }))} placeholder="ቀን (ያለፈቃድ)" type="datetime-local" />
          <Btn onClick={create} disabled={creating} color="gold">
            {creating ? 'እየፈጠረ…' : '✅ ፕሮሞ ኮድ ፍጠር'}
          </Btn>
        </div>
      </Card>

      {/* List */}
      {loading ? <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>እየጫነ…</div>
        : codes.length === 0 ? <div style={{ textAlign: 'center', color: '#555', padding: 24, fontSize: 13 }}>ምንም ፕሮሞ ኮዶች የሉም</div>
        : codes.map(c => (
          <Card key={c.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#D4A017', letterSpacing: '0.08em' }}>{c.code}</div>
                <div style={{ fontSize: 12, color: '#aaa', marginTop: 3 }}>
                  💰 {Number(c.bonusAmount).toFixed(0)} ETB · {c.usedCount}/{c.maxUses} ጥቅም
                </div>
                {c.expiresAt && <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>⏰ {new Date(c.expiresAt).toLocaleDateString('am-ET')}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                  background: c.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(107,114,128,0.2)',
                  color: c.isActive ? '#22c55e' : '#9ca3af',
                }}>{c.isActive ? '✅ Active' : '⏸ Inactive'}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Btn onClick={() => toggle(c.id)} disabled={busy === c.id} color="blue" style={{ fontSize: 11, padding: '5px 10px' }}>
                    {c.isActive ? '⏸ ቆም' : '▶ ብቃ'}
                  </Btn>
                  <Btn onClick={() => del(c.id)} disabled={busy === c.id} color="red" style={{ fontSize: 11, padding: '5px 10px' }}>🗑</Btn>
                </div>
              </div>
            </div>
          </Card>
        ))
      }
    </div>
  )
}

// ──────────────────────────────────────────────
// Broadcast Tab
// ──────────────────────────────────────────────
function BroadcastTab() {
  const [subTab, setSubTab] = useState('bot')
  const [msg, setMsg] = useState('')
  const [imageBase64, setImageBase64] = useState('')
  const [imageName, setImageName] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [isDaily, setIsDaily] = useState(false)
  const [duration, setDuration] = useState('10')
  const [sending, setSending] = useState(false)
  const [scheduled, setScheduled] = useState<{ id: number; message: string; scheduledAt: string; isDaily: boolean }[]>([])
  const { msg: toast, show } = useToast()

  async function loadScheduled() {
    const data = await apiGet('/api/admin/broadcast/scheduled?telegramId=0')
    setScheduled(data.broadcasts ?? [])
  }

  useEffect(() => { if (subTab === 'schedule') void loadScheduled() }, [subTab])

  function selectImage(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) { show('❌ Image ፋይል ብቻ ይምረጡ'); return }
    if (file.size > 10 * 1024 * 1024) { show('❌ Image ከ10MB መብለጥ የለበትም'); return }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      const comma = reader.result.indexOf(',')
      setImageBase64(comma >= 0 ? reader.result.slice(comma + 1) : reader.result)
      setImageName(file.name)
    }
    reader.readAsDataURL(file)
  }

  async function sendBot() {
    if (!msg.trim() && !imageBase64) { show('❌ መልዕክት ወይም image ይምረጡ'); return }
    setSending(true)
    try {
      const res = await apiPost('/api/admin/broadcast/bot', { telegramId: 0, message: msg.trim(), imageBase64: imageBase64 || undefined })
      if (res.sent !== undefined) {
        const detail = res.errors?.[0] ? ` — ${String(res.errors[0]).slice(0, 120)}` : ''
        show(`✅ ተላከ: ${res.sent}, ሳይሄድ: ${res.failed}${detail}`)
      } else show(`❌ ${res.error ?? 'ስህተት'}`)
    } catch (err) {
      show(`❌ Broadcast ሊላክ አልቻለም: ${err instanceof Error ? err.message : 'network error'}`)
    } finally {
      setSending(false)
    }
  }

  async function sendInApp() {
    if (!msg.trim()) { show('❌ መልዕክት ይጻፉ'); return }
    setSending(true)
    const res = await apiPost('/api/admin/broadcast/inapp', { telegramId: 0, message: msg.trim(), durationSeconds: parseInt(duration) || 10 })
    if (res.ok) show('✅ In-app broadcast ተላከ')
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setSending(false)
  }

  async function schedule() {
    if (!msg.trim() && !imageBase64) { show('❌ መልዕክት ወይም image ይምረጡ'); return }
    if (!scheduledAt) { show('❌ ጊዜ ይምረጡ'); return }
    setSending(true)
    const res = await apiPost('/api/admin/broadcast/schedule', { telegramId: 0, message: msg.trim(), imageBase64: imageBase64 || undefined, scheduledAt, isDaily })
    if (res.ok) { show('✅ Scheduled!'); setMsg(''); setScheduledAt(''); void loadScheduled() }
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setSending(false)
  }

  async function deleteScheduled(id: number) {
    const res = await fetch(`/api/admin/broadcast/schedule/${id}?telegramId=0`, {
      method: 'DELETE', headers: authHeaders(),
    })
    const d = await res.json()
    if (d.ok) { show('🗑 ተሰርዟል'); setScheduled(prev => prev.filter(s => s.id !== id)) }
    else show(`❌ ${d.error ?? 'ስህተት'}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toast msg={toast} />
      <SubTabBar
        tabs={[{ key: 'bot', label: '🤖 Bot Message' }, { key: 'inapp', label: '📱 In-App' }, { key: 'schedule', label: '⏰ Scheduled' }]}
        active={subTab} onChange={setSubTab}
      />

      {subTab === 'bot' && (
        <Card>
          <SectionLabel>📢 Bot Broadcast (ሁሉም ተጫዋቾች)</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Textarea value={msg} onChange={setMsg} placeholder="HTML ይጠቀሙ: <b>ደማቅ</b>, <i>ሪሪ</i>…" rows={5} />
            <label style={{ fontSize: 12, color: '#aaa' }}>
              🖼 Image (አማራጭ)
              <input type="file" accept="image/*" onChange={e => selectImage(e.target.files?.[0])} style={{ display: 'block', marginTop: 6, width: '100%' }} />
              {imageName && <span style={{ display: 'block', marginTop: 4, color: '#22c55e' }}>{imageName}</span>}
            </label>
            <Btn onClick={sendBot} disabled={sending} color="gold">{sending ? 'እየላከ…' : '📢 Broadcast ላክ'}</Btn>
          </div>
        </Card>
      )}

      {subTab === 'inapp' && (
        <Card>
          <SectionLabel>📱 In-App Popup (ያሉ ተጫዋቾች)</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Textarea value={msg} onChange={setMsg} placeholder="ለተጫዋቾች የሚታይ ፖፕ-አፕ…" rows={4} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#888' }}>ቆይታ (ሰ):</span>
              <Input value={duration} onChange={setDuration} placeholder="10" type="number" style={{ width: 80 }} />
            </div>
            <Btn onClick={sendInApp} disabled={sending} color="blue">{sending ? 'እየላከ…' : '📱 ላክ'}</Btn>
          </div>
        </Card>
      )}

      {subTab === 'schedule' && (
        <>
          <Card>
            <SectionLabel>⏰ Broadcast ምደቡ</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Textarea value={msg} onChange={setMsg} placeholder="የሚላከው መልዕክት…" rows={4} />
              <label style={{ fontSize: 12, color: '#aaa' }}>
                🖼 Image (አማራጭ)
                <input type="file" accept="image/*" onChange={e => selectImage(e.target.files?.[0])} style={{ display: 'block', marginTop: 6, width: '100%' }} />
                {imageName && <span style={{ display: 'block', marginTop: 4, color: '#22c55e' }}>{imageName}</span>}
              </label>
              <Input value={scheduledAt} onChange={setScheduledAt} placeholder="ጊዜ" type="datetime-local" />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#aaa', cursor: 'pointer' }}>
                <input type="checkbox" checked={isDaily} onChange={e => setIsDaily(e.target.checked)} />
                📅 ዕለታዊ (Daily repeat)
              </label>
              <Btn onClick={schedule} disabled={sending} color="gold">{sending ? 'እየምደበ…' : '⏰ ምደብ'}</Btn>
            </div>
          </Card>
          <SectionLabel>📋 የተመደቡ Broadcasts</SectionLabel>
          {scheduled.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#555', padding: 16, fontSize: 13 }}>ምንም የተመደቡ የሉም</div>
          ) : scheduled.map(s => (
            <Card key={s.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#D4A017' }}>{new Date(s.scheduledAt).toLocaleString('am-ET')}</div>
                  {s.isDaily && <span style={{ fontSize: 10, color: '#a78bfa' }}>📅 Daily</span>}
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 4, maxWidth: 240 }}>{s.message.slice(0, 80)}{s.message.length > 80 ? '…' : ''}</div>
                </div>
                <Btn onClick={() => deleteScheduled(s.id)} color="red" style={{ fontSize: 11, padding: '5px 10px' }}>🗑</Btn>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Lucky Box Tab
// ──────────────────────────────────────────────
interface LuckyBoxSession {
  id: number; title: string; description?: string
  totalBoxes: number; amountPerBox: string; claimedCount: number
  status: string; channelMessageId?: number; createdAt: string
}

function LuckyBoxTab() {
  const [sessions, setSessions] = useState<LuckyBoxSession[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [claimsId, setClaimsId] = useState<number | null>(null)
  const [claims, setClaims] = useState<{ id: number; boxNumber: number; telegramId: number; claimedAt: string }[]>([])
  const [form, setForm] = useState({ title: '', description: '', totalBoxes: '', amountPerBox: '' })
  const [creating, setCreating] = useState(false)
  const { msg, show } = useToast()

  async function load() {
    setLoading(true)
    try {
      const data = await apiGet('/api/admin/lucky-boxes?telegramId=0')
      setSessions(data.sessions ?? [])
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  async function create() {
    if (!form.title || !form.totalBoxes || !form.amountPerBox) { show('❌ ሁሉም ግዴታ መስኮች ሙሉ'); return }
    setCreating(true)
    const res = await apiPost('/api/admin/lucky-boxes', {
      telegramId: 0, title: form.title, description: form.description || undefined,
      totalBoxes: parseInt(form.totalBoxes), amountPerBox: parseFloat(form.amountPerBox),
    })
    if (res.ok) {
      show('✅ Lucky Box ተፈጥሯል')
      setForm({ title: '', description: '', totalBoxes: '', amountPerBox: '' })
      void load()
    } else show(`❌ ${res.error ?? 'ስህተት'}`)
    setCreating(false)
  }

  async function postToChannel(id: number) {
    setBusy(id)
    const res = await apiPost(`/api/admin/lucky-boxes/${id}/post-channel`, { telegramId: 0 })
    if (res.ok) { show('✅ ቻናል ላይ ተለጥፏል!'); void load() }
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(null)
  }

  async function del(id: number) {
    if (!confirm('Lucky Box ሙሉ በሙሉ ይሰርዙ?')) return
    setBusy(id)
    const res = await fetch(`/api/admin/lucky-boxes/${id}`, {
      method: 'DELETE', headers: authHeaders(),
      body: JSON.stringify({ telegramId: 0 }),
    })
    const d = await res.json()
    if (d.ok) { show('🗑 ተሰርዟል'); setSessions(prev => prev.filter(s => s.id !== id)) }
    else show(`❌ ${d.error ?? 'ስህተት'}`)
    setBusy(null)
  }

  async function showClaims(id: number) {
    setClaimsId(id)
    const data = await apiGet(`/api/admin/lucky-boxes/${id}/claims?telegramId=0`)
    setClaims(data.claims ?? [])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toast msg={msg} />

      {/* Claims modal */}
      {claimsId !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 100, overflowY: 'auto', padding: 16 }}>
          <div style={{ maxWidth: 420, margin: '0 auto', background: '#0d1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ color: '#D4A017', fontWeight: 700 }}>🎁 Claims ({claims.length})</div>
              <button onClick={() => setClaimsId(null)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            {claims.length === 0 ? <div style={{ color: '#555', textAlign: 'center', padding: 24 }}>ምንም claims የሉም</div>
              : claims.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12 }}>
                  <span style={{ color: '#D4A017' }}>Box #{c.boxNumber}</span>
                  <span style={{ color: '#aaa' }}>ID: {c.telegramId}</span>
                  <span style={{ color: '#555' }}>{new Date(c.claimedAt).toLocaleString('am-ET')}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* Create form */}
      <Card>
        <SectionLabel>🎁 አዲስ Lucky Box</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Input value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="ርዕስ" />
          <Input value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="መግለጫ (ያለፈቃድ)" />
          <div style={{ display: 'flex', gap: 8 }}>
            <Input value={form.totalBoxes} onChange={v => setForm(f => ({ ...f, totalBoxes: v }))} placeholder="ቁጥር (1-50)" type="number" />
            <Input value={form.amountPerBox} onChange={v => setForm(f => ({ ...f, amountPerBox: v }))} placeholder="ዋጋ/ቦክስ (ETB)" type="number" />
          </div>
          <Btn onClick={create} disabled={creating} color="gold">{creating ? 'እየፈጠረ…' : '🎁 ፍጠር'}</Btn>
        </div>
      </Card>

      {/* List */}
      {loading ? <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>እየጫነ…</div>
        : sessions.length === 0 ? <div style={{ textAlign: 'center', color: '#555', padding: 24, fontSize: 13 }}>ምንም Lucky Boxes የሉም</div>
        : sessions.map(s => (
          <Card key={s.id}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{s.title}</div>
              {s.description && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.description}</div>}
              <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                📦 {s.totalBoxes} ቦክስ · {Number(s.amountPerBox).toFixed(0)} ETB/ቦክስ · {s.claimedCount} ተወሰዷል
              </div>
              {s.channelMessageId && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>✅ ቻናል ላይ ተለጥፏል</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Btn onClick={() => showClaims(s.id)} color="ghost" style={{ fontSize: 11, padding: '5px 10px' }}>📋 Claims</Btn>
              {!s.channelMessageId && (
                <Btn onClick={() => postToChannel(s.id)} disabled={busy === s.id} color="gold" style={{ fontSize: 11, padding: '5px 10px' }}>
                  {busy === s.id ? '…' : '📢 ቻናል ላይ ለጥፍ'}
                </Btn>
              )}
              <Btn onClick={() => del(s.id)} disabled={busy === s.id} color="red" style={{ fontSize: 11, padding: '5px 10px' }}>🗑</Btn>
            </div>
          </Card>
        ))
      }
    </div>
  )
}

// ──────────────────────────────────────────────
// Settings Tab
// ──────────────────────────────────────────────
function SettingsTab() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [roomSettings, setRoomSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [maintenance, setMaintenance] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [subTab, setSubTab] = useState('game')
  const { msg, show } = useToast()

  async function load() {
    setLoading(true)
    const [gs, rs, ms] = await Promise.all([
      apiGet('/api/admin/settings?telegramId=0'),
      apiGet('/api/admin/room-settings?telegramId=0'),
      apiGet('/api/admin/maintenance?telegramId=0'),
    ])
    setSettings(gs.settings ?? {})
    setRoomSettings(rs.room1 ?? {})
    setMaintenance(ms.enabled ?? false)
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function saveGameSettings() {
    setSaving(true)
    const keys = ['telebirrNumber', 'minDeposit', 'minWithdrawal', 'minAgentWithdrawal',
      'registerBonusEnabled', 'registerBonusAmount', 'inviteBonusEnabled',
      'inviteBonusPercent', 'inviteBonusAmount', 'inviteBonusMinDeposit', 'autoReportHour']
    const s: Record<string, string> = {}
    keys.forEach(k => { if (settings[k] !== undefined) s[k] = settings[k]! })
    const res = await apiPut('/api/admin/settings', { telegramId: 0, settings: s })
    if (res.ok) show('✅ Settings ተቀምጧል')
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setSaving(false)
  }

  async function saveRoomSettings() {
    setSaving(true)
    const res = await apiPut('/api/admin/room-settings', {
      telegramId: 0, room: 'room1',
      settings: {
        stakePerCard: roomSettings['stakePerCard'],
        commissionPercent: roomSettings['commissionPercent'],
        countdownSeconds: roomSettings['countdownSeconds'],
        ballIntervalSeconds: roomSettings['ballIntervalSeconds'],
        minPlayersToStart: roomSettings['minPlayersToStart'],
      },
    })
    if (res.ok) show('✅ Room settings ተቀምጧል')
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setSaving(false)
  }

  async function toggleMaintenance() {
    setToggling(true)
    const res = await apiPost('/api/admin/maintenance/toggle', { telegramId: 0 })
    if (res.ok) { setMaintenance(res.enabled); show(res.enabled ? '🔧 Maintenance ተበርቷል' : '✅ Maintenance ጠፋ') }
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setToggling(false)
  }

  function S(key: string) { return settings[key] ?? '' }
  function R(key: string) { return roomSettings[key] ?? '' }
  function setS(key: string, v: string) { setSettings(p => ({ ...p, [key]: v })) }
  function setR(key: string, v: string) { setRoomSettings(p => ({ ...p, [key]: v })) }

  if (loading) return <div style={{ textAlign: 'center', color: '#666', padding: 32 }}>እየጫነ…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toast msg={msg} />
      <SubTabBar
        tabs={[{ key: 'game', label: '⚙️ Game Settings' }, { key: 'room', label: '🚪 Room 1' }, { key: 'maintenance', label: '🔧 Maintenance' }]}
        active={subTab} onChange={setSubTab}
      />

      {subTab === 'game' && (
        <Card>
          <SectionLabel>💳 ዲፖዚት / ዊዝድሮው</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Input value={S('telebirrNumber')} onChange={v => setS('telebirrNumber', v)} placeholder="Telebirr ቁጥር" />
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={S('minDeposit')} onChange={v => setS('minDeposit', v)} placeholder="Min Deposit (ETB)" type="number" />
              <Input value={S('minWithdrawal')} onChange={v => setS('minWithdrawal', v)} placeholder="Min Withdrawal (ETB)" type="number" />
            </div>
            <Input value={S('minAgentWithdrawal')} onChange={v => setS('minAgentWithdrawal', v)} placeholder="Agent Min Withdrawal (ETB)" type="number" />

            <SectionLabel>🎁 Register Bonus</SectionLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={S('registerBonusEnabled')} onChange={e => setS('registerBonusEnabled', e.target.value)}
                style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', outline: 'none' }}>
                <option value="true" style={{ background: '#1a1a2e' }}>✅ Enabled</option>
                <option value="false" style={{ background: '#1a1a2e' }}>❌ Disabled</option>
              </select>
              <Input value={S('registerBonusAmount')} onChange={v => setS('registerBonusAmount', v)} placeholder="Bonus ETB" type="number" />
            </div>

            <SectionLabel>🤝 Invite Bonus</SectionLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={S('inviteBonusEnabled')} onChange={e => setS('inviteBonusEnabled', e.target.value)}
                style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: '#fff', outline: 'none' }}>
                <option value="true" style={{ background: '#1a1a2e' }}>✅ Enabled</option>
                <option value="false" style={{ background: '#1a1a2e' }}>❌ Disabled</option>
              </select>
              <Input value={S('inviteBonusPercent')} onChange={v => setS('inviteBonusPercent', v)} placeholder="% of deposit" type="number" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={S('inviteBonusAmount')} onChange={v => setS('inviteBonusAmount', v)} placeholder="Fixed ETB (0=off)" type="number" />
              <Input value={S('inviteBonusMinDeposit')} onChange={v => setS('inviteBonusMinDeposit', v)} placeholder="Min deposit (ETB)" type="number" />
            </div>

            <SectionLabel>🎯 Wagering</SectionLabel>
            <Input value={S('wageringMultiplier')} onChange={v => setS('wageringMultiplier', v)} placeholder="Wagering Multiplier (×)" type="number" />

            <SectionLabel>📊 Auto Report</SectionLabel>
            <Input value={S('autoReportHour')} onChange={v => setS('autoReportHour', v)} placeholder="ሰዓት (-1=off, 0-23)" type="number" />

            <Btn onClick={saveGameSettings} disabled={saving} color="gold">{saving ? 'እያስቀምጥ…' : '💾 ለውጦች ቀምጥ'}</Btn>
          </div>
        </Card>
      )}

      {subTab === 'room' && (
        <Card>
          <SectionLabel>🚪 Room 1 Settings</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={R('stakePerCard')} onChange={v => setR('stakePerCard', v)} placeholder="Stake/Card (ETB)" type="number" />
              <Input value={R('commissionPercent')} onChange={v => setR('commissionPercent', v)} placeholder="Commission %" type="number" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input value={R('countdownSeconds')} onChange={v => setR('countdownSeconds', v)} placeholder="Countdown (ሰ)" type="number" />
              <Input value={R('ballIntervalSeconds')} onChange={v => setR('ballIntervalSeconds', v)} placeholder="Ball interval (ሰ)" type="number" />
            </div>
            <Input value={R('minPlayersToStart')} onChange={v => setR('minPlayersToStart', v)} placeholder="Min players to start" type="number" />
            <Btn onClick={saveRoomSettings} disabled={saving} color="gold">{saving ? 'እያስቀምጥ…' : '💾 Room Settings ቀምጥ'}</Btn>
          </div>
        </Card>
      )}

      {subTab === 'maintenance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <SectionLabel>🔧 Maintenance Mode</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', padding: '12px 0' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 36,
                background: maintenance ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                border: `2px solid ${maintenance ? '#ef4444' : '#22c55e'}`,
              }}>
                {maintenance ? '🔧' : '✅'}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: maintenance ? '#f87171' : '#22c55e' }}>
                {maintenance ? 'Maintenance ተበርቷል' : 'App ተጫዋቾቹ ዘንድ ክፍት ነው'}
              </div>
              <div style={{ fontSize: 12, color: '#666', textAlign: 'center', maxWidth: 280 }}>
                Maintenance mode ሲቃና ተጫዋቾች አዲስ ጨዋታ መጀመር አይችሉም
              </div>
              <Btn onClick={toggleMaintenance} disabled={toggling} color={maintenance ? 'green' : 'red'} style={{ minWidth: 180 }}>
                {toggling ? '…' : maintenance ? '✅ Maintenance አንሳ' : '🔧 Maintenance አብራ'}
              </Btn>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// Promoters Tab
// ──────────────────────────────────────────────
interface PromoterApp {
  id: number; telegramId: number; firstName?: string; username?: string
  note?: string; status: string; createdAt: string
}

function PromotersTab() {
  const [apps, setApps] = useState<PromoterApp[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [tab, setTab] = useState('pending')
  const { msg, show } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet(`/api/admin/promoters?telegramId=0&status=${tab}`)
      setApps(data.applications ?? [])
    } finally { setLoading(false) }
  }, [tab])

  useEffect(() => { void load() }, [load])

  async function approve(id: number) {
    setBusy(id)
    const res = await apiPost(`/api/admin/promoters/${id}/approve`, { telegramId: 0 })
    if (res.ok) { show('✅ ተፈቅዷል'); setApps(prev => prev.filter(a => a.id !== id)) }
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(null)
  }

  async function reject(id: number) {
    setBusy(id)
    const res = await apiPost(`/api/admin/promoters/${id}/reject`, { telegramId: 0 })
    if (res.ok) { show('🚫 ተሰርዟል'); setApps(prev => prev.filter(a => a.id !== id)) }
    else show(`❌ ${res.error ?? 'ስህተት'}`)
    setBusy(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Toast msg={msg} />
      <SubTabBar
        tabs={[{ key: 'pending', label: '⏳ ጥያቄዎች' }, { key: 'approved', label: '✅ የተፈቀዱ' }, { key: 'rejected', label: '❌ የተሰረዙ' }]}
        active={tab} onChange={setTab}
      />
      {loading ? <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>እየጫነ…</div>
        : apps.length === 0 ? <div style={{ textAlign: 'center', color: '#555', padding: 32, fontSize: 13 }}>ምንም አቤቱታዎች የሉም</div>
        : apps.map(a => (
          <Card key={a.id}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                {a.firstName ?? 'Unknown'}
                {a.username && <span style={{ color: '#666', fontSize: 11, marginLeft: 6 }}>@{a.username}</span>}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>ID: {a.telegramId}</div>
              {a.note && <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>💬 {a.note}</div>}
              <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>{new Date(a.createdAt).toLocaleString('am-ET')}</div>
            </div>
            {tab === 'pending' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn onClick={() => approve(a.id)} disabled={busy === a.id} color="green" style={{ flex: 1 }}>{busy === a.id ? '…' : '✅ ፍቀድ'}</Btn>
                <Btn onClick={() => reject(a.id)} disabled={busy === a.id} color="red" style={{ flex: 1 }}>❌ ሰርዝ</Btn>
              </div>
            )}
          </Card>
        ))
      }
    </div>
  )
}

// ──────────────────────────────────────────────
// Agents Tab
// ──────────────────────────────────────────────
interface Agent {
  telegramId: number; firstName: string; lastName?: string; username?: string
  agentBalance: string; totalInviteBonus: string; inviteCount: number; createdAt: string
}

function AgentsTab() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [link, setLink] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)
  const { msg, show } = useToast()

  async function load() {
    setLoading(true)
    const [agentsData, linkData] = await Promise.all([
      apiGet('/api/admin/agents?telegramId=0'),
      apiGet('/api/admin/agent-link?telegramId=0'),
    ])
    setAgents(agentsData.agents ?? [])
    setLink(linkData.link ?? '')
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function generateLink() {
    setGeneratingLink(true)
    const res = await apiPost('/api/admin/agent-link/generate', { telegramId: 0 })
    if (res.ok && res.link) {
      setLink(res.link)
      show('✅ አዲስ agent link ተፈጥሯል')
    } else show(`❌ ${res.error ?? 'ስህተት'}`)
    setGeneratingLink(false)
  }

  function copyLink() {
    if (!link) return
    navigator.clipboard.writeText(link).then(() => show('✅ Link ተቀዳ!')).catch(() => show('❌ Copy አልሆነም'))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toast msg={msg} />

      {/* Agent link */}
      <Card>
        <SectionLabel>🔗 Agent Invite Link</SectionLabel>
        {link ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{
              padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, color: '#60a5fa',
              wordBreak: 'break-all',
            }}>{link}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn onClick={copyLink} color="blue" style={{ flex: 1 }}>📋 ቅዳ</Btn>
              <Btn onClick={generateLink} disabled={generatingLink} color="ghost" style={{ flex: 1 }}>
                {generatingLink ? '…' : '🔄 አዲስ Link'}
              </Btn>
            </div>
          </div>
        ) : (
          <Btn onClick={generateLink} disabled={generatingLink} color="gold">
            {generatingLink ? 'እየፈጠረ…' : '🔗 Agent Link ፍጠር'}
          </Btn>
        )}
      </Card>

      {/* Agents list */}
      <SectionLabel>👥 Agent ዝርዝር ({agents.length})</SectionLabel>
      {loading ? <div style={{ textAlign: 'center', color: '#666', padding: 24 }}>እየጫነ…</div>
        : agents.length === 0 ? <div style={{ textAlign: 'center', color: '#555', padding: 24, fontSize: 13 }}>ምንም agents የሉም</div>
        : agents.map(a => (
          <Card key={a.telegramId}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                  {a.firstName} {a.lastName ?? ''}
                  {a.username && <span style={{ color: '#666', fontSize: 11, marginLeft: 6 }}>@{a.username}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>ID: {a.telegramId}</div>
                <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 2 }}>{a.inviteCount} ሪፈር · Bonus: {Number(a.totalInviteBonus).toFixed(0)} ETB</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#22c55e' }}>{Number(a.agentBalance).toFixed(0)}<span style={{ fontSize: 10, color: '#666', marginLeft: 2 }}>ETB</span></div>
              </div>
            </div>
          </Card>
        ))
      }
    </div>
  )
}

// ──────────────────────────────────────────────
// Main Dashboard
// ──────────────────────────────────────────────
type MainTab =
  | 'deposits' | 'withdrawals' | 'stats'
  | 'players' | 'promo' | 'broadcast' | 'luckybox'
  | 'settings' | 'promoters' | 'agents'

const TABS: { key: MainTab; emoji: string; label: string }[] = [
  { key: 'stats',      emoji: '📊', label: 'Stats' },
  { key: 'deposits',   emoji: '⬇️', label: 'ዲፖዚት' },
  { key: 'withdrawals',emoji: '⬆️', label: 'ዊዝድሮው' },
  { key: 'players',    emoji: '👥', label: 'ተጫዋቾች' },
  { key: 'promo',      emoji: '🏷️', label: 'ፕሮሞ ኮድ' },
  { key: 'broadcast',  emoji: '📢', label: 'ብሮድካስት' },
  { key: 'luckybox',   emoji: '🎁', label: 'Lucky Box' },
  { key: 'settings',   emoji: '⚙️', label: 'ሴቲንጊ' },
  { key: 'promoters',  emoji: '🟡', label: 'ፕሮሞተሮች' },
  { key: 'agents',     emoji: '🔗', label: 'ኤጀንቶች' },
]

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<MainTab>('deposits')

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 20%, #0d1a2e 0%, #07080f 100%)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 className="font-condensed" style={{ fontSize: 20, fontWeight: 800, color: '#D4A017', margin: 0, letterSpacing: '0.06em' }}>
            🛡 ADMIN PANEL
          </h1>
          <p style={{ fontSize: 10, color: '#555', margin: 0 }}>መልካም Bingo</p>
        </div>
        <button
          onClick={onLogout}
          style={{ padding: '7px 12px', fontSize: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#aaa', cursor: 'pointer' }}
        >ውጣ</button>
      </div>

      {/* Tab navigation — horizontal scroll */}
      <div style={{
        display: 'flex', overflowX: 'auto', borderBottom: '1px solid rgba(255,255,255,0.07)',
        scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flexShrink: 0, padding: '10px 14px', fontSize: 11, fontWeight: 700,
              border: 'none', borderBottom: tab === t.key ? '2px solid #D4A017' : '2px solid transparent',
              background: 'transparent',
              color: tab === t.key ? '#D4A017' : '#666',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >{t.emoji} {t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
        {tab === 'stats'       && <StatsTab />}
        {tab === 'deposits'    && <DepositsTab />}
        {tab === 'withdrawals' && <WithdrawalsTab />}
        {tab === 'players'     && <PlayersTab />}
        {tab === 'promo'       && <PromoCodesTab />}
        {tab === 'broadcast'   && <BroadcastTab />}
        {tab === 'luckybox'    && <LuckyBoxTab />}
        {tab === 'settings'    && <SettingsTab />}
        {tab === 'promoters'   && <PromotersTab />}
        {tab === 'agents'      && <AgentsTab />}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// Root export
// ──────────────────────────────────────────────
export default function AdminPage() {
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch('/api/admin/check?telegramId=0', { headers: { 'x-admin-token': token } })
      .then(r => r.json())
      .then(d => { if (d.isAdmin) setAuthed(true) })
      .catch(() => { /* ignore */ })
  }, [])

  function handleLogout() { clearToken(); setAuthed(false) }

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />
  return <Dashboard onLogout={handleLogout} />
}
