import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Phase, TasteRecord } from '../types'
import { cardFits, guideFirst } from './card'
import { whyNoReply } from './modelhint'
import { clipChars, fitWidth, sameText, truncateWidth } from './text'

const phase = atom({ plugin: 'prompt-enhancer', key: 'phase' } as const, 'idle' as Phase)
const note = atom({ plugin: 'prompt-enhancer', key: 'note' } as const, '')
const enhanced = atom({ plugin: 'prompt-enhancer', key: 'enhanced' } as const, '')
const changes = atom({ plugin: 'prompt-enhancer', key: 'changes' } as const, [] as string[])

const MARK = '<<<CHANGES>>>'
const CARDS_DIR = 'cards' // one prompting card per model, under the plugin's folder
const KEEP = 10 // taste records kept per project
const CLIP = 300 // characters kept of each side of an edit example
const NOTE_COLUMNS = 80 // terminal columns a "what changed" note may take (Hangul counts 2)
// Korean says in about half the characters what English does, so a smaller
// average edit already means the user is cutting or adding.
const TASTE_DELTA = 25
// Before the first reply there is nothing to fork, so the rewrite is one direct
// completion. A rewrite runs about as long as its draft (a 5,000-character English
// draft came back as ~4,800 tokens), so the cap grows with the draft. The cap also
// holds the model's thinking, which current models never skip, so even a short
// draft gets room for both.
const MIN_TOKENS = 8192
const MAX_TOKENS = 16000
const REWRITE_TIMEOUT_MS = 240_000
export const rewriteTokens = (draft: string) =>
  Math.min(MAX_TOKENS, Math.max(MIN_TOKENS, Math.ceil(Array.from(draft).length * 1.5)))

const RULES = `너는 개발자가 Claude Code에 보낼 거친 초안 프롬프트를 명확하고 구체적인 프롬프트로 다시 쓴다. 사용자는 한국어 사용자다.
- 언어: 초안이 한국어면 결과도 자연스러운 한국어로 쓴다(번역투·직역체 금지). 초안이 다른 언어면 그 언어를 따른다. 파일 경로, 코드, 명령어, 스킬 이름(/skill-name), 고유명사는 원문 그대로 둔다.
- 작성자의 의도를 지킨다. 초안이 암시하지 않은 요구사항은 지어내지 않는다.
- 프로젝트 맥락에서 맞는 구체적인 파일, 명령, 스킬(/skill-name 형태), 규칙을 짚는다.
- 목표, 범위, 제약, '완료'의 기준을 적는다. 짧아도 된다. 군더더기는 넣지 않는다.
- 작업을 막는 모호함만 Claude에게 묻게 하고, 나머지는 합리적인 가정으로 정해 진행하게 한다. 정한 가정은 밝히게 한다.
- 초안에 붙여 넣은 자료(문서, 로그, 메일, 웹 글)는 지우거나 줄이지 않는다. 사용자 요청과 나눠 <참고_자료> 블록에 원문 그대로 둔다. <model_guide>가 빼라고 한 자료만 예외다.
- <model_guide>가 있으면 그 카드의 항목을 초안이 해당할 때만 반영한다.
답은 다시 쓴 프롬프트만 쓴다(머리말·따옴표·코드 펜스 없이). 그다음 줄에 ${MARK} 만 한 줄로 쓰고,
그 아래에 무엇을 더했는지 1~3개의 글머리표를 한국어로, 각 25자 이내로 쓴다(예: "src/auth.ts 참조 추가", "완료 기준: 테스트 통과", "/code-review 스킬 연결").`

