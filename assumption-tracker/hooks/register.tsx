import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Assumption, Rule, Verdict } from '../types'

const PLUGIN = 'assumption-tracker'
const PANE = 'assumptions'
const TOOL = 'log_assumption'
const TAG = '[assumption-tracker]'

const items = atom({ plugin: 'assumption-tracker', key: 'items' } as const, [])
const isBusy = atom({ plugin: 'assumption-tracker', key: 'isBusy' } as const, false)
// Ids never repeat, even after "Clear reviewed" empties the list.
const lastId = atom({ plugin: 'assumption-tracker', key: 'lastId' } as const, 0)
// This project's rules: kept in $.store, mirrored here so the panel redraws when they change.
const rules = atom({ plugin: 'assumption-tracker', key: 'rules' } as const, [])
// The working directory the rules are keyed by, as session start and directory changes report it.
const cwd = atom({ plugin: 'assumption-tracker', key: 'cwd' } as const, '')

// What Claude is told every session. The user is Korean, so assumptions are logged in Korean.
const GUIDANCE = `# 가정 기록 (assumption-tracker)
사용자는 한국어 사용자다. 작업하는 동안 사용자가 말하지 않은 것을 가정할 때마다 — 요구사항, 기본값, 라이브러리·도구 선택, 파일 위치, 데이터 형태, 모호한 표현의 해석 — \`mcp__${PLUGIN}__${TOOL}\`를 호출해 그 가정을 짧은 한국어 한 문장으로 기록하고, 계속 작업한다. 묻느라 멈추지 않는다. 가정은 그것을 세운 시점에 한 번만 기록한다. 사용자나 코드베이스가 이미 정해 둔 것은 기록하지 않는다. 파일 경로·명령·코드 식별자는 원문 그대로 쓴다.
사용자는 옆 패널에서 가정을 검토한다. 판정은 ${TAG}로 시작하는 메시지로 온다. 틀렸다고 표시된 가정이 있으면, 그 가정에 기댄 작업을 곧바로 고친다. 정정 내용이 있으면 그대로 따른다.`

export const feedbackText = (list: readonly Assumption[]) => {
  const due = list.filter(a => a.verdict !== 'open' && !a.isSent)
  if (!due.length) return null
  const lines = due.map(a =>
    a.verdict === 'right'
      ? `- #${a.id} "${a.text}": 맞음.`
      : `- #${a.id} "${a.text}": 틀림.${a.note ? ` 사용자 정정: ${a.note}` : ' 다시 생각해 보거나, 사용자에게 원하는 걸 물어보세요.'}`,
  )

  return `${TAG} 사용자가 가정을 검토했어요:\n${lines.join('\n')}\n판정에 맞게 작업을 고치세요. 이 가정들은 다시 기록하지 마세요.`
}

export const hasUnsentWrong = (list: readonly Assumption[]) =>
  list.some(a => a.verdict === 'wrong' && !a.isSent)

// A wrong assumption with a correction becomes a rule; the same assumption corrected again updates it.
// No correction, no rule: a bare "wrong" says what not to do, not what to do.
export const withRule = (list: readonly Rule[], assumption: string, correction?: string): Rule[] => {
  const fix = correction?.trim()
  if (!fix) return [...list]
  if (list.some(r => r.assumption === assumption))
    return list.map(r => (r.assumption === assumption ? { ...r, correction: fix } : r))

  return [...list, { id: Math.max(0, ...list.map(r => r.id)) + 1, assumption, correction: fix }]
}

export const rulesText = (list: readonly Rule[]) =>
  list.length
    ? `# 정정된 가정에서 배운 프로젝트 규칙
이 프로젝트의 이전 작업에서 한국어 사용자가 아래 가정들을 정정했다. 각 규칙을 따르고, 원래 가정을 다시 하지 않는다.
${list.map(r => `- ${r.correction} (원래 가정: "${r.assumption}")`).join('\n')}`
    : null

export const statsText = (list: readonly Assumption[], ruleList: readonly Rule[]) =>
  `가정 ${list.length}개 · 틀림 ${list.filter(a => a.verdict === 'wrong').length} · 규칙 ${ruleList.length}`

// The band's one line; 0 is a digit, so it works whatever the keyboard's input language.
export const bandText = (list: readonly Assumption[], ruleCount: number) => {
  const open = list.filter(a => a.verdict === 'open').length
  const what = !list.length
    ? `프로젝트 규칙 ${ruleCount}개`
    : open
      ? `확인할 가정 ${open}개 (전체 ${list.length}개)`
      : `가정 ${list.length}개 모두 확인했어요`

  return `◆ ${what} · 0을 누르면 열려요`
}

