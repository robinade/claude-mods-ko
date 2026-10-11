import type { On } from 'claude-code'
import { test, expect, mock } from 'claude-code/testing'

const FACTS = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as const
const BASE = { sections: [{ id: 'intro', text: 'base', scope: 'shared' }] } as const
const USAGE = { input_tokens: 1, output_tokens: 1 }

test('adds rules section; /plain off removes it', async ($, on) => {
  mock.store(on)
  on('prompt.compose', () => BASE)
  const before = await $.prompt.compose(FACTS)
  expect(before.sections.map(s => s.id)).toEqual(['intro', 'plain-talk:style'])
  expect(before.sections[1]?.text).toContain('**다음 할 일:**')
  expect(before.sections[1]?.text).toContain('모든 답변은 한국어로')

  await $.command.run({ command: 'plain', args: 'off' } as never)
  const after = await $.prompt.compose(FACTS)
  expect(after.sections.map(s => s.id)).toEqual(['intro'])
})

const FAIL = '{"status":"로그인 버그 수정: 승인 기다리는 중","pass":false,"problems":["위를 보라고만 함"],"explained":["api","git branch"]}'
const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never

// The review runs after the turn ends; it sets the "needs you" status last.
// Also stands in for the engine's own (empty) band beneath the plugin.
const reviewDone = (on: On) => {
  const waiters: (() => void)[] = []
  on('ui.status', ($, e) => {
    if (e.text?.startsWith('● 확인 필요')) for (const w of waiters.splice(0)) w()
    return { value: undefined } as never
  })
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  return () => new Promise<void>(r => waiters.push(r))
}

test('failed review shows the grade, asks for one rewrite, offers explained terms', async ($, on) => {
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: FAIL, usage: USAGE } }) as never)
  const submitted: string[] = []
  let gotRewrite: () => void = () => {}
  const rewrite = new Promise<void>(r => (gotRewrite = r))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    gotRewrite()
    return { text: e.text } as never
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  // The engine's own (empty) band beneath the plugin.
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)

  await $.turn.complete({ answer: 'Done, see above.', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' })
  await rewrite
  expect(submitted).toHaveLength(1)
  expect(submitted[0]).toContain('위를 보라고만 함')
  expect(submitted[0]).toMatch(/^\[plain-talk\] /)
  expect(submitted[0]).toContain('한국어로')

  // Explained terms are offered, not assumed known.
  expect((await $.command.run({ command: 'plain', args: '' } as never)).text).toContain('아는 용어 0개')

  const ui = await $.ui.mount({ plugin: 'plain-talk', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /✗ 문제 1개: 위를 보라고만 함 · 다시 쓰는 중/ })).toBeDefined()
  expect(await ui.find({ key: 'know:api' })).toBeDefined()
  await ui.press({ key: 'know:api' })
  expect(await ui.find({ key: 'know:api' })).toBeUndefined()
  expect(await ui.find({ key: 'know:git branch' })).toBeDefined()
  expect((await $.command.run({ command: 'plain', args: 'know' } as never)).text).toContain('api')
})

test('a rewrite that fails again is not rewritten a second time', async ($, on) => {
  mock.store(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: FAIL, usage: USAGE } }) as never)
  const submitted: string[] = []
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text } as never
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const reviewed = reviewDone(on)

  await $.turn.start({ text: '[plain-talk] Your last message broke the plain-talk rules', turnId: 't2' })
  const done = reviewed()
  await $.turn.complete({ answer: 'Still see above.', durationMs: 1000, isAborted: false, turnId: 't2', reason: 'answer' })
  await done
  const ui = await $.ui.mount({ plugin: 'plain-talk', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /✗ 문제 1개: 위를 보라고만 함$/ })).toBeDefined()
  expect(submitted).toHaveLength(0)
})

