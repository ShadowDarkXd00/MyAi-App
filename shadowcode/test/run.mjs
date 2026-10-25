/**
 * ShadowCode UI harness.
 *
 * Boots the production bundle inside jsdom against a fake native bridge, then
 *  1. walks every tab and asserts it renders without errors,
 *  2. drives onboarding → vault → provider → a tool-calling agent turn,
 *  3. checks the agent actually wrote a file and persisted the chat.
 *
 * Run: npm run test:ui
 */
import { JSDOM, VirtualConsole } from 'jsdom'
import fs from 'node:fs'
import { webcrypto } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const js = fs.readFileSync(resolve(root, '.tmp/app.iife.js'), 'utf8')
const css = fs.readFileSync(resolve(root, '.tmp/app.iife.css'), 'utf8')
const HOME = '/storage/emulated/0/Android/data/app.shadowcode/files/workspace'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

function makeBridge(win, FS, calls) {
  return {
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
      return JSON.stringify([...seen].map(([name, dir2]) => ({ name, path: prefix + name, dir: dir2, size: dir2 ? 0 : (FS.get(prefix + name) || '').length, mtime: 0 })))
    },
    fsRead: (p) => FS.get(p) ?? '',
    fsWrite: (p, d) => { FS.set(p, d); return true },
    fsDelete: (p) => { FS.delete(p); return true },
    fsMkdir: (p) => { FS.set(p, null); return true },
    fsExists: (p) => FS.has(p),
    exec: (id, cmd) => {
      calls.exec.push(cmd)
      setTimeout(() => win.__scExec(id, JSON.stringify({ code: 0, out: `ran: ${cmd}` })), 8)
    },
    httpStream: (id, reqJson) => {
      const req = JSON.parse(reqJson)
      calls.http.push(req.url)
      const body = JSON.parse(req.body)
      const followUp = body.messages.some((m) => m.role === 'tool')
      const frames = followUp
        ? [
            'data: {"choices":[{"delta":{"content":"Done — I wrote "}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"that file for you."},"finish_reason":"stop"}]}\n\n',
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
        if (i >= frames.length) return win.__scStream(id, 'end', '')
        win.__scStream(id, 'chunk', frames[i++])
        setTimeout(tick, 10)
      }
      setTimeout(tick, 10)
    },
    httpRequest: (id) => setTimeout(() => window.__scHttp(id, JSON.stringify({ status: 200, headers: {}, body: '{"ok":true}' })), 8),
    httpStop: () => {},
    toast: () => {}, vibrate: () => {}, copy: () => {}, share: () => {},
    openUrl: () => {}, keepAwake: () => {}, exitApp: () => {},
  }
}

async function boot(shared) {
  const sharedFS = shared?.FS
  const vc = new VirtualConsole()
  const errors = []
  vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message))
  vc.on('error', (...a) => errors.push('console.error: ' + a.map(String).join(' ')))
  vc.on('warn', () => {})
  const dom = new JSDOM(
    `<!doctype html><html lang="en" data-theme="dark"><head><style>${css}</style></head><body><div id="root"></div></body></html>`,
    { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc },
  )
  const { window } = dom
  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true })
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
  window.confirm = () => true
  window.prompt = (_m, def) => def
  window.localStorage.clear()
  if (shared?.localStorage) {
    for (const [k, v] of Object.entries(shared.localStorage)) window.localStorage.setItem(k, v)
  }
  const FS = sharedFS || new Map()
  const calls = shared?.calls || { exec: [], http: [] }
  window.ShadowNative = makeBridge(window, FS, calls)
  const script = window.document.createElement('script')
  script.textContent = js
  window.document.head.appendChild(script)
  await wait(800)
  const snapshot = () => {
    const out = {}
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      out[k] = window.localStorage.getItem(k)
    }
    return out
  }
  return { window, FS, calls, errors, snapshot }
}

const text = (w) => w.document.body.textContent.replace(/\s+/g, ' ')
const buttons = (w) => [...w.document.querySelectorAll('button')]
const find = (w, t, exact = false) => buttons(w).find((b) => (exact ? b.textContent.trim() === t : b.textContent.includes(t)))
const click = (b) => b && b.dispatchEvent(new b.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }))
async function waitFor(fn, timeout = 4000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const v = fn()
    if (v) return v
    await wait(50)
  }
  return null
}
const type = (w, el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
  el.dispatchEvent(new w.Event('input', { bubbles: true }))
}

