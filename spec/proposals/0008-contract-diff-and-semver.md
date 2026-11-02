# Proposal 0008 - Contract diff & semver derivation

> **Status:** 🟡 Draft · **Targets:** a new `packages/contract` (digest + diff + severity),
> consumed by `packages/release` (version bump derivation, changelog) and the generator CI
> (output-stability gate). Reads `ComponentIR` / `ComponentContract`
> (`packages/core/contract/types.ts`, `packages/core/structure/types.ts`),
> `collectSlots()` (`packages/core/structure/slots.ts`), and the emitted React surface
> (`packages/generate/targets/react`). · **Origin:** "A design partner moves in, version-tracks
> their own system, hits a Milda bug, I fix the generator - and that fix can break their
> consumers. How do I guard against it?" · **Effort:** medium - one pure projection, one
> classified diff, one severity reducer; plus a golden-corpus CI gate.

> **Status check (2026-08-06):** built. `packages/contract/` exists with `digest.ts` and `diff.ts`.
> The status line above predates the implementation.

## 1. Problem

Milda is a compiler: the editor is the front-end, the IR is the IR, the generators are the
back-end (see the product strategy + codegen memos). A consumer of a generated library depends on
the **emitted public surface** - export names, props, events, the compound (slot) API, the
realized value controls, and the parts of styling they can target. Two independent forces move
that surface:

**(a) The author moves it.** They rename a prop, drop an enum value, tighten a slot. This is
deliberate and originates in _their_ IR. The danger is that it ships as an innocent-looking
release and silently breaks their consumers.

**(b) We move it.** A bug report leads us to change the generator. Even a faithful "internal-only"
fix can drift the public surface - `emitStyle` defaults, a handler-prop name, a `.d.ts` shape.
This is the more insidious case: the author did nothing, yet their consumers break on a
regenerate.

Today nothing classifies either move. `ReleaseConfig.version` is a hand-typed string. There is no
IR version, no output-stability gate, no notion of _what counts as breaking_. Before the first
design partner version-tracks a real system on top of Milda, we must make breaking-vs-safe a
**computed, honest** fact - and we are uniquely positioned to, because **the IR already is the
contract**. The escape-hatch doctrine scoped the SSoT to structure + contract + extension points;
this proposal makes that scoping _mechanically enforceable_.

## 2. Change

Introduce a pure, deterministic projection `ComponentIR → ContractDigest` that keeps **only the
public surface** and discards implementation, a `diff` over two digests that yields **classified
changes**, and a `severity` reducer that maps a change set to a semver level. Run the same
machinery on two axes - author moves (IR→IR at a fixed generator) and our moves (generator→
generator at a fixed golden IR corpus) - and take the max.

### 2.1 The contract digest (what is public)

```ts
// packages/contract/digest.ts

export interface ContractDigest {
  components: Record<string, ComponentDigest> // keyed by export name
  themeVars: string[] // sorted emitted CSS custom-property names
}

export interface ComponentDigest {
  exportName: string // ComponentIR.name, PascalCased
  props: Record<string, PropDigest> // keyed by prop name
  events: Record<string, EventDigest> // keyed by handler name (on<Pascal>)
  slots: Record<string, SlotDigest> // keyed by exposed name
  states: string[] // sorted styling-contract state names (§2.5)
}

export interface PropDigest {
  type: CanonicalType // normalized PropType (§2.2)
  required: boolean
  hasDefault: boolean
  polarity: 'in' | 'out' // input prop vs render/callback output (§3)
  binding?: string // archetype bind name, if any
}

export interface EventDigest {
  payload: CanonicalType | null // always 'out' polarity
}

export interface SlotDigest {
  arity: 'single' | 'optional' | 'many' // NodeSlot.arity
  accepts: string // 'content' | `type:${ref}` | `component:${ref}`
  keyedBy?: string
  subContract?: ComponentDigest // slot node's own contract, if present
}
```

The digest is computed **without** node ids, ordering, `origin`, `part`, `locked`, `facets`,
`layout`, `tag`, behavior lowering, or the emitted bytes. Those are implementation (§2.4).

