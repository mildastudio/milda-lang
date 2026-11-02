# Milda DSL - Prelude (standard library)

> **Prelude 0.0.2** (2026-06-20; 0.0.1 frozen 2026-06-19), co-authored conversationally. The
> surface syntax has its own version (0.7 as of 2026-10-31), recorded in
> [`GRAMMAR.ebnf`](GRAMMAR.ebnf) and [`FORMAT.md`](FORMAT.md) §6. This is the _built-in_
> catalog the language ships with - archetypes, behavior primitives, style/layout
> facets, states, and capabilities. Authors **use** these; they do not define them.
> User-defined archetypes are an escape hatch, not the primary path.
>
> **v0.1 (frozen 2026-06-19):** layers four additive closures on top (marked `v0.1` in
> §0/§3/§4/§7/§8/§10) - prop-bound context groups (0001), facet-vocabulary closure (0002),
> layout-structure closure (0003), first-class slots (0004) - each validated by mapping all
> of Radix Themes (`example-radix/`). The canonical AST now has a normative JSON Schema:
> [`ast.schema.json`](ast.schema.json) (validate with [`validate.js`](validate.js); reference
> instances [`examples/select.json`](examples/select.json), [`examples/v01-features.json`](examples/v01-features.json)).
> Forward plan: [`ROADMAP.md`](ROADMAP.md); per-feature design: [`proposals/`](proposals/).
>
> **Prelude 0.0.2 (2026-06-20):** archetype **anatomy** refined from a flat part-name list to a
> structured tree - each published part carries a semantic **role** and may **nest** (platform-
> neutral; the element/tag is a realization concern, not stored). Additive, prelude-local; all 52
> archetypes populated. [Proposal 0005](proposals/0005-archetype-anatomy.md).
>
> **North star:** a fully abstract, cross-platform descriptor of _any_ design
> system, from which real libraries (web / iOS / Android / …) can be generated.
> No web-specific concepts in the core - platform divergence lives in _realizations_.
>
> **Spec, not engine.** This is a _normative, tool-independent specification_ -
> Milda is meant to be only _one_ implementation; other programs may consume the DSL.
> Consequences: the spec (not `milda/types/*.ts`) is the source of truth; the TS is one
> _binding_. Behavior primitives are defined as **formal state machines** (not prose) so
> behavior cannot drift between implementations. Conformance/completeness is a _language_
> property computable by any tool. The interchange artifact is a **canonical AST**; the
> human syntax in this doc is sugar over it.
>
> **Generation (decided, impl deferred):** hybrid model - a per-platform behavior runtime
> (single source, no drift) + idiomatic generated views for style/layout/markup. Codegen
> targets **web first**; the core still covers every future. Only pursue generation
> mechanics where they _back-react on the language itself_.

---

## 0. Mental model - four layers

1. **Archetype** = an _invariant contract_ (data in/out + intent) + a published
   **anatomy** (named, platform-neutral parts) + a bundle of **behavior primitives**.
   The contract is the identity: same contract ⇒ same archetype, however deep the
   per-platform divergence. Each published part carries a semantic **role** (`container |
item | text | control | input | icon | content`) and may **nest**, so the anatomy is a
   small platform-neutral _tree_, not a flat name list (prelude 0.0.2, proposal 0005); the
   concrete element (HTML tag, native view) is a realization concern, never fixed here. An
   anatomy part may also be a **slot** (v0.1) - a consumer-fillable insertion point with an
   arity and a content contract; the set of slots is the component's composition (children)
   API (§10, proposal 0004).
2. **Realization** = how an archetype/behavior/facet resolves on a concrete target.
   `realize <target> { ... }`. Where a target has no realization, a **substitution**
   rule maps the intent to a different idiomatic control (checkbox → switch on iOS).
3. **Style facets** = an abstract paint vocabulary (not CSS props), token-valued,
   keyed by behavior-emitted **states**.
4. **Tokens** = the value layer (already cross-platform via context dimensions:
   color-scheme, density, brand, **platform**, …).

Realization applies _uniformly_ to behavior **and** style (`elevation` → box-shadow /
tonal-elevation / none). States are **emitted by behaviors**, never CSS pseudo-classes.

---

## 1. Behavior primitives (the atoms)

Each primitive declares what it does, which **states** it contributes, and which
**capabilities** it requires (auto-dropped when the capability is absent).

> **Read the taxonomy in §9 first.** Formalizing the machines showed that about half of the
> entries below are not atoms: `disclosure`, `typeahead`, `dnd`, `resize`, `auto-dismiss`,
> `stepping-nav` and `pressability` are **compositions** of atoms; `motion` and `masking` are
> **decoration layers**; `filter`, `virtualization` and `ordering` are **non-behaviors** (data or
> render). The tables keep every name because archetypes compose by these names; the
> "Atom taxonomy" table at the end of §9 is the authoritative classification, and the language
> package's `preludeV0` carries the same split as `atoms`, `composites`, `decorations` and
> `nonBehaviors`.

### Foundational (cross-cutting)

| primitive    | does                                                                             | emits states | requires |
| ------------ | -------------------------------------------------------------------------------- | ------------ | -------- |
| `activation` | invoke an action + emit event/payload on a trigger (`press\|key\|voice\|hotkey`) | -            | -        |
| `motion`     | animate state-change / `enter` / `exit` / `move` (FLIP, shared-element)          | -            | -        |
| `scheduler`  | timed transition: auto-dismiss, auto-advance, debounce, delay                    | -            | -        |

> `activation` is the foundational atom under almost every interactive archetype -
> `pressability` only contributes _feedback_ states, it does not fire the action.
> `motion` is cross-cutting like style. `scheduler` generalizes the old `auto-dismiss`
> and standardizes the timing/delay parameter scattered across behaviors
> (tooltip open-delay, long-press duration, filter debounce, carousel autoplay).

### Selection & collection

| primitive                                  | does                                                                                 | emits states | requires         |
| ------------------------------------------ | ------------------------------------------------------------------------------------ | ------------ | ---------------- |
| `selection(single\|multiple\|range\|none)` | choose member(s); `range` = extend start..end (date range, shift-click, cell range)  | `selected`   | -                |
| `browse`                                   | move a cursor over a collection (`roving` \| `spatial` \| `tree` \| `scroll-detent`) | `active`     | -                |
| `filter`                                   | narrow a collection by a query                                                       | -            | -                |
| `typeahead`                                | jump to a member by typed prefix                                                     | -            | `input.keyboard` |
| `ordering`                                 | reorder/sort members                                                                 | `dragging`   | -                |
| `virtualization`                           | window a large collection                                                            | -            | -                |

### Presentation & layering

