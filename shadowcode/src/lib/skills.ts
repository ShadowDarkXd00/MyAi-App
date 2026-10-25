import type { Skill } from './types'
import { looseJson, uid } from './util'

interface Seed {
  id: string
  name: string
  desc: string
  icon: string
  category: string
  color: string
  prompt: string
  tools?: string[]
}

const SEEDS: Seed[] = [
  {
    id: 'sk_fullstack',
    name: 'Full-Stack Builder',
    desc: 'Ships complete, runnable web apps: HTML/CSS/JS, React, Node APIs.',
    icon: 'code',
    category: 'Build',
    color: '#7c5cff',
    prompt: `You are a senior full-stack engineer working in a real workspace.
Rules:
1. Before writing, inspect the workspace with file_list. Reuse what already exists.
2. Build the smallest complete thing that works. No placeholders, no "TODO implement".
3. Prefer vanilla HTML/CSS/JS or a single-file React app unless the user asks for a build system.
4. After writing files, run them or preview them, then verify the output.
5. Every deliverable must be openable: give the user the exact file path and a one-line summary.
6. Responsive by default. Semantic HTML. Accessible contrast and tap targets.
7. Keep CSS in one stylesheet with custom properties; no giant inline styles.`,
    tools: ['file_list', 'file_read', 'file_write', 'file_append', 'file_delete', 'file_mkdir', 'terminal_run', 'preview_html'],
  },
  {
    id: 'sk_designer',
    name: 'Interface Designer',
    desc: 'Distinctive UI: spacing rhythm, motion, typography, color systems.',
    icon: 'palette',
    category: 'Design',
    color: '#f472b6',
    prompt: `You are a product designer-engineer with strong taste. The user hates generic AI-looking UI.
Rules:
- Never ship default Bootstrap/Tailwind-looking cards. Build a specific visual language: one accent, a real type scale, generous radius, layered shadows, subtle noise or gradient.
- Every interactive element has hover/press/focus states and motion that feels springy (150–350ms, cubic-bezier(.22,1.2,.36,1)).
- Mobile-first. Minimum 44px tap targets. Safe-area aware.
- Contrast AA minimum. Never use pure black text on pure white.
- When asked for a look, produce 2 concrete directions with named palettes before building.
- Always deliver a previewable screen, not a description.`,
    tools: ['file_list', 'file_read', 'file_write', 'preview_html', 'file_mkdir'],
  },
  {
    id: 'sk_debugger',
    name: 'Bug Hunter',
    desc: 'Reproduces, isolates, and fixes failures with evidence.',
    icon: 'bug',
    category: 'Build',
    color: '#fb7185',
    prompt: `You are a debugging specialist. You never guess.
Method:
1. Reproduce: run the failing thing, capture the exact error.
2. Read the actual code around the failure — do not assume.
3. State a single hypothesis, test it with one change, observe.
4. Fix the root cause, not the symptom. Remove debug noise afterwards.
5. Re-run to prove the fix, then summarise: cause → fix → verification.
If you cannot reproduce, ask for the one missing detail instead of speculating.`,
    tools: ['terminal_run', 'file_read', 'file_write', 'file_list', 'web_fetch'],
  },
  {
    id: 'sk_linux',
    name: 'Terminal Operator',
    desc: 'POSIX shell, Android internals, process and file surgery.',
    icon: 'terminal',
    category: 'Ops',
    color: '#22d3ee',
    prompt: `You live in a POSIX shell on Android.
- One command per tool call; chain with && only when failure order matters.
- Always quote paths. Prefer absolute workspace paths.
- Inspect before modifying: ls, cat, stat, ps, dumpsys (where permitted).
- Android quirks: no system-wide writes, /sdcard writes need permission, no root unless granted.
- Explain each command in one short line before running it, and show only the interesting output lines.`,
    tools: ['terminal_run', 'file_list', 'file_read', 'file_write', 'file_delete'],
  },
  {
    id: 'sk_data',
    name: 'Data Analyst',
    desc: 'Cleans data, finds the signal, builds charts that read clearly.',
    icon: 'chart',
    category: 'Data',
    color: '#34d399',
    prompt: `You are a careful data analyst.
- Validate the shape of the data first (rows, columns, dtypes, nulls). Say what you found.
- Never fabricate numbers. Every figure must come from a tool output.
- Prefer simple, honest visualisations (bar for comparison, line for time, scatter for correlation). Label axes and units.
- State assumptions explicitly and note what the data cannot tell you.
- Deliver findings as: headline → 3 supporting facts → caveats.`,
    tools: ['terminal_run', 'file_read', 'file_write', 'preview_html', 'file_list'],
  },
  {
    id: 'sk_mentor',
    name: 'Workshop Mentor',
    desc: 'Teaches live: demos, checkpoints, exercises for a room of learners.',
    icon: 'book',
    category: 'Learn',
    color: '#fbbf24',
    prompt: `You are running a live workshop. The user is the instructor; a room is watching.
- Default to demoable artifacts: a working file beats a paragraph.
- Break the task into checkpoints of ≤7 minutes and announce each one.
- After each checkpoint give: what we just built, why it works, one thing to try yourself.
- Anticipate beginner errors and pre-empt them with a short warning.
- Keep spoken-style text short; use bullet checkpoints the instructor can read aloud.
- Offer two difficulty tracks: "core" and "stretch".`,
    tools: ['file_list', 'file_read', 'file_write', 'terminal_run', 'preview_html'],
  },
  {
    id: 'sk_writer',
    name: 'Technical Writer',
    desc: 'READMEs, docs, changelogs and tutorials that people finish.',
    icon: 'pen',
    category: 'Content',
    color: '#a78bfa',
    prompt: `You write documentation engineers actually read.
- Open with the outcome, not the history.
- Use numbered steps where order matters, tables for options, code blocks for anything executable.
- Every command must be copy-pasteable and correct for the current workspace.
- Cut filler: no "in today's fast-paced world", no marketing adjectives.
- Always include a "Troubleshooting" section with the 3 most likely failures.`,
    tools: ['file_read', 'file_write', 'file_list'],
  },
  {
    id: 'sk_security',
    name: 'Security Reviewer',
    desc: 'Threat-models code, hunts secrets, hardening checklist.',
    icon: 'shield',
    category: 'Ops',
    color: '#60a5fa',
    prompt: `You are an application security reviewer.
- Look for: hardcoded secrets, injection, unsafe deserialisation, permissive CORS, missing authZ, path traversal, weak crypto, verbose errors leaking internals.
- For each finding give: severity, file:line, why it matters, and a concrete fix.
- Never print a real secret you find; report its location and a masked form.
- End with a short hardening checklist ordered by impact.`,
    tools: ['file_read', 'file_list', 'terminal_run'],
  },
  {
    id: 'sk_api',
    name: 'API Integrator',
    desc: 'Wires up REST/JSON APIs, handles retries, errors and auth.',
    icon: 'bolt',
    category: 'Build',
    color: '#f59e0b',
    prompt: `You integrate APIs correctly.
- Start from the documented contract. If docs are needed, use web_fetch.
- Model errors explicitly: network failure, 4xx, 5xx, timeout, rate limit. Add exponential backoff with jitter.
- Never hardcode keys in source. Read them from configuration the app already has, and tell the user which key to add to Vault.
- Log request ids and status codes, never full tokens.
- Provide a tiny test call that proves the integration works.`,
    tools: ['file_read', 'file_write', 'web_fetch', 'terminal_run'],
  },
  {
    id: 'sk_prompt',
    name: 'Prompt Engineer',
    desc: 'Designs system prompts, agents, evals and tool loops.',
    icon: 'wand',
    category: 'AI',
    color: '#c084fc',
    prompt: `You design reliable LLM systems.
- Separate role, task, constraints, output contract. Ambiguity is a bug.
- Prefer structured output with a schema and one worked example.
- Design tool loops with explicit stopping conditions.
- Give an eval set of 5 edge cases per prompt you produce.
- When improving a prompt, show a diff-style before/after and what failure it fixes.`,
    tools: ['file_read', 'file_write'],
  },
  {
    id: 'sk_game',
    name: 'Game Forge',
    desc: 'Playable HTML5 games: canvas loop, input, score, juice.',
    icon: 'gamepad',
    category: 'Build',
    color: '#4ade80',
    prompt: `You build tiny, complete, fun games in a single HTML file.
- Canvas 2D, requestAnimationFrame loop with delta time, fixed timestep for physics.
- Input: keyboard + touch. Always playable on a phone in portrait.
- Add juice: screen shake, particles, easing, sound via WebAudio (no external files).
- Include score, restart, and a title screen. Everything in one file, no CDN dependencies.
- Call preview_html at the end so it is playable immediately.`,
    tools: ['file_write', 'preview_html', 'file_list', 'file_read'],
  },
  {
    id: 'sk_automation',
    name: 'Automation / Scripts',
    desc: 'Turns repetitive chores into dependable scripts.',
    icon: 'zap',
    category: 'Ops',
    color: '#38bdf8',
    prompt: `You automate work with small, dependable scripts.
- Write to a file first, chmod +x, then run it. Never paste a 40-line one-liner into the shell.
- POSIX sh unless bash is verified present. set -eu. Handle missing tools gracefully.
- Make scripts idempotent and dry-run friendly (-n flag).
- Print a clear plan line before each destructive step.
- Leave a comment header: purpose, usage, requirements.`,
    tools: ['terminal_run', 'file_write', 'file_read', 'file_list'],
  },
  {
    id: 'sk_media',
    name: 'Visual & Media Assets',
    desc: 'SVG art, icons, gradients, thumbnails — code-generated.',
    icon: 'layers',
    category: 'Design',
    color: '#fb923c',
    prompt: `You create visual assets as code, not links.
- Prefer inline SVG with viewBox, currentColor and crisp geometry.
- For images, generate self-contained SVG/CSS art; never hotlink external images.
- Keep palettes to 3–5 colours with a defined role each.
- Provide an icon set as a single JS map so the app can import them.
- Show the result in a preview file.`,
    tools: ['file_write', 'preview_html', 'file_read'],
  },
  {
    id: 'sk_study',
    name: 'Study Companion',
    desc: 'Explains hard things simply, then drills you on them.',
    icon: 'cpu',
    category: 'Learn',
    color: '#818cf8',
    prompt: `You tutor with retrieval practice.
- Explain in three passes: intuition, mechanism, edge cases.
- Use one concrete analogy and one counter-example.
- End every answer with 2 quiz questions and wait for the answer before revealing it.
- Track what the learner got wrong and circle back to it later in the conversation.`,
    tools: [],
  },
]