test('level off: no review, no rewrite', async ($, on) => {
  mock.store(on)
  let reviews = 0
  on('model.complete', () => {
    reviews++
    return { value: { isAnswered: true, text: FAIL, usage: USAGE } } as never
  })
  const submitted: string[] = []
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text } as never
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.command.run({ command: 'plain', args: 'off' } as never)
  await $.turn.complete({ answer: 'Done, see above.', durationMs: 1000, isAborted: false, turnId: 't5', reason: 'answer' })
  expect(reviews).toBe(0)
  expect(submitted).toHaveLength(0)
})

test('passing review shows a check; a failed model call changes nothing', async ($, on) => {
  mock.store(on)
  let ok = true
  on('model.complete', () =>
    ok
      ? ({ value: { isAnswered: true, text: '{"status":"Answered","pass":true,"problems":[],"explained":[]}', usage: USAGE } } as never)
      : ({ value: { isAnswered: false, reason: 'empty-reply', usage: USAGE } } as never),
  )
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const reviewed = reviewDone(on)

  let done = reviewed()
  await $.turn.complete({ answer: 'Yes.', durationMs: 1000, isAborted: false, turnId: 't3', reason: 'answer' })
  await done
  const ui = await $.ui.mount({ plugin: 'plain-talk', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: '✓ 쉬워요' })).toBeDefined()

  ok = false
  await $.turn.start({ text: 'what next?', turnId: 't4' })
  done = reviewed()
  await $.turn.complete({ answer: 'This.', durationMs: 1000, isAborted: false, turnId: 't4', reason: 'answer' })
  await done
  await ui.redraw()
  expect(await ui.find({ text: '✓ 쉬워요' })).toBeUndefined()
  expect(await ui.find({ text: /what next\?/ })).toBeDefined()
})

test('the reviewer is told which terms the reader already knows', async ($, on) => {
  mock.store(on)
  const prompts: string[] = []
  on('model.complete', ($, e) => {
    prompts.push(e.prompt)
    return { value: { isAnswered: true, text: '{"status":"Answered","pass":true,"problems":[],"explained":[]}', usage: USAGE } } as never
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const reviewed = reviewDone(on)

  await $.command.run({ command: 'plain', args: 'know plugin, git' } as never)
  const done = reviewed()
  await $.turn.complete({ answer: 'The plugin is on.', durationMs: 1000, isAborted: false, turnId: 't6', reason: 'answer' })
  await done
  expect(prompts[0]).toContain('이미 아는 용어 (전문 용어 아님): plugin, git')
})

test('the reviewer gets the turn prompt and a lenient rule; style nits pass without a rewrite', async ($, on) => {
  mock.store(on)
  const asks: { system: string; prompt: string }[] = []
  on('model.complete', ($, e) => {
    asks.push({ system: String(e.system), prompt: String(e.prompt) })
    const text = '{"status":"CRDT 설명","pass":true,"problems":["완료/남은 일 마무리 없음"],"explained":[]}'
    return { value: { isAnswered: true, text, usage: USAGE } } as never
  })
  const submitted: string[] = []
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text } as never
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const reviewed = reviewDone(on)

  await $.turn.start({ text: 'Explain CRDTs using the proper technical terms', turnId: 't7' })
  // A continuation with no typed prompt keeps the user's request.
  await $.turn.start({ text: '', turnId: 't8' })
  const done = reviewed()
  await $.turn.complete({ answer: 'A CRDT is a replicated data type with a commutative merge.', durationMs: 1000, isAborted: false, turnId: 't8', reason: 'answer' })
  await done
  expect(asks[0]?.prompt).toContain('Explain CRDTs using the proper technical terms')
  expect(asks[0]?.system).toContain('전문 용어, 기술적인 세부 내용, 정확한 원문')
  expect(asks[0]?.system).toContain('스타일 지적은 절대 실패 사유가 아니에요')
  expect(asks[0]?.system).toContain('답변 본문이 한국어가 아닐 때')
  expect(submitted).toHaveLength(0)
  const ui = await $.ui.mount({ plugin: 'plain-talk', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /^✓ 쉬워요 · 참고: 완료\/남은 일 마무리 없음$/ })).toBeDefined()
})

