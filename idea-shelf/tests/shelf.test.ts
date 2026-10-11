import { expect, mock, test } from 'claude-code/testing'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`shelve via /idea, send from pane (${surface})`, async ($, on) => {
    const sent: string[] = []
    mock.clock(on)
    const store: Record<string, unknown> = {}
    on('store.get', ($, e) => ({ value: store[e.key] }))
    on('store.set', ($, e) => { store[e.key] = e.value; return { value: undefined } })
    on('session.cwd', () => ({ value: '/proj/a' }))
    on('prompt.submit', ($, e) => {
      sent.push(e.text)
      return { text: e.text }
    })

    // the kit fills origin/presentation and pane props; casts keep tsc quiet
    await $.command.run({ command: 'idea', args: 'try a cache later' } as never)
    const ui = await $.ui.mount({ plugin: 'idea-shelf', surface, component: 'Pane', props: {} as never, requestId: 'idea-shelf' })
    expect(await ui.find({ text: 'try a cache later' })).toBeDefined()
    expect(store['ideas:/proj/a']).toMatchObject([{ text: 'try a cache later' }])

    const send = await ui.find({ type: 'Button', text: '보내기' })
    await ui.press({ key: send!.props!.key as string })

    expect(sent).toEqual(['try a cache later'])
    expect(await ui.find({ text: 'try a cache later' })).toBeUndefined()
  })

  test(`Claude shelves via its tool, nudge sends fitting ideas (${surface})`, async ($, on) => {
    const sent: string[] = []
    mock.clock(on)
    const store: Record<string, unknown> = {}
    on('store.get', ($, e) => ({ value: store[e.key] }))
    on('store.set', ($, e) => { store[e.key] = e.value; return { value: undefined } })
    on('session.cwd', () => ({ value: '/proj/a' }))
    on('prompt.submit', ($, e) => { sent.push(e.text); return { text: e.text } })
    on('prompt.compose', () => ({ sections: [] }))
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('tool.call', () => ({ result: {} as never }))
    // stands for the engine's own (empty) band when the mod yields
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    const turn = async (id: string, prompt: string, edited?: string, shelve?: string) => {
      await $.turn.start({ text: prompt, turnId: id })
      if (edited) await $.tool.call({ tool: 'Edit', file_path: edited, old_string: 'a', new_string: 'b' } as never)
      if (shelve) await $.tool.call({ tool: 'mcp__idea-shelf__shelve_idea', text: shelve })
      await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: id, reason: 'answer' })
    }

    // the guidance rides along wherever the tool is offered, and nowhere else
    const COMPOSE = { model: 'm', promptModel: 'm', surfaces: [surface], outputStyle: null, traits: [] }
    const offered = await $.prompt.compose({ ...COMPOSE, tools: ['mcp__idea-shelf__shelve_idea'] })
    expect(offered.sections.map(s => s.id)).toEqual(['idea-shelf:guidance'])
    expect((await $.prompt.compose({ ...COMPOSE, tools: [] })).sections).toEqual([])

    await $.command.run({ command: 'idea', args: 'cache the parser output' } as never)
    await $.command.run({ command: 'idea', args: 'rename the logo asset' } as never)

    // Claude's idea about the parser, shelved this very turn, is not nudged back at once
    await turn('t1', 'speed up parsing', '/proj/a/src/parser.ts', 'split parser.ts into lexer and grammar')
    expect(store['ideas:/proj/a']).toMatchObject([{ source: 'you' }, { source: 'you' }, { source: 'claude' }])
    const pane = await $.ui.mount({ plugin: 'idea-shelf', surface, component: 'Pane', props: {} as never, requestId: 'idea-shelf' })
    expect(await pane.find({ text: /Claude/ })).toBeDefined()

    const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never
    const band = await $.ui.mount({ plugin: 'idea-shelf', surface, component: 'AbovePrompt', props: BAND })
    expect(await band.find({ text: /맞는 아이디어 1개/ })).toBeDefined()
    expect(await band.find({ text: 'rename the logo' })).toBeUndefined()

    // dismissed ideas stay quiet on later turns
    await band.press({ key: 'nudge-dismiss' })
    expect(await band.find({ type: 'Button', text: '보내기' })).toBeUndefined()
    await turn('t2', 'more parser work', '/proj/a/src/parser.ts')
    expect(await band.find({ text: /맞는 아이디어 1개/ })).toBeDefined() // Claude's idea, now from an earlier turn

    await band.press({ key: 'nudge-send' })
    expect(sent).toEqual(['split parser.ts into lexer and grammar'])
    expect(await band.find({ type: 'Button', text: '보내기' })).toBeUndefined()

    // a turn on unrelated ground nudges nothing
    await turn('t3', 'tidy the readme', '/proj/a/README.md')
    expect(await band.find({ type: 'Button', text: '보내기' })).toBeUndefined()
  })
}

test('Korean: /idea keeps the text as typed, and a Korean turn nudges the fitting idea', async ($, on) => {
  const sent: string[] = []
  mock.clock(on)
  const store: Record<string, unknown> = {}
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => { store[e.key] = e.value; return { value: undefined } })
  on('session.cwd', () => ({ value: '/proj/ko' }))
  on('prompt.submit', ($, e) => { sent.push(e.text); return { text: e.text } })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: {} as never }))
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  const turn = async (id: string, prompt: string) => {
    await $.turn.start({ text: prompt, turnId: id })
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: id, reason: 'answer' })
  }

  const ran = await $.command.run({ command: 'idea', args: '  결제 화면에 로딩 스피너 넣기  ' } as never)
  expect(ran.text).toBe('선반에 올렸어요: 결제 화면에 로딩 스피너 넣기')
  await $.command.run({ command: 'idea', args: '코드 정리하기' } as never)
  expect(store['ideas:/proj/ko']).toMatchObject([{ text: '결제 화면에 로딩 스피너 넣기' }, { text: '코드 정리하기' }])

  const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 } as never
  const band = await $.ui.mount({ plugin: 'idea-shelf', surface: 'terminal', component: 'AbovePrompt', props: BAND })

  // only stopwords in common: no nudge
  await turn('k1', '코드를 수정해줘')
  expect(await band.find({ type: 'Button', text: '보내기' })).toBeUndefined()

  // a different particle on the same noun still fits
  await turn('k2', '결제에서 오류가 나요')
  expect(await band.find({ text: /맞는 아이디어 1개/ })).toBeDefined()
  expect(await band.find({ text: /코드 정리하기/ })).toBeUndefined()
  await band.press({ key: 'nudge-send' })
  expect(sent).toEqual(['결제 화면에 로딩 스피너 넣기'])
})
