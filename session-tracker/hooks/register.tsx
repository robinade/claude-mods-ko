import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SessionRecord, Task } from '../types'
import { whyNoReply } from './modelhint'
import { clipChars, clipWidth, folderKey, nfc, padWidth } from './text'

const PANE = 'session-tracker'
const BEAT_MS = 15_000
const STALE_MS = 60_000
const KEEP_MS = 7 * 24 * 3600_000
const CLASH_MS = 30 * 60_000 // edits older than this no longer count as a clash
const PANE_TITLE = '이 폴더의 세션'
const sessions = atom({ plugin: 'session-tracker', key: 'sessions' } as const, [])
const isCollapsed = atom({ plugin: 'session-tracker', key: 'isCollapsed' } as const, false)

// Last paragraph of the answer: fallback until the first summary lands.
const tail = (answer: string) =>
  clipChars(answer.trim().split(/\n\s*\n/).at(-1) ?? '', 300)

export const isAlive = (s: SessionRecord, now: number) =>
  s.endedAt === undefined && now - s.beatAt < STALE_MS

// '방금', '2분 전', '3시간 전', '2일 전'.
export const agoText = (ms: number) => {
  const m = Math.round(ms / 60_000)
  return m < 1
    ? '방금'
    : m < 60
      ? `${m}분 전`
      : m < 1440
        ? `${Math.round(m / 60)}시간 전`
        : `${Math.round(m / 1440)}일 전`
}

// Pane row labels, padded by terminal columns so the values line up.
const LABEL_COLS = 8
const label = (text: string) => padWidth(text, LABEL_COLS)

const nameOf = (s: SessionRecord) => s.title ?? (s.lastPrompt ? clipWidth(s.lastPrompt, 40) : s.id.slice(0, 8))

const doingOf = (s: SessionRecord) =>
  s.tasks.find(t => t.status === 'in_progress')?.text ?? s.doing

const nextOf = (s: SessionRecord) =>
  s.tasks.find(t => t.status === 'pending')?.text ?? s.next

const bar = (tasks: Task[]) => {
  const done = tasks.filter(t => t.status === 'completed').length
  const cells = Math.min(10, tasks.length)
  const filled = Math.round((done / tasks.length) * cells)
  return `${'▰'.repeat(filled)}${'▱'.repeat(cells - filled)} ${done}/${tasks.length}`
}

const shared = (a: SessionRecord, b: SessionRecord) =>
  (a.files ?? []).filter(f => (b.files ?? []).includes(f))

const isRecent = (at: number | undefined, now: number) => at !== undefined && now - at < CLASH_MS

type Clash = { file: string; other: SessionRecord; at: number }

// Files both this session and another live one edited within CLASH_MS.
const clashesOf = (mine: SessionRecord | undefined, list: SessionRecord[], now: number): Clash[] =>
  !mine
    ? []
    : list
        .filter(o => o.id !== mine.id && isAlive(o, now))
        .flatMap(o =>
          Object.entries(o.edits ?? {})
            .filter(([f, at]) => isRecent(at, now) && isRecent(mine.edits?.[f], now))
            .map(([file, at]) => ({ file, other: o, at })),
        )
        .sort((a, b) => b.at - a.at)

const clashLine = (c: Clash, now: number) => {
  const task = doingOf(c.other) ?? c.other.lastPrompt
  return `${c.file} · "${nameOf(c.other)}" 세션도 ${agoText(now - c.at)} 수정${task ? ` · ${clipWidth(task, 60)}` : ''}`
}

// Module variables reset on hot reload; ensure() reloads `me` from disk.
let me: SessionRecord | undefined
let dir = ''

async function ensure($: EngineInterface) {
  const id = await $.session.id()
  if (me?.id === id) return me
  const root = await $.session.root()
  const home = (await $.env.get('HOME')) ?? '/tmp'
  dir = `${home}/.claude/session-tracker/${folderKey(root)}`
  const path = `${dir}/${id}.json`
  const now = await $.clock.now()
  const saved = (await $.fs.exists(path))
    ? (JSON.parse(await $.fs.read(path)) as SessionRecord)
    : undefined
  me = saved
    ? { ...saved, endedAt: undefined, isBusy: false }
    : { id, root, startedAt: now, beatAt: now, tasks: [] }
  return me
}

