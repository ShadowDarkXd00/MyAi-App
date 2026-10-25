import type { ChatEvent, ChatMessage, Provider, ToolCall } from './types'
import { httpAbort, httpRequest, httpStream, type HttpResponse } from './bridge'

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ChatOptions {
  provider: Provider
  model: string
  messages: ChatMessage[]
  tools: ToolSchema[]
  temperature: number
  stream: boolean
  streamId: string
  maxTokens?: number
}

/* ------------------------------------------------------------------ presets */
export interface ProviderPreset {
  id: string
  name: string
  kind: 'openai' | 'anthropic' | 'gemini'
  baseUrl: string
  models: string[]
  keyHint: string
  docs: string
  color: string
}

export const PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
    keyHint: 'sk-…',
    docs: 'platform.openai.com/api-keys',
    color: '#10a37f',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-sonnet-4-20250514', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
    keyHint: 'sk-ant-…',
    docs: 'console.anthropic.com',
    color: '#d97757',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    keyHint: 'AIza…',
    docs: 'aistudio.google.com/apikey',
    color: '#4285f4',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'anthropic/claude-sonnet-4',
      'openai/gpt-4o',
      'google/gemini-2.5-flash',
      'deepseek/deepseek-chat',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    keyHint: 'sk-or-…',
    docs: 'openrouter.ai/keys',
    color: '#8b5cf6',
  },
  {
    id: 'groq',
    name: 'Groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'qwen/qwen3-32b', 'openai/gpt-oss-120b'],
    keyHint: 'gsk_…',
    docs: 'console.groq.com/keys',
    color: '#f55036',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyHint: 'sk-…',
    docs: 'platform.deepseek.com',
    color: '#4d6bfe',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    models: ['mistral-large-latest', 'codestral-latest'],
    keyHint: '…',
    docs: 'console.mistral.ai',
    color: '#ff7000',
  },
  {
    id: 'together',
    name: 'Together AI',
    kind: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-Coder-32B-Instruct'],
    keyHint: '…',
    docs: 'api.together.ai',
    color: '#0f6fff',
  },
  {
    id: 'ollama',
    name: 'Ollama / LM Studio',
    kind: 'openai',
    baseUrl: 'http://127.0.0.1:11434/v1',
    models: ['qwen2.5-coder:7b', 'llama3.2:3b'],
    keyHint: 'not needed',
    docs: 'ollama.com',
    color: '#22d3ee',
  },
  {
    id: 'custom',
    name: 'Custom endpoint',
    kind: 'openai',
    baseUrl: 'https://',
    models: [],
    keyHint: 'api key or token',
    docs: '',
    color: '#94a3b8',
  },
]

export function providerColor(p?: Provider | null): string {
  if (!p) return '#7c5cff'
  return PRESETS.find((x) => x.id === p.preset)?.color || '#7c5cff'
}

/* ------------------------------------------------------------------ helpers */
function trimBase(u: string) {
  return (u || '').replace(/\/+$/, '')
}

function toOpenAiMessages(msgs: ChatMessage[]) {
  const out: any[] = []
  for (const m of msgs) {
    if (m.role === 'assistant') {
      const item: any = { role: 'assistant', content: m.content || '' }
      if (m.toolCalls?.length) {
        item.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
        }))
        if (!m.content) item.content = null
      }
      out.push(item)
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content })
    } else if (m.role === 'system') {
      out.push({ role: 'system', content: m.content })
    } else {
      out.push({ role: 'user', content: m.content })
    }
  }
  return out
}

function toAnthropicMessages(msgs: ChatMessage[]) {
  const out: any[] = []
  for (const m of msgs) {
    if (m.role === 'system') continue
    if (m.role === 'user') out.push({ role: 'user', content: [{ type: 'text', text: m.content }] })
    else if (m.role === 'assistant') {
      const blocks: any[] = []
      if (m.content) blocks.push({ type: 'text', text: m.content })
      for (const tc of m.toolCalls || [])
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args ?? {} })
      out.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '…' }] })
    } else if (m.role === 'tool') {
      const prev = out[out.length - 1]
      const block = {
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: m.content.slice(0, 24000) || '(no output)',
      }
      if (prev && prev.role === 'user' && Array.isArray(prev.content) && prev.content[0]?.type === 'tool_result') {
        prev.content.push(block)
      } else {
        out.push({ role: 'user', content: [block] })
      }
    }
  }
  return out
}

