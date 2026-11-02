# Proposal 0007 - Node-level `composes` + value-typed kinds

> **Status:** 🟡 Draft · **Targets:** `packages/core/structure/types.ts` (node IR),
> `packages/core/behavior/disclosure.ts` (→ a general capability compiler),
> `packages/core/structure/states.ts` (KIND_STATES), the React generator
> (`packages/generate/targets/react`), and the editor's add-node list + Inspector.
> No `milda` language-version bump to the _atom_ vocabulary - the prelude already owns it
> (PRELUDE §9). · **Origin:** "I want to build a design system to completeness, even from an
> empty state" - the node add-list is too thin and the behavior vocabulary is archetype-bound.
> · **Effort:** medium - one IR seam + value field, four new kinds, generalize one planner.

> **Status check (2026-08-06):** built. `composes?: AtomRef[]` is on the node IR in
> `packages/core/structure/types.ts` and is read by `packages/core/behavior/lower.ts`. The status
> line above predates the implementation.

## 1. Problem

We want the guarantee that **any** design-system component is expressible from an empty state.
Today two things block it.

**(a) The behavioral vocabulary is complete - but archetype-bound.** The prelude already
formalizes the whole interaction space: **18 atoms** as state machines (`toggle`, `selection`,
`presentation`, `browse`, `value-entry`, `range`, `stepping`, `dismiss`, `validation`,
`submission`, …), the composites (`disclosure`, `typeahead`, `dnd`, …), and the §9 composition
algebra. Every archetype declares what it `composes` (`Checkbox = ['toggle']`,
`Popover = ['presentation(popover)','anchoring','dismiss']`). **But only archetype-seeded
components reach it**, and only the `disclosure` shape is actually wired (`planBehavior` in
`behavior/disclosure.ts` bails unless `surfaceKindFrom(composes)` matches). An author who starts
from a blank node has no way to say "this node _toggles_" or "this surface _dismisses_". They get
7 coarse `NodeKind`s + 8 hand-wired free behaviors + a manual `states` matrix - and must hope a
generator reverse-engineers intent. That is the platform-dishonest pattern‑matching path
(see [0002 facet-vocabulary-closure] and the escape-hatch doctrine).

**(b) The value-bearing kinds are untyped and incomplete.** `input` is a single coarse kind: it
can't distinguish a boolean toggle from an enum choice from a free string from a bounded number -
yet the atoms already know (`toggle`→bool, `selection`→enum, `range`/`stepping`→number,
`value-entry`→`V`). There is **no read-only value kind** (`output`: progress, meter, status), no
**media typing** (`content` is `img`-only), no **table family**, no **escape seam**, and no
**wrapperless group**.

The fix is not to invent a trait system - it is to **promote the prelude's atom/`composes`
algebra from an archetype annotation to a node-level seam**, and to **value-type** the
value-bearing kinds against the existing contract type system.

## 2. Change

### 2.1 Node-level `composes` (the capability seam)

A node may carry the same `composes` the prelude defines for archetypes - atom references with a
mode and bound params:

```
AtomRef = { atom: AtomName; mode?: string; params?: Record<string, string> }
ComponentNode.composes?: AtomRef[]   // e.g. [{atom:'toggle'}], [{atom:'presentation',mode:'popover'},{atom:'dismiss'}]
```

This makes "checkbox" a _composition_, exactly as the prelude already says: a value kind +
`toggle`. A popover is a `container` + `presentation(popover)` + `anchoring` + `dismiss`. The
add-node list stays **short and platform-neutral** (the base kinds); the richness moves to a
**Capabilities** panel on the node. Each atom carries its own implications - `exposes`d states,
events, required env capabilities - straight from the prelude state machine, so attaching one is
_understood_, not freeform.

> **Terminology:** "capability" already means an _environment_ capability in the prelude
> (`CapabilityDef`: `input.keyboard`, `platform.ios`). The node field reuses the archetype word
> **`composes`** to avoid the collision; the editor surfaces it to authors as "Capabilities".

### 2.2 `planBehavior` → a general capability compiler

`disclosure.ts`'s `planBehavior` is generalized from "match the disclosure shape on an
archetype's `composes`" to "compile a plan from a node's effective `composes`" (archetype-seeded
∪ author-attached). The disclosure plan becomes one case among atoms. Archetype seeding then
_pre-populates_ node `composes` instead of being a separate path - one source of truth, the
empty-state author and the archetype author converge on the same machinery.

### 2.3 Value-typed kinds (reuse the contract type system)

Value-bearing nodes carry an explicit value type, drawn from the existing `PropType`
(bool / enum / number / string / date / color / file - the **extended** set):

```
ValueSpec = { type: PropType; binding?: NodeValueBinding }
ComponentNode.value?: ValueSpec      // on `input` and the new `output`
```

The composed atom refines it (`toggle`⇒bool, `selection`⇒enum, `range`/`stepping`⇒number).
Generator dispatch becomes `kind × value.type × composes × variant → target`:

| value type            | + composes           | web realization                           |
| --------------------- | -------------------- | ----------------------------------------- |
| `boolean`             | `toggle`             | `input[type=checkbox]` · switch (variant) |
| `enum`                | `selection.single`   | radio group · `select` (variant)          |
| `enum`                | `selection.multiple` | checkbox group · multi-select             |
| `number`              | `range`              | `input[type=range]` (slider)              |
| `number`              | `stepping`           | number stepper                            |
| `string`              | `value-entry`        | `input` · `textarea` (variant)            |
| `date`/`color`/`file` | `value-entry`        | typed `input`                             |

