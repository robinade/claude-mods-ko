import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { bandText, feedbackText, hasUnsentWrong, RIGHT_KEY, rulesText, statsText, WRONG_KEY, withRule } from './register'

const a = (id: number, verdict: 'open' | 'right' | 'wrong', isSent = false, note?: string) =>
  ({ id, text: `guess ${id}`, verdict, isSent, note })

test('feedback lists only reviewed, unsent verdicts', () => {
  const text = feedbackText([a(1, 'open'), a(2, 'right'), a(3, 'wrong', false, 'use SQLite'), a(4, 'wrong', true)])
  expect(text).toContain('#2 "guess 2": 맞음.')
  expect(text).toContain('#3 "guess 3": 틀림. 사용자 정정: use SQLite')
  expect(text?.startsWith('[assumption-tracker] 사용자가 가정을 검토했어요:')).toBe(true)
  expect(text?.includes('#1')).toBe(false)
  expect(text?.includes('#4')).toBe(false)
})

test('nothing to send → null', () => {
  expect(feedbackText([a(1, 'open'), a(2, 'right', true)])).toBe(null)
})

test('only an unsent wrong verdict interrupts', () => {
  expect(hasUnsentWrong([a(1, 'right'), a(2, 'wrong', true)])).toBe(false)
  expect(hasUnsentWrong([a(1, 'wrong')])).toBe(true)
})

test('a correction becomes a rule; an empty one does not', () => {
  expect(withRule([], 'uses npm', '  ')).toEqual([])
  expect(withRule([], 'uses npm')).toEqual([])
  const one = withRule([], 'uses npm', ' use pnpm ')
  expect(one).toEqual([{ id: 1, assumption: 'uses npm', correction: 'use pnpm' }])
  // The same assumption corrected again updates its rule instead of adding one.
  expect(withRule(one, 'uses npm', 'use bun')).toEqual([{ id: 1, assumption: 'uses npm', correction: 'use bun' }])
  expect(withRule(one, 'tabs', 'two spaces').map(r => r.id)).toEqual([1, 2])
})

test('rules text and stats', () => {
  expect(rulesText([])).toBe(null)
  const text = rulesText([{ id: 1, assumption: 'uses npm', correction: 'use pnpm' }])
  expect(text).toContain('# 정정된 가정에서 배운 프로젝트 규칙')
  expect(text).toContain('한국어 사용자')
  expect(text).toContain('- use pnpm (원래 가정: "uses npm")')
  const rule = { id: 1, assumption: 'x', correction: 'y' }
  expect(statsText([a(1, 'open'), a(2, 'wrong'), a(3, 'wrong')], [rule, { ...rule, id: 2 }])).toBe(
    '가정 3개 · 틀림 2 · 규칙 2',
  )
  expect(statsText([a(1, 'right')], [rule])).toBe('가정 1개 · 틀림 0 · 규칙 1')
})

