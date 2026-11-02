// ─── Milda DSL parser - Slice 1 ───────────────────────────────────────────────
// Hand-written recursive-descent parser over the surface tokens (./lexer.ts),
// producing the canonical AST (packages/milda/types). The surface uses names/paths;
// the AST uses ids - so this is exactly where name→id binding happens (the inverse
// of @mildastudio/generate's id→path emitter). Ids are derived deterministically
// from names/paths so the mapping is stable and round-trippable.
//
// SLICE 1 (this file): document skeleton + `context-group` + `foundations { token … }`
//   with raw (color/dimension/generic), `alias by …`, and `escape` token values.
// DEFERRED - parsed only far enough to skip cleanly, with a recorded issue:
//   SLICE 2 `type …`  ·  SLICE 3 `component …` (archetype/props/events/parts/realize).
//
// The parser never throws on a recoverable problem: it records an `issue` and keeps
// going, so a partial or in-progress file still yields a usable AST.

import type {
  AliasTokenValue,
  ColorSpace,
  ColorValue,
  ComputeOp,
  ComputeSpace,
  ComputeTokenValue,
  DimensionValue,
  DurationValue,
  EscapeTokenValue,
  FontCategory,
  FontFamilyValue,
  LengthKeyword,
  LengthKeywordValue,
  Token as AstToken,
  TokenType,
  TokenValue,
} from '../types/tokens'
import type { ContextGroup, Layer } from '../types/tokens'
import type { Foundations } from '../types/foundations'
import type { Id, Metadata, PropValue, SharedType, TypeExpr } from '../types/ast'
import type {
  AssetDecl,
  AssetsDecl,
  DocBlockDecl,
  DocPageDecl,
  DocsDecl,
  DocsFooterDecl,
  DocsSiteDecl,
  IconDecl,
  IconsDecl,
  IconSetDecl,
} from '../types/library'
import type { GlobalProp, ProjectMetadataEntry, RuleSubject, UsageRule } from '../types/foundations'
import { archetypesByName } from '../prelude/preludeV0'
import type {
  Component,
  ComponentGroupDecl,
  CommitRealize,
  CompareOp,
  Composition,
  DemoVariable,
  EventDef,
  Example,
  PartAction,
  Part,
  PartA11y,
  PartCell,
  PartContent,
  PartContentRule,
  PartEmit,
  PartForeign,
  PartInstance,
  PartMediaSource,
  PartMotionTransition,
  PartRepeat,
  PartRepeatSource,
  PartSlot,
  PartSlotSample,
  PartValue,
  PartVariant,
  Predicate,
  PredicateRef,
  PresentationRealize,
  PropConstraint,
  PropDef,
  RealizeCond,
  Realization,
  Wire,
} from '../types/components'
import type {
  Align,
  AxisIntent,
  AxisSizeValue,
  BorderFacetValue,
  Distribute,
  FacetMap,
  FacetName,
  FacetValue,
  InsetValue,
  LayoutSpec,
  StackAxis,
  StateName,
} from '../types/facets'
import type { CoordEntry, UsesClause } from '../types/prelude'
import { lex, LexError, type SkippedChar, type Token } from './lexer'
// The closed word sets the surface fixes. Shared with the AST→IR lowering and the LSP, so a
// suggestion, a validation and a print can never disagree about what the language accepts.
import {
  AXIS_CLAMPS,
  AXIS_INTENTS,
  COLOR_LITERAL_ALIASES,
  COLOR_LITERAL_SPELLINGS,
  DOC_PROSE_KINDS,
  LAYOUT_ALIGNS,
  LAYOUT_DIRECTIONS,
  LAYOUT_DISTRIBUTES,
  LAYOUT_WRAPS,
  INSET_EDGES,
  LOGICAL_EDGES,
  MILDA_SURFACE_VERSION,
  LENGTH_LITERAL_FNS,
  NODE_KINDS,
  PHYSICAL_EDGE_ALIASES,
  POSITION_KINDS,
  PRELUDE_VERSION,
  PART_CONFIG_NAMES,
  PART_CONFIG_WORDS,
  STATE_NAMES,
  type LayoutWrap,
  type LogicalEdge,
} from './vocabulary'
import { NUMBER_RE, isRawValue } from './literal'

export interface DesignSystemDocument {
  milda: string
  kind: 'design-system'
  prelude: string
  meta: { id: string; name: string; version: string; description?: string }
  foundations: Foundations
  components: Component[]
  // The rest of the library (proposal 0041). Optional because a file need not have any of
  // them - and because absent is not the same as empty: a system with no docs and one
  // whose docs were dropped on export are different states, and the second was the bug.
  componentGroups?: ComponentGroupDecl[]
  examples?: Example[]
  docs?: DocsDecl
  assets?: AssetsDecl
  icons?: IconsDecl
}

export interface ParseIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  line: number
  col: number
}

// 1-based line/col, matching the lexer and `ParseIssue` (LSP tooling converts to
// 0-based at the edge).
export interface SourcePosition {
  line: number
  col: number
}

export interface SourceRange {
  start: SourcePosition
  end: SourcePosition
}

export type SpanKind =
  | 'component'
  | 'token'
  | 'contextGroup'
  | 'context'
  | 'sharedType'
  | 'globalProp'
  | 'rule'
  | 'part'
  | 'prop'
  | 'event'

// A source span for a declared entity, keyed off the same deterministic ids the AST
// uses. The canonical AST stays position-free; this side-table is where the parser
// hands positions to tooling (LSP symbols / folding / navigation, semantic-diagnostic
// placement) without changing any AST node type. Nested entities (part/prop/event)
// carry `parentId` so a symbol tree can be reconstructed.
export interface NodeSpan {
  id: string
  kind: SpanKind
  name: string
  nameRange: SourceRange // just the declared identifier
  fullRange: SourceRange // the whole declaration, including any block
  parentId?: string // enclosing entity (e.g. the component a part belongs to)
}

export interface ParseResult {
  document: DesignSystemDocument
  issues: ParseIssue[]
  spans: NodeSpan[]
}

export interface ParseOptions {
  name?: string
  milda?: string
  prelude?: string
}

// ─── id derivation (surface name/path → canonical id) ────────────────────────
const seg = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x'
const cgId = (name: string) => `cg.${seg(name)}`
const ctxId = (groupName: string, ctxName: string) => `ctx.${seg(groupName)}.${seg(ctxName)}`
const tokId = (path: string) => `tok.${path.replace(/\//g, '.')}`
const stId = (name: string) => `st.${seg(name)}`
const cmpId = (name: string) => `cmp.${seg(name)}`

// Infer a metadata entry's TypeExpr from its value (proposal 0026).
function metaValueType(v: PropValue): TypeExpr {
  if (typeof v === 'number') return { kind: 'number' }
  if (typeof v === 'boolean') return { kind: 'boolean' }
  if (Array.isArray(v)) return { kind: 'array', item: { kind: 'string' } }
  return { kind: 'string' }
}

// Surface facet name → canonical AST FacetName. Names with no AST home (weight,
// font, slant - the typography axes §3 the FacetMap doesn't yet model) map to null
// and are dropped with a warning.
const FACET_MAP: Record<string, FacetName | null> = {
  fill: 'fill',
  ink: 'ink',
  border: 'border',
  'border.top': 'border.top',
  'border.right': 'border.right',
  'border.bottom': 'border.bottom',
  'border.left': 'border.left',
  'border.inline-start': 'border.inline-start',
  'border.inline-end': 'border.inline-end',
  'border.block-start': 'border.block-start',
  'border.block-end': 'border.block-end',
  corner: 'corner',
  inset: 'inset',
  // One axis or one edge (proposal 0057), from the vocabulary so the parser, the printer and
  // the LSP cannot disagree about which edges there are.
  ...Object.fromEntries(INSET_EDGES.map((e) => [`inset.${e}`, `inset.${e}` as FacetName])),
  gap: 'gap',
  text: 'text',
  'text.clamp': 'textClamp',
  'text.wrap': 'textWrap',
  elevation: 'elevation',
  overlay: 'overlay',
  opacity: 'opacity',
  ring: 'ring',
  backdrop: 'backdrop',
  weight: 'weight',
  font: 'font',
  slant: 'slant',
}

// Surface token-type name → canonical AST TokenType (best effort; unknown kept raw).
const TYPE_MAP: Record<string, TokenType> = {
  color: 'color',
  spacing: 'spacing',
  radius: 'radius',
  size: 'size',
  dimension: 'size',
  shadow: 'shadow',
  typography: 'typography',
  'font-family': 'fontFamily',
  fontFamily: 'fontFamily',
  'font-weight': 'fontWeight',
  fontWeight: 'fontWeight',
  // A unitless ratio (a line height). `ratio` is the canonical word - it is what the value
  // schema calls this kind (TOKEN_VALUE_KIND: lineHeight -> 'ratio', RatioValue), and it is
  // what the printer writes. `line-height` is the kebab spelling of the AST type, accepted
  // because a typography record already writes that word for the same quantity. `number` is
  // read but NOT advertised: it is what the printer emitted before this type had a word of
  // its own, and dropping it would turn an already-exported `1.5` into `1.5px` on read.
  ratio: 'lineHeight',
  'line-height': 'lineHeight',
  lineHeight: 'lineHeight',
  number: 'lineHeight',
  easing: 'easing',
  gradient: 'gradient',
  'font-size': 'fontSize',
  fontSize: 'fontSize',
  'letter-spacing': 'letterSpacing',
  letterSpacing: 'letterSpacing',
  duration: 'duration',
  opacity: 'opacity',
  blur: 'blur',
  tonal: 'tonal',
  border: 'border',
  elevation: 'elevation',
  ring: 'ring',
  backdrop: 'backdrop',
  none: 'none',
}

// ─── surface vocabulary, exported for editor tooling ─────────────────────────
// The word sets below are what THIS parser accepts at each position. Editor tooling
// (the LSP's context-aware completion) reads them from here rather than re-deriving
// them from the prelude, so a suggestion can never be something the parser would
// then reject (e.g. the prelude's `textClamp` vs the surface's `text.clamp`).

/** Facet names accepted by `parseFacetStmt` (those with an AST home). */
export const FACET_NAMES: readonly string[] = Object.keys(FACET_MAP).filter(
  (name) => FACET_MAP[name] !== null,
)

/** Spellings the reader still accepts but tooling must not offer: a word that was only ever
 *  written by an older printer, and that says the value's SHAPE rather than its kind. Kept
 *  readable so a file exported before the type had its own word still comes back as a ratio
 *  rather than as a length. */
const LEGACY_TYPE_NAMES = new Set(['number'])

/** Token-type names accepted by `parseTokenDecl` - kebab spelling only (the camelCase
 *  aliases in TYPE_MAP stay accepted, they're just not advertised, and neither are the
 *  legacy spellings above). */
export const TOKEN_TYPE_NAMES: readonly string[] = Object.keys(TYPE_MAP).filter(
  (name) => !/[A-Z]/.test(name) && !LEGACY_TYPE_NAMES.has(name),
)

/** The `token … = ‹kind›` value kinds. */
export const TOKEN_VALUE_KINDS: readonly string[] = ['raw', 'alias', 'escape', 'compute']

/** The steps a `compute … { … }` block accepts, by vocabulary (proposal 0044). Colour steps
 *  and measurement steps are both listed: which ones are legal follows the token's type, and
 *  a step from the wrong vocabulary is reported rather than silently dropped. */
const COLOR_COMPUTE_OPS = new Set([
  'lighten',
  'darken',
  'saturate',
  'desaturate',
  'alpha',
  'rotate',
  'mix',
])
const LENGTH_COMPUTE_OPS = new Set(['scale', 'offset', 'round'])
/** The spaces the maths can happen in - wider than the four a literal can be spelled in. */
const COMPUTE_SPACES = new Set(['srgb', 'display-p3', 'oklch', 'hsl', 'oklab', 'lab', 'lch'])

/** Keys accepted inside a `layout { … }` block - keep in step with `parseLayoutBody`. `flow` and
 *  `ratio` are reading aliases (0056 §3.2); `grid` is reserved (0056 §3.3). */
export const LAYOUT_KEYS: readonly string[] = [
  'stack',
  'flow',
  'gap',
  'align',
  'distribute',
  'wrap',
  'position',
  'size',
  'ratio',
  'inset',
  'grid',
]

/** What may follow each word inside a `layout { … }` block, keyed on the word BEFORE the
 *  cursor so completion can read it directly: a key's values, the edges after `pinned` /
 *  `bleed`, the intents after `size` / `width` / `height`. All from the vocabulary (0056 §3.1),
 *  so the parser, the printer and the LSP cannot disagree about a word. */
export const LAYOUT_VALUES: Readonly<Record<string, readonly string[]>> = {
  stack: LAYOUT_DIRECTIONS,
  align: LAYOUT_ALIGNS,
  distribute: LAYOUT_DISTRIBUTES,
  wrap: LAYOUT_WRAPS,
  position: POSITION_KINDS,
  pinned: LOGICAL_EDGES,
  bleed: LOGICAL_EDGES,
  size: ['width', 'height', ...AXIS_INTENTS],
  width: AXIS_INTENTS,
  height: AXIS_INTENTS,
  grid: ['cols', 'rows'],
}

/** Slot arities accepted by `slot ‹arity›` (grammar `arity`). */
export const SLOT_ARITIES: readonly string[] = ['single', 'optional', 'many']

/** Statement keywords accepted inside a `part { … }` block, for editor completion. */
export const PART_KEYWORDS: readonly string[] = [
  'kind',
  'origin',
  'present',
  'slot',
  'content',
  'a11y',
  'emits',
  'bind',
  'value',
  'repeat',
  'cell',
  'control',
  'group',
  'presentation',
  'media',
  'source',
  'alt',
  'destination',
  'layout',
  'state',
  'when',
  'motion',
  'instance',
  'behavior',
  'foreign',
  'action',
  ...PART_CONFIG_WORDS,
  ...PART_CONFIG_NAMES,
]

// Parse a `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` hex string into an sRGB ColorValue
// (channels 0..1). Returns null for any non-hex form (rgb(), named, …) and for a digit
// count that is not one of the four CSS Color 4 shapes.
function hexToColor(hex: string): ColorValue | null {
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(hex.trim())
  if (!m) return null
  let h = m[1]
  // 3 and 4 digits are the shorthands: each digit doubles (`#f0c8` = `#ff00cc88`).
  if (h.length === 3 || h.length === 4)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  if (h.length !== 6 && h.length !== 8) return null
  const byte = (k: number) => parseInt(h.slice(k * 2, k * 2 + 2), 16) / 255
  const value: ColorValue = { space: 'srgb', channels: [byte(0), byte(1), byte(2)] }
  if (h.length === 8) value.alpha = byte(3)
  return value
}

// ─── first-class value literals ──────────────────────────────────────────────
// Colors are given as color-space functions (never a raw quoted hex string): the
// `#` char is a comment marker, so hex is `hex(rrggbb)`. Dimensions/durations are
// unit-suffixed numbers. All map to the canonical typed AST values.
// Read from the one table that also tells an editor what each function's channels mean
// (./vocabulary VALUE_LITERAL_FNS): the reader's set and the writer's help cannot drift. The
// spellings include the CSS aliases (`rgba`, `hsla`), which are read and canonicalized.
const COLOR_FNS = new Set(COLOR_LITERAL_SPELLINGS)
// Length spellings (0038). `px`/`dp` are the same density-independent unit; `rem`/`sp`
// are the same text-scaled one. Milda reads all four and emits only `px` and
// `scaled(n)`: `rem` names a DOM concept that has no iOS/Android counterpart, and
// reading a length as "16 times something" is what produced the assumed-16px-root drift.
const UNIT_RE = /^(-?\d*\.?\d+)(px|dp|rem|sp|em|%|ms|s)$/
// The unit spellings that carry a platform's name into the source. Read, then hinted.
const WEB_UNITS = new Set(['rem'])
/** Length-valued function literals (`scaled(0.75)` = 0.75x the user's text size). */
const LENGTH_FNS = new Set(LENGTH_LITERAL_FNS)
/** Length values that are an intent rather than a measurement (0038). */
const LENGTH_KEYWORDS = new Set<LengthKeyword>(['pill'])
/** AST token types whose value is a length, i.e. where a bare number is ambiguous. */
const LENGTH_AST_TYPES = new Set([
  'spacing',
  'radius',
  'size',
  'border',
  'fontSize',
  'letterSpacing',
])
// Token types that carry a colour, so a reference to one fills a colour slot rather than a
// dimension slot. `ring` and `backdrop` are colour-valued facet types.
const COLOR_AST_TYPES = new Set(['color', 'ring', 'backdrop'])
// The length types that measure TEXT, where a text-relative length (`scaled(n)`) is the
// point rather than a slip.
const TEXT_LENGTH_AST_TYPES = new Set(['fontSize', 'letterSpacing'])
const isLengthAstType = (t: TokenType | string): boolean => LENGTH_AST_TYPES.has(String(t))

/** The surface token-type names whose value MUST carry a unit (a bare number is rejected
 *  with `length-unit-required`). Exported so the printer's own "emit a canonical length
 *  here" set can be asserted against this one: giving `border`/`font-size`/`letter-spacing`
 *  their own words widened the reader's set and left the writer's behind, so the printer
 *  emitted bare numbers its own reader then refused (0041 §1.1d). */
export const LENGTH_TOKEN_TYPE_NAMES: readonly string[] = Object.keys(TYPE_MAP).filter((name) =>
  isLengthAstType(TYPE_MAP[name]),
)

/**
 * The KIND of value a token type carries. Types are grouped into families rather than compared
 * exactly, because several of them share a value shape on purpose: a `ring` or a `backdrop` IS a
 * colour, and every length type fills a length slot. Used by the alias cross-type check (below)
 * and by editor tooling, which offers the tokens that would fit a slot - one answer to "can this
 * value go there", not two that can disagree.
 */
export function tokenTypeFamily(type: TokenType | string): string {
  const name = String(type)
  if (COLOR_AST_TYPES.has(name)) return 'color'
  if (LENGTH_AST_TYPES.has(name)) return 'length'
  if (name === 'opacity' || name === 'lineHeight') return 'ratio'
  if (name === 'elevation' || name === 'shadow' || name === 'blur' || name === 'tonal')
    return 'elevation'
  return name
}

/** Every accepted spelling of a token type → the AST type it means (`dimension` → `size`,
 *  `font-family` → `fontFamily`). Exported so tooling can read a DECLARED type off the source
 *  and compare it with the tokens it already parsed. */
export const TOKEN_TYPES_BY_NAME: Readonly<Record<string, TokenType>> = TYPE_MAP

/** The surface token-type names whose value is a COLOUR - so an editor knows that this is
 *  where `hex(…)` and `oklch(…)` belong, without a second list of type names to keep in
 *  step with this file's (a `ring` and a `backdrop` are colours too, and both were missed
 *  by every hand-written copy of "the colour types"). */
export const COLOR_TOKEN_TYPE_NAMES: readonly string[] = Object.keys(TYPE_MAP).filter((name) =>
  COLOR_AST_TYPES.has(String(TYPE_MAP[name])),
)

// What `N%` means per space, per channel, per CSS Color 4: the reference the
// percentage is taken OF. A bare number is always the value verbatim. `null` marks a
// channel where percentages are meaningless (hue is degrees either way).
// These MUST stay in step with colorToCss in generate/targets/dsl/toIr.ts, which
// serializes hsl's s/l as percentages of 1 and oklch's channels verbatim.
const CHANNEL_PCT_REF: Record<string, readonly (number | null)[]> = {
  srgb: [1, 1, 1],
  rgb: [255, 255, 255],
  p3: [1, 1, 1],
  oklch: [1, 0.4, null], // L is 0..1; CSS Color 4 fixes 100% chroma at 0.4; H is degrees
  hsl: [null, 1, 1], // H is degrees; s/l are 0..1
}

// One channel word to a number. Returns null (rather than silently yielding 0) when
// the word is not numeric, so the caller can report it: coercing NaN into a dropped
// channel is exactly what made `hsl(210 50% 40%)` parse back as [210, 0, 0].
function channelValue(word: string, pctRef: number | null): number | null {
  const w = word.replace(/deg$/i, '')
  if (w.endsWith('%')) {
    const n = Number(w.slice(0, -1))
    if (Number.isNaN(n)) return null
    return pctRef == null ? n : (n / 100) * pctRef
  }
  const n = Number(w)
  return Number.isNaN(n) ? null : n
}