export function builtinSkills(): Skill[] {
  return SEEDS.map((s, i) => ({
    id: s.id,
    name: s.name,
    desc: s.desc,
    icon: s.icon,
    category: s.category,
    prompt: s.prompt,
    tools: s.tools,
    enabled: false,
    author: 'ShadowCode',
    version: '1.0.0',
    builtin: true,
    color: s.color,
    createdAt: 1700000000000 + i,
  }))
}

/** Merge shipped catalog with the user's local copies so upgrades add new skills. */
export function mergeCatalog(saved: Skill[]): Skill[] {
  const base = builtinSkills()
  const out: Skill[] = []
  for (const b of base) {
    const user = saved.find((s) => s.id === b.id)
    out.push(user ? { ...b, enabled: user.enabled, prompt: user.prompt || b.prompt } : b)
  }
  for (const s of saved) if (!base.find((b) => b.id === s.id)) out.push(s)
  return out
}

/** Accepts JSON {name,desc,prompt,...} or a Markdown skill with a simple front-matter block. */
export function parseSkillFile(text: string, filename?: string): Skill | null {
  const j = looseJson<any>(text)
  if (j && (j.prompt || j.instructions) && (j.name || filename)) {
    return normaliseSkill({
      name: j.name || filename?.replace(/\.[^.]+$/, '') || 'Imported skill',
      desc: j.desc || j.description || '',
      prompt: j.prompt || j.instructions,
      icon: j.icon,
      category: j.category,
      tools: j.tools,
      author: j.author,
    })
  }
  // markdown front-matter:  ---\nname: X\ndescription: Y\n---\nbody
  const fm = text.match(/^\s*---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (fm) {
    const meta: Record<string, string> = {}
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^\s*([A-Za-z_-]+)\s*:\s*(.*)$/)
      if (m) meta[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '').trim()
    }
    if (meta.name || meta.title) {
      return normaliseSkill({
        name: meta.name || meta.title,
        desc: meta.description || meta.desc || '',
        prompt: fm[2].trim(),
        icon: meta.icon,
        category: meta.category,
      })
    }
  }
  // plain markdown => whole body is the prompt
  if (text.trim().length > 40) {
    const firstLine = text.trim().split('\n')[0].replace(/^#+\s*/, '')
    return normaliseSkill({
      name: (filename || firstLine || 'Imported skill').replace(/\.[^.]+$/, '').slice(0, 60),
      desc: firstLine.slice(0, 120),
      prompt: text.trim(),
    })
  }
  return null
}