const PANE = {
  component: 'Pane',
  requestId: 'assumptions',
  props: {
    title: '가정 목록',
    isFocused: true,
    bodyColumns: 56,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const RULES = 'assumption-tracker:rules'
const NPM = { id: 1, assumption: 'uses npm', correction: 'use pnpm' }

// The world beneath the plugin: a store we can read back and an idle session's prompt; then a session starts in `cwd`.
const world = async ($: Engine, on: On, cwd: string, entries: Record<string, unknown> = {}) => {
  const store = { ...entries }
  const submitted: string[] = []
  on('store.get', async ($, e) => ({ value: store[e.key] }))
  on('store.set', async ($, e) => ((store[e.key] = e.value), { value: undefined }))
  on('store.delete', async ($, e) => (delete store[e.key], { value: undefined }))
  on('store.keys', async () => ({ value: Object.keys(store) }))
  on('prompt.submit', async ($, e) => (submitted.push(e.text), { text: e.text }))
  on('tool.register', async ($, e) => ({ value: { tool: `mcp__assumption-tracker__${e.name}` } }))
  on('command.register', async ($, e) => ({ value: { command: e.name } }))
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('prompt.compose', async () => ({ sections: [] }))
  on('classic.CwdChanged', async () => ({}))
  await $.session.start({ cwd, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ plugin: 'assumption-tracker', surface: 'terminal', ...PANE })
  const facts = {
    model: 'claude-opus-5-5',
    promptModel: 'claude-opus-5-5',
    surfaces: ['terminal'],
    tools: [],
    outputStyle: null,
    traits: [],
  } as const
  const rulesSection = async () => (await $.prompt.compose(facts)).sections.find(s => s.id === RULES)
  const stats = async () => (await ui.find({ type: 'Text', text: /^가정 \d+개 · 틀림 / }))?.text

  return { store, submitted, ui, rulesSection, stats }
}

const logNpm = ($: Engine) => $.tool.call({ tool: 'mcp__assumption-tracker__log_assumption', assumption: 'uses npm' })

test('a correction in the panel becomes a stored project rule in the system prompt, and can be deleted', async ($, on) => {
  const { store, submitted, ui, rulesSection, stats } = await world($, on, '/work/shop')
  await logNpm($)
  await ui.input({ key: 'fix-1', text: 'use pnpm' })

  expect(submitted.length).toBe(1)
  expect(store['rules:/work/shop']).toEqual([NPM])
  const section = await rulesSection()
  expect(section?.scope).toBe('session')
  expect(section?.text).toContain('- use pnpm (원래 가정: "uses npm")')
  expect(await stats()).toBe('가정 1개 · 틀림 1 · 규칙 1')

  await ui.press({ key: 'delete-rule-1' })
  expect('rules:/work/shop' in store).toBe(false)
  expect(await rulesSection()).toBe(undefined)
  expect(await stats()).toBe('가정 1개 · 틀림 1 · 규칙 0')
  await ui.unmount()
})

test('marking wrong with no correction makes no rule', async ($, on) => {
  const { store, ui, rulesSection, stats } = await world($, on, '/work/shop')
  await logNpm($)
  await ui.press({ key: 'wrong-1' })

  expect(Object.keys(store)).toEqual([])
  expect(await rulesSection()).toBe(undefined)
  expect(await stats()).toBe('가정 1개 · 틀림 1 · 규칙 0')
  await ui.unmount()
})

test('marking the assumption right after all drops its rule', async ($, on) => {
  const { store, ui, rulesSection } = await world($, on, '/work/shop')
  await logNpm($)
  await ui.input({ key: 'fix-1', text: 'use pnpm' })
  await ui.press({ key: 'right-1' })

  expect('rules:/work/shop' in store).toBe(false)
  expect(await rulesSection()).toBe(undefined)
  await ui.unmount()
})

test('rules from an earlier session load per project, and another directory gets none', async ($, on) => {
  const { ui, rulesSection, stats } = await world($, on, '/work/shop', { 'rules:/work/shop': [NPM] })

  expect((await rulesSection())?.text).toContain('- use pnpm (원래 가정: "uses npm")')
  expect(await stats()).toBe('가정 0개 · 틀림 0 · 규칙 1')

  await $.classic.CwdChanged({ old_cwd: '/work/shop', new_cwd: '/work/other' })
  expect(await rulesSection()).toBe(undefined)
  await ui.unmount()
})

test('band line is Korean and names the 0 key', () => {
  expect(bandText([], 2)).toBe('◆ 프로젝트 규칙 2개 · 0을 누르면 열려요')
  expect(bandText([a(1, 'open'), a(2, 'right')], 0)).toBe('◆ 확인할 가정 1개 (전체 2개) · 0을 누르면 열려요')
  expect(bandText([a(1, 'right'), a(2, 'wrong')], 0)).toBe('◆ 가정 2개 모두 확인했어요 · 0을 누르면 열려요')
})

test('the Korean guidance asks for assumptions in Korean, alongside the tag verdicts start with', async ($, on) => {
  const { ui } = await world($, on, '/work/shop')
  const facts = { model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as const
  const guidance = (await $.prompt.compose(facts)).sections.find(s => s.id === 'assumption-tracker:guidance')
  expect(guidance?.text).toContain('한국어 사용자')
  expect(guidance?.text).toContain('짧은 한국어 한 문장')
  expect(guidance?.text).toContain('[assumption-tracker]')
  await ui.unmount()
})

// Digits, not y / n: the Korean input method turns y and n into ㅛ and ㅜ.
test('pane hotkeys are digits 1 (right) and 2 (wrong), on the newest unreviewed assumption only', async ($, on) => {
  expect([RIGHT_KEY, WRONG_KEY]).toEqual(['1', '2'])
  const { ui } = await world($, on, '/work/shop')
  await logNpm($)
  await $.tool.call({ tool: 'mcp__assumption-tracker__log_assumption', assumption: '탭 대신 공백 두 칸' })

  expect((await ui.find({ key: 'right-2' }))?.props.hotkey).toBe('1')
  expect((await ui.find({ key: 'wrong-2' }))?.props.hotkey).toBe('2')
  expect((await ui.find({ key: 'right-1' }))?.props.hotkey).toBe(undefined)
  expect((await ui.find({ key: 'wrong-1' }))?.props.hotkey).toBe(undefined)
  expect((await ui.find({ key: 'right-2' }))?.props.label).toBe('✓ 맞음')
  expect(await ui.find({ type: 'Text', text: /1 맞음 · 2 틀림/ })).toBeDefined()

  // Once #2 is judged, the keys move to #1.
  await ui.press({ key: 'right-2' })
  expect((await ui.find({ key: 'right-1' }))?.props.hotkey).toBe('1')
  expect((await ui.find({ key: 'wrong-2' }))?.props.hotkey).toBe(undefined)
  await ui.unmount()
})

test('a Korean correction becomes a Korean rule and the verdict reaches Claude in Korean', async ($, on) => {
  const { store, submitted, ui, rulesSection } = await world($, on, '/work/shop')
  await $.tool.call({ tool: 'mcp__assumption-tracker__log_assumption', assumption: 'npm을 쓴다' })
  await ui.input({ key: 'fix-1', text: 'pnpm을 써요' })

  expect(store['rules:/work/shop']).toEqual([{ id: 1, assumption: 'npm을 쓴다', correction: 'pnpm을 써요' }])
  expect((await rulesSection())?.text).toContain('- pnpm을 써요 (원래 가정: "npm을 쓴다")')
  expect(submitted[0]).toContain('#1 "npm을 쓴다": 틀림. 사용자 정정: pnpm을 써요')
  await ui.unmount()
})