function unitToValue(n: number, unit: string): DimensionValue | DurationValue {
  switch (unit) {
    case 'px':
    case 'dp':
      return { value: n, unit: 'fixed' }
    case 'em':
      return { value: n, unit: 'em' }
    case '%':
      return { value: n, unit: 'percent' }
    case 'ms':
      return { ms: n }
    case 's':
      return { ms: n * 1000 }
    case 'rem':
    case 'sp':
      return { value: n, unit: 'scaled' }
    default:
      return { value: n, unit: 'fixed' }
  }
}

// The statement half of a rule - everything but the id, severity and rationale.
type RuleBody = UsageRule extends infer R
  ? R extends unknown
    ? Omit<R, 'id' | 'severity' | 'rationale'>
    : never
  : never

class Parser {
  private toks: Token[]
  private pos = 0
  issues: ParseIssue[] = []
  // Source spans for declared entities (see NodeSpan). Populated as declarations are
  // parsed; the AST itself never gains position fields.
  spans: NodeSpan[] = []
  // The component currently being parsed, so nested part/prop/event spans can point
  // back at it via `parentId`.
  private currentComponentId: string | null = null
  // Component names a rule refers to, with the token that named them, so an unknown one can be
  // reported where it was written once every component has been read (proposal 0052 §5.4).
  private ruleComponentRefs: Array<{ name: string; tok: Token }> = []
  // The bare-identifier type refs, which alone may turn out to name a context group. An explicit
  // `ref X` said what it is, and the exporter prints every shared-type and built-in type that way.
  private readonly provisionalRefs = new WeakSet<TypeExpr>()
  // Tokens synthesized while parsing (inline literals hoisted out of alias slots -
  // the canonical AST's `refs` holds only token ids, so an inline value must become
  // its own token). Deduped by (type, serialized value). Flushed into the layer.
  private synth: AstToken[] = []
  private synthKeys = new Map<string, string>()
  // id -> declared type for every token seen so far. Foundations are parsed BEFORE components,
  // so by the time a facet references a token its type is known - which is what lets the border
  // facet tell a colour from a width without guessing (see parseFacet).
  private tokenTypes = new Map<string, string>()
  // Alias slots that point at another token by path, held for a check once every token's type
  // is known (see checkAliasTypes). A colour aliased to a radius token resolves to a value the
  // theme cannot use, and nothing said so - it is not a parse error, it is a wrong system.
  private aliasRefs: Array<{ declType: string; refId: string; tok: Token }> = []

  // The raw source, kept so a rule can recover the EXACT text between two tokens. Needed
  // where the surface holds an expression the AST stores verbatim (a wire's `(S.sel ?? first)`):
  // rebuilding it from tokens loses whatever the lexer normalised, and a coordination rule
  // that comes back subtly different is worse than one that fails to parse.
  private src: string
  constructor(toks: Token[], src = '') {
    this.toks = toks
    this.src = src
  }

  // The source text spanned by tokens [from, to) - trimmed, empty when the range is empty.
  private textBetween(fromTok: Token, toTok: Token): string {
    return this.src.slice(fromTok.pos, toTok.pos).trim()
  }

  // Hoist an inline literal into a synthesized token and return its id.
  private hoistLiteral(astType: TokenType | string, raw: unknown, tok: Token): string {
    const value = this.typedRaw(astType, raw, tok) as TokenValue
    const key = `${astType}\0${JSON.stringify(value)}`
    const existing = this.synthKeys.get(key)
    if (existing) return existing
    const id = `tok.lit-${seg(String(astType))}-${this.synth.length + 1}`
    this.synth.push({ id, name: `(inline ${astType})`, type: astType as TokenType, value })
    this.synthKeys.set(key, id)
    this.issue(
      'warning',
      'inline-literal',
      `inline ${astType} literal in an alias slot hoisted to token ${id}`,
      tok,
    )
    return id
  }

  // Hoist an already-typed token value (an inline literal in an alias slot) into a
  // synthesized token and return its id.
  private hoistValue(
    astType: TokenType | string,
    value: TokenValue,
    tok: Token,
    /** What was hoisted, for the diagnostic - a computed value is not a "literal". */
    what = 'literal',
  ): string {
    const key = `${astType} ${JSON.stringify(value)}`
    const existing = this.synthKeys.get(key)
    if (existing) return existing
    const id = `tok.lit-${seg(String(astType))}-${this.synth.length + 1}`
    this.synth.push({ id, name: `(inline ${astType})`, type: astType as TokenType, value })
    this.synthKeys.set(key, id)
    this.issue(
      'warning',
      'inline-literal',
      `inline ${astType} ${what} in a slot hoisted to token ${id}`,
      tok,
    )
    return id
  }

  // A self-typing value literal: a color-space function (`oklch(…)`, `hex(rrggbb)`, …),
  // a length function (`scaled(0.75)`), a unit-suffixed number (`8px`, `150ms`), or a
  // length keyword (`pill`, length-typed tokens only). Returns a raw TokenValue, or null
  // if the cursor isn't at such a literal (then it consumes nothing).
  private tryParseLiteralValue(astType?: TokenType | string): TokenValue | null {
    const t = this.peek()
    if (t.type !== 'word') return null
    const fnAhead = this.toks[this.pos + 1]?.type === 'lparen'
    if (COLOR_FNS.has(t.value) && fnAhead) {
      return { kind: 'raw', value: this.parseColorFn(t.value) } as TokenValue
    }
    if (LENGTH_FNS.has(t.value) && fnAhead) {
      return { kind: 'raw', value: this.parseLengthFn(t.value) } as TokenValue
    }
    // A keyword length is only a keyword where a length is expected; anywhere else the
    // word stays available as a token path.
    if (
      astType != null &&
      isLengthAstType(astType) &&
      LENGTH_KEYWORDS.has(t.value as LengthKeyword)
    ) {
      this.next()
      return { kind: 'raw', value: { keyword: t.value as LengthKeyword } } as TokenValue
    }
    const m = UNIT_RE.exec(t.value)
    if (m) {
      this.next()
      this.noteWebUnit(m[2], t)
      return { kind: 'raw', value: unitToValue(Number(m[1]), m[2]) } as TokenValue
    }
    return null
  }

  // `scaled( n )` - a length expressed as a multiple of the user's text size. The
  // function form (rather than a `sp`/`rem` suffix) keeps the surface free of any one
  // platform's unit name, and matches the color functions already in the grammar.
  private parseLengthFn(fn: string): DimensionValue {
    const fnTok = this.peek()
    this.next() // fn name
    this.expect('lparen', 'length-lparen')
    const words: string[] = []
    while (!this.at('rparen') && !this.at('eof')) words.push(this.next().value)
    this.expect('rparen', 'length-rparen')
    const n = Number(words[0])
    if (words.length !== 1 || Number.isNaN(n)) {
      this.issue('error', 'length-fn', `${fn}() takes one number, got "${words.join(' ')}"`, fnTok)
      return { value: 0, unit: 'scaled' }
    }
    return { value: n, unit: 'scaled' }
  }

  // A unit that names one platform's model is read, then hinted: the canonical spellings
  // are `px` (density-independent) and `scaled(n)` (text-relative).
  private noteWebUnit(unit: string, tok: Token): void {
    if (!WEB_UNITS.has(unit)) return
    this.issue(
      'warning',
      'web-unit',
      `"${unit}" read as a text-scaled length; the canonical spelling is scaled(n)`,
      tok,
    )
  }

  // `fn( a b c [/ alpha] )` - space-separated channels, each a bare number or a
  // percentage (hex takes raw digits). Accepts both CSS Color 4 forms, so
  // `oklch(62% 0.19 268)` and `oklch(0.62 0.19 268)` mean the same thing - and the legacy
  // comma-separated form (`rgb(59, 130, 246)`), which is what most authors have typed for
  // twenty years. `spelling` is what the author wrote; `fn` is the function it means.
  private parseColorFn(spelling: string): ColorValue {
    const fn = COLOR_LITERAL_ALIASES[spelling] ?? spelling
    const fnTok = this.peek()
    this.next() // fn name
    this.expect('lparen', 'color-lparen')
    const words: string[] = []
    // Commas are separators here, nothing more: dropping them makes the legacy CSS form and
    // the modern space-separated one the same call.
    while (!this.at('rparen') && !this.at('eof')) {
      const tok = this.next()
      if (tok.type !== 'comma') words.push(tok.value)
    }
    this.expect('rparen', 'color-rparen')

    if (fn === 'hex') {
      const hex = words.join('')
      const parsed = hexToColor(hex.startsWith('#') ? hex : `#${hex}`)
      if (parsed) return parsed
      // Falling back to black without a word is how `hex(12345)` and `hex(zz)` used to
      // become a colour the author never wrote (and `hex()` a colour they never gave).
      // The empty case is usually not an omission: `#` opens a comment in this language, so
      // `hex(#ffffff)` swallowed the digits and the rest of the line - worth saying outright.
      // Nothing, or a payload that ran past the end of the line, means the digits were eaten
      // by a comment - which is what `hex(#ffffff)` does, since `#` opens one here.
      const eaten = hex === '' || hex.includes('\n')
      this.issue(
        'error',
        'color-hex',
        eaten
          ? 'hex() needs digits: 3, 4, 6 or 8 of them (0-9, a-f), written without a "#" - a "#" starts a comment here'
          : `"${hex}" is not a hex colour: hex() takes 3, 4, 6 or 8 digits (0-9, a-f)`,
        fnTok,
      )
      return { space: 'srgb', channels: [0, 0, 0] }
    }

    // CSS Color 4 separates alpha with a slash. `/` is a word character in the lexer,
    // so it arrives either alone (`268 / 0.5`) or glued to a neighbour (`268/0.5`) -
    // rejoining and splitting on it makes both forms behave identically.
    const [mainPart, alphaPart] = words.join(' ').split('/')
    const chanWords = mainPart.split(/\s+/).filter(Boolean)
    const refs = CHANNEL_PCT_REF[fn] ?? [1, 1, 1]
    // rgb() authors channels in 0..255 (bare and percentage alike); every other space
    // is already in the units ColorValue stores.
    const scale = fn === 'rgb' ? 1 / 255 : 1

    const channels: number[] = []
    for (let i = 0; i < 3; i++) {
      const word = chanWords[i]
      if (word === undefined) {
        this.issue(
          'warning',
          'color-channels',
          `${fn}() expects 3 channels, got ${chanWords.length}`,
          fnTok,
        )
        channels.push(0)
        continue
      }
      const v = channelValue(word, refs[i] ?? 1)
      if (v == null) {
        this.issue('warning', 'color-channel', `unparseable ${fn}() channel "${word}"`, fnTok)
        channels.push(0)
        continue
      }
      channels.push(refs[i] == null ? v : v * scale)
    }

    const space: ColorSpace =
      fn === 'rgb' ? 'srgb' : fn === 'p3' ? 'display-p3' : (fn as ColorSpace)
    const cv: ColorValue = { space, channels }
    // Alpha comes either CSS-style after a slash (`oklch(… / 50%)`) or as a bare
    // fourth channel (`srgb(1 1 1 0.8)`), which is the DSL's own older spelling and
    // stays supported.
    const alphaWord = alphaPart !== undefined ? alphaPart.trim() : chanWords[3]
    if (alphaWord !== undefined) {
      const a = channelValue(alphaWord, 1)
      if (a == null)
        this.issue('warning', 'color-alpha', `unparseable ${fn}() alpha "${alphaWord}"`, fnTok)
      else cv.alpha = a
    }
    return cv
  }

  // Self-typing literals let us check the value's inherent kind against the token's
  // declared type (e.g. `token x : color = 8px` is a dimension in a color slot).
  private checkLiteralType(astType: TokenType | string, lit: TokenValue, tok: Token): void {
    if (lit.kind !== 'raw') return
    const v = lit.value
    if (typeof v !== 'object' || v === null) return
    const cat =
      'space' in v
        ? 'color'
        : 'ms' in v
          ? 'duration'
          : 'unit' in v || 'keyword' in v
            ? 'dimension'
            : null
    if (!cat) return
    const expected =
      astType === 'color'
        ? 'color'
        : astType === 'duration'
          ? 'duration'
          : isLengthAstType(astType)
            ? 'dimension'
            : null
    if (expected && cat !== expected) {
      this.issue('error', 'value-type', `${cat} literal in a "${astType}" token`, tok)
    }
    // `pill` is a corner intent, not a length any other scale can carry.
    if ('keyword' in v && v.keyword === 'pill' && astType !== 'radius') {
      this.issue('error', 'value-type', `"pill" is a radius intent, not a "${astType}" value`, tok)
    }
    // Text-scaled lengths are correct for type sizes and usually a transcription
    // accident anywhere else: the author rarely means "this padding grows with the
    // user's text size". A warning asks the question; there are systems that mean it.
    // On a font-size or a letter-spacing it is not even a question - that is what the
    // unit is FOR - and the warning fired there too, on the one use it should not.
    if (
      'unit' in v &&
      v.unit === 'scaled' &&
      isLengthAstType(astType) &&
      !TEXT_LENGTH_AST_TYPES.has(String(astType))
    ) {
      this.issue(
        'warning',
        'scaled-length',
        `text-scaled length on a "${astType}" token: it will grow with the user's text size (use px for a fixed length)`,
        tok,
      )
    }
  }

  private peek(): Token {
    return this.toks[this.pos]
  }
  private next(): Token {
    return this.toks[this.pos++]
  }
  private at(type: Token['type']): boolean {
    return this.peek().type === type
  }
  // A `word` whose text equals `w` (case-sensitive keyword check).
  private atWord(w: string): boolean {
    const t = this.peek()
    return t.type === 'word' && t.value === w
  }
  // No further value on this statement: the next token ends it (`;`, a line break, or the
  // block's own `}`). What makes a trailing value OPTIONAL rather than ambiguous.
  private atValueEnd(): boolean {
    return this.at('semi') || this.at('newline') || this.at('rbrace') || this.at('eof')
  }
  private skipNewlines(): void {
    while (this.at('newline') || this.at('semi')) this.pos++
  }
  // Safety net: if a loop body made no progress (a malformed token that no rule
  // consumed), force one token forward so parsing can never spin. Returns true when
  // it had to intervene (the caller can also choose to break).
  private ensureProgress(mark: number): boolean {
    if (this.pos !== mark) return false
    if (!this.at('eof')) this.next()
    return true
  }
  // ─── span recording (source positions for tooling) ─────────────────────────
  private recordSpan(span: NodeSpan): void {
    this.spans.push(span)
  }

  private startPos(tok: Token): SourcePosition {
    return { line: tok.line, col: tok.col }
  }

  // End position of a token = its start advanced past its source text. Strings add 2
  // for the surrounding quotes (escape sequences make this a slight over-estimate,
  // affecting only a rarely-used string span - never an identifier or brace).
  private endPos(tok: Token): SourcePosition {
    const len =
      tok.type === 'newline' || tok.type === 'eof'
        ? 0
        : tok.type === 'string'
          ? tok.value.length + 2
          : tok.value.length
    return { line: tok.line, col: tok.col + len }
  }

  private rangeOf(start: Token, end: Token): SourceRange {
    return { start: this.startPos(start), end: this.endPos(end) }
  }

  // The most-recently-consumed token - closes a span that has no trailing brace
  // (a single-line `token`/`type` declaration ends at its value).
  private lastTok(): Token {
    return this.toks[Math.max(0, this.pos - 1)]
  }

  private issue(
    severity: ParseIssue['severity'],
    code: string,
    message: string,
    tok = this.peek(),
  ): void {
    this.issues.push({ severity, code, message, line: tok.line, col: tok.col })
  }
  // Consume a token of `type`, or record an error and synthesize one.
  private expect(type: Token['type'], code: string): Token {
    if (this.at(type)) return this.next()
    const tok = this.peek()
    this.issue('error', code, `expected ${type}, got ${tok.type} ${JSON.stringify(tok.value)}`)
    return tok
  }
  // A bare word (ident/path/number token).
  private expectWord(code: string): string {
    if (this.at('word')) return this.next().value
    this.issue('error', code, `expected identifier, got ${this.peek().type}`)
    return ''
  }

  // A UI-state word: `state X`, `bind state X`, `when state X`, `when ancestor P X`. The word is
  // kept whatever it is - lossless first, and an unknown state matches nothing - but the reader
  // says so, because `state hover` is the CSS habit this most often catches and nothing downstream
  // would ever complain: the rule simply never applies. The message names the list rather than
  // refusing, and the one near miss a CSS writer makes (the bare verb) gets its spelling.
  private expectStateWord(code: string): string {
    const tok = this.peek()
    const word = this.expectWord(code)
    if (!word || (STATE_NAMES as readonly string[]).includes(word)) return word
    const near = [`${word}ed`, `${word}d`].find((w) =>
      (STATE_NAMES as readonly string[]).includes(w),
    )
    this.issue(
      'warning',
      'state-unknown',
      `unknown state ${JSON.stringify(word)}${near ? ` - did you mean '${near}'?` : ''} - a state is one of: ${STATE_NAMES.join(', ')}`,
      tok,
    )
    return word
  }

  // Skip a balanced `{ … }` block (already positioned at or before the `{`).
  private skipBlock(): void {
    while (!this.at('lbrace') && !this.at('eof') && !this.at('newline')) this.next()
    if (!this.at('lbrace')) return
    let depth = 0
    do {
      const t = this.next()
      if (t.type === 'lbrace') depth++
      else if (t.type === 'rbrace') depth--
      else if (t.type === 'eof') break
    } while (depth > 0)
  }

  // ── context-group NAME { ctx ctx … } ──
  parseContextGroup(): ContextGroup | null {
    const kw = this.next() // 'context-group'
    const nameTok = this.peek()
    const name = this.expectWord('cg-name')
    this.expect('lbrace', 'cg-lbrace')
    const contexts: ContextGroup['contexts'] = []
    while (!this.at('rbrace') && !this.at('eof')) {
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const ctxTok = this.peek()
      const ctxName = this.expectWord('cg-ctx')
      if (!ctxName) break
      contexts.push({ id: ctxId(name, ctxName), name: ctxName })
      this.recordSpan({
        id: ctxId(name, ctxName),
        kind: 'context',
        name: ctxName,
        nameRange: this.rangeOf(ctxTok, ctxTok),
        fullRange: this.rangeOf(ctxTok, ctxTok),
        parentId: cgId(name),
      })
    }
    const close = this.expect('rbrace', 'cg-rbrace')
    this.recordSpan({
      id: cgId(name),
      kind: 'contextGroup',
      name,
      nameRange: this.rangeOf(nameTok, nameTok),
      fullRange: this.rangeOf(kw, close),
    })
    return { id: cgId(name), name, contexts }
  }

  // ── raw value literal → a JS value (string | number | nested object) ──
  private parseRawLiteral(): unknown {
    const t = this.peek()
    if (t.type === 'string') return this.next().value
    if (t.type === 'lbrace') return this.parseStructured()
    if (t.type === 'word') {
      // First-class literals also work inside structured values (e.g. a typography
      // block's `size: 0.75rem`) and alias slots.
      if (COLOR_FNS.has(t.value) && this.toks[this.pos + 1]?.type === 'lparen')
        return this.parseColorFn(t.value)
      if (LENGTH_FNS.has(t.value) && this.toks[this.pos + 1]?.type === 'lparen')
        return this.parseLengthFn(t.value)
      const m = UNIT_RE.exec(t.value)
      if (m) {
        this.next()
        this.noteWebUnit(m[2], t)
        return unitToValue(Number(m[1]), m[2])
      }
      const w = this.next().value
      return NUMBER_RE.test(w) ? Number(w) : w
    }
    this.issue('error', 'raw-value', `expected a value, got ${t.type}`)
    return ''
  }

