import type { ModelCompleteResult } from 'claude-code'

// Shared by prompt-enhancer, plain-talk and session-tracker (each mod keeps its own copy).
//
// A mod's $.model.complete skips Claude Code's own system prompt, so the attribution
// block is the only thing marking the request as Claude Code. With
// CLAUDE_CODE_ATTRIBUTION_HEADER=0 that block is dropped too, and a subscription
// login answers every such call with 429. The main conversation and $.model.fork
// keep working, which is what makes this hard to spot.
// https://code.claude.com/docs/en/llm-gateway-protocol#system-prompt-attribution-block
//
// Pure on purpose: the engine follows `$` only within one file, so each mod reads
// the variable itself with $.env.get('CLAUDE_CODE_ATTRIBUTION_HEADER') and passes it here.
const OFF = new Set(['0', 'false', 'no', 'off'])

export const attributionIsOff = (value: string | undefined) =>
  value !== undefined && OFF.has(value.trim().toLowerCase())

export const ATTRIBUTION_FIX = 'settings.json의 env에서 CLAUDE_CODE_ATTRIBUTION_HEADER=0을 지우고 새 세션을 여세요'

type NoReply = Extract<ModelCompleteResult, { isAnswered: false }>

// One short line on why a completion came back without text, with the fix when there is one.
export function whyNoReply(r: NoReply, attribution: string | undefined): string {
  if (r.reason === 'api-error') {
    if (r.status === 429 && attributionIsOff(attribution)) return `모드의 모델 호출이 막혔어요(429). ${ATTRIBUTION_FIX}`
    if (r.status === 429) return '사용량 제한(429)에 걸렸어요. 잠시 뒤 다시 해 주세요'
    return `API 오류 ${r.status ?? '응답 없음'} (${r.error})`
  }
  if (r.reason === 'aborted') return '시간이 지나 중단됐어요'
  return '빈 응답이 왔어요'
}
