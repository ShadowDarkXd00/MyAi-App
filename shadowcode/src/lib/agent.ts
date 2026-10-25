import type { ChatMessage, Provider, Settings, Skill, ToolCall, ToolResult } from './types'
import { abortChat, chatStream, type ToolSchema } from './providers'
import { TOOLS, activeToolSchemas, executeTool, toolLabel, type ToolCtx } from './tools'
import { uid } from './util'

export interface AgentHooks {
  onReasoning?: (delta: string) => void
  onText: (delta: string) => void
  onToolStart?: (call: ToolCall, index: number) => void
  onToolEnd?: (result: ToolResult) => void
  requestApproval: (call: ToolCall) => Promise<boolean>
  isStopped: () => boolean
  onStep?: (step: number) => void
  onStatus?: (s: string) => void
}

export interface AgentArgs {
  provider: Provider
  model: string
  settings: Settings
  skills: Skill[]
  systemPrompt: string
  history: ChatMessage[]
  userText: string
  hooks: AgentHooks
  streamId: string
  toolCtx: ToolCtx
}

export interface AgentResult {
  text: string
  stopped: boolean
  steps: number
  error?: string
  toolResults: ToolResult[]
}

export const BASE_SYSTEM = `You are ShadowCode — a hands-on AI engineering agent running inside the user's Android device.

You are not a chatbot. You work in the user's real workspace and you finish the job:
- Prefer ACTION over explanation: inspect the project, write the files, run the command, then report.
- Use the tools you are given. Never claim you did something you did not do.
- Keep replies compact and scannable. Use short paragraphs, bullets and fenced code.
- When you create or edit web files, call preview_html so the user sees the result.
- If a command fails, read the error and fix it — do not just report failure.
- Never invent file contents, outputs or URLs. Check first.
- Respect the user's device: no destructive commands, no exfiltration of secrets. If a task needs an API key you don't have, say exactly which key to add in Vault.
- Skills the user enabled are binding instructions for how you should behave.

Formatting: Markdown, no giant headings, no emoji spam. Code blocks always get a language tag.`

export function buildSystemPrompt(opts: {
  settings: Settings
  skills: Skill[]
  enabledTools: ToolSchema[]
  workspaceNote: string
  providerName?: string
  model?: string
}): string {
  const parts = [BASE_SYSTEM]
  const skillBlock = opts.skills.filter((s) => s.prompt?.trim())
  if (skillBlock.length) {
    parts.push(
      `# Active skills\nThe user installed these skills. Follow them precisely.\n` +
        skillBlock.map((s) => `## ${s.name}\n${s.desc ? s.desc + '\n' : ''}${s.prompt}`).join('\n\n'),
    )
  }
  if (opts.enabledTools.length) {
    parts.push(
      `# Tools\nAvailable: ${opts.enabledTools.map((t) => t.name).join(', ')}.\nWorkspace root: ${opts.workspaceNote}\nAll file paths are relative to the workspace root. Use terminal_run for anything the file tools cannot do.`,
    )
  } else {
    parts.push('# Tools\nNo tools are available in this chat; answer from knowledge only and be explicit about it.')
  }
  if (opts.settings.systemExtra?.trim()) parts.push(`# User preferences\n${opts.settings.systemExtra.trim()}`)
  if (opts.model) parts.push(`# Runtime\nModel: ${opts.model}${opts.providerName ? ` via ${opts.providerName}` : ''}. Date: ${new Date().toDateString()}.`)
  return parts.join('\n\n')
}

export async function runAgent(args: AgentArgs): Promise<AgentResult> {
  const { provider, model, settings, hooks, streamId } = args
  const toolResults: ToolResult[] = []
  const toolSchemas = settings.autoApprove.includes('__notools')
    ? []
    : activeToolSchemas(args.skills.map((s) => s.id), args.skills)

  const wire: ChatMessage[] = [
    { role: 'system', content: args.systemPrompt },
    ...args.history,
    { role: 'user', content: args.userText },
  ]

  let fullText = ''
  let steps = 0
  const maxSteps = Math.max(1, Math.min(12, settings.maxSteps || 4))

  for (let step = 0; step < maxSteps; step++) {
    steps = step + 1
    hooks.onStep?.(steps)
    if (hooks.isStopped()) return { text: fullText, stopped: true, steps, toolResults }

    let stepText = ''
    const calls: ToolCall[] = []
    let error: string | undefined

    const gen = chatStream({
      provider,
      model,
      messages: wire,
      tools: toolSchemas,
      temperature: settings.temperature,
      stream: settings.streaming,
      streamId,
    })

    for await (const ev of gen) {
      if (hooks.isStopped()) {
        abortChat(streamId)
        break
      }
      if (ev.type === 'text') {
        stepText += ev.delta
        fullText += ev.delta
        hooks.onText(ev.delta)
      } else if (ev.type === 'reasoning') {
        if (settings.showReasoning) hooks.onReasoning?.(ev.delta)
      } else if (ev.type === 'done') {
        calls.push(...ev.toolCalls)
      } else if (ev.type === 'error') {
        error = ev.message
      }
    }

    if (error) {
      return { text: fullText, stopped: hooks.isStopped(), steps, error, toolResults }
    }
    if (hooks.isStopped()) return { text: fullText, stopped: true, steps, toolResults }

    const usable = calls.filter((c) => c.name && TOOLS[c.name])
    if (!usable.length) {
      return { text: fullText, stopped: false, steps, toolResults }
    }

    wire.push({ role: 'assistant', content: stepText, toolCalls: usable })

    for (let i = 0; i < usable.length; i++) {
      const call = usable[i]
      if (hooks.isStopped()) break
      hooks.onToolStart?.(call, i)
      const needsApproval = TOOLS[call.name].risky && !settings.autoApprove.includes(call.name)
      let allowed = true
      if (needsApproval) allowed = await hooks.requestApproval(call)
      let result: ToolResult
      if (!allowed) {
        result = {
          id: call.id,
          name: call.name,
          ok: false,
          output: 'The user denied this action. Ask before retrying or choose another approach.',
          ms: 0,
        }
      } else {
        hooks.onStatus?.(`Running ${toolLabel(call.name)}…`)
        result = await executeTool(call, args.toolCtx)
      }
      toolResults.push(result)
      hooks.onToolEnd?.(result)
      wire.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: result.ok ? result.output : `ERROR: ${result.output}`,
      })
    }
  }

  return { text: fullText, stopped: false, steps, toolResults, error: undefined }
}

export function newStreamId() {
  return uid('s')
}
