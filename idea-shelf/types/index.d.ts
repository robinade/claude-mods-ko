// `source` is absent on ideas shelved before it existed: read those as 'you'.
export type Idea = { id: string; text: string; source?: 'you' | 'claude' }

declare module 'claude-code' {
  interface PluginState {
    // nudge: ids of shelved ideas that fit the turn just finished (the band)
    'idea-shelf': { ideas: Idea[]; nudge: string[] }
  }
  // the tool this mod registers for the model (hooks/register.tsx)
  interface McpToolInputs {
    'mcp__idea-shelf__shelve_idea': { text: string }
  }
}
