import type { Id, Metadata, ParamBinding, PropValue, TypeExpr } from './ast'
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

  // Descriptive prop metadata (proposal 0026) — status/since/author, surfaced in the
  // DSL as inline `@key value` annotations. Never contractual.
  meta?: Metadata
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

// ─── Unified predicate conditions (proposal 0032) ────────────────────────────
// A structured boolean condition tree behind styling (`when`) and node presence
// (`present when`). This mirrors the editor-IR `Predicate` (@mildastudio/core) so the
// surface parser can reconstruct rich conditions the flat `RealizeCond` can't express
// (OR / NOT / nested groups / operators other than equality / state·context·ancestor
// leaves). The `@mildastudio/milda` language package is standalone (it does not depend
// on core), so the type is declared here and lowered to the core shape by the AST→IR
// adapter in `@mildastudio/generate` (targets/dsl/toIr.ts).

// What a predicate leaf tests. `state` names a UI state (boolean); `context` names a
// foundations context-group (its active context id is the value); `ancestor` names an
// ancestor node's UI state; a bare `prop` path (dotted for repeat-item scope) is the default.
export type PredicateRef =
  | { kind: 'prop'; path: string }
  | { kind: 'state'; state: string }
  | { kind: 'context'; group: string }
  | { kind: 'ancestor'; nodeId: string; state: string }

// The comparison operator of a `cmp` leaf. `set`/`unset` carry no value (bare / `not` leaf).
export type CompareOp =
  | 'eq' // =
  | 'ne' // !=
  | 'lt' // <
  | 'lte' // <=
  | 'gt' // >
  | 'gte' // >=
  | 'contains' // contains
  | 'set' // truthy — the bare leaf
  | 'unset' // falsy — the `not <leaf>` form

export type Predicate =
  | { kind: 'all'; items: Predicate[] } // AND
  | { kind: 'any'; items: Predicate[] } // OR
  | { kind: 'not'; item: Predicate }
  | { kind: 'cmp'; ref: PredicateRef; op: CompareOp; value?: PropValue }

// A prop-conditioned (and optionally state-scoped) style override — the general
// form of a part's conditional paint (proposal 0025). 1:1 with the editor's
// `StateRule`. `when` absent ⇒ unconditional; `states` empty ⇒ applies in any state.
export interface PartVariant {
  when?: RealizeCond
  // Rich predicate condition (proposal 0032). When present it is the CANONICAL condition
  // and supersedes the flat `when`/`states` — it carries OR / NOT / operators / state·
  // context·ancestor leaves that `RealizeCond` cannot. Emitted by the state-less
  // `when <predicate> { … }` surface block; lowered to `StateRule.when` in the IR.
  whenPredicate?: Predicate
  states?: StateName[]
  facets?: FacetMap
  layout?: LayoutSpec
}

export type PartSlotArity = 'single' | 'optional' | 'many'

export type PartSlotAccepts =
  | { kind: 'content' }
  | { kind: 'type'; ref: string }
  | { kind: 'component'; ref: string }

// A part that is a content slot: a named insertion point consumers fill. Mirrors the
// editor IR's `NodeSlot` (arity + what it accepts); lowered onto the node in the IR.
export interface PartSlot {
  arity: PartSlotArity
  accepts: PartSlotAccepts
}

export interface Part {
  layout?: LayoutSpec
  facets?: FacetMap
  // Content slot (proposal 0004/0011): this part exposes a fill point rather than fixed
  // content. Emitted as a `slot [arity] [of <accepts>]` line inside the part block.
  slot?: PartSlot
  // Conditional presence (proposal 0031/0032) — the node renders only when this predicate
  // holds. Emitted as a `present when <predicate>` line inside the `part { … }` block;
  // lowered to the node's `presence` field in the IR.
  presence?: Predicate
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
  // Continuous-commit event wiring: the machine event for a live (in-progress) update
  // vs the settled (final) commit, e.g. `commit continuous { live R.change; settled R.commit }`.
  live?: string
  settled?: string
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
  // Overlay realization (proposal 0034): the dismiss trigger set (`outside|escape|
  // closeButton`, empty for a non-dismissable alert) and the backdrop kind. Lowered
  // onto the node's `overlay` config in the IR.
  dismiss?: string[]
  backdrop?: string
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
  // Free-form descriptive metadata (proposal 0026) — status/since/tags/author/…
  meta?: Metadata
}