  private parseStructured(): Record<string, unknown> {
    this.expect('lbrace', 'struct-lbrace')
    const obj: Record<string, unknown> = {}
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const key = this.expectWord('struct-key')
      this.expect('colon', 'struct-colon')
      const val = this.parseRawLiteral()
      if (key) obj[key] = val
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'struct-rbrace')
    return obj
  }

  // ── convert a raw JS value to the canonical typed value for `astType` ──
  private typedRaw(
    astType: TokenType | string,
    raw: unknown,
    tok: Token,
  ): TokenValue | EscapeTokenValue {
    // color: hex string → sRGB channels.
    if (astType === 'color' && typeof raw === 'string') {
      const color = hexToColor(raw)
      if (color) return { kind: 'raw', value: color } as TokenValue
      this.issue('warning', 'color-nonhex', `non-hex color "${raw}" kept as an escape value`, tok)
      return { kind: 'escape', raw, note: 'non-hex color literal' }
    }
    // dimension-ish: `{ value; unit }` → as given. A BARE number is rejected (0038):
    // it used to mean `scaled`, so `12px` → IR `12` → re-emitted `12` came back as
    // 12rem, a silent 16x drift. Requiring the unit makes that unrepresentable. It is
    // still read as `fixed`, which is what every stored bare number has meant.
    if (isLengthAstType(astType)) {
      if (typeof raw === 'number') {
        this.issue(
          'error',
          'length-unit-required',
          `"${raw}" needs a unit on a "${astType}" token: ${raw}px (fixed) or scaled(${raw})`,
          tok,
        )
        return { kind: 'raw', value: { value: raw, unit: 'fixed' } as DimensionValue } as TokenValue
      }
      if (raw && typeof raw === 'object' && 'keyword' in (raw as object)) {
        return { kind: 'raw', value: raw as LengthKeywordValue } as TokenValue
      }
      if (raw && typeof raw === 'object' && 'value' in (raw as object)) {
        const r = raw as { value: number; unit?: string }
        return {
          kind: 'raw',
          value: { value: Number(r.value), unit: (r.unit as DimensionValue['unit']) ?? 'fixed' },
        } as TokenValue
      }
    }
    if (astType === 'opacity' && typeof raw === 'number')
      return { kind: 'raw', value: { value: raw } } as TokenValue
    // A lineHeight is a unitless ratio, carried in the same `{ value }` shape as an opacity so
    // both cross the boundary the same way. Deliberately NOT a length: requiring a unit here
    // would be wrong, and accepting one would reintroduce `1.5` meaning `1.5px`.
    if (astType === 'lineHeight' && typeof raw === 'number')
      return { kind: 'raw', value: { value: raw } } as TokenValue
    if (astType === 'fontWeight' && typeof raw === 'number')
      return { kind: 'raw', value: { weight: raw } } as TokenValue
    if (astType === 'duration' && typeof raw === 'number')
      return { kind: 'raw', value: { ms: raw } } as TokenValue
    // A FAMILY, in the two ways it can be written: a bare name (`"Inter"`) or the full record
    // the printer emits. Normalised here so every reader downstream gets one shape - without
    // this the permissive fallback below let `family` through as a bare string, and the editor
    // could not tell a family from any other opaque scalar.
    if (astType === 'fontFamily') {
      const fam = this.fontFamilyValue(raw, tok)
      if (fam) return { kind: 'raw', value: fam } as TokenValue
    }
    if (astType === 'tonal' && typeof raw === 'number')
      return { kind: 'raw', value: { level: raw } } as TokenValue
    // Everything else: permissive raw (the AST schema intentionally tolerates untyped
    // raw payloads for token types we don't yet convert to their canonical shape).
    return { kind: 'raw', value: raw as never } as TokenValue
  }

  /**
   * A font-family literal → the canonical `FontFamilyValue`.
   *
   * Two surface forms, both first-class:
   *   `raw "Inter"` - just a name, everything else defaulted.
   *   `raw { family: "Inter"; fallback: sans-serif; source: google; license: "OFL-1.1" }`
   *
   * `fallback` is written as ONE generic word rather than a list because the grammar's
   * structured literal has no array form; the AST keeps the list shape, so a hand-written
   * file may also spell several as a comma-separated string.
   */
  private fontFamilyValue(raw: unknown, tok: Token): FontFamilyValue | null {
    const categoryOf = (word: string): FontCategory => {
      const w = word.trim().toLowerCase()
      if (w === 'serif') return 'serif'
      if (w === 'mono' || w === 'monospace') return 'mono'
      if (w === 'display' || w === 'cursive' || w === 'fantasy') return 'display'
      return 'sans'
    }
    const fallbackList = (v: unknown): string[] =>
      typeof v === 'string'
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : []

    if (typeof raw === 'string') {
      return { family: raw, fallback: [], category: 'sans' }
    }
    if (!raw || typeof raw !== 'object') return null
    const o = raw as Record<string, unknown>
    const family = typeof o.family === 'string' ? o.family : ''
    if (!family) {
      this.issue('error', 'font-family-name', 'a font-family value needs a `family`', tok)
      return null
    }
    const fallback = fallbackList(o.fallback)
    const source =
      o.source === 'system'
        ? ({ kind: 'system' } as const)
        : o.source === 'google'
          ? ({
              kind: 'google',
              ...(typeof o.license === 'string' ? { license: o.license } : {}),
            } as const)
          : o.source === 'custom'
            ? ({ kind: 'custom' } as const)
            : undefined
    return {
      family,
      fallback,
      category: categoryOf(typeof o.category === 'string' ? o.category : (fallback[0] ?? 'sans')),
      ...(typeof o.asset === 'string' ? { assetId: o.asset } : {}),
      ...(source ? { source } : {}),
    }
  }

  // ── alias by GROUP { Ctx -> <path | inline literal> ; default -> … } ──
  // A slot value is normally a token path (ref). The authored surface also allows an
  // inline literal (a hex color, a structured value) in a slot; since the AST's `refs`
  // holds only ids, such literals are hoisted to synthesized tokens (hoistLiteral).
  private parseAlias(astType: TokenType | string): AliasTokenValue {
    const aliasTok = this.peek()
    this.next() // 'alias'
    if (this.atWord('by')) this.next()
    else this.issue('error', 'alias-by', "expected 'by'")
    const groupName = this.expectWord('alias-group')
    this.expect('lbrace', 'alias-lbrace')
    const refs: Record<string, string> = {}
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const ctxName = this.expectWord('alias-ctx')
      this.expect('arrow', 'alias-arrow')
      const slot = this.peek()
      let refId = ''
      // A COMPUTED value in a slot (proposal 0044). The editor writes one here whenever a
      // computed token is edited while a non-base context is previewed, so this is a shape the
      // app really produces - and without this branch `compute` was read as a token PATH and
      // the block then choked on its braces. Hoisted like an inline literal, for the same
      // reason: the AST's `refs` hold ids, so a value in a slot becomes a synthesized token
      // (and the printer puts it back inline).
      if (slot.type === 'word' && slot.value === 'compute') {
        refId = this.hoistValue(astType, this.parseCompute(astType), slot, 'computed value')
        if (ctxName && refId) {
          const key = ctxName === 'default' ? 'default' : ctxId(groupName, ctxName)
          refs[key] = refId
        }
        if (this.at('semi') || this.at('newline')) this.pos++
        this.ensureProgress(mark)
        continue
      }
      const lit = this.tryParseLiteralValue(astType)
      if (lit) {
        this.checkLiteralType(astType, lit, slot)
        refId = this.hoistValue(astType, lit, slot)
      } else if (
        slot.type === 'string' ||
        slot.type === 'lbrace' ||
        (slot.type === 'word' && NUMBER_RE.test(slot.value))
      ) {
        refId = this.hoistLiteral(astType, this.parseRawLiteral(), slot)
      } else {
        const refPath = this.expectWord('alias-ref')
        if (refPath) {
          refId = tokId(refPath)
          // Checked at the END of the document, not here: foundations are read top to bottom
          // and an alias may legitimately point at a token declared further down, so the
          // target's type is not knowable yet.
          this.aliasRefs.push({ declType: String(astType), refId, tok: slot })
        }
      }
      if (ctxName && refId) {
        const key = ctxName === 'default' ? 'default' : ctxId(groupName, ctxName)
        refs[key] = refId
      }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'alias-rbrace')
    // An alias with no lines resolves to nothing at all - in every context. Reported here
    // rather than in the validator because it does not need the group to be knowable: the
    // block is empty whether or not `by` names a group this file can see.
    if (Object.keys(refs).length === 0) {
      this.issue(
        'error',
        'alias-empty',
        `alias by ${groupName} has no values: give each context a line (Ctx -> token) or a default`,
        aliasTok,
      )
    }
    return { kind: 'alias', by: cgId(groupName), refs }
  }

  // ── compute BASE [in SPACE] { step ; step … } (proposal 0044) ──
  // A value derived from another token, live: "the accent, 20% lighter", "the body size,
  // 1.25 times, rounded to 2". Two vocabularies share one form - a colour is lightened and
  // mixed, a measurement is scaled and rounded - and which one is legal follows the token's
  // declared type, so a `scale` on a colour is reported rather than quietly ignored.
  //
  // The base (and a `mix` operand) is a token PATH. An inline literal is accepted there and
  // hoisted to a synthesized token, exactly as in an alias slot - the canonical AST names
  // tokens rather than embedding anonymous values, and the emitter prints the sugar back.
  private parseCompute(astType: TokenType | string): ComputeTokenValue {
    const computeTok = this.peek()
    this.next() // 'compute'

    const base = this.parseComputeOperand(astType, 'compute-base')

    let space: ComputeSpace | undefined
    if (this.atWord('in')) {
      const inTok = this.next()
      const name = this.expectWord('compute-space')
      if (COMPUTE_SPACES.has(name)) space = name as ComputeSpace
      else if (name) {
        this.issue(
          'error',
          'compute-space',
          `unknown compute space "${name}"; expected one of ${[...COMPUTE_SPACES].join(', ')}`,
          inTok,
        )
      }
    }

    const ops: ComputeOp[] = []
    this.expect('lbrace', 'compute-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi') || this.at('comma')) {
        this.pos++
        continue
      }
      const op = this.parseComputeStep(astType)
      if (op) ops.push(op)
      // A rejected step leaves its ARGUMENT on the cursor, and reading that as the next step
      // name reports a second error for one mistake ("scale 2" on a colour said both "scale
      // computes a measurement" and "unknown compute step 2"). One mistake, one message: skip
      // to the separator instead.
      else this.skipToComputeSeparator()
      if (this.at('semi') || this.at('newline') || this.at('comma')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'compute-rbrace')

    // A compute with no steps is the base restated, which is what a plain ref already says -
    // and it reads as an unfinished edit rather than as an intent.
    if (ops.length === 0) {
      this.issue(
        'warning',
        'compute-empty',
        'compute has no steps, so it resolves to its base unchanged; a plain reference says that more directly',
        computeTok,
      )
    }
    const out: ComputeTokenValue = { kind: 'compute', base, ops }
    if (space) out.space = space
    return out
  }

  /** Everything up to the end of the current compute step, after one was rejected. */
  private skipToComputeSeparator(): void {
    while (
      !this.at('semi') &&
      !this.at('newline') &&
      !this.at('comma') &&
      !this.at('rbrace') &&
      !this.at('eof')
    ) {
      this.pos++
    }
  }

  /** The base, or a `mix` operand: a token path, or an inline literal that gets hoisted. */
  private parseComputeOperand(astType: TokenType | string, code: string): string {
    const slot = this.peek()
    // A nested compute ("mix with the accent, itself lightened"). The IR allows it, so the
    // surface has to read it rather than mistake the word `compute` for a token path.
    if (slot.type === 'word' && slot.value === 'compute') {
      return this.hoistValue(astType, this.parseCompute(astType), slot, 'computed value')
    }
    const lit = this.tryParseLiteralValue(astType)
    if (lit) {
      this.checkLiteralType(astType, lit, slot)
      return this.hoistValue(astType, lit, slot)
    }
    if (slot.type === 'string' || slot.type === 'lbrace') {
      return this.hoistLiteral(astType, this.parseRawLiteral(), slot)
    }
    const refPath = this.expectWord(code)
    if (!refPath) return ''
    const refId = tokId(refPath)
    // Same deferred check as an alias ref: foundations are read top to bottom, so the
    // target's type is not knowable until the whole document has been seen.
    this.aliasRefs.push({ declType: String(astType), refId, tok: slot })
    return refId
  }

  /** One step inside a compute block. Returns null (having reported) on a bad step. */
  private parseComputeStep(astType: TokenType | string): ComputeOp | null {
    const opTok = this.peek()
    const name = this.expectWord('compute-op')
    if (!name) return null

    const wantsLength = isLengthAstType(astType)
    const known = COLOR_COMPUTE_OPS.has(name) || LENGTH_COMPUTE_OPS.has(name)
    if (!known) {
      this.issue('error', 'compute-op', `unknown compute step "${name}"`, opTok)
      return null
    }
    // The step exists, but not for THIS type: naming the vocabulary is the whole point,
    // because "scale" on a colour is a plausible thing to try and a silent drop teaches
    // nothing.
    if (wantsLength !== LENGTH_COMPUTE_OPS.has(name)) {
      this.issue(
        'error',
        'compute-op-type',
        wantsLength
          ? `"${name}" computes a colour; a measurement takes ${[...LENGTH_COMPUTE_OPS].join(', ')}`
          : `"${name}" computes a measurement; a colour takes ${[...COLOR_COMPUTE_OPS].join(', ')}`,
        opTok,
      )
      return null
    }

    if (name === 'mix') {
      const withId = this.parseComputeOperand(astType, 'compute-mix-operand')
      const amount = this.expectFraction('compute-mix-amount')
      return { op: 'mix', with: withId, amount }
    }
    if (name === 'rotate') {
      const t = this.peek()
      const word = this.expectWord('compute-degrees')
      // `30` and `30deg` both mean the same rotation; the unit is accepted because it is
      // the natural thing to type, and dropped because the field is already degrees.
      const n = Number(word.replace(/deg$/, ''))
      if (!Number.isFinite(n)) {
        this.issue(
          'error',
          'compute-degrees',
          `expected a hue rotation in degrees, got "${word}"`,
          t,
        )
        return null
      }
      return { op: 'rotate', degrees: n }
    }
    if (name === 'scale') {
      const t = this.peek()
      const word = this.expectWord('compute-factor')
      const n = Number(word.replace(/x$/, ''))
      if (!Number.isFinite(n)) {
        this.issue('error', 'compute-factor', `expected a multiplier, got "${word}"`, t)
        return null
      }
      return { op: 'scale', factor: n }
    }
    if (name === 'offset' || name === 'round') {
      const t = this.peek()
      const word = this.expectWord(`compute-${name}`)
      const n = this.dpNumber(word)
      if (n == null) {
        this.issue(
          'error',
          `compute-${name}`,
          `expected a density-independent length (e.g. 2px), got "${word}"`,
          t,
        )
        return null
      }
      return name === 'offset' ? { op: 'offset', delta: n } : { op: 'round', to: n }
    }
    // lighten / darken / saturate / desaturate / alpha - all one fraction.
    const amount = this.expectFraction(`compute-${name}`)
    return { op: name as 'lighten' | 'darken' | 'saturate' | 'desaturate' | 'alpha', amount }
  }

  /** `20%` (or a bare `0.2`) → 0.2. The surface prefers the percentage, which is how an
   *  author says it; the AST stores the fraction, which is how the maths uses it. */
  private expectFraction(code: string): number {
    const t = this.peek()
    const word = this.expectWord(code)
    const pct = /^(-?\d*\.?\d+)%$/.exec(word)
    if (pct) return +(Number(pct[1]) / 100).toFixed(4)
    const n = Number(word)
    if (Number.isFinite(n)) return n
    this.issue('error', code, `expected a percentage, got "${word}"`, t)
    return 0
  }

  /** A dp-denominated length: `2px`, `-2px`, or a bare number (already dp). */
  private dpNumber(word: string): number | null {
    const m = /^(-?\d*\.?\d+)(px|dp)?$/.exec(word)
    if (!m) return null
    const n = Number(m[1])
    return Number.isFinite(n) ? n : null
  }

  // ── the right-hand side of `token … =` ──
  private parseTokenValue(astType: TokenType | string): TokenValue {
    const t = this.peek()
    if (t.type === 'word' && t.value === 'alias') return this.parseAlias(astType)
    if (t.type === 'word' && t.value === 'compute') return this.parseCompute(astType)
    if (t.type === 'word' && t.value === 'escape') {
      this.next()
      const raw = this.at('string') ? this.next().value : this.expectWord('escape-raw')
      let escNote: string | undefined
      if (this.atWord('note')) {
        this.next()
        escNote = this.at('string') ? this.next().value : this.expectWord('escape-note')
      }
      const esc: EscapeTokenValue = { kind: 'escape', raw }
      if (escNote) esc.note = escNote
      return esc
    }
    if (t.type === 'word' && t.value === 'raw') {
      this.next()
      const raw = this.parseRawLiteral()
      return this.typedRaw(astType, raw, t) as TokenValue
    }
    // A bare structured literal `{ … }` (the surface omits `raw` before objects).
    if (t.type === 'lbrace') {
      const raw = this.parseStructured()
      return this.typedRaw(astType, raw, t) as TokenValue
    }
    // Bare path after `=` - an unconditional ref (surface sugar). The canonical AST
    // has no plain-ref token value, so lower to a default-only alias and flag it.
    if (t.type === 'word') {
      // First-class value literals: color functions and unit-suffixed numbers.
      const lit = this.tryParseLiteralValue(astType)
      if (lit) {
        this.checkLiteralType(astType, lit, t)
        return lit
      }
      // A bare number typed by the token's declared type (opacity/weight/spacing/…).
      if (NUMBER_RE.test(t.value)) {
        this.next()
        return this.typedRaw(astType, Number(t.value), t) as TokenValue
      }
      // Bare path after `=` - an unconditional ref (surface sugar).
      const refPath = this.next().value
      this.issue(
        'warning',
        'ref-sugar',
        `unconditional ref "${refPath}" lowered to a default-only alias`,
        t,
      )
      return { kind: 'alias', by: '', refs: { default: tokId(refPath) } }
    }
    this.issue('error', 'token-value', `expected a token value, got ${t.type}`)
    return { kind: 'raw', value: '' as never }
  }

  // ── foundations { [layer NAME {] token PATH : TYPE = VALUE … [}] } → Layers ──
  // Layers (proposal 0006) are the authored ordering of the foundations: primitives, then the
  // semantic tokens that alias them. Until 2026-07-27 the printer emitted them as a COMMENT
  // (`# Semantic layer`), which this parser ignored, so a three-layer system imported as one and
  // the author's structure was silently flattened (proposal 0041 §1.1c).
  //
  // The block is OPTIONAL and additive: tokens written directly inside `foundations` still land
  // in the default layer, so every existing file parses unchanged.
  parseFoundations(layer: Layer, layers: Layer[]): void {
    this.next() // 'foundations'
    this.expect('lbrace', 'foundations-lbrace')

    // One token statement into `into`, returning whether it consumed anything.
    const tokenInto = (into: Layer, order: number): boolean => {
      const tok = this.parseTokenDecl(order)
      if (!tok) return false
      into.tokens.push(tok)
      return true
    }
    const recover = (): void => {
      this.issue(
        'error',
        'foundations-stmt',
        `unexpected ${JSON.stringify(this.peek().value)} in foundations`,
      )
      while (!this.at('newline') && !this.at('semi') && !this.at('rbrace') && !this.at('eof'))
        this.next()
    }

    let order = 0
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (this.atWord('layer')) {
        this.next()
        const name = this.expectWord('layer-name') || `Layer ${layers.length + 1}`
        this.expect('lbrace', 'layer-lbrace')
        // Declaration order IS layer order; the editor sorts on it.
        const nested: Layer = { id: `layer.${seg(name)}`, name, order: layers.length, tokens: [] }
        layers.push(nested)
        let nestedOrder = 0
        while (!this.at('rbrace') && !this.at('eof')) {
          const inner = this.pos
          if (this.at('newline') || this.at('semi')) {
            this.pos++
            continue
          }
          if (this.atWord('token')) {
            if (tokenInto(nested, nestedOrder)) nestedOrder++
            this.ensureProgress(inner)
            continue
          }
          recover()
          this.ensureProgress(inner)
        }
        this.expect('rbrace', 'layer-rbrace')
        this.ensureProgress(mark)
        continue
      }
      if (this.atWord('token')) {
        if (tokenInto(layer, order)) order++
        this.ensureProgress(mark)
        continue
      }
      recover()
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'foundations-rbrace')
    // Flush hoisted inline-literal tokens into the layer that DECLARED them. Appending them to
    // the default layer instead would invent a layer that the author never wrote: with explicit
    // `layer` blocks the real tokens live in a nested layer, so the default one would exist
    // solely to hold synthesized literals.
    if (this.synth.length) {
      const target = layers.length ? (layers[layers.length - 1] as Layer) : layer
      target.tokens.push(...this.synth)
      this.synth = []
    }
  }

  private parseTokenDecl(_order: number): AstToken | null {
    const startTok = this.next() // 'token'
    const nameTok = this.peek()
    const path = this.expectWord('token-path')
    if (!path) return null
    this.expect('colon', 'token-colon')
    const typeName = this.expectWord('token-type')
    const astType = TYPE_MAP[typeName]
    if (!astType)
      this.issue(
        'warning',
        'token-type',
        `non-canonical token type "${typeName}" kept as-is`,
        startTok,
      )
    this.expect('equals', 'token-equals')
    const value = this.parseTokenValue(astType ?? typeName)
    // An optional trailing description, mirroring `component X "…" {`. The printer used to write
    // it as a `# …` comment, which this parser discards - so authored prose that the docs
    // transclude was lost on every round trip (proposal 0041 §1.1d). Unambiguous: the value has
    // already been consumed by the time we look, and an opaque string VALUE is written with the
    // `raw` keyword.
    let description: string | undefined
    if (this.at('string')) description = this.next().value
    this.recordSpan({
      id: tokId(path),
      kind: 'token',
      name: path,
      nameRange: this.rangeOf(nameTok, nameTok),
      fullRange: this.rangeOf(startTok, this.lastTok()),
    })
    this.tokenTypes.set(tokId(path), astType ?? typeName)
    return {
      id: tokId(path),
      name: path,
      type: (astType ?? typeName) as TokenType,
      value,
      ...(description ? { description } : {}),
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Slice 2 - shared types
  // ════════════════════════════════════════════════════════════════════════

  // Abandon the rest of one statement. A block that OPENS inside the skipped run is
  // skipped whole: stopping at the first `;` or `}` inside it would leave the `{` we
  // already consumed unmatched, and every following brace would be read one scope too
  // deep - one mis-authored facet closed its part, then its component, and the rest of
  // the file was read at the top level. Recovery has to stay inside the statement.
  private skipToTerminator(): void {
    while (!this.at('newline') && !this.at('semi') && !this.at('rbrace') && !this.at('eof')) {
      if (this.at('lbrace')) this.skipBlock()
      else this.next()
    }
  }

  private parseIdentList(): string[] {
    const out: string[] = []
    if (this.at('word')) out.push(this.next().value)
    while (this.at('comma')) {
      this.next()
      if (this.at('word')) out.push(this.next().value)
    }
    return out
  }

  private parseObjectType(): TypeExpr {
    this.expect('lbrace', 'obj-lbrace')
    const fields: Extract<TypeExpr, { kind: 'object' }>['fields'] = []
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const name = this.expectWord('field-name')
      let required = true
      if (this.at('question')) {
        this.next()
        required = false
      }
      this.expect('colon', 'field-colon')
      const type = this.parseTypeExpr()
      if (name) fields.push({ id: `fld.${seg(name)}`, name, type, required })
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'obj-rbrace')
    return { kind: 'object', fields }
  }

  private parseTypeExpr(): TypeExpr {
    const t = this.peek()
    if (t.type !== 'word') {
      this.issue('error', 'type-expr', `expected a type, got ${t.type}`)
      return { kind: 'string' }
    }
    const w = t.value
    if (w === 'string' || w === 'number' || w === 'boolean') {
      this.next()
      return { kind: w }
    }
    if (w === 'enum') {
      this.next()
      this.expect('lparen', 'enum-lparen')
      const values = this.parseIdentList()
      this.expect('rparen', 'enum-rparen')
      return { kind: 'enum', values }
    }
    if (w === 'ref') {
      this.next()
      const name = this.expectWord('ref-name')
      return { kind: 'ref', ref: stId(name) }
    }
    if (w === 'array') {
      this.next()
      this.expect('lt', 'array-lt')
      const item = this.parseTypeExpr()
      this.expect('gt', 'array-gt')
      return { kind: 'array', item }
    }
    if (w === 'union') {
      this.next()
      this.expect('lparen', 'union-lparen')
      const members = [this.parseTypeExpr()]
      while (this.at('comma')) {
        this.next()
        members.push(this.parseTypeExpr())
      }
      this.expect('rparen', 'union-rparen')
      return { kind: 'union', members }
    }
    if (w === 'object') {
      this.next()
      return this.parseObjectType()
    }
    if (w === 'component') {
      this.next()
      let componentIds: string[] | undefined
      if (this.at('lparen')) {
        this.next()
        componentIds = this.parseIdentList().map(cmpId)
        this.expect('rparen', 'component-rparen')
      }
      return { kind: 'component', componentIds }
    }
    if (w === 'context') {
      // The explicit form of a context-group-typed prop (proposal 0001 §4).
      this.next()
      const group = this.expectWord('context-type')
      return { kind: 'context', group: cgId(group) }
    }
    // A bare identifier as a type = a shared-type OR context-group reference. Which one it is
    // depends on a declaration that may not have been read yet (a `component` block can precede
    // its `context-group`), so it is settled once the document is assembled - see
    // `resolveContextTypes`. Until then the ref is provisional.
    this.next()
    const provisional: TypeExpr = { kind: 'ref', ref: stId(w) }
    this.provisionalRefs.add(provisional)
    return provisional
  }

  parseSharedType(): SharedType | null {
    const kw = this.next() // 'type'
    const nameTok = this.peek()
    const name = this.expectWord('type-name')
    if (!name) return null
    this.expect('equals', 'type-equals')
    const definition = this.parseTypeExpr()
    this.recordSpan({
      id: stId(name),
      kind: 'sharedType',
      name,
      nameRange: this.rangeOf(nameTok, nameTok),
      fullRange: this.rangeOf(kw, this.lastTok()),
    })
    return { id: stId(name), name, definition }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Slice 3 - components
  // ════════════════════════════════════════════════════════════════════════

  // A condition's raw text: `prop` or `prop=value` (reused by wire/gate `when`).
  private parseConditionText(): string {
    let text = this.expectWord('cond')
    if (this.at('equals')) {
      this.next()
      const v = this.at('string') ? this.next().value : this.expectWord('cond-val')
      text += `=${v}`
    }
    return text
  }

  // A prop condition → RealizeCond { prop, eq } (single `prop=value`).
  private parseRealizeCond(): RealizeCond {
    const prop = this.expectWord('rc-prop')
    let eq: string | number | boolean = true
    if (this.at('equals')) {
      this.next()
      if (this.at('string')) eq = this.next().value
      else {
        const v = this.expectWord('rc-val')
        eq = NUMBER_RE.test(v) ? Number(v) : v === 'true' ? true : v === 'false' ? false : v
      }
    }
    return { prop, eq }
  }

  // ── Predicate expression parser (proposal 0032) ─────────────────────────────
  // Recursive-descent over the surface predicate grammar emitted by @mildastudio/
  // generate's `predToDsl` (targets/dsl/emit.ts). Precedence, lowest → highest:
  //   or  →  and  →  unary(`not`)  →  primary(`( … )` | leaf)
  // A leaf names a source (`state s` / `context g` / `ancestor id s` / a bare prop path)
  // then an optional operator + value: a bare leaf is `set`, `not <leaf>` is `unset`, and
  // a parenthesized `not ( … )` negates a whole group. Values are bare idents/numbers/
  // bools or quoted strings (mirroring the emitter's `predValue`), coerced to a JS type.
  private parsePredicate(): Predicate {
    return this.parsePredOr()
  }

  private parsePredOr(): Predicate {
    const first = this.parsePredAnd()
    if (!this.atWord('or')) return first
    const items = [first]
    while (this.atWord('or')) {
      this.next()
      items.push(this.parsePredAnd())
    }
    return { kind: 'any', items }
  }

  private parsePredAnd(): Predicate {
    const first = this.parsePredUnary()
    if (!this.atWord('and')) return first
    const items = [first]
    while (this.atWord('and')) {
      this.next()
      items.push(this.parsePredUnary())
    }
    return { kind: 'all', items }
  }

  private parsePredUnary(): Predicate {
    if (this.atWord('not')) {
      this.next()
      // `not ( … )` negates a group; `not <leaf>` is a single `unset` comparison (the
      // form the emitter prints for a falsy leaf) - told apart by the parenthesis.
      if (this.at('lparen')) {
        this.next()
        const item = this.parsePredOr()
        this.expect('rparen', 'pred-not-rparen')
        return { kind: 'not', item }
      }
      return { kind: 'cmp', ref: this.parsePredRef(), op: 'unset' }
    }
    return this.parsePredPrimary()
  }

  private parsePredPrimary(): Predicate {
    if (this.at('lparen')) {
      this.next()
      const inner = this.parsePredOr()
      this.expect('rparen', 'pred-rparen')
      return inner
    }
    return this.parsePredLeaf()
  }

  // A comparison leaf: a source, then an optional operator + value. No operator ⇒ `set`.
  private parsePredLeaf(): Predicate {
    const ref = this.parsePredRef()
    const op = this.predOp()
    if (!op) return { kind: 'cmp', ref, op: 'set' }
    return { kind: 'cmp', ref, op, value: this.parsePredValue() }
  }

  // The source of a leaf: `state <s>` / `context <g>` / `ancestor <id> <s>` / bare prop path.
  private parsePredRef(): PredicateRef {
    if (this.atWord('state')) {
      this.next()
      return { kind: 'state', state: this.expectStateWord('pred-state') }
    }
    if (this.atWord('context')) {
      this.next()
      return { kind: 'context', group: this.expectWord('pred-context') }
    }
    if (this.atWord('ancestor')) {
      this.next()
      const nodeId = this.expectWord('pred-ancestor-id')
      const state = this.expectStateWord('pred-ancestor-state')
      return { kind: 'ancestor', nodeId, state }
    }
    return { kind: 'prop', path: this.expectWord('pred-prop') }
  }

  // A comparison operator token → CompareOp, or null when the next token isn't one.
  private predOp(): Exclude<CompareOp, 'set' | 'unset'> | null {
    switch (this.peek().type) {
      case 'equals':
        this.next()
        return 'eq'
      case 'ne':
        this.next()
        return 'ne'
      case 'lt':
        this.next()
        return 'lt'
      case 'lte':
        this.next()
        return 'lte'
      case 'gt':
        this.next()
        return 'gt'
      case 'gte':
        this.next()
        return 'gte'
      default:
        if (this.atWord('contains')) {
          this.next()
          return 'contains'
        }
        return null
    }
  }

  // A leaf value: a quoted string, or a bare word coerced to number / boolean / string
  // (mirrors `parseRealizeCond` and the emitter's bare-vs-quoted `predValue`).
  private parsePredValue(): PropValue {
    const t = this.peek()
    if (t.type === 'string') return this.next().value
    if (t.type === 'word') {
      const w = this.next().value
      return NUMBER_RE.test(w) ? Number(w) : w === 'true' ? true : w === 'false' ? false : w
    }
    this.issue('error', 'pred-value', `expected a comparison value, got ${t.type}`)
    return ''
  }

  private parsePropDefault(): PropValue | undefined {
    const t = this.peek()
    if (t.type === 'string') return this.next().value
    if (t.type === 'word' && t.value === 'alias') {
      // Context-aliased (responsive) default - skip the block, flag it.
      this.next()
      if (this.atWord('by')) this.next()
      this.expectWord('alias-group')
      this.skipBlock()
      this.issue(
        'warning',
        'alias-default',
        'context-aliased prop default skipped (proposal 0001)',
        t,
      )
      return undefined
    }
    if (t.type === 'word') {
      this.next()
      if (NUMBER_RE.test(t.value)) return Number(t.value)
      if (t.value === 'true') return true
      if (t.value === 'false') return false
      // A bare context value (e.g. `= Solid`) - store as a string.
      return t.value
    }
    this.issue('error', 'prop-default', `expected a default value, got ${t.type}`)
    return undefined
  }

  private parsePropDecl(): PropDef | null {
    const nameTok = this.peek()
    const name = this.expectWord('prop-name')
    if (!name) return null
    // A name, then its type, is written ONE way on this surface: with a colon. A token
    // (`token brand : color`) and an object field (`field : string`) already do, so a prop
    // that did not was the surface disagreeing with itself over a single idea. Reported, not
    // thrown: the type after it is still read, so one missing colon costs one diagnostic.
    if (this.at('colon')) this.next()
    else
      this.issue(
        'error',
        'prop-colon',
        'a prop\'s type is introduced by a ":" - write `size : Size`',
      )
    const type = this.parseTypeExpr()
    const prop: PropDef = { id: `prop.${seg(name)}`, name, type }
    if (this.at('equals')) {
      this.next()
      const def = this.parsePropDefault()
      if (def !== undefined) prop.default = def
    }
    // `required`, or `required when <predicate>` (proposal 0052 §4). The surface could not spell
    // `required` at all before this - the flag existed in the IR and was lost on every export.
    if (this.atWord('required')) {
      this.next()
      if (this.atWord('when')) {
        this.next()
        const tok = this.peek()
        prop.requiredWhen = this.parsePredicate()
        this.checkPropOnly(prop.requiredWhen, 'required-when-not-prop', '`required when`', tok)
      } else prop.required = true
    }
    if (this.atWord('bind')) {
      this.next()
      prop.binding = this.expectWord('bind-target')
    }
    // Inline metadata annotations: `@status deprecated @since 1.2.0 @author "…"` (0026).
    const meta: Metadata = {}
    while (this.at('at')) {
      this.next() // '@'
      const key = this.expectWord('annot-key')
      const t = this.peek()
      let value: PropValue = true
      if (t.type === 'string') value = this.next().value
      else if (t.type === 'word') {
        const w = this.next().value
        value = NUMBER_RE.test(w) ? Number(w) : w === 'true' ? true : w === 'false' ? false : w
      }
      if (key) meta[key] = value
    }
    if (Object.keys(meta).length) prop.meta = meta
    // The prose comes last, as a global prop's does. Dropped on export until 0052, like `required`.
    if (this.peek().type === 'string') prop.description = this.next().value
    this.recordSpan({
      id: `${this.currentComponentId ?? ''}#prop.${seg(name)}`,
      kind: 'prop',
      name,
      nameRange: this.rangeOf(nameTok, nameTok),
      fullRange: this.rangeOf(nameTok, this.lastTok()),
      parentId: this.currentComponentId ?? undefined,
    })
    return prop
  }

  private parseProps(props: PropDef[], constraints: PropConstraint[]): void {
    this.next() // 'props'
    this.expect('lbrace', 'props-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      // `one-of a, b` / `any-of a, b` / `exclusive a, b` - a constraint over a group of this
      // contract's props (proposal 0052 §4). A keyword only when a NAME follows, the rule `global`
      // uses: `exclusive : boolean` is still a prop called `exclusive`.
      const kw = this.peek().value
      if (
        this.peek().type === 'word' &&
        (kw === 'one-of' || kw === 'any-of' || kw === 'exclusive') &&
        this.toks[this.pos + 1]?.type === 'word'
      ) {
        const kwTok = this.next()
        const members = this.parseNameList('constraint-member')
        if (members.length < 2)
          this.issue('error', 'constraint-too-few', `\`${kw}\` needs two or more props`, kwTok)
        constraints.push({ kind: kw as PropConstraint['kind'], props: members })
        if (this.at('semi') || this.at('newline')) this.pos++
        this.ensureProgress(mark)
        continue
      }
      // `global variant, size` - one or more references to system-wide props (0051 §5). The
      // type and default are filled in from the registry once the whole document is read.
      // Only when a NAME follows: `global : boolean` is an ordinary prop that happens to be
      // called `global`, and it was legal long before the keyword existed.
      if (this.atWord('global') && this.toks[this.pos + 1]?.type === 'word') {
        this.next()
        for (;;) {
          const nameTok = this.peek()
          const name = this.expectWord('global-prop-ref')
          if (!name) break
          // The type is a placeholder until `resolveGlobalProps` fills it in from the
          // declaration; a reference that resolves to nothing is REMOVED there, so it never
          // reaches the AST as a string-typed prop.
          props.push({ id: `prop.${seg(name)}`, name, type: { kind: 'string' }, global: true })
          // Scoped to the component like a declared prop's span, or two components taking the
          // same global would share one outline entry.
          this.recordSpan({
            id: `${this.currentComponentId ?? ''}#prop.${seg(name)}`,
            kind: 'prop',
            name,
            nameRange: this.rangeOf(nameTok, nameTok),
            fullRange: this.rangeOf(nameTok, nameTok),
            parentId: this.currentComponentId ?? undefined,
          })
          if (this.at('comma')) {
            this.next()
            continue
          }
          break
        }
        if (this.at('semi') || this.at('newline')) this.pos++
        this.ensureProgress(mark)
        continue
      }
      const p = this.parsePropDecl()
      if (p) props.push(p)
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'props-rbrace')
    // Checked once the block is read, because a constraint may name a prop declared below it.
    // A warning, and the constraint is kept: lossless first, and an unknown member matches nothing.
    const declared = new Set(props.map((p) => p.name))
    for (const c of constraints)
      for (const m of c.props)
        if (!declared.has(m))
          this.issue(
            'warning',
            'constraint-unknown-prop',
            `\`${c.kind}\` names "${m}", which this component does not declare`,
          )
  }

  // `a, b, c` - one or more names separated by commas.
  private parseNameList(code: string): string[] {
    const names: string[] = []
    for (;;) {
      const name = this.expectWord(code)
      if (!name) break
      names.push(name)
      if (!this.at('comma')) break
      this.next()
    }
    return names
  }

  private parseEvents(events: EventDef[]): void {
    this.next() // 'events'
    this.expect('lbrace', 'events-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const nameTok = this.peek()
      const name = this.expectWord('event-name')
      if (name) {
        const e: EventDef = { name }
        if (this.atWord('from')) {
          this.next()
          e.from = this.expectWord('event-from')
        }
        events.push(e)
        this.recordSpan({
          id: `${this.currentComponentId ?? ''}#event.${seg(name)}`,
          kind: 'event',
          name,
          nameRange: this.rangeOf(nameTok, nameTok),
          fullRange: this.rangeOf(nameTok, this.lastTok()),
          parentId: this.currentComponentId ?? undefined,
        })
      }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'events-rbrace')
  }

  // `uses ATOM [ ( params ) ] as ALIAS`
  private parseUses(): UsesClause | null {
    this.next() // 'uses'
    const atom = this.expectWord('uses-atom')
    if (!atom) return null
    // Atom params: `uses presentation(surface: popover) as P`. They were consumed and
    // thrown away, so `presentation(surface: popover)` reprinted as bare `presentation` -
    // the atom kept its alias and lost its configuration (proposal 0041).
    const params: Record<string, string> = {}
    if (this.at('lparen')) {
      this.next()
      while (!this.at('rparen') && !this.at('eof') && !this.at('newline')) {
        const mark = this.pos
        if (this.at('comma')) {
          this.pos++
          continue
        }
        const key = this.expectWord('uses-param-key')
        if (this.at('colon')) this.next()
        // A param value can be a list (`when: [outside,escape]`) or a word; either way it
        // is captured as the TEXT the author wrote, which is what the IR stores.
        const first = this.peek()
        let depth = 0
        while (!this.at('eof') && !this.at('newline')) {
          if (this.at('lbracket')) depth++
          else if (this.at('rbracket')) depth--
          else if (depth === 0 && (this.at('comma') || this.at('rparen'))) break
          this.next()
        }
        const value = this.textBetween(first, this.peek())
        if (key && value) params[key] = value
        this.ensureProgress(mark)
      }
      if (this.at('rparen')) this.next()
    }
    if (this.atWord('as')) this.next()
    else this.issue('warning', 'uses-as', "expected 'as' in uses")
    const as = this.expectWord('uses-alias')
    return { atom, as, ...(Object.keys(params).length ? { params } : {}) }
  }

  // The `machineref` target of a wire, with an optional `(arg)`. The arg is captured as
  // the whole text inside the parens: taking only its first word turned `B.to(S.sel ?? first)`
  // into `B.to(S.sel)`, quietly deleting the fallback half of the coordination rule.
  private parseWireEnd(code: string): { end: string; arg?: string } {
    const end = this.expectWord(code)
    let arg: string | undefined
    if (this.at('lparen')) {
      this.next()
      const first = this.peek()
      while (!this.at('rparen') && !this.at('eof') && !this.at('newline')) this.next()
      const text = this.textBetween(first, this.peek())
      if (this.at('rparen')) this.next()
      if (text) arg = text
    }
    return { end, arg }
  }

  // `wire FROM [when COND] -> TO[(arg)]`
  private parseWire(): CoordEntry | null {
    this.next() // 'wire'
    const from = this.expectWord('wire-from')
    if (!from) return null
    let when: string | undefined
    if (this.atWord('when')) {
      this.next()
      when = this.parseConditionText()
    }
    this.expect('arrow', 'wire-arrow')
    const { end: to, arg } = this.parseWireEnd('wire-to')
    const wire: Extract<CoordEntry, { kind: 'wire' }> = { kind: 'wire', from, to }
    if (arg) wire.arg = arg
    if (when) wire.when = when
    return wire
  }

  // `gate MACHINE active when COND`
  private parseGate(): CoordEntry | null {
    this.next() // 'gate'
    const machine = this.expectWord('gate-machine')
    if (!machine) return null
    if (this.atWord('active')) this.next()
    if (this.atWord('when')) this.next()
    else this.issue('warning', 'gate-when', "expected 'when' in gate")
    const activeWhen = this.parseConditionText()
    return { kind: 'gate', machine, activeWhen }
  }

  // ── layout / facet bodies ──
  private parseAxisIntent(): AxisIntent {
    const w = this.expectWord('axis')
    if (w === 'fit' || w === 'fill') return w
    if (w === 'weight') {
      if (this.at('lparen')) {
        this.next()
        const n = Number(this.expectWord('weight-n'))
        if (this.at('rparen')) this.next()
        return { weight: n }
      }
      return { weight: 1 }
    }
    if (w === 'fixed') {
      if (this.at('lparen')) {
        this.next()
        const p = this.expectWord('fixed-token')
        if (this.at('rparen')) this.next()
        return { fixed: tokId(p) }
      }
      // Bare `fixed` with no explicit dimension has no canonical AST form.
      this.issue('warning', 'axis-fixed', "bare 'fixed' axis has no dimension; treated as fit")
      return 'fit'
    }
    if (w === 'ratio') {
      // `ratio(w:h)` - the axis derived from the other one by the ratio (PRELUDE §4). The key
      // form `ratio w h` is read in `parseLayoutBody` as an alias.
      if (this.at('lparen')) {
        this.next()
        const wv = Number(this.expectWord('ratio-w'))
        if (this.at('colon')) this.next()
        else this.issue('warning', 'ratio-colon', "expected ':' between the two ratio tracks")
        const hv = Number(this.expectWord('ratio-h'))
        if (this.at('rparen')) this.next()
        if (!(wv > 0) || !(hv > 0)) {
          this.issue('warning', 'ratio-tracks', 'a ratio needs two positive tracks; treated as fit')
          return 'fit'
        }
        return { ratio: { w: wv, h: hv } }
      }
      this.issue('warning', 'axis-ratio', "'ratio' as an axis takes (w:h); treated as fit")
      return 'fit'
    }
    this.issue(
      'warning',
      'axis-unknown',
      `unknown size intent "${w}" (one of ${AXIS_INTENTS.join(', ')}); treated as fit`,
    )
    return 'fit'
  }

  // An axis: its intent, then the optional `min(…)` / `max(…)` clamps that follow it (0056 §3.2).
  // The clamps attach to the intent just read, which is what "set independently per axis" means.
  private parseAxisSize(): AxisSizeValue {
    const intent = this.parseAxisIntent()
    let min: Id | undefined
    let max: Id | undefined
    while (this.at('word') && (AXIS_CLAMPS as readonly string[]).includes(this.peek().value)) {
      const clamp = this.next().value
      if (!this.at('lparen')) {
        this.issue('warning', 'axis-clamp', `'${clamp}' takes a size in parentheses; skipped`)
        continue
      }
      this.next()
      const v = tokId(this.expectWord('clamp-size'))
      if (this.at('rparen')) this.next()
      if (clamp === 'min') min = v
      else max = v
    }
    return min || max ? { intent, ...(min ? { min } : {}), ...(max ? { max } : {}) } : intent
  }

  // `position pinned <edge>+` / `position bleed <edge>+`. Logical edges only; the physical words
  // the reader used to take are read as the logical edge each names and reported, never written.
  private parseEdges(kind: string): LogicalEdge[] {
    const edges: LogicalEdge[] = []
    while (this.at('word')) {
      const w = this.next().value
      if ((LOGICAL_EDGES as readonly string[]).includes(w)) {
        edges.push(w as LogicalEdge)
        continue
      }
      const alias = PHYSICAL_EDGE_ALIASES[w]
      if (alias) {
        this.issue(
          'warning',
          'edge-physical',
          `'${w}' is a physical edge; read as '${alias}' - write the logical edge`,
        )
        edges.push(alias)
        continue
      }
      this.issue('warning', 'edge-unknown', `unknown edge "${w}" after ${kind}; skipped`)
    }
    if (edges.length === 0) edges.push('all')
    return edges
  }

  private parseInsetArgs(): InsetValue {
    const args: string[] = []
    while (this.at('word') && args.length < 2) args.push(this.next().value)
    if (args.length >= 2) return { block: tokId(args[0]), inline: tokId(args[1]) }
    if (args.length === 1) return { all: tokId(args[0]) }
    return { all: '' }
  }

  private parseLayoutBody(): LayoutSpec {
    this.expect('lbrace', 'layout-lbrace')
    const spec: LayoutSpec = {}
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const key = this.expectWord('layout-key')
      switch (key) {
        case 'stack': {
          const d = this.expectWord('stack')
          if ((LAYOUT_DIRECTIONS as readonly string[]).includes(d)) spec.stack = d as StackAxis
          else this.issue('warning', 'layout-stack', `unknown stack direction "${d}" skipped`)
          break
        }
        case 'flow':
          // The alias of `wrap wrap` (0003 §2b). Read, never written.
          spec.flow = true
          spec.wrap = 'wrap'
          break
        case 'gap':
          spec.gap = tokId(this.expectWord('gap'))
          break
        case 'align': {
          const a = this.expectWord('align')
          if ((LAYOUT_ALIGNS as readonly string[]).includes(a)) spec.align = a as Align
          else this.issue('warning', 'layout-align', `unknown align "${a}" skipped`)
          break
        }
        case 'distribute': {
          const d = this.expectWord('distribute')
          if ((LAYOUT_DISTRIBUTES as readonly string[]).includes(d))
            spec.distribute = d as Distribute
          else this.issue('warning', 'layout-distribute', `unknown distribute "${d}" skipped`)
          break
        }
        case 'wrap': {
          const w = this.expectWord('wrap')
          if ((LAYOUT_WRAPS as readonly string[]).includes(w)) {
            spec.wrap = w as LayoutWrap
            if (w !== 'nowrap') spec.flow = true
          } else this.issue('warning', 'layout-wrap', `unknown wrap "${w}" skipped`)
          break
        }
        case 'position': {
          const p = this.expectWord('position')
          if (p === 'overlay' || p === 'flow') spec.position = p
          else if (p === 'pinned') spec.position = { pinned: this.parseEdges(p) }
          else if (p === 'bleed') spec.position = { bleed: this.parseEdges(p) }
          else if (PHYSICAL_EDGE_ALIASES[p]) {
            // `position top` - the pre-0056 spelling, a physical pin with no `pinned` word.
            const alias = PHYSICAL_EDGE_ALIASES[p]!
            this.issue(
              'warning',
              'position-physical',
              `'position ${p}' is read as 'position pinned ${alias}' - write the logical form`,
            )
            spec.position = {
              pinned: [alias, ...this.parseEdges('pinned').filter((e) => e !== 'all')],
            }
          } else if (p === 'all') {
            this.issue(
              'warning',
              'position-physical',
              "'position all' is read as 'position pinned all'",
            )
            spec.position = { pinned: ['all'] }
          } else
            this.issue(
              'warning',
              'position-unknown',
              `unknown position "${p}" (one of ${POSITION_KINDS.join(', ')}); skipped`,
            )
          break
        }
        case 'grid': {
          // Reserved (0056 §3.3): the spec names a grid container and no target draws one. Read
          // into the AST so the shape is kept, and reported by name rather than as an unknown key.
          const nums: number[] = []
          while (this.at('word')) {
            const w = this.next().value
            if (w === 'cols' || w === 'rows') continue
            const n = Number(w)
            if (Number.isFinite(n)) nums.push(n)
          }
          spec.grid = { cols: nums[0] ?? 1, ...(nums[1] != null ? { rows: nums[1] } : {}) }
          this.issue('warning', 'layout-grid', 'grid is reserved and has no target yet (0056 §3.3)')
          break
        }
        case 'size': {
          // The second axis is OPTIONAL. `facetstmt` has always allowed a variable number of
          // values, but this rule demanded two - so a node sized on one axis only had no
          // spelling, and the printer had to invent `fit` for the other one. That is not a
          // notational nicety: an absent axis emits no CSS length at all, while `fit` emits
          // `fit-content`, so the invented word CHANGED the layout of every archetype default
          // that sizes width and leaves height to its content (the menu surface is the case
          // that found this). A height-only node still has no spelling - the axes are
          // positional - which is honest residue rather than a silent rewrite.
          // `size height fit` names the axis, which is the only way to state a height without
          // also stating a width - the positional pair cannot express it, and a printer forced
          // to fill the gap would add a width the author never wrote.
          if (this.atWord('width') || this.atWord('height')) {
            const size: { width?: AxisSizeValue; height?: AxisSizeValue } = {}
            while (this.atWord('width') || this.atWord('height')) {
              const axis = this.expectWord('size-axis') as 'width' | 'height'
              size[axis] = this.parseAxisSize()
            }
            spec.size = size
            break
          }
          const width = this.parseAxisSize()
          spec.size = this.atValueEnd() ? { width } : { width, height: this.parseAxisSize() }
          break
        }
        case 'ratio': {
          // The pre-0056 KEY form, `ratio w h`. It could not say which axis follows the other, so
          // it is read as the common case - the height follows the width - and reported with the
          // axis form, which is the one the printer writes.
          const wv = Number(this.expectWord('ratio-w'))
          const hv = Number(this.expectWord('ratio-h'))
          if (wv > 0 && hv > 0) {
            spec.size = { ...(spec.size ?? {}), height: { ratio: { w: wv, h: hv } } }
            this.issue(
              'warning',
              'layout-ratio-key',
              `'ratio ${wv} ${hv}' is read as 'size height ratio(${wv}:${hv})' - write the axis form`,
            )
          } else this.issue('warning', 'ratio-tracks', 'a ratio needs two positive tracks; skipped')
          break
        }
        case 'inset':
          spec.inset = this.parseInsetArgs()
          break
        default:
          this.issue('warning', 'layout-key', `unknown layout key "${key}" skipped`)
          this.skipToTerminator()
      }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'layout-rbrace')
    return spec
  }

  // A single facet statement `facetname value+` → [FacetName, FacetValue] | null.
  private parseFacetStmt(): { name: FacetName; value: FacetValue } | null {
    let raw = this.expectWord('facet-name')
    // `inset.left` and friends: read as the logical edge they name left to right, with a
    // warning, never written - the treatment 0056 gave `pinned top` (proposal 0057 §4.2).
    const physical = /^inset\.(top|right|bottom|left)$/.exec(raw)
    if (physical) {
      const logical = `inset.${PHYSICAL_EDGE_ALIASES[physical[1]!]}`
      this.issue(
        'warning',
        'inset-physical',
        `'${raw}' is read as '${logical}' - write the logical edge`,
      )
      raw = logical
    }
    const mapped = FACET_MAP[raw]
    if (mapped === undefined) {
      this.issue('warning', 'facet-unknown', `unknown facet "${raw}" skipped`)
      this.skipToTerminator()
      return null
    }
    if (mapped === null) {
      this.issue(
        'warning',
        'facet-nohome',
        `facet "${raw}" has no AST FacetMap home (§3) - skipped`,
      )
      this.skipToTerminator()
      return null
    }
    // inset takes 1–2 args (block, inline).
    if (mapped === 'inset') {
      return { name: 'inset', value: { inset: this.parseInsetArgs() } }
    }
    // One axis or one edge takes one value, read exactly as one `inset` argument is, so
    // `inset.inline 8px` and `inset 8px` mean the same thing on the edges they reach.
    if (mapped.startsWith('inset.')) {
      const w = this.at('word') ? this.next().value : undefined
      if (w === undefined) {
        this.issue('error', 'facet-value', `"${raw}" needs a value`)
        this.skipToTerminator()
        return null
      }
      if (!this.at('semi') && !this.at('newline') && !this.at('rbrace')) this.skipToTerminator()
      return { name: mapped, value: { token: tokId(w) } }
    }
    // border (all sides) and per-side borders are multi-valued: any subset of a color
    // token (dotted ref), a width token (bare width id like `thick`), and a style
    // keyword (solid|dashed|dotted), in any order.
    if (mapped === 'border' || mapped.startsWith('border.')) {
      const border: BorderFacetValue = {}
      while (this.at('word')) {
        const w = this.next().value
        if (w === 'solid' || w === 'dashed' || w === 'dotted') {
          border.style = w
          continue
        }
        // Which slot a reference fills is decided by the TYPE of the token it names. The rule
        // used to be "a dotted path is a colour, anything else is a width" - but a top-level
        // token has no dot, so `border Accent Hairline` put BOTH in `width`, the second
        // overwriting the first: the colour was dropped, and on re-emit it resolved against the
        // wrong scale and printed as `accent.subtle` (proposal 0041 §1.1d).
        //
        // When the token is not declared in this file (a keyword like `transparent`, or a
        // dangling reference) its type is unknowable, so POSITION decides: the colour comes
        // first in this facet, so the first unresolvable word fills the colour and the next
        // one the width. Guessing from the dot alone put both in `width` again.
        const id = tokId(w)
        const type = this.tokenTypes.get(id)
        const isColor = type ? COLOR_AST_TYPES.has(type) : !border.color
        if (isColor) border.color = id
        else border.width = id
      }
      return { name: mapped as FacetName, value: { border } }
    }
    // A facet POINTS AT a token; the token is what carries the context alias. So
    // `fill alias by Size { … }` has no home in the format (a FacetValue is a token ref,
    // a literal or a raw word) - the alias belongs on the token the facet names. Say so,
    // rather than reading `alias` as a raw enum word and dropping the block in silence.
    if (this.at('word') && this.peek().value === 'alias') {
      this.issue(
        'error',
        'facet-alias',
        `facet "${raw}" cannot be context-aliased: point it at a token and declare the alias on that token (token … = alias by …)`,
      )
      this.skipToTerminator()
      return null
    }
    // First value token drives the FacetValue kind.
    const t = this.peek()
    let value: FacetValue
    if (t.type === 'string') {
      value = { raw: this.next().value }
    } else if (t.type === 'word') {
      const v = this.next().value
      if (NUMBER_RE.test(v)) value = { literal: Number(v) }
      else if (isRawValue(v)) value = { raw: v }
      // Token refs are dotted (accent.9, space.2); a bare undotted word is an enum
      // keyword (e.g. textWrap `wrap`), not a token - don't lower it to a token ref.
      else if (!v.includes('.')) value = { raw: v }
      else value = { token: tokId(v) }
    } else {
      this.issue('error', 'facet-value', `expected a facet value, got ${t.type}`)
      this.skipToTerminator()
      return null
    }
    // Consume any trailing args (e.g. `border color width`) - kept minimal; the
    // extra tokens are dropped to the terminator.
    if (!this.at('semi') && !this.at('newline') && !this.at('rbrace')) this.skipToTerminator()
    return { name: mapped, value }
  }

  // `state NAME [when COND] { … }` → a PartVariant with one interaction state.
  private parseStateBlock(): PartVariant {
    this.next() // 'state'
    const name = this.expectStateWord('state-name')
    const variant: PartVariant = { states: [name as StateName] }
    if (this.atWord('when')) {
      this.next()
      variant.when = this.parseRealizeCond()
    }
    this.applyStyleBody(variant)
    return variant
  }

  // `when <predicate> { … }` → a state-less predicate-conditioned PartVariant. The rich
  // predicate grammar (proposal 0032) supersedes the flat single-condition form: it carries
  // OR / NOT / operators / state·context·ancestor leaves. A plain `when prop = value` parses
  // to the degenerate single-`eq` predicate, so the legacy one-condition case still works.
  private parseWhenBlock(): PartVariant {
    this.next() // 'when'
    const variant: PartVariant = { whenPredicate: this.parsePredicate() }
    this.applyStyleBody(variant)
    return variant
  }

  // Parse a `{ facet… / layout… }` style body into a variant's facets/layout.
  private applyStyleBody(target: { facets?: FacetMap; layout?: LayoutSpec }): void {
    this.expect('lbrace', 'style-lbrace')
    const facets: FacetMap = {}
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (this.atWord('layout')) {
        this.next()
        target.layout = this.parseLayoutBody()
      } else {
        const f = this.parseFacetStmt()
        if (f) facets[f.name] = f.value
      }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'style-rbrace')
    if (Object.keys(facets).length) target.facets = facets
  }

  // `slot [single|optional|many] [of content | of TYPE]` - a content slot on a part.
  // Bare `slot` defaults to a single content slot.
  private parseSlot(): PartSlot {
    let arity: PartSlot['arity'] = 'single'
    if (this.atWord('single') || this.atWord('optional') || this.atWord('many')) {
      arity = this.next().value as PartSlot['arity']
    }
    let accepts: PartSlot['accepts'] = { kind: 'content' }
    if (this.atWord('of')) {
      this.next()
      const w = this.expectWord('slot-accepts')
      if (w && w !== 'content') accepts = { kind: 'type', ref: w }
    }
    const slot: PartSlot = { arity, accepts }
    // The rest of the slot descriptor (proposal 0041): each of these changes what the
    // generated component looks like from outside, so none of them may be skipped.
    while (!this.at('semi') && !this.at('newline') && !this.at('rbrace') && !this.at('eof')) {
      if (this.atWord('keyed-by')) {
        this.next()
        slot.keyedBy = this.expectWord('slot-keyed-by')
      } else if (this.atWord('default')) {
        this.next()
        slot.default = true
      } else if (this.atWord('as')) {
        this.next()
        slot.exposeAs = this.expectWord('slot-expose-as')
      } else if (this.atWord('role')) {
        this.next()
        slot.role = this.expectWord('slot-role')
      } else if (this.atWord('sample')) {
        this.next()
        const sample = this.parseSlotSample()
        if (sample) slot.sample = sample
      } else if (this.at('string')) {
        slot.description = this.next().value
      } else {
        // Unknown modifier: skip the rest of the line rather than derail the part.
        this.skipToTerminator()
        break
      }
    }
    return slot
  }

  // A slot's design-time sample: `"Item"` | `example Name` | `["a", "b"]`.
  private parseSlotSample(): PartSlotSample | null {
    if (this.at('string')) return { kind: 'text', text: this.next().value }
    if (this.atWord('example')) {
      this.next()
      // An example is named by a quoted string (its name is free text, like a docs page title);
      // a bare word is accepted for a name that happens to be an identifier.
      const name = this.at('string') ? this.next().value : this.expectWord('slot-sample-example')
      return name ? { kind: 'example', example: name } : null
    }
    if (this.at('lbracket')) {
      this.next()
      const items: PartSlotSample[] = []
      while (!this.at('rbracket') && !this.at('eof')) {
        const mark = this.pos
        if (this.at('comma') || this.at('newline')) {
          this.pos++
          continue
        }
        const item = this.parseSlotSample()
        if (item) items.push(item)
        this.ensureProgress(mark)
      }
      if (this.at('rbracket')) this.next()
      return { kind: 'list', items }
    }
    this.issue('warning', 'slot-sample', 'unrecognized slot sample - skipped')
    return null
  }

  // ── The part statements that say what a part IS (proposal 0041) ──

  // A fixed-or-bound value: `"Submit"` | `bind label` | `42` | `true`.
  private parsePartValue(): PartValue {
    if (this.atWord('bind')) {
      this.next()
      return { kind: 'bind', prop: this.expectWord('bind-prop') }
    }
    const t = this.peek()
    if (t.type === 'string') return { kind: 'value', value: this.next().value }
    if (t.type === 'word') {
      const w = this.next().value
      return {
        kind: 'value',
        value: NUMBER_RE.test(w) ? Number(w) : w === 'true' ? true : w === 'false' ? false : w,
      }
    }
    this.issue('error', 'part-value', `expected a value, got ${t.type}`)
    return { kind: 'value', value: '' }
  }

  // `content "Submit"` | `content bind label` | a block with a default + predicate legs.
  private parsePartContent(): PartContent {
    if (this.at('lbrace')) {
      this.next()
      let def: PartValue = { kind: 'value', value: '' }
      const rules: PartContentRule[] = []
      while (!this.at('rbrace') && !this.at('eof')) {
        const mark = this.pos
        if (this.at('newline') || this.at('semi')) {
          this.pos++
          continue
        }
        if (this.atWord('default')) {
          this.next()
          def = this.parsePartValue()
        } else if (this.atWord('when')) {
          this.next()
          const when = this.parsePredicate()
          this.expect('arrow', 'content-arrow')
          rules.push({ when, value: this.parsePartValue() })
        } else if (this.atWord('otherwise')) {
          this.next()
          rules.push({ value: this.parsePartValue() })
        } else {
          this.issue('warning', 'content-stmt', 'unknown content statement - skipped')
          this.skipToTerminator()
        }
        if (this.at('semi') || this.at('newline')) this.pos++
        this.ensureProgress(mark)
      }
      this.expect('rbrace', 'content-rbrace')
      return { kind: 'dynamic', default: def, rules }
    }
    // A bare string is FIXED content; anything else (a `bind`, a number) is the
    // no-rules dynamic form, which is how the editor stores a prop-bound label.
    if (this.at('string')) return { kind: 'static', text: this.next().value }
    return { kind: 'dynamic', default: this.parsePartValue(), rules: [] }
  }

  // `a11y { name …; labelled-by <part path>; described-by <part path> }`
  private parsePartA11y(): PartA11y {
    const out: PartA11y = {}
    this.expect('lbrace', 'a11y-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (this.atWord('name')) {
        this.next()
        out.name = this.parsePartValue()
      } else if (this.atWord('labelled-by') || this.atWord('labeled-by')) {
        this.next()
        out.labelledBy = this.expectWord('a11y-labelled-by')
      } else if (this.atWord('described-by')) {
        this.next()
        out.describedBy = this.expectWord('a11y-described-by')
      } else {
        this.issue('warning', 'a11y-stmt', 'unknown a11y statement - skipped')
        this.skipToTerminator()
      }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'a11y-rbrace')
    return out
  }

  // `emits { <event> on <interaction> [payload …] [signal …] [locked] }`
  private parsePartEmits(): PartEmit[] {
    const out: PartEmit[] = []
    this.expect('lbrace', 'emits-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const event = this.expectWord('emit-event')
      if (!event) break
      let on = 'activate'
      if (this.atWord('on')) {
        this.next()
        on = this.expectWord('emit-on') || on
      }
      const emit: PartEmit = { event, on }
      while (this.at('word')) {
        if (this.atWord('payload')) {
          this.next()
          emit.payload = this.parsePartValue()
        } else if (this.atWord('signal')) {
          this.next()
          emit.signal = this.expectWord('emit-signal')
        } else if (this.atWord('locked')) {
          this.next()
          emit.locked = true
        } else break
      }
      out.push(emit)
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'emits-rbrace')
    return out
  }

  // `repeat <prop> as <alias>` | `repeat static [ … ] as <alias>`
  private parsePartRepeat(): PartRepeat | null {
    let source: PartRepeatSource
    if (this.atWord('static')) {
      this.next()
      const items: PropValue[] = []
      this.expect('lbracket', 'repeat-lbracket')
      while (!this.at('rbracket') && !this.at('eof')) {
        const mark = this.pos
        if (this.at('comma') || this.at('newline')) {
          this.pos++
          continue
        }
        const t = this.peek()
        if (t.type === 'string') items.push(this.next().value)
        else if (t.type === 'word') {
          const w = this.next().value
          items.push(
            NUMBER_RE.test(w) ? Number(w) : w === 'true' ? true : w === 'false' ? false : w,
          )
        } else this.next()
        this.ensureProgress(mark)
      }
      if (this.at('rbracket')) this.next()
      source = { kind: 'static', items }
    } else {
      const prop = this.expectWord('repeat-prop')
      if (!prop) return null
      source = { kind: 'prop', prop }
    }
    let itemAlias = 'item'
    if (this.atWord('as')) {
      this.next()
      itemAlias = this.expectWord('repeat-alias') || itemAlias
    }
    return { source, itemAlias }
  }

  // `motion { transition [facet…] duration <tok> [easing <tok>] [delay <tok>] }` (0017)
  private parsePartMotion(): PartMotionTransition[] {
    const out: PartMotionTransition[] = []
    this.expect('lbrace', 'motion-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (!this.atWord('transition')) {
        this.issue('warning', 'motion-stmt', 'unknown motion statement - skipped')
        this.skipToTerminator()
        if (this.at('semi') || this.at('newline')) this.pos++
        this.ensureProgress(mark)
        continue
      }
      this.next() // 'transition'
      // The leading words are the facets this transition animates; the keyworded tail is
      // its timing. `duration` is required - a transition without one is not a transition.
      const facets: string[] = []
      while (
        this.at('word') &&
        !this.atWord('duration') &&
        !this.atWord('easing') &&
        !this.atWord('delay')
      ) {
        facets.push(this.next().value)
      }
      const t: PartMotionTransition = { duration: '' }
      while (this.at('word')) {
        if (this.atWord('duration')) {
          this.next()
          t.duration = this.expectWord('motion-duration')
        } else if (this.atWord('easing')) {
          this.next()
          t.easing = this.expectWord('motion-easing')
        } else if (this.atWord('delay')) {
          this.next()
          t.delay = this.expectWord('motion-delay')
        } else break
      }
      if (facets.length) t.facets = facets
      if (!t.duration)
        this.issue('warning', 'motion-duration', 'transition has no duration - skipped')
      else out.push(t)
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'motion-rbrace')
    return out
  }

  // `instance Badge { label = "Beta"; tone = bind kind }` (proposal 0012)
  private parsePartInstance(): PartInstance | null {
    const component = this.expectWord('instance-component')
    if (!component) return null
    const inst: PartInstance = { component, props: [] }
    if (!this.at('lbrace')) return inst
    this.next()
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const name = this.expectWord('instance-prop')
      if (!name) break
      this.expect('equals', 'instance-equals')
      inst.props.push({ name, value: this.parsePartValue() })
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'instance-rbrace')
    return inst
  }

  // A flat `{ key value; key [a, b] }` block. Shared by the free behaviours and by every
  // per-archetype config surface, which are all records of scalars.
  private parseFlatBlock(code: string): Metadata {
    const out: Metadata = {}
    this.expect('lbrace', `${code}-lbrace`)
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const key = this.expectWord(`${code}-key`)
      if (!key) break
      // A key with no value is a flag (`locked`), which is how a boolean reads best.
      if (this.at('semi') || this.at('newline') || this.at('rbrace')) out[key] = true
      else {
        const values: PropValue[] = [this.parseMetaValue()]
        // A behaviour field can name SEVERAL parts (`exclude-node-ids a b`), so a run of
        // bare words after the first stays one entry rather than silently dropping the tail.
        while (this.at('word')) values.push(this.parseMetaValue())
        out[key] = values.length === 1 ? (values[0] as PropValue) : values
      }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', `${code}-rbrace`)
    return out
  }

  // `foreign <target> ["label"] "<code>"` (proposal 0041 §4). QUARANTINED: the target tag
  // is what lets a reader that does not implement it skip the block instead of guessing.
  private parsePartForeign(): PartForeign | null {
    const target = this.at('word') ? this.next().value : undefined
    const strings: string[] = []
    while (this.at('string')) strings.push(this.next().value)
    if (strings.length === 0) {
      this.issue('error', 'foreign-code', 'foreign content has no code string')
      return null
    }
    const code = strings[strings.length - 1] as string
    const out: PartForeign = { code }
    if (strings.length > 1) out.label = strings[0]
    if (target) out.target = target
    if (target && target !== 'web-react') {
      this.issue(
        'warning',
        'foreign-target',
        `foreign content targets "${target}", which this reader does not implement - kept verbatim`,
      )
    }
    return out
  }

  // `source bind <prop> [sample asset <id> | sample url "…"]` | `source static <asset>` (0028)
  private parsePartMediaSource(): PartMediaSource | undefined {
    if (this.atWord('static')) {
      this.next()
      const asset = this.expectWord('media-asset')
      return asset ? { kind: 'static', asset } : undefined
    }
    if (this.atWord('bind')) this.next()
    const prop = this.expectWord('media-prop')
    if (!prop) return undefined
    const out: PartMediaSource = { kind: 'bind', prop }
    if (this.atWord('sample')) {
      this.next()
      if (this.atWord('asset')) {
        this.next()
        const asset = this.expectWord('media-sample-asset')
        if (asset) out.sample = { kind: 'asset', asset }
      } else if (this.atWord('url')) {
        this.next()
        if (this.at('string')) out.sample = { kind: 'url', url: this.next().value }
      }
    }
    return out
  }

  // What a part IS, said where it is named (proposal 0055 §3.2): `part Button: container {`.
  // Lowers to the same `kind` field as the body statement, so nothing below the parser can tell
  // which spelling was written. Returns what the header said, which is what the body's `kind`
  // is checked against (§3.3).
  private parsePartHeader(part: Part): { kind?: string } {
    const said: { kind?: string } = {}
    if (this.at('colon')) {
      this.next()
      if (!this.at('word')) {
        this.issue('error', 'part-header-kind', "expected the part's kind after ':'")
      } else {
        const tok = this.next()
        said.kind = tok.value
        part.kind = said.kind
        this.checkPartKind(tok)
      }
    }
    // Then the `{`. Anything else on the line is skipped to the brace, so one unknown word costs
    // one diagnostic and the body is still read. The skip stops at the end of the line: a header
    // with no brace must not swallow the parts after it.
    while (!this.at('lbrace') && !this.atValueEnd()) {
      const tok = this.next()
      this.issue(
        'error',
        'part-header-word',
        `unexpected ${JSON.stringify(tok.value)} in a part header - expected '{'`,
        tok,
      )
    }
    return said
  }

  // A part's kind is one of the neutral node kinds, never a platform's element. The lowering
  // already infers a kind in place of an unknown one; saying so HERE is what puts it in front of
  // whoever wrote the file - an editor squiggle, a `milda-check` line - instead of in an import
  // report nobody reads. `div` is the word this most often catches, and the reason it is wrong
  // is the language's second rule, so the message names the kinds rather than just refusing.
  private checkPartKind(tok: Token): void {
    if (NODE_KINDS.includes(tok.value)) return
    this.issue(
      'warning',
      'part-kind-unknown',
      `unknown part kind ${JSON.stringify(tok.value)} - a part is one of: ${NODE_KINDS.join(', ')}`,
      tok,
    )
  }

  // `part PATH [: KIND] { pstmt* }` → [path, Part]. The name is a dotted PATH: its
  // prefix is its parent part, which is how the tree is written down (proposal 0041).
  private parsePart(): [string, Part] | null {
    const kw = this.next() // 'part'
    const nameTok = this.peek()
    const name = this.expectWord('part-name')
    if (!name) return null
    const part: Part = {}
    const header = this.parsePartHeader(part)
    this.expect('lbrace', 'part-lbrace')
    const facets: FacetMap = {}
    const variants: PartVariant[] = []
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (this.atWord('layout')) {
        this.next()
        if (this.atWord('when')) {
          // Conditional layout (§4) → a variant carrying only layout.
          this.next()
          const when = this.parseRealizeCond()
          variants.push({ when, layout: this.parseLayoutBody() })
        } else {
          part.layout = this.parseLayoutBody()
        }
      } else if (this.atWord('present')) {
        // `present when <predicate>` - conditional node presence (proposal 0031/0032).
        this.next() // 'present'
        if (this.atWord('when')) this.next()
        else this.issue('warning', 'present-when', "expected 'when' after 'present'")
        part.presence = this.parsePredicate()
      } else if (this.atWord('state')) {
        variants.push(this.parseStateBlock())
      } else if (this.atWord('when')) {
        variants.push(this.parseWhenBlock())
      } else if (this.atWord('slot')) {
        this.next() // 'slot'
        part.slot = this.parseSlot()
      } else if (this.atWord('kind')) {
        // The statement form, valid for good (0055 §3.3). Next to a header kind it is either
        // a repeat or a contradiction, and the header wins the contradiction because the
        // writer prints the header: that is the spelling a saved file most likely meant.
        const tok = this.next()
        const kindTok = this.peek()
        const stated = this.expectWord('part-kind')
        if (stated) this.checkPartKind(kindTok)
        if (header.kind === undefined) part.kind = stated
        else if (stated === header.kind)
          this.issue('warning', 'part-kind-twice', `kind '${stated}' is stated twice`, tok)
        else if (stated)
          this.issue(
            'error',
            'part-kind-conflict',
            `kind '${stated}' contradicts the header's '${header.kind}' - the header wins`,
            tok,
          )
      } else if (this.atWord('origin')) {
        this.next()
        const o = this.expectWord('part-origin')
        if (o === 'root' || o === 'archetype' || o === 'author') part.origin = o
      } else if (this.atWord('locked')) {
        // Read and dropped (0055): which parts may not be removed is what the archetype
        // requires, and the reader works that out. Silently, on purpose - every part of a file
        // written before 0.9 says it, and an import listing hundreds of notes about a word that
        // changes nothing is the noise `inline-literal` taught this reader to avoid.
        this.next()
      } else if (this.atWord('content')) {
        this.next()
        part.content = this.parsePartContent()
      } else if (this.atWord('a11y')) {
        this.next()
        part.a11y = this.parsePartA11y()
      } else if (this.atWord('emits')) {
        this.next()
        part.emits = this.parsePartEmits()
      } else if (this.atWord('bind')) {
        // Two bindings share the keyword because they are the same idea: a prop drives
        // something about this part. `bind value <prop>` / `bind state <state> <prop>`.
        this.next()
        if (this.atWord('value')) {
          this.next()
          part.valueBinding = this.expectWord('bind-value-prop')
        } else if (this.atWord('state')) {
          this.next()
          const state = this.expectStateWord('bind-state')
          const prop = this.expectWord('bind-state-prop')
          if (state && prop) (part.stateBindings ??= []).push({ state, prop })
        } else {
          this.issue('warning', 'bind-stmt', 'expected `bind value` or `bind state` - skipped')
          this.skipToTerminator()
        }
      } else if (this.atWord('value')) {
        this.next()
        part.value = this.parseTypeExpr()
      } else if (this.atWord('repeat')) {
        this.next()
        const r = this.parsePartRepeat()
        if (r) part.repeat = r
      } else if (this.atWord('cell')) {
        this.next()
        const cell: PartCell = {}
        while (this.at('word')) {
          const w = this.next().value
          if (w === 'header') cell.header = true
          else if (w === 'col' || w === 'row') cell.scope = w
        }
        part.cell = cell
      } else if (this.atWord('control')) {
        this.next()
        part.control = this.expectWord('part-control')
      } else if (this.atWord('group')) {
        this.next()
        part.group = this.expectWord('part-group')
      } else if (this.atWord('presentation')) {
        this.next()
        part.presentation = this.expectWord('part-presentation')
      } else if (this.atWord('media')) {
        this.next()
        part.media = this.expectWord('part-media')
      } else if (this.atWord('source')) {
        this.next()
        part.mediaSource = this.parsePartMediaSource()
      } else if (this.atWord('alt')) {
        this.next()
        part.mediaAlt = this.parsePartValue()
      } else if (this.atWord('destination')) {
        this.next()
        part.destination = this.parsePartValue()
      } else if (this.atWord('motion')) {
        this.next()
        const transitions = this.parsePartMotion()
        if (transitions.length) part.motion = transitions
      } else if (this.atWord('instance')) {
        this.next()
        const inst = this.parsePartInstance()
        if (inst) part.instance = inst
      } else if (this.atWord('behavior') || this.atWord('behaviour')) {
        this.next()
        const kind = this.expectWord('behavior-kind')
        if (kind) (part.behaviors ??= []).push({ kind, config: this.parseFlatBlock('behavior') })
      } else if (this.atWord('foreign')) {
        this.next()
        const f = this.parsePartForeign()
        if (f) part.foreign = f
      } else if (this.atWord('action')) {
        // A demo interaction (0021): `action activate toggle open` / `action activate set tone danger`.
        this.next()
        const on = this.expectWord('action-on')
        const opWord = this.expectWord('action-op')
        const variable = this.expectWord('action-variable')
        if (on && variable && (opWord === 'set' || opWord === 'toggle')) {
          const action: PartAction = { on, op: opWord, variable }
          if (opWord === 'set' && !this.at('semi') && !this.at('newline') && !this.at('rbrace')) {
            const v = this.parsePartValue()
            if (v.kind === 'value') action.value = v.value
          }
          ;(part.actions ??= []).push(action)
        } else this.issue('warning', 'action-stmt', 'malformed demo action - skipped')
      } else if (PART_CONFIG_WORDS.includes(this.peek().value)) {
        // Two single-value config surfaces (0034). Stored in the same namespace as the
        // block-shaped ones so the lowering has one place to look.
        const key = this.next().value
        const val = this.expectWord(`part-${key}`)
        if (val) (part.configs ??= {})[key] = { value: val }
      } else if (
        PART_CONFIG_NAMES.has(this.peek().value) &&
        this.toks[this.pos + 1]?.type === 'lbrace'
      ) {
        // A per-archetype config block (`calendar { … }`, `tabs { … }`, …). The lbrace
        // lookahead is what keeps `overlay {` (a config) apart from `overlay <token>` (a
        // paint facet that shares the word).
        const name = this.next().value
        ;(part.configs ??= {})[name] = this.parseFlatBlock(name)
      } else {
        const f = this.parseFacetStmt()
        if (f) facets[f.name] = f.value
      }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    const close = this.expect('rbrace', 'part-rbrace')
    if (Object.keys(facets).length) part.facets = facets
    if (variants.length) part.variants = variants
    this.recordSpan({
      id: `${this.currentComponentId ?? ''}#part.${seg(name)}`,
      kind: 'part',
      name,
      nameRange: this.rangeOf(nameTok, nameTok),
      fullRange: this.rangeOf(kw, close),
      parentId: this.currentComponentId ?? undefined,
    })
    return [name, part]
  }

  // `realize TARGET [when COND] { rstmt* }`
  private parseRealize(): Realization | null {
    this.next() // 'realize'
    const target = this.expectWord('realize-target')
    if (!target) return null
    let when: RealizeCond | null = null
    if (this.atWord('when')) {
      this.next()
      when = this.parseRealizeCond()
    }
    const r: Realization = { target, when }
    this.expect('lbrace', 'realize-lbrace')
    const wires: Wire[] = []
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const kw = this.peek().value
      if (this.atWord('presentation')) {
        this.next()
        const surface = this.at('word') ? this.next().value : undefined
        const pres: PresentationRealize = {}
        if (surface) pres.surface = surface
        if (this.at('lbrace')) this.parsePresentationBody(pres)
        r.presentation = pres
      } else if (this.atWord('browse')) {
        this.next()
        const mode = this.at('word') ? this.next().value : undefined
        r.browse = { mode }
        if (this.at('lbrace')) this.skipBlock() // orient/wrap details - captured minimally
      } else if (this.atWord('commit')) {
        this.next()
        r.commit = this.parseCommit()
      } else if (this.atWord('drop')) {
        this.next()
        r.drop = this.parseIdentListWords()
      } else if (this.atWord('note')) {
        this.next()
        r.note = this.at('string') ? this.next().value : this.expectWord('note')
      } else if (this.atWord('dismiss')) {
        // `dismiss none` (non-dismissable) | `dismiss outside escape closeButton` (0034).
        this.next()
        const words = this.parseIdentListWords()
        r.dismiss = words.length === 1 && words[0] === 'none' ? [] : words
      } else if (this.atWord('backdrop')) {
        this.next() // `backdrop scrim | blur | none`
        r.backdrop = this.at('word') ? this.next().value : undefined
        this.skipToTerminator()
      } else if (this.atWord('wire')) {
        const w = this.parseWire()
        if (w && w.kind === 'wire')
          wires.push({ from: w.from, to: w.to, ...(w.arg ? { arg: w.arg } : {}) })
      } else {
        this.issue('warning', 'realize-stmt', `unknown realize statement "${kw}" skipped`)
        if (this.at('lbrace')) this.skipBlock()
        else this.skipToTerminator()
      }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'realize-rbrace')
    if (wires.length) r.wire = wires
    return r
  }

  private parsePresentationBody(pres: PresentationRealize): void {
    this.expect('lbrace', 'pres-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const key = this.expectWord('pres-key')
      if (key === 'place') pres.place = this.expectWord('place')
      else if (key === 'flip') pres.flip = true
      else if (key === 'matchWidth') pres.matchWidth = true
      else this.skipToTerminator() // offset/anchor/etc. - not modeled
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'pres-rbrace')
  }

  private parseCommit(): CommitRealize {
    const modeWord = this.expectWord('commit-mode')
    const mode: CommitRealize['mode'] = modeWord === 'continuous' ? 'continuous' : 'explicit'
    const commit: CommitRealize = { mode }
    if (this.atWord('on')) {
      this.next()
      commit.on = this.parseIdentListWords()
    }
    // Block form: `commit continuous { live <event>; settled <event> }`.
    if (this.at('lbrace')) {
      this.next()
      while (!this.at('rbrace') && !this.at('eof')) {
        if (this.at('newline') || this.at('semi')) {
          this.pos++
          continue
        }
        const key = this.expectWord('commit-key')
        const val = this.at('word') ? this.next().value : undefined
        if (key === 'live' && val) commit.live = val
        else if (key === 'settled' && val) commit.settled = val
        else this.skipToTerminator()
      }
      this.expect('rbrace', 'commit-rbrace')
    }
    return commit
  }

  // A run of bare words up to a terminator (for `drop a b c`, `commit … on click enter`).
  private parseIdentListWords(): string[] {
    const out: string[] = []
    while (this.at('word')) out.push(this.next().value)
    return out
  }

  // ── `group Forms/Text "prose"` - a library category, declared by path (0041) ──
  parseComponentGroup(): ComponentGroupDecl | null {
    this.next() // 'group'
    const path = this.expectWord('group-path')
    if (!path) return null
    const description = this.at('string') ? this.next().value : undefined
    return { path, ...(description ? { description } : {}) }
  }

  // ── `example "Primary" for Button { demo { … } part … }` - a demo scene (0021) ──
  parseExample(): Example | null {
    this.next() // 'example'
    const nameTok = this.peek()
    const name = this.at('string') ? this.next().value : this.expectWord('example-name')
    if (!name) return null
    let forComponent: string | undefined
    if (this.atWord('for')) {
      this.next()
      forComponent = this.expectWord('example-for')
    }
    const description = this.at('string') ? this.next().value : undefined
    const prevComponentId = this.currentComponentId
    this.currentComponentId = `ex.${seg(name)}`
    this.expect('lbrace', 'example-lbrace')
    const anatomy: Record<string, Part> = {}
    let demo: Record<string, DemoVariable> | undefined
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (this.atWord('part')) {
        const p = this.parsePart()
        if (p) anatomy[p[0]] = p[1]
      } else if (this.atWord('demo')) {
        // The scene's own state variables. A separate keyword from `state`, which inside a
        // part already means an interaction-state style block.
        this.next()
        demo = this.parseDemoBlock()
      } else {
        this.issue(
          'error',
          'example-stmt',
          `unexpected ${JSON.stringify(this.peek().value)} in example`,
        )
        if (this.at('lbrace')) this.skipBlock()
        else this.skipToTerminator()
      }
      this.ensureProgress(mark)
    }
    const close = this.expect('rbrace', 'example-rbrace')
    this.currentComponentId = prevComponentId
    this.recordSpan({
      id: `ex.${seg(name)}`,
      kind: 'component',
      name,
      nameRange: this.rangeOf(nameTok, nameTok),
      fullRange: this.rangeOf(nameTok, close),
    })
    return {
      name,
      ...(forComponent ? { for: forComponent } : {}),
      ...(description ? { description } : {}),
      ...(demo && Object.keys(demo).length ? { demo } : {}),
      anatomy,
    }
  }

  // `demo { open : boolean = false; tone : enum(info, danger) = info }`
  private parseDemoBlock(): Record<string, DemoVariable> {
    const out: Record<string, DemoVariable> = {}
    this.expect('lbrace', 'demo-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const name = this.expectWord('demo-var')
      if (!name) break
      // `open : boolean`, as in a prop or a token - the one spelling of name-then-type.
      if (this.at('colon')) this.next()
      else
        this.issue(
          'error',
          'demo-colon',
          'a demo variable\'s type is introduced by a ":" - write `open : boolean`',
        )
      const type = this.parseTypeExpr()
      let initial: PropValue = ''
      if (this.at('equals')) {
        this.next()
        const v = this.parsePropDefault()
        if (v !== undefined) initial = v
      }
      out[name] = { type, initial }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'demo-rbrace')
    return out
  }

  // ── `docs { site { … } footer { … } page "Home" { … } }` - the docs overlay (0018) ──
  parseDocs(): DocsDecl {
    this.next() // 'docs'
    const docs: DocsDecl = { pages: [] }
    this.expect('lbrace', 'docs-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (this.atWord('site')) {
        this.next()
        const b = this.parseFlatBlock('docs-site')
        const site: DocsSiteDecl = {}
        for (const [k, v] of Object.entries(b)) {
          const key = k === 'search-placeholder' ? 'searchPlaceholder' : k
          if (
            (key === 'name' ||
              key === 'tagline' ||
              key === 'version' ||
              key === 'searchPlaceholder') &&
            typeof v === 'string'
          ) {
            site[key] = v
          }
        }
        if (Object.keys(site).length) docs.site = site
      } else if (this.atWord('footer')) {
        this.next()
        docs.footer = this.parseDocsFooter()
      } else if (this.atWord('page')) {
        const page = this.parseDocPage()
        if (page) docs.pages.push(page)
      } else {
        this.issue('error', 'docs-stmt', `unexpected ${JSON.stringify(this.peek().value)} in docs`)
        if (this.at('lbrace')) this.skipBlock()
        else this.skipToTerminator()
      }
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'docs-rbrace')
    return docs
  }

  private parseDocsFooter(): DocsFooterDecl {
    const footer: DocsFooterDecl = { links: [] }
    this.expect('lbrace', 'footer-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (this.atWord('link')) {
        this.next()
        const label = this.at('string') ? this.next().value : this.expectWord('footer-link-label')
        const href = this.at('string') ? this.next().value : this.expectWord('footer-link-href')
        if (label && href) footer.links.push({ label, href })
      } else if (this.atWord('copyright')) {
        this.next()
        if (this.at('string')) footer.copyright = this.next().value
      } else {
        this.issue('warning', 'footer-stmt', 'unknown footer statement - skipped')
        this.skipToTerminator()
      }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'footer-rbrace')
    return footer
  }

  // The prose blocks, whose keyword IS their kind.
  private static readonly DOC_PROSE = new Set(DOC_PROSE_KINDS)

  private parseDocPage(): DocPageDecl | null {
    this.next() // 'page'
    const title = this.at('string') ? this.next().value : this.expectWord('page-title')
    if (!title) return null
    const page: DocPageDecl = { title, blocks: [] }
    // `in "Guides"` = the sidebar section; `under "Home"` = a nested page's parent.
    while (this.atWord('in') || this.atWord('under')) {
      const which = this.next().value
      const value = this.at('string') ? this.next().value : this.expectWord('page-ref')
      if (which === 'in') page.group = value
      else page.parent = value
    }
    this.expect('lbrace', 'page-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const block = this.parseDocBlock()
      if (block) page.blocks.push(block)
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'page-rbrace')
    return page
  }

  private parseDocBlock(): DocBlockDecl | null {
    const word = this.peek().value
    if (Parser.DOC_PROSE.has(word)) {
      this.next()
      const text = this.at('string') ? this.next().value : ''
      const out: DocBlockDecl = { kind: 'prose', prose: word, text }
      if (this.atWord('anchor')) {
        this.next()
        const anchor = this.at('string') ? this.next().value : this.expectWord('anchor')
        if (anchor) out.anchor = anchor
      }
      return out
    }
    // The transclusions: each names what it shows, by NAME.
    const ref = () =>
      this.at('string') ? this.next().value : this.at('word') ? this.next().value : undefined
    switch (word) {
      case 'divider':
        this.next()
        return { kind: 'divider' }
      case 'image': {
        this.next()
        if (this.atWord('asset')) this.next()
        const asset = ref()
        return { kind: 'image', ...(asset ? { asset } : {}) }
      }
      case 'component': {
        this.next()
        const component = ref()
        return { kind: 'component', ...(component ? { component } : {}) }
      }
      case 'component-props':
      case 'component-events':
      case 'component-composition': {
        this.next()
        const component = ref()
        const kind =
          word === 'component-props'
            ? 'componentProps'
            : word === 'component-events'
              ? 'componentEvents'
              : 'componentComposition'
        return { kind, ...(component ? { component } : {}) } as DocBlockDecl
      }
      case 'component-prop': {
        this.next()
        const component = ref()
        const prop = ref()
        return {
          kind: 'componentProp',
          ...(component ? { component } : {}),
          ...(prop ? { prop } : {}),
        }
      }
      case 'component-event': {
        this.next()
        const component = ref()
        const event = ref()
        return {
          kind: 'componentEvent',
          ...(component ? { component } : {}),
          ...(event ? { event } : {}),
        }
      }
      case 'example': {
        this.next()
        const example = ref()
        return { kind: 'example', ...(example ? { example } : {}) }
      }
      case 'component-group': {
        this.next()
        const group = ref()
        return { kind: 'componentGroup', ...(group ? { group } : {}) }
      }
      case 'tokens':
      case 'swatch': {
        this.next()
        const tokenType = ref()
        return {
          kind: word === 'tokens' ? 'tokens' : 'swatch',
          ...(tokenType ? { tokenType } : {}),
        }
      }
      default:
        this.issue('warning', 'doc-block', `unknown doc block "${word}" - skipped`)
        this.skipToTerminator()
        return null
    }
  }

  // ── `assets { folder Brand/Icons; svg "logo" in Brand/Icons { … } }` (§1.2) ──
  parseAssets(): AssetsDecl {
    this.next() // 'assets'
    const out: AssetsDecl = { folders: [], assets: [] }
    this.expect('lbrace', 'assets-lbrace')
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (this.atWord('folder')) {
        this.next()
        const path = this.expectWord('asset-folder')
        if (path) out.folders.push({ path })
      } else if (this.at('word')) {
        const kind = this.next().value
        const name = this.at('string') ? this.next().value : this.expectWord('asset-name')
        let folder: string | undefined
        if (this.atWord('in')) {
          this.next()
          folder = this.expectWord('asset-in')
        }
        const props = this.at('lbrace') ? this.parseFlatBlock('asset') : {}
        const asset: AssetDecl = { kind, name, ...(folder ? { folder } : {}), props: {} }
        // The fields every asset has are lifted out of the property bag; the rest is
        // per-kind metadata the lowering validates against the asset's kind.
        for (const [k, v] of Object.entries(props)) {
          if (k === 'mime' && typeof v === 'string') asset.mimeType = v
          else if (k === 'size' && typeof v === 'number') asset.sizeBytes = v
          else if (k === 'uploaded' && typeof v === 'string') asset.uploadedAt = v
          else if ((k === 'url' || k === 'data') && typeof v === 'string') asset.url = v
          else if (k === 'tags') asset.tags = (Array.isArray(v) ? v : [v]).map(String)
          else asset.props[k] = v
        }
        out.assets.push(asset)
      } else {
        this.issue(
          'error',
          'assets-stmt',
          `unexpected ${JSON.stringify(this.peek().value)} in assets`,
        )
        this.skipToTerminator()
      }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'assets-rbrace')
    return out
  }

  // ── `icons { set lucide "Lucide" { … }; glyph lucide check { … }; custom "Spark" { … } }` ──
  // The icon library. Its statements are read in order and kept in order, because the first
  // set is what a bare glyph name resolves against.
  parseIcons(): IconsDecl {
    this.next() // 'icons'
    const out: IconsDecl = { sets: [], icons: [] }
    this.expect('lbrace', 'icons-lbrace')
    // A glyph or set name is a bare word when it can be one (`chevron-down`) and a string when
    // it cannot (a provider is free to name a glyph `123`), so both are accepted.
    const nameOf = (code: string) => (this.at('string') ? this.next().value : this.expectWord(code))
    // The keys each statement knows; anything else is reported and dropped rather than kept in
    // a bag no reader looks at.
    const fields = (code: string, known: readonly string[]) => {
      const props = this.at('lbrace') ? this.parseFlatBlock(code) : {}
      const str: Record<string, string> = {}
      const list: Record<string, string[]> = {}
      for (const [k, v] of Object.entries(props)) {
        if (!known.includes(k)) {
          this.issue('warning', `${code}-key`, `unknown ${code} setting "${k}" - dropped`)
        } else if (Array.isArray(v)) list[k] = v.map(String)
        else if (typeof v === 'string' || typeof v === 'number') str[k] = String(v)
      }
      return { str, list }
    }
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (this.atWord('set')) {
        this.next()
        const prefix = nameOf('icon-set-prefix')
        const name = this.at('string') ? this.next().value : prefix
        const { str, list } = fields('icon-set', ['provider', 'license', 'samples'])
        if (prefix) {
          const set: IconSetDecl = { prefix, name }
          if (str.provider) set.provider = str.provider
          if (str.license) set.license = str.license
          if (list.samples) set.samples = list.samples
          out.sets.push(set)
        }
      } else if (this.atWord('glyph')) {
        this.next()
        const prefix = nameOf('icon-glyph-prefix')
        const name = prefix ? nameOf('icon-glyph-name') : ''
        const { str } = fields('icon-glyph', ['label', 'svg'])
        if (prefix && name) {
          const icon: IconDecl = { kind: 'set', prefix, name }
          if (str.label) icon.label = str.label
          if (str.svg) icon.svg = str.svg
          out.icons.push(icon)
        }
      } else if (this.atWord('custom')) {
        this.next()
        const name = nameOf('icon-custom-name')
        const { str } = fields('icon-custom', ['asset', 'label'])
        if (name) {
          const icon: IconDecl = { kind: 'custom', name }
          if (str.asset) icon.asset = str.asset
          if (str.label) icon.label = str.label
          out.icons.push(icon)
        }
      } else {
        this.issue(
          'error',
          'icons-stmt',
          `unexpected ${JSON.stringify(this.peek().value)} in icons`,
        )
        this.skipToTerminator()
      }
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'icons-rbrace')
    return out
  }

  parseComponent(): Component | null {
    const kw = this.next() // 'component'
    const nameTok = this.peek()
    const name = this.expectWord('component-name')
    if (!name) return null
    const componentId = cmpId(name)
    const prevComponentId = this.currentComponentId
    this.currentComponentId = componentId
    let description: string | undefined
    if (this.at('string')) description = this.next().value
    this.expect('lbrace', 'component-lbrace')

    let archetype = ''
    let meta: Metadata | undefined
    let group: string | undefined
    const props: PropDef[] = []
    const constraints: PropConstraint[] = []
    const events: EventDef[] = []
    const uses: UsesClause[] = []
    const coordination: CoordEntry[] = []
    const anatomy: Record<string, Part> = {}
    const realize: Realization[] = []

    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (this.atWord('archetype')) {
        this.next()
        archetype = this.expectWord('archetype')
      } else if (this.atWord('meta')) {
        meta = this.parseMetaBlock()
      } else if (this.atWord('props')) {
        this.parseProps(props, constraints)
      } else if (this.atWord('events')) {
        this.parseEvents(events)
      } else if (this.atWord('uses')) {
        const u = this.parseUses()
        if (u) uses.push(u)
      } else if (this.atWord('wire')) {
        const w = this.parseWire()
        if (w) coordination.push(w)
      } else if (this.atWord('gate')) {
        const g = this.parseGate()
        if (g) coordination.push(g)
      } else if (this.atWord('motion')) {
        this.issue('warning', 'motion', 'component-level motion parsed as a note - skipped')
        this.skipToTerminator()
      } else if (this.atWord('requires')) {
        this.next()
        this.parseIdentListWords()
        this.issue(
          'warning',
          'requires',
          'component `requires` (capability gate) has no AST field - skipped',
        )
      } else if (this.atWord('part')) {
        const p = this.parsePart()
        if (p) anatomy[p[0]] = p[1]
      } else if (this.atWord('group')) {
        // The library category this component sits in, by group PATH (proposal 0041).
        this.next()
        group = this.expectWord('component-group')
      } else if (this.atWord('realize')) {
        const r = this.parseRealize()
        if (r) realize.push(r)
      } else {
        this.issue(
          'error',
          'component-stmt',
          `unexpected ${JSON.stringify(this.peek().value)} in component`,
        )
        if (this.at('lbrace')) this.skipBlock()
        else this.skipToTerminator()
      }
      this.ensureProgress(mark)
    }
    const close = this.expect('rbrace', 'component-rbrace')
    this.currentComponentId = prevComponentId
    this.recordSpan({
      id: componentId,
      kind: 'component',
      name,
      nameRange: this.rangeOf(nameTok, nameTok),
      fullRange: this.rangeOf(kw, close),
    })

    const component: Component = {
      id: componentId,
      name,
      archetype,
      contract: { params: {}, props, events, ...(constraints.length ? { constraints } : {}) },
      anatomy,
      realize,
    }
    if (description) component.description = description
    if (group) component.group = group
    if (uses.length || coordination.length) {
      const composition: Composition = { uses, coordination }
      component.composition = composition
    }
    if (meta && Object.keys(meta).length) component.meta = meta
    return component
  }

  // ════════════════════════════════════════════════════════════════════════
  // Header & metadata (proposal 0026)
  // ════════════════════════════════════════════════════════════════════════

  private parseMetaValue(): PropValue {
    const t = this.peek()
    if (t.type === 'string') return this.next().value
    if (t.type === 'lbracket') {
      this.next()
      const arr: PropValue[] = []
      while (!this.at('rbracket') && !this.at('eof')) {
        const mark = this.pos
        if (this.at('comma') || this.at('newline') || this.at('semi')) {
          this.pos++
          continue
        }
        const it = this.peek()
        if (it.type === 'string') arr.push(this.next().value)
        else if (it.type === 'word') {
          const w = this.next().value
          arr.push(NUMBER_RE.test(w) ? Number(w) : w === 'true' ? true : w === 'false' ? false : w)
        } else this.next()
        this.ensureProgress(mark)
      }
      if (this.at('rbracket')) this.next()
      return arr
    }
    if (t.type === 'word') {
      this.next()
      return NUMBER_RE.test(t.value)
        ? Number(t.value)
        : t.value === 'true'
          ? true
          : t.value === 'false'
            ? false
            : t.value
    }
    this.issue('error', 'meta-value', `expected a metadata value, got ${t.type}`)
    return ''
  }

  private parseMetaBlock(): Metadata {
    this.next() // 'meta'
    this.expect('lbrace', 'meta-lbrace')
    const out: Metadata = {}
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      const key = this.expectWord('meta-key')
      const val = this.parseMetaValue()
      if (key) out[key] = val
      if (this.at('semi') || this.at('newline')) this.pos++
      this.ensureProgress(mark)
    }
    this.expect('rbrace', 'meta-rbrace')
    return out
  }

  // ── cross-token check: an alias must point at a token of its own KIND ──
  // Types are grouped into families rather than compared exactly, because several types share
  // a value shape on purpose: a `ring` or a `backdrop` token IS a colour, and every length type
  // is interchangeable in a length slot. Only a family mismatch is worth a word.
  private checkAliasTypes(): void {
    for (const ref of this.aliasRefs) {
      const targetType = this.tokenTypes.get(ref.refId)
      if (!targetType) continue // a reference to a token this file does not declare
      const want = tokenTypeFamily(ref.declType)
      const got = tokenTypeFamily(targetType)
      if (want === got) continue
      // An error, not a note: the value that arrives in the colour slot is a length, so
      // every theme built from this document is wrong wherever that context is active.
      this.issue(
        'error',
        'alias-type-mismatch',
        `a ${ref.declType} token is aliased to "${ref.refId.replace(/^tok\./, '').replace(/\./g, '/')}", which is a ${targetType} token`,
        ref.tok,
      )
    }
  }

  // ── usage rules (proposal 0052 §5) ──
  // `rule <id> <severity> { <statement> because "<rationale>" }`. One statement per rule, and every
  // statement opens with ONE keyword of its own (§5.3) - `max`, `min`, `never`, `only`, `tokens`,
  // `prefer` - so completion keys on the first word of the line and a diagnostic points at a word.
  // References are by NAME and a dangling one is a warning: the rule is kept and matches nothing,
  // which loses no authored text and lets a per-file corpus name a sibling file's component.
  private parseRule(): UsageRule | null {
    const kw = this.next() // 'rule'
    const idTok = this.peek()
    const id = this.expectWord('rule-id')
    if (!id) {
      this.skipToTerminator()
      return null
    }
    let severity: UsageRule['severity'] = 'error'
    if (this.atWord('error') || this.atWord('warning')) {
      severity = this.next().value as UsageRule['severity']
    } else {
      this.issue(
        'error',
        'rule-severity',
        `a rule's severity follows its id - write \`rule ${id} error {\` or \`rule ${id} warning {\``,
      )
    }
    this.expect('lbrace', 'rule-lbrace')
    let body: RuleBody | null = null
    // A statement that was written and did not parse has already been reported; saying "states
    // nothing" on top of it would be a second squiggle for one mistake.
    let attempted = false
    let rationale: string | undefined
    while (!this.at('rbrace') && !this.at('eof')) {
      const mark = this.pos
      if (this.at('newline') || this.at('semi')) {
        this.pos++
        continue
      }
      if (this.atWord('because')) {
        this.next()
        if (this.at('string')) rationale = this.next().value
        else
          this.issue(
            'error',
            'rule-because-string',
            '`because` takes the reason as a quoted string',
          )
      } else if (body) {
        this.issue(
          'error',
          'rule-second-statement',
          'a rule states one thing - write a second rule for the second statement',
        )
        this.skipToTerminator()
      } else {
        attempted = true
        body = this.parseRuleStatement()
      }
      this.ensureProgress(mark)
    }
    const close = this.expect('rbrace', 'rule-rbrace')
    this.recordSpan({
      id: `rule.${id}`,
      kind: 'rule',
      name: id,
      nameRange: this.rangeOf(idTok, idTok),
      fullRange: this.rangeOf(kw, close),
    })
    // An error, and the rule is still kept with an empty reason, so the file round-trips while
    // someone writes one. Mandatory because a rule without a reason is the one an agent cannot
    // generalize from and a human will suppress (§5).
    if (rationale === undefined)
      this.issue(
        'error',
        'rule-because-missing',
        `rule "${id}" has no \`because "…"\` - the reason is what the agent reads`,
        kw,
      )
    if (!body) {
      if (attempted) return null
      this.issue(
        'error',
        'rule-statement-missing',
        `rule "${id}" states nothing - write one of \`max\`, \`min\`, \`never\`, \`only\`, \`tokens\`, \`prefer\``,
        kw,
      )
      return null
    }
    return { id, severity, rationale: rationale ?? '', ...body } as UsageRule
  }

  private parseRuleStatement(): RuleBody | null {
    if (this.atWord('max') || this.atWord('min')) {
      // `max N`, `min N`, or both in either order: one statement holds both bounds, so "between 2
      // and 7" is one decision with one id, not two rules that have to be kept in step.
      let min: number | undefined
      let max: number | undefined
      while (this.atWord('min') || this.atWord('max')) {
        const which = this.next().value
        const n = this.parseRuleCount()
        if (n === undefined) break
        if (which === 'min') min = n
        else max = n
      }
      const countTok = this.peek()
      const subject = this.parseRuleSubject()
      this.expectRuleWord('within')
      const within = this.parseRuleSubject()
      if (min !== undefined && max !== undefined && min > max)
        this.issue(
          'error',
          'rule-count-bound',
          `min ${min} is more than max ${max}, so nothing can satisfy it`,
          countTok,
        )
      return {
        kind: 'count',
        subject,
        within,
        ...(min !== undefined ? { min } : {}),
        ...(max !== undefined ? { max } : {}),
      }
    }
    if (this.atWord('never')) {
      this.next()
      const subject = this.parseRuleSubject()
      this.expectRuleWord('within')
      return { kind: 'never', subject, within: this.parseRuleSubject() }
    }
    if (this.atWord('only')) {
      this.next()
      const subject = this.parseRuleSubject()
      this.expectRuleWord('within')
      const within = [this.parseRuleSubject()]
      while (this.at('comma')) {
        this.next()
        within.push(this.parseRuleSubject())
      }
      return { kind: 'only-within', subject, within }
    }
    if (this.atWord('tokens')) {
      this.next()
      const types: TokenType[] = []
      for (;;) {
        const tok = this.peek()
        const word = this.expectWord('rule-token-type')
        if (!word) break
        const type = TYPE_MAP[word]
        if (type) types.push(type)
        else {
          // Kept as written: a file from a later surface may know a type this reader does not.
          this.issue('warning', 'rule-unknown-token-type', `"${word}" is not a token type`, tok)
          types.push(word as TokenType)
        }
        if (!this.at('comma')) break
        this.next()
      }
      return { kind: 'tokens-only', types }
    }
    if (this.atWord('prefer')) {
      this.next()
      const tok = this.peek()
      const component = this.expectWord('rule-prefer-component')
      if (component) this.ruleComponentRefs.push({ name: component, tok })
      this.expectRuleWord('for')
      this.expectRuleWord('archetype')
      const archetypes: string[] = []
      for (;;) {
        const aTok = this.peek()
        const name = this.expectWord('rule-archetype')
        if (!name) break
        this.checkArchetype(name, aTok)
        archetypes.push(name)
        if (!this.at('comma')) break
        this.next()
      }
      return { kind: 'prefer', component, archetypes }
    }
    this.issue(
      'error',
      'rule-statement',
      'expected a rule statement - one of `max`, `min`, `never`, `only`, `tokens`, `prefer`',
    )
    this.skipToTerminator()
    return null
  }

  private parseRuleCount(): number | undefined {
    const tok = this.peek()
    const word = this.expectWord('rule-count')
    const n = Number(word)
    if (word && Number.isInteger(n) && n >= 0) return n
    if (word)
      this.issue('error', 'rule-count-bound', `"${word}" is not a count - use a whole number`, tok)
    return undefined
  }

  // `Button`, `archetype Form`, either followed by `where <predicate>` over its props.
  private parseRuleSubject(): RuleSubject {
    let subject: RuleSubject
    if (this.atWord('archetype')) {
      this.next()
      const tok = this.peek()
      const name = this.expectWord('rule-archetype')
      if (name) this.checkArchetype(name, tok)
      subject = { kind: 'archetype', name }
    } else {
      const tok = this.peek()
      const name = this.expectWord('rule-component')
      if (name) this.ruleComponentRefs.push({ name, tok })
      subject = { kind: 'component', name }
    }
    if (this.atWord('where')) {
      this.next()
      const tok = this.peek()
      subject.where = this.parsePredicate()
      this.checkPropOnly(subject.where, 'rule-where-not-prop', '`where`', tok)
    }
    return subject
  }

  private expectRuleWord(word: string): void {
    if (this.atWord(word)) this.next()
    else this.issue('error', `rule-${word}`, `expected \`${word}\` here`)
  }

  private checkArchetype(name: string, tok: Token): void {
    if (!archetypesByName[name])
      this.issue(
        'warning',
        'rule-unknown-archetype',
        `the prelude has no archetype named "${name}"`,
        tok,
      )
  }

  // A usage rule and a `required when` are both decided where the component is USED, where a UI
  // state or a theme context has no value yet - so only prop leaves mean anything there.
  private checkPropOnly(p: Predicate, code: string, what: string, tok: Token): void {
    const walk = (q: Predicate): boolean =>
      q.kind === 'cmp'
        ? q.ref.kind === 'prop'
        : q.kind === 'not'
          ? walk(q.item)
          : q.items.every(walk)
    if (!walk(p))
      this.issue(
        'warning',
        code,
        `${what} reads props only - a state or a context has no value where a component is used`,
        tok,
      )
  }

  // Run once every component has been read: a rule may precede the components it names.
  private resolveRuleRefs(components: Component[]): void {
    const names = new Set(components.map((c) => c.name))
    for (const ref of this.ruleComponentRefs)
      if (!names.has(ref.name))
        this.issue(
          'warning',
          'rule-unknown-component',
          `no component named "${ref.name}" in this file - the rule matches nothing until one exists`,
          ref.tok,
        )
  }

  // ── top-level document driver ──
  // A bare ident in a type position (`variant Variant`) is the SUGAR for a context-group-typed
  // prop (proposal 0001 §4), and it is spelled exactly like a shared-type reference. Reading it
  // needs both declaration lists, so it is settled here rather than at the cursor: a provisional
  // ref (the bare spelling only - see `provisionalRefs`) whose name matches a declared context
  // group, and no shared type, becomes `{ kind: 'context', group }`. A name that matches both
  // stays a shared-type ref, because the explicit `context Variant` form exists to say the other
  // thing. An explicit `ref Color` is never rewritten: it is how a built-in type is exported, and
  // a system with a `Color` aspect would otherwise retype every colour prop on its next read.
  private resolveContextTypes(
    components: Component[],
    contextGroups: ContextGroup[],
    sharedTypes: SharedType[],
    globalProps: GlobalProp[],
  ): void {
    if (contextGroups.length === 0) return
    const groupById = new Map(contextGroups.map((g) => [g.id, g]))
    const sharedIds = new Set(sharedTypes.map((t) => t.id))
    const rewrite = (t: TypeExpr): TypeExpr => {
      if (t.kind === 'ref') {
        if (!this.provisionalRefs.has(t)) return t
        const asGroup = t.ref.replace(/^st\./, 'cg.')
        if (!sharedIds.has(t.ref) && groupById.has(asGroup))
          return { kind: 'context', group: asGroup }
        return t
      }
      if (t.kind === 'array') return { ...t, item: rewrite(t.item) }
      if (t.kind === 'union') return { ...t, members: t.members.map(rewrite) }
      if (t.kind === 'object') {
        return { ...t, fields: t.fields.map((f) => ({ ...f, type: rewrite(f.type) })) }
      }
      return t
    }
    for (const c of components) {
      for (const prop of c.contract.props) prop.type = rewrite(prop.type)
    }
    for (const st of sharedTypes) st.definition = rewrite(st.definition)
    // A global prop is typed by a group as often as a local one is - it is the main reason to
    // declare one - so the same sugar has to reach it.
    for (const gp of globalProps) gp.type = rewrite(gp.type)
  }

  // `global-prop variant : Variant = Solid` - a prop declared once for the whole system
  // (proposal 0051 §5). Written like a shared type, and for the same reason: it is a declaration
  // the components REFERENCE rather than restate.
  private parseGlobalProp(): GlobalProp | null {
    this.next() // 'global-prop'
    const nameTok = this.peek()
    const name = this.expectWord('global-prop-name')
    if (!name) return null
    if (this.at('colon')) this.next()
    else
      this.issue(
        'error',
        'global-prop-colon',
        'a global prop\'s type is introduced by a ":" - write `global-prop variant : Variant`',
      )
    const type = this.parseTypeExpr()
    const gp: GlobalProp = { id: `gp.${seg(name)}`, name, type }
    if (this.at('equals')) {
      this.next()
      const def = this.parsePropDefault()
      if (def !== undefined) gp.default = def
    }
    if (this.peek().type === 'string') gp.description = this.next().value
    this.recordSpan({
      id: gp.id,
      kind: 'globalProp',
      name,
      nameRange: this.rangeOf(nameTok, nameTok),
      fullRange: this.rangeOf(nameTok, this.lastTok()),
    })
    return gp
  }

  // A `global variant` line inside a props block names a declaration instead of restating one, so
  // the type and default come from the registry. Filled in here rather than at the cursor because
  // a component may precede the declaration - the same reason `resolveContextTypes` runs late.
  // A reference to a name nothing declares is dropped with an error: a prop whose type had to be
  // invented would type as `any` and hollow out the component's API silently.
  private resolveGlobalProps(components: Component[], globalProps: GlobalProp[]): void {
    const byName = new Map(globalProps.map((g) => [g.name, g]))
    for (const c of components) {
      c.contract.props = c.contract.props.filter((p) => {
        if (!p.global) return true
        const gp = byName.get(p.name)
        if (!gp) {
          this.issue(
            'error',
            'global-prop-unknown',
            `no global prop named "${p.name}" - declare it with \`global-prop ${p.name} : …\``,
          )
          return false
        }
        p.type = gp.type
        if (gp.default !== undefined) p.default = gp.default
        if (gp.description && !p.description) p.description = gp.description
        return true
      })
    }
  }

  parseDocument(opts: ParseOptions): DesignSystemDocument {
    const contextGroups: ContextGroup[] = []
    // The default layer holds tokens written directly inside `foundations`; `layers` collects
    // the explicit `layer NAME { … }` blocks (proposal 0006 ordering, readable from the file
    // since 2026-07-27).
    const layer: Layer = { id: 'layer.foundations', name: 'Foundations', order: 0, tokens: [] }
    const layers: Layer[] = []
    const sharedTypes: SharedType[] = []
    // System-wide props (0051 §5), declared like a shared type and taken by reference.
    const globalProps: GlobalProp[] = []
    // Usage rules (0052 §5), top-level like a global prop and for the same reason.
    const rules: UsageRule[] = []
    const components: Component[] = []
    const metadata: ProjectMetadataEntry[] = []
    // The library AROUND the components (proposal 0041): organisation, demo scenes, the
    // docs overlay and the asset library. All authored, none of them carried before now.
    const componentGroups: ComponentGroupDecl[] = []
    const examples: Example[] = []
    let docs: DocsDecl | undefined
    let assets: AssetsDecl | undefined
    let icons: IconsDecl | undefined

    // Header + document metadata (proposal 0026). Surface `milda`/`prelude` override opts.
    // A file with no header is not a 0.1 file - it is a file that did not say. Default to
    // the current surface rather than inventing an old one, or the printer stamps it with a
    // claim about its own syntax that is very likely false.
    let mildaVer = opts.milda ?? MILDA_SURFACE_VERSION
    let preludeVer = opts.prelude ?? PRELUDE_VERSION
    let docName = opts.name ?? 'Design system'
    let docVersion = '0.0.0'
    let docDescription: string | undefined

    this.skipNewlines()
    while (!this.at('eof')) {
      const mark = this.pos
      if (this.atWord('milda')) {
        this.next()
        mildaVer = this.expectWord('milda-version') || mildaVer
      } else if (this.atWord('prelude')) {
        this.next()
        preludeVer = this.expectWord('prelude-version') || preludeVer
      } else if (this.atWord('meta')) {
        const m = this.parseMetaBlock()
        for (const [k, v] of Object.entries(m)) {
          if (k === 'name') docName = String(v)
          else if (k === 'version') docVersion = String(v)
          else if (k === 'description') docDescription = String(v)
          else metadata.push({ id: `md.${seg(k)}`, key: k, type: metaValueType(v), value: v })
        }
      } else if (this.atWord('context-group')) {
        const cg = this.parseContextGroup()
        if (cg) contextGroups.push(cg)
      } else if (this.atWord('foundations')) {
        this.parseFoundations(layer, layers)
      } else if (this.atWord('type')) {
        const st = this.parseSharedType()
        if (st) sharedTypes.push(st)
      } else if (this.atWord('global-prop')) {
        const gp = this.parseGlobalProp()
        if (gp) globalProps.push(gp)
      } else if (this.atWord('rule')) {
        const r = this.parseRule()
        if (r) {
          if (rules.some((x) => x.id === r.id))
            this.issue('error', 'rule-duplicate-id', `the rule id "${r.id}" is already taken`)
          rules.push(r)
        }
      } else if (this.atWord('component')) {
        const c = this.parseComponent()
        if (c) components.push(c)
      } else if (this.atWord('group')) {
        const g = this.parseComponentGroup()
        if (g) componentGroups.push(g)
      } else if (this.atWord('example')) {
        const ex = this.parseExample()
        if (ex) examples.push(ex)
      } else if (this.atWord('docs')) {
        docs = this.parseDocs()
      } else if (this.atWord('assets')) {
        assets = this.parseAssets()
      } else if (this.atWord('icons')) {
        icons = this.parseIcons()
      } else {
        const tok = this.peek()
        this.issue(
          'error',
          'top-level',
          `unexpected top-level ${JSON.stringify(tok.value || tok.type)}`,
        )
        this.next()
      }
      this.ensureProgress(mark)
      this.skipNewlines()
    }

    // Every token's type is known now, so the alias references collected during the walk can
    // finally be checked against their targets.
    this.checkAliasTypes()

    // Same reason, for types: a bare ident in a type position is a shared type OR a context group,
    // and which one cannot be known while reading a component that precedes the declaration.
    this.resolveContextTypes(components, contextGroups, sharedTypes, globalProps)
    // A `global x` line in a props block is a REFERENCE; the type and default it stands for are
    // filled in from the registry here, once every declaration has been read.
    this.resolveGlobalProps(components, globalProps)
    this.resolveRuleRefs(components)

    return {
      milda: mildaVer,
      kind: 'design-system',
      prelude: preludeVer,
      meta: {
        id: `ds.${seg(docName)}`,
        name: docName,
        version: docVersion,
        ...(docDescription ? { description: docDescription } : {}),
      },
      foundations: {
        contextGroups,
        ...(globalProps.length ? { globalProps } : {}),
        ...(rules.length ? { rules } : {}),
        // The default layer only appears when something was written outside a `layer` block, so
        // a fully layered file does not gain a stray empty "Foundations" layer.
        layers: [...(layer.tokens.length ? [layer] : []), ...layers],
        sharedTypes,
        metadata,
      },
      components,
      ...(componentGroups.length ? { componentGroups } : {}),
      ...(examples.length ? { examples } : {}),
      ...(docs ? { docs } : {}),
      ...(assets ? { assets } : {}),
      ...(icons ? { icons } : {}),
    }
  }
}

