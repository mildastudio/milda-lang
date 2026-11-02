import type { Id, Metadata, ParamBinding, PropValue, TypeExpr } from './ast'
import type { FacetMap, LayoutSpec, StateName } from './facets'
import type { CoordEntry, UsesClause } from './prelude'

export interface PropDef {
  id: Id
  name: string
  type: TypeExpr
  default?: PropValue
  required?: boolean
  // `required when <predicate>` (proposal 0052 §4): required while a condition over the same
  // contract's OTHER props holds. Prop leaves only.
  requiredWhen?: Predicate
  description?: string

  // A GLOBAL prop (proposal 0051 §5): declared once in the foundations and taken by a component
  // as a reference. The type and default are still carried here - a consumer must not have to
  // resolve a registry to know what the component's API is - so this flag says where they CAME
  // FROM, which is what lets the surface print `global variant` instead of restating them and
  // the editor show one control instead of a form.
  global?: true

  binding?: string

  // Descriptive prop metadata (proposal 0026) - status/since/author, surfaced in the
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

// A constraint over a group of props (proposal 0052 §4): `one-of`, `any-of`, `exclusive`.
export interface PropConstraint {
  kind: 'one-of' | 'any-of' | 'exclusive'
  props: string[]
}

export interface Contract {
  params: Record<string, ParamBinding>
  props: PropDef[]
  events: EventDef[]
  /** Absent when the props block states none. */
  constraints?: PropConstraint[]
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
  | 'set' // truthy - the bare leaf
  | 'unset' // falsy - the `not <leaf>` form

export type Predicate =
  | { kind: 'all'; items: Predicate[] } // AND
  | { kind: 'any'; items: Predicate[] } // OR
  | { kind: 'not'; item: Predicate }
  | { kind: 'cmp'; ref: PredicateRef; op: CompareOp; value?: PropValue }

// A prop-conditioned (and optionally state-scoped) style override - the general
// form of a part's conditional paint (proposal 0025). 1:1 with the editor's
// `StateRule`. `when` absent ⇒ unconditional; `states` empty ⇒ applies in any state.
export interface PartVariant {
  when?: RealizeCond
  // Rich predicate condition (proposal 0032). When present it is the CANONICAL condition
  // and supersedes the flat `when`/`states` - it carries OR / NOT / operators / state·
  // context·ancestor leaves that `RealizeCond` cannot. Emitted by the state-less
  // `when <predicate> { … }` surface block; lowered to `StateRule.when` in the IR.
  whenPredicate?: Predicate
  states?: StateName[]
  facets?: FacetMap
  layout?: LayoutSpec
}

export type PartSlotArity = 'single' | 'optional' | 'many'

export type PartSlotAccepts =
  { kind: 'content' } | { kind: 'type'; ref: string } | { kind: 'component'; ref: string }

/** A design-time-only fill for a slot (never generated): a literal string, a named
 *  example, or a list of either (the multi-item preview of a `many` slot). */
export type PartSlotSample =
  | { kind: 'text'; text: string }
  | { kind: 'example'; example: string }
  | { kind: 'list'; items: PartSlotSample[] }

// A part that is a content slot: a named insertion point consumers fill. Mirrors the
// editor IR's `NodeSlot` (arity + what it accepts); lowered onto the node in the IR.
export interface PartSlot {
  arity: PartSlotArity
  accepts: PartSlotAccepts
  /** The slot a consumer fills when they pass children positionally. */
  default?: boolean
  /** The item field that keys a `many` slot's entries. */
  keyedBy?: string
  /** The public name this slot is exposed under, when it differs from the part name. */
  exposeAs?: string
  /** `trigger` / `panel` - the structural role a disclosure's slot plays. */
  role?: string
  /** Authored doc prose for the slot (proposal 0018), transcluded by the docs page. */
  description?: string
  sample?: PartSlotSample
}

// ─── What a part IS, not only how it is painted (proposal 0041) ───────────────
// Until now a `Part` carried paint (facets/layout/states), a slot and a presence
// predicate - and nothing else. Everything that makes a part a *thing* (its kind, its
// text, its accessible name, the events it emits, what it repeats over, the component it
// instantiates, its transitions) lived only in the editor IR, so an exported file
// described the appearance of a design system and not its behaviour.
//
// These mirror the editor's node model one-to-one and are deliberately declared here
// rather than imported: `@mildastudio/milda` is standalone (see the Predicate note
// above), and the AST→IR adapter lowers each one.

/** A value that is either a literal or BOUND to a prop. Mirrors core's `ContentValue`. */
export type PartValue = { kind: 'value'; value: PropValue } | { kind: 'bind'; prop: string }

/** One conditional leg of a part's text (`when <predicate> -> <value>`). */
export interface PartContentRule {
  when?: Predicate
  value: PartValue
}

/** A part's text content: a fixed string, or a default plus predicate-gated legs. */
export type PartContent =
  | { kind: 'static'; text: string }
  | { kind: 'dynamic'; default: PartValue; rules: PartContentRule[] }

/** Accessible naming (proposal 0013). `labelledBy`/`describedBy` name a part by PATH. */
export interface PartA11y {
  name?: PartValue
  labelledBy?: string
  describedBy?: string
}

/** An event the part raises: `<event> on <interaction> [payload …]`. `event` is a
 *  declared event NAME (the surface never prints an internal event id). */
export interface PartEmit {
  event: string
  on: string
  payload?: PartValue
  signal?: string
  locked?: boolean
}

/** A UI state driven by a prop (`bind state disabled disabled`). */
export interface PartStateBinding {
  state: string
  prop: string
}

export type PartRepeatSource =
  { kind: 'prop'; prop: string } | { kind: 'static'; items: PropValue[] }

/** Repetition over a collection (`repeat items as item`). */
export interface PartRepeat {
  source: PartRepeatSource
  itemAlias: string
}

/** One transition (proposal 0017). `duration`/`easing`/`delay` name TOKENS. */
export interface PartMotionTransition {
  facets?: string[]
  duration: string
  easing?: string
  delay?: string
}

/** A nested component (proposal 0012). `component` is the component NAME. */
export interface PartInstance {
  component: string
  props: Array<{ name: string; value: PartValue }>
}

/** Non-portable, target-specific content (proposal 0041 §4). Quarantined by design: a
 *  reader that does not know `target` must skip it rather than try to interpret it. */
export interface PartForeign {
  code: string
  label?: string
  target?: string
}

export interface PartCell {
  header?: boolean
  scope?: 'col' | 'row'
}

export type PartMediaSample = { kind: 'asset'; asset: string } | { kind: 'url'; url: string }

export type PartMediaSource =
  { kind: 'bind'; prop: string; sample?: PartMediaSample } | { kind: 'static'; asset: string }

/** A free behaviour (proposal 0041 §4): a closed vocabulary of interaction behaviours
 *  (`focus-trap`, `typeahead`, …), each a flat record of scalars and part paths. */
export interface PartBehavior {
  kind: string
  config: Metadata
}

/** The per-archetype configuration surfaces (proposal 0034/0029/0035): `calendar { … }`,
 *  `tabs { … }`, `slider { … }`, … Each block is a flat record of scalars, keyed by the
 *  surface block name; the AST→IR adapter VALIDATES each into its typed shape rather
 *  than casting, because a `.milda` is untrusted input. */
export type PartConfigs = Record<string, Metadata>

export interface Part {
  layout?: LayoutSpec
  facets?: FacetMap
  // What kind of thing the part is (`container`/`text`/`control`/…) - neutral by design;
  // the platform ELEMENT is a target decision, never carried in the file.
  kind?: string
  // Whether the part came from the archetype or the author added it, and whether the
  // editor lets it be edited. Provenance, not paint.
  origin?: 'root' | 'archetype' | 'author'
  locked?: boolean
  content?: PartContent
  a11y?: PartA11y
  emits?: PartEmit[]
  stateBindings?: PartStateBinding[]
  /** The prop this part's value is bound to (an input's `value`). */
  valueBinding?: string
  /** The declared type of the value this part holds. */
  value?: TypeExpr
  repeat?: PartRepeat
  cell?: PartCell
  /** Control realization (proposal 0016): `checkbox` | `switch`. */
  control?: string
  /** Group realization (0022): `radio` | `segmented`. */
  group?: string
  /** Presentation intent (0022 §8): `accessibleName` for an icon-only control. */
  presentation?: string
  /** Media type of a content part: `img` | `video` | `audio` | `embed`. */
  media?: string
  mediaSource?: PartMediaSource
  mediaAlt?: PartValue
  /** Navigation target of a link part - static or prop-bound. */
  destination?: PartValue
  motion?: PartMotionTransition[]
  instance?: PartInstance
  behaviors?: PartBehavior[]
  foreign?: PartForeign
  configs?: PartConfigs
  /** Demo interactions (proposal 0021) - only meaningful inside an `example`. */
  actions?: PartAction[]
  // Content slot (proposal 0004/0011): this part exposes a fill point rather than fixed
  // content. Emitted as a `slot [arity] [of <accepts>]` line inside the part block.
  slot?: PartSlot
  // Conditional presence (proposal 0031/0032) - the node renders only when this predicate
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

// Component-level behavior composition (the §9 algebra) - proposal 0024. Reuses the
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
  // Free-form descriptive metadata (proposal 0026) - status/since/tags/author/…
  meta?: Metadata
  // The library category this component belongs to, as a group PATH (`Forms/Text`).
  // Organisation is authored information: it is what a reader shows as the library's
  // shape, and it carries the author prose the docs transclude (proposal 0041).
  group?: string
}

// ─── Component groups (library organisation) ──────────────────────────────────
// A nestable category, declared by PATH exactly like a token group. Purely
// presentational - never part of any contract - but authored, so the file carries it.
export interface ComponentGroupDecl {
  path: string
  description?: string
}

// ─── Examples: demo scenes (proposal 0021) ────────────────────────────────────
// A contract-less node tree used for preview, thumbnails and docs. Structurally a
// component's anatomy, which is why it reuses `Anatomy` verbatim; `for` binds it to the
// component it demonstrates, and `demo` declares the scene's own state variables.
export interface DemoVariable {
  type: TypeExpr
  initial: PropValue
}

export interface Example {
  name: string
  /** The component NAME this scene demonstrates; absent = a freestanding fixture. */
  for?: string
  description?: string
  demo?: Record<string, DemoVariable>
  anatomy: Anatomy
}

// One demo interaction on a part (`action activate toggle open`): flips or sets a demo
// variable so a scene is live rather than a still.
export interface PartAction {
  on: string
  op: 'set' | 'toggle'
  variable: string
  value?: PropValue
}