| primitive      | does                                                                          | emits states | requires                          |
| -------------- | ----------------------------------------------------------------------------- | ------------ | --------------------------------- |
| `presentation` | manage a surface (`inline\|popover\|menu\|sheet\|dialog\|push\|wheel`)        | `open`       | -                                 |
| `anchoring`    | position a surface relative to a reference (placement/flip/offset/match-size) | -            | -                                 |
| `dismiss`      | close on `[outside, escape, commit, swipe-down, timeout]`                     | -            | -                                 |
| `focus-scope`  | trap / contain / restore focus within a region                                | -            | `input.keyboard` ‖ `input.remote` |
| `backdrop`     | scrim / blur behind a layer                                                   | -            | -                                 |

### Disclosure & navigation

| primitive      | does                           | emits states         | requires |
| -------------- | ------------------------------ | -------------------- | -------- |
| `toggle`       | flip a boolean                 | `checked`            | -        |
| `disclosure`   | expand/collapse a region       | `expanded`           | -        |
| `navigation`   | switch between destinations    | `selected` (current) | -        |
| `stepping-nav` | ordered progress through steps | `active`, `complete` | -        |

### Input & value

| primitive     | does                                                                                                     | emits states         | requires |
| ------------- | -------------------------------------------------------------------------------------------------------- | -------------------- | -------- |
| `value-entry` | free text/value entry (commit on `change\|blur\|enter`)                                                  | `focused`, `empty`   | -        |
| `range`       | value(s) along a min/max track (single/dual thumb)                                                       | `active`             | -        |
| `stepping`    | increment/decrement a value                                                                              | -                    | -        |
| `validation`  | valid/invalid against rules                                                                              | `invalid`, `valid`   | -        |
| `submission`  | form-level orchestration: collective validation, submit, focus-first-error, dirty/pristine, async submit | `loading`, `invalid` | -        |
| `masking`     | format/constrain entry (date, phone, currency)                                                           | -                    | -        |

### Gesture & motion (touch/native primitives - the real divergence)

| primitive         | does                                                                           | emits states                   | requires                        |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------ | ------------------------------- |
| `pressability`    | press / hover / active feedback (ripple, highlight)                            | `pressed`, `hovered`           | -                               |
| `gesture`         | `swipe \| long-press \| pinch \| pan \| drag`                                  | `dragging`                     | `input.touch` (per gesture)     |
| `momentum-scroll` | inertial scroll with `snap` / `detent`                                         | -                              | -                               |
| `scroll`          | observe scroll position: infinite-load, scroll-spy, reveal-on-scroll, parallax | `atStart`, `atEnd`, `scrolled` | -                               |
| `dnd`             | drag-and-drop move/reorder across containers                                   | `dragging`                     | `input.pointer` ‖ `input.touch` |
| `resize`          | drag-resize a region/panel                                                     | -                              | `input.pointer`                 |

### Status & async

| primitive      | does                                        | emits states                  | requires            |
| -------------- | ------------------------------------------- | ----------------------------- | ------------------- |
| `async-state`  | `idle\|loading\|success\|error` lifecycle   | `loading`, `error`, `success` | -                   |
| `progress`     | determinate / indeterminate completion      | -                             | -                   |
| `auto-dismiss` | self-close after a timeout (toast)          | -                             | -                   |
| `liveness`     | announce dynamic changes (polite/assertive) | -                             | `a11y.screenreader` |

---

## 2. Archetypes (the component intersection)

~50 patterns = the common metszet of the top design systems (anchored on the
WAI-ARIA APG + Radix/React-Aria/Material/HIG/Ant/Chakra). Each lists the behaviors
it composes and the notable per-platform realization/substitution.

### Actions

| archetype      | contract                 | composes                                     | realization / substitution                            |
| -------------- | ------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| `Button`       | label/icon, fires action | `activation`, `pressability`, `async-state?` | Material FAB/elevated/tonal; iOS `.borderedProminent` |
| `ToggleButton` | on/off action            | `toggle`, `pressability`                     | -                                                     |
| `MenuButton`   | opens a menu of actions  | `presentation(menu)`, `browse`, `dismiss`    | -                                                     |
| `Link`         | navigates                | `activation`, `pressability`                 | -                                                     |

> `SegmentedControl` is no longer an archetype (proposal 0022): a segmented control is the same
> one-of-N contract as a radio group, so it is `ChoiceGroup` with the `segmented` realization.

### Inputs

