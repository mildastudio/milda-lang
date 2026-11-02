import type { Id } from './ast'

export interface TokenRef {
  ref: Id
}

export type PrimitiveTokenType =
  | 'color'
  | 'spacing'
  | 'radius'
  | 'size'
  | 'shadow'
  | 'typography'
  | 'fontFamily'
  | 'fontWeight'
  | 'duration'
  | 'opacity'
  | 'blur'
  | 'tonal'
  | 'border'
  // Added 2026-07-27 (proposal 0041 §4). These three exist in the editor and had no AST
  // counterpart, so a `.milda` file could not name them: a lineHeight was written as `number`
  // and an easing as `easing`, neither of which the parser knew, so both came back typed as a
  // length - a ratio of `1.5` returned as `1.5px`. A missing TYPE, not a missing keyword.
  | 'lineHeight'
  | 'easing'
  | 'gradient'
  // Both are lengths, but they are distinct SCALES in the editor, and a facet resolves a token
  // by (scale, id). Collapsing them into `size` meant a `text` facet could not find its own font
  // size token (proposal 0041 §1.1d).
  | 'fontSize'
  | 'letterSpacing'

export type FacetTokenType = 'elevation' | 'ring' | 'backdrop' | 'none'

export type TokenType = PrimitiveTokenType | FacetTokenType

export type ColorSpace = 'srgb' | 'display-p3' | 'oklch' | 'hsl'

export interface ColorValue {
  space: ColorSpace
  channels: number[]
  alpha?: number
}

/**
 * The neutral length units (0038). `fixed` is a density-independent length (CSS px,
 * Android dp, iOS pt, Figma px); `scaled` is a multiple of the user's text size (CSS
 * rem, Android sp, iOS Dynamic Type). The surface spells them `12px` and `scaled(12)`;
 * `dp`/`sp`/`rem` are read as synonyms but never emitted.
 */
export type DimensionUnit = 'scaled' | 'fixed' | 'percent' | 'em'

export interface DimensionValue {
  value: number
  unit: DimensionUnit
}

/**
 * A length that is an INTENT rather than a measurement (0038). `pill` is "fully
 * rounded": on the web it lowers to a large px radius, on iOS to a capsule, on Android
 * to a circle shape, in Figma to a clamped corner radius. Spelling it as a keyword is
 * what lets each target lower it correctly instead of pattern-matching `9999px`.
 */
export type LengthKeyword = 'pill'

export interface LengthKeywordValue {
  keyword: LengthKeyword
}

export type LengthValue = DimensionValue | LengthKeywordValue

export type ColorOrRef = ColorValue | TokenRef
export type DimensionOrRef = DimensionValue | TokenRef

export interface ShadowLayer {
  offsetX: DimensionValue
  offsetY: DimensionValue
  blur: DimensionValue
  spread: DimensionValue
  color: ColorOrRef
  inset: boolean
}

export interface ShadowValue {
  layers: ShadowLayer[]
}

export type FontCategory = 'sans' | 'serif' | 'mono' | 'display'

/**
 * Where the face comes from (added 2026-08-06 with the fontFamily token surface).
 *
 * Without it a family read back from a file could only ever be "some family called Inter":
 * whether it is a platform stack, a bundled Google Font (and under which licence), or a file
 * the project uploaded is exactly what a generator has to know to EMIT it - a @font-face, a
 * stylesheet link, or nothing at all. Optional, so every existing document stays valid and is
 * read as a plain named family.
 */
export type FontProvenance =
  { kind: 'system' } | { kind: 'google'; license?: string } | { kind: 'custom' }

export interface FontFamilyValue {
  /** The family name, or - for a system face - the platform stack itself. */
  family: string
  fallback: string[]
  category: FontCategory
  assetId?: Id | null
  source?: FontProvenance
}

export interface FontWeightValue {
  weight: number
}

export interface TypographyValue {
  family: TokenRef | FontFamilyValue
  size: DimensionValue
  weight: number
  lineHeight: DimensionValue | { ratio: number }
  letterSpacing: DimensionValue
  italic?: boolean
  uppercase?: boolean
}

export interface DurationValue {
  ms: number
}

export interface OpacityValue {
  value: number
}

export interface BlurValue {
  radius: DimensionValue
}

export interface TonalValue {
  level: number
}

export type BorderWidth = 'hairline' | 'thin' | 'thick' | DimensionValue
export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'none'

export interface BorderValue {
  width: BorderWidth
  style: BorderStyle
  color: ColorOrRef
}

export interface NoneValue {
  none: true
}

// A unitless ratio (line height). Same shape as OpacityValue on purpose: both are scalars with
// no unit, and giving them one shape means one code path across the boundary.
export interface RatioValue {
  value: number
}

// An easing curve: a named keyword (`linear`, `ease-in`, …) or an explicit cubic bezier.
export interface EasingValue {
  keyword?: string
  cubicBezier?: [number, number, number, number]
  // The authored CSS, kept verbatim when it is neither of the above. The surface writes these
  // as `raw "…"`, so nothing is lost even where the structured form does not apply.
  css?: string
}

