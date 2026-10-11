import { expect, mock, test } from 'claude-code/testing'

const DIR = '/home/me/.claude/sessions'
const entry = (pid: number, id: string, status: string, cwd: string) =>
  JSON.stringify({ pid, sessionId: id, cwd, name: id, nameSource: 'auto', status, statusUpdatedAt: 0 })
const FILES: Record<string, string> = {
  [`${DIR}/1.json`]: entry(1, 'mine', 'busy', '/work/me'),
  [`${DIR}/2.json`]: entry(2, 'asker', 'waiting', '/work/my app'),
  [`${DIR}/3.json`]: entry(3, 'finished', 'idle', '/work/done'),
}

test('/monitor rows jump to a session and reply to one that needs you', async ($, on) => {
  const copied: string[] = []
  const sent: { to: string; text: string }[] = []
  const toasts: string[] = []
  const commands: string[] = []

  mock.clock(on)
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 'mine' }))
  on('session.start', () => ({ cwd: '/work/me' }) as never)
  on('command.register', (_$, e) => {
    commands.push(e.name)
    return { value: undefined } as never
  })
  on('fs.list', () => ({
    value: Object.keys(FILES).map(k => ({ name: k.slice(DIR.length + 1), kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })),
  }))
  on('fs.read', (_$, e) => ({ value: FILES[e.path] ?? '' }))
  on('process.run', (_$, e) => ({
    value: { exitCode: 0, stdout: e.argv[0] === 'ps' ? '1\n2\n3\n' : '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('ui.panes', () => ({ value: [{ id: 'session-monitor', title: 'Sessions', isShown: true, isFocused: true, isPlaced: true }] }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_$, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  // Stands in for the engine's own (empty) band beneath the plugin.
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('session.send', (_$, e) => {
    sent.push({ to: e.to, text: e.text })
    return { isDelivered: true }
  })

  await $.session.start({ cwd: '/work/me', surface: 'terminal', isInteractive: true } as never)
  expect(commands).toEqual(['monitor'])

  for (const surface of ['terminal', 'desktop'] as const) {
    copied.length = 0
    sent.length = 0
    const pane = await $.ui.mount({
      plugin: 'session-monitor',
      surface,
      component: 'Pane',
      requestId: 'session-monitor',
      props: {} as never,
    })
    // Only the waiting session offers a reply; this session offers neither.
    expect(await pane.find({ key: 'reply:asker' })).toBeDefined()
    expect(await pane.find({ key: 'reply:finished' })).toBeUndefined()
    expect(await pane.find({ key: 'jump:mine' })).toBeUndefined()

    // Labels are Korean; the waiting row says it needs you.
    expect(await pane.find({ type: 'Text', text: /실행 중 3개/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /확인 필요/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /이 세션/ })).toBeDefined()

    await pane.press({ key: 'jump:finished' })
    expect(copied).toEqual(['cd /work/done && claude --resume finished'])
    expect(toasts.at(-1)).toBe('복사했어요. 다른 터미널에 붙여 넣으세요: cd /work/done && claude --resume finished')
    await pane.press({ key: 'jump:asker' })
    expect(copied[1]).toBe(`cd '/work/my app' && claude --resume asker`)

    await pane.press({ key: 'reply:asker' })
    await pane.redraw()
    await pane.input({ key: 'reply-text', text: '  yes, go ahead  ' })
    expect(sent).toHaveLength(1)
    expect(sent[0]?.text).toBe('yes, go ahead')
    expect(toasts.at(-1)).toBe('"asker" 세션에 보냈어요.')
    await pane.redraw()
    expect(await pane.find({ key: 'reply-text' })).toBeUndefined()
    await pane.unmount()
  }

  // The band counts each state in Korean.
  const band = await $.ui.mount({ plugin: 'session-monitor', surface: 'terminal', component: 'AbovePrompt', props: {} as never })
  expect(await band.find({ type: 'Text', text: /확인 필요 1/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /작업 중 1/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /완료 1/ })).toBeDefined()
  expect(await band.find({ key: 'sessions' })).toBeDefined()
  await band.unmount()
})
