export type Status = 'working' | 'waiting' | 'done'

export type SessionRow = {
  pid: number
  id: string
  name: string
  title: string
  cwd: string
  project: string
  status: Status
  waitingFor: string
  since: number
}

declare module 'claude-code' {
  interface PluginState {
    // replyTo: the session id whose reply field is open, '' for none.
    'session-monitor': { sessions: SessionRow[]; problem: string; replyTo: string }
  }
}
