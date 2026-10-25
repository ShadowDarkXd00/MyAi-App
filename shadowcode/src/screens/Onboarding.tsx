import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight, Check, ChevronLeft, Fingerprint, KeyRound, Layers, ShieldCheck, Sparkles,
  Terminal, Wand2, Zap,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { Btn, Field } from '../components/ui'
import { PinPad } from '../components/PinPad'
import { PRESETS } from '../lib/providers'
import type { Provider, ProviderKind } from '../lib/types'

type Step = 'intro' | 'pin' | 'pin2' | 'key' | 'ready'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('intro')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  const [preset, setPreset] = useState('openai')
  const [key, setKey] = useState('')
  const [models, setModels] = useState(PRESETS[0].models.join('\n'))
  const [busy, setBusy] = useState(false)
  const createVault = useStore((s) => s.createVault)
  const upsert = useStore((s) => s.upsertProvider)
  const patch = useStore((s) => s.patchSettings)
  const newSession = useStore((s) => s.newSession)
  const toast = useStore((s) => s.toast)

  const pr = PRESETS.find((p) => p.id === preset)!

  const finish = async (withKey: boolean) => {
    setBusy(true)
    if (pin) await createVault(pin)
    if (withKey && key.trim()) {
      const provider: Provider = {
        id: 'pv_' + Date.now().toString(36),
        name: pr.name,
        kind: pr.kind as ProviderKind,
        baseUrl: pr.baseUrl,
        key: key.trim(),
        models: models.split('\n').map((m) => m.trim()).filter(Boolean),
        preset,
      }
      upsert(provider)
      patch({ activeProviderId: provider.id, activeModel: provider.models[0] || null })
    }
    patch({ onboarded: true })
    newSession()
    setBusy(false)
    onDone()
    toast(withKey ? 'You are ready to build' : 'Welcome to ShadowCode', 'ok')
  }

  return (
    <div className="app" style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <div className="stage">
        <div className="onb">
          <AnimatePresence mode="wait">
            {step === 'intro' && (
              <motion.div key="intro" {...fx} style={{ display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
                <div className="row" style={{ gap: 10 }}>
                  <div className="mark md"><Sparkles size={23} /></div>
                  <div>
                    <div className="brand-name">ShadowCode</div>
                    <div className="brand-sub">agent studio · android</div>
                  </div>
                </div>

                <div className="onb-art">
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ display: 'grid', placeItems: 'center', gap: 10, zIndex: 1 }}
                  >
                    <div className="mark lg" style={{ boxShadow: '0 20px 50px -14px rgba(124,92,255,.9)' }}>
                      <Terminal size={30} />
                    </div>
                  </motion.div>
                </div>

                <div>
                  <h1 style={{ fontSize: 30, letterSpacing: '-0.04em', lineHeight: 1.12 }}>
                    Your AI.<br />
                    Your <span className="gradient-text">keys</span>.<br />
                    Your device.
                  </h1>
                  <p className="small muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
                    A full agent workspace in your pocket — chat, code editor, real terminal and installable skills. No sign-up, no cloud, no subscription.
                  </p>
                </div>

                <div className="col" style={{ gap: 9 }}>
                  {[
                    { icon: <KeyRound size={16} />, t: 'Bring any API key', s: 'OpenAI, Claude, Gemini, OpenRouter, Groq, local models' },
                    { icon: <Terminal size={16} />, t: 'Agent that acts', s: 'Runs shell commands and edits real files, with your approval' },
                    { icon: <Wand2 size={16} />, t: 'Skills you install', s: 'Teach the agent new crafts, stack them per chat' },
                    { icon: <ShieldCheck size={16} />, t: 'Encrypted on-device', s: 'PIN-protected vault, AES-256, zero telemetry' },
                  ].map((f) => (
                    <div key={f.t} className="row" style={{ gap: 11 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 11, background: 'color-mix(in oklab, var(--a1) 16%, transparent)', border: '1px solid color-mix(in oklab, var(--a1) 26%, transparent)', color: 'var(--a2)', display: 'grid', placeItems: 'center', flex: 'none' }}>
                        {f.icon}
                      </div>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{f.t}</div>
                        <div className="tiny muted">{f.s}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="spacer" style={{ minHeight: 8 }} />
                <Btn variant="accent" block onClick={() => setStep('pin')}>
                  Set up my vault <ArrowRight size={17} />
                </Btn>
                <button className="btn ghost block" onClick={() => { patch({ onboarded: true }); newSession(); onDone() }}>
                  Explore without keys
                </button>
              </motion.div>
            )}

            {(step === 'pin' || step === 'pin2') && (
              <motion.div key="pin" {...fx} style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}>
                <button className="btn ghost icon sm" style={{ alignSelf: 'flex-start' }} onClick={() => setStep('intro')}>
                  <ChevronLeft size={18} />
                </button>
                <div style={{ textAlign: 'center' }}>
                  <div className="mark md" style={{ margin: '0 auto 12px' }}><Fingerprint size={22} /></div>
                  <h2 style={{ fontSize: 23, letterSpacing: '-0.03em' }}>
                    {step === 'pin' ? 'Create a vault PIN' : 'Repeat your PIN'}
                  </h2>
                  <p className="small muted" style={{ marginTop: 6 }}>
                    {step === 'pin'
                      ? 'Six digits. It derives the key that encrypts your API keys.'
                      : 'Just to be sure it is right.'}
                  </p>
                </div>
                <div className="spacer" style={{ minHeight: 10 }} />
                <PinPad
                  key={step}
                  length={6}
                  error={err}
                  onDone={(v) => {
                    if (step === 'pin') {
                      setPin(v)
                      setStep('pin2')
                    } else if (v === pin) {
                      setStep('key')
                    } else {
                      setErr(true)
                      setTimeout(() => { setErr(false); setStep('pin'); setPin('') }, 800)
                    }
                  }}
                />
                <div className="spacer" />
                <div className="banner info">
                  <ShieldCheck size={15} style={{ flex: 'none', marginTop: 1 }} />
                  <div>No recovery phrase. No server. If you forget the PIN your keys must be re-entered — everything else stays.</div>
                </div>
              </motion.div>
            )}

            {step === 'key' && (
              <motion.div key="key" {...fx} style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                <div>
                  <h2 style={{ fontSize: 23, letterSpacing: '-0.03em' }}>Add your first key</h2>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    Pick a provider and paste a key. You can add more any time.
                  </p>
                </div>
                <div className="row wrap" style={{ gap: 7 }}>
                  {PRESETS.filter((p) => p.id !== 'custom').map((p) => (
                    <button
                      key={p.id}
                      className={`chip ${preset === p.id ? 'on' : ''}`}
                      onClick={() => { setPreset(p.id); setModels(p.models.join('\n')) }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: 9, background: p.color }} />
                      {p.name}
                    </button>
                  ))}
                </div>
                <Field label={`${pr.name} API key`}>
                  <input
                    className="input mono"
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder={pr.keyHint}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </Field>
                <Field label="Models" hint="One per line. First becomes the default.">
                  <textarea className="textarea mono" style={{ fontSize: 12.5, minHeight: 92 }} value={models} onChange={(e) => setModels(e.target.value)} />
                </Field>
                <div className="spacer" />
                <Btn variant="accent" block disabled={!key.trim() || busy} onClick={() => finish(true)}>
                  <Check size={16} /> {busy ? 'Creating vault…' : 'Start building'}
                </Btn>
                <button className="btn ghost block" onClick={() => finish(false)}>Skip — add keys later</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

const fx = {
  initial: { opacity: 0, x: 22 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -22 },
  transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number] },
}
