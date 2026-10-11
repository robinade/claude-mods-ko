import { expect, test } from 'claude-code/testing'

const DIR = '/home/me/.claude/session-tracker/-work-app'
const NOW = 1_000_000_000_000

test('tracks prompt, todos and files; shows other sessions in pane and band', async ($, on) => {
  const files = new Map<string, string>()
  const record = (id: string, extra: object) =>
    files.set(`${DIR}/${id}.json`, JSON.stringify({ id, root: '/work/app', startedAt: 0, tasks: [], ...extra }))
  record('ended', { beatAt: 0, lastPrompt: 'old work', title: 'Old work' })
  record('live', {
    beatAt: NOW,
    isBusy: true,
    lastPrompt: 'fix auth',
    title: 'Auth fix',
    doing: 'patching middleware',
    next: 'run tests',
    files: ['src/auth.ts'],
    edits: { 'src/auth.ts': NOW - 2 * 60_000 },
  })
  const toasts: string[] = []

  on('clock.now', () => ({ value: NOW }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 'mine' }))
  on('session.root', () => ({ value: '/work/app' }))
  on('fs.exists', (_$, e) => ({
    value: files.has(e.path) || [...files.keys()].some(k => k.startsWith(`${e.path}/`)),
  }))
  on('fs.read', (_$, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', (_$, e) => ({
    value: [...files.keys()]
      .filter(k => k.startsWith(`${e.path}/`))
      .map(k => ({ name: k.slice(e.path!.length + 1), kind: 'file' as const, size: 1, mtimeMs: NOW, isLink: false })),
  }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('tool.call', () => ({ result: {} }) as never)
  on('ui.open', () => ({ value: undefined }) as never)
  // Stands in for the engine's own (empty) band beneath the plugin.
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)

  await $.prompt.submit({ text: 'Add login page' } as never)
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Build form', status: 'in_progress', activeForm: 'Building form' },
      { content: 'Wire API', status: 'pending', activeForm: 'Wiring API' },
    ],
  } as never)
  const edit = { tool: 'Edit', file_path: '/work/app/src/auth.ts', old_string: 'a', new_string: 'b' } as never
  const first = await $.tool.call(edit)

  const saved = JSON.parse(files.get(`${DIR}/mine.json`)!)
  expect(saved.lastPrompt).toBe('Add login page')
  expect(saved.isBusy).toBe(true)
  expect(saved.files).toEqual(['src/auth.ts'])
  expect(saved.edits).toEqual({ 'src/auth.ts': NOW })
  expect(saved.tasks.map((t: { status: string }) => t.status)).toEqual(['in_progress', 'pending'])

  // clash: the live session edited src/auth.ts 2m ago → toast + note for Claude, edit still runs
  expect(first.deny).toBeUndefined()
  expect(toasts.some(t => t.includes('src/auth.ts') && t.includes('Auth fix') && t.includes('2분 전'))).toBe(true)
  const note = (first.context ?? []).join('\n')
  expect(note).toContain('src/auth.ts 파일을 수정했어요')
  expect(note).toContain('다시 읽고')
  expect(note).toContain('Auth fix')
  expect(note).toContain('patching middleware')

  // our edit is now newer than theirs: no repeat warning
  const toastCount = toasts.length
  const second = await $.tool.call(edit)
  expect(second.context).toBeUndefined()
  expect(toasts.length).toBe(toastCount)

  // a file nobody else touched: no warning
  const other = await $.tool.call({ tool: 'Write', file_path: '/work/app/src/login.tsx', content: 'x' } as never)
  expect(other.context).toBeUndefined()
  expect(toasts.length).toBe(toastCount)

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({
      plugin: 'session-tracker',
      surface,
      component: 'Pane',
      requestId: 'session-tracker',
      props: {} as never,
    })
    expect(await pane.find({ type: 'Text', text: /Build form/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /Wire API/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /1\/2|0\/2/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /claude --resume ended/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /파일 충돌 \(최근 30분\)/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /src\/auth\.ts · "Auth fix" 세션도 2분 전 수정/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /이 세션 · 방금 시작 · 대화 1번/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /종료/ })).toBeDefined()

    const band = await $.ui.mount({
      plugin: 'session-tracker',
      surface,
      component: 'AbovePrompt',
      props: {} as never,
    })
    expect(await band.find({ type: 'Text', text: /Auth fix/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /patching middleware/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /나와 같은 파일/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /충돌: src\/auth\.ts .*patching middleware/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /자세히 보기: \/tracker/ })).toBeDefined()
  }

  const ran = await $.command.run({ command: 'tracker', args: '' } as never)
  expect(JSON.stringify(ran)).toContain('세션 패널을 열었어요')
})

test('a turn ends with a Korean summary saved under the English field names', async ($, on) => {
  const files = new Map<string, string>()
  const prompts: string[] = []
  on('clock.now', () => ({ value: NOW }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 'mine' }))
  on('session.root', () => ({ value: '/work/app' }))
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) || [...files.keys()].some(k => k.startsWith(`${e.path}/`)) }))
  on('fs.read', (_$, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', (_$, e) => ({
    value: [...files.keys()]
      .filter(k => k.startsWith(`${e.path}/`))
      .map(k => ({ name: k.slice(e.path!.length + 1), kind: 'file' as const, size: 1, mtimeMs: NOW, isLink: false })),
  }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
  on('turn.complete', ($, e) => ({ text: e.answer }) as never)
  on('model.complete', (_$, e) => {
    prompts.push(e.prompt)
    return {
      value: {
        isAnswered: true,
        text: 'TITLE: 로그인 페이지\n**DONE:** 폼 화면 만듦\nDOING： API 연결 중\nNEXT: 테스트 실행',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    } as never
  })

  await $.prompt.submit({ text: '로그인 페이지 만들어 줘' } as never)
  await $.turn.complete({ answer: '폼을 만들었어요.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as never)

  expect(prompts[0]).toContain('사용자의 최근 요청: 로그인 페이지 만들어 줘')
  const saved = JSON.parse(files.get(`${DIR}/mine.json`)!)
  expect([saved.title, saved.done, saved.doing, saved.next]).toEqual(['로그인 페이지', '폼 화면 만듦', 'API 연결 중', '테스트 실행'])
  expect(saved.lastAnswer).toBe('폼을 만들었어요.')
})

test('a summary that keeps failing is explained once, with the setting to fix when that is the cause', async ($, on) => {
  const files = new Map<string, string>()
  const logs: string[] = []
  on('clock.now', () => ({ value: NOW }))
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? '/home/me' : '0' }))
  on('session.id', () => ({ value: 'mine' }))
  on('session.root', () => ({ value: '/work/app' }))
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) || [...files.keys()].some(k => k.startsWith(`${e.path}/`)) }))
  on('fs.read', (_$, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.list', () => ({ value: [] }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', (_$, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }) as never)
  on('model.complete', () =>
    ({ value: { isAnswered: false, reason: 'api-error', status: 429, error: 'rate_limit', usage: { input_tokens: 0, output_tokens: 0 } } }) as never,
  )

  await $.prompt.submit({ text: '로그인 페이지 만들어 줘' } as never)
  for (const turnId of ['t1', 't2', 't3']) {
    await $.turn.complete({ answer: '했어요.', durationMs: 1000, isAborted: false, turnId, reason: 'answer' } as never)
  }

  const mine = logs.filter(l => l.includes('세션 요약'))
  expect(mine).toHaveLength(1)
  expect(mine[0]).toContain('CLAUDE_CODE_ATTRIBUTION_HEADER')
  expect(mine[0]).not.toContain('session-tracker:') // the engine adds the mod's name itself
})
