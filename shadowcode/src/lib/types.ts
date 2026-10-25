export type ProviderKind = 'openai' | 'anthropic' | 'gemini'

export interface Provider {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  key: string
  models: string[]
  preset?: string
}

export type ThemeMode = 'dark' | 'light'

export interface Settings {
  theme: ThemeMode
  accent: AccentId
  radius: number
  fontScale: number
  streaming: boolean
  maxSteps: number
  temperature: number
  systemExtra: string
  autoApprove: string[]
  showReasoning: boolean
  activeProviderId: string | null
  activeModel: string | null
  autoTitle: boolean
  haptics: boolean
  termFontSize: number
  onboarded: boolean
  autoLockMinutes: number
  includeWorkspaceContext: boolean
}

export type AccentId = 'aurora' | 'ember' | 'mint' | 'rose' | 'ocean' | 'gold'

export interface Accent {
  id: AccentId
  name: string
  a1: string
  a2: string
}

export interface Msg {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoning?: string
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
  ts: number
  model?: string
  error?: boolean
  stopped?: boolean
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  raw?: string
}

export interface ToolResult {
  id: string
  name: string
  ok: boolean
  output: string
  ms?: number
}

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  providerId: string | null
  model: string | null
  skillIds: string[]
  workspace: string
  pinned?: boolean
}

export interface Project {
  id: string
  name: string
  dir: string
  color?: string
  createdAt: number
  sessionIds: string[]
}

export interface Skill {
  id: string
  name: string
  desc: string
  icon: string
  category: string
  prompt: string
  tools?: string[]
  enabled: boolean
  author?: string
  version?: string
  builtin?: boolean
  color?: string
  createdAt: number
}

export interface Approval {
  id: string
  name: string
  args: Record<string, unknown>
  sessionId: string
}

export interface FsEntry {
  name: string
  path: string
  dir: boolean
  size: number
  mtime: number
}

export interface DeviceInfo {
  model: string
  android: string
  sdk: number
  pkg: string
  native: boolean
  home: string
}

export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'done'; toolCalls: ToolCall[]; stopReason?: string; usage?: Record<string, number> }
  | { type: 'error'; message: string }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  name?: string
  images?: string[]
}