| archetype                   | contract                             | composes                                                              | realization / substitution                                                    |
| --------------------------- | ------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Form`                      | a set of fields, one submit          | `submission`                                                          | -                                                                             |
| `Field`                     | label + control + error/help wrapper | `validation`                                                          | -                                                                             |
| `TextField` / `TextArea`    | string value                         | `value-entry`, `validation?`                                          | -                                                                             |
| `SearchField`               | query string + clear                 | `value-entry`, `filter?`                                              | -                                                                             |
| `BooleanInput`              | one bool                             | `toggle`                                                              | **iOS: checkbox → switch** (no indeterminate)                                 |
| `ChoiceGroup`               | one-of-N                             | `selection.single`, `browse`                                          | iOS: radio → wheel/segmented                                                  |
| `SingleSelect`              | one of a known set                   | `selection.single`, `presentation`, `browse`, `dismiss`, `typeahead?` | web popover-listbox · Android dropdown/dialog · **iOS menu/sheet/push/wheel** |
| `MultiSelect`               | subset of a set                      | `selection.multiple`, `presentation`, `browse`, `dismiss`             | -                                                                             |
| `Combobox`                  | filtered single-select w/ entry      | `value-entry`, `filter`, `selection.single`, `presentation`           | -                                                                             |
| `Slider`                    | value(s) on a range                  | `range`, `gesture(pan)`                                               | -                                                                             |
| `Stepper`                   | number ±                             | `stepping`, `value-entry`                                             | -                                                                             |
| `DatePicker` / `TimePicker` | date/time value                      | `presentation`, `browse`, `masking`                                   | web calendar-grid · **iOS wheel (momentum+detent+haptic)** · Android dialog   |
| `ColorPicker`               | color value                          | `range`(×) , `value-entry`, `presentation`                            | -                                                                             |
| `FileUpload`                | file(s)                              | `gesture(drop)?`, `async-state`                                       | -                                                                             |
| `TagsInput`                 | list of tokens                       | `value-entry`, `selection.multiple`                                   | -                                                                             |
| `Rating`                    | discrete score                       | `selection.single`, `pressability`                                    | -                                                                             |

### Disclosure & overlays

| archetype                    | contract                            | composes                                                     | realization / substitution                        |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| `Disclosure` / `Collapsible` | expand region                       | `disclosure`                                                 | -                                                 |
| `Accordion`                  | group of disclosures (single/multi) | `disclosure`, `selection`                                    | -                                                 |
| `Tabs`                       | switch panels                       | `navigation`, `browse`                                       | mobile: swipe-between; web: no swipe              |
| `Dialog` / `Modal`           | blocking layer                      | `presentation(dialog)`, `focus-scope`, `dismiss`, `backdrop` | **iOS sheet w/ detents**                          |
| `Drawer` / `Sidebar`         | edge-anchored panel                 | `presentation(sheet)`, `dismiss`, `gesture(swipe)?`          | -                                                 |
| `Popover`                    | anchored transient layer            | `presentation(popover)`, `anchoring`, `dismiss`              | -                                                 |
| `Tooltip`                    | hover/focus hint                    | `presentation(popover)`, `anchoring`                         | `requires input.pointer`→ tap/long-press fallback |
| `ContextMenu`                | secondary-action menu               | `presentation(menu)`, `browse`, `dismiss`                    | right-click / long-press                          |

### Navigation

| archetype                | contract                | composes                                          | realization / substitution                          |
| ------------------------ | ----------------------- | ------------------------------------------------- | --------------------------------------------------- |
| `Menu` / `MenuBar`       | hierarchical actions    | `presentation`, `browse`, `typeahead?`, `dismiss` | -                                                   |
| `NavigationBar`          | top-level destinations  | `navigation`                                      | web top-nav · iOS tab-bar · Android bottom-nav/rail |
| `Breadcrumbs`            | path trail              | `navigation`                                      | **iOS: → nav title + back**                         |
| `Pagination`             | page index              | `navigation`, `stepping`                          | -                                                   |
| `Tree`                   | hierarchical collection | `disclosure`, `browse`, `selection`               | -                                                   |
| `Wizard` / `Stepper-nav` | ordered flow            | `stepping-nav`                                    | -                                                   |

### Collections & data

| archetype            | contract                       | composes                                                         | realization / substitution            |
| -------------------- | ------------------------------ | ---------------------------------------------------------------- | ------------------------------------- |
| `List` / `ListBox`   | ordered items, optional select | `browse`, `selection?`, `virtualization?`                        | iOS list: swipe-to-delete (`gesture`) |
| `Table` / `DataGrid` | rows×cols, sort/select         | `selection?`, `ordering`, `browse`, `resize?`, `virtualization?` | -                                     |
| `Carousel`           | paged horizontal items         | `browse`, `momentum-scroll`, `gesture(swipe)`                    | -                                     |
| `Grid`               | 2D arrangement of items        | `browse`, `selection?`                                           | -                                     |

### Feedback & status

| archetype                 | contract                  | composes                                   | realization / substitution                |
| ------------------------- | ------------------------- | ------------------------------------------ | ----------------------------------------- |
| `Toast` / `Snackbar`      | transient message         | `presentation`, `auto-dismiss`, `liveness` | iOS: top banner; Android: snackbar bottom |
| `Alert` / `Banner`        | inline persistent message | `liveness`                                 | -                                         |
| `ProgressBar` / `Spinner` | completion feedback       | `progress`                                 | -                                         |
| `Skeleton`                | loading placeholder       | `async-state`                              | -                                         |
| `Badge` / `Meter`         | numeric/status decoration | -                                          | -                                         |
| `EmptyState`              | no-content placeholder    | -                                          | -                                         |

### Media & content

| archetype     | contract                | composes       | realization / substitution |
| ------------- | ----------------------- | -------------- | -------------------------- |
| `Avatar`      | identity image/initials | -              | -                          |
| `Image`       | bitmap w/ alt + fit     | -              | -                          |
| `Icon`        | vector glyph from a set | -              | -                          |
| `AspectRatio` | ratio-locked box        | (layout facet) | -                          |

> Pure layout helpers (`Stack`, `Grid`, `Box`, `Divider`, `Spacer`) are **layout
> facets / primitives**, not behavioral archetypes - see §4.

---

## 3. Style facets (paint vocabulary)

Token-valued, abstract, cross-platform. Replaces `CSSProp`.

| facet        | covers                                                                                                                                                                            | divergence                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `fill`       | surface/background                                                                                                                                                                | -                                                             |
| `ink`        | text + icon foreground                                                                                                                                                            | -                                                             |
| `border`     | edge: `color` + width (`hairline\|thin\|thick`) + style; bare = all edges, `border.<edge>` = one logical edge (`block-start\|block-end\|inline-start\|inline-end\|block\|inline`) | iOS often overlay-stroke; physical edges are realize-only     |
| `corner`     | corner radius (token role)                                                                                                                                                        | -                                                             |
| `inset`      | internal padding (block/inline)                                                                                                                                                   | -                                                             |
| `gap`        | spacing between children                                                                                                                                                          | -                                                             |
| `text`       | typography **role** (`body\|caption\|title…`) - bundles size/weight/line/tracking                                                                                                 | iOS Dynamic Type = OS-resolved role                           |
| `text.clamp` | truncate to N lines + ellipsis                                                                                                                                                    | web `-webkit-line-clamp` · `.lineLimit` · `maxLines+overflow` |
| `text.wrap`  | `wrap \| nowrap \| break`                                                                                                                                                         | -                                                             |
| `font`       | font-family (token, type `font-family`) - overrides the role's family orthogonally                                                                                                | OS-default stacks vary                                        |
| `slant`      | font-style axis: `normal \| italic \| oblique` (a mode, no token layer)                                                                                                           | -                                                             |
| `weight`     | font-weight (token, type `font-weight`) - overrides the role's bundled weight                                                                                                     | -                                                             |
| `elevation`  | depth                                                                                                                                                                             | **web box-shadow · Android tonal-elevation · iOS none/sheet** |
| `overlay`    | state layer (Material hover/press tint)                                                                                                                                           | Material-specific; web ≈ bg shift                             |
| `opacity`    | transparency                                                                                                                                                                      | -                                                             |
| `ring`       | focus indicator                                                                                                                                                                   | desktop ring · mobile none · tv strong highlight              |
| `backdrop`   | scrim / blur behind layer                                                                                                                                                         | iOS material/vibrancy                                         |

State overrides nest inside a part: `option { selected { fill … } active { … } }`.

**Facet names may carry one sub-key (v0.1)** - `<facet>.<subkey>` (`text.clamp`, `text.wrap`,
`border.inline-start`). Exactly one level; the grammar's `facetname` (proposal 0002) admits
this, which also legitimizes the long-standing `text.*` names.

### Divergent facets resolve through tokens, not `realize`

`elevation`, `ring`, `backdrop` are **abstract facet-token types** sitting one level
above the primitives (`shadow`, `tonal`, `blur`, …). A facet-token is an **alias keyed
by the `Platform` context group**, whose refs may be **cross-type** (web→`shadow`,
android→`tonal`, ios→`none`) because the umbrella type is the abstract facet:

```
token elevation/overlay : elevation = alias by Platform {
  web → shadow/lg ; android → tonal/3 ; ios → none ; default → shadow/md
}
surface { elevation overlay }     # consumer just references the token
```

The generator only needs to emit each _primitive_ per platform (`shadow`→box-shadow,
`tonal`→Material elevation) - mechanical. **Consequence: there is no `realize style`
block - all style/value divergence collapses into token aliasing (§7).**

### Context dimensions & multi-dimensional resolution

`Platform` joins `ColorScheme`/`density`/`brand` as token-context groups. Multiple
active dimensions resolve by **chained single-dimension aliases through the layer
graph** (Base→Semantic→Component), _not_ composite keys (`web+dark` → combinatorial
blow-up). Platform is outermost (picks the primitive/mechanism); color-scheme inner
(picks the value); most-specific wins with `default` fallback at each link.

### Prop-bound context groups (v0.1)

A context group's active value may come **either ambiently (environment/theme) or
per-instance (a prop typed by that group)**; when a prop supplies it, it _shadows_ the
ambient value for that component's subtree. This is the single mechanism behind
prop-driven styling - `variant`, `size`, `color` (per-instance accent override),
`highContrast` - and, applied at the value position, responsive props. The resolution
algorithm above is **unchanged**; this only adds a new _source_ for a dimension's value.

- A prop may be **typed by a context group** (`variant Variant = Solid`); its allowed
  values _are_ the group's contexts (1:1 by name). Tokens that `alias by Variant {…}` then
  resolve from the prop per-instance. A context-typed prop with no default does **not**
  shadow - it inherits the ambient value (so `color Accent` = "override the theme accent
  when set, else inherit").
- A **prop value may itself be context-aliased** (`size = alias by Breakpoint { initial ->
S1; md -> S3 }`) - the same aliasing used for tokens, which is what makes responsive props
  fall out for free (`Breakpoint`'s active context is the viewport).

**Resolution precedence for any `alias by G`:** (1) a prop typed by `G` on the nearest
enclosing component instance, else (2) the ambient/theme value, else (3) `G`'s `default`.
Full design: [`proposals/0001-prop-bound-context-groups.md`](proposals/0001-prop-bound-context-groups.md).

---

## 4. Layout (structure) - the propose/choose model

**Substrate decision:** the abstract layout model is **propose / choose** - parent
proposes available space → child reports the size it wants → parent positions it.
This is what SwiftUI, Compose and Flutter already _are_; CSS flexbox can be
_expressed in_ it but not the reverse. **Consequence: the web is the outlier that
needs `realize` translation, not the default.**

### Containers

| container                    | child flow             | notes                                                                                                |
| ---------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `stack(row\|column\|layers)` | main-x / main-y / z    | the universal container. `layers` draws the children on top of each other, sized to the largest      |
| `flow`                       | wrap when out of space | **convenience macro = `stack` + `wrap`** (v0.1, §8); FlowRow / flex-wrap                             |
| `grid(cols, rows)`           | 2D tracks              | **reserved, not readable** (proposal 0056 §3.3): the word is parsed and reported, no target draws it |

Surface: `layout { stack row }`. A part with no `stack` is not a layout container - the targets
emit no container for it and a native canvas stacks its children as a column.

### Container facets

| facet        | values                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------- |
| `gap`        | spacing between children (token or length)                                                |
| `inset`      | padding: one value for all edges, or `<block> <inline>`                                   |
| `distribute` | main axis: `start\|center\|end\|between\|around\|evenly` (horizontal in a `layers` stack) |
| `align`      | cross axis: `start\|center\|end\|stretch\|baseline` (vertical in a `layers` stack)        |
| `wrap`       | `nowrap\|wrap\|wrap-reverse` (v0.1) - `stack` + `wrap` is the `flow` macro                |

### Child sizing - per-axis intent (replaces `size`/`grow`/`shrink`)

| intent        | meaning                              | web                                                        | SwiftUI                     | Compose       |
| ------------- | ------------------------------------ | ---------------------------------------------------------- | --------------------------- | ------------- |
| `fit`         | size to content (default)            | `fit-content`                                              | ideal size                  | `wrapContent` |
| `fill`        | take all proposed space              | main axis `flex: 1 1 0%` + **`min: 0`**; cross axis `100%` | `frame(maxWidth:.infinity)` | `fillMax`     |
| `weight(n)`   | proportional share of leftover       | `flex: n 1 0%` + `min: 0`                                  | `layoutPriority`+Spacer     | `weight(n)`   |
| `fixed(size)` | explicit dimension (token or length) | width/height                                               | `frame(width:)`             | `size()`      |
| `ratio(w:h)`  | this axis follows the other          | `aspect-ratio`, the axis left `auto`                       | `aspectRatio`               | `aspectRatio` |

- optional `min(size)` / `max(size)` clamps, **set independently per axis**, written after the
  intent they clamp: `size fill min(size.sm) max(size.lg) fit`.
- Surface: `size <width> [<height>]`, or `size width <axis>` / `size height <axis>` to name one
  axis. The `fill` row's `min: 0` is emitted by the web tier (proposal 0056), so it is no longer
  a `realize` detail.

### Position (escape from flow)

`flow` (default) · `overlay` (out of flow, on top of its `layers` stack, placed by the stack's
`align` and `distribute`) · `pinned(edge)` (sticky / safe-area) · `bleed(edge)` (v0.1 - **stays in
flow** but cancels the parent's inset on the named logical edges, extending the child to the edge;
the `Inset` pattern). **Safe-area pinning is native-first** (notch, home indicator, system bars);
web approximates via `env(safe-area-inset)` → `realize`. `bleed`/`pinned` name **logical** edges
(`block-start\|block-end\|inline-start\|inline-end\|block\|inline\|all`), one or more; physical
edges are `realize`-only. Surface: `position overlay`, `position pinned block-start`, `position
bleed inline all`.

### Conditional layout (v0.1)

A part may carry a default `layout {…}` plus prop-conditioned overrides
`layout when <prop>=<value> {…}` - the principled home for a prop-driven **structure** switch
(e.g. `DataList` orientation: a column vs a 2-track grid). Reuses the `when condition` of
`realize`; one condition, default-wins-when-unmatched. Direction (`row`/`column`) and other
facet _values_ that vary by a prop use a propref / `alias by Breakpoint` (§3) instead.

### The residue that must `realize` (the real wall)

- **Baseline alignment** - a word on every target (`align baseline`); composes differently with
  multi-line / mixed sizes, and a static native canvas draws it as `start` and says so.
- **Scroll-container negotiation** - nested-scroll cross-axis sizing diverges. `pinned` is in-flow
  placement on a target that does not scroll.
- **Grid** - `grid(cols, rows)` is reserved (above); `fr`/`minmax`/`auto-fit` web-leaning.
- Text truncation/wrap is **not** here - it moved to the `text` style facet (§3): `text.clamp`, `text.wrap`.
- The **`fill` truncation gotcha** (web needs `min-width:0`) left this list with proposal 0056: the
  web tier emits it.

---

## 5. States (emitted by behaviors)

The full state vocabulary, each contributed by a primitive (§1). No CSS pseudo-classes.

`pressed` `hovered` `focused` `active`(highlighted) `selected` `checked`
`expanded` `open` `disabled` `readonly` `loading` `error` `success`
`invalid` `valid` `indeterminate` `dragging` `empty` `complete`

- collection-position pseudo-states: `first` `last` `odd` `even`

---

## 6. Capabilities (for gating & substitution)

Behaviors and facets gate on capabilities, not platform names - keeps the core clean.

`input.keyboard` `input.pointer`(hover) `input.touch` `input.remote`(tv focus engine)
`input.voice` · `motion.haptic` · `runtime.dynamic-color`(Material You) ·
`display.density` · `a11y.screenreader` · `platform.{web,ios,android,tvos,…}`

---

## 7. Realization & substitution

The surface syntax ([`GRAMMAR.ebnf`](GRAMMAR.ebnf), `realize`) writes one block per target,
inside the component:

```
realize <target> [when <prop>=<value>] {
  presentation <surface> { place …; flip; matchWidth }   # presentation realization
  browse       <mode>                                     # may swap the interaction behavior bundle
  commit       explicit on click enter | continuous { live input; settled change }
  dismiss      outside escape | none
  backdrop     scrim | blur | none
  drop         <atom>, …                                  # behaviors that are meaningless here
  wire         <A.signal> -> <B.action>                   # target-specific coordination
  note         "…"                                        # rationale (e.g. HIG guidance)
}
```

(An earlier draft of this section nested the targets inside one `realize <archetype|behavior|style>`
block; the grammar never did, and the per-target form is what every reader implements.)

**Two realization mechanisms, split by _what_ diverges:**

- **Style / value divergence** (elevation, ring, color, spacing, density…) → **token
  aliasing** over context dimensions (`Platform × ColorScheme × density × brand`),
  resolved by chained aliases through the layer graph (§3). No `realize style` block.
  _Per-instance_ style props (`variant`/`size`/`color`/`highContrast`) are the same
  mechanism via **prop-bound context groups** (§3, v0.1) - still token aliasing, the
  dimension's value just comes from a prop instead of the environment.
- **Behavior / structure divergence** (popover↔wheel, checkbox↔switch, commit-mode) →
  **`realize` block** (below).

Rules:

- **Contract is invariant.** Divergence - however deep (wheel vs listbox) - stays a
  realization of the same archetype. Different contract ⇒ different archetype.
- **`commit-mode`** (`explicit` vs `continuous`) is a first-class realization concept:
  it decides whether `active` (highlight) and `selected` (commit) are distinct or fused.
- **Anatomy = shared core + presentation-specific parts.** `SingleSelect` core
  (`trigger·value·indicator`) is universal; `surface·option·option.check` belong to the
  listbox realization, `cylinder·selection-band` to the wheel realization.

---

## 8. Stress-test findings (behavior-completeness)

Walked all ~50 archetypes both ways - completeness and minimality.

**Added (completeness gaps):** `activation`, `motion`, `scheduler` (§1 Foundational);
`submission` (§1 Input); `selection(range)` mode; `browse(tree)` mode; `Form` + `Field`
archetypes (§2). Also added: `scroll` observation primitive (infinite-load, scroll-spy,
reveal-on-scroll, parallax).

**Redundancies (minimality) - decided (revisable):** kept as first-class convenience
macros; the generator compiles them to their canonical derived form.

- `navigation` ≈ `selection.single` + route-`activation`.
- `stepping-nav` ≈ `navigation`(ordered) + constraint.
- `disclosure` ≈ `toggle(expanded)` + `presentation(inline)`.
- `flow` (layout) ≈ `stack` + `wrap` facet (v0.1, §4 / proposal 0003).

**Boundary validated:** `DataGrid` (hardest composition) fully decomposes; its only
non-mapping aspect - aggregation/grouping math - is correctly _not_ a behavior but data.
Confirms the atoms cover _interaction_, not data transformation.

## 9. Formal semantics - behavior state machines

Atoms are **abstract interaction state machines**, not widgets - this is what makes them
indivisible and drift-proof across _implementations_ (Live work #1). **Batch 1** below
(foundational + selection); batches 2–3 (input/value, gesture/status/nav) pending.

### Notation

```
behavior NAME(params) {
  requires CAP                 # capability gate (auto-drop if absent)
  context f: T = init          # extended state (data beyond finite states)
  states  s0*, s1, …           # * = initial
  events  e, e(arg)            # accepted inputs
  <state|any> on <event> [when g] → <state> [ctx := …] [emit OUT(arg)]
  <state> after <t> → <state> [emit …]     # batch 3: timed transition (fires by itself)
  exposes  STYLE-STATE = predicate     # the §3/§5 states styling keys on
}
```

- `emit` outputs are the **coordination surface** (wired to other machines / public events).
- **Controlled sync** uses a distinct `set` event that updates state _without_ `emit`, so
  external binding updates don't loop back as user actions.
- **Ambient guards:** `enabled` (← `disabled` prop), size-class, token-context are guards
  available to every machine - _not_ atoms. `disabled` is a global gate.
- A **mode** param swaps the _transition function_, not the state shape.

### The 6 foundational atoms (batch 1)

```
activation(payload)                          # transducer (single state)
  states ready*;  events trigger
  ready on trigger when enabled → ready   emit invoke(payload)