function toGeminiContents(msgs: ChatMessage[]) {
  const out: any[] = []
  for (const m of msgs) {
    if (m.role === 'system') continue
    if (m.role === 'user') out.push({ role: 'user', parts: [{ text: m.content }] })
    else if (m.role === 'assistant') {
      const parts: any[] = []
      if (m.content) parts.push({ text: m.content })
      for (const tc of m.toolCalls || []) parts.push({ functionCall: { name: tc.name, args: tc.args ?? {} } })
      if (parts.length) out.push({ role: 'model', parts })
    } else if (m.role === 'tool') {
      out.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: m.name || 'tool',
              response: { result: m.content.slice(0, 24000) || '(no output)' },
            },
          },
        ],
      })
    }
  }
  return out
}

function cleanSchema(s: any): any {
  if (Array.isArray(s)) return s.map(cleanSchema)
  if (s && typeof s === 'object') {
    const out: any = {}
    for (const [k, v] of Object.entries(s)) {
      if (k === 'additionalProperties' || k === '$schema') continue
      out[k] = cleanSchema(v)
    }
    return out
  }
  return s
}

function geminiTools(tools: ToolSchema[]) {
  return tools.length
    ? [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: cleanSchema(t.parameters),
          })),
        },
      ]
    : undefined
}

/* ---------------------------------------------------------------- SSE utils */
class LineSplitter {
  private buf = ''
  push(chunk: string, cb: (line: string) => void) {
    this.buf += chunk
    let idx: number
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).replace(/\r$/, '')
      this.buf = this.buf.slice(idx + 1)
      cb(line)
    }
  }
  flush(cb: (line: string) => void) {
    if (this.buf.trim()) cb(this.buf)
    this.buf = ''
  }
}

interface Q<T> {
  push: (v: T) => void
  end: () => void
  fail: (e: string) => void
  iter: AsyncGenerator<T>
}

function makeQueue<T>(): Q<T> {
  const items: T[] = []
  let done = false
  let resolve: (() => void) | null = null
  const wake = () => {
    resolve?.()
    resolve = null
  }
  return {
    push(v) {
      items.push(v)
      wake()
    },
    end() {
      done = true
      wake()
    },
    fail(e) {
      items.push({ type: 'error', message: e } as unknown as T)
      done = true
      wake()
    },
    iter: (async function* () {
      for (;;) {
        if (items.length) {
          yield items.shift()!
          continue
        }
        if (done) return
        await new Promise<void>((r) => (resolve = r))
      }
    })() as AsyncGenerator<T>,
  }
}

/* ==================================================================== main */
export async function* chatStream(opts: ChatOptions): AsyncGenerator<ChatEvent> {
  const q = makeQueue<ChatEvent>()
  try {
    if (opts.provider.kind === 'anthropic') runAnthropic(opts, q)
    else if (opts.provider.kind === 'gemini') runGemini(opts, q)
    else runOpenAi(opts, q)
  } catch (e: any) {
    q.fail(String(e?.message || e))
  }
  yield* q.iter
}

export function abortChat(streamId: string) {
  httpAbort(streamId)
}

