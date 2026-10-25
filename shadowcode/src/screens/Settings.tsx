import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, Check, ChevronRight, Copy, Download, Eye, EyeOff, Fingerprint, Globe,
  HardDrive, Info, KeyRound, Lock, Plus, RefreshCw, Save, ShieldCheck, SlidersHorizontal,
  Sparkles, Trash2, Upload, Wifi, X, Zap, ExternalLink, Cpu, Palette, Bot,
  RotateCcw, FileJson, Unlock,
} from 'lucide-react'
import { useStore, ACCENTS } from '../lib/store'
import { Btn, Divider, Field, Sheet, Toggle, Empty } from '../components/ui'
import { PinPad, PinField, PinDots } from '../components/PinPad'
import { deviceInfo, isNative, copyText, pickFile, relPath } from '../lib/bridge'
import { buildReport, clearCrashes } from '../lib/diagnostics'
import { PRESETS, testProvider, providerColor } from '../lib/providers'
import { clamp, fmtBytes } from '../lib/util'
import type { Provider, ProviderKind } from '../lib/types'

type Section = 'providers' | 'appearance' | 'agent' | 'security' | 'data' | 'about'

const SECTIONS: { id: Section; label: string; icon: React.ReactNode; sub: string }[] = [
  { id: 'providers', label: 'Vault & providers', icon: <KeyRound size={17} />, sub: 'Keys, endpoints, models' },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={17} />, sub: 'Theme, accent, motion' },
  { id: 'agent', label: 'Agent', icon: <Bot size={17} />, sub: 'Steps, tools, approvals' },
  { id: 'security', label: 'Security', icon: <ShieldCheck size={17} />, sub: 'PIN, auto-lock' },
  { id: 'data', label: 'Data & workspace', icon: <HardDrive size={17} />, sub: 'Backup, storage' },
  { id: 'about', label: 'About', icon: <Info size={17} />, sub: 'Build info' },
]

