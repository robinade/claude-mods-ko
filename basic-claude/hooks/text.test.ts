import { expect, test } from 'claude-code/testing'

import { cleanTerm, displayWidth, parseCommand, stripJosa, truncateWidth } from './text'

test('display width counts Hangul, CJK and emoji as two columns', () => {
  expect(displayWidth('abc')).toBe(3)
  expect(displayWidth('한글')).toBe(4)
  expect(displayWidth('漢字')).toBe(4)
  expect(displayWidth('🎉 ok')).toBe(5)
  expect(displayWidth('ㅛ')).toBe(2)
})

test('truncateWidth cuts by columns and never splits an emoji', () => {
  expect(truncateWidth('짧아요', 10)).toBe('짧아요')
  expect(truncateWidth('가나다라마바사', 7)).toBe('가나다…')
  expect(displayWidth(truncateWidth('가나다라마바사', 7))).toBeLessThanOrEqual(7)
  expect(truncateWidth('abcdefghij', 5)).toBe('abcd…')
  expect(truncateWidth('🎉🎉🎉', 4)).toBe('🎉…')
})

test('stripJosa drops trailing particles but keeps nouns that only look like them', () => {
  expect(stripJosa('커밋을')).toBe('커밋')
  expect(stripJosa('브랜치는')).toBe('브랜치')
  expect(stripJosa('api를')).toBe('api')
  expect(stripJosa('서버에서')).toBe('서버')
  expect(stripJosa('워크플로')).toBe('워크플로')
  expect(stripJosa('게이트웨이')).toBe('게이트웨이')
  expect(stripJosa('타입 정의')).toBe('타입 정의')
  expect(stripJosa('마을')).toBe('마을')
  expect(stripJosa('git')).toBe('git')
})

test('cleanTerm keeps just a short term in Korean or English', () => {
  expect(cleanTerm('풀 리퀘스트: 코드 변경 요청')).toBe('풀 리퀘스트')
  expect(cleanTerm('배포 — 서버에 올리는 일')).toBe('배포')
  expect(cleanTerm('API(프로그램끼리 대화하는 통로)')).toBe('api')
  expect(cleanTerm('풀 리퀘스트를')).toBe('풀 리퀘스트')
  expect(cleanTerm('앱')).toBe('앱')
  expect(cleanTerm('a')).toBe(null)
  expect(cleanTerm('이건 네 단어가 넘는 긴 문장이에요')).toBe(null)
  expect(cleanTerm('built-in file-editing tool')).toBe('built-in file-editing tool')
  expect(cleanTerm('Next.js: a tool')).toBe('next.js')
})

test('parseCommand reads English and Korean words', () => {
  expect(parseCommand('초보')).toEqual({ kind: 'level', level: 'beginner' })
  expect(parseCommand('전문가')).toEqual({ kind: 'level', level: 'expert' })
  expect(parseCommand('끄기')).toEqual({ kind: 'level', level: 'off' })
  expect(parseCommand('OFF')).toEqual({ kind: 'level', level: 'off' })
  expect(parseCommand('알아 커밋, 배포')).toEqual({ kind: 'know', rest: '커밋, 배포' })
  expect(parseCommand('know api')).toEqual({ kind: 'know', rest: 'api' })
  expect(parseCommand('잊기')).toEqual({ kind: 'forget' })
  expect(parseCommand('forget')).toEqual({ kind: 'forget' })
  expect(parseCommand('')).toEqual({ kind: 'show' })
  expect(parseCommand('초보 뭐')).toEqual({ kind: 'show' })
})
