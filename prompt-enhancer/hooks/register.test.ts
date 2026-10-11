import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
// Stands in for the engine's own (empty) band beneath the plugin.
const EMPTY_BAND = () => ({ type: 'Box', props: {}, children: [] }) as never

test('Enhance replaces the draft, Send submits it', async ($, on) => {
  let box = 'fix login'
  const sent: string[] = []

  on('ui.render', EMPTY_BAND)
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('model.fork', (_$, e) => ({ value: { isAnswered: true, text: `Enhanced: ${e.prompt.includes('fix login')}`, usage } }))
  on('prompt.fill', (_$, e) => {
    box = e.text
    return { isFilled: true, text: box }
  })
  on('prompt.submit', (_$, e) => {
    sent.push(e.text)
    return { text: e.text }
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    box = 'fix login'
    sent.length = 0
    const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface, component: 'AbovePrompt', props: { hasSurvey: false } as never })

    await ui.press({ key: 'enhance' })
    expect(box).toBe('Enhanced: true')

    await ui.press({ key: 'send' })
    expect(sent).toEqual(['Enhanced: true'])
    expect(box).toBe('')
    await ui.unmount()
  }

  box = ''
  await $.command.run({ command: 'enhance', args: 'fix login' } as never)
  expect(box).toBe('Enhanced: true')
})

const REPLY = 'Fix the login bug in src/auth.ts\n<<<CHANGES>>>\n- references src/auth.ts\n- adds "tests pass" as done\n- uses /code-review\n- a fourth note is dropped'

test('Enhance shows what changed, at most 3 lines, cleared on send', async ($, on) => {
  let box = 'fix login'
  on('ui.render', EMPTY_BAND)
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('model.fork', () => ({ value: { isAnswered: true, text: REPLY, usage } }))
  on('prompt.fill', (_$, e) => {
    box = e.text
    return { isFilled: true, text: box }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))

  for (const surface of ['terminal', 'desktop'] as const) {
    box = 'fix login'
    const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface, component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 20 } as never })

    await ui.press({ key: 'enhance' })
    expect(box).toBe('Fix the login bug in src/auth.ts')
    const notes = await ui.find({ key: 'changes' })
    expect(notes?.children).toHaveLength(3)
    expect(notes?.text).toContain('+ references src/a+') // cut to bodyColumns - 2
    expect(notes?.text).not.toContain('src/au')
    expect(notes?.text).not.toContain('fourth')

    await ui.press({ key: 'send' })
    expect(await ui.find({ key: 'changes' })).toBeUndefined()
    await ui.unmount()
  }
})

test('Sends are remembered per project and steer the next rewrite', async ($, on) => {
  mock.store(on, {
    'taste:/other': [{ edited: true, delta: -500, rewrite: 'other project', sent: 'x' }],
  })
  on('session.root', () => ({ value: '/proj' }))
  on('ui.render', EMPTY_BAND)
  let box = 'fix login'
  const asks: string[] = []
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('model.fork', (_$, e) => {
    asks.push(e.prompt)
    return { value: { isAnswered: true, text: REPLY, usage } }
  })
  on('prompt.fill', (_$, e) => {
    box = e.text
    return { isFilled: true, text: box }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 80 } as never })

  // No history yet in this project (the other project's record is not read).
  await ui.press({ key: 'enhance' })
  expect(asks[0]).not.toContain('<user_taste>')

  // A submit that is not the user's (here the test's own, not the composer's) teaches nothing.
  await $.prompt.submit({ text: 'from elsewhere' } as never)

  // Sent unchanged.
  await ui.press({ key: 'send' })
  box = 'fix login'
  await ui.press({ key: 'enhance' })
  expect(asks[1]).toContain('사용자는 1개를 그대로 보냈고 0개를 고쳐서 보냈다')

  // The user trims the rewrite before sending.
  box = 'Fix login in src/auth.ts'
  await ui.press({ key: 'send' })
  box = 'fix login'
  await ui.press({ key: 'enhance' })
  expect(asks[2]).toContain('사용자는 1개를 그대로 보냈고 1개를 고쳐서 보냈다')
  expect(asks[2]).toContain('<rewrite>Fix the login bug in src/auth.ts</rewrite>\n<sent>Fix login in src/auth.ts</sent>')

  // A long edit is clipped, and only the last 10 records are kept.
  for (let i = 0; i < 12; i++) {
    box = 'y'.repeat(1000)
    await ui.press({ key: 'send' })
    box = 'fix login'
    await ui.press({ key: 'enhance' })
  }
  const last = asks[asks.length - 1]
  expect(last).toContain('최근 다시 쓴 10개 중')
  expect(last).toContain('더 자세히 써라')
  expect(last).not.toContain('y'.repeat(300))
  expect(last).toContain(`${'y'.repeat(299)}…`)
  expect(last).not.toContain('other project')
  await ui.unmount()
})

