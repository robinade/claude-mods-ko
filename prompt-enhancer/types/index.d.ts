export type Phase = 'idle' | 'enhancing' | 'ready' | 'error'

/** One sent prompt that had been enhanced: whether the user edited the rewrite first. */
export type TasteRecord = {
  edited: boolean
  /** Characters (code points) sent minus characters in the rewrite. */
  delta: number
  /** Trimmed texts of the rewrite and what was sent; kept only when edited. */
  rewrite?: string
  sent?: string
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': {
      phase: Phase
      note: string
      /** The last rewrite put in the prompt box, until it is sent. */
      enhanced: string
      /** Up to 3 short notes (in Korean) on what the last rewrite added. */
      changes: string[]
    }
  }
}
