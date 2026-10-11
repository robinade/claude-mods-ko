import { expect, test } from 'claude-code/testing'

import { ago, parseTitles, resumeCommand, sorted, toRow, waitingText } from './rows'

const entry = (pid: number, status: string, since: number) =>
  JSON.stringify({ pid, sessionId: `s${pid}`, cwd: `/x/proj${pid}`, status, statusUpdatedAt: since })

test('maps registry status and puts waiting first, then working, then done', () => {
  const rows = [entry(1, 'idle', 5), entry(2, 'busy', 1), entry(3, 'waiting', 1), entry(4, 'busy', 9)]
    .map(toRow)
    .filter(r => r !== null)
  expect(sorted(rows).map(r => [r.pid, r.status])).toEqual([
    [3, 'waiting'],
    [4, 'working'],
    [2, 'working'],
    [1, 'done'],
  ])
  expect(rows[0]?.project).toBe('proj1')
})

test('skips entries without a pid or session id', () => {
  expect(toRow('{"status":"busy"}')).toBe(null)
})

test('parses the last ai-title per session and skips untitled ones', () => {
  const out = 'a\t{"type":"ai-title","aiTitle":"Fix login"}\nb\t\n'
  expect([...parseTitles(out)]).toEqual([['a', 'Fix login']])
})

test('builds the resume command, quoting folders the shell would split', () => {
  expect(resumeCommand({ cwd: '/x/proj', id: 'abc' })).toBe('cd /x/proj && claude --resume abc')
  expect(resumeCommand({ cwd: "/x/my app's", id: 'abc' })).toBe(`cd '/x/my app'\\''s' && claude --resume abc`)
  expect(resumeCommand({ cwd: '', id: 'abc' })).toBe('claude --resume abc')
  expect(toRow(entry(7, 'busy', 0))?.cwd).toBe('/x/proj7')
})

test('parses Korean ai-titles intact', () => {
  const out = 'k\t{"type":"ai-title","aiTitle":"특가 top10 중복 뒤로가기 버튼 제거","sessionId":"k"}\n'
  expect(parseTitles(out).get('k')).toBe('특가 top10 중복 뒤로가기 버튼 제거')
})

test('formats elapsed time in Korean', () => {
  expect(ago(2_000)).toBe('방금')
  expect(ago(5_000)).toBe('5초 전')
  expect(ago(125_000)).toBe('2분 전')
  expect(ago(7_200_000)).toBe('2시간 전')
  expect(ago(172_800_000)).toBe('2일 전')
})

test('says in Korean what a waiting session is held on, passing unknown reasons through', () => {
  expect(waitingText('dialog open')).toBe('선택 대기')
  expect(waitingText('input needed')).toBe('입력 필요')
  expect(waitingText('sandbox request')).toBe('샌드박스 허용 대기')
  expect(waitingText('')).toBe('')
  expect(waitingText('something new')).toBe('something new')
})
