import type { FsEntry, Provider } from './types'

/**
 * ShadowCode native bridge.
 *
 * Inside the Android APK, `window.ShadowNative` is injected by the Java shell and
 * provides a real shell, real filesystem, hardware-backed vault and a CORS-free
 * HTTP client. In a normal browser we fall back to WebCrypto + localStorage +
 * fetch + an emulated shell so the exact same UI is fully explorable.
 */

declare global {
  interface Window {
    ShadowNative?: Record<string, (...args: any[]) => any>
    __scStream?: (id: string, kind: string, data: string) => void
    __scHttp?: (id: string, json: string) => void
    __scTerm?: (id: string, kind: string, data: string) => void
    __scExec?: (id: string, json: string) => void
    __scPick?: (json: string) => void
    __scBack?: () => void
  }
}

export const N: any = typeof window !== 'undefined' ? window.ShadowNative : undefined
export const isNative = !!N

export const deviceInfo: DeviceInfoLite = (() => {
  if (N?.deviceInfo) {
    try {
      return JSON.parse(N.deviceInfo())
    } catch {
      /* ignore */
    }
  }
  return {
    model: navigator.userAgent.includes('Chrome') ? 'Web preview' : 'Browser',
    android: '—',
    sdk: 0,
    pkg: 'app.shadowcode.web',
    native: false,
    home: '/workspace',
  }
})()

interface DeviceInfoLite {
  model: string
  android: string
  sdk: number
  pkg: string
  native: boolean
  home: string
}

/* ---------------------------------------------------------------- utils */
const cbWaiters = new Map<string, (v: any) => void>()
let cbSeq = 0
function nextId() {
  return `cb${Date.now().toString(36)}${(cbSeq++).toString(36)}`
}

export function toast(msg: string) {
  if (N?.toast) N.toast(msg)
}
export function haptic(ms = 8) {
  if (N?.vibrate) N.vibrate(ms)
  else if (navigator.vibrate) navigator.vibrate(ms)
}
export function copyText(text: string): Promise<void> {
  if (N?.copy) {
    N.copy(text)
    return Promise.resolve()
  }
  return navigator.clipboard?.writeText(text).catch(() => {}) ?? Promise.resolve()
}
export function shareText(text: string) {
  if (N?.share) N.share(text)
  else navigator.share?.({ text }).catch(() => {})
}
export function openUrl(url: string) {
  if (N?.openUrl) N.openUrl(url)
  else window.open(url, '_blank')
}
export function keepAwake(on: boolean) {
  if (N?.keepAwake) N.keepAwake(on)
}
export function exitApp() {
  if (N?.exitApp) N.exitApp()
}

/* ------------------------------------------------------------ filesystem */
const LS_FS = 'shadowcode:fs:'

function lsKey(p: string) {
  return LS_FS + norm(p)
}

export function norm(p: string): string {
  if (!p) return '.'
  const abs = p.startsWith('/')
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  const out = parts.join('/')
  return (abs ? '/' : '') + out || '.'
}

export function joinPath(a: string, b: string) {
  return norm(`${a}/${b}`)
}

export const homeDir: string = deviceInfo.home || '/workspace'

export function absPath(p: string) {
  if (!p) return homeDir
  if (p.startsWith('/')) return norm(p)
  return joinPath(homeDir, p)
}

export function relPath(p: string) {
  if (p.startsWith(homeDir)) {
    const r = p.slice(homeDir.length).replace(/^\/+/, '')
    return r || '.'
  }
  return p
}

export async function fsList(dir: string): Promise<FsEntry[]> {
  const p = absPath(dir)
  if (N?.fsList) {
    try {
      const arr = JSON.parse(N.fsList(p))
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }
  // browser fallback: walk localStorage
  const out: FsEntry[] = []
  const prefix = lsKey(p) + '/'
  const seen = new Set<string>()
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || ''
    if (!k.startsWith(prefix)) continue
    const rest = k.slice(prefix.length)
    const name = rest.split('/')[0]
    if (!name || seen.has(name)) continue
    seen.add(name)
    const isDir = rest.includes('/')
    out.push({
      name,
      path: joinPath(p, name),
      dir: isDir,
      size: isDir ? 0 : (localStorage.getItem(prefix + name) || '').length,
      mtime: 0,
    })
  }
  const dirs = new Set<string>()
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || ''
    if (!k.startsWith(prefix)) continue
    const rest = k.slice(prefix.length)
    if (rest.includes('/')) dirs.add(rest.split('/')[0])
  }
  for (const d of dirs) {
    const hit = out.find((e) => e.name === d)
    if (hit) hit.dir = true
  }
  for (const d of (window as any).__scDirs?.() ?? []) {
    if (d.startsWith(p + '/')) {
      const n = d.slice(p.length + 1).split('/')[0]
      if (n && !out.find((e) => e.name === n)) out.push({ name: n, path: joinPath(p, n), dir: true, size: 0, mtime: 0 })
    }
  }
  return out.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
}

