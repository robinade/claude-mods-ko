// Korean-aware text helpers: a terminal draws Hangul, CJK and most emoji two columns wide,
// and decomposed (NFD) Hangul carries vowel/final jamo that take no column of their own.

// Code points that take no column: combining marks, NFD Hangul vowels and finals,
// zero-width spaces and joiners, variation selectors.
function isZeroWidth(cp: number) {
  return (
    (cp >= 0x0300 && cp <= 0x036f) ||
    (cp >= 0x1160 && cp <= 0x11ff) ||
    (cp >= 0xd7b0 && cp <= 0xd7ff) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xe0100 && cp <= 0xe01ef)
  )
}

function isWide(cp: number) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul leading jamo
    (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || // CJK, Hangul compatibility jamo, kana
    (cp >= 0xa960 && cp <= 0xa97f) || // Hangul jamo extended-A
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f6ff) || // emoji: symbols, faces, transport
    (cp >= 0x1f900 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
}

export function charWidth(ch: string) {
  const cp = ch.codePointAt(0) ?? 0
  return isZeroWidth(cp) ? 0 : isWide(cp) ? 2 : 1
}

export function displayWidth(s: string) {
  let w = 0
  for (const ch of s) w += charWidth(ch)
  return w
}

// The longest prefix of `s` that fits in `cols` terminal columns. A mark that takes
// no column stays with the character before it.
export function fitWidth(s: string, cols: number) {
  let used = 0
  let out = ''
  for (const ch of s) {
    const w = charWidth(ch)
    if (used + w > cols) break
    used += w
    out += ch
  }
  return out
}

// `s` cut to at most `cols` columns, ending in `…` when it was cut.
export function truncateWidth(s: string, cols: number) {
  return displayWidth(s) <= cols ? s : `${fitWidth(s, cols - 1)}…`
}

// `s` cut to at most `max` characters (code points, so emoji and other surrogate
// pairs stay whole), ending in `…` when it was cut. A cut never strands a mark
// from its base: an NFD syllable is dropped whole.
export function clipChars(s: string, max: number) {
  const chars = Array.from(s)
  if (chars.length <= max) return s
  let cut = max - 1
  while (cut > 0 && isZeroWidth(chars[cut]!.codePointAt(0) ?? 0)) cut--
  return `${chars.slice(0, cut).join('')}…`
}

// The same text typed one way or the other (NFC from the composer, NFD from a
// macOS file name) compares equal.
export function sameText(a: string, b: string) {
  if (a === b) return true
  try {
    return a.normalize('NFC') === b.normalize('NFC')
  } catch {
    return false
  }
}
