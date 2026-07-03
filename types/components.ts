import type { Id, ParamBinding, PropValue, TypeExpr } from './ast'
import type { FacetMap, LayoutSpec, StateName } from './facets'
import type { CoordEntry, UsesClause } from './prelude'

export interface PropDef {
  id: Id
  name: string
  type: TypeExpr
  default?: PropValue
  required?: boolean
  description?: string

  binding?: string
}

export interface EventDef {
  id?: Id
  name: string

  from?: string
  payload?: TypeExpr
  description?: string
}

export interface Contract {
  params: Record<string, ParamBinding>
  props: PropDef[]
  events: EventDef[]
}

export interface PartState {
  layout?: LayoutSpec
  facets?: FacetMap
}

// A prop-conditioned (and optionally state-scoped) style override — the general
// form of a part's conditional paint (proposal 0025). 1:1 with the editor's
// `StateRule`. `when` absent ⇒ unconditional; `states` empty ⇒ applies in any state.
export interface PartVariant {
  when?: RealizeCond
  states?: StateName[]
  facets?: FacetMap
  layout?: LayoutSpec
}

export interface Part {
  layout?: LayoutSpec
  facets?: FacetMap
  // Pure interaction-state overrides (no prop condition). Retained as sugar; it
  // normalizes to `variants` entries with one state and no `when`.
  states?: Partial<Record<StateName, PartState>>
  // The general prop × state override matrix (proposal 0025).
  variants?: PartVariant[]
}

export type Anatomy = Record<string, Part>

export interface RealizeCond {
  prop: string
  eq: string | number | boolean
}

export interface Wire {
  from: string
  to: string
  arg?: string
  when?: RealizeCond
}

export interface PresentationRealize {
  surface?: string
  place?: string
  flip?: boolean
  matchWidth?: boolean
}

export interface BrowseRealize {
  mode?: string
  orient?: 'horizontal' | 'vertical'
  wrap?: boolean
}

export interface CommitRealize {
  mode: 'explicit' | 'continuous'
  on?: string[]
}

export interface Realization {
  target: string
  when: RealizeCond | null
  presentation?: PresentationRealize
  browse?: BrowseRealize
  commit?: CommitRealize
  surface?: string
  drop?: string[]
  wire?: Wire[]
  note?: string
}

// Component-level behavior composition (the §9 algebra) — proposal 0024. Reuses the
// formal vocabulary from the prelude. Absent on a component ⇒ inherit the archetype's
// canonical composition; present ⇒ overlaid on top of it.
export interface Composition {
  uses: UsesClause[]
  coordination: CoordEntry[]
}

export interface Component {
  id: Id
  name: string
  description?: string
  archetype: string
  contract: Contract
  anatomy: Anatomy
  realize: Realization[]
  composition?: Composition
}