export async function fsRead(path: string): Promise<string> {
  const p = absPath(path)
  if (N?.fsRead) {
    const r = N.fsRead(p)
    return typeof r === 'string' ? r : ''
  }
  return localStorage.getItem(lsKey(p)) ?? ''
}

export async function fsWrite(path: string, data: string): Promise<boolean> {
  const p = absPath(path)
  if (N?.fsWrite) {
    try {
      return !!N.fsWrite(p, data)
    } catch {
      return false
    }
  }
  try {
    localStorage.setItem(lsKey(p), data)
    return true
  } catch {
    return false
  }
}

export async function fsDelete(path: string): Promise<boolean> {
  const p = absPath(path)
  if (N?.fsDelete) return !!N.fsDelete(p)
  localStorage.removeItem(lsKey(p))
  const prefix = lsKey(p) + '/'
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i) || ''
    if (k.startsWith(prefix)) localStorage.removeItem(k)
  }
  return true
}

export async function fsMkdir(path: string): Promise<boolean> {
  const p = absPath(path)
  if (N?.fsMkdir) return !!N.fsMkdir(p)
  ;(window as any).__scMkdirs = [...((window as any).__scMkdirs || []), p]
  return true
}

export async function fsRename(from: string, to: string): Promise<boolean> {
  const a = absPath(from)
  const b = absPath(to)
  if (N?.fsRename) return !!N.fsRename(a, b)
  const val = localStorage.getItem(lsKey(a))
  if (val == null) return false
  localStorage.setItem(lsKey(b), val)
  localStorage.removeItem(lsKey(a))
  return true
}

export async function fsExists(path: string): Promise<boolean> {
  const p = absPath(path)
  if (N?.fsExists) return !!N.fsExists(p)
  return localStorage.getItem(lsKey(p)) != null
}

export async function pickFile(): Promise<{ name: string; content: string } | null> {
  if (!N?.pickFile) {
    return new Promise((resolve) => {
      const inp = document.createElement('input')
      inp.type = 'file'
      inp.accept = '.json,.md,.txt,.yaml,.yml,text/*,application/json'
      inp.onchange = async () => {
        const f = inp.files?.[0]
        if (!f) return resolve(null)
        resolve({ name: f.name, content: await f.text() })
      }
      inp.click()
    })
  }
  return new Promise((resolve) => {
    const id = nextId()
    cbWaiters.set(id, resolve)
    window.__scPick = (json: string) => {
      try {
        resolve(JSON.parse(json))
      } catch {
        resolve(null)
      }
    }
    N.pickFile(id)
  })
}