const KO_REPLY = '로그인 버그를 src/auth.ts에서 고쳐 주세요. 완료 기준: 테스트 통과.\n<<<CHANGES>>>\n- src/auth.ts 참조 추가\n- 완료 기준: 테스트 통과\n- 아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주아주 긴 메모'

test('a Korean draft: Korean rules, notes cut by terminal columns, Korean labels', async ($, on) => {
  let box = '로그인 고쳐줘'
  const asks: string[] = []
  on('ui.render', EMPTY_BAND)
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('model.fork', (_$, e) => {
    asks.push(e.prompt)
    return { value: { isAnswered: true, text: KO_REPLY, usage } }
  })
  on('prompt.fill', (_$, e) => {
    box = e.text
    return { isFilled: true, text: box }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))

  const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 20 } as never })
  expect(await ui.find({ key: 'enhance' })).toBeDefined()
  expect((await ui.find({ key: 'enhance' }))?.text).toContain('다듬기')
  expect((await ui.find({ key: 'send' }))?.text).toContain('보내기')

  await ui.press({ key: 'enhance' })
  expect(asks[0]).toContain('사용자는 한국어 사용자다')
  expect(asks[0]).toContain('<rough_prompt>\n로그인 고쳐줘\n</rough_prompt>')
  expect(box).toBe('로그인 버그를 src/auth.ts에서 고쳐 주세요. 완료 기준: 테스트 통과.')

  // 18 columns hold "+ " and eight Hangul syllables, not eighteen.
  const notes = await ui.find({ key: 'changes' })
  expect(notes?.children).toHaveLength(3)
  expect(notes?.text).toContain('+ 완료 기준: 테스')
  expect(notes?.text).not.toContain('테스트')
  expect(notes?.text).toContain('+ 아주아주아주아주')
  expect(notes?.text).not.toContain('아주아주아주아주아')
  await ui.unmount()
})

test('/enhance with no draft says how to use it, in Korean', async $ => {
  const r = await $.command.run({ command: 'enhance', args: '' } as never)
  expect(JSON.stringify(r)).toContain('/enhance 로그인 버그 고쳐줘')
})

test('a Korean rewrite sent unchanged is not counted as an edit, even in NFD', async ($, on) => {
  mock.store(on, {})
  on('session.root', () => ({ value: '/proj' }))
  on('ui.render', EMPTY_BAND)
  const rewrite = '한글 프롬프트'
  let box = '초안'
  const asks: string[] = []
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('model.fork', (_$, e) => {
    asks.push(e.prompt)
    return { value: { isAnswered: true, text: rewrite, usage } }
  })
  on('prompt.fill', (_$, e) => {
    box = e.text
    return { isFilled: true, text: box }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 80 } as never })

  await ui.press({ key: 'enhance' })
  box = rewrite.normalize('NFD') // the same text, decomposed
  await ui.press({ key: 'send' })
  box = '초안'
  await ui.press({ key: 'enhance' })
  expect(asks[1]).toContain('사용자는 1개를 그대로 보냈고 0개를 고쳐서 보냈다')

  // A long Korean edit is clipped at 300 characters, not 300 UTF-16 units, and a smaller
  // average cut than an English one already asks for shorter rewrites.
  box = '가'.repeat(250)
  await ui.press({ key: 'send' })
  box = '초안'
  await ui.press({ key: 'enhance' })
  expect(asks[2]).toContain('사용자는 1개를 그대로 보냈고 1개를 고쳐서 보냈다')
  expect(asks[2]).toContain('더 자세히 써라')
  await ui.unmount()
})

test('a collapsed paste is not sent to the model; the band says how to enhance it', async ($, on) => {
  let box = '[Pasted text #1 +45 lines]'
  let calls = 0
  on('ui.render', EMPTY_BAND)
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('model.fork', () => {
    calls++
    return { value: { isAnswered: true, text: 'rewritten placeholder', usage } }
  })
  on('prompt.fill', (_$, e) => {
    box = e.text
    return { isFilled: true, text: box }
  })

  const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 120 } as never })
  await ui.press({ key: 'enhance' })
  expect(calls).toBe(0)
  expect(box).toBe('[Pasted text #1 +45 lines]') // the paste stays in the box
  expect(await ui.find({ type: 'Text', text: /\/enhance/ })).toBeDefined()

  // Typed text around a collapsed paste is still a collapsed paste.
  box = '이거 다듬어줘 [Pasted text #2 +3 lines] 부탁'
  await ui.press({ key: 'enhance' })
  expect(calls).toBe(0)
  await ui.unmount()

  // /enhance gets the paste already expanded, so it goes through.
  const r = await $.command.run({ command: 'enhance', args: 'Build an island adventure' } as never)
  expect(calls).toBe(1)
  expect(r.text).toContain('입력창에 넣었어요')
})

