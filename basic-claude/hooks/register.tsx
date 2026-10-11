import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Grade } from '../types'
import { whyNoReply } from './modelhint'
import { REVIEW_SYSTEM, rulesFor } from './rules'
import type { Level } from './rules'
import { LEVEL_KO, cleanTerms, parseCommand, splitTerms, truncateWidth } from './text'

const LEVELS: readonly Level[] = ['beginner', 'expert', 'off']
const ALERT_AFTER_MS = 30_000
const MAX_TERMS = 300
const MAX_OFFERED = 6
const REWRITE_TAG = '[plain-talk]'
const NEEDS_YOU = '● 확인 필요'
const WORKING = '작업 중: '
const DONE = '끝났어요: '

const status = atom({ plugin: 'plain-talk', key: 'status' } as const, null)
const isRewriting = atom({ plugin: 'plain-talk', key: 'isRewriting' } as const, false)
const toldTerms = atom({ plugin: 'plain-talk', key: 'toldTerms' } as const, 0)
const grade = atom({ plugin: 'plain-talk', key: 'grade' } as const, null)

// Level and glossary live in $.store, so they carry across sessions.
const getLevel = async ($: EngineInterface): Promise<Level> => {
  const v = await $.store.get('level')
  return LEVELS.includes(v as Level) ? (v as Level) : 'beginner'
}
// Words about plain-talk itself, never offered as "이건 알아요".
const META_TERMS = new Set([
  'plain-talk', 'plain talk', 'plain', 'plain words', 'plain english', 'plain language', 'jargon', 'technical term',
  'technical terms', 'known terms', 'i know this', 'done', 'not done', 'your next step', 'next step', 'chisle',
  'beginner', 'expert', 'reader level', 'rewrite', 'review',
  '플레인 토크', '쉬운 말', '쉬운 한국어', '전문 용어', '기술 용어', '용어', '아는 용어', '이건 알아요', '완료', '남은 일',
  '다음 할 일', '초보', '전문가', '독자 수준', '재작성', '다시 쓰기', '검토',
])
const isOfferable = (t: string) => !META_TERMS.has(t) && !t.includes('plain-talk') && t.length <= 40

// Old versions saved whole sentences; reading cleans them and writes the tidy list back.
const getTerms = async ($: EngineInterface): Promise<string[]> => {
  const v = await $.store.get('terms')
  if (!Array.isArray(v)) return []
  const terms = cleanTerms(v)
  if (terms.length !== v.length || terms.some((t, i) => t !== v[i])) await $.store.set('terms', terms)
  return terms
}

// Adds terms to the glossary; answers the ones that were new.
const addTerms = async ($: EngineInterface, list: string[]): Promise<string[]> => {
  const terms = await getTerms($)
  const added = cleanTerms(list).filter(t => !terms.includes(t))
  if (added.length) await $.store.set('terms', [...terms, ...added].slice(-MAX_TERMS))
  return added
}

// "✓ 쉬워요" (with any style nits), or "✗ 문제 2개: a; b", cut to fit one line
// by terminal columns (Hangul takes two).
const gradeText = (g: Grade): string => {
  if (g.pass) return truncateWidth(g.problems.length ? `✓ 쉬워요 · 참고: ${g.problems.join('; ')}` : '✓ 쉬워요', 80)
  const n = g.problems.length
  const line = truncateWidth(n ? `✗ 문제 ${n}개: ${g.problems.join('; ')}` : '✗ 어려워요', 80)
  return g.isFixing ? `${line} · 다시 쓰는 중` : line
}

type Review = { status: string; pass: boolean; problems: string[]; explained: string[] }

const parseReview = (text: string): Review | null => {
  try {
    const r = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '')
    return {
      status: truncateWidth(String(r.status ?? ''), 100),
      pass: r.pass !== false,
      problems: Array.isArray(r.problems) ? r.problems.map(String) : [],
      explained: Array.isArray(r.explained) ? cleanTerms(r.explained).filter(isOfferable) : [],
    }
  } catch {
    return null
  }
}