export async function pickSave(content: string, name: string): Promise<boolean> {
  if (N?.saveFile) return !!N.saveFile(name, content)
  const blob = new Blob([content], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return true
}

/* -------------------------------------------------------------- terminal */
export interface TermHandlers {
  onData: (s: string) => void
  onExit: (code: number) => void
}

const termHandlers = new Map<string, TermHandlers>()
if (typeof window !== 'undefined') {
  window.__scTerm = (id: string, kind: string, data: string) => {
    const h = termHandlers.get(id)
    if (!h) return
    if (kind === 'data') h.onData(data)
    else if (kind === 'exit') h.onExit(parseInt(data || '0', 10))
  }
}

export function termOpen(id: string, cols: number, rows: number, h: TermHandlers) {
  termHandlers.set(id, h)
  if (N?.termOpen) N.termOpen(id, cols, rows)
}
export function termWrite(id: string, data: string) {
  if (N?.termWrite) N.termWrite(id, data)
}
export function termResize(id: string, cols: number, rows: number) {
  if (N?.termResize) N.termResize(id, cols, rows)
}
export function termClose(id: string) {
  termHandlers.delete(id)
  if (N?.termClose) N.termClose(id)
}

export interface ExecResult {
  code: number
  out: string
}

let execSeq = 0
const execWaiters = new Map<string, (r: ExecResult) => void>()
if (typeof window !== 'undefined') {
  window.__scExec = (id: string, json: string) => {
    const fn = execWaiters.get(id)
    if (!fn) return
    execWaiters.delete(id)
    try {
      fn(JSON.parse(json))
    } catch {
      fn({ code: 1, out: 'bad exec payload' })
    }
  }
}

/** Run a command in the app's private shell, returns combined output. */
export async function exec(command: string, cwd?: string, timeoutMs = 40000): Promise<ExecResult> {
  if (N?.exec) {
    const id = `x${Date.now().toString(36)}${execSeq++}`
    return new Promise((resolve) => {
      execWaiters.set(id, resolve)
      try {
        N.exec(id, command, absPath(cwd || '.'), timeoutMs)
      } catch (e: any) {
        resolve({ code: 1, out: String(e?.message || e) })
      }
      setTimeout(() => {
        if (execWaiters.has(id)) {
          execWaiters.delete(id)
          resolve({ code: 124, out: 'Command timed out' })
        }
      }, timeoutMs + 4000)
    })
  }
  return emulatedShell(command, cwd || '.')
}

/* ---------------------------------------------------------------- HTTP */
export interface HttpResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface StreamHandlers {
  onChunk: (s: string) => void
  onEnd: () => void
  onError: (e: string) => void
}

const streamHandlers = new Map<string, StreamHandlers>()
if (typeof window !== 'undefined') {
  window.__scStream = (id: string, kind: string, data: string) => {
    const h = streamHandlers.get(id)
    if (!h) return
    if (kind === 'chunk') h.onChunk(data)
    else if (kind === 'end') {
      streamHandlers.delete(id)
      h.onEnd()
    } else {
      streamHandlers.delete(id)
      h.onError(data)
    }
  }
}

const httpWaiters = new Map<string, (r: HttpResponse) => void>()
if (typeof window !== 'undefined') {
  window.__scHttp = (id: string, json: string) => {
    const fn = httpWaiters.get(id)
    if (!fn) return
    try {
      fn(JSON.parse(json) as HttpResponse)
    } catch {
      fn({ status: 0, headers: {}, body: 'Malformed bridge response' })
    }
  }
}

const aborters = new Map<string, AbortController>()

export function httpAbort(id: string) {
  if (N?.httpStop) N.httpStop(id)
  aborters.get(id)?.abort()
  aborters.delete(id)
  streamHandlers.delete(id)
}

/** Streaming POST that yields raw response bytes as they arrive (SSE friendly). */
export function httpStream(
  id: string,
  req: { url: string; method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number },
  h: StreamHandlers,
): void {
  streamHandlers.set(id, h)
  if (N?.httpStream) {
    try {
      N.httpStream(id, JSON.stringify(req))
    } catch (e: any) {
      h.onError(String(e?.message || e))
    }
    return
  }
  // browser fallback: fetch + ReadableStream
  const ac = new AbortController()
  aborters.set(id, ac)
  ;(async () => {
    try {
      const res = await fetch(req.url, {
        method: req.method || 'POST',
        headers: req.headers,
        body: req.body,
        signal: ac.signal,
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        h.onError(JSON.stringify({ status: res.status, body: t.slice(0, 1200) }))
        return
      }
      const reader = res.body?.getReader()
      if (!reader) {
        h.onChunk(await res.text())
        h.onEnd()
        return
      }
      const dec = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        h.onChunk(dec.decode(value, { stream: true }))
      }
      h.onEnd()
    } catch (e: any) {
      if (e?.name === 'AbortError') h.onEnd()
      else h.onError(String(e?.message || e))
    }
  })()
}

/** Non-streaming request, used for skill catalogs, connectivity tests, web fetch. */
export function httpRequest(req: {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}): Promise<HttpResponse> {
  if (N?.httpRequest) {
    const id = nextId()
    return new Promise((resolve) => {
      let settled = false
      const done = (r: HttpResponse) => {
        if (settled) return
        settled = true
        httpWaiters.delete(id)
        resolve(r)
      }
      httpWaiters.set(id, done)
      setTimeout(() => done({ status: 0, headers: {}, body: 'Request timed out' }), (req.timeoutMs || 30000) + 6000)
      try {
        N.httpRequest(id, JSON.stringify(req))
      } catch (e: any) {
        done({ status: 0, headers: {}, body: String(e?.message || e) })
      }
    })
  }
  return fetch(req.url, { method: req.method || 'GET', headers: req.headers, body: req.body })
    .then(async (r) => {
      const entries: [string, string][] = []
      r.headers.forEach((v, k) => entries.push([k, v]))
      return { status: r.status, headers: Object.fromEntries(entries), body: await r.text() }
    })
    .catch((e) => ({ status: 0, headers: {}, body: String(e?.message || e) }))
}


/* --------------------------------------------------------------- vault */
export interface VaultData {
  providers: Provider[]
  meta?: Record<string, unknown>
}

const LS_VAULT = 'shadowcode:vault'
let memVault: VaultData | null = null
let writeChain: Promise<unknown> = Promise.resolve()

function b64(buf: ArrayBuffer | Uint8Array) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}
function unb64(s: string) {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveKey(pin: string, salt: Uint8Array) {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 210000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export const vault = {
  exists(): boolean {
    if (N?.vaultExists) return !!N.vaultExists()
    return !!localStorage.getItem(LS_VAULT)
  },
  create(pin: string, data: VaultData): boolean {
    if (N?.vaultCreate) return !!N.vaultCreate(pin, JSON.stringify(data))
    // browser: WebCrypto is async — queue writes so they land in order
    memVault = data
    writeChain = writeChain.then(async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const key = await deriveKey(pin, salt)
      const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(JSON.stringify(memVault)),
      )
      localStorage.setItem(LS_VAULT, JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) }))
    })
    return true
  },
  unlock(pin: string): VaultData | null {
    if (N?.vaultUnlock) {
      try {
        const raw = N.vaultUnlock(pin)
        if (!raw) return null
        const d = JSON.parse(raw)
        memVault = d
        return d
      } catch {
        return null
      }
    }
    const blob = localStorage.getItem(LS_VAULT)
    if (!blob) return null
    // sync path is impossible with WebCrypto; we use a cached unlock attempt
    const parsed = JSON.parse(blob)
    ;(window as any).__vaultUnlockPending = { pin, parsed }
    return null
  },
  async unlockAsync(pin: string): Promise<VaultData | null> {
    if (N?.vaultUnlock) return vault.unlock(pin)
    const blob = localStorage.getItem(LS_VAULT)
    if (!blob) return null
    try {
      const parsed = JSON.parse(blob)
      const key = await deriveKey(pin, unb64(parsed.salt))
      const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64(parsed.iv) },
        key,
        unb64(parsed.ct),
      )
      const data = JSON.parse(new TextDecoder().decode(pt))
      memVault = data
      return data
    } catch {
      return null
    }
  },
  save(data: VaultData): boolean {
    memVault = data
    if (N?.vaultSave) return !!N.vaultSave(JSON.stringify(data))
    const pending = (window as any).__vaultPin as string | undefined
    if (!pending) return false
    writeChain = writeChain.then(async () => {
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const key = await deriveKey(pending, salt)
      const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(JSON.stringify(memVault)),
      )
      localStorage.setItem(LS_VAULT, JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct) }))
    })
    return true
  },
  rememberPin(pin: string) {
    ;(window as any).__vaultPin = pin
  },
  lock() {
    memVault = null
    ;(window as any).__vaultPin = undefined
    if (N?.vaultLock) N.vaultLock()
  },
  unlocked() {
    return memVault != null
  },
  peek() {
    return memVault
  },
  changePin(newPin: string): boolean {
    if (N?.vaultChangePin) {
      const ok = !!N.vaultChangePin(newPin)
      if (ok) (window as any).__vaultPin = newPin
      return ok
    }
    if (!memVault) return false
    ;(window as any).__vaultPin = newPin
    localStorage.removeItem(LS_VAULT)
    return vault.create(newPin, memVault)
  },
  wipe() {
    memVault = null
    ;(window as any).__vaultPin = undefined
    localStorage.removeItem(LS_VAULT)
    if (N?.vaultWipe) N.vaultWipe()
  },
}

