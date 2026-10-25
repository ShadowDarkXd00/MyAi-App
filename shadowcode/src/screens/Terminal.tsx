import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp, ChevronUp, Circle, Copy, CornerDownLeft, Info, Loader2, Play, Plus,
  Terminal as TermIcon, Trash2, X, Zap,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { exec, homeDir, isNative, deviceInfo, copyText, relPath } from '../lib/bridge'
import { ansiToHtml, stripAnsi } from '../lib/ansi'
import { Btn, Sheet } from '../components/ui'

const QUICK = ['ls -la', 'pwd', 'df -h', 'uname -a', 'find . -maxdepth 2 -type f | head -30', 'du -sh * 2>/dev/null', 'date']

export function TerminalScreen() {
  const settings = useStore((s) => s.settings)
  const toast = useStore((s) => s.toast)
  const [buf, setBuf] = useState<string>(
    `\x1b[38;5;111mShadowCode shell\x1b[0m — ${isNative ? 'running on this device' : 'browser preview (emulated)'}\n` +
      `Workspace: ${homeDir}\n` +
      `Type \x1b[1mhelp\x1b[0m for commands.\n\n`,
  )
  const [cwd, setCwd] = useState(homeDir)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('shadowcode:hist') || '[]')
    } catch {
      return []
    }
  })
  const [hIdx, setHIdx] = useState<number | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const prompt = useMemo(() => {
    const short = cwd === homeDir ? '~' : '~/' + relPath(cwd)
    return `shadow@${(deviceInfo.model || 'device').split(' ')[0].toLowerCase()}:${short}$`
  }, [cwd])

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [buf, busy])

  const append = (s: string) => setBuf((b) => {
    const next = b + s
    return next.length > 160000 ? next.slice(-120000) : next
  })

  const run = async (raw?: string) => {
    const cmd = (raw ?? input).trim()
    if (!cmd || busy) return
    setInput('')
    setHIdx(null)
    append(`\x1b[38;5;114m${prompt}\x1b[0m ${cmd}\n`)
    const nextHist = [...history.filter((h) => h !== cmd), cmd].slice(-60)
    setHistory(nextHist)
    localStorage.setItem('shadowcode:hist', JSON.stringify(nextHist))

    if (cmd === 'clear' || cmd === 'cls') {
      setBuf('')
      return
    }
    if (cmd === 'help' && !isNative) {
      setBusy(true)
      const r = await exec('help', cwd)
      append(r.out + '\n')
      setBusy(false)
      return
    }

    // local cd handling so the prompt tracks the shell
    const cdMatch = cmd.match(/^cd(?:\s+(.+))?$/)
    if (cdMatch) {
      const target = (cdMatch[1] || homeDir).replace(/^['"]|['"]$/g, '')
      const abs = target.startsWith('/') ? target : `${cwd}/${target}`
      const r = await exec(cmd, cwd)
      if (r.code === 0) {
        const norm = abs.split('/').reduce<string[]>((acc, s) => {
          if (!s || s === '.') return acc
          if (s === '..') acc.pop()
          else acc.push(s)
          return acc
        }, [])
        setCwd('/' + norm.join('/'))
      } else {
        append(`\x1b[31m${r.out || 'cd failed'}\x1b[0m\n`)
      }
      return
    }

    setBusy(true)
    const started = performance.now()
    const r = await exec(cmd, cwd, 60000)
    const ms = Math.round(performance.now() - started)
    if (r.out?.includes('\x1b[2J')) {
      setBuf('')
    } else if (r.out) {
      append(r.out.replace(/\x1b\[2J\x1b\[H/g, '') + (r.out.endsWith('\n') ? '' : '\n'))
    }
    if (r.code !== 0) append(`\x1b[38;5;210m[exit ${r.code} · ${ms}ms]\x1b[0m\n`)
  }

  return (
    <div className="screen" style={{ padding: '0 12px', gap: 0 }}>
      <div className="row" style={{ padding: '0 4px 10px', gap: 8 }}>
        <div className="row grow" style={{ gap: 8 }}>
          <div className="row" style={{ width: 26, height: 26, borderRadius: 9, background: 'color-mix(in oklab, var(--a2) 20%, transparent)', justifyContent: 'center' }}>
            <TermIcon size={14} color="var(--a2)" />
          </div>
          <div className="col" style={{ gap: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 650 }}>Terminal</span>
            <span className="tiny dim">{isNative ? 'native /system/bin/sh' : 'preview emulation'}</span>
          </div>
        </div>
        <Btn variant="ghost" icon size="sm" onClick={() => setInfoOpen(true)} aria-label="Info">
          <Info size={16} />
        </Btn>
        <Btn
          variant="ghost"
          icon
          size="sm"
          aria-label="Copy output"
          onClick={async () => {
            await copyText(stripAnsi(buf))
            toast('Terminal copied', 'ok')
          }}
        >
          <Copy size={15} />
        </Btn>
        <Btn variant="ghost" icon size="sm" onClick={() => setBuf('')} aria-label="Clear">
          <Trash2 size={15} />
        </Btn>
      </div>

      <div className="term-wrap">
        <div className="term-head">
          <div className="term-dots">
            <i style={{ background: '#ff5f57' }} /><i style={{ background: '#febc2e' }} /><i style={{ background: '#28c840' }} />
          </div>
          <span className="tiny mono" style={{ color: 'rgba(255,255,255,.42)', marginLeft: 6 }}>
            {isNative ? `${deviceInfo.model} · android ${deviceInfo.android}` : 'web preview'}
          </span>
          <div className="spacer" />
          {busy ? <Loader2 size={13} className="spin" color="#8ee6c8" /> : <span style={{ width: 7, height: 7, borderRadius: 9, background: '#34d399', boxShadow: '0 0 8px #34d399' }} />}
        </div>

        <div
          className="term-body"
          ref={bodyRef}
          onClick={() => inputRef.current?.focus()}
          style={{ fontSize: settings.termFontSize }}
        >
          <div dangerouslySetInnerHTML={{ __html: ansiToHtml(buf) }} />
          {busy && (
            <div style={{ color: '#8ee6c8', opacity: 0.8 }}>
              <span className="typing"><i /><i /><i /></span>
            </div>
          )}
        </div>

        <div className="term-input-row">
          <span className="term-prompt">{prompt}</span>
          <input
            ref={inputRef}
            className="term-input"
            value={input}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder={busy ? 'running…' : ''}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void run()
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                const idx = hIdx === null ? history.length - 1 : Math.max(0, hIdx - 1)
                if (history[idx]) {
                  setInput(history[idx])
                  setHIdx(idx)
                }
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (hIdx === null) return
                const idx = hIdx + 1
                if (idx >= history.length) {
                  setHIdx(null)
                  setInput('')
                } else {
                  setInput(history[idx])
                  setHIdx(idx)
                }
              } else if (e.key === 'Tab') {
                e.preventDefault()
                setInput((v) => (v ? v + '  ' : '  '))
              }
            }}
          />
          <button
            className="btn icon sm"
            style={{ background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.1)', color: '#c5cbdc' }}
            onClick={() => void run()}
            disabled={!input.trim() || busy}
            aria-label="Run"
          >
            <CornerDownLeft size={14} />
          </button>
        </div>

        <div className="keybar">
          {['Esc', 'Tab', 'Ctrl-C', 'Ctrl-D', '|', '&&', '-', '/', '~', '*', '"'].map((k) => (
            <button
              key={k}
              onClick={() => {
                if (k === 'Ctrl-C') {
                  setInput('')
                  append('\x1b[38;5;210m^C\x1b[0m\n')
                } else if (k === 'Ctrl-D') {
                  append('exit\n')
                } else if (k === 'Esc') {
                  setInput('')
                } else if (k === 'Tab') {
                  setInput((v) => v + '  ')
                } else {
                  setInput((v) => v + k)
                }
                inputRef.current?.focus()
              }}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="quickrow" style={{ padding: '10px 2px 0' }}>
        {QUICK.map((q) => (
          <button key={q} className="chip mono" style={{ fontSize: 10.5 }} onClick={() => void run(q)}>
            {q}
          </button>
        ))}
      </div>

      <Sheet open={infoOpen} onClose={() => setInfoOpen(false)} title="About this shell">
        <div className="small" style={{ color: 'var(--ink-2)', lineHeight: 1.65 }}>
          <p style={{ marginBottom: 12 }}>
            {isNative
              ? 'Commands run in a real POSIX shell inside the app sandbox. Your workspace lives at:'
              : 'You are in the browser preview, so commands are emulated. Install the APK to run a real shell. The workspace path there will be:'}
          </p>
          <div className="mono small" style={{ background: 'var(--surface-hi)', padding: 12, borderRadius: 12, marginBottom: 14, wordBreak: 'break-all' }}>
            {homeDir}
          </div>
          <div className="label" style={{ marginBottom: 6 }}>What works in the APK</div>
          <ul style={{ paddingLeft: 18, margin: '0 0 14px' }}>
            <li>Every binary already on the device (sh, grep, sed, ls, curl where present)</li>
            <li>Static binaries you drop into <span className="mono">~/bin</span> (node, python, git, busybox…)</li>
            <li>File tools the agent uses share this exact workspace</li>
          </ul>
          <div className="banner">
            Apps on Android run as an unprivileged user: root-only paths and system writes will be refused.
          </div>
        </div>
      </Sheet>
    </div>
  )
}