// Whether this session already said why the answer check fails; a reload starts it over.
let toldNoReview = false

// Asks a small model to grade the final message, then shows the grade, offers the
// terms it explained as "I know this" buttons, and (once) asks Claude to rewrite a
// message that broke the rules. A rewrite's own review never asks for another.
async function reviewAnswer($: EngineInterface, ask: string, answer: string, wasRewrite: boolean) {
  const level = await getLevel($)
  const known = await getTerms($)
  const knownLine = known.length ? `\n독자가 이미 아는 용어 (전문 용어 아님): ${known.join(', ')}.` : ''
  const reply = await $.model.complete({
    model: 'haiku',
    system: REVIEW_SYSTEM,
    prompt: `독자 수준: ${LEVEL_KO[level]} (${level}).${knownLine}\n\n이번 턴의 사용자 요청 (전문 용어, 세부 내용, 정확한 원문을 요청했다면 그걸 준 답변은 통과):\n<user_request>\n${ask || '(없음)'}\n</user_request>\n\n<final_message>\n${answer}\n</final_message>`,
  })
  if (!reply.isAnswered && !toldNoReview) {
    // Said once per session: why answers go unchecked, and the fix when there is one.
    toldNoReview = true
    $.ui.log(`답변 검사를 못 했어요: ${whyNoReply(reply, await $.env.get('CLAUDE_CODE_ATTRIBUTION_HEADER'))}`)
  }
  if (reply.isAnswered) toldNoReview = false
  const review = reply.isAnswered ? parseReview(reply.text) : null
  if (!review) {
    await update($, status, line => (line ?? '').replace(new RegExp(`^${WORKING}`), DONE))
    $.ui.status(NEEDS_YOU)
    return
  }
  if (review.status) await update($, status, () => review.status)

  const offered = level === 'beginner' ? [...new Set(review.explained)].filter(t => !known.includes(t)).slice(0, MAX_OFFERED) : []
  const isFixing = !review.pass && !wasRewrite && answer.trim() !== ''
  const g: Grade = { pass: review.pass, problems: review.problems, offered, isFixing }
  await update($, grade, () => g)
  $.ui.status(`${NEEDS_YOU} · ${gradeText(g)}`)

  if (isFixing) {
    try {
      await $.prompt.submit({
        text: `${REWRITE_TAG} 방금 답변이 사용자를 헷갈리게 할 수 있어요: ${review.problems.join('; ') || '충분히 쉽지 않음'}. 그 부분만 고쳐서, 사용자가 요청한 내용은 빠짐없이 담은 완전한 최종 답변 하나로 다시 써 주세요. 답변은 한국어로 쓰고, 도구는 실행하지 마세요.`,
      })
    } catch {
      await update($, grade, cur => cur && { ...cur, isFixing: false })
    }
  }
}

