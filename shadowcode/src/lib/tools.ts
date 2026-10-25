import type { ToolCall, ToolResult, Skill } from './types'
import type { ToolSchema } from './providers'
import { absPath, exec, fsDelete, fsList, fsRead, fsWrite, fsMkdir, homeDir, httpRequest, isNative, relPath } from './bridge'
import { stripHtml, truncate } from './util'

export interface ToolDef {
  schema: ToolSchema
  risky: boolean
  label: (args: Record<string, unknown>) => string
  run: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<string>
}

export interface ToolCtx {
  workspace: string
  onPreview?: (html: string, name: string) => void
  installSkill?: (s: Skill) => void
}

const MAX_OUT = 16000

function guardPath(p: unknown): string {
  const s = String(p ?? '').trim()
  if (!s) throw new Error('A path is required.')
  if (s.includes('\0')) throw new Error('Invalid path.')
  const abs = absPath(s)
  if (!abs.startsWith(homeDir)) throw new Error(`Path must stay inside the workspace (${homeDir}).`)
  return abs
}

export const TOOLS: Record<string, ToolDef> = {
  terminal_run: {
    risky: true,
    schema: {
      name: 'terminal_run',
      description:
        'Run a shell command in the ShadowCode workspace on the device and return combined stdout/stderr. Use it to inspect files, run scripts, use git/node/python if present. Prefer non-interactive commands. Never run destructive commands (rm -rf /, mkfs, dd) — they will be refused.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute.' },
          cwd: { type: 'string', description: 'Optional working directory relative to the workspace.' },
        },
        required: ['command'],
      },
    },
    label: (a) => String(a.command || '').slice(0, 80),
    run: async (args, ctx) => {
      const cmd = String(args.command || '')
      if (/\b(mkfs|fdisk|dd\s+if=|rm\s+-rf\s+\/(\s|$)|:\(\)\s*\{)/.test(cmd))
        return 'Refused: that command is blocked for safety.'
      const cwd = args.cwd ? guardPath(args.cwd) : ctx.workspace
      const r = await exec(cmd, cwd, 60000)
      const out = `exit ${r.code}\n${r.out || '(no output)'}`
      return truncate(out, MAX_OUT)
    },
  },

  file_list: {
    risky: false,
    schema: {
      name: 'file_list',
      description: 'List files and folders inside the workspace. Path is relative to workspace root; use "." for root.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Directory path, e.g. "." or "src".' } },
      },
    },
    label: (a) => String(a.path || '.'),
    run: async (args, ctx) => {
      const p = args.path ? guardPath(args.path) : ctx.workspace
      const items = await fsList(p)
      if (!items.length) return `${relPath(p)} is empty.`
      return items.map((e) => `${e.dir ? 'dir ' : 'file'}  ${relPath(e.path)}${e.dir ? '' : `  (${e.size}b)`}`).join('\n')
    },
  },

  file_read: {
    risky: false,
    schema: {
      name: 'file_read',
      description: 'Read a UTF-8 text file from the workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    label: (a) => String(a.path || ''),
    run: async (args) => {
      const p = guardPath(args.path)
      const txt = await fsRead(p)
      if (!txt) return `(${relPath(p)} is empty or missing)`
      return truncate(txt, MAX_OUT)
    },
  },

  file_write: {
    risky: true,
    schema: {
      name: 'file_write',
      description:
        'Create or overwrite a text file in the workspace with the full content. Parent folders are created automatically. Always write complete file contents.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
    label: (a) => String(a.path || ''),
    run: async (args) => {
      const p = guardPath(args.path)
      const content = String(args.content ?? '')
      const ok = await fsWrite(p, content)
      return ok ? `Wrote ${content.length} chars to ${relPath(p)}` : `Failed to write ${relPath(p)}`
    },
  },

  file_append: {
    risky: true,
    schema: {
      name: 'file_append',
      description: 'Append text to the end of a file (creates it if missing).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    },
    label: (a) => String(a.path || ''),
    run: async (args) => {
      const p = guardPath(args.path)
      const prev = await fsRead(p)
      const ok = await fsWrite(p, prev + String(args.content ?? ''))
      return ok ? `Appended to ${relPath(p)}` : `Failed to append ${relPath(p)}`
    },
  },

  file_delete: {
    risky: true,
    schema: {
      name: 'file_delete',
      description: 'Delete a file or directory (recursively) inside the workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    label: (a) => String(a.path || ''),
    run: async (args) => {
      const p = guardPath(args.path)
      if (p === homeDir) return 'Refused: cannot delete the workspace root.'
      const ok = await fsDelete(p)
      return ok ? `Deleted ${relPath(p)}` : `Could not delete ${relPath(p)}`
    },
  },

  file_mkdir: {
    risky: false,
    schema: {
      name: 'file_mkdir',
      description: 'Create a directory in the workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    label: (a) => String(a.path || ''),
    run: async (args) => {
      const p = guardPath(args.path)
      await fsMkdir(p)
      return `Created ${relPath(p)}`
    },
  },

  web_fetch: {
    risky: false,
    schema: {
      name: 'web_fetch',
      description: 'Fetch a URL over HTTPS and return readable text (HTML is stripped). Use for docs and references.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    },
    label: (a) => String(a.url || '').slice(0, 60),
    run: async (args) => {
      const url = String(args.url || '')
      if (!/^https?:\/\//i.test(url)) return 'Only http(s) URLs are supported.'
      const res = await httpRequest({ url, method: 'GET', headers: { Accept: 'text/html,application/json' }, timeoutMs: 45000 })
      if (!res.status) return `Fetch failed: ${res.body.slice(0, 300)}`
      const body = /json/.test(res.headers['content-type'] || '') ? res.body : stripHtml(res.body)
      return `HTTP ${res.status}\n${truncate(body, 12000)}`
    },
  },

  preview_html: {
    risky: false,
    schema: {
      name: 'preview_html',
      description: 'Open an HTML file from the workspace in the built-in Browser/Preview panel so the user can see it.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    label: (a) => String(a.path || ''),
    run: async (args, ctx) => {
      const p = guardPath(args.path)
      const html = await fsRead(p)
      if (!html) return `No content in ${relPath(p)}`
      ctx.onPreview?.(html, relPath(p))
      return `Previewing ${relPath(p)}`
    },
  },

  skill_install: {
    risky: true,
    schema: {
      name: 'skill_install',
      description:
        'Install a reusable skill into the user\'s Skills library. Skills are system-prompt modules the user can enable on any chat. Provide a short name, one-line description and detailed instructions.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          instructions: { type: 'string' },
          icon: { type: 'string', description: 'One of: sparkles, code, palette, bug, terminal, book, chart, shield, bolt, wand' },
        },
        required: ['name', 'description', 'instructions'],
      },
    },
    label: (a) => String(a.name || ''),
    run: async (args, ctx) => {
      const name = String(args.name || 'Skill').slice(0, 60)
      const skill: Skill = {
        id: 'sk_' + Date.now().toString(36),
        name,
        desc: String(args.description || '').slice(0, 160),
        icon: String(args.icon || 'sparkles'),
        category: 'Installed',
        prompt: String(args.instructions || ''),
        enabled: true,
        author: 'ShadowCode agent',
        version: '1.0.0',
        createdAt: Date.now(),
      }
      ctx.installSkill?.(skill)
      return `Installed skill "${name}". The user can toggle it in Skills.`
    },
  },
}

/* ---------------------------------------------------------- schema helpers */
export function activeToolSchemas(skillIds: string[], allSkills: Skill[]): ToolSchema[] {
  const allow = new Set<string>()
  let restricted = false
  for (const s of allSkills) {
    if (!skillIds.includes(s.id)) continue
    if (!Array.isArray(s.tools)) continue
    restricted = true
    for (const t of s.tools) allow.add(t)
  }
  // A skill that declares a tool list narrows the toolkit; otherwise all tools are on.
  const names = restricted ? [...allow] : Object.keys(TOOLS)
  return names.filter((n) => TOOLS[n]).map((n) => TOOLS[n].schema)
}

export function toolLabel(name: string): string {
  const map: Record<string, string> = {
    terminal_run: 'Terminal',
    file_list: 'List files',
    file_read: 'Read file',
    file_write: 'Write file',
    file_append: 'Append file',
    file_delete: 'Delete',
    file_mkdir: 'New folder',
    web_fetch: 'Fetch web',
    preview_html: 'Preview',
    skill_install: 'Install skill',
  }
  return map[name] || name
}

export async function executeTool(call: ToolCall, ctx: ToolCtx): Promise<ToolResult> {
  const started = Date.now()
  const def = TOOLS[call.name]
  if (!def) return { id: call.id, name: call.name, ok: false, output: `Unknown tool "${call.name}"`, ms: 0 }
  try {
    const out = await def.run(call.args || {}, ctx)
    return { id: call.id, name: call.name, ok: true, output: out, ms: Date.now() - started }
  } catch (e: any) {
    return { id: call.id, name: call.name, ok: false, output: String(e?.message || e), ms: Date.now() - started }
  }
}

export async function workspaceSnapshot(dir: string, depth = 2, max = 60): Promise<string> {
  const lines: string[] = []
  async function walk(p: string, d: number, prefix: string) {
    if (lines.length > max || d > depth) return
    const items = await fsList(p)
    for (const it of items.slice(0, 40)) {
      if (it.name.startsWith('.')) continue
      lines.push(`${prefix}${it.name}${it.dir ? '/' : ''}`)
      if (it.dir) await walk(it.path, d + 1, prefix + '  ')
    }
  }
  await walk(dir, 0, '')
  return lines.length ? lines.join('\n') : '(workspace is empty)'
}

export const shellAvailable = isNative
