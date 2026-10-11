import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { SessionRow, Status } from '../types'
import { ago, parseTitles, resumeCommand, sorted, toRow, waitingText } from './rows'

const PANE = 'session-monitor'
const TITLE = '세션'
const REPLY = 'reply-text'
const sessions = atom({ plugin: 'session-monitor', key: 'sessions' } as const, [])
const problem = atom({ plugin: 'session-monitor', key: 'problem' } as const, '')
const replyTo = atom({ plugin: 'session-monitor', key: 'replyTo' } as const, '')

const LOOK: Record<Status, { icon: string; color: string; label: string }> = {
  working: { icon: '●', color: 'claude', label: '작업 중' },
  waiting: { icon: '?', color: 'warning', label: '확인 필요' },
  done: { icon: '✓', color: 'success', label: '완료' },
}

const label = (row: SessionRow) => row.title || row.name || row.project

let dir = ''
let me = ''
let titles = new Map<string, string>()
let titledAt = 0

// The title /resume shows is the transcript's last ai-title record; grep it rather
// than read transcripts that can run past $.fs.read's 4 MiB cap.
async function fetchTitles($: EngineInterface, ids: string[]) {
  const now = await $.clock.now()
  if (ids.length === 0 || (now - titledAt < 15_000 && ids.every(id => titles.has(id)))) return
  titledAt = now
  const script =
    'd=$1; shift; for id; do l=$(grep -h \'"type":"ai-title"\' "$d"/*/"$id".jsonl 2>/dev/null | tail -1); printf "%s\\t%s\\n" "$id" "$l"; done'
  const projects = dir.replace(/sessions$/, 'projects')
  const run = await $.process.run(['sh', '-c', script, '_', projects, ...ids])
  titles = parseTitles(run.stdout)
  for (const id of ids) if (!titles.has(id)) titles.set(id, '') // untitled yet: don't re-grep every tick
}

// Claude Code keeps one file per running session in ~/.claude/sessions, every project included.
async function refresh($: EngineInterface) {
  const problems: string[] = []
  const rows: SessionRow[] = []
  const entries = await $.fs.list(dir).catch(err => {
    problems.push(`세션 목록을 못 읽었어요 (${dir}): ${err}`)
    return []
  })
  for (const entry of entries) {
    if (!entry.name.endsWith('.json')) continue
    try {
      const row = toRow(await $.fs.read(`${dir}/${entry.name}`))
      if (row) rows.push(row)
    } catch (err) {
      problems.push(`세션 파일을 못 읽었어요 (${entry.name}): ${err}`)
    }
  }
  // A crashed session leaves its file behind: keep only pids still running.
  const pids = rows.map(r => r.pid).join(',')
  const ps = pids
    ? await $.process.run(['ps', '-o', 'pid=', '-p', pids]).catch(err => {
        problems.push(`실행 중인 세션 확인 실패 (ps): ${err}`)
        return null
      })
    : null
  const alive = new Set(ps ? ps.stdout.split(/\s+/).filter(Boolean).map(Number) : rows.map(r => r.pid))
  const live = rows.filter(r => alive.has(r.pid))
  await fetchTitles($, live.map(r => r.id)).catch(err => problems.push(`세션 제목 읽기 실패: ${err}`))
  const next = sorted(live.map(r => ({ ...r, title: r.title || titles.get(r.id) || '' })))
  const text = problems.join('\n')
  if ((await read($, problem)) !== text) await update($, problem, () => text)
  const prev = await read($, sessions)
  if (JSON.stringify(prev) !== JSON.stringify(next)) {
    await update($, sessions, () => next)
    // The session being replied to ended: drop its reply field.
    const target = await read($, replyTo)
    const ended = target !== '' && !next.some(r => r.id === target)
    if (ended) await update($, replyTo, () => '')
    if (prev.length !== next.length || ended) await resize($)
  }
}

// Header line + one line per session, + the reply field while one is open.
async function paneRows($: EngineInterface) {
  const count = (await read($, sessions)).length
  return Math.max(2, count + 1) + ((await read($, replyTo)) ? 1 : 0)
}

// Grow or shrink the open pane so nothing needs scrolling.
async function resize($: EngineInterface) {
  if ((await $.ui.panes()).some(p => p.id === PANE && p.isShown)) {
    await $.ui.open({ id: PANE, title: TITLE, rows: await paneRows($) })
  }
}

// Resolves whether the pane is now open.
async function toggle($: EngineInterface): Promise<boolean> {
  const pane = (await $.ui.panes()).find(p => p.id === PANE)
  if (pane?.isShown) {
    await $.ui.close({ id: PANE })
    return false
  }
  await $.ui.open({ id: PANE, title: TITLE, rows: await paneRows($), focus: true, closeOnEscape: true })
  return true
}