export const register: Register = on => {
  let lastAsk = ''

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'plain',
      description: 'plain-talk: 설명 수준 보기·바꾸기(초보·전문가·끄기), 아는 용어 추가',
      argumentHint: '[초보|전문가|끄기|know <용어>|forget]',
    })
    return next(e)
  })

  on('command.run', { command: 'plain' }, async ($, e) => {
    const cmd = parseCommand(e.args)
    if (cmd.kind === 'forget') {
      await $.store.set('terms', [])
      await update($, toldTerms, () => 0)
      return { text: '아는 용어 목록을 모두 지웠어요.' }
    }
    if (cmd.kind === 'know') {
      const list = cleanTerms(splitTerms(cmd.rest))
      if (!list.length) {
        const terms = await getTerms($)
        return { text: terms.length ? `아는 용어: ${terms.join(', ')}` : '아직 아는 용어로 표시한 게 없어요. /plain know <용어> 로 추가하세요.' }
      }
      const added = await addTerms($, list)
      await update($, grade, g => g && { ...g, offered: g.offered.filter(t => !list.includes(t)) })
      return { text: added.length ? `이제 아는 용어로 칠게요: ${added.join(', ')}` : '이미 아는 용어로 등록돼 있어요.' }
    }
    if (cmd.kind === 'level') {
      await $.store.set('level', cmd.level)
      return { text: `plain-talk 수준을 바꿨어요: ${LEVEL_KO[cmd.level]}(${cmd.level})` }
    }
    const level = await getLevel($)
    const terms = await getTerms($)
    return {
      text: `plain-talk 수준: ${LEVEL_KO[level]}(${level}) · 아는 용어 ${terms.length}개\n사용법: /plain 초보 · /plain 전문가 · /plain 끄기 (영어 beginner·expert·off도 돼요)\n/plain know <용어> 아는 용어 추가 (쉼표로 여러 개, 용어 없이 쓰면 목록 보기) · /plain forget 목록 지우기`,
    }
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const text = rulesFor(await getLevel($))
    return text ? { sections: [...r.sections, { id: 'plain-talk:style', text, scope: 'session' }] } : r
  })

  // Drop chisle's terse-style reminders while plain-talk is on.
  on('prompt.attachment', async ($, e, next) => {
    const r = await next(e)
    const isChisle = e.origin.kind === 'hook' && r.text !== null && r.text.includes('CHISLE')
    return isChisle && (await getLevel($)) !== 'off' ? { text: null } : r
  })

  // Tell Claude, once per session and then as it grows, which terms the user already knows.
  on('prompt.submit', async ($, e, next) => {
    if ((await getLevel($)) !== 'beginner') return next(e)
    const terms = await getTerms($)
    const told = await read($, toldTerms)
    if (terms.length <= told) return next(e)
    await update($, toldTerms, () => terms.length)
    const note = `plain-talk: 사용자가 이미 아는 용어예요. 다시 풀어 설명하지 말고 그대로 쓰세요: ${terms.slice(told).join(', ')}`
    return next({ ...e, context: [...(e.context ?? []), note] })
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    const isRewrite = e.text.includes(REWRITE_TAG)
    await update($, isRewriting, () => isRewrite)
    if (!isRewrite) {
      // A turn with no typed prompt (a continuation) keeps the user's last request.
      if (e.text.trim()) lastAsk = e.text
      await update($, grade, () => null)
    }
    $.ui.status(undefined)
    // Show something right away; the review replaces it when the turn ends.
    const ask = lastAsk.replace(/\s+/g, ' ').trim()
    if (ask) await update($, status, () => `${WORKING}${truncateWidth(ask, 70)}`)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId || e.reason !== 'answer' || (await getLevel($)) === 'off') return r
    if (e.durationMs > ALERT_AFTER_MS) {
      $.ui.toast('Claude가 끝났어요. 확인해 주세요')
      void $.audio.play({ asset: 'sounds/done.aiff' }).catch(() => {})
    }
    const wasRewrite = await read($, isRewriting)
    void reviewAnswer($, lastAsk, e.answer, wasRewrite).catch(() => $.ui.status(NEEDS_YOU))
    return r
  })

  // Stacked over whatever else draws there (another mod's band).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const line = await read($, status)
    const g = await read($, grade)
    if (e.props.hasSurvey || (!line && !g) || (await getLevel($)) === 'off') return below
    const { Box, Button, Text } = $.ui.resolve(e)
    const know = async (term: string) => {
      await addTerms($, [term])
      await update($, grade, cur => cur && { ...cur, offered: cur.offered.filter(t => t !== term) })
    }
    const top = [<Text dimColor wrap="truncate-end">◆ {line ?? ''}</Text>]
    if (g) top.push(<Text color={g.pass ? 'success' : 'error'}>{gradeText(g)}</Text>)
    const rows = [
      <Box flexDirection="row" columnGap={2}>
        {top}
      </Box>,
    ]
    if (g && g.offered.length) {
      rows.push(
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Text dimColor>이건 알아요:</Text>
          {g.offered.map(t => <Button key={`know:${t}`} label={t} dimColor onPress={() => know(t)} />)}
        </Box>,
      )
    }
    return (
      <Box flexDirection="column">
        <Box flexDirection="column">{rows}</Box>
        {below}
      </Box>
    )
  })
}
