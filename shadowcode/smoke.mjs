import { JSDOM, VirtualConsole } from 'jsdom'
import fs from 'node:fs'
import { webcrypto } from 'node:crypto'

const js = fs.readFileSync('/tmp/app.iife.js', 'utf8')
const css = fs.readFileSync('/tmp/app.iife.css', 'utf8')

const vc = new VirtualConsole()
const errors = []
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message + (e.detail ? '\n' + e.detail : '')))
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')))
vc.on('warn', (...a) => { /* ignore react warnings */ })
vc.on('log', (...a) => console.log('[log]', ...a.map(String)))

const html = `<!doctype html><html lang="en" data-theme="dark"><head><style>${css}</style></head><body><div id="root"></div></body></html>`
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: vc,
})
const { window } = dom
Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true })
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }))
window.HTMLElement.prototype.scrollIntoView = () => {}
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
window.localStorage.clear()

const script = window.document.createElement('script')
script.textContent = js
window.document.head.appendChild(script)

await new Promise((r) => setTimeout(r, 1200))
const text = window.document.body.textContent.replace(/\s+/g, ' ').trim()
console.log('--- TEXT ---')
console.log(text.slice(0, 1200))
console.log('--- ERRORS ---')
console.log(errors.length ? errors.join('\n---\n').slice(0, 4000) : '(none)')
console.log('--- ROOT CHILDREN ---', window.document.getElementById('root').children.length)
console.log('--- BTN COUNT ---', window.document.querySelectorAll('button').length)
process.exit(0)