toggle(bind v)                               # BooleanInput core (tristate → +mixed)
  states off*, on;  events toggle, set(b)
  off on toggle → on   emit change(true)
  on  on toggle → off  emit change(false)
  any on set(b) → b?on:off                  # controlled sync, no emit
  exposes checked = (state==on)

selection.single(over C)                     # multiple=set; range=anchor+extent
  context sel: C|none = none
  states empty*, chosen
  any    on select(x) when x∈C → chosen [sel:=x]     emit change(x)
  chosen on clear              → empty  [sel:=none]  emit change(none)
  any    on set(x?)            → x?chosen:empty [sel:=x]   # controlled, no emit
  exposes selected(x) = (state==chosen ∧ sel==x)

browse(over C, mode)                         # mode∈{roving,spatial,tree,scroll-detent}
  requires roving|tree → input.keyboard ‖ input.remote
  context active: C|none = none
  on move(dir) → [active := neighbor(active,dir,mode,wrap)]  emit activeChanged(active)
  on to(x)     → [active := x]                               emit activeChanged(x)
  exposes active(x) = (active==x)
  # neighbor(): roving=linear · spatial=2D · tree=in/out/sib · scroll-detent=nearest

presentation(surface)                        # surface∈{inline,popover,menu,sheet,dialog,push,wheel}
  states closed*, open;  events open, close, toggle
  closed on toggle|open  → open    emit opened
  open   on toggle|close → closed  emit closed
  exposes open = (state==open)                # surface is realization-only

