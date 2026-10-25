/**
 * End-to-end harness: boots the real bundle against a fake native bridge so the
 * store → agent → tools → providers pipeline is exercised without a device.
 */
import { JSDOM, VirtualConsole } from 'jsdom'
import fs from 'node:fs'
import { webcrypto } from 'node:crypto'

const js = fs.readFileSync('/tmp/app.iife.js', 'utf8')
const css = fs.readFileSync('/tmp/app.iife.css', 'utf8')
const vc = new VirtualConsole()
const errors = []
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message))
vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')))
vc.on('warn', () => {})
const html = `<!doctype html><html lang="en" data-theme="dark"><head><style>${css}</style></head><body><div id="root"></div></body></html>`
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc })
const { window } = dom
Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true })
window.HTMLElement.prototype.scrollIntoView = () => {}
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
window.confirm = () => true
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------ fake native bridge */
const FS = new Map()
const HOME = '/storage/emulated/0/Android/data/app.shadowcode/files/workspace'
const calls = { http: [], exec: [] }
window.ShadowNative = {
  ping: () => 'pong',
  deviceInfo: () => JSON.stringify({ model: 'Pixel Test', android: '15', sdk: 35, pkg: 'app.shadowcode', native: true, home: HOME }),
  homePath: () => HOME,
  setSystemBars: () => {},
  fsList: (dir) => {
    const prefix = dir.replace(/\/$/, '') + '/'
    const seen = new Map()
    for (const k of FS.keys()) {
      if (!k.startsWith(prefix)) continue
      const rest = k.slice(prefix.length)
      const first = rest.split('/')[0]
      seen.set(first, rest.includes('/') || FS.get(k) === null)
    }
    return JSON.stringify([...seen].map(([name, dir]) => ({ name, path: prefix + name, dir, size: dir ? 0 : (FS.get(prefix + name) || '').length, mtime: 0 })))
  },
  fsRead: (p) => FS.get(p) ?? '',
  fsWrite: (p, d) => { FS.set(p, d); return true },
  fsDelete: (p) => { FS.delete(p); return true },
  fsMkdir: (p) => { FS.set(p, null); return true },
  fsExists: (p) => FS.has(p),
  exec: (id, cmd, cwd, timeout) => {
    calls.exec.push(cmd)
    setTimeout(() => window.__scExec(id, JSON.stringify({ code: 0, out: `ran: ${cmd}` })), 10)
  },
  httpStream: (id, reqJson) => {
    const req = JSON.parse(reqJson)
    calls.http.push(req)
    const body = JSON.parse(req.body)
    const hasToolResult = body.messages.some((m) => m.role === 'tool')
    const chunks = hasToolResult
      ? [
          'data: {"choices":[{"delta":{"content":"Done — I wrote "}}]}\n\n',
          'data: {"choices":[{"delta":{"content":"the file."},"finish_reason":"stop"}]}\n\n',
          'data: [DONE]\n\n',
        ]
      : [
          'data: {"choices":[{"delta":{"content":"On it. "}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"file_write","arguments":"{\\"path\\":\\"notes.md\\","}}]}}]}\n\n',
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"content\\":\\"# hello\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
          'data: [DONE]\n\n',
        ]
    let i = 0
    const tick = () => {
      if (i >= chunks.length) return window.__scStream(id, 'end', '')
      window.__scStream(id, 'chunk', chunks[i++])
      setTimeout(tick, 12)
    }
    setTimeout(tick, 12)
  },
  httpRequest: (id, reqJson) => {
    setTimeout(() => window.__scHttp(id, JSON.stringify({ status: 200, headers: {}, body: '{"ok":true}' })), 10)
  },
  httpStop: () => {},
  toast: () => {},
  vibrate: () => {},
  copy: () => {},
  share: () => {},
  openUrl: () => {},
  keepAwake: () => {},
  exitApp: () => {},
}

const script = window.document.createElement('script')
script.textContent = js
window.document.head.appendChild(script)
await wait(900)

const btns = () => [...window.document.querySelectorAll('button')]
const findBtn = (t, exact = false) => btns().find((b) => (exact ? b.textContent.trim() === t : b.textContent.includes(t)))
const click = (b) => b && b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
const txt = () => window.document.body.textContent.replace(/\s+/g, ' ')

function typeInto(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

/* ------------------------------------------------------------- onboarding */
console.log('step1 intro:', !!findBtn('Set up my vault'))
click(findBtn('Set up my vault'))
await wait(300)
// PIN pad: click digit buttons by text
const pressPin = async (pin) => {
  for (const d of pin) {
    const b = btns().find((x) => x.textContent.trim() === d && x.className.includes('pinkey'))
    click(b)
    await wait(30)
  }
  await wait(300)
}
await pressPin('123456')
console.log('step2 pin entered, now confirm screen:', txt().includes('Repeat your PIN'))
await pressPin('123456')
await wait(300)
console.log('step3 key screen:', txt().includes('Add your first key'))
const keyInput = window.document.querySelector('input[type="password"]')
typeInto(keyInput, 'sk-test-1234567890')
await wait(200)
click(findBtn('Start building'))
await wait(900)
console.log('chat visible:', txt().includes('What are we'))
console.log('providers in top bar:', txt().includes('1 key'))

/* ------------------------------------------------------------------ chat */
const ta = window.document.querySelector('textarea')
typeInto(ta, 'Write a notes file please')
await wait(120)
const sendBtn = window.document.querySelector('.sendbtn')
click(sendBtn)
await wait(1800)
// approve the pending tool
console.log('approval card:', txt().includes('Permission needed'))
click(findBtn('Allow', true))
await wait(2200)

console.log('\n--- CHAT TRANSCRIPT ---')
console.log(txt().slice(0, 1400))
console.log('\n--- native exec calls ---', calls.exec)
console.log('--- fs keys ---', [...FS.keys()].filter((k) => !k.includes('.shadowcode')))
const notes = FS.get(HOME + '/notes.md')
console.log('--- notes.md content ---', JSON.stringify(notes))
console.log('--- http requests ---', calls.http.length, calls.http.map((r) => r.url))
console.log('--- tool result message in body ---', txt().includes('terminal') || txt().includes('Write file'))

/* ------------------------------------------------------- persistence */
await wait(700)
console.log('\n--- persisted app.json ---')
const app = FS.get(HOME + '/.shadowcode/app.json')
const parsed = app ? JSON.parse(app) : null
console.log(parsed ? { sessions: parsed.sessions.length, skills: parsed.skills.length, hasSettings: !!parsed.settings, provider: parsed.settings.activeProviderId } : 'MISSING')

console.log('\n--- ERRORS ---')
console.log(errors.length ? [...new Set(errors)].join('\n').slice(0, 2000) : '(none)')
process.exit(0)
