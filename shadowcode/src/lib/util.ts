export function uid(prefix = ''): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function fmtBytes(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function fmtTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const same = d.toDateString() === now.toDateString()
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (same) return t
  const diff = now.getTime() - ts
  if (diff < 7 * 864e5) return d.toLocaleDateString([], { weekday: 'short' }) + ' ' + t
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n))
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function truncate(s: string, n: number) {
  if (s.length <= n) return s
  return s.slice(0, n) + `… (${s.length - n} more chars)`
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function guessLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', json: 'json',
    html: 'html', htm: 'html', css: 'css', md: 'markdown', py: 'python',
    sh: 'bash', bash: 'bash', txt: 'text', yml: 'yaml', yaml: 'yaml',
    rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', c: 'c', cpp: 'cpp',
    sql: 'sql', xml: 'xml', svg: 'xml', toml: 'toml', env: 'ini',
  }
  return map[ext] || 'text'
}

export function fileIcon(name: string): string {
  const lang = guessLang(name)
  return lang
}

export function bytesOf(s: string) {
  return new Blob([s]).size
}

export function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

/** Extract a JSON object from a possibly noisy model/tool string. */
export function looseJson<T = Record<string, unknown>>(s: string): T | null {
  if (!s) return null
  const t = s.trim()
  try {
    return JSON.parse(t)
  } catch {
    /* continue */
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) {
    try {
      return JSON.parse(fence[1].trim())
    } catch {
      /* continue */
    }
  }
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1))
    } catch {
      /* continue */
    }
  }
  return null
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function titleFrom(text: string): string {
  const clean = text.replace(/[#*`>\n\r]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!clean) return 'New chat'
  const words = clean.split(' ').slice(0, 7).join(' ')
  return words.length > 46 ? words.slice(0, 46) + '…' : words
}
