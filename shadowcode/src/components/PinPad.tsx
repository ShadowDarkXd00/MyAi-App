import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Delete, ShieldCheck } from 'lucide-react'
import { haptic } from '../lib/bridge'

export function PinDots({ length, filled, error }: { length: number; filled: number; error?: boolean }) {
  return (
    <div className={`dots ${error ? 'shake' : ''}`}>
      {Array.from({ length }).map((_, i) => (
        <div key={i} className={`dot ${i < filled ? 'on' : ''}`} style={error ? { background: 'var(--bad)' } : undefined} />
      ))}
    </div>
  )
}

export function PinPad({
  length = 6,
  onDone,
  busy,
  error,
  onCancel,
  cancelLabel = 'Cancel',
  submitLabel,
}: {
  length?: number
  onDone: (pin: string) => void
  busy?: boolean
  error?: boolean
  onCancel?: () => void
  cancelLabel?: string
  submitLabel?: string
}) {
  const [pin, setPin] = useState('')
  const fired = useRef(false)

  useEffect(() => {
    if (error) {
      setPin('')
      fired.current = false
    }
  }, [error])

  useEffect(() => {
    if (pin.length < length) {
      fired.current = false
      return
    }
    // onDone changes identity on every parent render — fire exactly once per entry
    if (fired.current) return
    fired.current = true
    const t = setTimeout(() => {
      onDone(pin)
      fired.current = false
      setPin('')
    }, 120)
    return () => clearTimeout(t)
  }, [pin, length, onDone])

  const press = (n: string) => {
    haptic(6)
    setPin((p) => (p.length >= length ? p : p + n))
  }

  return (
    <div className="col" style={{ gap: 18, alignItems: 'center' }}>
      <PinDots length={length} filled={pin.length} error={error} />
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((n) => (
          <button key={n} className="pinkey" onClick={() => press(n)}>{n}</button>
        ))}
        <button className="pinkey" style={{ fontSize: 12, color: 'var(--ink-3)' }} onClick={onCancel} disabled={!onCancel}>
          {onCancel ? cancelLabel : ''}
        </button>
        <button className="pinkey" onClick={() => press('0')}>0</button>
        <button className="pinkey" onClick={() => { haptic(6); setPin((p) => p.slice(0, -1)) }} aria-label="Delete">
          <Delete size={19} />
        </button>
      </div>
      {busy && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="row small muted">
          <ShieldCheck size={14} /> Deriving key…
        </motion.div>
      )}
      {submitLabel && (
        <button className="btn accent block" style={{ maxWidth: 280 }} disabled={pin.length !== length} onClick={() => onDone(pin)}>
          {submitLabel}
        </button>
      )}
    </div>
  )
}

/** Hidden HTML input variant for typing a PIN with a keyboard (desktop). */
export function PinField({
  value, onChange, placeholder = '••••••', autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <input
      className="input"
      type="password"
      inputMode="numeric"
      autoFocus={autoFocus}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
      style={{ textAlign: 'center', letterSpacing: '0.5em', fontSize: 20, fontWeight: 600 }}
    />
  )
}
