import type { Id, ParamBinding, PropValue, TypeExpr } from './ast'
import type { FacetMap, LayoutSpec, StateName } from './facets'

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

export interface Part {
  layout?: LayoutSpec
  facets?: FacetMap
  states?: Partial<Record<StateName, PartState>>
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

export interface Component {
  id: Id
  name: string
  description?: string
  archetype: string
  contract: Contract
  anatomy: Anatomy
  realize: Realization[]
}