// A gradient. Only the authored CSS for now: the surface has no gradient FUNCTION, so a file
// carries the string. Named as its own type anyway, because the alternative was for a gradient
// token to come back typed as a length (proposal 0041 §4).
export interface GradientValue {
  css: string
}

export interface TokenValueSchemaByType {
  color: ColorValue
  spacing: DimensionValue
  radius: LengthValue
  size: DimensionValue
  shadow: ShadowValue
  typography: TypographyValue
  fontFamily: FontFamilyValue
  fontWeight: FontWeightValue
  duration: DurationValue
  opacity: OpacityValue
  blur: BlurValue
  tonal: TonalValue
  border: BorderValue
  fontSize: DimensionValue
  letterSpacing: DimensionValue
  lineHeight: RatioValue
  easing: EasingValue
  gradient: GradientValue
  elevation: NoneValue
  ring: NoneValue
  backdrop: NoneValue
  none: NoneValue
}

export type AnyTokenValue = TokenValueSchemaByType[TokenType]

export interface RawTokenValue<T extends TokenType = TokenType> {
  kind: 'raw'
  value: TokenValueSchemaByType[T]
}

export interface AliasTokenValue {
  kind: 'alias'
  by: Id
  refs: Record<string, Id>
}

export interface EscapeTokenValue {
  kind: 'escape'
  raw: string
  note?: string
}

/**
 * Which space a computed COLOUR does its maths in.
 *
 * Wider than `ColorSpace` on purpose: that type is about how a colour LITERAL is spelled, and
 * the surface can only spell four. A perceptual space like Oklab is a legitimate place to do
 * the arithmetic even though no literal is written in it, so narrowing this to ColorSpace
 * would silently move a token's maths to a different space on the way through the file.
 */
export type ComputeSpace = 'srgb' | 'display-p3' | 'oklch' | 'hsl' | 'oklab' | 'lab' | 'lch'

/**
 * One step of a computed value. Two vocabularies in one union, exactly as the IR has them:
 * a colour is lightened and mixed, a measurement is scaled and rounded. Which one applies
 * follows the TOKEN'S TYPE, not a discriminant here.
 *
 * Amounts are 0..1 fractions (the surface writes them as percentages), `degrees` is a hue
 * rotation, and `delta` / `to` are density-independent pixels - the neutral unit, so a step
 * means the same thing on every platform.
 */
export type ComputeOp =
  | { op: 'lighten' | 'darken' | 'saturate' | 'desaturate' | 'alpha'; amount: number }
  | { op: 'rotate'; degrees: number }
  | { op: 'mix'; with: Id; amount: number }
  | { op: 'scale'; factor: number }
  | { op: 'offset'; delta: number }
  | { op: 'round'; to: number }

/**
 * A value DERIVED from another token: "the accent, 20% lighter", "the body size × 1.25".
 *
 * `base` and a `mix` operand are token IDS, like an alias's `refs` - and for the same reason:
 * the canonical AST names tokens, it does not embed anonymous values. An inline literal
 * written in either position is hoisted to a synthesized token by the parser (and printed
 * back as the literal by the emitter), which is the mechanism alias slots already use.
 */
export interface ComputeTokenValue {
  kind: 'compute'
  base: Id
  ops: ComputeOp[]
  /** Colour only; absent means the IR's own default (OKLCH). */
  space?: ComputeSpace
}

export type TokenValue<T extends TokenType = TokenType> =
  RawTokenValue<T> | AliasTokenValue | EscapeTokenValue | ComputeTokenValue

export interface Token<T extends TokenType = TokenType> {
  id: Id
  name: string
  type: T
  value: TokenValue<T>
  description?: string
}

export interface Layer {
  id: Id
  name: string
  order: number
  tokens: Token[]
}

export interface Context {
  id: Id
  name: string
}

export interface ContextGroup {
  id: Id
  name: string
  contexts: Context[]
}

export const TOKEN_VALUE_KIND: Record<
  TokenType,
  | 'color'
  | 'dimension'
  | 'shadow'
  | 'typography'
  | 'fontFamily'
  | 'fontWeight'
  | 'duration'
  | 'opacity'
  | 'blur'
  | 'tonal'
  | 'border'
  | 'ratio'
  | 'easing'
  | 'gradient'
  | 'facet'
> = {
  color: 'color',
  spacing: 'dimension',
  radius: 'dimension',
  size: 'dimension',
  shadow: 'shadow',
  typography: 'typography',
  fontFamily: 'fontFamily',
  fontWeight: 'fontWeight',
  duration: 'duration',
  opacity: 'opacity',
  blur: 'blur',
  tonal: 'tonal',
  border: 'border',
  fontSize: 'dimension',
  letterSpacing: 'dimension',
  lineHeight: 'ratio',
  easing: 'easing',
  gradient: 'gradient',
  elevation: 'facet',
  ring: 'facet',
  backdrop: 'facet',
  none: 'facet',
}
