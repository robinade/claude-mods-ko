// Text helpers that count terminal columns, not UTF-16 units: Hangul, CJK and
// most emoji take two columns, so a Korean title clipped by `.length` runs twice as wide.

// Combining marks, zero-width spaces, variation selectors, and the vowel/final
// jamo that join a decomposed (NFD) Hangul syllable, as macOS file names often are.
const isZeroWidth = (cp: number) =>
  (cp >= 0x0300 && cp <= 0x036f) ||
  (cp >= 0x1160 && cp <= 0x11ff) ||
  (cp >= 0x200b && cp <= 0x200f) ||
  (cp >= 0xfe00 && cp <= 0xfe0f) ||
  cp === 0x20e3

const isWide = (cp: number) =>
  (cp >= 0x1100 && cp <= 0x115f) ||
  (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
  (cp >= 0xac00 && cp <= 0xd7a3) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0xfe30 && cp <= 0xfe4f) ||
  (cp >= 0xff00 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6) ||
  (cp >= 0x1f300 && cp <= 0x1f64f) ||
  (cp >= 0x1f900 && cp <= 0x1faff) ||
  (cp >= 0x20000 && cp <= 0x3fffd)

export const charWidth = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  return isZeroWidth(cp) ? 0 : isWide(cp) ? 2 : 1
}

export const displayWidth = (text: string) => {
  let w = 0
  for (const ch of text) w += charWidth(ch)
  return w
}

const flatten = (text: string) => text.replace(/\s+/g, ' ').trim()

// One line, at most `max` terminal columns, `…` when cut.
export const clipWidth = (text: string, max: number) => {
  const flat = flatten(text)
  if (displayWidth(flat) <= max) return flat
  let out = ''
  let w = 0
  for (const ch of flat) {
    const cw = charWidth(ch)
    if (w + cw > max - 1) break
    out += ch
    w += cw
  }
  return `${out}…`
}

// One line, at most `max` characters (code points, so an emoji is never split), `…` when cut.
// For what is stored or sent to a model rather than drawn.
export const clipChars = (text: string, max: number) => {
  const chars = [...flatten(text)]
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('')
}

// Pads with spaces to `cols` terminal columns, so labels of mixed scripts line up.
export const padWidth = (text: string, cols: number) => text + ' '.repeat(Math.max(0, cols - displayWidth(text)))

// The same file can reach two sessions as NFC or NFD Hangul; compare paths composed.
export const nfc = (text: string) => {
  try {
    return text.normalize('NFC')
  } catch {
    return text
  }
}

// FNV-1a, 32-bit, as 8 hex digits: a stable short tag for a string.
const fnv1a = (text: string) => {
  let h = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text)) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// The record folder for a project root. ASCII roots keep the original name
// (every non-alphanumeric → '-'); a root with Hangul or other non-ASCII letters
// would collapse to dashes and share a folder with any other root of the same
// length (/work/가나 and /work/다라), so it gets a hash of the root appended.
export const folderKey = (root: string) => {
  const composed = nfc(root)
  const base = composed.replace(/[^a-zA-Z0-9]/g, '-')
  return /[^\x00-\x7f]/.test(composed) ? `${base}-${fnv1a(composed)}` : base
}