/* ------------------------------------------------------------- suite 1 */
console.log('\n— screen walk —')
{
  const { window, errors } = await boot()
  check('onboarding renders', text(window).includes('Your AI'))
  click(find(window, 'Explore without keys'))
  await wait(600)
  check('chat home renders', text(window).includes('What are we'))
  for (const [label, nav] of [['studio', 'Studio'], ['terminal', 'Shell'], ['skills', 'Skills'], ['settings', 'Vault']]) {
    click(find(window, nav, true))
    await wait(500)
    check(`${label} tab renders`, text(window).length > 40)
    if (label === 'skills') check('skills catalog installed', text(window).includes('Full-Stack Builder'))
  }
  check('no runtime errors', errors.length === 0, errors[0])
}

/* ------------------------------------------------------------- suite 2 */
console.log('\n— onboarding → vault → agent turn —')
async function completeOnboarding(window, key = 'sk-test-1234567890', pinCode = '123456') {
  click(find(window, 'Set up my vault'))
  await waitFor(() => buttons(window).some((b) => b.className.includes('pinkey')))
  const pin = async (digits) => {
    for (const d of digits) {
      const key = await waitFor(() => buttons(window).find((b) => b.textContent.trim() === d && b.className.includes('pinkey')))
      click(key)
      await wait(60)
    }
  }
  await pin(pinCode)
  await waitFor(() => text(window).includes('Repeat your PIN'), 2500)
  check('PIN confirmation step', text(window).includes('Repeat your PIN'))
  await pin(pinCode)
  await waitFor(() => text(window).includes('Add your first key'), 2500)
  check('key step shown', text(window).includes('Add your first key'))
  type(window, window.document.querySelector('input[type="password"]'), key)
  await wait(120)
  click(find(window, 'Start building'))
  await waitFor(() => text(window).includes('1 key'), 2500)
}

{
  const first = await boot()
  const { window, FS, calls, errors } = first
  await completeOnboarding(window)
  check('chat ready with a key', text(window).includes('1 key'))

  type(window, window.document.querySelector('textarea'), 'Write a notes file please')
  await wait(100)
  click(window.document.querySelector('.sendbtn'))
  await wait(1500)
  check('streaming text rendered', text(window).includes('On it.'))
  check('tool approval requested', text(window).includes('Permission needed'))
  click(find(window, 'Allow', true))
  await wait(2200)
  check('agent wrote the file', FS.get(HOME + '/notes.md') === '# hello', String(FS.get(HOME + '/notes.md')))
  check('final answer streamed', text(window).includes('Done — I wrote that file'))
  check('two model round-trips', calls.http.length === 2, String(calls.http.length))
  check('chat persisted', !!FS.get(HOME + '/.shadowcode/app.json'))
  const stored = JSON.parse(FS.get(HOME + '/.shadowcode/app.json') || '{}')
  check('session stored', (stored.sessions || []).length === 1)
  // terminal round-trip through the native bridge
  click(find(window, 'Shell', true))
  await wait(400)
  const termInput = window.document.querySelector('.term-input')
  type(window, termInput, 'ls -la')
  await wait(80)
  termInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  await wait(600)
  check('terminal ran a command natively', text(window).includes('ran: ls -la'), calls.exec.join(','))
  check('no runtime errors', errors.length === 0, errors[0])

  /* ------------------------------------------------------- suite 3: vault */
  console.log('\n— encrypted vault round-trip —')
  await wait(700)
  const snap = first.snapshot()
  const blob = snap['shadowcode:vault']
  check('vault ciphertext written', !!blob)
  check('key never stored in plaintext', !!blob && !blob.includes('sk-test-1234567890'))
  const second = await boot({ FS, localStorage: snap, calls })
  const w2 = second.window
  check('locked screen shown on relaunch', text(w2).includes('Vault locked'))
  for (const d of '123456') {
    const key = await waitFor(() => buttons(w2).find((b) => b.textContent.trim() === d && b.className.includes('pinkey')))
    click(key)
    await wait(60)
  }
  const ok = await waitFor(() => text(w2).includes('1 key'), 4000)
  check('unlocked with PIN and restored providers', !!ok)
  check('wrong PIN rejected', await (async () => {
    const { window: w3 } = await boot({ FS, localStorage: snap, calls })
    for (const d of '000000') {
      const key = await waitFor(() => buttons(w3).find((b) => b.textContent.trim() === d && b.className.includes('pinkey')))
      click(key)
      await wait(50)
    }
    await wait(900)
    return text(w3).includes('Vault locked')
  })())
  check('vault suite clean', second.errors.length === 0, second.errors[0])
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`)
process.exit(failures === 0 ? 0 : 1)