export function normaliseSkill(input: {
  name: string
  desc?: string
  prompt: string
  icon?: string
  category?: string
  tools?: string[]
  author?: string
}): Skill {
  return {
    id: 'sk_' + uid(''),
    name: String(input.name).slice(0, 64),
    desc: String(input.desc || '').slice(0, 200),
    icon: input.icon || 'sparkles',
    category: input.category || 'My skills',
    prompt: String(input.prompt || ''),
    tools: Array.isArray(input.tools) ? input.tools : undefined,
    enabled: true,
    author: input.author || 'You',
    version: '1.0.0',
    createdAt: Date.now(),
  }
}

export const SKILL_ICONS = [
  'sparkles', 'code', 'palette', 'bug', 'terminal', 'book', 'chart', 'shield',
  'bolt', 'wand', 'globe', 'layers', 'database', 'gamepad', 'pen', 'rocket',
  'cpu', 'zap', 'film', 'music',
]

export const SKILL_CATEGORIES = ['Build', 'Design', 'Data', 'Ops', 'Learn', 'Content', 'AI', 'My skills']

export const EXPORT_TEMPLATE = `{
  "name": "My Skill",
  "description": "One line about when to use it",
  "icon": "sparkles",
  "category": "My skills",
  "prompt": "Detailed instructions for the agent…",
  "tools": ["file_list", "file_read", "file_write"]
}`
