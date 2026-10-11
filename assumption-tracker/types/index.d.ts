export type Verdict = 'open' | 'right' | 'wrong'

export type Assumption = {
  id: number
  text: string
  context?: string
  verdict: Verdict
  note?: string
  // Whether Claude has been told the current verdict.
  isSent: boolean
}

// A correction turned into a standing rule for one project ($.store, keyed by working directory).
export type Rule = {
  id: number
  // The assumption the user marked wrong.
  assumption: string
  // What the user said it should be instead.
  correction: string
}

declare module 'claude-code' {
  interface PluginState {
    'assumption-tracker': { items: Assumption[]; isBusy: boolean; lastId: number; rules: Rule[]; cwd: string }
  }
}
