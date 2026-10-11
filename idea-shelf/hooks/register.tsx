import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Idea } from '../types'

import { fitsTopics, pathWords, words } from './match'

const PANE = 'idea-shelf'
const TOOL = 'mcp__idea-shelf__shelve_idea'
const ideas = atom({ plugin: 'idea-shelf', key: 'ideas' } as const, [])
const nudge = atom({ plugin: 'idea-shelf', key: 'nudge' } as const, [])

const GUIDANCE = `# 아이디어 선반 (idea shelf)
사용자는 한국어 사용자예요. 지금 작업 범위 밖의 곁가지나 부수 개선점(리팩터링, 빠진 테스트, 정리, 후속 기능)이 눈에 띄면 작업 도중에 손대지 마세요. 대신 \`${TOOL}\` 도구를 호출해 한국어 한 줄로 적고, 하던 작업을 이어가세요. 그 한 줄에는 관련 파일이나 영역 이름을 넣되, 파일·폴더·함수 이름은 원래 표기 그대로 쓰세요(예: "parser.ts 를 lexer 와 grammar 로 나누기"). 사용자가 나중에 선반을 보고 고릅니다.`

// One shelf per project, keyed by the session's working directory.
async function storeKey($: EngineInterface) {
  return `ideas:${await $.session.cwd()}`
}

function showCount($: EngineInterface, list: Idea[]) {
  $.ui.status(list.length ? `💡 아이디어 ${list.length}개` : undefined)
}

// The store is the shelf; the atom is this session's copy, which the pane draws.
// A /clear starts a new session with an empty atom and no session.start, so the
// atom is filled from the store once per session id, before anything reads or
// writes it. Without this the pane looked empty after /clear, and the next idea
// overwrote the store with a one-item list.
let loadedFor: string | undefined
async function load($: EngineInterface) {
  const session = await $.session.id()
  if (loadedFor === session) return
  const stored = ((await $.store.get(await storeKey($))) ?? []) as Idea[]
  const list = await update($, ideas, () => stored)
  loadedFor = session
  showCount($, list)
}

// Writes the shelf to the atom (redraws) and the store (survives sessions).
async function save($: EngineInterface, fn: (list: Idea[]) => Idea[]) {
  await load($)
  const list = await update($, ideas, fn)
  await $.store.set(await storeKey($), list)
  showCount($, list)
}

async function add($: EngineInterface, text: string, source: Idea['source'] = 'you') {
  const id = `${await $.clock.now()}-${Math.random().toString(36).slice(2, 6)}`
  await save($, list => [...list, { id, text, source }])
  return id
}

// Removes the ideas from the shelf and hands them to Claude as one prompt.
async function send($: EngineInterface, picked: Idea[]) {
  if (!picked.length) return
  const ids = new Set(picked.map(idea => idea.id))
  await save($, list => list.filter(one => !ids.has(one.id)))
  await update($, nudge, list => list.filter(id => !ids.has(id)))
  const text = picked.length === 1
    ? picked[0]!.text
    : `선반에 올려 둔 아이디어예요. 이어서 진행해 주세요:\n${picked.map(idea => `- ${idea.text}`).join('\n')}`
  // Queued by the engine; runs once Claude is idle.
  void $.prompt.submit({ text, asUser: true })
  $.ui.toast(picked.length === 1 ? '아이디어를 Claude에게 넘겼어요 (쉬는 차례에 시작해요)' : `아이디어 ${picked.length}개를 Claude에게 넘겼어요 (쉬는 차례에 시작해요)`)
}

