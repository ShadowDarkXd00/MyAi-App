import React, { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles, Code2, Palette, Bug, Terminal, BookOpen, BarChart3, Shield, Zap, Wand2,
  Globe, Layers, Database, Gamepad2, PenTool, Rocket, Cpu, Film, Music, X, Check,
  AlertTriangle, Info, ChevronLeft, type LucideIcon,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { haptic } from '../lib/bridge'

/* ------------------------------------------------------------------- icons */
const ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  code: Code2,
  palette: Palette,
  bug: Bug,
  terminal: Terminal,
  book: BookOpen,
  chart: BarChart3,
  shield: Shield,
  bolt: Zap,
  wand: Wand2,
  globe: Globe,
  layers: Layers,
  database: Database,
  gamepad: Gamepad2,
  pen: PenTool,
  rocket: Rocket,
  cpu: Cpu,
  zap: Zap,
  film: Film,
  music: Music,
}

export function SkillIcon({ name, size = 19 }: { name?: string; size?: number }) {
  const Cmp = ICON_MAP[name || 'sparkles'] || Sparkles
  return <Cmp size={size} strokeWidth={2.1} />
}

/* ------------------------------------------------------------------ button */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'accent' | 'ghost' | 'soft' | 'line' | 'danger'
  size?: 'md' | 'sm'
  icon?: boolean
  block?: boolean
}

export function Btn({ variant = 'default', size = 'md', icon, block, className = '', children, onClick, ...rest }: BtnProps) {
  const cls = [
    'btn',
    variant !== 'default' ? variant : '',
    size === 'sm' ? 'sm' : '',
    icon ? 'icon' : '',
    block ? 'block' : '',
    className,
  ].filter(Boolean).join(' ')
  return (
    <button
      className={cls}
      onClick={(e) => {
        if (useStore.getState().settings.haptics) haptic(7)
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ sheet */
export function Sheet({
  open, onClose, title, children, footer, wide,
}: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          <motion.div
            className="sheet"
            style={wide ? { width: 'min(100%, 760px)' } : undefined}
            initial={{ y: '100%', opacity: 0.6, scale: 0.99 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: '100%', opacity: 0, transition: { duration: 0.2 } }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
          >
            <div className="sheet-grip" />
            {(title || true) && (
              <div className="sheet-head">
                <div className="grow" style={{ fontSize: 16, fontWeight: 650, letterSpacing: '-0.02em' }}>{title}</div>
                <Btn variant="ghost" icon size="sm" onClick={onClose} aria-label="Close">
                  <X size={17} />
                </Btn>
              </div>
            )}
            <div className="sheet-scroll">{children}</div>
            {footer && <div style={{ padding: '10px 18px calc(14px + var(--safe-b))', borderTop: '1px solid var(--line)' }}>{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ----------------------------------------------------------------- toggle */
export function Toggle({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: React.ReactNode; sub?: string }) {
  return (
    <button
      className="listrow"
      onClick={() => {
        haptic(7)
        onChange(!on)
      }}
      style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--line)' }}
    >
      <div className="grow">
        <div className="t">{label}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
      <div className={`switch ${on ? 'on' : ''}`} />
    </button>
  )
}

/* ------------------------------------------------------------------ field */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field" style={{ marginBottom: 14 }}>
      <div className="label">{label}</div>
      {children}
      {hint && <div className="tiny dim" style={{ marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ toast */
export function ToastHost() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="toast-wrap">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="toast"
            initial={{ y: 18, opacity: 0, scale: 0.94 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            {t.kind === 'bad' ? <AlertTriangle size={15} color="var(--bad)" /> : t.kind === 'ok' ? <Check size={15} color="var(--ok)" /> : <Info size={15} color="var(--a2)" />}
            <span>{t.msg}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------------- segmented */
export function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T
  options: { value: T; label: string; icon?: React.ReactNode }[]
  onChange: (v: T) => void
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className="segmented" style={{ position: 'relative' }}>
      <motion.div
        className="segblob"
        animate={{ left: `calc(${idx} * (100% - 8px) / ${options.length} + 4px)` }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        style={{ width: `calc((100% - 8px) / ${options.length})` }}
      />
      {options.map((o) => (
        <button key={o.value} className={o.value === value ? 'on' : ''} onClick={() => { haptic(6); onChange(o.value) }}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ misc */
export function PageHead({ title, sub, right, onBack }: { title: string; sub?: string; right?: React.ReactNode; onBack?: () => void }) {
  return (
    <div className="row" style={{ padding: '4px 4px 12px', gap: 10 }}>
      {onBack && (
        <Btn variant="ghost" icon size="sm" onClick={onBack} aria-label="Back">
          <ChevronLeft size={19} />
        </Btn>
      )}
      <div className="grow">
        <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.03em' }}>{title}</div>
        {sub && <div className="small muted" style={{ marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

export function Empty({ icon, title, sub, action }: { icon: React.ReactNode; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="ring">{icon}</div>
      <div style={{ color: 'var(--ink-2)', fontWeight: 600, fontSize: 15 }}>{title}</div>
      {sub && <div className="small" style={{ maxWidth: 280 }}>{sub}</div>}
      {action}
    </div>
  )
}

export function useAutoGrow(initial = 22, max = 148) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(max, Math.max(initial, el.scrollHeight)) + 'px'
  }
  return { ref, resize }
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="divider" />
  return <div className="hr-label" style={{ margin: '14px 0' }}>{label}</div>
}