dismiss(when:[outside,escape,commit,swipe-down,timeout])   # transducer
  states armed*
  armed on <any configured trigger> → armed   emit dismissRequested
```

### Batch 2 atoms (input & value)

```
value-entry(bind value, commit ⊆ {change,blur,enter})
  context value:V, draft:V = value           # staged value: draft (typing) vs value (committed)
  states idle*, editing
  idle    on focus    → editing
  editing on input(t) → editing [draft:=t] ; when change∈commit: [value:=t] emit change(t)
  editing on enter when enter∈commit → editing [value:=draft] emit change(draft)
  editing on blur     → idle ; when blur∈commit: [value:=draft] emit change(draft) else [draft:=value]
  any     on set(v)   → [value:=v; draft:=v]                 # controlled, no emit
  exposes focused=(state==editing), empty=(value empty), dirty=(draft≠value)

range(bind value, min, max, step, thumbs:1|2)
  context value (or {lo,hi})
  states idle*, dragging
  idle     on grab(t) → dragging [active:=t]
  dragging on to(v)   → dragging [value[active]:=clamp+snap; lo≤hi]  emit change(value)
  dragging on release → idle                                          emit commit(value)   # live vs committed
  idle     on by(t,d) → idle [value[t]:=clamp(…)]                     emit change(value)    # keyboard
  any      on set(v)  → [value:=v]
  exposes active(t)=(state==dragging ∧ active==t)

