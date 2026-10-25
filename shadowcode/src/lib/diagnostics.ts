import { N, deviceInfo, isNative } from './bridge'
import { copyText } from './bridge'

/**
 * Crash + diagnostics plumbing.
 *
 * The APK keeps a native log ring and a last-crash file; this module mirrors JS
 * errors into it and assembles one copyable report. A failed React mount renders a
 * readable error screen instead of a black window.
 */

let installed = false
const ring: string[] = []

export function report(level: 'error' | 'info', message: string) {
  const line = `${new Date().toISOString().slice(11, 19)} [${level}] ${message}`
  ring.push(line)
  if (ring.length > 300) ring.shift()
  try {
    N?.jsLog?.(level, message.slice(0, 4000))
  } catch {
    /* no bridge */
  }
}

export function installCrashHandlers() {
  if (installed) return
  installed = true

  window.addEventListener('error', (e) => {
    const err = (e as ErrorEvent).error
    report(
      'error',
      `${e.message} @ ${(e as ErrorEvent).filename}:${(e as ErrorEvent).lineno}:${(e as ErrorEvent).colno}` +
        (err?.stack ? `\n${err.stack}` : ''),
    )
  })

  window.addEventListener('unhandledrejection', (e) => {
    const r: any = (e as PromiseRejectionEvent).reason
    report('error', `unhandled rejection: ${r?.stack || r?.message || String(r)}`)
  })

  // If React never mounts, show something readable instead of a blank screen.
  setTimeout(() => {
    const root = document.getElementById('root')
    if (root && root.children.length === 0) {
      renderFallback(
        'The interface did not start',
        `React mounted nothing.\n\n${collectLocal()}\n\nNative log:\n${nativeLog()}`,
      )
    }
  }, 3500)
}

function collectLocal(): string {
  const lines = [
    `build: 1.0.2`,
    `native bridge: ${isNative ? 'yes' : 'no (browser)'}`,
    `device: ${deviceInfo.model} · android ${deviceInfo.android} (sdk ${deviceInfo.sdk})`,
    `pkg: ${deviceInfo.pkg}`,
    `home: ${deviceInfo.home}`,
    `ua: ${navigator.userAgent}`,
    `lang: ${navigator.language}`,
    `screen: ${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}`,
    `storage ok: ${(() => {
      try {
        localStorage.setItem('__sc_probe', '1')
        localStorage.removeItem('__sc_probe')
        return 'yes'
      } catch {
        return 'NO — storage blocked'
      }
    })()}`,
    `crypto.subtle: ${typeof crypto !== 'undefined' && crypto.subtle ? 'yes' : 'missing'}`,
    `ResizeObserver: ${typeof (window as any).ResizeObserver}`,
  ]
  return lines.join('\n')
}

function nativeLog(): string {
  try {
    return String((N?.runtimeLog?.() || '') + (N?.crashLog?.() || '')).slice(-6000) || '(empty)'
  } catch {
    return '(unavailable)'
  }
}

export function renderFallback(title: string, body: string) {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = ''
  const wrap = document.createElement('div')
  wrap.setAttribute(
    'style',
    'font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#06070B;color:#EEF0F7;' +
      'min-height:100%;padding:26px 20px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px',
  )
  const tag = document.createElement('div')
  tag.textContent = 'SHADOWCODE'
  tag.setAttribute('style', 'color:#7C5CFF;font-size:12px;font-weight:700;letter-spacing:.16em')
  const h = document.createElement('div')
  h.textContent = title
  h.setAttribute('style', 'font-size:21px;font-weight:700;letter-spacing:-.02em')
  const p = document.createElement('pre')
  p.textContent = body
  p.setAttribute(
    'style',
    'white-space:pre-wrap;word-break:break-word;font-size:11.5px;line-height:1.55;color:#9AA1B4;' +
      'background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:16px;' +
      'padding:14px;margin:0;max-height:58vh;overflow:auto;-webkit-user-select:text;user-select:text',
  )
  const btn = document.createElement('button')
  btn.textContent = 'Copy report'
  btn.setAttribute(
    'style',
    'height:48px;border:0;border-radius:26px;color:#fff;font-size:15px;font-weight:600;' +
      'background:linear-gradient(135deg,#7C5CFF,#22D3EE)',
  )
  btn.onclick = () => {
    copyText(`${title}\n\n${body}`)
    btn.textContent = 'Copied'
  }
  const retry = document.createElement('button')
  retry.textContent = 'Reload'
  retry.setAttribute('style', 'height:44px;border-radius:22px;border:0;background:transparent;color:#B8BDCD;font-size:14px')
  retry.onclick = () => location.reload()
  wrap.append(tag, h, p, btn, retry)
  root.appendChild(wrap)
}

/** One-click support bundle used by Settings → Diagnostics. */
export function buildReport(): string {
  const info = (() => {
    try {
      return JSON.parse(N?.diagnostics?.() || '{}')
    } catch {
      return {}
    }
  })()
  const native = Object.keys(info).length
    ? [
        `native version: ${info.version || '?'} (${info.package || '?'})`,
        `webview: ${info.webview || '?'}`,
        `workspace writable: ${info.workspaceWritable}`,
        `vault: exists=${info.vaultExists} unlocked=${info.vaultUnlocked}`,
      ].join('\n')
    : 'native: unavailable (browser preview)'

  return [
    '### ShadowCode report',
    collectLocal(),
    native,
    '',
    '### Native log',
    String(info.log || nativeLog()).slice(-4000) || '(empty)',
    '',
    '### Last crash',
    String(info.crash || '').trim() || '(none recorded)',
    '',
    '### JS ring',
    ring.slice(-40).join('\n') || '(empty)',
  ].join('\n')
}

export async function clearCrashes() {
  try {
    N?.clearCrashLog?.()
  } catch {
    /* ignore */
  }
  ring.length = 0
}
