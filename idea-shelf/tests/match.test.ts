import { describe, expect, test } from 'claude-code/testing'

import { fitsTopics, pathWords, stem, words } from '../hooks/match'

const topicsOf = (prompt: string, ...paths: string[]) => new Set([...words(prompt), ...paths.flatMap(pathWords)])

describe('Korean keywords', () => {
  test('particles and endings are cut back to the stem', () => {
    expect(stem('파서를')).toBe('파서')
    expect(stem('파일들을')).toBe('파일')
    expect(stem('결제에서')).toBe('결제')
    expect(stem('캐싱하기로')).toBe('캐싱')
    // a cut must leave two syllables: short nouns that end like a particle stay whole
    expect(stem('단가')).toBe('단가')
    expect(stem('결과')).toBe('결과')
    expect(stem('경로')).toBe('경로')
  })

  test('stopwords and work verbs are left out', () => {
    expect(words('이거 좀 코드 수정해줘')).toEqual([])
    expect(words('배너를 추가해줘')).toEqual(['배너'])
  })

  test('an idea and a prompt with different particles still fit', () => {
    expect(fitsTopics('파서 출력을 캐싱하기', topicsOf('파서가 너무 느려요'))).toBe(true)
    expect(fitsTopics('결제 화면에 로딩 표시 넣기', topicsOf('결제에서 오류가 나요'))).toBe(true)
  })

  test('sharing only stopwords does not fit', () => {
    expect(fitsTopics('코드 정리하기', topicsOf('코드를 수정해줘'))).toBe(false)
    expect(fitsTopics('나중에 기능 추가', topicsOf('이 기능 좀 개선해줘'))).toBe(false)
  })

  test('long stems match inside unspaced compounds, two-syllable ones only exactly', () => {
    expect(fitsTopics('로그인화면 문구 다듬기', topicsOf('로그인 버그 고쳐줘'))).toBe(true)
    expect(fitsTopics('로그 레벨 줄이기', topicsOf('로그인 버그 고쳐줘'))).toBe(false)
  })

  test('a Korean idea naming a file fits an edit of that file', () => {
    expect(fitsTopics('parser.ts 를 lexer 와 grammar 로 나누기', topicsOf('속도 올려줘', '/proj/a/src/parser.ts'))).toBe(true)
  })
})

describe('English keywords, as before', () => {
  test('words split camelCase and paths and drop short or common ones', () => {
    expect(words('cache the parserOutput for later')).toEqual(['cache', 'parser', 'output'])
    expect(pathWords('/proj/a/src/parser.ts')).toEqual(['parser'])
  })

  test('English ideas fit English topics and nothing else', () => {
    expect(fitsTopics('cache the parser output', topicsOf('speed up parsing', '/proj/a/src/parser.ts'))).toBe(true)
    expect(fitsTopics('rename the logo asset', topicsOf('speed up parsing', '/proj/a/src/parser.ts'))).toBe(false)
  })
})
