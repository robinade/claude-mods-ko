// Model cards: one Markdown file per model under cards/, holding the prompting guide's
// points that a rewrite can act on. A card names the models it is for on its
// "적용 모델: a, b" line. Pure on purpose: the engine follows `$` only within one file,
// so register.tsx lists and reads the files and asks these which one fits.

const MODELS_LINE = /^적용 모델:\s*(.+)$/m

// "Opus 5.5 (1M context)", "claude-opus-5-5[1m]" and "claude-opus-5-5" all read as "…opus-5-5…".
export function normalizeModel(s: string) {
  return s.trim().toLowerCase().replace(/[\s._]+/g, '-')
}

// The model names a card is for; none when it has no "적용 모델:" line.
export function cardModels(card: string): string[] {
  const m = MODELS_LINE.exec(card)
  if (!m) return []
  return m[1]!.split(',').map(normalizeModel).filter(Boolean)
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Whether `card` is for the session model `model`, as `/model` shows it. A name matches
// whole: "opus-5-5" fits "claude-opus-5-5[1m]" but not "claude-opus-5-50".
export function cardFits(card: string, model: string) {
  const name = normalizeModel(model)
  return cardModels(card).some(k => new RegExp(`(?:^|[^a-z0-9])${escape(k)}(?![a-z0-9])`).test(name))
}

// Notes on which card points a rewrite applied ("가이드: …") come first, so the three
// lines the band shows keep them.
const GUIDE_NOTE = /^가이드\s*:/
export function guideFirst(notes: string[]) {
  return [...notes.filter(n => GUIDE_NOTE.test(n)), ...notes.filter(n => !GUIDE_NOTE.test(n))]
}