// No API switches this terminal to another live session or focuses its window,
// so "jump" hands over the exact command to resume it.
async function jump($: EngineInterface, row: SessionRow, surface: RenderSurface) {
  const command = resumeCommand(row)
  const copied = await $.ui.copy({ text: command, surface })
  $.ui.toast(copied.isCopied ? `복사했어요. 다른 터미널에 붙여 넣으세요: ${command}` : `다른 터미널에서 실행하세요: ${command}`, {
    timeoutMs: 8_000,
  })
}

async function openReply($: EngineInterface, row: SessionRow) {
  const open = (await read($, replyTo)) === row.id
  await update($, replyTo, () => (open ? '' : row.id))
  await resize($)
  // Move the ring onto the field; typing still works by Tab if this is refused.
  if (!open) await $.ui.focus({ requestId: PANE, key: REPLY }).catch(() => {})
}

// Delivered through the engine's own peer messaging (what SendMessage uses):
// queued at the other session, which reads it on its next turn.
async function sendReply($: EngineInterface, text: string) {
  const id = await read($, replyTo)
  await update($, replyTo, () => '')
  await resize($)
  const line = text.trim()
  if (!id || !line) return
  const row = (await read($, sessions)).find(r => r.id === id)
  const name = row ? label(row) : id
  const sent = await $.session.send({ to: { sessionId: id }, text: line })
  $.ui.toast(sent.isDelivered ? `"${name}" 세션에 보냈어요.` : `"${name}" 세션에 못 보냈어요: ${sent.reason}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    dir = `${await $.env.get('HOME')}/.claude/sessions`
    me = await $.session.id()
    await $.command.register({ name: 'monitor', description: '모든 프로젝트의 세션 목록 패널을 열거나 닫아요' })
    $.clock.every(2_000, () => refresh($))
    await refresh($)
    return next(e)
  })

  on('command.run', { command: 'monitor' }, async $ => {
    const opened = await toggle($)
    return { text: opened ? '세션 패널을 열었어요. Esc로 닫아요.' : '세션 패널을 닫았어요.' }
  })

  // Stacked over whatever else draws there (another mod's band).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (e.props.hasSurvey) return below
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, sessions)
    const count = (s: Status) => list.filter(r => r.status === s).length

    return (
      <Box flexDirection="column">
        <Box>
          <Button key="sessions" label="세션" onPress={() => toggle($)} />
          <Text> </Text>
          {(['waiting', 'working', 'done'] as const).map(s => (
            <Text color={LOOK[s].color}>
              {LOOK[s].icon} {LOOK[s].label} {count(s)}{'  '}
            </Text>
          ))}
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Button, Text } = ui
    // The mobile app draws no text field: no reply there.
    const Input = 'Input' in ui ? ui.Input : undefined
    const list = await read($, sessions)
    const now = await $.clock.now()
    const trouble = await read($, problem)
    const target = await read($, replyTo)
    const replying = list.find(r => r.id === target)

    return (
      <Box flexDirection="column">
        <Text dimColor>실행 중 {list.length}개 · 모든 폴더</Text>
        {trouble !== '' && <Text color="error">{trouble}</Text>}
        {list.length === 0 && <Text dimColor>실행 중인 세션이 없어요.</Text>}
        {list.map(row => {
          const look = LOOK[row.status]
          const isMe = row.id === me
          return (
            // One line per session so a long list still fits the pane; the
            // buttons stay put while the text truncates.
            <Box key={`row:${row.id}`} flexDirection="row" gap={1}>
              <Box flexGrow={1} flexShrink={1}>
                <Text wrap="truncate-end">
                  <Text color={look.color}>{look.icon} </Text>
                  <Text bold>{label(row)}</Text>
                  {isMe && <Text dimColor> (이 세션)</Text>}
                  <Text color={look.color}> {waitingText(row.waitingFor) || look.label}</Text>
                  <Text dimColor> {ago(now - row.since)} · {row.project}</Text>
                </Text>
              </Box>
              {Input && !isMe && row.status === 'waiting' && (
                <Button key={`reply:${row.id}`} label="답장" plain onPress={() => openReply($, row)} />
              )}
              {!isMe && (
                <Button key={`jump:${row.id}`} label="이어하기" plain dimColor onPress={p => jump($, row, p.surface)} />
              )}
            </Box>
          )
        })}
        {Input && replying && (
          <Input
            key={REPLY}
            label={`→ ${label(replying)}`}
            placeholder="한 줄로 쓰고 Enter로 보내요 · 비우면 취소"
            submitLabel="보내기"
            autoFocus
            onSubmit={(text: string) => sendReply($, text)}
          />
        )}
      </Box>
    )
  })
}
