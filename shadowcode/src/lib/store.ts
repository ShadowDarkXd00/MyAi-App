import { create } from 'zustand'
import type {
  Approval, ChatMessage, Msg, Project, Provider, Session, Settings, Skill, ToolCall, ToolResult,
} from './types'
import {
  exec, fsList, fsMkdir, fsRead, fsWrite, homeDir, isNative, pickSave, relPath, vault, deviceInfo,
} from './bridge'
import { buildSystemPrompt, newStreamId, runAgent, type AgentHooks } from './agent'
import { activeToolSchemas, workspaceSnapshot } from './tools'
import { mergeCatalog, parseSkillFile } from './skills'
import { titleFrom, truncate, uid, safeJson, looseJson } from './util'
import { abortChat } from './providers'

export type Tab = 'chat' | 'studio' | 'terminal' | 'skills' | 'settings'

export const ACCENTS = [
  { id: 'aurora', name: 'Aurora', a1: '#7c5cff', a2: '#22d3ee' },
  { id: 'ember', name: 'Ember', a1: '#ff7a45', a2: '#ff2e93' },
  { id: 'mint', name: 'Mint', a1: '#10b981', a2: '#67e8f9' },
  { id: 'rose', name: 'Rose', a1: '#f43f5e', a2: '#fb923c' },
  { id: 'ocean', name: 'Ocean', a1: '#3b82f6', a2: '#8b5cf6' },
  { id: 'gold', name: 'Gold', a1: '#f59e0b', a2: '#facc15' },
] as const

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: 'aurora',
  radius: 24,
  fontScale: 1,
  streaming: true,
  maxSteps: 4,
  temperature: 0.7,
  systemExtra: '',
  autoApprove: ['file_read', 'file_list', 'file_mkdir', 'web_fetch', 'preview_html'],
  showReasoning: true,
  activeProviderId: null,
  activeModel: null,
  autoTitle: true,
  haptics: true,
  termFontSize: 12,
  onboarded: false,
  autoLockMinutes: 5,
  includeWorkspaceContext: true,
}

interface LiveCall {
  call: ToolCall
  result?: ToolResult
  status: 'running' | 'ok' | 'error' | 'denied'
}

export interface LiveRun {
  sessionId: string
  msgId: string
  step: number
  status: string
  calls: LiveCall[]
  reasoning: string
}

export interface Toast {
  id: string
  msg: string
  kind?: 'ok' | 'bad' | 'info'
}

interface State {
  booted: boolean
  settings: Settings
  sessions: Session[]
  messages: Record<string, Msg[]>
  skills: Skill[]
  providers: Provider[]
  vaultExists: boolean
  vaultLocked: boolean
  currentSessionId: string | null
  tab: Tab
  busy: boolean
  live: LiveRun | null
  approvals: Approval[]
  toasts: Toast[]
  preview: { html: string; name: string } | null
  projects: Project[]
  online: boolean
  boot: () => Promise<void>
  setTab: (t: Tab) => void
  patchSettings: (p: Partial<Settings>) => void
  toast: (msg: string, kind?: Toast['kind']) => void
  dismissToast: (id: string) => void
  newSession: (opts?: { skillIds?: string[] }) => string
  selectSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  send: (text: string) => Promise<void>
  stop: () => void
  approve: (id: string, allow: boolean, always?: boolean) => void
  unlockVault: (pin: string) => Promise<boolean>
  createVault: (pin: string) => Promise<boolean>
  lockVault: () => void
  changePin: (pin: string) => Promise<boolean>
  setProviders: (p: Provider[]) => void
  upsertProvider: (p: Provider) => void
  removeProvider: (id: string) => void
  toggleSkill: (id: string) => void
  installSkill: (s: Skill) => void
  importSkillText: (text: string, name?: string) => Promise<boolean>
  removeSkill: (id: string) => void
  updateSkill: (id: string, patch: Partial<Skill>) => void
  setPreview: (html: string, name: string) => void
  exportBackup: () => Promise<void>
  clearChats: () => Promise<void>
  seedWorkspace: () => Promise<void>
}

/* ------------------------------------------------------------- persistence */
const DIR = '.shadowcode'
const APP_FILE = `${DIR}/app.json`
const CHAT_DIR = `${DIR}/chats`
const LS_KEY = 'shadowcode:app'