// A long paste sits in the box as this placeholder; the engine expands it only on
// submit, so the band can read nothing but the placeholder. /enhance gets it expanded.
const COLLAPSED_PASTE = /\[Pasted text #\d+(?: \+\d+ lines?)?\]/
const PASTE_HINT = '붙여 넣은 긴 글은 접혀 있어 읽을 수 없어요. /enhance 뒤에 붙여 넣거나, 한 번 더 붙여 넣어 펼친 뒤 눌러 주세요'

async function fail($: EngineInterface, why: string) {
  await update($, phase, () => 'error')
  await update($, note, () => why)
  $.ui.toast(why)
}

// Rewrites `draft` and puts the result in the prompt box.
async function enhance($: EngineInterface, draft: string) {
  draft = draft.trim()
  if (!draft) return fail($, '먼저 프롬프트 초안을 입력해 주세요')
  if (COLLAPSED_PASTE.test(draft)) return fail($, PASTE_HINT)
  await update($, phase, () => 'enhancing')
  await update($, note, () => '')
  await update($, changes, () => [])

  const card = await modelCard($)
  const taste = tasteHint(await loadTaste($))
  const guide = card ? `\n\n<model_guide>\n${card.trim()}\n</model_guide>` : ''
  const ask = `${RULES}${guide}${taste ? `\n\n${taste}` : ''}\n\n<rough_prompt>\n${draft}\n</rough_prompt>`
  // Fork reuses the session's own system prompt: CLAUDE.md, skills listing, conversation so far.
  let r = await $.model.fork({ prompt: ask })
  const maxTokens = rewriteTokens(draft)
  const direct = !r.isAnswered && r.reason === 'nothing-to-fork'
  if (!r.isAnswered && r.reason === 'nothing-to-fork') {
    r = await $.model.complete({
      model: await $.session.model(),
      system: await projectContext($),
      prompt: ask,
      maxTokens,
      effort: 'medium', // a rewrite, not a hard judgment: answer sooner
      timeoutMs: REWRITE_TIMEOUT_MS,
    })
  }

  if (!r.isAnswered) {
    return fail($, `다듬기 실패: ${whyNoReply(r, await $.env.get('CLAUDE_CODE_ATTRIBUTION_HEADER'))}`)
  }
  // A direct reply that used its whole cap and never reached the notes was cut off:
  // don't put half a prompt in the box.
  if (direct && !r.text.includes(MARK) && r.usage.output_tokens >= maxTokens) {
    return fail($, '다듬은 글이 너무 길어 중간에 잘렸어요. 초안을 나눠서 다듬어 주세요')
  }
  const reply = splitReply(r.text)
  if (!reply.text) return fail($, '다듬기에 실패했어요: 빈 응답')
  const filled = await $.prompt.fill({ text: reply.text, mode: 'replace' })
  if (!filled.isFilled) {
    return fail($, `입력창에 넣지 못했어요 (${filled.refusal ?? '이유 모름'})`)
  }
  await update($, enhanced, () => reply.text)
  await update($, changes, () => reply.notes)
  await update($, phase, () => 'ready')
}

// Splits the model's reply into the rewrite and its "what changed" bullets.
function splitReply(raw: string): { text: string; notes: string[] } {
  const at = raw.lastIndexOf(MARK)
  if (at < 0) return { text: raw.trim(), notes: [] }
  const notes = guideFirst(
    raw
      .slice(at + MARK.length)
      .split('\n')
      .map(l => l.replace(/^\s*[-*•]\s*/, '').trim())
      .filter(Boolean),
  )
    .slice(0, 3)
    .map(l => truncateWidth(l, NOTE_COLUMNS))
  return { text: raw.slice(0, at).trim(), notes }
}

// The prompting card for the session's model: the first of cards/*.md (by name) whose
// "적용 모델:" line fits what `/model` shows. '' when none fits or the cards can't be read.
async function modelCard($: EngineInterface): Promise<string> {
  try {
    const model = await $.session.model()
    const dir = `${$.plugin.root}/${CARDS_DIR}`
    const files = (await $.fs.list(dir))
      .filter(f => f.kind === 'file' && f.name.endsWith('.md'))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const f of files) {
      const card = await $.fs.read(`${dir}/${f.name}`)
      if (typeof card === 'string' && cardFits(card, model)) return card
    }
  } catch {}
  return ''
}

// Taste is kept per project root, newest record last.
async function tasteKey($: EngineInterface) {
  return `taste:${await $.session.root()}`
}

async function loadTaste($: EngineInterface): Promise<TasteRecord[]> {
  try {
    const v = await $.store.get(await tasteKey($))
    return Array.isArray(v) ? (v as TasteRecord[]) : []
  } catch {
    return [] // no store or root: enhance without taste
  }
}

// Compares what was sent with the last rewrite and remembers the outcome.
async function recordSend($: EngineInterface, sentText: string) {
  const rewrite = await read($, enhanced)
  if (!rewrite) return
  await update($, enhanced, () => '')
  await update($, changes, () => [])
  await update($, phase, () => 'idle')

  const sent = sentText.trim()
  const edited = !sameText(sent, rewrite)
  const rec: TasteRecord = { edited, delta: Array.from(sent).length - Array.from(rewrite).length }
  if (edited) {
    rec.rewrite = clip(rewrite)
    rec.sent = clip(sent)
  }
  const key = await tasteKey($)
  await $.store.set(key, [...(await loadTaste($)), rec].slice(-KEEP))
}

function clip(s: string) {
  return clipChars(s, CLIP)
}

