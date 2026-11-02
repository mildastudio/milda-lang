// ─── Literal words ─────────────────────────────────────────────────────────────
// What a bare word in a value position means when it is NOT a token. The parser decides a
// facet's kind from these at parse time; the validator needs the same answer later, for the
// positions (layout gap/inset/size, the inset and border facets) where the parser mints a token
// id for every word and leaves the token-or-literal question to whoever reads it.

import { COLOR_KEYWORDS } from './vocabulary'

export const NUMBER_RE = /^-?\d+(\.\d+)?$/

// A bare facet-value word that is a raw literal rather than a token path. Unlike the
// editor-IR heuristic, `.` is NOT a raw marker - DSL token refs are dotted (accent.9).
export const isRawValue = (v: string) =>
  /^#/.test(v) || /[(%]/.test(v) || /\d(px|rem|em|vh|vw|vmin|vmax|ch|ex|fr|deg|ms|s)$/.test(v)

const colorKeywords: ReadonlySet<string> = new Set(COLOR_KEYWORDS)

/**
 * Could this word be a literal, if no token by that name exists? (proposal 0049)
 *
 * The language's half of core's `couldBeLiteral`: the fallback gate a reader applies only after
 * the foundations said no. Core cannot be imported from here (core -> milda), and its rule reads
 * `.` as a raw marker, which a DSL token path is not. A misspelled id (`acent-3`) still fails it,
 * which is the point of keeping a gate at all.
 */
export function couldBeLiteral(word: string): boolean {
  return NUMBER_RE.test(word) || isRawValue(word) || colorKeywords.has(word)
}
