export type Status = string | null

// The reviewer's grade of the last answer, as the band shows it.
export type Grade = {
  pass: boolean
  problems: string[]
  // Terms the answer explained that the user has not marked as known yet.
  offered: string[]
  // True while an automatic rewrite of a failed answer is queued or running.
  isFixing: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'plain-talk': { status: Status; isRewriting: boolean; toldTerms: number; grade: Grade | null }
  }
}