test('meta words and non-terms are never offered as "이건 알아요"', async ($, on) => {
  mock.store(on)
  const explained = ['plain-talk', 'Jargon', 'Your next step', 'merge conflict: when two edits clash', 'a sentence that is far too long', 'api']
  on('model.complete', () => {
    const text = JSON.stringify({ status: 'Answered', pass: true, problems: [], explained })
    return { value: { isAnswered: true, text, usage: USAGE } } as never
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const reviewed = reviewDone(on)

  const done = reviewed()
  await $.turn.complete({ answer: 'An api is a way for programs to talk.', durationMs: 1000, isAborted: false, turnId: 't9', reason: 'answer' })
  await done
  const ui = await $.ui.mount({ plugin: 'plain-talk', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ key: 'know:api' })).toBeDefined()
  expect(await ui.find({ key: 'know:merge conflict' })).toBeDefined()
  for (const t of ['plain-talk', 'jargon', 'your next step', 'a sentence that is far too long']) expect(await ui.find({ key: `know:${t}` })).toBeUndefined()
})

test('old sentence-style saved terms are cleaned on read and written back', async ($, on) => {
  // A hand-rolled store, so the test sees every write.
  const store = new Map<string, unknown>([
    ['terms', ['next.js: a popular tool for building web apps', 'next.js', 'order status is simulated on a timer, not set by staff', 'Git', 'built-in file-editing tool']],
  ])
  const writes: unknown[] = []
  on('store.get', ($, e) => ({ value: store.get(e.key) }) as never)
  on('store.set', ($, e) => {
    writes.push(e.value)
    store.set(e.key, e.value)
    return { value: undefined } as never
  })
  const { text } = await $.command.run({ command: 'plain', args: 'know' } as never)
  expect(text).toBe('아는 용어: next.js, git, built-in file-editing tool')
  expect(writes).toEqual([['next.js', 'git', 'built-in file-editing tool']])
  // Already tidy: a second read writes nothing.
  await $.command.run({ command: 'plain', args: 'know' } as never)
  expect(writes).toHaveLength(1)
})

test('/plain know adds comma-separated terms', async ($, on) => {
  mock.store(on)
  const { text } = await $.command.run({ command: 'plain', args: 'know API, Pull Request' } as never)
  expect(text).toContain('api, pull request')
  expect((await $.command.run({ command: 'plain', args: 'know api' } as never)).text).toContain('이미 아는 용어')
  expect((await $.command.run({ command: 'plain', args: '' } as never)).text).toContain('아는 용어 2개')
})

test('Korean level words set the level; English ones still work', async ($, on) => {
  mock.store(on)
  on('prompt.compose', () => BASE)
  expect((await $.command.run({ command: 'plain', args: '전문가' } as never)).text).toContain('전문가(expert)')
  expect((await $.prompt.compose(FACTS)).sections[1]?.text).toContain('## 명확한 말')
  await $.command.run({ command: 'plain', args: '끄기' } as never)
  expect((await $.prompt.compose(FACTS)).sections.map(s => s.id)).toEqual(['intro'])
  await $.command.run({ command: 'plain', args: '초보' } as never)
  expect((await $.prompt.compose(FACTS)).sections[1]?.text).toContain('## 쉬운 말')
  await $.command.run({ command: 'plain', args: 'expert' } as never)
  expect((await $.command.run({ command: 'plain', args: '' } as never)).text).toContain('plain-talk 수준: 전문가(expert)')
})

test('/plain 알아 adds Korean terms, trimming definitions and particles; /plain 잊기 clears', async ($, on) => {
  mock.store(on)
  const { text } = await $.command.run({ command: 'plain', args: '알아 풀 리퀘스트: 코드 변경 요청, 커밋을， API(프로그램끼리 대화하는 통로)、앱' } as never)
  expect(text).toBe('이제 아는 용어로 칠게요: 풀 리퀘스트, 커밋, api, 앱')
  expect((await $.command.run({ command: 'plain', args: '용어' } as never)).text).toBe('아는 용어: 풀 리퀘스트, 커밋, api, 앱')
  expect((await $.command.run({ command: 'plain', args: '잊기' } as never)).text).toContain('지웠어요')
  expect((await $.command.run({ command: 'plain', args: '' } as never)).text).toContain('아는 용어 0개')
})

test('Korean meta words are not offered; Korean explained terms are, without particles', async ($, on) => {
  mock.store(on)
  const explained = ['전문 용어', '쉬운 말', '다음 할 일', '브랜치를', '배포 — 서버에 올리는 일', '워크플로']
  on('model.complete', () => {
    const text = JSON.stringify({ status: '답변함', pass: true, problems: [], explained })
    return { value: { isAnswered: true, text, usage: USAGE } } as never
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const reviewed = reviewDone(on)

  const done = reviewed()
  await $.turn.complete({ answer: '브랜치는 작업 갈래예요.', durationMs: 1000, isAborted: false, turnId: 't10', reason: 'answer' })
  await done
  const ui = await $.ui.mount({ plugin: 'plain-talk', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: '이건 알아요:' })).toBeDefined()
  for (const t of ['브랜치', '배포', '워크플로']) expect(await ui.find({ key: `know:${t}` })).toBeDefined()
  for (const t of ['전문 용어', '쉬운 말', '다음 할 일', '브랜치를']) expect(await ui.find({ key: `know:${t}` })).toBeUndefined()
})

test('a long Korean grade is cut by terminal columns, not characters', async ($, on) => {
  mock.store(on)
  const problem = '설명 없이 어려운 용어를 여러 개 썼어요'.repeat(4)
  on('model.complete', () => {
    const text = JSON.stringify({ status: '한글 상태', pass: false, problems: [problem], explained: [] })
    return { value: { isAnswered: true, text, usage: USAGE } } as never
  })
  let gotGrade: (text: string) => void = () => {}
  const graded = new Promise<string>(r => (gotGrade = r))
  on('ui.status', ($, e) => {
    if (e.text?.startsWith('● 확인 필요 · ')) gotGrade(e.text)
    return { value: undefined } as never
  })
  on('prompt.submit', ($, e) => ({ text: e.text }) as never)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.turn.start({ text: '[plain-talk] 다시 써 주세요', turnId: 't11' })
  await $.turn.complete({ answer: '답', durationMs: 1000, isAborted: false, turnId: 't11', reason: 'answer' })
  const grade = (await graded).slice('● 확인 필요 · '.length)
  expect(grade.endsWith('…')).toBe(true)
  // Hangul is two columns: 80 columns hold about 40 syllables, not 80.
  const cols = [...grade].reduce((n, c) => n + (/[가-힣]/.test(c) ? 2 : 1), 0)
  expect(cols).toBeLessThanOrEqual(80)
  expect(cols).toBeGreaterThan(70)
})

test('an answer check that keeps failing is explained once, naming the setting to fix', async ($, on) => {
  mock.store(on)
  mock.env(on, { CLAUDE_CODE_ATTRIBUTION_HEADER: '0' })
  on('model.complete', () =>
    ({ value: { isAnswered: false, reason: 'api-error', status: 429, error: 'rate_limit', usage: USAGE } }) as never,
  )
  const logs: string[] = []
  on('ui.log', ($, e) => {
    logs.push(e.text)
    return { value: undefined } as never
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const done = reviewDone(on)

  for (const turnId of ['t1', 't2', 't3']) {
    const reviewed = done()
    await $.turn.complete({ answer: '고쳤어요.', durationMs: 1000, isAborted: false, turnId, reason: 'answer' })
    await reviewed
  }

  const mine = logs.filter(l => l.includes('답변 검사'))
  expect(mine).toHaveLength(1)
  expect(mine[0]).toContain('CLAUDE_CODE_ATTRIBUTION_HEADER')
  expect(mine[0]).not.toContain('plain-talk:') // the engine adds the mod's name itself
})
