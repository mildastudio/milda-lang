import type { MildaDocumentBase } from './ast'
import type { Capability, FacetName, StateName } from './facets'

export interface AtomParam {
  name: string

  bind?: boolean
}

export interface AtomContextVar {
  name: string
  type?: string
  init?: string
}

export interface AtomStateNode {
  id: string
  initial?: boolean
}

export interface AtomEvent {
  name: string
  args?: string[]
}

export interface Emit {
  event: string
  arg?: string | boolean | number
}

export interface Assignment {
  target: string
  expr: string
}

export type TransitionTarget = string | { expr: string }

export interface Transition {
  from: string
  on?: string
  after?: string
  when?: string
  to?: TransitionTarget
  ctx?: Assignment[]
  emit?: Emit
  do?: string
  note?: string
}

export interface Expose {
  state: string
  when: string
  arg?: string
}

export interface RequiresClause {
  anyOf: Capability[]
  when?: string
}

export interface Atom {
  kind: 'atom'
  name: string
  doc?: string
  requires?: RequiresClause[]
  params?: AtomParam[]
  context?: AtomContextVar[]
  states?: AtomStateNode[]
  events?: AtomEvent[]
  transitions: Transition[]
  exposes?: Expose[]
  emits?: { name: string }[]

  modes?: string[]
  note?: string
}

export type CoordEntry =
  | { kind: 'wire'; from: string; to: string; arg?: string; when?: string }
  | { kind: 'gate'; machine: string; activeWhen: string }
  | { kind: 'broadcast'; set: string; event: string }
  | {
      kind: 'aggregate'
      op: 'all' | 'any' | 'count' | 'first'
      set: string
      pred: string
      as?: string
      then?: string
    }
  | { kind: 'arena'; over: string[]; exclusive: boolean }
  | { kind: 'requiresFail'; gesture: string; failsAfter: string }

export interface UsesClause {
  atom: string
  as: string
  params?: Record<string, string>
}

export interface CompositeBehavior {
  kind: 'composite'
  name: string
  builtFrom: string[]
  uses?: UsesClause[]
  composition?: CoordEntry[]
  // The signals a composite surfaces to its host archetype, the composite-level
  // mirror of an atom's `emits`. A composite is not in `atomsByName`, so without this
  // an archetype whose core signal comes only from a composite (Disclosure →
  // `disclosure`, Wizard → `stepping-nav`) was born with no events (proposal 0034 §B).
  emits?: { name: string }[]
  note?: string
}

export type ArchetypeGroup =
  'Actions' | 'Inputs' | 'Disclosure' | 'Navigation' | 'Collections' | 'Feedback' | 'Media'

export interface ContentCategory {
  level: 'phrase' | 'region'
  interactive: boolean
}

export interface ArchetypeRealize {
  target: string
  when?: string
  surface?: string
  browse?: string
  commit?: 'explicit' | 'continuous'
  drop?: string[]
  wire?: { from: string; to: string; arg?: string }[]
  note?: string
}

export type PartRole = 'container' | 'item' | 'text' | 'control' | 'input' | 'icon' | 'content'

export interface AnatomyPart {
  name: string
  role: PartRole
  optional?: boolean
  children?: AnatomyPart[]
}

export interface ArchetypeDef {
  kind: 'archetype'
  name: string
  group: ArchetypeGroup
  contract: string

  produces: ContentCategory
  anatomy?: AnatomyPart[]
  composes: string[]
  uses?: UsesClause[]
  composition?: CoordEntry[]
  exposes?: Expose[]
  emits?: { name: string; from?: string }[]
  realize?: ArchetypeRealize[]

  realizationNote?: string
}

export interface FacetDef {
  name: FacetName
  covers: string
  divergence?: string
}

export interface StateDef {
  name: StateName
  from: string
}

export interface CapabilityDef {
  name: Capability
  note?: string

  status?: 'aspirational'
}

export interface TaxonomyNote {
  name: string
  note: string
}

export interface PreludeDocument extends MildaDocumentBase {
  kind: 'prelude'
  atoms: Atom[]
  composites: CompositeBehavior[]
  archetypes: ArchetypeDef[]
  facets: FacetDef[]
  states: StateDef[]
  capabilities: CapabilityDef[]

  decorations: TaxonomyNote[]
  nonBehaviors: TaxonomyNote[]
}