// Turns the history into guidance for the next rewrite; '' when there is none.
function tasteHint(recs: TasteRecord[]): string {
  if (!recs.length) return ''
  const edits = recs.filter(r => r.edited)
  const lines = [
    `<user_taste>`,
    `이 프로젝트에서 최근 다시 쓴 ${recs.length}개 중 사용자는 ${recs.length - edits.length}개를 그대로 보냈고 ${edits.length}개를 고쳐서 보냈다.`,
  ]
  if (edits.length) {
    const avg = Math.round(edits.reduce((n, r) => n + r.delta, 0) / edits.length)
    if (avg < -TASTE_DELTA) lines.push(`고칠 때 평균 약 ${-avg}자를 줄였다: 더 짧게 써라.`)
    else if (avg > TASTE_DELTA) lines.push(`고칠 때 평균 약 ${avg}자를 늘렸다: 더 자세히 써라.`)
    lines.push('최근 수정 예시(네가 쓴 것, 그다음 사용자가 실제로 보낸 것). 무엇을 빼고, 남기고, 더하는지 파악해라:')
    for (const r of edits.slice(-3)) {
      lines.push(`<rewrite>${r.rewrite ?? ''}</rewrite>\n<sent>${r.sent ?? ''}</sent>`)
    }
  } else {
    lines.push('사용자는 지금 스타일을 그대로 좋아한다. 같은 스타일을 유지해라.')
  }
  lines.push(`</user_taste>`)
  return lines.join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'enhance',
      description: '대충 쓴 초안을 구체적인 프롬프트로 다시 써서 입력창에 넣어요',
      argumentHint: '<초안>',
    })
    return next(e)
  })

  // The user's own Enter, or this band's Send: learn from how the rewrite was sent.
  on('prompt.submit', async ($, e, next) => {
    const o = e.origin
    const mine = o.kind === 'composer' || o.kind === 'bridge' || (o.kind === 'plugin' && o.name === 'prompt-enhancer')
    if (mine) {
      try {
        await recordSend($, e.text)
      } catch {}
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'enhance' }, async ($, e) => {
    if (!e.args.trim()) return { text: '다듬을 초안을 함께 적어 주세요. 예: /enhance 로그인 버그 고쳐줘' }
    await enhance($, e.args)
    const why = await read($, note)
    return { text: why || '다듬은 프롬프트를 입력창에 넣었어요. 확인하고 Enter로 보내세요.' }
  })

  // Stacked over whatever else draws there (another mod's band).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const { Box, Button, Text } = $.ui.resolve(e)
    const p = await read($, phase)
    const busy = p === 'enhancing'

    const enhanceDraft = async () => enhance($, (await $.prompt.read()).text)

    const send = async () => {
      const text = (await $.prompt.read()).text.trim()
      if (!text) return
      await $.prompt.fill({ text: '', mode: 'replace' })
      await update($, phase, () => 'idle')
      // Recorded here too: our own submit may not pass back through our prompt.submit hook.
      await recordSend($, text).catch(() => {})
      await $.prompt.submit({ text, asUser: true })
    }

    const label =
      p === 'enhancing' ? '다듬는 중…' :
      p === 'ready' ? '다듬었어요 — 확인·수정 후 보내기' :
      p === 'error' ? await read($, note) :
      '프롬프트 다듬기'
    const notes = p === 'ready' ? await read($, changes) : []

    const row = (
      <Box>
        <Text dimColor>{label} </Text>
        {busy ? null : <Button key="enhance" label="다듬기 (e)" hotkey="e" onPress={enhanceDraft} />}
        <Text> </Text>
        {busy ? null : <Button key="send" label="보내기 (s)" hotkey="s" onPress={send} />}
      </Box>
    )
    // One line per note, cut to the band's width in terminal columns (Hangul takes two).
    const width = Math.max(10, (e.props.bodyColumns || 80) - 2)
    return (
      <Box flexDirection="column">
        {row}
        {notes.length > 0 && (
          <Box key="changes" flexDirection="column">
            {notes.map(n => (
              <Text dimColor wrap="truncate-end">{fitWidth(`+ ${n}`, width)}</Text>
            ))}
          </Box>
        )}
        {below}
      </Box>
    )
  })
}

// Used only before the first reply, when there is no transcript to fork.
async function projectContext($: EngineInterface): Promise<string> {
  const parts: string[] = []

  const home = await $.env.get('HOME')
  if (home) {
    try {
      parts.push(`# 사용자 지침\n${await $.fs.read(`${home}/.claude/CLAUDE.md`)}`)
    } catch {}
  }
  for (const f of await $.fs.ancestors({ names: ['CLAUDE.md', 'AGENTS.md'] })) {
    parts.push(`# ${f.dir}/${f.name}\n${f.content}`)
  }

  const cmds = (await $.command.list()).filter(c => c.source !== 'builtin')
  if (cmds.length) {
    parts.push(`# 설치된 스킬과 명령\n${cmds.map(c => `/${c.name}: ${c.description}`).join('\n')}`)
  }

  return `다시 쓰기에 참고할 프로젝트 맥락:\n\n${parts.join('\n\n')}`
}
