import type { Id } from './ast'
import type {
  LayoutAlign,
  LayoutDirection,
  LayoutDistribute,
  LayoutWrap,
  LogicalEdge,
} from '../dsl/vocabulary'

export type FacetName =
  | 'fill'
  | 'ink'
  | 'border' // all sides
  | 'border.top'
  | 'border.right'
  | 'border.bottom'
  | 'border.left'
  | 'border.inline-start' // logical (writing-direction) sides
  | 'border.inline-end'
  | 'border.block-start'
  | 'border.block-end'
  | 'corner'
  | 'inset'
  | 'gap'
  | 'text'
  | 'textClamp'
  | 'textWrap'
  | 'weight' // font-weight (typography axis §3)
  | 'font' // font-family (typography axis §3)
  | 'slant' // font-style: normal | italic | oblique (typography axis §3)
  | 'elevation'
  | 'overlay'
  | 'opacity'
  | 'ring'
  | 'backdrop'

export type InsetValue =
  { block?: Id; inline?: Id } | { top?: Id; right?: Id; bottom?: Id; left?: Id } | { all: Id }

export type BorderFacetStyle = 'solid' | 'dashed' | 'dotted'

// A border facet is multi-valued: a width token, a color token, and an optional style
// keyword (any subset). Used by `border` (all sides) and the per-side border facets.
export interface BorderFacetValue {
  width?: Id
  color?: Id
  style?: BorderFacetStyle
}

export type FacetValue =
  | { token: Id }
  | { literal: string | number | boolean }
  | { inset: InsetValue }
  | { border: BorderFacetValue }
  | { raw: string }

export type FacetMap = Partial<Record<FacetName, FacetValue>>

// The layout words are the vocabulary's (proposal 0056): one list, read by the parser, the
// lowering, the printer and the targets, so the AST cannot accept a word the IR cannot hold.
export type StackAxis = LayoutDirection

export type AxisIntent =
  'fit' | 'fill' | { weight: number } | { fixed: Id } | { ratio: { w: number; h: number } }

export interface AxisSize {
  intent: AxisIntent
  min?: Id
  max?: Id
}

export type AxisSizeValue = AxisIntent | AxisSize

export type Distribute = LayoutDistribute
export type Align = LayoutAlign

/** `pinned` and `bleed` name LOGICAL edges (PRELUDE §4, proposal 0003 §2a). */
export type Position = 'flow' | 'overlay' | { pinned: LogicalEdge[] } | { bleed: LogicalEdge[] }

export interface LayoutSpec {
  stack?: StackAxis
  /** Reserved: read and reported, with no target yet (0056 §3.3). */
  grid?: { cols: number; rows?: number }
  /** The `flow` key, an alias of `wrap wrap` (0003 §2b). Read, never written. */
  flow?: boolean
  wrap?: LayoutWrap

  gap?: Id
  inset?: InsetValue
  distribute?: Distribute
  align?: Align

  size?: { width?: AxisSizeValue; height?: AxisSizeValue }
  position?: Position
}

export type StateName =
  | 'pressed'
  | 'hovered'
  | 'focused'
  | 'active'
  | 'selected'
  | 'checked'
  | 'expanded'
  | 'open'
  | 'disabled'
  | 'readonly'
  | 'loading'
  | 'error'
  | 'success'
  | 'invalid'
  | 'valid'
  | 'indeterminate'
  | 'dragging'
  | 'empty'
  | 'complete'
  | 'first'
  | 'last'
  | 'odd'
  | 'even'

export type Capability =
  | 'input.keyboard'
  | 'input.pointer'
  | 'input.touch'
  | 'input.remote'
  | 'input.voice'
  | 'motion.haptic'
  | 'runtime.dynamic-color'
  | 'display.density'
  | 'a11y.screenreader'
  | 'platform.web'
  | 'platform.ios'
  | 'platform.android'
  | 'platform.tvos'