const stopFlags = new Map<string, boolean>()
let currentStreamId: string | null = null
const approvalResolvers = new Map<string, (v: boolean) => void>()

let saveTimer: any = null
function schedulePersist(get: () => State) {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => persistNow(get), 450)
}

async function persistNow(get: () => State) {
  const s = get()
  const payload = {
    v: 1,
    settings: s.settings,
    sessions: s.sessions,
    skills: s.skills,
    projects: s.projects,
    currentSessionId: s.currentSessionId,
  }
  const text = JSON.stringify(payload)
  if (!isNative) localStorage.setItem(LS_KEY, text)
  try {
    await fsMkdir(DIR)
    await fsMkdir(CHAT_DIR)
    await fsWrite(APP_FILE, text)
  } catch {
    /* ignore */
  }
}

export async function persistSession(sessionId: string, msgs: Msg[]) {
  const capped = msgs.slice(-80).map((m) => ({ ...m, content: truncate(m.content, 60000) }))
  try {
    await fsMkdir(CHAT_DIR)
    await fsWrite(`${CHAT_DIR}/${sessionId}.json`, JSON.stringify(capped))
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ store */
export const useStore = create<State>((set, get) => ({
  booted: false,
  settings: DEFAULT_SETTINGS,
  sessions: [],
  messages: {},
  skills: [],
  providers: [],
  vaultExists: false,
  vaultLocked: true,
  currentSessionId: null,
  tab: 'chat',
  busy: false,
  live: null,
  approvals: [],
  toasts: [],
  preview: null,
  projects: [],
  online: true,

  boot: async () => {
    let settings = DEFAULT_SETTINGS
    let sessions: Session[] = []
    let skills: Skill[] = []
    let projects: Project[] = []
    let currentSessionId: string | null = null

    const raw = isNative ? await fsRead(APP_FILE) : localStorage.getItem(LS_KEY) || ''
    const parsed = raw ? looseJson<any>(raw) : null
    if (parsed) {
      settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) }
      sessions = Array.isArray(parsed.sessions) ? parsed.sessions : []
      skills = Array.isArray(parsed.skills) ? parsed.skills : []
      projects = Array.isArray(parsed.projects) ? parsed.projects : []
      currentSessionId = parsed.currentSessionId || null
    }

    const messages: Record<string, Msg[]> = {}
    for (const s of sessions.slice(0, 30)) {
      const txt = isNative ? await fsRead(`${CHAT_DIR}/${s.id}.json`) : ''
      if (txt) messages[s.id] = safeJson<Msg[]>(txt, [])
    }

    set({
      settings,
      sessions,
      messages,
      skills: mergeCatalog(skills),
      projects,
      vaultExists: vault.exists(),
      vaultLocked: true,
      booted: true,
      currentSessionId,
    })

    applyTheme(settings)
    if (currentSessionId && !sessions.find((s) => s.id === currentSessionId)) set({ currentSessionId: sessions[0]?.id || null })
    schedulePersist(get)
  },

  setTab: (t) => set({ tab: t }),

  patchSettings: (p) => {
    const settings = { ...get().settings, ...p }
    set({ settings })
    applyTheme(settings)
    schedulePersist(get)
  },

  toast: (msg, kind = 'info') => {
    const id = uid('t')
    set({ toasts: [...get().toasts.slice(-2), { id, msg, kind }] })
    setTimeout(() => get().dismissToast(id), 3000)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  newSession: (opts) => {
    const settings = get().settings
    const session: Session = {
      id: uid('c'),
      title: 'New chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      providerId: settings.activeProviderId,
      model: settings.activeModel,
      skillIds: opts?.skillIds || [],
      workspace: homeDir,
    }
    set({ sessions: [session, ...get().sessions], currentSessionId: session.id, tab: 'chat' })
    schedulePersist(get)
    return session.id
  },

  selectSession: (id) => {
    set({ currentSessionId: id, tab: 'chat' })
    schedulePersist(get)
  },

  deleteSession: (id) => {
    const sessions = get().sessions.filter((s) => s.id !== id)
    const messages = { ...get().messages }
    delete messages[id]
    set({
      sessions,
      messages,
      currentSessionId: get().currentSessionId === id ? sessions[0]?.id || null : get().currentSessionId,
    })
    fsWrite(`${CHAT_DIR}/${id}.json`, '').catch(() => {})
    schedulePersist(get)
  },

  renameSession: (id, title) => {
    set({ sessions: get().sessions.map((s) => (s.id === id ? { ...s, title } : s)) })
    schedulePersist(get)
  },

  send: async (text) => {
    const s = get()
    const settings = s.settings
    const trimmed = text.trim()
    if (!trimmed || s.busy) return

    const provider = s.providers.find((p) => p.id === settings.activeProviderId) || s.providers[0]
    if (!provider) {
      s.toast('Add an API key in Vault first', 'bad')
      set({ tab: 'settings' })
      return
    }
    const model = settings.activeModel || provider.models[0]
    if (!model) {
      s.toast('No model selected', 'bad')
      return
    }

    const sessionId = s.currentSessionId || get().newSession()
    const session = get().sessions.find((x) => x.id === sessionId)!
    const history = get().messages[sessionId] || []

    const userMsg: Msg = { id: uid('m'), role: 'user', content: trimmed, ts: Date.now() }
    const aiMsg: Msg = {
      id: uid('a'), role: 'assistant', content: '', ts: Date.now(), model,
      toolCalls: [], toolResults: [],
    }
    const prevHistory: ChatMessage[] = history
      .filter((m) => m.role !== 'system' && m.content)
      .slice(-14)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const sessions = get().sessions.map((x) =>
      x.id === sessionId
        ? {
            ...x,
            updatedAt: Date.now(),
            title:
              settings.autoTitle && (x.title === 'New chat' || !x.title)
                ? titleFrom(trimmed)
                : x.title,
            providerId: provider.id,
            model,
          }
        : x,
    )

    set({
      sessions,
      messages: { ...get().messages, [sessionId]: [...history, userMsg, aiMsg] },
      busy: true,
      live: { sessionId, msgId: aiMsg.id, step: 1, status: 'Thinking…', calls: [], reasoning: '' },
      currentSessionId: sessionId,
      tab: 'chat',
    })

    const activeSkills = get().skills.filter((sk) => (session.skillIds || []).includes(sk.id) && sk.enabled)
    const toolSchemas = activeToolSchemas(activeSkills.map((x) => x.id), get().skills)

    let workspaceNote = relPath(homeDir)
    if (settings.includeWorkspaceContext) {
      const snap = await workspaceSnapshot(homeDir, 2, 40)
      if (snap && !snap.startsWith('(workspace')) workspaceNote += `\n\nWorkspace tree:\n${snap}`
    }

    const systemPrompt = buildSystemPrompt({
      settings,
      skills: activeSkills,
      enabledTools: toolSchemas,
      workspaceNote,
      providerName: provider.name,
      model,
    })

    const streamId = newStreamId()
    currentStreamId = streamId
    stopFlags.set(sessionId, false)

    // batched text flushing keeps typing smooth on device
    let pending = ''
    let flushTimer: any = null
    const flush = () => {
      if (!pending) return
      const delta = pending
      pending = ''
      const msgs = get().messages[sessionId] || []
      set({
        messages: {
          ...get().messages,
          [sessionId]: msgs.map((m) => (m.id === aiMsg.id ? { ...m, content: m.content + delta } : m)),
        },
      })
    }
    const queueText = (d: string) => {
      pending += d
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = null
          flush()
        }, 45)
      }
    }

    const hooks: AgentHooks = {
      onText: queueText,
      onReasoning: (d) => {
        const live = get().live
        if (live) set({ live: { ...live, reasoning: (live.reasoning + d).slice(-6000) } })
      },
      onToolStart: (call) => {
        const live = get().live
        if (!live) return
        set({ live: { ...live, status: `Using ${call.name}…`, calls: [...live.calls, { call, status: 'running' }] } })
      },
      onToolEnd: (result) => {
        const live = get().live
        if (!live) return
        set({
          live: {
            ...live,
            status: 'Thinking…',
            calls: live.calls.map((c) =>
              c.call.id === result.id ? { ...c, result, status: result.ok ? 'ok' : 'error' } : c,
            ),
          },
        })
      },
      requestApproval: (call) =>
        new Promise<boolean>((resolve) => {
          const id = uid('ap')
          approvalResolvers.set(id, resolve)
          set({ approvals: [...get().approvals, { id, name: call.name, args: call.args, sessionId }] })
        }),
      isStopped: () => !!stopFlags.get(sessionId),
      onStep: (step) => {
        const live = get().live
        if (live) set({ live: { ...live, step } })
      },
      onStatus: (status) => {
        const live = get().live
        if (live) set({ live: { ...live, status } })
      },
    }

    let finalError: string | undefined
    let stopped = false
    try {
      const res = await runAgent({
        provider,
        model,
        settings,
        skills: activeSkills,
        systemPrompt,
        history: prevHistory,
        userText: trimmed,
        hooks,
        streamId,
        toolCtx: {
          workspace: homeDir,
          onPreview: (html, name) => {
            set({ preview: { html, name } })
            get().toast(`Preview ready · ${name}`, 'ok')
          },
          installSkill: (sk) => get().installSkill(sk),
        },
      })
      finalError = res.error
      stopped = res.stopped
      flush()
      const live = get().live
      const calls = live?.calls.filter((c) => c.result) || []
      const msgs = get().messages[sessionId] || []
      set({
        messages: {
          ...get().messages,
          [sessionId]: msgs.map((m) =>
            m.id === aiMsg.id
              ? {
                  ...m,
                  toolCalls: calls.map((c) => c.call),
                  toolResults: calls.map((c) => c.result!),
                  error: !!finalError,
                  stopped: res.stopped,
                  content:
                    m.content ||
                    (finalError
                      ? ''
                      : res.stopped
                        ? '_Stopped._'
                        : calls.length
                          ? '_Done — updated the workspace._'
                          : '_No content returned._'),
                }
              : m,
          ),
        },
      })
    } catch (e: any) {
      finalError = String(e?.message || e)
    } finally {
      clearTimeout(flushTimer)
      flush()
      stopFlags.delete(sessionId)
      if (finalError) {
        const msgs = get().messages[sessionId] || []
        set({
          messages: {
            ...get().messages,
            [sessionId]: msgs.map((m) =>
              m.id === aiMsg.id ? { ...m, error: true, content: m.content || '' } : m,
            ),
          },
        })
        get().toast(friendlyError(finalError), 'bad')
      }
      currentStreamId = null
      set({ busy: false, live: null, approvals: [] })
      const finalMsgs = get().messages[sessionId] || []
      void persistSession(sessionId, finalMsgs)
      schedulePersist(get)
      void stopped
    }
  },

  stop: () => {
    const id = get().currentSessionId
    if (!id) return
    stopFlags.set(id, true)
    if (currentStreamId) abortChat(currentStreamId)
    get().toast('Stopped', 'info')
  },

  approve: (id, allow, always) => {
    const ap = get().approvals.find((a) => a.id === id)
    const fn = approvalResolvers.get(id)
    if (always && ap) {
      const cur = get().settings.autoApprove
      get().patchSettings({ autoApprove: [...new Set([...cur, ap.name])] })
    }
    approvalResolvers.delete(id)
    set({ approvals: get().approvals.filter((a) => a.id !== id) })
    fn?.(allow)
  },

  unlockVault: async (pin) => {
    const data = await vault.unlockAsync(pin)
    if (!data) return false
    vault.rememberPin(pin)
    const providers = (data.providers || []).filter(Boolean)
    const settings = { ...get().settings }
    if (!settings.activeProviderId || !providers.find((p) => p.id === settings.activeProviderId)) {
      settings.activeProviderId = providers[0]?.id || null
      settings.activeModel = providers[0]?.models[0] || null
    }
    set({ providers, vaultLocked: false, vaultExists: true, settings })
    applyTheme(settings)
    schedulePersist(get)
    return true
  },

  createVault: async (pin) => {
    const ok = vault.create(pin, { providers: [] })
    vault.rememberPin(pin)
    try {
      await fsMkdir(DIR)
      await fsWrite(`${DIR}/.vaultmarker`, JSON.stringify({ created: Date.now(), device: deviceInfo.model }))
    } catch {
      /* ignore */
    }
    set({ vaultExists: true, vaultLocked: false, providers: [] })
    return ok
  },

  lockVault: () => {
    vault.lock()
    set({ vaultLocked: true, providers: [] })
  },

  changePin: async (pin) => {
    const ok = vault.changePin(pin)
    if (ok) vault.rememberPin(pin)
    return ok
  },

  setProviders: (providers) => {
    set({ providers })
    vault.save({ providers })
  },

  upsertProvider: (p) => {
    const providers = get().providers.some((x) => x.id === p.id)
      ? get().providers.map((x) => (x.id === p.id ? p : x))
      : [...get().providers, p]
    set({ providers })
    vault.save({ providers })
    const settings = { ...get().settings }
    if (!settings.activeProviderId) {
      settings.activeProviderId = p.id
      settings.activeModel = p.models[0] || null
      set({ settings })
      applyTheme(settings)
    }
    schedulePersist(get)
  },

  removeProvider: (id) => {
    const providers = get().providers.filter((p) => p.id !== id)
    set({ providers })
    vault.save({ providers })
    const settings = { ...get().settings }
    if (settings.activeProviderId === id) {
      settings.activeProviderId = providers[0]?.id || null
      settings.activeModel = providers[0]?.models[0] || null
      set({ settings })
    }
    schedulePersist(get)
  },

  toggleSkill: (id) => {
    const skills = get().skills.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    set({ skills })
    schedulePersist(get)
  },

  installSkill: (sk) => {
    const exists = get().skills.find((s) => s.id === sk.id || s.name.toLowerCase() === sk.name.toLowerCase())
    const skills = exists
      ? get().skills.map((s) => (s.id === exists.id ? { ...sk, id: exists.id, enabled: true } : s))
      : [...get().skills, { ...sk, enabled: true }]
    set({ skills })
    const cur = get().currentSessionId
    if (cur) {
      const sessions = get().sessions.map((s) =>
        s.id === cur && !s.skillIds.includes(exists?.id || sk.id)
          ? { ...s, skillIds: [...s.skillIds, exists?.id || sk.id] }
          : s,
      )
      set({ sessions })
    }
    schedulePersist(get)
    get().toast(`Installed “${sk.name}”`, 'ok')
  },

  importSkillText: async (text, name) => {
    const sk = parseSkillFile(text, name)
    if (!sk) {
      get().toast('Could not read that skill file', 'bad')
      return false
    }
    get().installSkill(sk)
    return true
  },

  removeSkill: (id) => {
    set({ skills: get().skills.filter((s) => s.id !== id) })
    schedulePersist(get)
  },

  updateSkill: (id, patch) => {
    set({ skills: get().skills.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
    schedulePersist(get)
  },

  setPreview: (html, name) => set({ preview: { html, name } }),

  exportBackup: async () => {
    const s = get()
    const payload = {
      app: 'ShadowCode',
      v: 1,
      exportedAt: new Date().toISOString(),
      settings: s.settings,
      sessions: s.sessions,
      skills: s.skills,
      projects: s.projects,
      messages: s.messages,
      providers: [], // never export secrets
    }
    await pickSave(JSON.stringify(payload, null, 2), `shadowcode-backup-${new Date().toISOString().slice(0, 10)}.json`)
    get().toast('Backup exported (keys excluded)', 'ok')
  },

  clearChats: async () => {
    set({ messages: {}, sessions: [] })
    try {
      const items = await fsList(CHAT_DIR)
      for (const it of items) await fsWrite(it.path, '')
    } catch {
      /* ignore */
    }
    schedulePersist(get)
    get().toast('All chats cleared', 'ok')
  },

  seedWorkspace: async () => {
    try {
      const existing = await fsList(homeDir)
      if (existing.filter((e) => !e.name.startsWith('.')).length > 0) return
      await fsMkdir('starter')
      await fsWrite('starter/index.html', STARTER_HTML)
      await fsWrite('starter/style.css', STARTER_CSS)
      await fsWrite('README.md', STARTER_README)
    } catch {
      /* ignore */
    }
  },
}))

