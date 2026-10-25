import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown, ArrowUpRight, Bot, Check, ChevronDown, ChevronRight, CircleSlash2, Copy,
  Loader2, MessageSquare, Plus, Search, Send, Sparkles, SquareTerminal, Trash2, Wand2,
  Wrench, X, Pencil, SlidersHorizontal, KeyRound, PanelTopClose, ShieldAlert,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { Markdown } from '../components/Markdown'
import { Btn, Sheet, SkillIcon, useAutoGrow, Empty } from '../components/ui'
import { copyText, fsRead, homeDir, isNative, relPath } from '../lib/bridge'
import { fmtTime, timeAgo } from '../lib/util'
import type { Msg, ToolCall, Skill } from '../lib/types'

const SUGGESTIONS = [
  { icon: '🎨', title: 'Design a landing page', sub: 'Coffee roastery · dark, animated, mobile-first', prompt: 'Build a landing page for a small-batch coffee roastery. Dark, warm, premium. Mobile-first, animated, single index.html + style.css inside a new folder "roastery". Then preview it.' },
  { icon: '🛠️', title: 'Debug my project', sub: 'Let the agent inspect and fix', prompt: 'List the files in my workspace, open the main HTML file, and tell me what is broken or could be improved. Then fix the three most important things.' },
  { icon: '⚡', title: 'Automate a chore', sub: 'A shell script that just works', prompt: 'Write a small POSIX shell script in tools/ that reports workspace size, largest files and stale files. Make it executable and run it.' },
  { icon: '🎮', title: 'Build a tiny game', sub: 'Playable in one HTML file', prompt: 'Build a complete, juicy, playable mobile-friendly canvas game in one HTML file (games/neon-dodge.html). Include score, restart and touch controls, then preview it.' },
]