checkbox-vs-switch and radio-vs-select are **presentation `variant`s**, never kinds or atoms.

### 2.4 New base kinds

```
NodeKind +=
  | 'output'    // displays a value, non-interactive (progress, meter, status) - mirror of input
  | 'media'     // generalizes today's `content`: img | video | audio | embed (media-type field)
  | 'table' | 'row' | 'cell'   // tabular family; cell carries header/scope
  | 'foreign'   // the declared escape seam: author-supplied raw content (no generation guess)
  | 'fragment'  // wrapperless grouping (renders children, no element)
```

`content` is renamed/subsumed by `media` with a `media: 'img'|'video'|'audio'|'embed'` field
(today's behavior = `media:'img'`). `canAcceptChildren` extends to `fragment`, `table`, `row`,
`cell`. `KIND_STATES` gains entries for `output` (`loading`/`error`/`success`), the table family,
and `foreign`/`fragment` (empty).

## 3. Why this stays on the north star

- **Capabilities are pure semantics.** An atom is a state machine, not a widget; each platform
  realizes it natively (web: real element + role/aria; iOS: `UISwitch`; …). Attaching `toggle`
  is _more_ portable than a `<div role=checkbox>` composition, because the contract is explicit.
- **No web leakage.** `composes` carries _capabilities_ (`dismiss`, `anchoring`), never
  mechanisms (`aria-haspopup`, `tabindex`). aria / native roles / focus order are 100% the
  generator's output - which it can only emit correctly _because_ the capability is declared.
- **Completeness becomes structural, not a chase.** `foreign` guarantees the residual ~20% never
  forks generated code (escape-hatch doctrine); the atom algebra covers the rest.

## 4. Editor UX

- **Add-node list** = the base kinds only (short, neutral) - no widget zoo.
- **Capabilities panel** on each node: toggle atoms on/off; each shows its implied states/events
  and any required env capability. Composing a checkbox = add `input` → set value `boolean` → add
  `toggle`. Composing a popover = add `container` → add `presentation(popover)` + `dismiss`,
  anchor to a trigger.
- **Variant** selector chooses the presentation skin (checkbox vs switch) within a fixed contract.

## 5. Decisions baked in (from the design discussion)

- **Capabilities over per-widget kinds** - composable atoms, not a kind per widget. *(north-star
  - UX: "understand how I compose such an element".)*
- **Table family in scope now** - `table`/`row`/`cell` with header/scope, not deferred.
- **Extended value-types now** - bool/enum/number/string **+ date/color/file**.

## 6. Resolved - atom declares, behavior realizes

`presentation`/`dismiss`/`anchoring` overlap the existing **free behaviors**
(`overlayManagement`, `clickaway`, `focusTrap`, `scrollLock`). **Decision:** the atom is the
authoritative, portable contract (the _what_); the free behavior is its **lowering target** (the
tunable _how_ - placement/offset/event-type/node-wiring), generated by the compiler and
optionally overridden by the author. Consequences:

- **`composes` is the source of truth; `behaviors` becomes derived + override.** The compiler
  emits default behavior configs from a node's atoms; author edits layer on top. Requires a
  **merge rule** (derived default ⊕ override) - a new IR concern.
- **The capability compiler needs a lowering table** - `atom + mode + context → free-behavior
config defaults` (e.g. `presentation(popover)+anchoring → overlayManagement{…}`,
  `dismiss → clickaway{…}`, `browse(roving) → rovingTabindex{…}`). This is the one genuinely new
  spec artifact; write it before §2.2 phase 4.
- **Not everything lowers from an atom.** The prelude's **non-behaviors** (`filter`,
  `virtualization`, `ordering`) and **decorations** (`masking`, `motion`) have no atom above them
  and stay on the data/`repeat` side, untouched.
- **De-risking:** only the overlay family (`presentation`/`dismiss`/`anchoring`) needs this
  bridge. The value layer, `output`/`media`/`foreign`/`fragment`, and non-overlay interactive
  atoms (`toggle`/`selection`/`range`/`stepping`) ship **without** the lowering compiler - so
  phases 1–3 are unblocked; phase 4 alone depends on the table.

## 7. Phasing

1. Value layer - value-type on `input`, new `output`, `content`→`media`. _(cheapest; reuses the
   type system; closes act/edit/display triad.)_
2. `foreign` + `fragment` - early, for the completeness guarantee.
3. Node `composes` seam + generalize `planBehavior` into the capability compiler. Unlocks
   checkbox/radio/switch/slider/accordion/spinner via §2.3.
4. `presentation`/`dismiss`/`anchoring` + anchor relationship (resolve §6 first). Verify against
   free behaviors.
5. Table family.
6. Editor UX (§4) - threaded across all phases.

## 8. Versioning

Prelude atom/`composes` vocabulary: **unchanged** (already normative, §9). Node IR
(`packages/core/structure`): additive - new optional fields (`composes`, `value`, `media`) and
new `NodeKind` members; existing components remain valid (no field is required).

[0002 facet-vocabulary-closure]: ./0002-facet-vocabulary-closure.md
