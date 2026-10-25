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
window.localStorage.clear()
const script = window.document.createElement('script')
script.textContent = js
window.document.head.appendChild(script)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
await wait(900)

function clickText(t, exact = false) {
  const btns = [...window.document.querySelectorAll('button')]
  const hit = btns.find((b) => (exact ? b.textContent.trim() === t : b.textContent.includes(t)))
  if (!hit) return false
  hit.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  return true
}
const bodyText = () => window.document.body.textContent.replace(/\s+/g, ' ').trim()
const show = (label) => console.log(`\n### ${label}\n` + bodyText().slice(0, 700))

show('ONBOARD')
console.log('clicked explore:', clickText('Explore without keys'))
await wait(700)
show('CHAT HOME')

for (const [label, nav] of [['STUDIO', 'Studio'], ['TERMINAL', 'Shell'], ['SKILLS', 'Skills'], ['SETTINGS', 'Vault']]) {
  const ok = clickText(nav, true)
  await wait(600)
  console.log(`\n### ${label} (click ${nav}: ${ok})`)
  console.log(bodyText().slice(0, 900))
}

console.log('\n--- ERRORS ---')
console.log(errors.length ? [...new Set(errors)].join('\n').slice(0, 3000) : '(none)')
process.exit(0)
