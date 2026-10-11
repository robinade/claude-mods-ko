import { expect, test } from 'claude-code/testing'

import { cardFits, cardModels, guideFirst, normalizeModel } from './card'

test('model names read the same however /model spells them', () => {
  expect(normalizeModel('Opus 5.5 (1M context)')).toBe('opus-5-5-(1m-context)')
  expect(normalizeModel('claude-opus-5-5[1m]')).toBe('claude-opus-5-5[1m]')
  expect(normalizeModel(' Claude_Opus 5.5 ')).toBe('claude-opus-5-5')
})

test('a card names its models on its 적용 모델 line', () => {
  expect(cardModels('# 카드\n적용 모델: opus-5-5, Opus 5.5\n본문')).toEqual(['opus-5-5', 'opus-5-5'])
  expect(cardModels('# 카드\n본문만 있음')).toEqual([])
})

test('a card fits its model whole, not a longer name that starts the same', () => {
  const card = '적용 모델: opus-5-5'
  expect(cardFits(card, 'claude-opus-5-5')).toBe(true)
  expect(cardFits(card, 'claude-opus-5-5[1m]')).toBe(true)
  expect(cardFits(card, 'Opus 5.5 (1M context)')).toBe(true)
  expect(cardFits(card, 'claude-opus-5-50')).toBe(false)
  expect(cardFits(card, 'claude-opus-5')).toBe(false)
  expect(cardFits(card, 'opus')).toBe(false)
  expect(cardFits('제목만 있는 카드', 'claude-opus-5-5')).toBe(false)
})

test('guide notes move ahead of the others, each group keeping its order', () => {
  expect(guideFirst(['a', '가이드: 1', 'b', '가이드 : 2'])).toEqual(['가이드: 1', '가이드 : 2', 'a', 'b'])
  expect(guideFirst(['a', 'b'])).toEqual(['a', 'b'])
})