export const register: Register = on => {
  // What the current main-loop turn touched; reset at each turn.start.
  let topics = new Set<string>()
  let shelvedThisTurn = new Set<string>()
  // Ideas whose nudge was dismissed: never nudged again this session.
  const dismissed = new Set<string>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'idea',
      description: '아이디어를 나중을 위해 선반에 올려요 (내용 없이 치면 선반 열기)',
      argumentHint: '[아이디어]',
      immediate: true,
    })
    await $.tool.register({
      name: 'shelve_idea',
      description: '지금 손대지 않고, 사용자가 나중에 검토하도록 곁가지 아이디어를 선반에 올려요. ' +
        '작업 도중 발견한, 현재 범위 밖의 개선점에 쓰세요. 한국어 한 줄로 쓰고 관련 파일이나 영역 이름을 넣으세요.',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: '아이디어 한 줄 (한국어)' } },
        required: ['text'],
      },
      isDeferred: false,
    })
    await load($)

    return next(e)
  })

  // After a /clear: the new session's atom starts empty, so fill it again.
  on('classic.SessionStart', async ($, e, next) => {
    await load($)
    return next(e)
  }).catch(($, e, next) => next(e)) // a load slip never blocks the session

  // Tell the model about the tool, wherever it is offered.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.includes(TOOL)) return composed
    return { sections: [...composed.sections, { id: 'idea-shelf:guidance', text: GUIDANCE, scope: 'session' as const }] }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const text = typeof e.text === 'string' ? e.text.trim() : ''
    if (!text) return { deny: 'shelve_idea 에는 비어 있지 않은 `text` 가 필요해요.' }
    shelvedThisTurn.add(await add($, text, 'claude'))
    $.ui.toast(`Claude가 선반에 올렸어요: ${text}`)
    return { result: `사용자의 선반에 올렸어요: ${text}` }
  }).catch(() => ({ deny: 'idea-shelf: 아이디어를 선반에 올리지 못했어요.' }))

  on('command.run', { command: 'idea' }, async ($, e) => {
    const text = e.args.trim()
    if (!text) {
      await load($)
      await $.ui.open({ id: PANE, title: '아이디어 선반', focus: true })
      return { text: '아이디어 선반을 열었어요.' }
    }
    await add($, text)
    return { text: `선반에 올렸어요: ${text}` }
  })

  // Relevance tracking: the prompt's words and the files written this turn.
  on('turn.start', async ($, e, next) => {
    topics = new Set(words(e.text))
    shelvedThisTurn = new Set()
    await load($)
    await update($, nudge, () => [])
    return next(e)
  })

  on('tool.call', { tool: ['Edit', 'Write', 'NotebookEdit'] }, async ($, e, next) => {
    const ran = await next(e)
    const input = e as { file_path?: unknown; notebook_path?: unknown }
    const path = input.file_path ?? input.notebook_path
    if (ran.deny === undefined && !ran.isError && typeof path === 'string') {
      for (const word of pathWords(path)) topics.add(word)
    }
    return ran
  }).catch(($, e, next) => next(e)) // a tracking slip never blocks the edit

  // At most one nudge per main-loop turn, for ideas sharing a keyword with it.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && !e.isAborted && topics.size) {
      const fits = (await read($, ideas)).filter(idea =>
        !shelvedThisTurn.has(idea.id) && !dismissed.has(idea.id) && fitsTopics(idea.text, topics))
      await update($, nudge, () => fits.map(idea => idea.id))
    }
    return next(e)
  })

  // Stacked over whatever else draws there (another mod's band).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const ids = await read($, nudge)
    if (e.props.hasSurvey || e.props.isWorking || !ids.length) return below
    const fits = (await read($, ideas)).filter(idea => ids.includes(idea.id))
    if (!fits.length) return below

    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Box>
          <Text>💡 방금 한 작업과 맞는 아이디어 {fits.length}개: </Text>
          <Text dimColor wrap="truncate-end">{fits.map(idea => idea.text).join(' · ')} </Text>
          <Button key="nudge-send" label="보내기" variant="primary" onPress={() => send($, fits)} />
          <Button key="nudge-dismiss" label="닫기" role="dismiss" onPress={async () => {
            for (const idea of fits) dismissed.add(idea.id)
            await update($, nudge, () => [])
          }} />
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    // mobile has no Input; there the shelf is fed by /idea alone
    const Input = 'Input' in elements ? elements.Input : undefined
    const list = await read($, ideas)

    return (
      <Box flexDirection="column">
        {Input && (
          <Input key="new" label="+ " placeholder="새 아이디어…" submitLabel="올리기" autoFocus
            onSubmit={value => { if (value.trim()) void add($, value.trim()) }} />
        )}
        {list.length === 0 && <Text dimColor>선반이 비어 있어요. /idea &lt;내용&gt; 으로 올려 보세요.</Text>}
        {list.map(idea => (
          <Box key={idea.id}>
            <Button key={`send-${idea.id}`} label="보내기" onPress={() => send($, [idea])} />
            <Button key={`del-${idea.id}`} label="✕" onPress={() => save($, l => l.filter(o => o.id !== idea.id))} />
            <Text dimColor> {idea.source === 'claude' ? 'Claude' : '나'}</Text>
            <Text> {idea.text}</Text>
          </Box>
        ))}
      </Box>
    )
  })
}
