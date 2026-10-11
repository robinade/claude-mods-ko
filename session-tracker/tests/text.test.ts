import { expect, test } from 'claude-code/testing'

import { agoText, pickLine, SUMMARY_PROMPT } from '../hooks/register'
import { clipChars, clipWidth, displayWidth, folderKey, nfc, padWidth } from '../hooks/text'

test('counts Hangul and emoji as two columns, decomposed jamo as one syllable', () => {
  expect(displayWidth('abc')).toBe(3)
  expect(displayWidth('로그인')).toBe(6)
  expect(displayWidth('로그인 fix')).toBe(10)
  expect(displayWidth('👥')).toBe(2)
  // 한 as NFD: ᄒ (wide) + ᅡ + ᆫ (both joining, zero width)
  expect(displayWidth('한')).toBe(2)
})

test('clips Korean by terminal columns, never splitting an emoji', () => {
  expect(clipWidth('로그인 버그 고치기', 40)).toBe('로그인 버그 고치기')
  const cut = clipWidth('결제 화면에서 뒤로가기 버튼이 두 번 보이는 문제 고치기', 20)
  expect(cut.endsWith('…')).toBe(true)
  expect(displayWidth(cut)).toBeLessThanOrEqual(20)
  expect(cut).toBe('결제 화면에서 뒤로…')
  expect(clipChars('😀😀😀😀', 3)).toBe('😀😀…')
  expect(clipChars('  여러   줄\n입력  ', 300)).toBe('여러 줄 입력')
})

test('pads mixed-script labels to the same width', () => {
  expect(displayWidth(padWidth('✓ 완료', 8))).toBe(8)
  expect(displayWidth(padWidth('☰ 할 일', 8))).toBe(8)
  expect(padWidth('✎ 파일', 8)).toBe('✎ 파일  ')
})

test('composes NFD Hangul so the same file matches across sessions', () => {
  expect(nfc('한.md')).toBe('한.md')
})

test('keeps ASCII record folders as before and separates Korean-named roots', () => {
  expect(folderKey('/work/app')).toBe('-work-app')
  const a = folderKey('/work/가나')
  const b = folderKey('/work/다라')
  expect(a).not.toBe(b)
  expect(a.startsWith('-work---')).toBe(true)
  expect(folderKey('/work/가나')).toBe(a)
  // NFD and NFC spellings of the same folder share one record folder
  expect(folderKey('/work/한')).toBe(folderKey('/work/한'))
})

test('says elapsed time in Korean', () => {
  expect(agoText(10_000)).toBe('방금')
  expect(agoText(2 * 60_000)).toBe('2분 전')
  expect(agoText(3 * 3600_000)).toBe('3시간 전')
  expect(agoText(2 * 86400_000)).toBe('2일 전')
})

test('asks for Korean values under English labels and reads them back', () => {
  const prompt = SUMMARY_PROMPT(
    { id: 'x', root: '/w', startedAt: 0, beatAt: 0, tasks: [{ id: '1', text: '폼 만들기', status: 'pending' }] },
    '끝났어요.',
  )
  expect(prompt).toContain('값은 한국어로')
  expect(prompt).toContain('[pending] 폼 만들기')
  expect(prompt).toContain('수정한 파일: 없음')

  const reply = ['TITLE: 로그인 페이지', '**DONE:** 폼 화면 만듦', '- DOING： API 연결 중', 'NEXT: 테스트 실행'].join('\n')
  expect(pickLine(reply, 'TITLE')).toBe('로그인 페이지')
  expect(pickLine(reply, 'DONE')).toBe('폼 화면 만듦')
  expect(pickLine(reply, 'DOING')).toBe('API 연결 중')
  expect(pickLine(reply, 'NEXT')).toBe('테스트 실행')
  expect(pickLine('DOING: 작업 중', 'DONE')).toBeUndefined()
})