// Before the first reply: nothing to fork, so the rewrite is one direct completion.
const directSession = (on: On, env: Record<string, string>) => {
  on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  mock.env(on, env)
  on('fs.ancestors', () => ({ value: [] }))
  on('command.list', () => ({ value: [] }))
}
const RATE_LIMITED = { value: { isAnswered: false, reason: 'api-error', status: 429, error: 'rate_limit', usage } }

test('a 429 with CLAUDE_CODE_ATTRIBUTION_HEADER=0 names the setting to remove', async ($, on) => {
  directSession(on, { CLAUDE_CODE_ATTRIBUTION_HEADER: '0' })
  on('model.complete', () => RATE_LIMITED as never)
  const r = await $.command.run({ command: 'enhance', args: 'fix login' } as never)
  expect(r.text).toContain('429')
  expect(r.text).toContain('CLAUDE_CODE_ATTRIBUTION_HEADER')
})

test('a 429 without that setting is a plain rate limit: try again later', async ($, on) => {
  directSession(on, {})
  on('model.complete', () => RATE_LIMITED as never)
  const r = await $.command.run({ command: 'enhance', args: 'fix login' } as never)
  expect(r.text).toContain('사용량 제한(429)')
  expect(r.text).not.toContain('CLAUDE_CODE_ATTRIBUTION_HEADER')
})

test('a direct rewrite gets a token cap that grows with the draft, and a cut-off reply is not filled', async ($, on) => {
  let box = ''
  const caps: number[] = []
  directSession(on, {})
  on('prompt.fill', (_$, e) => {
    box = e.text
    return { isFilled: true, text: box }
  })
  on('model.complete', (_$, e) => {
    const cap = (e as { maxTokens?: number }).maxTokens ?? 0
    caps.push(cap)
    // The long draft's reply runs out its cap before the notes: cut off.
    return e.prompt.includes('x'.repeat(100))
      ? { value: { isAnswered: true, text: 'Build the island...', usage: { ...usage, output_tokens: cap } } }
      : { value: { isAnswered: true, text: `Fix login\n<<<CHANGES>>>\n- 범위 명시`, usage } }
  })

  // Even a short draft leaves room for the model's thinking, which the cap also holds.
  await $.command.run({ command: 'enhance', args: 'fix login' } as never)
  expect(caps[0]).toBe(8192)
  expect(box).toBe('Fix login')

  box = 'untouched'
  const r = await $.command.run({ command: 'enhance', args: 'x'.repeat(8000) } as never)
  expect(caps[1]).toBe(12000)
  expect(r.text).toContain('잘렸어요')
  expect(box).toBe('untouched')

  await $.command.run({ command: 'enhance', args: 'y'.repeat(20000) } as never)
  expect(caps[2]).toBe(16000)
})

test('other API errors name the status and kind instead of a bare api-error', async ($, on) => {
  on('model.fork', () => ({ value: { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage } }))
  mock.env(on, {})
  const r = await $.command.run({ command: 'enhance', args: 'fix login' } as never)
  expect(r.text).toContain('529')
  expect(r.text).toContain('overloaded')
})

// A card file as the engine would list and read it from the plugin's cards/ folder.
const CARD = '# 카드\n적용 모델: opus-5-5\n\n[긴 작업] 여러 단계에 걸친 일\n- 할 일을 목록으로 적는다.\n  라벨: 할 일 목록·멈춤 조건\n'
// The block itself, not the rules' mention of it.
const GUIDE_BLOCK = '<model_guide>\n'
const OTHER_CARD = '# 다른 카드\n적용 모델: sonnet-5-5\n- 다른 모델용\n'
const cardFiles = (on: On) => {
  on('fs.list', (_$, e) => {
    if (!(e as { path: string }).path.endsWith('/cards')) return { value: [] }
    const file = (name: string) => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })
    return { value: [file('sonnet-5-5.md'), file('notes.txt'), file('opus-5-5.md')] }
  })
  on('fs.read', (_$, e) => {
    const p = (e as { path: string }).path
    return { value: p.endsWith('/cards/opus-5-5.md') ? CARD : p.endsWith('/cards/sonnet-5-5.md') ? OTHER_CARD : 'not a card' }
  })
}