// Pane hotkeys are digits, not y / n: with the Korean input method on, y and n arrive as ㅛ and ㅜ.
// A focused correction box takes every printable key itself, so typing digits there never presses these.
export const RIGHT_KEY = '1'
export const WRONG_KEY = '2'

const rulesKey = async ($: EngineInterface) => `rules:${(await read($, cwd)) || (await $.session.cwd())}`

const storedRules = async ($: EngineInterface, key: string) => {
  const v = await $.store.get(key)
  return Array.isArray(v) ? (v as Rule[]) : []
}

const loadRules = async ($: EngineInterface) => {
  const list = await storedRules($, await rulesKey($))
  await update($, rules, () => list)
}

const changeRules = async ($: EngineInterface, fn: (list: readonly Rule[]) => Rule[]) => {
  const key = await rulesKey($)
  const list = fn(await storedRules($, key))
  await (list.length ? $.store.set(key, list) : $.store.delete(key))
  await update($, rules, () => list)
}

// Marks every reviewed verdict sent and hands back the message telling Claude about them.
const takeFeedback = async ($: EngineInterface) => {
  let text = null as string | null
  await update($, items, list => {
    text = feedbackText(list)
    return text ? list.map(a => (a.verdict === 'open' ? a : { ...a, isSent: true })) : list
  })

  return text
}

const judge = async ($: EngineInterface, id: number, verdict: Verdict, note?: string) => {
  let guess = ''
  await update($, items, list =>
    list.map(a => (a.id === id ? ((guess = a.text), { ...a, verdict, note, isSent: false }) : a)),
  )
  // A correction becomes a project rule; marking the assumption right after all drops it.
  if (guess && verdict === 'wrong' && note?.trim()) await changeRules($, l => withRule(l, guess, note))
  if (guess && verdict === 'right') await changeRules($, l => l.filter(r => r.assumption !== guess))
  // Mid-turn, a tool result or the Stop hook carries it; idle, a wrong verdict starts a turn.
  if (verdict !== 'wrong' || (await read($, isBusy))) return
  const text = await takeFeedback($)
  if (text) await $.prompt.submit({ text })
}

const openPane = ($: EngineInterface) =>
  $.ui.open({ id: PANE, title: '가정 목록', focus: true, closeOnEscape: true, columns: 56 })

