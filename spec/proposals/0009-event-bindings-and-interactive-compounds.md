# Proposal 0009 — Event bindings + interactive compounds

> **Status:** 🟢 Implemented (2026-06-24) — Phase A (event firing) shipped + browser-verified;
> Phase B (interactive compound) shipped in generator + editor. Phase B PREVIEW realization
> deferred: the canvas renders the template tree, not the consumer-composed compound projection
> (a synthetic-instance render path with little payoff), so interactive selection is realized in
> generated output, not on the canvas. · **Targets:** `packages/core/structure/types.ts` (node IR),
> a new `packages/core/behavior/compound.ts` (planner, sibling of `behavior/disclosure.ts`),
> `packages/core/behavior/free.ts` (interaction vocabulary), the React generator
> (`packages/generate/targets/react/emit.ts` — `emitCompound` + a shared interaction map),
> the live preview (`apps/studio/components/editor/componentRender.tsx`), and the editor
> Inspector (an "Emits" section + slot role/keyedBy authoring).
> · **Origin:** the generator-↔-editor parity audit (2026-06-24). After per-context theme,
> contract-event typing, and the state/variant→CSS migration, the generator is **at parity with
> everything the editor actually realizes**. The remaining items — firing author-declared events,
> and interactive compounds (Tabs-style `keyedBy` pairing via Context) — are **net-new features**:
> the editor *stores* the data (`EventDef`, `NodeSlot.keyedBy`) but **neither the preview nor the
> generator realizes it**. This proposal designs the model that makes them real on both sides.
> · **Effort:** medium-large — two IR seams + one planner + dual realization (preview + generator)
> + two Inspector sections. Splits cleanly into Phase A (events) and Phase B (compounds).

## 1. Problem

Two declared-but-unrealized surfaces remain after the parity work:

**(a) Author events never fire.** The contract has a separate event channel (`EventDef`,
proposal 0008 / IR-portability memo: bare name + optional payload), and the generator now emits
each as a typed `on<Pascal>` handler prop (parity step 2). But **nothing dispatches them.** There
is no IR model for *what fires an event* — the behavior vocabulary (`free.ts`:
`focusTrap`/`typeahead`/`cursorNavigation`/`clickaway`/`overlayManagement`/`scrollLock`/
`rovingTabindex`/`filter`) has no dispatch concept. The interactive emitters hand-fire the
*controlled-state* callbacks (`onOpenChange`, `onValueChange`), but an author-declared semantic
event (`onSubmit`, `onSelect`, `onClear`) is a dead prop. Same status as `stateBindings`:
stored/typed, realized nowhere.

**(b) Interactive compounds don't compose.** `NodeSlot.keyedBy` (the field that pairs Tabs
`trigger`↔`content` by `value`) is authored in the Inspector and shown in the docs, but
**realized nowhere** — the preview (`componentRender`) draws the full node tree (no compound
projection, no Context), and `emitCompound` emits each slot as a `{children}` shell with no shared
state. So a generated `Tabs` is inert: clicking a tab does nothing. Selection state, the
trigger→panel pairing, and the Context that distributes it are all missing.

The fix follows the established **plan + dual-realization** pattern (`planBehavior` →
`DisclosurePlan`, realized once in `componentRender` for the canvas and once in `emit.ts` for
production, sharing platform-neutral decls from `behavior/disclosure.ts`). We add a neutral IR
model, a planner, and the two realizations — keeping the IR free of React.

## 2. Change — IR

### 2.1 Event emission (`emits`)

A node may declare that it **dispatches a contract event when an abstract interaction occurs**,
optionally carrying a payload:

```ts
// ComponentNode.emits?: EventEmission[]
interface EventEmission {
  id: string
  event: string             // the contract EventDef name (bare) this dispatches
  on: InteractionKind       // the abstract, platform-neutral interaction that triggers it
  payload?: ContentValue    // optional: a literal or a binding (prop / repeat-item path)
}

// Platform-neutral interactions — each target maps them to its own handlers.
type InteractionKind =
  | 'activate'   // primary action (click / Enter / Space)
  | 'change'     // value committed
  | 'input'      // value edited live
  | 'focus' | 'blur'
  | 'select'     // a selection was made (compound/selection contexts)
  | 'open' | 'close' | 'dismiss'  // surface transitions
```

`InteractionKind` is the seam that keeps this honest: the IR never names `onClick`. The web target
maps `activate → onClick` (+ key handling), `change → onChange`, etc.; a future native target maps
`activate → onPress`. The payload reuses `ContentValue` (literal or binding) and the existing
`contentValueExpr`.

### 2.2 Interactive compound — selection + slot roles

Compound interactivity is **not a new state machine** — it is the prelude's existing `selection`
atom (`composes: [{atom:'selection', mode:'single'|'multiple'}]`, proposal 0007) applied across
slots. We add only what pairs slots:

```ts
// NodeSlot (extend):
interface NodeSlot {
  // …existing arity / accepts / keyedBy / exposeAs…
  role?: 'trigger' | 'panel'   // its part in a selectable compound (else plain content)
}
```

- The **selection owner** is the node composing `selection(mode)` (the root, or a tablist node).
  Its selected value is the shared state; `defaultValue`/`value`/`onValueChange` become its props.
- `keyedBy` is the **identity field** carried by both paired slots (e.g. `value`). A `trigger`
  slot SETS the selection to its `keyedBy` value on `activate`; a `panel` slot RENDERS when the
  selection equals its `keyedBy` value.
- Roles can be **inferred** from anatomy `part` (like `planBehavior` infers trigger/surface from
  leaf names) when the component is archetype-seeded; `role` is the explicit override for
  blank-state authoring.

