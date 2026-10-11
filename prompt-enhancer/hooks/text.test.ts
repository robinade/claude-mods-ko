import { expect, test } from 'claude-code/testing'

import { clipChars, displayWidth, fitWidth, sameText, truncateWidth } from './text'

test('Hangul, CJK and emoji take two columns; marks and NFD vowels take none', () => {
  expect(displayWidth('abc')).toBe(3)
  expect(displayWidth('한글')).toBe(4)
  expect(displayWidth('漢字')).toBe(4)
  expect(displayWidth('🚀')).toBe(2)
  expect(displayWidth('한'.normalize('NFD'))).toBe(2)
  expect(displayWidth('src/한글.ts')).toBe(11)
})

test('fitWidth never splits a wide character across the edge', () => {
  expect(fitWidth('한글한글', 5)).toBe('한글')
  expect(fitWidth('한글한글', 6)).toBe('한글한')
  expect(fitWidth('a한', 2)).toBe('a')
  const nfd = '한글'.normalize('NFD')
  expect(fitWidth(nfd, 2)).toBe('한'.normalize('NFD'))
  expect(truncateWidth('한글한글', 8)).toBe('한글한글')
  expect(truncateWidth('한글한글', 7)).toBe('한글한…')
})

test('clipChars counts characters, keeps emoji and NFD syllables whole', () => {
  expect(clipChars('가'.repeat(10), 10)).toBe('가'.repeat(10))
  expect(clipChars('가'.repeat(11), 10)).toBe(`${'가'.repeat(9)}…`)
  const emoji = clipChars('😀'.repeat(5), 3)
  expect(emoji).toBe('😀😀…')
  // "가나" decomposed is ㄱ ㅏ ㄴ ㅏ: a cut after ㄴ would strand it without its vowel.
  const nfd = '가나다'.normalize('NFD')
  expect(clipChars(nfd, 4)).toBe(`${'가'.normalize('NFD')}…`)
})

test('sameText treats NFC and NFD Hangul as the same text', () => {
  expect(sameText('한글', '한글'.normalize('NFD'))).toBe(true)
  expect(sameText('한글', '한국')).toBe(false)
})