export function SettingsScreen() {
  const [section, setSection] = useState<Section>('providers')
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)
  const providers = useStore((s) => s.providers)
  const vaultExists = useStore((s) => s.vaultExists)
  const locked = useStore((s) => s.vaultLocked)
  const lock = useStore((s) => s.lockVault)
  const unlock = useStore((s) => s.unlockVault)
  const createVault = useStore((s) => s.createVault)
  const toast = useStore((s) => s.toast)

  const [pin, setPin] = useState('')
  const [pinErr, setPinErr] = useState(false)
  const [pinBusy, setPinBusy] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [changePinOpen, setChangePinOpen] = useState(false)

  const doUnlock = async (p: string) => {
    setPinBusy(true)
    const ok = await unlock(p)
    setPinBusy(false)
    if (!ok) {
      setPinErr(true)
      setTimeout(() => setPinErr(false), 700)
    } else {
      setPin('')
      toast('Vault unlocked', 'ok')
    }
  }

  const doCreate = async (p: string) => {
    setPinBusy(true)
    await createVault(p)
    setPinBusy(false)
    setPin('')
    toast('Vault created — add your first key', 'ok')
    setAddOpen(true)
  }

  return (
    <div className="screen">
      <div className="page">
        <div className="row" style={{ padding: '2px 2px 14px' }}>
          <div className="grow">
            <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-0.035em' }}>Vault & settings</div>
            <div className="small muted">Everything is local. No account, no cloud.</div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {vaultExists && !locked && (
              <Btn variant="ghost" icon size="sm" onClick={() => { lock(); toast('Vault locked', 'ok') }} aria-label="Lock vault">
                <Lock size={16} />
              </Btn>
            )}
          </div>
        </div>

        <div className="tabbar-scroll" style={{ marginBottom: 12 }}>
          {SECTIONS.map((s) => (
            <button key={s.id} className={`chip ${section === s.id ? 'on' : ''}`} onClick={() => setSection(s.id)}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            {section === 'providers' && (
              <div>
                {!vaultExists && (
                  <div className="card" style={{ padding: 18, marginBottom: 14 }}>
                    <div className="row" style={{ gap: 12, marginBottom: 12 }}>
                      <div className="mark md"><Fingerprint size={22} /></div>
                      <div className="grow">
                        <div style={{ fontWeight: 650 }}>Create your vault</div>
                        <div className="small muted">Choose a PIN. It encrypts every API key with AES-256 on this device.</div>
                      </div>
                    </div>
                    <PinPad length={6} onDone={doCreate} busy={pinBusy} submitLabel="Create vault" />
                    <div className="tiny dim" style={{ textAlign: 'center', marginTop: 12 }}>
                      There is no recovery: if you forget the PIN, keys must be re-entered.
                    </div>
                  </div>
                )}

                {vaultExists && locked && (
                  <div className="card" style={{ padding: 18, marginBottom: 14 }}>
                    <div className="row" style={{ gap: 12, marginBottom: 14 }}>
                      <div className="mark md"><Lock size={21} /></div>
                      <div className="grow">
                        <div style={{ fontWeight: 650 }}>Vault locked</div>
                        <div className="small muted">Enter your PIN to load keys into memory.</div>
                      </div>
                    </div>
                    <PinPad length={6} onDone={doUnlock} busy={pinBusy} error={pinErr} submitLabel="Unlock" />
                  </div>
                )}

                {vaultExists && !locked && (
                  <>
                    <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                      <Btn variant="accent" block onClick={() => { setEditing(null); setAddOpen(true) }}>
                        <Plus size={16} /> Add provider
                      </Btn>
                      <Btn icon onClick={() => toast('Keys stay encrypted with AES-256-GCM + PBKDF2', 'info')} aria-label="Info">
                        <ShieldCheck size={17} />
                      </Btn>
                    </div>

                    {!providers.length && (
                      <Empty
                        icon={<KeyRound size={24} />}
                        title="No providers yet"
                        sub="Add OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Ollama or any OpenAI-compatible endpoint."
                        action={<Btn size="sm" variant="accent" onClick={() => setAddOpen(true)}>Add your first key</Btn>}
                      />
                    )}

                    {providers.map((p) => (
                      <ProviderCard
                        key={p.id}
                        p={p}
                        active={settings.activeProviderId === p.id}
                        onEdit={() => { setEditing(p); setAddOpen(true) }}
                        onUse={() => {
                          patch({ activeProviderId: p.id, activeModel: p.models[0] || null })
                          toast(`${p.name} selected`, 'ok')
                        }}
                        onDelete={() => {
                          if (confirm(`Remove ${p.name}? The key is erased.`)) {
                            useStore.getState().removeProvider(p.id)
                            toast('Provider removed', 'ok')
                          }
                        }}
                        onTest={async () => {
                          const r = await testProvider(p, p.models[0])
                          toast(r.msg, r.ok ? 'ok' : 'bad')
                        }}
                      />
                    ))}

                    <div className="banner info" style={{ marginTop: 16 }}>
                      <Info size={15} style={{ flex: 'none', marginTop: 1 }} />
                      <div>
                        Requests go straight from this device to the provider you choose. Nothing is proxied through us, and there is no account to create.
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {section === 'appearance' && (
              <div className="card" style={{ padding: 16 }}>
                <div className="label" style={{ marginBottom: 8 }}>Theme</div>
                <div className="row" style={{ gap: 8, marginBottom: 18 }}>
                  {(['dark', 'light'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => patch({ theme: t })}
                      className="grow center"
                      style={{
                        height: 82, borderRadius: 18, gap: 8, flexDirection: 'column',
                        border: `1px solid ${settings.theme === t ? 'color-mix(in oklab, var(--a1) 60%, transparent)' : 'var(--line)'}`,
                        background: t === 'dark' ? '#0a0b11' : '#f4f5fa',
                        color: t === 'dark' ? '#eef0f7' : '#12141c',
                        boxShadow: settings.theme === t ? 'var(--glow)' : 'none',
                      }}
                    >
                      <div style={{ width: 46, height: 26, borderRadius: 8, background: t === 'dark' ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{t}</span>
                    </button>
                  ))}
                </div>

                <div className="label" style={{ marginBottom: 8 }}>Accent</div>
                <div className="row wrap" style={{ gap: 9, marginBottom: 18 }}>
                  {ACCENTS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => patch({ accent: a.id })}
                      className="center"
                      style={{
                        width: 46, height: 46, borderRadius: 15,
                        background: `linear-gradient(135deg, ${a.a1}, ${a.a2})`,
                        border: settings.accent === a.id ? '2px solid var(--ink)' : '2px solid transparent',
                        boxShadow: `0 8px 20px -10px ${a.a1}`,
                      }}
                      aria-label={a.name}
                    >
                      {settings.accent === a.id && <Check size={18} color="#fff" />}
                    </button>
                  ))}
                </div>

                <div className="row" style={{ marginBottom: 4 }}>
                  <div className="label grow" style={{ margin: 0 }}>Corner radius</div>
                  <span className="small mono muted">{settings.radius}px</span>
                </div>
                <input className="slider" type="range" min={12} max={34} value={settings.radius} onChange={(e) => patch({ radius: +e.target.value })} />

                <div className="row" style={{ margin: '10px 0 4px' }}>
                  <div className="label grow" style={{ margin: 0 }}>Text size</div>
                  <span className="small mono muted">{Math.round(settings.fontScale * 100)}%</span>
                </div>
                <input className="slider" type="range" min={85} max={120} value={Math.round(settings.fontScale * 100)} onChange={(e) => patch({ fontScale: +e.target.value / 100 })} />

                <Divider />
                <Toggle
                  on={settings.haptics}
                  onChange={(v) => patch({ haptics: v })}
                  label="Haptic feedback"
                  sub="Tiny vibration on taps (Android)"
                />
              </div>
            )}

            {section === 'agent' && (
              <div className="card" style={{ padding: 16 }}>
                <div className="row" style={{ marginBottom: 4 }}>
                  <div className="label grow" style={{ margin: 0 }}>Temperature</div>
                  <span className="small mono muted">{settings.temperature.toFixed(2)}</span>
                </div>
                <input className="slider" type="range" min={0} max={150} value={settings.temperature * 100} onChange={(e) => patch({ temperature: +e.target.value / 100 })} />
                <div className="row" style={{ margin: '10px 0 4px' }}>
                  <div className="label grow" style={{ margin: 0 }}>Max agent steps</div>
                  <span className="small mono muted">{settings.maxSteps}</span>
                </div>
                <input className="slider" type="range" min={1} max={10} value={settings.maxSteps} onChange={(e) => patch({ maxSteps: +e.target.value })} />
                <div className="row" style={{ margin: '10px 0 4px' }}>
                  <div className="label grow" style={{ margin: 0 }}>Terminal font</div>
                  <span className="small mono muted">{settings.termFontSize}px</span>
                </div>
                <input className="slider" type="range" min={10} max={16} value={settings.termFontSize} onChange={(e) => patch({ termFontSize: +e.target.value })} />

                <Divider />
                <Toggle on={settings.streaming} onChange={(v) => patch({ streaming: v })} label="Stream responses" sub="Show tokens as they arrive" />
                <Toggle on={settings.showReasoning} onChange={(v) => patch({ showReasoning: v })} label="Show reasoning" sub="For models that expose it" />
                <Toggle on={settings.includeWorkspaceContext} onChange={(v) => patch({ includeWorkspaceContext: v })} label="Send workspace tree" sub="Gives the agent file awareness" />
                <Toggle on={settings.autoTitle} onChange={(v) => patch({ autoTitle: v })} label="Auto-title chats" />

                <Divider label="tool approvals" />
                <div className="small muted" style={{ marginBottom: 6 }}>
                  Risky tools ask before running unless allowed here.
                </div>
                {[
                  ['terminal_run', 'Terminal commands'],
                  ['file_write', 'Write files'],
                  ['file_append', 'Append to files'],
                  ['file_delete', 'Delete files'],
                  ['skill_install', 'Install skills'],
                ].map(([id, label]) => (
                  <Toggle
                    key={id}
                    on={settings.autoApprove.includes(id)}
                    onChange={(v) => {
                      const cur = new Set(settings.autoApprove)
                      if (v) cur.add(id)
                      else cur.delete(id)
                      patch({ autoApprove: [...cur] })
                    }}
                    label={label}
                    sub={settings.autoApprove.includes(id) ? 'Runs without asking' : 'Asks first'}
                  />
                ))}

                <Divider label="system prompt" />
                <textarea
                  className="textarea"
                  placeholder="Extra instructions for every chat. e.g. 'Always reply in Hindi and English. Prefer single-file HTML.'"
                  value={settings.systemExtra}
                  onChange={(e) => patch({ systemExtra: e.target.value })}
                />
                <div className="tiny dim" style={{ marginTop: 6 }}>Appended to the base agent prompt for every conversation.</div>
              </div>
            )}

            {section === 'security' && (
              <div className="card" style={{ padding: 16 }}>
                {!vaultExists ? (
                  <Empty icon={<Lock size={22} />} title="No vault yet" sub="Create one in Vault & providers." />
                ) : (
                  <>
                    <div className="row" style={{ gap: 12, marginBottom: 12 }}>
                      <div className="mark" style={{ background: 'var(--surface-hi)', color: 'var(--ink-2)', boxShadow: 'none' }}>
                        {locked ? <Lock size={18} /> : <Unlock size={18} />}
                      </div>
                      <div className="grow">
                        <div style={{ fontWeight: 650 }}>{locked ? 'Vault locked' : 'Vault unlocked'}</div>
                        <div className="small muted">{locked ? 'Keys are not in memory' : `${useStore.getState().providers.length} keys in memory`}</div>
                      </div>
                      <Btn size="sm" onClick={() => (locked ? setSection('providers') : lock())}>
                        {locked ? 'Unlock' : 'Lock now'}
                      </Btn>
                    </div>

                    <Divider />
                    <div className="row" style={{ marginBottom: 4 }}>
                      <div className="label grow" style={{ margin: 0 }}>Auto-lock</div>
                      <span className="small mono muted">{settings.autoLockMinutes ? `${settings.autoLockMinutes} min` : 'off'}</span>
                    </div>
                    <input className="slider" type="range" min={0} max={30} step={1} value={settings.autoLockMinutes} onChange={(e) => patch({ autoLockMinutes: +e.target.value })} />
                    <div className="tiny dim" style={{ marginBottom: 14 }}>
                      Lock automatically after this much inactivity (0 = never).
                    </div>

                    <Btn block onClick={() => setChangePinOpen(true)} disabled={locked}>
                      <RefreshCw size={15} /> Change PIN
                    </Btn>

                    <div className="banner" style={{ marginTop: 16 }}>
                      <AlertTriangle size={15} style={{ flex: 'none', marginTop: 1 }} />
                      <div>
                        Keys are encrypted with a key derived from your PIN (PBKDF2-SHA256, 210k iterations) and AES-256-GCM. On Android the ciphertext sits in app-private storage.
                      </div>
                    </div>

                    <button
                      className="btn danger block"
                      style={{ marginTop: 14 }}
                      onClick={() => {
                        if (!confirm('Erase the vault and every stored key? This cannot be undone.')) return
                        useStore.getState().setProviders([])
                        useStore.getState().lockVault()
                        toast('Vault wiped', 'ok')
                      }}
                    >
                      <Trash2 size={15} /> Wipe all keys
                    </button>
                  </>
                )}
              </div>
            )}

            {section === 'data' && (
              <div className="card" style={{ padding: 16 }}>
                <div className="label" style={{ marginBottom: 8 }}>Workspace</div>
                <div className="mono small" style={{ background: 'var(--surface-hi)', padding: 12, borderRadius: 12, wordBreak: 'break-all', marginBottom: 12 }}>
                  {deviceInfo.home}
                </div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <Btn size="sm" onClick={() => useStore.getState().exportBackup()}><Download size={14} /> Export backup</Btn>
                  <Btn size="sm" onClick={async () => {
                    const f = await pickFile()
                    if (!f) return
                    try {
                      const data = JSON.parse(f.content)
                      if (data.app !== 'ShadowCode') throw new Error('not a ShadowCode backup')
                      if (data.skills) useStore.setState({ skills: data.skills })
                      if (data.settings) patch(data.settings)
                      if (data.sessions) useStore.setState({ sessions: data.sessions, messages: data.messages || {} })
                      toast('Backup restored', 'ok')
                    } catch {
                      toast('That file is not a ShadowCode backup', 'bad')
                    }
                  }}><Upload size={14} /> Restore</Btn>
                  <Btn size="sm" variant="danger" onClick={() => { if (confirm('Delete every chat?')) void useStore.getState().clearChats() }}>
                    <Trash2 size={14} /> Clear chats
                  </Btn>
                </div>
                <div className="tiny dim" style={{ marginBottom: 16 }}>Backups never include API keys.</div>

                {isNative && (
                  <div className="banner info" style={{ marginBottom: 14 }}>
                    <Info size={15} style={{ flex: 'none', marginTop: 1 }} />
                    <div>
                      <b>Workshop tip:</b> grant "All files access" so the agent can read slides, datasets or assets straight from Downloads.
                      <button className="btn sm line" style={{ marginTop: 8 }} onClick={() => (window as any).ShadowNative?.requestAllFiles?.()}>
                        <HardDrive size={13} /> Open storage permission
                      </button>
                    </div>
                  </div>
                )}

                <Divider />
                <Row label="Chats" value={`${useStore.getState().sessions.length}`} />
                <Row label="Skills installed" value={`${useStore.getState().skills.length}`} />
                <Row label="Providers" value={`${providers.length}`} />
                <Row label="Storage mode" value={isNative ? 'app-private + external files' : 'browser localStorage'} />
              </div>
            )}

            {section === 'about' && (
              <div className="col" style={{ gap: 12 }}>
                <div className="card" style={{ padding: 18, textAlign: 'center' }}>
                  <div className="mark lg" style={{ margin: '0 auto 12px' }}><Sparkles size={30} /></div>
                  <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em' }}>ShadowCode</div>
                  <div className="small muted" style={{ marginTop: 2 }}>v1.0.2 · agent studio for Android</div>
                  <div className="row" style={{ gap: 6, justifyContent: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                    <span className="chip tiny"><Zap size={11} /> on-device agent</span>
                    <span className="chip tiny"><ShieldCheck size={11} /> encrypted keys</span>
                    <span className="chip tiny"><Globe size={11} /> bring your own API</span>
                  </div>
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <div className="label" style={{ marginBottom: 8 }}>This device</div>
                  <Row label="Runtime" value={isNative ? 'Native Android shell' : 'Web preview'} />
                  <Row label="Device" value={deviceInfo.model} />
                  <Row label="Android" value={deviceInfo.android} />
                  <Row label="SDK" value={String(deviceInfo.sdk)} />
                  <Row label="Package" value={deviceInfo.pkg} />
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <div className="label" style={{ marginBottom: 8 }}>Diagnostics</div>
                  <div className="small muted" style={{ marginBottom: 10 }}>
                    Something misbehaving? Copy a report — device, WebView, logs and the last crash — and send it on.
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <Btn
                      size="sm"
                      variant="accent"
                      onClick={async () => {
                        await copyText(buildReport())
                        toast('Report copied to clipboard', 'ok')
                      }}
                    >
                      <Copy size={14} /> Copy report
                    </Btn>
                    <Btn
                      size="sm"
                      onClick={async () => {
                        await clearCrashes()
                        toast('Logs cleared', 'ok')
                      }}
                    >
                      <Trash2 size={14} /> Clear logs
                    </Btn>
                    <Btn
                      size="sm"
                      onClick={() => {
                        const w = window.open('', '_blank')
                        if (w) {
                          w.document.write('<pre style="white-space:pre-wrap;font:12px monospace">' + buildReport().replace(/</g, '&lt;') + '</pre>')
                          w.document.title = 'ShadowCode diagnostics'
                        } else toast('Popup blocked — use Copy report', 'bad')
                      }}
                    >
                      <Eye size={14} /> View
                    </Btn>
                  </div>
                </div>

                <div className="card" style={{ padding: 16 }}>
                  <div className="small" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
                    ShadowCode has no account system, no analytics and no backend. You supply the model keys; the agent runs here and touches only this device. Bring your own skills, your own endpoints, your own workflows.
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div style={{ height: 24 }} />
      </div>

      <ProviderSheet
        key={editing?.id || 'new'}
        open={addOpen}
        initial={editing}
        onClose={() => setAddOpen(false)}
        onSave={(p) => {
          useStore.getState().upsertProvider(p)
          setAddOpen(false)
          toast(editing ? 'Provider updated' : 'Provider added', 'ok')
        }}
      />

      <ChangePinSheet open={changePinOpen} onClose={() => setChangePinOpen(false)} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
      <span className="small muted grow">{label}</span>
      <span className="small mono truncate" style={{ maxWidth: '60%', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

/* ------------------------------------------------------------- provider card */
function ProviderCard({
  p, active, onEdit, onUse, onDelete, onTest,
}: {
  p: Provider
  active: boolean
  onEdit: () => void
  onUse: () => void
  onDelete: () => void
  onTest: () => Promise<void>
}) {
  const [testing, setTesting] = useState(false)
  const [reveal, setReveal] = useState(false)
  return (
    <div className="card" style={{ padding: 14, marginBottom: 10, borderColor: active ? 'color-mix(in oklab, var(--a1) 40%, transparent)' : undefined }}>
      <div className="row" style={{ gap: 11 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: `${providerColor(p)}22`, border: `1px solid ${providerColor(p)}55`, display: 'grid', placeItems: 'center', flex: 'none' }}>
          <span style={{ width: 10, height: 10, borderRadius: 9, background: providerColor(p) }} />
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span style={{ fontWeight: 650, fontSize: 14.5 }}>{p.name}</span>
            {active && <span className="badge" style={{ background: 'color-mix(in oklab, var(--ok) 22%, transparent)', color: 'var(--ok)', fontSize: 9 }}>ACTIVE</span>}
          </div>
          <div className="tiny dim truncate">{p.models.length} models · {p.kind}{p.baseUrl ? ` · ${p.baseUrl.replace(/^https?:\/\//, '').slice(0, 34)}` : ''}</div>
        </div>
        <button className="btn ghost icon sm" onClick={() => setReveal(!reveal)} aria-label="Show key">
          {reveal ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      <div className="mono tiny" style={{ marginTop: 10, background: 'var(--surface-hi)', padding: '8px 10px', borderRadius: 10, color: 'var(--ink-3)', wordBreak: 'break-all' }}>
        {reveal ? p.key : p.key ? p.key.slice(0, 7) + '•'.repeat(Math.min(24, Math.max(6, p.key.length - 10))) + p.key.slice(-4) : '(no key)'}
      </div>

      <div className="row" style={{ gap: 6, marginTop: 10 }}>
        <Btn size="sm" onClick={onUse} disabled={active}>Use</Btn>
        <Btn size="sm" onClick={onEdit}><SlidersHorizontal size={13} /> Edit</Btn>
        <Btn
          size="sm"
          onClick={async () => {
            setTesting(true)
            await onTest()
            setTesting(false)
          }}
        >
          {testing ? <RefreshCw size={13} className="spin" /> : <Wifi size={13} />} Test
        </Btn>
        <div className="spacer" />
        <Btn size="sm" variant="ghost" icon onClick={onDelete} aria-label="Delete"><Trash2 size={14} /></Btn>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ provider sheet */
function ProviderSheet({
  open, onClose, onSave, initial,
}: {
  open: boolean
  onClose: () => void
  onSave: (p: Provider) => void
  initial: Provider | null
}) {
  const [preset, setPreset] = useState<string>(initial?.preset || 'openai')
  const [name, setName] = useState(initial?.name || '')
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl || '')
  const [key, setKey] = useState(initial?.key || '')
  const [models, setModels] = useState((initial?.models || []).join('\n'))
  const [kind, setKind] = useState<ProviderKind>(initial?.kind || 'openai')
  const toast = useStore((s) => s.toast)

  const p = PRESETS.find((x) => x.id === preset)!
  const applyPreset = (id: string) => {
    const pr = PRESETS.find((x) => x.id === id)!
    setPreset(id)
    setName(pr.name === 'Custom endpoint' ? '' : pr.name)
    setBaseUrl(pr.baseUrl)
    setKind(pr.kind)
    setModels(pr.models.join('\n'))
  }

  const current = (): Provider => ({
    id: initial?.id || 'pv_' + Date.now().toString(36),
    name: name.trim() || p.name,
    kind,
    baseUrl: baseUrl.trim(),
    key: key.trim(),
    models: models.split('\n').map((m) => m.trim()).filter(Boolean),
    preset,
  })

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? 'Edit provider' : 'Add provider'}
      footer={
        <div className="row" style={{ gap: 8 }}>
          <Btn
            block
            onClick={async () => {
              const prov = current()
              if (!prov.models.length) {
                toast('Add at least one model id', 'bad')
                return
              }
              const r = await testProvider(prov, prov.models[0])
              toast(r.msg, r.ok ? 'ok' : 'bad')
            }}
          >
            <Wifi size={15} /> Test
          </Btn>
          <Btn block variant="accent" disabled={!key.trim() || !baseUrl.trim() || !models.trim()} onClick={() => onSave(current())}>
            <Save size={15} /> Save
          </Btn>
        </div>
      }
    >
      {!initial && (
        <>
          <div className="label" style={{ marginBottom: 8 }}>Provider</div>
          <div className="row wrap" style={{ gap: 7, marginBottom: 16 }}>
            {PRESETS.map((x) => (
              <button key={x.id} className={`chip ${preset === x.id ? 'on' : ''}`} onClick={() => applyPreset(x.id)}>
                <span style={{ width: 7, height: 7, borderRadius: 9, background: x.color }} />
                {x.name}
              </button>
            ))}
          </div>
        </>
      )}

      <Field label="Display name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={p.name} />
      </Field>

      {p.docs && (
        <div className="tiny dim" style={{ marginTop: -8, marginBottom: 12 }}>
          Get a key at <b style={{ color: 'var(--ink-2)' }}>{p.docs}</b>
        </div>
      )}

      <Field label="API key" hint="Stored encrypted — never leaves this device except in requests to this endpoint.">
        <input className="input mono" type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={p.keyHint} autoCapitalize="none" autoCorrect="off" spellCheck={false} />
      </Field>

      <Field label="Base URL">
        <input className="input mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" autoCapitalize="none" spellCheck={false} />
      </Field>

      <Field label="API shape">
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as ProviderKind)}>
          <option value="openai">OpenAI-compatible (/chat/completions)</option>
          <option value="anthropic">Anthropic (/messages)</option>
          <option value="gemini">Google Gemini (generateContent)</option>
        </select>
      </Field>

      <Field label="Models" hint="One model id per line. The first one becomes the default.">
        <textarea className="textarea mono" style={{ minHeight: 110, fontSize: 12.5 }} value={models} onChange={(e) => setModels(e.target.value)} placeholder={'gpt-4o-mini\nllama-3.3-70b-versatile'} />
      </Field>

      <div className="banner info">
        <Info size={15} style={{ flex: 'none', marginTop: 1 }} />
        <div>Any OpenAI-compatible server works: Ollama, LM Studio, vLLM, LiteLLM gateways. For a device-hosted model use your LAN IP, e.g. <span className="mono">http://192.168.1.5:11434/v1</span>.</div>
      </div>
    </Sheet>
  )
}

/* --------------------------------------------------------------- change pin */
function ChangePinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<'old' | 'new' | 'confirm'>('old')
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useStore((s) => s.toast)
  const unlockVault = useStore((s) => s.unlockVault)
  const changePin = useStore((s) => s.changePin)

  const reset = () => {
    setStep('old'); setOldPin(''); setNewPin(''); setErr(false); setBusy(false)
  }

  return (
    <Sheet open={open} onClose={() => { reset(); onClose() }} title="Change PIN">
      {step === 'old' && (
        <>
          <div className="small muted" style={{ textAlign: 'center', marginBottom: 16 }}>Enter your current PIN</div>
          <PinPad
            key="old"
            length={6}
            error={err}
            busy={busy}
            onDone={async (v) => {
              setBusy(true)
              const ok = await unlockVault(v)
              setBusy(false)
              if (!ok) {
                setErr(true)
                setTimeout(() => setErr(false), 700)
              } else {
                setOldPin(v)
                setStep('new')
              }
            }}
          />
        </>
      )}
      {step === 'new' && (
        <>
          <div className="small muted" style={{ textAlign: 'center', marginBottom: 16 }}>Choose a new 6-digit PIN</div>
          <PinPad key="new" length={6} onDone={(v) => { setNewPin(v); setStep('confirm') }} />
        </>
      )}
      {step === 'confirm' && (
        <>
          <div className="small muted" style={{ textAlign: 'center', marginBottom: 16 }}>Repeat the new PIN</div>
          <PinPad
            key="confirm"
            length={6}
            error={err}
            onDone={async (v) => {
              if (v !== newPin) {
                setErr(true)
                setTimeout(() => { setErr(false); setStep('new'); setNewPin('') }, 800)
                return
              }
              setBusy(true)
              const ok = await changePin(v)
              setBusy(false)
              if (ok) {
                toast('PIN changed', 'ok')
                reset()
                onClose()
              } else toast('Could not change PIN', 'bad')
            }}
          />
        </>
      )}
      <div className="row" style={{ justifyContent: 'center', marginTop: 14, gap: 6 }}>
        <PinDots length={6} filled={step === 'confirm' ? 6 : 0} />
      </div>
    </Sheet>
  )
}