This reuses the data-state CSS selectors added in the parity work: a selected trigger emits
`data-active` / `data-selected`, which **already have CSS meaning** (`targets/css/sheet.ts`
`STATE_SELECTOR`). The compound only has to *set* the attribute; the styling is already generated.

## 3. Realization

### 3.1 A shared interaction map (web target)

`emit.ts` gains one table, the web binding of `InteractionKind` (mirrors `NATIVE_HANDLERS`):

```ts
const INTERACTION_HANDLER: Record<InteractionKind, string> = {
  activate: 'onClick', change: 'onChange', input: 'onInput',
  focus: 'onFocus', blur: 'onBlur', select: 'onClick',
  open: 'onClick', close: 'onClick', dismiss: 'onClick',
}
```

Event emissions compose with any handler the node already carries (overlay trigger `onClick`,
compound trigger `setValue`) by merging into a single arrow. The handler body calls the
already-emitted prop: `onSelect?.(${payloadExpr})`.

### 3.2 Interactive compound — Context (React target only)

`emitCompound` consults a new `planCompound(component)` (in `behavior/compound.ts`, neutral —
returns ids + the value field + per-slot role, no React). When a plan exists:

- **Context** (React-specific, lives only in `emitCompound`):
  `const Ctx = createContext<{ value; setValue }>(…)`.
- **Root**: `const [value, setValue] = useState(defaultValue)` (controllable via `value`/
  `onValueChange`), wraps children in `<Ctx.Provider value={{ value, setValue }}>`; gains
  `value?`/`defaultValue?`/`onValueChange?` props.
- **Trigger sub-component**: `const ctx = useContext(Ctx)`, `onClick={() => { ctx.setValue(value); onValueChange?.(value) }}`,
  `data-active={ctx.value === value ? '' : undefined}` (drives the already-generated `[data-active]` CSS).
- **Panel sub-component**: `const ctx = useContext(Ctx); if (ctx.value !== value) return null` (or
  `hidden` for keep-mounted), then its existing element + `{children}`.

`createContext`/`useContext` are React idioms confined to the React target — the IR and the plan
stay neutral, exactly like `createPortal` is confined today.

### 3.3 Preview (canvas)

`componentRender` already realizes behaviors on the canvas substrate (the `RenderTarget='preview'`
seam). It does NOT project to compound, so it realizes the SAME selection model on the **node
tree**:

- A per-selection-owner value in `RenderCtx` (sibling of the existing `overlayOpen` map).
- A node bound as a trigger (anatomy/role) gets an `onClick` that sets the owner's value; it
  receives `selected`/`active` in `activeUIStates` when it matches (so the state matrix + the
  `[data-active]` paint light up live).
- A node bound as a panel renders only when the owner's value matches its `keyedBy` value.

Event emissions in preview fire into a new `RenderCtx.onEvent(name, payload)` callback — surfaced
as a small "events" read-out so the author *sees* an event fire (the canvas analogue of a console).

## 4. Editor

- **Emits section** (node Inspector, beside Capabilities/Behaviors): add an emission — pick a
  contract event, an `InteractionKind`, and an optional payload (literal or binding). Mirrors the
  existing `EventsPanel`/`BehaviorsSection` row→editor pattern.
- **Slot role + keyedBy**: the slot editor (Inspector, already edits `keyedBy`) gains the `role`
  select; surfaced in `DocumentationPanel` alongside the existing `arity · accepts · keyed by`.
- **Selection owner**: the Capabilities panel already attaches `selection(mode)` (proposal 0007);
  no new UI — the compound planner reads it.

## 5. Build sequence

**Phase A — event firing** (independent, smaller):
1. IR: `EventEmission` + `InteractionKind` on `ComponentNode` (`structure/types.ts`); ops to
   add/update/remove (`structure/ops.ts`).
2. Generator: `INTERACTION_HANDLER` map; merge emissions into element handlers in `emitElement`
   (compose with overlay-trigger `onClick`).
3. Preview: `RenderCtx.onEvent`; attach interaction handlers in `componentRender`.
4. Editor: Inspector "Emits" section.

**Phase B — interactive compound** (depends on selection atom from 0007):
5. IR: `NodeSlot.role`; `planCompound` in `behavior/compound.ts` (neutral plan).
6. Generator: Context-based `emitCompound` interactive path (Root provider + trigger/panel
   consumers); `value`/`defaultValue`/`onValueChange` on the root.
7. Preview: per-owner selection value in `RenderCtx`; trigger click → set, panel match → render,
   trigger match → `selected/active` UI state.
8. Editor: slot `role` select; docs surfacing.

## 6. Platform independence

- The IR additions (`EventEmission` with abstract `InteractionKind`, `NodeSlot.role`, the
  `selection` atom) name **no framework**. `onClick`/`createContext`/`useContext` exist ONLY in the
  React target's binding tables and `emitCompound`. A Vue/web-component target reuses the same
  plan + the same neutral `selection`/`keyedBy`/`role`/`InteractionKind` and supplies its own
  binding (`@click`, `provide`/`inject`; `addEventListener`, a reactive store). This mirrors the
  existing `RenderTarget` (preview/production) and positioning-decls seams. (See
  [[flag-platform-independence-risks]], [[milda-cross-platform-strategy]].)
- The CSS layer added in the parity work is already neutral and already styles the `data-active`/
  `data-selected` states the compound will set — Phase B sets attributes, not styles.

## 7. Non-goals

- Multi-dimensional selection, drag-reorder of panels, animated transitions — later.
- A general data-flow/expression language for payloads beyond literal/binding `ContentValue`.
- Replacing the archetype `planBehavior` (disclosure/select) — `planCompound` is the COMPOUND
  projection of the same intent; the two share role-inference helpers but stay separate planners.