async function refresh($: EngineInterface) {
  if (!dir || !(await $.fs.exists(dir))) return
  const now = await $.clock.now()
  const found: SessionRecord[] = []
  for (const entry of await $.fs.list(dir)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue
    if (now - entry.mtimeMs > KEEP_MS) continue
    try {
      const s = JSON.parse(await $.fs.read(`${dir}/${entry.name}`)) as SessionRecord
      // a session that never got a prompt has nothing to show
      if (s.id === me?.id || s.lastPrompt) found.push(s)
    } catch {
      // half-written by another session; next refresh picks it up
    }
  }
  const rank = (s: SessionRecord) => (s.id === me?.id ? 0 : isAlive(s, now) ? 1 : 2)
  found.sort((a, b) => rank(a) - rank(b) || b.beatAt - a.beatAt)
  await update($, sessions, () => found)
  const others = found.filter(s => s.id !== me?.id && isAlive(s, now))
  const overlap = me ? others.filter(s => shared(me!, s).length > 0).length : 0
  $.ui.status(
    others.length
      ? `👥 다른 세션 ${others.length}개${overlap ? ` · ⚠ ${overlap}개가 내 파일을 고치는 중` : ''}`
      : undefined,
  )
}

async function save($: EngineInterface, change?: (s: SessionRecord) => void) {
  const s = await ensure($)
  change?.(s)
  s.beatAt = await $.clock.now()
  await $.fs.write(`${dir}/${s.id}.json`, JSON.stringify(s, null, 2))
  await refresh($)
}

// Whether this session already said why summaries fail; a reload starts it over.
let toldNoSummary = false

// One cheap haiku call per turn → TITLE / DONE / DOING / NEXT.
async function summarize($: EngineInterface, answer: string) {
  const s = await ensure($)
  const prompt = SUMMARY_PROMPT(s, answer)
  const r = await $.model.complete({ model: 'haiku', prompt, maxTokens: 300, timeoutMs: 30_000 })
  if (!r.isAnswered) {
    // Said once per session (the engine already names the mod), not after every turn.
    if (!toldNoSummary) {
      toldNoSummary = true
      $.ui.log(`세션 요약을 못 만들었어요: ${whyNoReply(r, await $.env.get('CLAUDE_CODE_ATTRIBUTION_HEADER'))}`)
    }
    return
  }
  toldNoSummary = false
  const pick = (key: string) => pickLine(r.text, key)
  await save($, x => {
    x.title = pick('TITLE') ?? x.title
    x.done = pick('DONE') ?? x.done
    x.doing = pick('DOING') ?? x.doing
    x.next = pick('NEXT') ?? x.next
  })
}

// The labels stay English (they are what pickLine reads); the values come back in Korean.
export const SUMMARY_PROMPT = (s: SessionRecord, answer: string) =>
  [
    '이 Claude Code 세션이 어디까지 왔는지, 지나가다 보는 동료가 한눈에 알 수 있게 요약하세요.',
    '마크다운 없이 정확히 네 줄로 답하세요. 줄 맨 앞의 영어 라벨(TITLE, DONE, DOING, NEXT)과 콜론은 그대로 쓰고, 값은 한국어로 씁니다.',
    '값은 "~함", "~중"처럼 짧은 개조식으로 쓰고, 코드·파일 이름·명령은 원문 그대로 둡니다.',
    'TITLE: <전체 작업을 가리키는 짧은 이름, 20자 이내. 작업이 분명히 바뀌지 않았으면 이전 TITLE을 유지하되, 이전 TITLE이 한국어가 아니면 한국어로 옮김>',
    'DONE: <지금까지 끝낸 것, 60자 이내>',
    'DOING: <지금 진행 중이거나 끝나지 않은 것, 60자 이내. 사용자 답을 기다리는 중이면 "사용자 답변 대기">',
    'NEXT: <구체적인 다음 단계, 60자 이내>',
    '',
    `이전 요약: TITLE: ${s.title ?? '-'} | DONE: ${s.done ?? '-'} | DOING: ${s.doing ?? '-'} | NEXT: ${s.next ?? '-'}`,
    `할 일 목록: ${s.tasks.map(t => `[${t.status}] ${t.text}`).join('; ') || '없음'}`,
    `수정한 파일: ${(s.files ?? []).join(', ') || '없음'}`,
    `사용자의 최근 요청: ${s.lastPrompt ?? '-'}`,
    `어시스턴트의 최근 답변:\n${answer.slice(-6000)}`,
  ].join('\n')