stepping(bind value, min, max, step)
  any on inc when value+step≤max → [value+=step] emit change(value)
  any on dec when value-step≥min → [value-=step] emit change(value)
  any on set(v) → [value:=clamp(v)]
  exposes atMin=(value≤min), atMax=(value≥max)

validation(of value, rules)                  # PURE - does not listen to input
  context errors:list=[]
  states pristine*, valid, invalid
  any on check → eval(rules) ? valid : invalid [errors:=…]
  any on reset → pristine [errors:=[]]
  exposes invalid, valid, pristine
  emits   validity(state, errors)
  # the `when: change|blur|submit` policy = a wire from value-entry/submission into `check`

submission(over fields)                       # fields: DYNAMIC set of validation machines
  context fields: set<validation>
  states  editing*, submitting, submitted
  derived allValid=all(fields,f→f.valid), firstInvalid=first(fields,f→f.invalid)
  editing    on submit → broadcast fields.check                       # FAN-OUT
                         when allValid → submitting emit submitStart(values)
                         else          → editing     do firstInvalid.focus   # FAN-IN: select + act
  submitting on success → submitted  emit submitSuccess
  submitting on failure → editing    emit submitError(e)
  exposes loading=(state==submitting), dirty=any(fields,f→f.dirty)
```

### Batch 3 atoms (gesture/motion, status/async, navigation, scroll)

```
scheduler(after t, mode: timeout|debounce|interval)
  states idle*, pending
  idle    on arm    → pending
  pending after t   → idle   emit fire           # timed transition
  pending on arm    → pending (restart)           # debounce
  pending on cancel → idle

gesture(kind: swipe|long-press|pinch|pan|drag, thresholds)
  context start, current, t0
  states idle*, tracking, recognized
  idle       on down(p) → tracking [start:=p]
  tracking   on move(p) → tracking [current:=p] ; when exceeds(θ) → recognized emit begin
  tracking   after t (long-press) → recognized emit begin
  tracking   on up      → idle                    # canceled, threshold not met
  recognized on move(p) → recognized emit update(delta)
  recognized on up      → idle emit end

async-state
  states idle*, loading, success, error
  any     on start      → loading  do run
  loading on resolve(v) → success  emit success(v)
  loading on reject(e)  → error    emit error(e)
  exposes loading, success, error

navigation(over dests)
  context stack: list = [root]                    # history stack - shared with undo/redo, wizard-back
  derived current = stack.last
  on go(d)               → [stack.push(d)]         emit navigate(current)
  on back when |stack|>1 → [stack.pop()]           emit navigate(current)
  exposes current(d)=(current==d)

scroll(of region)                                  # observer transducer
  on scrolled(p) → [pos:=p]  emit atEnd when p≥max, nearEnd when p≥max-θ
  exposes atStart, atEnd                           # atEnd → wire → async-state.start = infinite-load
