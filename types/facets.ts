import type { Id } from './ast'

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
  | { block?: Id; inline?: Id }
  | { top?: Id; right?: Id; bottom?: Id; left?: Id }
  | { all: Id }

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

export type StackAxis = 'row' | 'column' | 'layers'

export type AxisIntent =
  | 'fit'
  | 'fill'
  | { weight: number }
  | { fixed: Id }
  | { ratio: { w: number; h: number } }

export interface AxisSize {
  intent: AxisIntent
  min?: Id
  max?: Id
}

export type AxisSizeValue = AxisIntent | AxisSize

export type Distribute = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
export type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline'

export type Position = 'flow' | 'overlay' | { pinned: 'top' | 'bottom' | 'left' | 'right' | 'all' }

export interface LayoutSpec {
  stack?: StackAxis
  grid?: { cols: number; rows: number }
  flow?: boolean

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