/* ------------------------------------------------- browser shell emulator */
const CWD_KEY = 'shadowcode:cwd'

function emulatedShell(command: string, cwd: string): ExecResult {
  const c = (localStorage.getItem(CWD_KEY) || homeDir) as string
  const tokens = command.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
  const cmd = tokens[0] || ''
  const args = tokens.slice(1).map((t) => t.replace(/^['"]|['"]$/g, ''))
  const out: string[] = []
  const resolve = (p: string) => (p.startsWith('/') ? norm(p) : joinPath(c, p))

  switch (cmd) {
    case '':
      return { code: 0, out: '' }
    case 'help':
      return {
        code: 0,
        out: [
          'ShadowCode demo shell (browser preview)',
          '',
          '  ls [dir]        list files          cat <file>     show file',
          '  pwd             print directory     cd [dir]       change dir',
          '  echo <text>     print text          mkdir <dir>    make folder',
          '  touch <file>    create file         rm <path>      delete',
          '  date            current time        whoami         user',
          '  uname -a        system info         clear          clear screen',
          '  open <file>     open in Studio      ver            version',
          '',
          'Install the Android build for a real /system/bin/sh with git, node, python',
          'and any binary you place in the workspace.',
        ].join('\n'),
      }
    case 'pwd':
      return { code: 0, out: c }
    case 'cd': {
      const t = args[0] ? resolve(args[0]) : homeDir
      const dirs = (window as any).__scMkdirs || []
      if (t !== homeDir && !dirs.includes(t) && !fsListSync(t).length) return { code: 1, out: `cd: no such directory: ${args[0]}` }
      localStorage.setItem(CWD_KEY, t)
      return { code: 0, out: '' }
    }
    case 'ls': {
      const t = args[0] ? resolve(args[0]) : c
      const items = fsListSync(t)
      if (!items.length) return { code: 0, out: '' }
      return { code: 0, out: items.map((e) => (e.dir ? e.name + '/' : e.name)).join('   ') }
    }
    case 'cat': {
      if (!args[0]) return { code: 1, out: 'cat: missing file' }
      const v = localStorage.getItem(lsKey(resolve(args[0])))
      return v == null ? { code: 1, out: `cat: ${args[0]}: No such file` } : { code: 0, out: v }
    }
    case 'echo':
      return { code: 0, out: args.join(' ') }
    case 'mkdir':
      ;(window as any).__scMkdirs = [...((window as any).__scMkdirs || []), resolve(args[0] || '')]
      return { code: 0, out: '' }
    case 'touch':
      localStorage.setItem(lsKey(resolve(args[0] || 'untitled')), '')
      return { code: 0, out: '' }
    case 'rm': {
      const f = args.filter((a) => !a.startsWith('-'))
      f.forEach((p) => localStorage.removeItem(lsKey(resolve(p))))
      return { code: 0, out: '' }
    }
    case 'date':
      return { code: 0, out: new Date().toString() }
    case 'whoami':
      return { code: 0, out: 'shadow' }
    case 'uname':
      return { code: 0, out: 'ShadowCode web-preview (Android shell available in APK)' }
    case 'ver':
    case 'version':
      return { code: 0, out: 'ShadowCode 1.0.0' }
    case 'open':
      out.push(`open: ${args[0]} (use the Studio tab in the preview)`)
      return { code: 0, out: out.join('\n') }
    case 'clear':
      return { code: 0, out: '\x1b[2J\x1b[H' }
    case 'node':
    case 'python':
    case 'python3':
    case 'git':
    case 'npm':
    case 'pkg':
      return {
        code: 127,
        out: `${cmd}: not available in the browser preview.\nThe APK runs a real shell — drop a static ${cmd} binary in ~/bin and it works there.`,
      }
    default:
      return { code: 127, out: `sh: ${cmd}: not found (browser preview)` }
  }
}

function fsListSync(dir: string): FsEntry[] {
  const out: FsEntry[] = []
  const prefix = lsKey(dir) + '/'
  const seen = new Map<string, boolean>()
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || ''
    if (!k.startsWith(prefix)) continue
    const rest = k.slice(prefix.length)
    const first = rest.split('/')[0]
    if (!first) continue
    seen.set(first, seen.get(first) || rest.includes('/'))
  }
  for (const [name, isDir] of seen) {
    out.push({
      name,
      path: joinPath(dir, name),
      dir: isDir,
      size: isDir ? 0 : (localStorage.getItem(prefix + name) || '').length,
      mtime: 0,
    })
  }
  for (const d of (window as any).__scMkdirs || []) {
    if (d.startsWith(dir + '/')) {
      const n = d.slice(dir.length + 1).split('/')[0]
      if (n && !seen.has(n)) out.push({ name: n, path: joinPath(dir, n), dir: true, size: 0, mtime: 0 })
    }
  }
  return out.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1))
}