// `DONE: …`, tolerating bold, list marks and a full-width colon (：) around the label.
export const pickLine = (text: string, key: string) =>
  text
    .match(new RegExp(`^[\\s>*_-]*${key}[\\s*_]*[:：][\\s*_]*(.+)$`, 'mi'))?.[1]
    ?.replace(/\*+\s*$/, '')
    .trim() || undefined

// Records the edit; if another live session edited the same file recently (and
// after our own last edit of it), toasts and returns a note for Claude.
async function trackFile($: EngineInterface, path: string): Promise<string | undefined> {
  const s = await ensure($)
  const rel = nfc(path.startsWith(`${s.root}/`) ? path.slice(s.root.length + 1) : path)
  await refresh($) // pick up the other sessions' latest edits
  const now = await $.clock.now()
  const since = Math.max(s.edits?.[rel] ?? 0, now - CLASH_MS)
  const clash = (await read($, sessions)).find(
    o => o.id !== s.id && isAlive(o, now) && (o.edits?.[rel] ?? 0) > since,
  )
  await save($, x => {
    x.edits = Object.fromEntries(
      Object.entries({ ...x.edits, [rel]: now }).filter(([, at]) => isRecent(at, now)),
    )
    if (!x.files?.includes(rel)) x.files = [rel, ...(x.files ?? [])].slice(0, 12)
  })
  if (!clash) return undefined

  const task = doingOf(clash) ?? clash.lastPrompt
  const when = agoText(now - clash.edits![rel]!)
  $.ui.toast(`⚠ ${rel}: "${nameOf(clash)}" 세션이 ${when} 고쳤어요${task ? ` (${clipWidth(task, 60)})` : ''}`, {
    timeoutMs: 8000,
  })
  return [
    `session-tracker: 이 폴더의 다른 Claude 세션("${nameOf(clash)}"${task ? `, 하는 일: ${clipChars(task, 120)}` : ''})이`,
    `${when} ${rel} 파일을 수정했어요. 앞서 읽은 내용은 오래됐을 수 있으니 ${rel}을(를) 다시 고치기 전에 다시 읽고,`,
    '다른 세션이 바꾼 내용은 그대로 두세요. 내용이 더 이상 맞지 않아 이번 수정이 실패했다면 다시 읽고 다시 시도하세요.',
  ].join(' ')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tracker',
      description: '이 폴더에서 실행 중인 Claude 세션과 각자 하는 일을 보여 줘요',
    })
    await save($)
    $.clock.every(BEAT_MS, () => void save($))

    const now = await $.clock.now()
    if (me?.turns && nextOf(me)) {
      $.ui.toast(`↺ "${nameOf(me)}" 이어서 해요 · 다음: ${nextOf(me)}`, { timeoutMs: 10_000 })
    }
    const others = (await read($, sessions)).filter(s => s.id !== me?.id && isAlive(s, now))
    if (others.length) void $.ui.open({ id: PANE, title: PANE_TITLE })
    return next(e)
  })

  on('command.run', { command: 'tracker' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: PANE_TITLE })
    return { text: '이 폴더의 세션 패널을 열었어요.' }
  })

  on('prompt.submit', async ($, e, next) => {
    await save($, s => {
      s.lastPrompt = clipChars(e.text, 300)
      s.isBusy = true
      s.turns = (s.turns ?? 0) + 1
    })
    return next(e)
  }).catch(($, e, next) => next(e)) // tracking never blocks the prompt

  // The edit always proceeds; on a clash Claude reads a note after the tool result.
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const note = e.agentId === undefined ? await trackFile($, e.file_path) : undefined
    const ran = await next(e)
    return note && ran.deny === undefined ? { ...ran, context: [...(ran.context ?? []), note] } : ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const note = e.agentId === undefined ? await trackFile($, e.file_path) : undefined
    const ran = await next(e)
    return note && ran.deny === undefined ? { ...ran, context: [...(ran.context ?? []), note] } : ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    if (e.agentId === undefined) {
      const tasks: Task[] = e.todos.map((t, i) => ({ id: `todo-${i}`, text: t.content, status: t.status }))
      await save($, s => (s.tasks = tasks))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    const ran = await next(e)
    const task = (ran.result as { task?: { id: string; subject: string } } | undefined)?.task
    if (e.agentId === undefined && task) {
      await save($, s => s.tasks.push({ id: task.id, text: task.subject, status: 'pending' }))
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && (ran.result as { success?: boolean } | undefined)?.success) {
      await save($, s => {
        s.tasks = s.tasks
          .filter(t => !(t.id === e.taskId && e.status === 'deleted'))
          .map(t =>
            t.id !== e.taskId
              ? t
              : {
                  ...t,
                  text: e.subject ?? t.text,
                  status: e.status && e.status !== 'deleted' ? e.status : t.status,
                },
          )
      })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined) {
      await save($, s => {
        s.isBusy = false
        if (e.answer) s.lastAnswer = tail(e.answer)
      })
      if (e.answer) await summarize($, e.answer)
    }
    return ran
  })

  on('session.end', async ($, e, next) => {
    const now = await $.clock.now()
    await save($, s => {
      s.endedAt = now
      s.isBusy = false
    })
    me = undefined // a /clear continues under a new id
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, sessions)
    const now = await $.clock.now()
    const clashes = clashesOf(me, list, now)

    return (
      <Box flexDirection="column" gap={1}>
        {list.length === 0 && <Text dimColor>아직 기록된 세션이 없어요.</Text>}
        {clashes.length > 0 && (
          <Box flexDirection="column" borderStyle="round" borderColor="red" paddingX={1}>
            <Text bold color="red">
              ⚠ 파일 충돌 (최근 {CLASH_MS / 60_000}분)
            </Text>
            {clashes.slice(0, 6).map(c => (
              <Text key={`${c.other.id}:${c.file}`} wrap="truncate">
                {clashLine(c, now)}
              </Text>
            ))}
          </Box>
        )}
        {list.slice(0, 8).map(s => {
          const alive = isAlive(s, now)
          const isMe = s.id === me?.id
          const doing = doingOf(s)
          const nextUp = nextOf(s)
          const overlap = me && !isMe && alive ? shared(me, s) : []
          const [dot, state, tint] = !alive
            ? ['○', `${agoText(now - s.beatAt)} 종료`, 'gray']
            : s.isBusy
              ? ['●', '작업 중', 'yellow']
              : ['◐', '입력 대기', 'green']
          return (
            <Box
              key={s.id}
              flexDirection="column"
              borderStyle="round"
              borderColor={isMe ? 'cyan' : tint}
              borderDimColor={!alive}
              paddingX={1}
            >
              <Box justifyContent="space-between">
                <Text bold wrap="truncate" dimColor={!alive}>
                  {isMe ? '★ ' : ''}{nameOf(s)}
                </Text>
                <Text color={tint}>
                  {dot} {state}
                </Text>
              </Box>
              <Text dimColor wrap="truncate">
                {isMe ? '이 세션' : s.id.slice(0, 8)} · {agoText(now - s.startedAt)} 시작 · 대화 {s.turns ?? 0}번
              </Text>
              {s.done && (
                <Text wrap="wrap">
                  <Text color="green">{label('✓ 완료')}</Text>
                  {s.done}
                </Text>
              )}
              {doing && (
                <Text wrap="wrap">
                  <Text color="yellow">{label('◆ 진행')}</Text>
                  {doing}
                </Text>
              )}
              {nextUp && (
                <Text wrap="wrap">
                  <Text color="cyan">{label('→ 다음')}</Text>
                  {nextUp}
                </Text>
              )}
              {!s.done && !doing && s.lastAnswer && (
                <Text dimColor wrap="wrap">
                  … {s.lastAnswer}
                </Text>
              )}
              {s.tasks.length > 0 && (
                <Text>
                  <Text dimColor>{label('☰ 할 일')}</Text>
                  <Text color="magenta">{bar(s.tasks)}</Text>
                </Text>
              )}
              {s.files && s.files.length > 0 && (
                <Text dimColor wrap="truncate">
                  {label('✎ 파일')}{s.files.slice(0, 5).join(', ')}
                </Text>
              )}
              {overlap.length > 0 && (
                <Text color="red" wrap="truncate">
                  ⚠ 같이 고친 파일: {overlap.join(', ')}
                </Text>
              )}
              {!alive && <Text dimColor>↺ claude --resume {s.id}</Text>}
            </Box>
          )
        })}
      </Box>
    )
  })

  // Always-visible band: what the OTHER live sessions here are doing.
  // Stacked over whatever else draws there (another mod's band).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const now = await $.clock.now()
    const others = (await read($, sessions)).filter(s => s.id !== me?.id && isAlive(s, now))
    if (e.props.hasSurvey || others.length === 0) return below

    const { Box, Button, Text } = $.ui.resolve(e)
    const collapsed = await read($, isCollapsed)
    const clashes = clashesOf(me, await read($, sessions), now)
    const toggle = (
      <Button
        key="toggle"
        label={collapsed ? '펼치기' : '접기'}
        plain
        dimColor
        onPress={() => update($, isCollapsed, v => !v)}
      />
    )

    if (collapsed) {
      return (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text dimColor>👥 이 폴더의 다른 세션 {others.length}개 ·</Text>
            {clashes.length > 0 && (
              <Text color="red">
                ⚠ 파일 충돌 {clashes.length}건 ·
              </Text>
            )}
            {toggle}
          </Box>
          {below}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Box justifyContent="space-between">
          <Text dimColor>👥 이 폴더에서 함께 작업 중 · 자세히 보기: /tracker</Text>
          {toggle}
        </Box>
        {clashes.slice(0, 2).map(c => (
          <Text key={`${c.other.id}:${c.file}`} color="red" wrap="truncate">
            ⚠ 충돌: {clashLine(c, now)}
          </Text>
        ))}
        {others.slice(0, 3).map(s => {
          const doing = doingOf(s) ?? s.lastPrompt
          const nextUp = nextOf(s)
          const overlap = me ? shared(me, s) : []
          return (
            <Box key={s.id} flexDirection="column">
              <Text wrap="truncate">
                <Text color={s.isBusy ? 'yellow' : 'green'}>{s.isBusy ? '●' : '◐'} </Text>
                <Text bold>{nameOf(s)}</Text>
                <Text dimColor> · {s.isBusy ? '작업 중' : '대기 중'}</Text>
                {s.tasks.length > 0 && <Text color="magenta"> {bar(s.tasks)}</Text>}
              </Text>
              {doing && (
                <Text wrap="truncate">
                  {'  '}
                  <Text color="yellow">◆ </Text>
                  {doing}
                  {nextUp && <Text color="cyan">  → </Text>}
                  {nextUp ?? ''}
                </Text>
              )}
              {overlap.length > 0 && (
                <Text color="red" wrap="truncate">
                  {'  '}⚠ 나와 같은 파일: {overlap.join(', ')}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
      {below}
      </Box>
    )
  })
}
