import './lib/polyfills'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { installCrashHandlers, renderFallback, report } from './lib/diagnostics'
import './styles.css'

installCrashHandlers()

const host = document.getElementById('root')
if (!host) {
  document.body.innerHTML = '<pre style="color:#fff;padding:20px">ShadowCode: #root missing</pre>'
} else {
  try {
    createRoot(host).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (e: any) {
    report('error', `mount failed: ${e?.stack || e}`)
    renderFallback('ShadowCode failed to mount', String(e?.stack || e))
  }
}
