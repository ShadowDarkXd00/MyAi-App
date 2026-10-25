import { useState } from 'react'
import { motion } from 'framer-motion'
import { Copy, ExternalLink, RotateCw, X, Monitor } from 'lucide-react'
import { copyText } from '../lib/bridge'

export function PreviewSheet({
  open, onClose, html, title,
}: {
  open: boolean
  onClose: () => void
  html: string
  title: string
}) {
  const [nonce, setNonce] = useState(0)
  if (!open) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column',
        background: 'var(--bg)',
      }}
    >
      <div className="row" style={{ padding: 'calc(var(--safe-t) + 10px) 14px 10px', gap: 8, borderBottom: '1px solid var(--line)' }}>
        <div className="row" style={{ width: 28, height: 28, borderRadius: 9, background: 'color-mix(in oklab, var(--a2) 20%, transparent)', justifyContent: 'center', flex: 'none' }}>
          <Monitor size={15} color="var(--a2)" />
        </div>
        <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
          <span className="small" style={{ fontWeight: 650 }}>Preview</span>
          <span className="tiny dim truncate mono">{title}</span>
        </div>
        <button className="btn ghost icon sm" onClick={() => setNonce((n) => n + 1)} aria-label="Reload">
          <RotateCw size={15} />
        </button>
        <button
          className="btn ghost icon sm"
          aria-label="Copy HTML"
          onClick={() => copyText(html)}
        >
          <Copy size={15} />
        </button>
        <button className="btn ghost icon sm" onClick={onClose} aria-label="Close">
          <X size={17} />
        </button>
      </div>
      <div className="previewframe" style={{ flex: 1, minHeight: 0 }}>
        <iframe
          key={nonce}
          title="agent-preview"
          sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
          srcDoc={html}
        />
      </div>
      <div className="row" style={{ padding: '8px 14px calc(var(--safe-b) + 8px)', gap: 6, borderTop: '1px solid var(--line)' }}>
        <span className="tiny dim grow">Runs sandboxed inside ShadowCode — no network needed.</span>
        <ExternalLink size={12} className="dim" />
        <span className="tiny dim">Studio → Preview for files</span>
      </div>
    </motion.div>
  )
}