export function parseMildaDocument(src: string, opts: ParseOptions = {}): ParseResult {
  let toks: Token[]
  // Characters the lexer could not tokenize. They are skipped rather than fatal (a
  // half-typed document must still parse), but they are reported: a stray character inside a
  // literal changes the VALUE, so swallowing it silently turned `hex(őfff)` into white with
  // no issue and no clue. Reported as warnings, since the surrounding file is still valid.
  const skipped: SkippedChar[] = []
  try {
    toks = lex(src, skipped)
  } catch (e) {
    const le = e as LexError
    return {
      document: emptyDocument(opts),
      issues: [
        {
          severity: 'error',
          code: 'lex',
          message: le.message,
          line: le.line ?? 1,
          col: le.col ?? 1,
        },
      ],
      spans: [],
    }
  }

  const p = new Parser(toks, src)
  const document = p.parseDocument(opts)
  for (const s of skipped) {
    p.issues.push({
      severity: 'warning',
      code: 'unexpected-character',
      message: `unexpected character ${JSON.stringify(s.char)} skipped`,
      line: s.line,
      col: s.col,
    })
  }
  // Position order, so a reader (and an editor's problem list) sees them where they are.
  p.issues.sort((a, b) => a.line - b.line || a.col - b.col)
  return { document, issues: p.issues, spans: p.spans }
}

function emptyDocument(opts: ParseOptions): DesignSystemDocument {
  return {
    milda: opts.milda ?? MILDA_SURFACE_VERSION,
    kind: 'design-system',
    prelude: opts.prelude ?? PRELUDE_VERSION,
    meta: {
      id: `ds.${seg(opts.name ?? 'design-system')}`,
      name: opts.name ?? 'Design system',
      version: '0.0.0',
    },
    foundations: { contextGroups: [], layers: [], sharedTypes: [], metadata: [] },
    components: [],
  }
}
