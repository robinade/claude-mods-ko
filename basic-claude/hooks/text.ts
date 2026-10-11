// Korean-aware text helpers: terminal display width, glossary terms, command words.

import type { Level } from './rules'

// Hangul, CJK and fullwidth forms take two terminal columns; so do emoji.
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꥠ-꥿가-힣豈-﫿︰-﹏＀-｠￠-￦]/
const EMOJI = /\p{Extended_Pictographic}/u
const ZERO = /[̀-ͯ​-‏︀-️]/

const charWidth = (c: string): number => (ZERO.test(c) ? 0 : WIDE.test(c) || EMOJI.test(c) ? 2 : 1)

export const displayWidth = (s: string): number => [...s].reduce((n, c) => n + charWidth(c), 0)

// Cuts to at most `max` terminal columns, ending in "…" when anything was cut.
export const truncateWidth = (s: string, max: number): string => {
  if (displayWidth(s) <= max) return s
  let out = ''
  let used = 0
  for (const c of s) {
    const w = charWidth(c)
    if (used + w + 1 > max) break
    out += c
    used += w
  }
  return `${out}…`
}

// Particles that can trail a Korean term ("커밋을", "풀 리퀘스트는"). Only ones that
// rarely end a noun themselves: 이·가·로·도·의·과 are left alone ("게이트웨이", "워크플로", "속도", "정의", "효과").
const JOSA = ['이라는', '이라고', '라는', '라고', '이란', '에서', '으로', '에게', '부터', '까지', '이랑', '처럼', '하고', '을', '를', '은', '는']

export const stripJosa = (word: string): string => {
  if (!/[가-힣]$/.test(word)) return word
  for (const j of JOSA) {
    const stem = word.slice(0, -j.length)
    if (word.endsWith(j) && /^[가-힣a-z0-9.+#-]+$/i.test(stem) && [...stem].length >= 2) return stem
  }
  return word
}

// Keep just the term: drop a definition tail ("term: definition", "term — definition",
// "term(definition)"), a trailing particle, and anything phrase-length.
export const cleanTerm = (t: string): string | null => {
  const head = t.split(/[:：]|\s[—–-]\s|[(（]/)[0]!.replace(/\s+/g, ' ').trim().toLowerCase()
  const words = head.split(' ').filter(Boolean)
  if (!words.length || words.length > 3) return null
  words[words.length - 1] = stripJosa(words[words.length - 1]!)
  const term = words.join(' ')
  // One Hangul syllable can be a term (앱, 깃, 봇); one Latin letter can't.
  return term.length > 1 || /^[가-힣]$/.test(term) ? term : null
}

export const cleanTerms = (list: readonly unknown[]): string[] => [
  ...new Set(list.flatMap(t => (typeof t === 'string' ? (cleanTerm(t) ?? []) : []))),
]

// Splits "/plain know a, b" lists on ASCII, fullwidth and ideographic commas.
export const splitTerms = (s: string): string[] => s.split(/[,，、]/)

export const LEVEL_KO: Record<Level, string> = { beginner: '초보', expert: '전문가', off: '끔' }

const LEVEL_WORDS: Record<string, Level> = {
  beginner: 'beginner', 초보: 'beginner', 초급: 'beginner', 쉽게: 'beginner',
  expert: 'expert', 전문가: 'expert', 고급: 'expert',
  off: 'off', 끄기: 'off', 끔: 'off', 꺼: 'off',
}
const KNOW_WORDS = new Set(['know', '알아', '알아요', '앎', '용어'])
const FORGET_WORDS = new Set(['forget', '잊기', '잊어', '초기화'])

export type PlainCommand = { kind: 'level'; level: Level } | { kind: 'know'; rest: string } | { kind: 'forget' } | { kind: 'show' }

// Reads `/plain` arguments in English or Korean.
export const parseCommand = (args: string): PlainCommand => {
  const [word = '', ...rest] = args.trim().split(/\s+/)
  const cmd = word.toLowerCase()
  if (FORGET_WORDS.has(cmd)) return { kind: 'forget' }
  if (KNOW_WORDS.has(cmd)) return { kind: 'know', rest: rest.join(' ') }
  const level = LEVEL_WORDS[cmd]
  if (level && !rest.length) return { kind: 'level', level }
  return { kind: 'show' }
}
