export type Task = { id: string; text: string; status: 'pending' | 'in_progress' | 'completed' }

export type SessionRecord = {
  id: string
  root: string
  startedAt: number
  beatAt: number
  endedAt?: number
  isBusy?: boolean
  turns?: number
  lastPrompt?: string
  lastAnswer?: string
  // model-written summary, refreshed after each turn
  title?: string
  done?: string
  doing?: string
  next?: string
  tasks: Task[]
  files?: string[]
  // relative path -> when this session last edited it (recent ones only), for clash warnings
  edits?: Record<string, number>
}

declare module 'claude-code' {
  interface PluginState {
    'session-tracker': { sessions: SessionRecord[]; isCollapsed: boolean }
  }
}