test('the card for the session model is added to the rules; another model gets none', async ($, on) => {
  let model = 'claude-opus-5-5[1m]'
  const asks: string[] = []
  on('session.model', () => ({ value: model }))
  cardFiles(on)
  on('model.fork', (_$, e) => {
    asks.push(e.prompt)
    return { value: { isAnswered: true, text: 'Fix login', usage } }
  })
  on('prompt.fill', (_$, e) => ({ isFilled: true, text: e.text }))

  await $.command.run({ command: 'enhance', args: '로그인 고쳐줘' } as never)
  expect(asks[0]).toContain(`<model_guide>\n${CARD.trim()}\n</model_guide>`)
  expect(asks[0]).not.toContain('다른 모델용')
  // The card sits before the draft, so the draft stays the last thing the model reads.
  expect(asks[0].indexOf(GUIDE_BLOCK)).toBeLessThan(asks[0].indexOf('<rough_prompt>'))

  // What /model shows by name fits too.
  model = 'Opus 5.5 (1M context)'
  await $.command.run({ command: 'enhance', args: '로그인 고쳐줘' } as never)
  expect(asks[1]).toContain(GUIDE_BLOCK)

  // A model with no card of its own, or a bare alias: the rules alone.
  for (const m of ['claude-haiku-5-5', 'opus', 'claude-opus-5-50']) {
    model = m
    await $.command.run({ command: 'enhance', args: '로그인 고쳐줘' } as never)
    expect(asks[asks.length - 1]).not.toContain(GUIDE_BLOCK)
    expect(asks[asks.length - 1]).toContain('<rough_prompt>\n로그인 고쳐줘\n</rough_prompt>')
  }
})

test('unreadable cards leave the rewrite to the rules alone', async ($, on) => {
  const asks: string[] = []
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('fs.list', () => {
    throw new Error('ENOENT')
  })
  on('model.fork', (_$, e) => {
    asks.push(e.prompt)
    return { value: { isAnswered: true, text: 'Fix login', usage } }
  })
  on('prompt.fill', (_$, e) => ({ isFilled: true, text: e.text }))
  const r = await $.command.run({ command: 'enhance', args: 'fix login' } as never)
  expect(r.text).toContain('입력창에 넣었어요')
  expect(asks[0]).not.toContain(GUIDE_BLOCK)
})

test('the rules ask only blocking questions and keep pasted material as reference', async ($, on) => {
  const asks: string[] = []
  on('model.fork', (_$, e) => {
    asks.push(e.prompt)
    return { value: { isAnswered: true, text: 'Fix login', usage } }
  })
  on('prompt.fill', (_$, e) => ({ isFilled: true, text: e.text }))
  await $.command.run({ command: 'enhance', args: 'fix login' } as never)
  expect(asks[0]).toContain('작업을 막는 모호함만 Claude에게 묻게 하고, 나머지는 합리적인 가정으로 정해 진행하게 한다')
  expect(asks[0]).not.toContain('정말 모호한 부분은 추측하지 말고')
  expect(asks[0]).toContain('<참고_자료> 블록에 원문 그대로 둔다')
})

test('notes on applied card points come first and survive the three-line cut', async ($, on) => {
  let box = '긴 작업 해줘'
  on('ui.render', EMPTY_BAND)
  on('prompt.read', () => ({ value: { text: box, cursor: box.length } }))
  on('model.fork', () => ({
    value: {
      isAnswered: true,
      text: '다시 쓴 프롬프트\n<<<CHANGES>>>\n- src/a.ts 참조 추가\n- 완료 기준: 테스트 통과\n- 가이드: 할 일 목록·멈춤 조건\n- 가이드: 가이드 원문 뺌',
      usage,
    },
  }))
  on('prompt.fill', (_$, e) => {
    box = e.text
    return { isFilled: true, text: box }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }))

  for (const surface of ['terminal', 'desktop'] as const) {
    box = '긴 작업 해줘'
    const ui = await $.ui.mount({ plugin: 'prompt-enhancer', surface, component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 80 } as never })
    await ui.press({ key: 'enhance' })
    expect(box).toBe('다시 쓴 프롬프트')
    const notes = await ui.find({ key: 'changes' })
    expect(notes?.children).toHaveLength(3)
    const text = notes?.text ?? ''
    expect(text).toContain('+ 가이드: 할 일 목록·멈춤 조건')
    expect(text).toContain('+ 가이드: 가이드 원문 뺌')
    expect(text).toContain('+ src/a.ts 참조 추가')
    expect(text).not.toContain('완료 기준')
    expect(text.indexOf('가이드: 할 일')).toBeLessThan(text.indexOf('src/a.ts'))
    await ui.unmount()
  }
})