```

### Motion is not an atom - it is a decoration layer

`motion` adds no states; it _decorates existing transitions_ (like style decorates nodes).
Formalizing behaviors as state machines gives motion the precise anchor it lacked:

```
motion on P.closed→open   = spring(300ms)
motion on list.reorder    = flip(200ms)
motion enter/exit surface = fade + slide
```

### Composition algebra

```
uses MACHINE as M
wire <src-event> [when g] → <dst-event>      # 1:1 - one machine's output → another's input
gate <machine> active when <predicate>       # listen only under a condition
# set coordination (batch 2): a parent machine over a dynamic set of sub-machines
broadcast <Set>.<event>                      # fan-out: deliver to every machine in the set
all|any|count(<Set>, m → pred)               # fan-in aggregate (guards / derived)
first(<Set>, m → pred)                       # fan-in select → then act: first(…).focus
# arbitration (batch 3): machines racing for EXCLUSIVE recognition on shared input
arena(over <gestures>) exclusive             # first to recognize wins; cancels the rest
<g1> requires-fail <g2>                       # tuned priority (iOS recognizer-deps, web touch-action)
```

Two kinds of `over`: `selection(over C)` = a _data_ collection (one machine consumes it);
`submission(over fields)` = a _machine_ set (a parent coordinates them). The set-coordination
construct is reused by RadioGroup (toggles), Accordion (disclosures), Table row-select (rows).
**The algebra is complete in three constructs:** point-to-point (`wire`/`gate`) · set ops
(`broadcast`/aggregates) · arbitration (`arena`/`requires-fail`). (Batch 2 called it "closed"
after the first two; batch 3's gesture recognizers reopened it with the third.)

### Validation - SingleSelect (both commit-modes)

```
archetype SingleSelect(options, bind selected) {
  uses activation as A; uses presentation(popover) as P
  uses selection.single(over options) as S
  uses browse(over options, roving) as B; uses dismiss([outside,escape]) as D

  wire A.invoke             → P.toggle
  wire P.opened             → B.to(S.sel ?? first)
  gate D active when P.open
  wire D.dismissRequested  → P.close
  wire option-activate      → S.select(B.active)        # commit-mode: EXPLICIT
  wire S.change when closeOnSelect → P.close

  exposes open=P.open, selected=S.selected, active=B.active
  emits   change = S.change
}
realize ios when style = wheel {
  surface inline-wheel; browse scroll-detent; drop A, D
  wire B.activeChanged → S.select(B.active)            # commit-mode: CONTINUOUS
}
```

**Findings:** (1) `commit-mode` = _which event feeds `selection.select`_ - explicit
(`option-activate`) vs continuous (`activeChanged`); same atoms, one wire + two drops
apart. (2) Transducer atoms (`activation`, `dismiss`) are honest single-state machines.
(3) `closeOnSelect` is a guarded wire, not a behavior field - the old
`OverlayManagement.closeOnSelect` special case dissolves. Notation validated.

### Atom taxonomy (formalization cleanup)

Formalizing revealed that ~half of the §1 "primitives" are not atoms. Four categories:

| category                                    | members                                                                                                                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **True atoms** (indivisible machines)       | `activation` `toggle` `selection` `browse` `presentation` `dismiss` `value-entry` `range` `stepping` `validation` `async-state` `scheduler` `gesture` `navigation` `scroll` `submission` `liveness` `progress` |
| **Compositions** (built from atoms)         | `disclosure`(toggle+presentation) · `typeahead`(scheduler+browse) · `dnd`(gesture+ordering) · `resize`(gesture) · `auto-dismiss`(scheduler) · `stepping-nav`(navigation) · `pressability`(gesture.tap+hover)   |
| **Decoration layers** (decorate, not atoms) | `motion` (transitions) · `masking` (value-entry draft)                                                                                                                                                         |
| **Non-behaviors** (data/render)             | `filter` (derived view) · `virtualization` (render) · `ordering` (collection mutation) · aggregation                                                                                                           |

Corrections to earlier claims: `navigation` is **richer** than `selection.single` + activation
(it carries a history stack, shared with undo/redo). `gesture` + `scheduler` are the two
**load-bearing** atoms - all drag-based and time-based interactions compose from them.
**Result of the full arc:** ~30 listed "primitives" reduce to **~18 true atoms** + a
3-construct coordination algebra. The §1 tables carry a pointer to this classification, and the
language package's `preludeV0` publishes the four lists separately.

## 10. Canonical AST (interchange form)

The **canonical AST** is the normative interchange artifact - the human syntax in this doc
is _sugar_ over it, mapping 1:1 and round-tripping deterministically. Other programs consume
the AST, not the syntax. JSON is the serialization. The AST is formalized by a normative
**JSON Schema** for the `design-system` document - [`ast.schema.json`](ast.schema.json)
(draft 2020-12; v0.1) - runnable via [`validate.js`](validate.js). Reference instances:
[`examples/select.json`](examples/select.json) (v0.0.1 surface) and
[`examples/v01-features.json`](examples/v01-features.json) (exercises every v0.1 shape). The
`prelude` document (the §9 state-machine catalog) is a separate, deferred schema. _Schema
scope note:_ structural shapes are validated strictly; **typed token-value payloads** (raw
values) are intentionally permissive (surface authoring uses both structured and string raw
forms) - per-`type` value schemas are a documented future tightening.

### Conventions

- **Two document kinds:** `"kind":"prelude"` (the stdlib - atoms/archetypes/facets) and
  `"kind":"design-system"` (an authored system). A document declares `"milda"` (language
  version) and `"prelude"` (stdlib version it targets).
- Every node is `kind`/`type`-tagged with a **stable `id`**. References are explicit
  (`{"ref":"id"}` for types, bare token-id strings for token refs).
- **Divergence has two AST shapes, matching the two mechanisms (§7):** value/style →
  token alias (`"value":{"kind":"alias","by":"<contextGroup>","refs":{…}}`); behavior/
  structure → a `realize[]` entry.

### Top-level (design-system document)

```
{ milda, kind:"design-system", prelude, meta,
  foundations:{ contextGroups[], layers[ {tokens[]} ], sharedTypes[] },
  assets:{ folders[], assets[] },
  icons:{ sets[ {prefix, name, provider?, license?, samples?} ],
          icons[ {kind:"set", prefix, name, label?, svg?} | {kind:"custom", name, asset?, label?} ] },
  components[] }
```

### Token value kinds

```
{"kind":"raw","value":<typed value>}                             # self-contained, typed by `type`
{"kind":"alias","by":"<cg.id>","refs":{"<ctx.id>":"<tok.id>", "default":"<tok.id>"}}
{"kind":"escape","raw":"<platform string>","note":"…"}           # leaf escape hatch (partial)
```

**Tokens are typed** (refinement v0.0.1→, vs the original bare-string `raw`): the token's
`type` selects a platform-neutral **value schema** - color = colorspace + channels (not a CSS
string), dimension = density-independent `{value,unit}`, shadow = structured layers, typography
= an abstract role bundle, etc. This keeps the north star honest ("no web-specific concepts in
the core"); codegen renders each typed value to idiomatic platform values. Bare platform
strings are demoted to the `escape` leaf hatch, which auto-marks the node partial for other
targets (§"Generation" #4). Facet-tokens (`type:"elevation"|"ring"|"backdrop"`) are aliases
whose refs may be **cross-type** (web→`shadow`, android→`tonal`, ios→`none`); their only raw
form is `none`. Multi-dimensional resolution = refs that point to tokens which are themselves
aliases `by` another context group (chaining through layers); never composite keys.

### Component (archetype usage)

```
{ id, name, archetype:"<prelude archetype>",
  contract:{ params:{<archParam>:{prop|static}}, props[], events[{name,from:"<machine.event>"}] },
  anatomy:{ <part>:{ layout?, facets?, states?:{<state>:{facets}} } },
  realize[]:{ target, when, presentation?, browse?, commit?, surface?, drop[]?, wire[]? } }