/* ------------------------------------------------------------------ theme */
export function applyTheme(settings: Settings) {
  const root = document.documentElement
  try {
    ;(window as any).ShadowNative?.setSystemBars?.(settings.theme)
  } catch {
    /* browser */
  }
  root.dataset.theme = settings.theme
  const accent = ACCENTS.find((a) => a.id === settings.accent) || ACCENTS[0]
  root.style.setProperty('--a1', accent.a1)
  root.style.setProperty('--a2', accent.a2)
  root.style.setProperty('--r-lg', `${Math.round(settings.radius * 0.8)}px`)
  root.style.setProperty('--r-xl', `${settings.radius}px`)
  root.style.setProperty('--r-md', `${Math.round(settings.radius * 0.72)}px`)
  document.body.style.fontSize = `${15 * (settings.fontScale || 1)}px`
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', settings.theme === 'dark' ? '#06070b' : '#f3f4f9')
}

function friendlyError(raw: string): string {
  if (/401|invalid_api_key|authentication/i.test(raw)) return 'Key rejected (401). Check it in Vault.'
  if (/429|rate limit|quota/i.test(raw)) return 'Rate limited or out of quota. Try again shortly.'
  if (/404|model/i.test(raw) && /not found/i.test(raw)) return 'Model not found — check the model id.'
  if (/Unable to resolve host|Failed to fetch|network/i.test(raw)) return 'Network unreachable. Check the endpoint.'
  return truncate(raw.split('\n')[0], 140)
}