### 2.2 Type canonicalization

`PropType` (the 15-member union in `contract/types.ts`) must be reduced to a `CanonicalType` so
that cosmetic reorderings are not changes:

- `union` / `intersection` members sorted by a stable key, duplicates removed, single-member
  collapsed.
- `enum` values sorted; `literal` carried verbatim.
- `intersection` flattened one level (it is a known TS-leaning leak - see the intersection memo;
  the digest records it but does not try to portably resolve it).
- `ref` carried by name + canonicalized args; the referenced `SharedType` is **inlined by
  reference identity**, so renaming a shared type is a change, editing its internals propagates to
  every user.
- `record` / `array` / `object` / `function` recurse; `object` fields sorted by name.

### 2.3 Slot surface

Slots come from `collectSlots()`, not raw node walking - `exposeAs || node.name` is the public
name, and arity + accepts are the binding facts. A slot node that itself carries a `contract`
contributes a nested `ComponentDigest` (the sub-component's own props/events).

### 2.4 Explicit non-surface (implementation)

Recorded nowhere in the digest, free to change at PATCH:

- `facets` / `layout` and token dereferencing - internal styling.
- `tag` resolution (`resolveTag`/`defaultTagForKind`), DOM nesting, `childrenIds` order.
- node `id`, `origin`, `part`, `locked`.
- behavior **lowering** (`composes` → `overlayManagement`/`clickaway`/`focusTrap`/`scrollLock`).
  The _atom_ (`composes`) is contract via the states/events it `exposes`; the lowered free
  behavior is tunable realization.
- the emitted source bytes themselves.

### 2.5 The styling contract (the one judgment call)

States (`StateName`) surface to consumers as pseudo-classes / `data-` / `aria-` attributes they
can style against - so _some_ of them are an observable contract, but the full per-node `states`
matrix is not. This is a **policy decision, not a derivation**: declare which states are
_guaranteed targetable_ (proposal: the interaction states an attached atom `exposes` - `open`,
`selected`, `checked`, `disabled`, `expanded` - but not layout-pseudo niceties like `odd`/`even`).
Only the guaranteed set enters `ComponentDigest.states`. Likewise the emitted `theme.css`
custom-property _names_ (`--ds-color-accent`, …) are a styling contract for consumer overrides, so
`themeVars` carries the sorted name set - values are free (a theme change, not a code break).

## 3. Semver mapping (polarity is the rule)

The naive "added prop = minor" is a trap. Variance decides: **input** position is contravariant
(what the component _accepts_), **output** position (events, callback/render props) is covariant
(what it _emits_). The same edit flips severity by polarity.

**MAJOR** - consumer code may break:

- remove or rename a prop, event, slot, or export
- optional prop → required
- narrow an **in** type (drop an enum value, `string`→`number`, tighten a `ref`)
- widen an **out** payload (breaks an exhaustive `switch`) or remove an event
- narrow slot arity (`many`→`single`, `optional`→`single`) or tighten `accepts`
  (`content`→`component:X`)
- change `keyedBy`
- drop a guaranteed state or a `themeVars` entry

**MINOR** - additive, backward compatible:

- new **optional** prop (with default)
- widen an **in** type (enum gains a value as _input_)
- new event, new slot, relax slot arity (`single`→`optional`/`many`)
- add a guaranteed state or a `themeVars` entry

**PATCH** - digest identical:

- generator output moves byte-wise, digest unchanged
- styling-token value change not touching the styling contract
- behavior-lowering refinement, emitted-code bug fix with identical signature

> **Soft-break annotation.** Widening an **in** enum is MINOR by convention, but a consumer's
> non-exhaustive `switch` can still break under `strict` TS. The diff flags it
> `softBreak: true` so the changelog can call it out without forcing a MAJOR.

```ts
// packages/contract/diff.ts
export type Severity = 'patch' | 'minor' | 'major'
export interface ContractChange {
  path: string // 'Card.props.variant' | 'Dialog.slots.footer'
  kind: string // 'prop.removed' | 'prop.type.narrowed' | 'slot.arity.relaxed' | …
  severity: Severity
  softBreak?: boolean
  detail: string // human line for the changelog
}
export function diff(a: ContractDigest, b: ContractDigest): ContractChange[]
export function severity(changes: ContractChange[]): Severity // max-reduce
```

## 4. Two version axes

```
Generator version (the Milda compiler)   ← our bug fix bumps this
Library version (@scope/ds)              ← the consumer pins on this
```

The library bump is `max(severity)` over two diffs:

1. **IR-diff** (fixed generator): `digest(IR_old) → digest(IR_new)`. The _author's_ changes. The
   `release` layer derives the next `ReleaseConfig.version` from it and emits the changelog - the
   version is **proposed and justified**, not hand-typed.
2. **Generator-diff** (fixed IR): `digest(emit_vN) → digest(emit_vN+1)` over a **golden IR
   corpus**. _Our_ changes. §5.

## 5. The generator-stability gate (this is what protects the partner)

The risk in case (b) is that the generator function `realized = f(intended)` changes under a
fixed IR. Three layers, increasing precision, run in generator CI on a committed golden corpus
(`packages/contract/corpus/` - representative components exercising every kind, atom, slot shape):

1. **IR digest** - the cheap intended-contract baseline (catches author moves; layer 1 above).
2. **Golden byte-snapshot** of corpus output - trips on _any_ movement. Gate: any diff requires a
   classification commit before release. Catches drift the IR can't see.
3. **Realized-surface extraction** - emit `.d.ts` for the corpus (`tsc --emitDeclarationOnly` or
   API Extractor), build a `ContractDigest` from the _emitted_ surface, and run §3 over
   `vN`→`vN+1`. This is the exact tripwire for "my fix broke a consumer," because the `.d.ts` is
   what consumers actually compile against. It catches surface drift the IR-level digest cannot -
   e.g. an `emitStyle: compound→props` flip leaves the IR identical but changes the realized API.

Consequence: `emitStyle` / `naming` / `forwardRef` / `asChild` are **pinned** in the release
config and never flip under a consumer silently - a change to them is a classified surface change
like any other.

## 6. Why this stays on the north star

- **The IR is already the contract** - the digest is a projection, not a parallel model. Nothing
  new to keep in sync.
- **Platform-neutral** - the digest names props/events/slots/states, never DOM or framework
  detail. The `.d.ts` extraction is React-target-specific _verification_, not the source of truth;
  a second back-end gets its own layer-3 extractor against the same digest shape.
- **Honesty over universality** (the IR-portability memo) - the digest records leaks
  (`intersection`, inline `object`) as-is and lets the diff classify them; it does not pretend
  they are portable.
- **It is the AI-fluency surface too** - a stable, computed contract digest is exactly the schema
  an "AI speaks Milda" story exports (the AI-positioning memo): the same projection that gates
  releases describes the contract to an agent.

## 7. Phasing

1. **Digest + diff + severity** over IR only (`packages/contract`), unit-tested against
   hand-written before/after IR pairs. Wire `release` to _propose_ a version + changelog
   (advisory, non-blocking).
2. **Golden corpus + byte-snapshot gate** in generator CI (layer 2). Make version proposal
   blocking on a clean classification.
3. **Realized `.d.ts` extraction** (layer 3) over the corpus - the precise generator-drift
   tripwire. Add `emitStyle`/`naming`/`forwardRef` to the pinned, surface-classified set.
4. **Styling-contract policy** (§2.5) finalized - guaranteed state set + `themeVars` - once a
   design partner's real override patterns inform which states must be promised.

## 8. Explicitly out of scope

- **No automatic codemod** of consumer code on MAJOR - the diff _describes_ the break and feeds a
  migration note; rewriting consumer call-sites is a separate, later concern.
- **No IR schema version** beyond what 0007's additive-optional-field discipline already gives -
  the digest is the compatibility contract, not the on-disk IR shape.
- **No cross-component dependency graph** - each component's digest is independent; a shared-type
  edit propagates via reference identity (§2.2), not via a global recomputation pass.