/* --------------------------------------------------------------- OpenAI */
function runOpenAi(opts: ChatOptions, q: Q<ChatEvent>) {
  const base = trimBase(opts.provider.baseUrl || 'https://api.openai.com/v1')
  const url = `${base}/chat/completions`
  const body: any = {
    model: opts.model,
    messages: toOpenAiMessages(opts.messages),
    temperature: opts.temperature,
    stream: opts.stream,
  }
  if (opts.maxTokens) body.max_tokens = opts.maxTokens
  if (opts.tools.length) {
    body.tools = opts.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }))
    body.tool_choice = 'auto'
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.provider.key || 'none'}`,
  }
  if (/openrouter\.ai/.test(base)) {
    headers['HTTP-Referer'] = 'https://shadowcode.app'
    headers['X-Title'] = 'ShadowCode'
  }

  if (!opts.stream) {
    httpRequest({ url, method: 'POST', headers, body: JSON.stringify(body), timeoutMs: 180000 }).then((res) => {
      const j = parseJson(res)
      if (!j) {
        q.fail(errText(res))
        q.end()
        return
      }
      const msg = j.choices?.[0]?.message
      if (msg?.content) q.push({ type: 'text', delta: String(msg.content) })
      if (msg?.reasoning_content) q.push({ type: 'reasoning', delta: String(msg.reasoning_content) })
      const calls: ToolCall[] = (msg?.tool_calls || []).map((tc: any, i: number) => ({
        id: tc.id || `call_${i}`,
        name: tc.function?.name || 'unknown',
        args: safeParse(tc.function?.arguments),
        raw: tc.function?.arguments,
      }))
      q.push({ type: 'done', toolCalls: calls, stopReason: j.choices?.[0]?.finish_reason, usage: j.usage })
      q.end()
    })
    return
  }

  const splitter = new LineSplitter()
  const acc: Record<number, { id: string; name: string; args: string }> = {}
  let stopReason = ''

  const handle = (line: string) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') return
    let j: any
    try {
      j = JSON.parse(payload)
    } catch {
      return
    }
    if (j.error) {
      q.fail(j.error.message || JSON.stringify(j.error))
      return
    }
    const ch = j.choices?.[0]
    if (!ch) return
    const d = ch.delta || {}
    if (typeof d.content === 'string' && d.content) q.push({ type: 'text', delta: d.content })
    const reasoning = d.reasoning_content || d.reasoning || d.thinking
    if (typeof reasoning === 'string' && reasoning && opts.stream) q.push({ type: 'reasoning', delta: reasoning })
    if (Array.isArray(d.tool_calls)) {
      for (const tc of d.tool_calls) {
        const i = typeof tc.index === 'number' ? tc.index : 0
        acc[i] = acc[i] || { id: tc.id || `call_${i}`, name: '', args: '' }
        if (tc.id) acc[i].id = tc.id
        if (tc.function?.name) acc[i].name += tc.function.name
        if (tc.function?.arguments) acc[i].args += tc.function.arguments
      }
    }
    if (ch.finish_reason) stopReason = ch.finish_reason
  }

  httpStream(
    opts.streamId,
    { url, method: 'POST', headers, body: JSON.stringify(body), timeoutMs: 180000 },
    {
      onChunk: (s) => splitter.push(s, handle),
      onEnd: () => {
        splitter.flush(handle)
        const calls: ToolCall[] = Object.keys(acc)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => ({
            id: acc[Number(k)].id,
            name: acc[Number(k)].name,
            args: safeParse(acc[Number(k)].args),
            raw: acc[Number(k)].args,
          }))
          .filter((c) => c.name)
        q.push({ type: 'done', toolCalls: calls, stopReason })
        q.end()
      },
      onError: (e) => {
        q.fail(formatHttpError(e))
        q.end()
      },
    },
  )
}

/* ------------------------------------------------------------ Anthropic */
function runAnthropic(opts: ChatOptions, q: Q<ChatEvent>) {
  const base = trimBase(opts.provider.baseUrl || 'https://api.anthropic.com/v1')
  const url = `${base}/messages`
  const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const body: any = {
    model: opts.model,
    max_tokens: opts.maxTokens || 8192,
    messages: toAnthropicMessages(opts.messages),
    temperature: Math.min(opts.temperature, 1),
    stream: opts.stream,
  }
  if (system) body.system = system
  if (opts.tools.length)
    body.tools = opts.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }))
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': opts.provider.key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }

  if (!opts.stream) {
    httpRequest({ url, method: 'POST', headers, body: JSON.stringify(body), timeoutMs: 180000 }).then((res) => {
      const j = parseJson(res)
      if (!j) {
        q.fail(errText(res))
        q.end()
        return
      }
      const calls: ToolCall[] = []
      for (const block of j.content || []) {
        if (block.type === 'text') q.push({ type: 'text', delta: block.text })
        if (block.type === 'thinking') q.push({ type: 'reasoning', delta: block.thinking })
        if (block.type === 'tool_use') calls.push({ id: block.id, name: block.name, args: block.input || {} })
      }
      q.push({ type: 'done', toolCalls: calls, stopReason: j.stop_reason, usage: j.usage })
      q.end()
    })
    return
  }

  const splitter = new LineSplitter()
  const calls: ToolCall[] = []
  let current: { id: string; name: string; json: string } | null = null
  let stopReason = ''

  const handleEvent = (raw: string) => {
    const dataLine = raw.startsWith('data:') ? raw.slice(5).trim() : ''
    if (!dataLine) return
    let j: any
    try {
      j = JSON.parse(dataLine)
    } catch {
      return
    }
    if (j.type === 'error') {
      q.fail(j.error?.message || 'Anthropic error')
      return
    }
    if (j.type === 'content_block_start') {
      if (j.content_block?.type === 'tool_use') {
        current = { id: j.content_block.id, name: j.content_block.name, json: '' }
      }
    } else if (j.type === 'content_block_delta') {
      const d = j.delta || {}
      if (d.type === 'text_delta' && d.text) q.push({ type: 'text', delta: d.text })
      if (d.type === 'thinking_delta' && d.thinking) q.push({ type: 'reasoning', delta: d.thinking })
      if (d.type === 'input_json_delta' && current) current.json += d.partial_json || ''
    } else if (j.type === 'content_block_stop') {
      if (current) {
        calls.push({ id: current.id, name: current.name, args: safeParse(current.json), raw: current.json })
        current = null
      }
    } else if (j.type === 'message_delta') {
      if (j.delta?.stop_reason) stopReason = j.delta.stop_reason
    }
  }

  httpStream(
    opts.streamId,
    { url, method: 'POST', headers, body: JSON.stringify(body), timeoutMs: 180000 },
    {
      onChunk: (s) => splitter.push(s, handleEvent),
      onEnd: () => {
        splitter.flush(handleEvent)
        q.push({ type: 'done', toolCalls: calls, stopReason })
        q.end()
      },
      onError: (e) => {
        q.fail(formatHttpError(e))
        q.end()
      },
    },
  )
}

/* --------------------------------------------------------------- Gemini */
function runGemini(opts: ChatOptions, q: Q<ChatEvent>) {
  const base = trimBase(opts.provider.baseUrl || 'https://generativelanguage.googleapis.com/v1beta')
  const method = opts.stream ? 'streamGenerateContent' : 'generateContent'
  const url = `${base}/models/${encodeURIComponent(opts.model)}:${method}?key=${encodeURIComponent(
    opts.provider.key,
  )}${opts.stream ? '&alt=sse' : ''}`
  const system = opts.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
  const body: any = {
    contents: toGeminiContents(opts.messages),
    generationConfig: { temperature: opts.temperature, maxOutputTokens: opts.maxTokens || 8192 },
  }
  if (system) body.systemInstruction = { parts: [{ text: system }] }
  const tools = geminiTools(opts.tools)
  if (tools) body.tools = tools
  const headers = { 'Content-Type': 'application/json' }

  const finish = (calls: ToolCall[], stopReason?: string) => {
    q.push({ type: 'done', toolCalls: calls, stopReason })
    q.end()
  }

  if (!opts.stream) {
    httpRequest({ url, method: 'POST', headers, body: JSON.stringify(body), timeoutMs: 180000 }).then((res) => {
      const j = parseJson(res)
      if (!j) {
        q.fail(errText(res))
        q.end()
        return
      }
      const calls: ToolCall[] = []
      for (const cand of j.candidates || []) {
        for (const part of cand.content?.parts || []) {
          if (part.text) q.push({ type: 'text', delta: part.text })
          if (part.functionCall)
            calls.push({
              id: `gem_${calls.length}_${Date.now().toString(36)}`,
              name: part.functionCall.name,
              args: part.functionCall.args || {},
            })
        }
      }
      finish(calls)
    })
    return
  }

  const splitter = new LineSplitter()
  const calls: ToolCall[] = []
  const handle = (line: string) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload) return
    let j: any
    try {
      j = JSON.parse(payload)
    } catch {
      return
    }
    if (j.error) {
      q.fail(j.error.message || 'Gemini error')
      return
    }
    for (const cand of j.candidates || []) {
      for (const part of cand.content?.parts || []) {
        if (typeof part.text === 'string' && part.text) {
          if (part.thought) q.push({ type: 'reasoning', delta: part.text })
          else q.push({ type: 'text', delta: part.text })
        }
        if (part.functionCall) {
          calls.push({
            id: `gem_${calls.length}_${Date.now().toString(36)}`,
            name: part.functionCall.name,
            args: part.functionCall.args || {},
          })
        }
      }
    }
  }

  httpStream(
    opts.streamId,
    { url, method: 'POST', headers, body: JSON.stringify(body), timeoutMs: 180000 },
    {
      onChunk: (s) => splitter.push(s, handle),
      onEnd: () => {
        splitter.flush(handle)
        finish(calls)
      },
      onError: (e) => {
        q.fail(formatHttpError(e))
        q.end()
      },
    },
  )
}

/* ------------------------------------------------------------------ utils */
function parseJson(res: HttpResponse): any | null {
  try {
    return JSON.parse(res.body)
  } catch {
    return null
  }
}

function errText(res: HttpResponse): string {
  if (res.status === 0) return res.body || 'Network unreachable. Check the endpoint URL and connection.'
  let detail = res.body
  const j = parseJson(res)
  if (j) detail = j.error?.message || j.message || JSON.stringify(j).slice(0, 600)
  return `${res.status} ${detail?.slice(0, 700) || ''}`
}

function formatHttpError(e: string): string {
  let msg = e
  try {
    const j = JSON.parse(e)
    if (j?.status) msg = `${j.status} ${(j.body || '').slice(0, 800)}`
  } catch {
    /* plain */
  }
  if (/Failed to fetch|NetworkError|ECONNREFUSED|Unable to resolve host/i.test(msg))
    msg += '\n• Could not reach the endpoint. In the browser preview, remote APIs must allow CORS — the APK has no such limit.'
  return msg
}

function safeParse(s: any): Record<string, unknown> {
  if (!s) return {}
  if (typeof s === 'object') return s as Record<string, unknown>
  try {
    const v = JSON.parse(String(s))
    return typeof v === 'object' && v ? v : {}
  } catch {
    return {}
  }
}

/** Quick connectivity / credential probe used by the vault screen. */
export async function testProvider(p: Provider, model?: string): Promise<{ ok: boolean; msg: string }> {
  const m = model || p.models[0]
  if (!m) return { ok: false, msg: 'Add at least one model id first.' }
  if (p.kind === 'anthropic') {
    const res = await httpRequest({
      url: `${trimBase(p.baseUrl)}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': p.key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: m, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
      timeoutMs: 45000,
    })
    if (res.status === 200) return { ok: true, msg: `Connected · ${m}` }
    return { ok: false, msg: errText(res) }
  }
  if (p.kind === 'gemini') {
    const res = await httpRequest({
      url: `${trimBase(p.baseUrl)}/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(p.key)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }] }),
      timeoutMs: 45000,
    })
    if (res.status === 200) return { ok: true, msg: `Connected · ${m}` }
    return { ok: false, msg: errText(res) }
  }
  const res = await httpRequest({
    url: `${trimBase(p.baseUrl)}/chat/completions`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key || 'none'}` },
    body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'ping' }], max_tokens: 8, stream: false }),
    timeoutMs: 45000,
  })
  if (res.status === 200) return { ok: true, msg: `Connected · ${m}` }
  return { ok: false, msg: errText(res) }
}