export { exec }

/* -------------------------------------------------------------- starter kit */
const STARTER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Starter — built with ShadowCode</title>
<link rel="stylesheet" href="style.css" />
</head>
<body>
  <main class="shell">
    <div class="card">
      <div class="orb"></div>
      <h1>Make something <span>incredible</span></h1>
      <p>This file lives in your ShadowCode workspace. Ask the agent to change it — the preview updates instantly.</p>
      <div class="row">
        <button id="go">Say hello</button>
        <span id="out" class="out"></span>
      </div>
    </div>
  </main>
  <script>
    const out = document.getElementById('out')
    document.getElementById('go').addEventListener('click', () => {
      out.textContent = 'Hello from your device 👋'
      out.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.22,1.2,.36,1)' })
    })
  </script>
</body>
</html>
`

const STARTER_CSS = `:root {
  --a1: #7c5cff;
  --a2: #22d3ee;
  --ink: #eef0f7;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ink);
  background:
    radial-gradient(60% 50% at 20% 0%, rgba(124,92,255,.34), transparent 60%),
    radial-gradient(55% 45% at 90% 20%, rgba(34,211,238,.26), transparent 60%),
    #08090f;
}
.shell { padding: 22px; width: 100%; max-width: 460px; }
.card {
  position: relative;
  overflow: hidden;
  padding: 30px 26px;
  border-radius: 30px;
  border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.05);
  backdrop-filter: blur(24px);
  box-shadow: 0 30px 70px -30px rgba(0,0,0,.9);
}
.orb {
  position: absolute; right: -50px; top: -60px; width: 190px; height: 190px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--a1), var(--a2));
  filter: blur(38px); opacity: .55;
}
h1 { position: relative; margin: 0 0 10px; font-size: 28px; letter-spacing: -.03em; line-height: 1.15; }
h1 span { background: linear-gradient(120deg, var(--a1), var(--a2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
p { position: relative; margin: 0 0 22px; color: #a8aec1; font-size: 14.5px; line-height: 1.6; }
.row { position: relative; display: flex; align-items: center; gap: 14px; }
button {
  height: 46px; padding: 0 22px; border: 0; border-radius: 999px; cursor: pointer;
  font-weight: 650; font-size: 14px; color: #fff;
  background: linear-gradient(135deg, var(--a1), var(--a2));
  box-shadow: 0 14px 30px -14px rgba(124,92,255,.9);
  transition: transform .18s cubic-bezier(.22,1.2,.36,1);
}
button:active { transform: scale(.95); }
.out { font-size: 13px; color: #9fe7d8; }
`

const STARTER_README = `# Welcome to ShadowCode

This folder is your workspace. Everything here lives on your device.

## Useful things to try
- Ask the agent: *"build me a landing page for a coffee shop"* — it will write files and open a preview.
- Switch to **Studio** to edit files with syntax highlighting.
- Switch to **Terminal** to run real shell commands.
- Open **Skills** and enable *Interface Designer* before your next UI task.
- Add more providers in **Vault** (Settings → Providers).

## Folders
- \`starter/\` — a tiny demo page
- \`.shadowcode/\` — app data (chats, settings). Leave it alone.
`