```

- A **facet value** is `{"token":"<tok.id>"}`, `{"raw":"…"}` (escape hatch), or a layout intent.
  Facet **keys may be dotted** (v0.1) - `text.clamp`, `border.inline-start` - exactly one
  sub-key; `slant` takes `{"raw":"italic"}`, `font`/`weight` take a `{"token":…}` (proposal 0002).
- A **part `state`** key is a behavior-exposed state (§9), not a CSS pseudo-class.
- `wire`/`commit`/`drop` mirror the composition algebra and §9 realizations.
- **Component-level composition:** a design-system component may declare its own behavior
  composition (surface `uses`/`wire`/`gate`/`motion`) - serialized as a component
  `"composition":{ "uses":[…], "wire":[…], "gate":[…], "motion":[…] }`. (This was implicit in
  v0.0.1; surfaced and modeled by the B1 schema. Shape is permissive pending formalization.)
- **Slots (v0.1):** a part may carry a `"slot":{ "arity":"single|optional|many",
"accepts":{"kind":"content"} | {"kind":"type","ref":…} | {"kind":"component","ref":…},
"keyedBy"?:"<field>" }` descriptor - a consumer-fillable insertion point. The set of slotted
  parts is the component's composition API (derivable; not duplicated into `contract`).
  Proposal 0004.
- **Layout (v0.1):** a part's `layout` may be an **array** of blocks each optionally carrying
  `"when":{"prop","eq"}` (same shape as `realize[].when`; `when`-less block = default).
  Position values include `{"position":"bleed","edges":[…]}` (logical edges); `wrap`
  (`nowrap|wrap|wrap-reverse`) is a container facet (`flow` lowers to `stack`+`wrap`).
- **Prop-bound context groups (v0.1):** a prop may be typed by a context group -
  `"type":{"kind":"context","group":"<cg.id>"}`; a prop `default` is a value-node
  (`{"kind":"raw",…}` or `{"kind":"alias","by":"<cg.id>","refs":{…}}`, same kinds as token
  values) rather than a bare literal; and the component carries a derivable
  `"contextBindings":[{"group":"<cg.id>","prop":"<prop.id>"}]` so consumers resolve a
  dimension's source without re-walking props. Precedence: prop-bound ≻ ambient ≻ group
  default (§3).

### Prelude AST - state machines as data

Atoms (§9) encode directly; e.g. `toggle`:

```
{ "kind":"atom", "name":"toggle", "params":[{"name":"v","bind":true}],
  "states":[{"id":"off","initial":true},{"id":"on"}],
  "events":[{"name":"toggle"},{"name":"set","args":["b"]}],
  "transitions":[
    {"from":"off","on":"toggle","to":"on","emit":{"event":"change","arg":true}},
    {"from":"on","on":"toggle","to":"off","emit":{"event":"change","arg":false}},
    {"from":"any","on":"set","to":{"expr":"b?on:off"}}
  ],
  "exposes":[{"state":"checked","when":"state==on"}] }
```

Timed transitions add `"after":"<t>"` (no `on`). Coordination entries (`wire`/`gate`/
`broadcast`/aggregate/`arena`) serialize as structured objects under an archetype's
`composition`. This makes the behavioral core itself machine-checkable and
implementation-independent.

An archetype's **published anatomy** (prelude 0.0.2, proposal 0005) serializes as a tree of
parts - platform-neutral, no element/tag:

```
"anatomy":[ { "name":"trigger", "role":"control", "children":[
              {"name":"value","role":"text"}, {"name":"indicator","role":"icon"} ] },
            { "name":"surface", "role":"container", "children":[
              {"name":"option","role":"item","children":[
                {"name":"check","role":"icon","optional":true},
                {"name":"label","role":"text"} ]} ] } ]   # ⇒ SingleSelect
```

`role ∈ container|item|text|control|input|icon|content`; `optional:true` marks an
archetype-optional part. The flattened dotted path (`surface.option.check`) is the stable part
name a component's realization `anatomy` (above) keys by.

### Concrete syntax

The human surface syntax is sugar over the AST, fixed by a formal grammar:
[`GRAMMAR.ebnf`](GRAMMAR.ebnf) (ISO/IEC 14977 EBNF; lexical + design-system surface, each
production annotated with the AST node it desugars to). EBNF is the normative form; an
executable PEG (Peggy/pest) and a tree-sitter grammar are implementation tracks for later.
The same `examples/select.json` in surface syntax:

```
context-group ColorScheme { Light Dark }
context-group Platform   { Web iOS Android }

foundations {
  token shadow/lg : shadow = raw "0 10px 15px rgba(0,0,0,.1)"
  token radius/md : radius = 6px
  token surface/input : color = alias by ColorScheme { Light -> white; Dark -> slate.800; default -> white }
  token elevation/overlay : elevation = alias by Platform {
    Web -> shadow/lg; Android -> tonal/3; iOS -> none; default -> shadow/lg }
}

type Option = object { value: string; label: string; disabled?: boolean }

component Select "Single choice from a known set" {
  archetype SingleSelect
  props { options : array<ref Option>; value : ref Option bind selected; placeholder : string = "Select…" }
  events { change from S.change }

  part trigger {
    layout { stack row; gap space.2; align center; size fill fit }
    fill surface.input; corner radius.md; inset space.2 space.3
    state open     { ring accent }
    state disabled { fill slate.800 }
  }
  part surface { fill surface.raised; corner radius.lg; elevation elevation/overlay }
  part option  { layout { stack row; gap space.2 }
                 state active { fill surface.raised }; state selected { ink accent } }

  realize web { presentation popover { place bottom-start; flip; matchWidth }
                browse roving { orient vertical; wrap }; commit explicit on click enter }
  realize ios when style=wheel { presentation inline-wheel; browse scroll-detent
                commit continuous; drop activation dismiss
                wire B.activeChanged → S.select(B.active) }
}
```

## Decisions log (resolved)

1. **Behavior catalog completeness** - ✅ §8. `scroll` is now a primitive.
2. **Layout** - ✅ §4, propose/choose substrate; per-axis sizing intent.
3. **Token context = platform** - ✅ §3/§7. `Platform` is a context group; divergent
   facets are abstract facet-tokens aliasing cross-type; `realize style` eliminated;
   multi-dim resolves by chained aliases through the layer graph.
4. **Generation** - ✅ decided (top blockquote): hybrid (runtime + idiomatic views),
   web-first, impl deferred. The _lossless boundary_ = "no silent holes": a descriptor
   is complete for target `T` iff every behavior/facet/layout resolves for `T` (or is
   dropped/substituted); else the tool reports the exact hole. A backend = three
   registries (primitive · behavior · layout) + a template. Escape-hatch raw code is
   `realize T`-scoped, leaf-only, and auto-marks the node partial for other targets.

## Live work (the language back-reactions from #4)

1. **Atoms as formal state machines** - ✅ done (§9). All 3 batches formalized; the
   coordination algebra is complete in 3 constructs (`wire`/`gate` · `broadcast`/aggregates
   · `arena`/`requires-fail`); `motion` reclassified as a decoration layer; atom taxonomy
   reduces ~30 "primitives" to ~18 true atoms. **Follow-up:** annotate the §1 tables with
   the taxonomy categories; second backend to validate cross-platform abstractions (#4).
2. **Spec ⟂ implementation** - graduate this doc into the normative spec; `milda/types`
   becomes a binding. Define the **canonical AST** (interchange) with syntax as sugar.
3. **Conformance** - define what "supports Milda DSL core / web pack" means, computable
   by any tool from the descriptor + capability model.
4. **Validation honesty** - web-first codegen cannot prove the cross-platform
   abstractions; keep paper traces (iOS/Android SingleSelect) as proxy validation until a
   second backend exists, so the core isn't over-fit to web.
5. **Facet-token ↔ primitive registry** - formalize (folds into backend definition).
