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

export type FacetTokenType = 'elevation' | 'ring' | 'backdrop' | 'none'

export type TokenType = PrimitiveTokenType | FacetTokenType

export type ColorSpace = 'srgb' | 'display-p3' | 'oklch' | 'hsl'

export interface ColorValue {
  space: ColorSpace
  channels: number[]
  alpha?: number
}

export type DimensionUnit = 'scaled' | 'fixed' | 'percent' | 'em'

export interface DimensionValue {
  value: number
  unit: DimensionUnit
}

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

export interface FontFamilyValue {
  family: string
  fallback: string[]
  category: FontCategory
  assetId?: Id | null
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

export interface TokenValueSchemaByType {
  color: ColorValue
  spacing: DimensionValue
  radius: DimensionValue
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

export type TokenValue<T extends TokenType = TokenType> =
  | RawTokenValue<T>
  | AliasTokenValue
  | EscapeTokenValue

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
  elevation: 'facet',
  ring: 'facet',
  backdrop: 'facet',
  none: 'facet',
}
