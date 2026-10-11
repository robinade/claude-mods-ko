// Keyword matching for the relevance nudge: English and Korean.

// Common words that would match almost anything; left out of relevance matching.
const STOP = new Set(('this that with from into have will would could should about after before then than them they ' +
  'there their what when where which while also just like make more most some such only very each other these those ' +
  'file files code idea ideas maybe later todo want need using used use add adds added fix fixes update changes change').split(' '))

// The Korean counterpart: filler, pronouns, and work verbs that fit any task.
const KO_STOP = new Set(('그리고 그래서 그런데 근데 하지만 그러면 그럼 이거 이것 그거 그것 저거 저것 여기 거기 저기 ' +
  '좀 그냥 정말 진짜 너무 아주 많이 조금 하나 여러 지금 나중 다음 다시 우리 내가 제가 이번 이제 먼저 혹시 아마 계속 모든 전체 각각 ' +
  '어떻게 무엇 이런 저런 그런 해당 관련 위해 대해 통해 같은 같이 있는 없는 있다 없다 있게 없게 ' +
  '해줘 해주세요 해요 하자 했다 했어 하기 하는 한다 된다 되는 ' +
  '아이디어 파일 코드 수정 추가 변경 개선 작업 확인 처리 사용 기능 부분 문제 정리 필요 생각 방법 경우 ' +
  '해결 구현 적용 만들기 업데이트 나중에').split(' '))

// Particles and verb endings glued to a Korean word, longest first. A cut must
// leave at least two syllables, so short nouns that merely end like one stay whole.
const KO_SUFFIXES = [
  '해주세요', '하려면', '하려고', '해주고', '에서는', '으로는', '에서의', '으로의', '이라고',
  '하기로', '하기를', '하기가', '시키기', '시키는',
  '에서', '으로', '에게', '한테', '까지', '부터', '처럼', '보다', '하고', '이랑', '이나', '에는', '에도',
  '로는', '와는', '과는', '라고', '만큼', '마다', '밖에', '조차', '이며', '이고', '에선', '로선',
  '하기', '해줘', '했다', '했어', '했음', '하자', '해서', '하는', '한다', '하면', '하게', '해야', '하던',
  '되는', '되게', '됐다', '되면', '적인', '적으로',
  '은', '는', '이', '가', '을', '를', '에', '의', '도', '만', '로', '와', '과', '랑', '께', '엔', '들',
  '할', '함', '된', '됨',
].sort((a, b) => b.length - a.length)

const HANGUL = /[가-힣]/

// A Korean word with up to two particles or endings cut off: `파서를` → `파서`, `파일들을` → `파일`.
export function stem(word: string) {
  let w = word
  for (let round = 0; round < 2; round++) {
    const cut = KO_SUFFIXES.find(s => w.length - s.length >= 2 && w.endsWith(s))
    if (!cut) break
    w = w.slice(0, -cut.length)
  }
  return w
}

// Lowercased keywords of a text: camelCase, snake_case and paths split apart,
// and Korean words cut back to their stems.
export function words(text: string) {
  const english = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(w => w.replace(/s$/, ''))
    .filter(w => w.length >= 4 && !STOP.has(w))
  const korean = (text.match(/[가-힣]+/g) ?? [])
    .filter(w => !KO_STOP.has(w))
    .map(stem)
    .filter(w => w.length >= 2 && !KO_STOP.has(w))
  return [...english, ...korean]
}

// Words naming a file: its base name and its folder (not the whole absolute path).
export function pathWords(path: string) {
  return words(path.split('/').slice(-2).join(' '))
}

// Korean compounds are often written without spaces (`로그인화면`), so a stem of
// three or more syllables also matches a word that contains it. Two-syllable
// stems must match exactly: `로그` should not fit `로그인`.
function related(a: string, b: string) {
  if (!HANGUL.test(a) || !HANGUL.test(b)) return false
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 3 && long.includes(short)
}

// Whether an idea's text shares a keyword with the turn's topics.
export function fitsTopics(text: string, topics: Set<string>) {
  return words(text).some(w => topics.has(w) || [...topics].some(t => related(w, t)))
}
