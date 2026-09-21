import { Switch, Route, useLocation } from 'wouter'
import { PlayerProvider } from './context/PlayerContext'
import { SoundProvider } from './context/SoundContext'
import LobbyPage from './pages/LobbyPage'
import SlotSelectionPage from './pages/SlotSelectionPage'
import GamePage from './pages/GamePage'
import WinnerPage from './pages/WinnerPage'
import WalletPage from './pages/WalletPage'
import ProfilePage from './pages/ProfilePage'
import SettingsPage from './pages/SettingsPage'
import AdminPage from './pages/AdminPage'
import BottomNav from './components/BottomNav'

// Routes where the bottom nav should NOT appear
const HIDDEN_NAV_ROUTES = ['/', '/game', '/slots', '/winner', '/admin']

function AppShell() {
  const [location] = useLocation()

  // Admin page rendered outside PlayerProvider — no Telegram auth needed
  if (location === '/admin') {
    return <AdminPage />
  }

  const showNav = !HIDDEN_NAV_ROUTES.includes(location)

  return (
    <div
      className="game-bg"
      style={{
        minHeight: '100vh',
        maxWidth: 480,
        margin: '0 auto',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Switch>
        <Route path="/" component={LobbyPage} />
        <Route path="/slots" component={SlotSelectionPage} />
        <Route path="/game" component={GamePage} />
        <Route path="/winner" component={WinnerPage} />
        <Route path="/wallet" component={WalletPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/admin" component={AdminPage} />
      </Switch>
      {showNav && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <SoundProvider>
      <PlayerProvider>
        <AppShell />
      </PlayerProvider>
    </SoundProvider>
  )
}
