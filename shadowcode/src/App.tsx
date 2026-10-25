import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Code2, KeyRound, Lock, MessageSquare, SlidersHorizontal, Sparkles, SquareTerminal,
  Wand2, X, Unlock, Zap,
} from 'lucide-react'
import { useStore, type Tab } from './lib/store'
import { isNative, deviceInfo, haptic } from './lib/bridge'
import { ChatScreen } from './screens/Chat'
import { StudioScreen } from './screens/Studio'
import { TerminalScreen } from './screens/Terminal'
import { SkillsScreen } from './screens/Skills'
import { SettingsScreen } from './screens/Settings'
import { Onboarding } from './screens/Onboarding'
import { PinPad } from './components/PinPad'
import { ToastHost, Btn } from './components/ui'

const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare size={19} /> },
  { id: 'studio', label: 'Studio', icon: <Code2 size={19} /> },
  { id: 'terminal', label: 'Shell', icon: <SquareTerminal size={19} /> },
  { id: 'skills', label: 'Skills', icon: <Wand2 size={19} /> },
  { id: 'settings', label: 'Vault', icon: <SlidersHorizontal size={19} /> },
]

export default function App() {
  const booted = useStore((s) => s.booted)
  const settings = useStore((s) => s.settings)
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const vaultExists = useStore((s) => s.vaultExists)
  const locked = useStore((s) => s.vaultLocked)
  const unlock = useStore((s) => s.unlockVault)
  const [unlockDismissed, setUnlockDismissed] = useState(false)
  const [pinErr, setPinErr] = useState(false)
  const [pinBusy, setPinBusy] = useState(false)
  const lastActive = useRef(Date.now())

  useEffect(() => {
    void useStore.getState().boot().then(() => useStore.getState().seedWorkspace())
  }, [])

  // auto-lock when the app has been in the background
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        lastActive.current = Date.now()
        return
      }
      const mins = useStore.getState().settings.autoLockMinutes
      if (mins > 0 && Date.now() - lastActive.current > mins * 60000) {
        const st = useStore.getState()
        if (st.vaultExists && !st.vaultLocked) {
          st.lockVault()
          setUnlockDismissed(false)
        }
      }
      lastActive.current = Date.now()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // native back button
  useEffect(() => {
    ;(window as any).__scBack = () => {
      const st = useStore.getState()
      if (st.tab !== 'chat') st.setTab('chat')
      else if (st.busy) st.stop()
    }
  }, [])

  if (!booted) {
    return (
      <div className="app">
        <div className="stage center" style={{ gap: 14 }}>
          <div className="mark lg" style={{ animation: 'pulse 1.6s ease-in-out infinite' }}>
            <Sparkles size={30} />
          </div>
          <div className="small muted">Opening ShadowCode…</div>
        </div>
      </div>
    )
  }

  if (!settings.onboarded) return <Onboarding onDone={() => void 0} />

  const showLock = vaultExists && locked && !unlockDismissed

  return (
    <div className="app">
      <div className="stage">
        <TopBar />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            >
              <Boundary key={tab}>
                {tab === 'chat' && <ChatScreen />}
                {tab === 'studio' && <StudioScreen />}
                {tab === 'terminal' && <TerminalScreen />}
                {tab === 'skills' && <SkillsScreen />}
                {tab === 'settings' && <SettingsScreen />}
              </Boundary>
            </motion.div>
          </AnimatePresence>
        </div>

        <Nav />
      </div>

      <ToastHost />

      <AnimatePresence>
        {showLock && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="scrim"
            style={{ zIndex: 80, display: 'grid', placeItems: 'center', padding: 22 }}
          >
            <motion.div
              initial={{ scale: 0.94, y: 16, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="card"
              style={{ width: 'min(100%, 380px)', padding: 22, background: 'var(--surface-solid)', zIndex: 81 }}
            >
              <div style={{ textAlign: 'center', marginBottom: 18 }}>
                <div className="mark md" style={{ margin: '0 auto 12px' }}><Lock size={21} /></div>
                <div style={{ fontSize: 18, fontWeight: 680, letterSpacing: '-0.02em' }}>Vault locked</div>
                <div className="small muted" style={{ marginTop: 3 }}>Enter your PIN to load keys</div>
              </div>
              <PinPad
                length={6}
                error={pinErr}
                busy={pinBusy}
                onDone={async (p) => {
                  setPinBusy(true)
                  const ok = await unlock(p)
                  setPinBusy(false)
                  if (!ok) {
                    setPinErr(true)
                    setTimeout(() => setPinErr(false), 700)
                  }
                }}
              />
              <button className="btn ghost block" style={{ marginTop: 14 }} onClick={() => setUnlockDismissed(true)}>
                Browse without keys
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {vaultExists && locked && unlockDismissed && (
        <button
          onClick={() => { setUnlockDismissed(false); setTab('settings') }}
          className="toast"
          style={{ position: 'fixed', zIndex: 50, left: '50%', transform: 'translateX(-50%)', bottom: 'calc(var(--safe-b) + 90px)', color: 'var(--warn)', fontSize: 12 }}
        >
          <Unlock size={13} /> Unlock vault to use your keys
        </button>
      )}
    </div>
  )
}

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error('screen crashed', error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="screen center" style={{ padding: 24, gap: 12, textAlign: 'center' }}>
        <div className="mark md"><X size={22} /></div>
        <div style={{ fontWeight: 650 }}>This screen hit a snag</div>
        <div className="small muted" style={{ maxWidth: 300 }}>
          {String(this.state.error?.message || 'Unknown error')}
        </div>
        <button className="btn accent" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    )
  }
}

function TopBar() {
  const tab = useStore((s) => s.tab)
  const providers = useStore((s) => s.providers)
  const vaultExists = useStore((s) => s.vaultExists)
  const locked = useStore((s) => s.vaultLocked)
  void tab
  const setTab = useStore((s) => s.setTab)
  const hasKey = providers.length > 0 && !locked
  return (
    <div className="topbar">
      <div className="brand grow">
        <div className="mark"><Sparkles size={19} strokeWidth={2.2} /></div>
        <div className="col" style={{ gap: 0 }}>
          <div className="brand-name">ShadowCode</div>
          <div className="brand-sub">{isNative ? `${deviceInfo.model} · on-device` : 'preview build'}</div>
        </div>
      </div>
      <button
        className="chip"
        onClick={() => setTab('settings')}
        style={{
          borderColor: hasKey ? 'color-mix(in oklab, var(--ok) 38%, transparent)' : 'var(--line)',
          color: hasKey ? 'var(--ok)' : 'var(--ink-3)',
          fontSize: 11,
          height: 26,
        }}
      >
        {hasKey ? <Zap size={11} /> : vaultExists && locked ? <Lock size={11} /> : <KeyRound size={11} />}
        {hasKey ? `${providers.length} key${providers.length > 1 ? 's' : ''}` : vaultExists && locked ? 'locked' : 'no key'}
      </button>
    </div>
  )
}

function Nav() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const idx = NAV.findIndex((n) => n.id === tab)
  return (
    <div className="navwrap">
      <div className="navpill">
        <motion.div
          className="navblob"
          animate={{ left: 6 + idx * 62, width: 62 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        />
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`navitem ${tab === n.id ? 'active' : ''}`}
            onClick={() => {
              haptic(6)
              setTab(n.id)
            }}
          >
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