export function ChatScreen() {
  const {
    sessions, currentSessionId, messages, settings, busy, live, providers, skills, approvals,
  } = useStore()
  const send = useStore((s) => s.send)
  const stop = useStore((s) => s.stop)
  const newSession = useStore((s) => s.newSession)
  const setTab = useStore((s) => s.setTab)
  const approve = useStore((s) => s.approve)
  const patchSettings = useStore((s) => s.patchSettings)
  const installSkill = useStore((s) => s.installSkill)

  const session = sessions.find((s) => s.id === currentSessionId) || null
  const msgs: Msg[] = (currentSessionId && messages[currentSessionId]) || []

  const [draft, setDraft] = useState('')
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [skillOpen, setSkillOpen] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)
  const ta = useAutoGrow()

  const provider = providers.find((p) => p.id === settings.activeProviderId) || providers[0] || null
  const model = settings.activeModel || provider?.models[0] || null
  const activeSkills = useMemo(
    () => skills.filter((s) => session?.skillIds?.includes(s.id)),
    [skills, session],
  )

  useEffect(() => {
    const el = listRef.current
    if (!el || !atBottom) return
    el.scrollTop = el.scrollHeight
  }, [msgs.length, msgs[msgs.length - 1]?.content, live?.status, live?.calls.length, atBottom])

  useEffect(() => {
    ta.resize()
  }, [draft])

  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }

  const submit = async (text?: string) => {
    const value = (text ?? draft).trim()
    if (!value || busy) return
    if (value.startsWith('/')) {
      const cmd = value.slice(1).split(' ')[0]
      const known = ['new', 'skills', 'term', 'studio', 'model', 'help', 'clear', 'stop'].includes(cmd)
      if (known) {
        setDraft('')
        runSlash(cmd)
        return
      }
    }
    setDraft('')
    setTimeout(() => ta.resize(), 0)
    await send(value)
  }

  const runSlash = (cmd: string) => {
    if (cmd === 'new') newSession({ skillIds: session?.skillIds || [] })
    else if (cmd === 'skills') setTab('skills')
    else if (cmd === 'term') setTab('terminal')
    else if (cmd === 'studio') setTab('studio')
    else if (cmd === 'model') setModelOpen(true)
    else if (cmd === 'stop') stop()
    else if (cmd === 'clear') newSession()
    else if (cmd === 'help')
      useStore.getState().toast('/new /model /skills /studio /term /clear /stop', 'info')
  }

  const toggleSessionSkill = (id: string) => {
    if (!session) return
    const has = session.skillIds.includes(id)
    const next = has ? session.skillIds.filter((x) => x !== id) : [...session.skillIds, id]
    useStore.setState({
      sessions: useStore.getState().sessions.map((s) => (s.id === session.id ? { ...s, skillIds: next } : s)),
    })
  }

  return (
    <div className="screen desk-split">
      <div className="col grow" style={{ minHeight: 0 }}>
        <SessionHeader
          title={session?.title || 'New chat'}
          model={model}
          providerName={provider?.name}
          count={sessions.length}
          onOpenSessions={() => setSessionsOpen(true)}
          onNew={() => newSession({ skillIds: session?.skillIds || [] })}
        />

        <div ref={listRef} onScroll={onScroll} className="msglist">
          {!msgs.length && <Hero onPick={(p) => submit(p)} needsKey={!providers.length} />}

          {msgs.map((m, i) => (
            <Message key={m.id} msg={m} index={i} showTools={settings.showReasoning} />
          ))}

          {busy && live && (
            <div className="col" style={{ gap: 8 }}>
              {live.calls.length > 0 && (
                <div className="col" style={{ gap: 7 }}>
                  {live.calls.map((c) => (
                    <ToolCard key={c.call.id} call={c.call} result={c.result} status={c.status} />
                  ))}
                </div>
              )}
              <div className="row" style={{ gap: 8, paddingLeft: 2 }}>
                <div className="avatar" style={{ width: 24, height: 24, borderRadius: 8 }}>
                  <Sparkles size={13} />
                </div>
                <div className="typing small muted">
                  <span>{live.status}</span>
                  <i /><i /><i />
                </div>
              </div>
            </div>
          )}

          {!!approvals.length && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
              style={{ padding: 14, borderColor: 'color-mix(in oklab, var(--warn) 40%, transparent)' }}
            >
              <div className="row" style={{ gap: 9, marginBottom: 8 }}>
                <ShieldAlert size={17} color="var(--warn)" />
                <div style={{ fontWeight: 650, fontSize: 14 }}>Permission needed</div>
              </div>
              <div className="small muted" style={{ marginBottom: 6 }}>
                The agent wants to run <b style={{ color: 'var(--ink)' }}>{approvals[0].name}</b>:
              </div>
              <div className="mono" style={{ fontSize: 11.5, background: 'var(--surface-hi)', padding: 10, borderRadius: 12, maxHeight: 130, overflow: 'auto', marginBottom: 10 }}>
                {argPreview(approvals[0].name, approvals[0].args)}
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                <Btn variant="accent" size="sm" onClick={() => approve(approvals[0].id, true, false)}>
                  <Check size={14} /> Allow
                </Btn>
                <Btn size="sm" onClick={() => approve(approvals[0].id, true, true)}>
                  Always allow {approvals[0].name}
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => approve(approvals[0].id, false)}>
                  Deny
                </Btn>
              </div>
            </motion.div>
          )}

          <div style={{ height: 4 }} />
        </div>

        <AnimatePresence>
          {!atBottom && msgs.length > 0 && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="chip"
              style={{ position: 'absolute', right: 18, bottom: 132, zIndex: 5, background: 'var(--surface-solid)' }}
              onClick={() => {
                const el = listRef.current
                if (el) el.scrollTop = el.scrollHeight
                setAtBottom(true)
              }}
            >
              <ArrowDown size={13} /> Latest
            </motion.button>
          )}
        </AnimatePresence>

        <div className="composer-wrap">
          {(activeSkills.length > 0 || !provider) && (
            <div className="quickrow" style={{ padding: '0 4px 8px' }}>
              {!provider && (
                <button className="chip" onClick={() => setTab('settings')} style={{ borderColor: 'color-mix(in oklab, var(--warn) 45%, transparent)', color: 'var(--warn)' }}>
                  <KeyRound size={12} /> Add an API key
                </button>
              )}
              {activeSkills.map((s) => (
                <button key={s.id} className="chip on" onClick={() => toggleSessionSkill(s.id)}>
                  <SkillIcon name={s.icon} size={12} /> {s.name} <X size={11} />
                </button>
              ))}
            </div>
          )}

          <div className="composer">
            <button
              className="btn ghost icon sm"
              style={{ marginBottom: 4, color: 'var(--ink-3)' }}
              onClick={() => setSkillOpen(true)}
              aria-label="Skills"
            >
              <Plus size={19} />
            </button>
            <textarea
              ref={ta.ref}
              rows={1}
              value={draft}
              placeholder={provider ? 'Ask ShadowCode to build something…' : 'Add a key in Vault to start'}
              onChange={(e) => setDraft(e.target.value)}
              onInput={() => ta.resize()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
            />
            {busy ? (
              <button className="sendbtn stop" onClick={stop} aria-label="Stop">
                <span style={{ width: 13, height: 13, background: '#fff', borderRadius: 3 }} />
              </button>
            ) : (
              <button className="sendbtn" disabled={!draft.trim()} onClick={() => void submit()} aria-label="Send">
                <ArrowUpRight size={20} strokeWidth={2.4} />
              </button>
            )}
          </div>
          <div className="row" style={{ justifyContent: 'space-between', padding: '7px 6px 0', gap: 8 }}>
            <button className="chip plain tiny" onClick={() => setModelOpen(true)} style={{ maxWidth: '58%', overflow: 'hidden' }}>
              <span style={{ width: 6, height: 6, borderRadius: 9, background: provider ? 'var(--ok)' : 'var(--bad)', flex: 'none' }} />
              <span className="truncate">{model || 'No model'}</span>
              <ChevronDown size={12} />
            </button>
            <div className="tiny dim truncate">
              {isNative ? 'real shell · on-device' : 'browser preview'}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------- side panel (desktop) */}
      <div className="card hide desk-panel" style={{ margin: '0 12px 12px', overflow: 'hidden', display: 'none', flexDirection: 'column' }}>
        <SessionsPanel onClose={() => setSessionsOpen(false)} />
      </div>

      <SessionSheet
        open={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        onPick={(id) => {
          useStore.getState().selectSession(id)
          setSessionsOpen(false)
        }}
        onNew={() => {
          newSession({ skillIds: session?.skillIds || [] })
          setSessionsOpen(false)
        }}
      />
      <ModelSheet open={modelOpen} onClose={() => setModelOpen(false)} onManage={() => { setModelOpen(false); setTab('settings') }} />
      <SkillSheet
        open={skillOpen}
        onClose={() => setSkillOpen(false)}
        active={session?.skillIds || []}
        onToggle={toggleSessionSkill}
        onInstall={(sk) => installSkill(sk)}
        patchModel={() => patchSettings({})}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ header */
function SessionHeader({
  title, model, providerName, count, onOpenSessions, onNew,
}: {
  title: string
  model: string | null
  providerName?: string
  count: number
  onOpenSessions: () => void
  onNew: () => void
}) {
  return (
    <div className="row" style={{ padding: '0 16px 8px', gap: 8, flex: 'none' }}>
      <button className="row grow" onClick={onOpenSessions} style={{ gap: 8, minWidth: 0, textAlign: 'left' }}>
        <div className="col" style={{ minWidth: 0, gap: 1 }}>
          <div className="row" style={{ gap: 5 }}>
            <span style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.02em' }} className="truncate">{title}</span>
            <ChevronDown size={14} className="muted" />
          </div>
          <div className="tiny dim truncate">{providerName ? `${providerName} · ${model || 'no model'}` : 'No provider connected'}</div>
        </div>
      </button>
      <button className="btn ghost icon sm" onClick={onOpenSessions} aria-label="Chats">
        <MessageSquare size={18} />
        {count > 0 && <span className="badge" style={{ position: 'absolute', transform: 'translate(12px,-12px)', fontSize: 9 }}>{count > 9 ? '9+' : count}</span>}
      </button>
      <button className="btn ghost icon sm" onClick={onNew} aria-label="New chat">
        <Plus size={19} />
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------- hero */
function Hero({ onPick, needsKey }: { onPick: (p: string) => void; needsKey: boolean }) {
  const name = useStore((s) => s.settings.activeModel) || 'your model'
  return (
    <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="hero">
        <div className="mark lg" style={{ marginBottom: 4 }}>
          <Sparkles size={30} strokeWidth={1.9} />
        </div>
        <h2>
          What are we <span className="gradient-text">building</span>?
        </h2>
        <div className="small muted" style={{ maxWidth: 300 }}>
          {needsKey
            ? 'Add your own API key in Vault — it stays encrypted on this device.'
            : `Running ${name} on your device. The agent can write files, run the terminal and preview results.`}
        </div>
      </div>
      {SUGGESTIONS.map((s) => (
        <button key={s.title} className="sugg" onClick={() => onPick(s.prompt)}>
          <span className="ico" style={{ fontSize: 16 }}>{s.icon}</span>
          <span className="grow">
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{s.title}</span>
            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }}>{s.sub}</span>
          </span>
          <ChevronRight size={16} className="muted" />
        </button>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------- message */
function Message({ msg, index }: { msg: Msg; index: number; showTools?: boolean }) {
  const [copied, setCopied] = useState(false)
  if (msg.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        style={{ display: 'flex', justifyContent: 'flex-end' }}
        onDoubleClick={async () => { await copyText(msg.content); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
      >
        <div className="bubble-user">{msg.content}</div>
      </motion.div>
    )
  }
  const empty = !msg.content && !msg.toolResults?.length
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      style={{ maxWidth: '100%' }}
    >
      <div className="row" style={{ gap: 8, marginBottom: 6, paddingLeft: 2 }}>
        <div className="avatar" style={{ width: 24, height: 24, borderRadius: 8 }}>
          <Sparkles size={13} />
        </div>
        <div className="msg-meta" style={{ padding: 0 }}>
          <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>ShadowCode</span>
          <span>·</span>
          <span>{msg.model ? msg.model.split('/').pop() : 'agent'}</span>
          <span>·</span>
          <span>{fmtTime(msg.ts)}</span>
        </div>
        <div className="spacer" />
        {!!msg.content && (
          <button
            className="btn ghost icon sm"
            style={{ height: 26, width: 26, color: 'var(--ink-4)' }}
            onClick={async () => {
              await copyText(msg.content)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
            aria-label="Copy"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
      </div>

      {!!msg.toolResults?.length && (
        <div className="col" style={{ gap: 7, marginBottom: msg.content ? 10 : 0 }}>
          {msg.toolResults.map((r) => (
            <ToolCard key={r.id} call={{ id: r.id, name: r.name, args: {} }} result={r} status={r.ok ? 'ok' : 'error'} />
          ))}
        </div>
      )}

      {!!msg.reasoning?.trim() && <Reasoning text={msg.reasoning} />}

      {msg.content ? (
        <div className="bubble-ai">
          <Markdown text={msg.content} />
        </div>
      ) : empty ? (
        <div className="bubble-ai muted small">
          {msg.error ? 'Request failed.' : 'No response.'}
        </div>
      ) : null}

      {msg.error && (
        <div className="row small" style={{ gap: 6, color: 'var(--bad)', marginTop: 6, paddingLeft: 4 }}>
          <CircleSlash2 size={13} /> Error — see the toast for details.
        </div>
      )}
      {msg.stopped && <div className="tiny dim" style={{ marginTop: 5, paddingLeft: 4 }}>stopped by you</div>}
      {index === 0 && <div style={{ height: 2 }} />}
    </motion.div>
  )
}

function Reasoning({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card flat" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
      <button className="row" style={{ padding: '8px 12px', width: '100%', gap: 7, color: 'var(--ink-3)' }} onClick={() => setOpen(!open)}>
        <Wand2 size={13} />
        <span className="small" style={{ fontWeight: 600 }}>Reasoning</span>
        <div className="spacer" />
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="small" style={{ padding: '0 12px 12px', color: 'var(--ink-3)', whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto' }}>
              {text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* --------------------------------------------------------------- tool card */
export function ToolCard({
  call, result, status,
}: {
  call: ToolCall
  result?: Msg['toolResults'] extends (infer T)[] | undefined ? T : never
  status: 'running' | 'ok' | 'error' | 'denied'
}) {
  const [open, setOpen] = useState(false)
  const color = status === 'ok' ? 'var(--ok)' : status === 'error' || status === 'denied' ? 'var(--bad)' : 'var(--a2)'
  const label: Record<string, string> = {
    terminal_run: 'Terminal', file_write: 'Write file', file_read: 'Read file', file_list: 'List files',
    file_append: 'Append', file_delete: 'Delete', file_mkdir: 'New folder', web_fetch: 'Fetch web',
    preview_html: 'Preview', skill_install: 'Install skill',
  }
  return (
    <div className="toolcard">
      <button className="toolcard-head" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(!open)}>
        <div style={{ width: 24, height: 24, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--surface-hi)', color, flex: 'none' }}>
          {status === 'running' ? <Loader2 size={13} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : status === 'ok' ? <Check size={13} /> : <X size={13} />}
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 12.5 }}>{label[call.name] || call.name}</span>
            {status === 'running' && <span className="tiny dim">running…</span>}
          </div>
          <div className="tiny mono truncate" style={{ color: 'var(--ink-3)' }}>{argSummary(call)}</div>
        </div>
        {result?.ms ? <span className="tiny dim">{result.ms < 1000 ? `${result.ms}ms` : `${(result.ms / 1000).toFixed(1)}s`}</span> : null}
        <ChevronDown size={14} className="muted" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <div className="toolcard-body">
              <div className="tiny label" style={{ marginBottom: 5 }}>Input</div>
              <pre style={{ marginBottom: 10 }}>{argPreview(call.name, call.args)}</pre>
              {result && (
                <>
                  <div className="tiny label" style={{ marginBottom: 5 }}>{result.ok ? 'Output' : 'Error'}</div>
                  <pre style={{ color: result.ok ? 'var(--ink-2)' : 'var(--bad)' }}>{result.output || '(empty)'}</pre>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function argSummary(call: ToolCall): string {
  const a = call.args || {}
  if (call.name === 'terminal_run') return String(a.command || '')
  return String(a.path || a.url || a.name || '')
}

function argPreview(name: string, args: Record<string, unknown>): string {
  const a = args || {}
  if (name === 'terminal_run') return `$ ${a.command || ''}${a.cwd ? `\n# cwd: ${a.cwd}` : ''}`
  if (name === 'file_write') return `${a.path}\n\n${String(a.content || '').slice(0, 700)}${String(a.content || '').length > 700 ? '\n…' : ''}`
  return JSON.stringify(a, null, 2).slice(0, 1200)
}

/* ------------------------------------------------------------- session list */
function SessionSheet({
  open, onClose, onPick, onNew,
}: {
  open: boolean
  onClose: () => void
  onPick: (id: string) => void
  onNew: () => void
}) {
  const { sessions, currentSessionId, messages } = useStore()
  const [q, setQ] = useState('')
  const filtered = sessions.filter((s) => s.title.toLowerCase().includes(q.toLowerCase()))
  return (
    <Sheet open={open} onClose={onClose} title="Chats" footer={<Btn variant="accent" block onClick={onNew}><Plus size={16} /> New chat</Btn>}>
      <div className="row" style={{ gap: 8, marginBottom: 6 }}>
        <div className="row grow" style={{ background: 'var(--surface)', borderRadius: 14, padding: '0 12px', border: '1px solid var(--line)' }}>
          <Search size={15} className="muted" />
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" style={{ border: 0, background: 'transparent', padding: '10px 8px' }} />
        </div>
      </div>
      {filtered.map((s) => (
        <div key={s.id} className="row" style={{ gap: 4 }}>
          <button className="listrow grow" onClick={() => onPick(s.id)} style={{ borderBottom: '1px solid var(--line)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 12, background: s.id === currentSessionId ? 'linear-gradient(135deg,var(--a1),var(--a2))' : 'var(--surface-hi)', display: 'grid', placeItems: 'center', flex: 'none', color: s.id === currentSessionId ? '#fff' : 'var(--ink-3)' }}>
              <MessageSquare size={15} />
            </div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="t truncate">{s.title || 'New chat'}</div>
              <div className="s truncate">
                {messages[s.id]?.length || 0} messages · {timeAgo(s.updatedAt)}
              </div>
            </div>
            <ChevronRight size={15} className="muted" />
          </button>
          <button
            className="btn ghost icon sm"
            style={{ color: 'var(--ink-4)' }}
            onClick={() => useStore.getState().deleteSession(s.id)}
            aria-label="Delete chat"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      {!filtered.length && <Empty icon={<MessageSquare size={24} />} title="No chats yet" sub="Start one from the composer below." />}
    </Sheet>
  )
}

function SessionsPanel({ onClose }: { onClose: () => void }) {
  const sessions = useStore((s) => s.sessions)
  const current = useStore((s) => s.currentSessionId)
  return (
    <div className="col grow" style={{ minHeight: 0 }}>
      <div className="row" style={{ padding: 14 }}>
        <div className="grow" style={{ fontWeight: 650 }}>Chats</div>
        <button className="btn ghost icon sm" onClick={onClose}><X size={15} /></button>
      </div>
      <div className="scroll" style={{ padding: '0 8px 12px' }}>
        {sessions.map((s) => (
          <button key={s.id} className={`tree-row ${s.id === current ? 'on' : ''}`} onClick={() => useStore.getState().selectSession(s.id)}>
            <MessageSquare size={14} />
            <span className="truncate grow">{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- model sheet */
function ModelSheet({ open, onClose, onManage }: { open: boolean; onClose: () => void; onManage: () => void }) {
  const { providers, settings } = useStore()
  const patch = useStore((s) => s.patchSettings)
  return (
    <Sheet open={open} onClose={onClose} title="Model" footer={<Btn block onClick={onManage}><SlidersHorizontal size={15} /> Manage providers & keys</Btn>}>
      {!providers.length && <Empty icon={<KeyRound size={22} />} title="No keys yet" sub="Add a provider key in Vault — it is encrypted with your PIN." action={<Btn variant="accent" size="sm" onClick={onManage}>Open Vault</Btn>} />}
      {providers.map((p) => (
        <div key={p.id} style={{ marginBottom: 10 }}>
          <div className="row" style={{ padding: '10px 4px 6px', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: 9, background: 'var(--a2)' }} />
            <div className="tiny label" style={{ margin: 0 }}>{p.name}</div>
          </div>
          <div className="card flat" style={{ overflow: 'hidden' }}>
            {p.models.map((m) => {
              const on = settings.activeProviderId === p.id && settings.activeModel === m
              return (
                <button
                  key={m}
                  className="listrow"
                  style={{ padding: '11px 13px', background: on ? 'color-mix(in oklab, var(--a1) 14%, transparent)' : undefined }}
                  onClick={() => {
                    patch({ activeProviderId: p.id, activeModel: m })
                    onClose()
                  }}
                >
                  <div className="grow">
                    <div className="t truncate" style={{ fontSize: 13.5 }}>{m}</div>
                  </div>
                  {on && <Check size={16} color="var(--a2)" />}
                </button>
              )
            })}
            {!p.models.length && <div className="small muted" style={{ padding: 13 }}>No models added yet.</div>}
          </div>
        </div>
      ))}
    </Sheet>
  )
}

/* ---------------------------------------------------------------- skill sheet */
function SkillSheet({
  open, onClose, active, onToggle, onInstall,
}: {
  open: boolean
  onClose: () => void
  active: string[]
  onToggle: (id: string) => void
  onInstall: (s: Skill) => void
  patchModel: () => void
}) {
  const skills = useStore((s) => s.skills)
  const installSkillText = useStore((s) => s.importSkillText)
  const [creating, setCreating] = useState(false)
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Skills for this chat"
      footer={
        <div className="row" style={{ gap: 8 }}>
          <Btn block onClick={() => setCreating(true)}><Wand2 size={15} /> New skill</Btn>
          <Btn block variant="accent" onClick={onClose}>Done</Btn>
        </div>
      }
    >
      <div className="small muted" style={{ marginBottom: 10 }}>
        Enabled skills are injected into the agent's instructions. They stack.
      </div>
      {skills.map((s) => {
        const on = active.includes(s.id)
        return (
          <button key={s.id} className="listrow" onClick={() => onToggle(s.id)}>
            <div className="tile" style={{ width: 34, height: 34, borderRadius: 11, background: s.color || 'linear-gradient(135deg,var(--a1),var(--a2))', display: 'grid', placeItems: 'center', color: '#fff', flex: 'none' }}>
              <SkillIcon name={s.icon} size={16} />
            </div>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="t truncate">{s.name}</div>
              <div className="s truncate">{s.desc}</div>
            </div>
            <div className={`switch ${on ? 'on' : ''}`} style={{ transform: 'scale(.85)' }} />
          </button>
        )
      })}
      {creating && (
        <CreateSkillInline
          onDone={() => {
            setCreating(false)
            onClose()
          }}
          onInstall={onInstall}
          onImport={installSkillText}
        />
      )}
    </Sheet>
  )
}

function CreateSkillInline({ onDone, onInstall, onImport }: { onDone: () => void; onInstall: (s: Skill) => void; onImport: (t: string, n?: string) => Promise<boolean> }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [prompt, setPrompt] = useState('')
  const installSkill = useStore((s) => s.installSkill)
  const { normaliseSkill } = useMemo(() => ({ normaliseSkill: null as any }), [])
  void normaliseSkill
  void onImport
  return (
    <div className="card" style={{ padding: 14, marginTop: 12 }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="grow" style={{ fontWeight: 650 }}>New skill</div>
        <button className="btn ghost icon sm" onClick={onDone}><X size={15} /></button>
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <div className="label">Name</div>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Landing page specialist" />
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <div className="label">When to use it</div>
        <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="One line description" />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <div className="label">Instructions</div>
        <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="How should the agent behave? Rules, process, output format…" />
      </div>
      <Btn
        variant="accent"
        block
        disabled={!name.trim() || !prompt.trim()}
        onClick={() => {
          onInstall({
            id: 'sk_' + Date.now().toString(36),
            name,
            desc,
            icon: 'sparkles',
            category: 'My skills',
            prompt,
            enabled: true,
            author: 'You',
            version: '1.0.0',
            createdAt: Date.now(),
            color: '#7c5cff',
          })
          installSkill({
            id: 'sk_' + Date.now().toString(36),
            name,
            desc,
            icon: 'sparkles',
            category: 'My skills',
            prompt,
            enabled: true,
            author: 'You',
            version: '1.0.0',
            createdAt: Date.now(),
            color: '#7c5cff',
          })
          onDone()
        }}
      >
        Create skill
      </Btn>
    </div>
  )
}