const MARK: Record<Verdict, string> = { open: '?', right: '✓', wrong: '✗' }
const COLOR = { open: 'yellow', right: 'green', wrong: 'red' } as const

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: TOOL,
      description:
        '작업하며 방금 세운 가정을 기록해, 사용자가 옆 패널에서 확인하거나 정정할 수 있게 한다. 바로 반환되니 계속 작업한다.',
      inputSchema: {
        type: 'object',
        properties: {
          assumption: { type: 'string', description: '가정, 짧은 한국어 한 문장.' },
          context: { type: 'string', description: '선택: 이 가정에 기대는 작업이 무엇인지 (한국어).' },
        },
        required: ['assumption'],
      },
      isDeferred: false,
    })
    await $.command.register({
      name: 'assumptions',
      description: 'assumption-tracker: Claude가 세운 가정 목록 패널 열기',
      immediate: true,
    })
    await update($, cwd, () => e.cwd)
    await loadRules($)

    return next(e)
  })

  on('classic.CwdChanged', async ($, e, next) => {
    const r = await next(e)
    await update($, cwd, () => e.new_cwd)
    await loadRules($)
    return r
  }).catch(($, e, next) => next(e))

  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    const learned = rulesText(await storedRules($, await rulesKey($)))

    return {
      sections: [
        ...out.sections,
        { id: `${PLUGIN}:guidance`, text: GUIDANCE, scope: 'session' },
        ...(learned ? [{ id: `${PLUGIN}:rules`, text: learned, scope: 'session' as const }] : []),
      ],
    }
  })

  on('tool.call', { tool: /^mcp__assumption-tracker__log_assumption$/ }, async ($, e) => {
    // A plugin tool's input arrives flattened onto the event, untyped.
    const input = e as unknown as { assumption?: unknown; context?: unknown }
    const text = String(input.assumption ?? '').trim()
    if (!text) return { deny: 'assumption 값이 필요해요.' }
    const context = typeof input.context === 'string' && input.context.trim() ? input.context.trim() : undefined
    let id = 0
    await update($, lastId, n => (id = n + 1))
    await update($, items, list => [...list, { id, text, context, verdict: 'open' as const, isSent: false }])

    return { result: `가정 #${id}로 기록했어요. 계속 작업하세요. 사용자가 정정할 수 있어요.` }
  })

  // Verdicts given mid-turn ride along with the next tool result Claude reads.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r
    const text = await takeFeedback($)

    return text ? { ...r, context: [...(r.context ?? []), text] } : r
  }).catch(($, e, next) => next(e))

  // A verdict given while Claude wrote its last message: keep the turn going to act on it.
  on('classic.Stop', async ($, e, next) => {
    const r = await next(e)
    if (r.block || !hasUnsentWrong(await read($, items))) return r
    const text = await takeFeedback($)

    return text ? { ...r, block: text } : r
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    await update($, isBusy, () => true)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!e.agentId) await update($, isBusy, () => false)
    return r
  })

  on('command.run', { command: 'assumptions' }, async $ => {
    await openPane($)
    return {}
  })

  // The small collapsed view: one line above the prompt; a click expands the panel.
  // Stacked over whatever else draws there (another mod's band).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const list = await read($, items)
    const ruleCount = (await read($, rules)).length
    // A new session has no assumptions yet but may have project rules; keep the band (and its 0 key) for those.
    if (e.props.hasSurvey || (!list.length && !ruleCount)) return below
    const { Box, Button } = $.ui.resolve(e)
    const label = bandText(list, ruleCount)

    // Clicks only reach the band in fullscreen; a bare digit in an empty prompt works everywhere.
    return (
      <Box flexDirection="column">
        <Button key="open-assumptions" plain hotkey="0" label={label} onPress={() => void openPane($)} />
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const list = await read($, items)
    const ruleList = await read($, rules)
    if (!list.length && !ruleList.length)
      return <Text dimColor>아직 기록된 가정이 없어요. Claude가 가정을 세울 때마다 여기에 쌓여요.</Text>
    // 1 / 2 answer the newest unreviewed assumption, so a run of them goes key by key.
    const next = [...list].reverse().find(a => a.verdict === 'open')

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{statsText(list, ruleList)}</Text>
        {/* Rules sit at the top: a long assumption list would push them past the pane's height. */}
        {ruleList.length > 0 && (
          <Box flexDirection="column">
            <Text bold>프로젝트 규칙 (정정에서 생김, 매 세션 Claude에게 전달)</Text>
            {ruleList.map(r => (
              <Box key={`rule${r.id}`} flexDirection="row" gap={2}>
                <Text>
                  {r.correction} <Text dimColor>(원래 가정: {r.assumption})</Text>
                </Text>
                <Button
                  key={`delete-rule-${r.id}`}
                  dimColor
                  label="✗ 삭제"
                  onPress={() => void changeRules($, l => l.filter(x => x.id !== r.id))}
                />
              </Box>
            ))}
          </Box>
        )}
        <Text dimColor>
          {RIGHT_KEY} 맞음 · {WRONG_KEY} 틀림 (가장 최근 미확인 가정) · Tab 이동 · Esc 닫기
        </Text>
        {[...list].reverse().map(a => (
          <Box key={`a${a.id}`} flexDirection="column">
            <Text bold color={COLOR[a.verdict]}>
              {MARK[a.verdict]} #{a.id} {a.text}
            </Text>
            {a.context && <Text dimColor>{a.context}</Text>}
            {a.note && <Text>→ {a.note}</Text>}
            <Box flexDirection="row" gap={2}>
              <Button
                key={`right-${a.id}`}
                label="✓ 맞음"
                hotkey={a === next ? RIGHT_KEY : undefined}
                variant={a.verdict === 'right' ? 'primary' : undefined}
                onPress={() => void judge($, a.id, 'right')}
              />
              <Button
                key={`wrong-${a.id}`}
                label="✗ 틀림"
                hotkey={a === next ? WRONG_KEY : undefined}
                variant={a.verdict === 'wrong' ? 'primary' : undefined}
                onPress={() => void judge($, a.id, 'wrong', a.note)}
              />
              {a.verdict !== 'open' && <Text dimColor>{a.isSent ? 'Claude에게 전달됨' : '아직 전달 안 됨'}</Text>}
            </Box>
            {Input && a.verdict !== 'right' && (
              <Input
                key={`fix-${a.id}`}
                placeholder="어떻게 해야 맞나요? 적고 Enter"
                value={a.note ?? ''}
                submitLabel="보내기"
                onSubmit={t => void (t.trim() && judge($, a.id, 'wrong', t.trim()))}
              />
            )}
          </Box>
        ))}
        {list.length > 0 && (
          <Button
            key="clear"
            dimColor
            label="확인한 것 지우기"
            onPress={() => void update($, items, l => l.filter(a => a.verdict === 'open' || !a.isSent))}
          />
        )}
      </Box>
    )
  })
}
