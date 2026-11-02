# Proposal 0006 - Composite tokens (gradients & text styles)

> **Status:** 🚧 Proposed · **Targets:** `@mildastudio/core/foundations` (document model + resolver),
> `@mildastudio/generate` (theme emission), Foundations editor (two new value editors) · **Origin:**
> Foundations design discussion - "what about composited tokens?" (gradients, font/type styles). ·
> **Builds on:** [0004 first-class slots](0004-first-class-slots.md) (the _consumer-fillable_
> slot - unrelated naming), and the layered context-aware token model in
> [`foundations/document.ts`](../../../packages/core/foundations/document.ts).

> **Status check (2026-08-06):** built. `COMPOSITE_TYPES` in
> `packages/core/foundations/document.ts` carries the composite token types. The status line above
> predates the implementation.

## 1. Problem

Every foundation token today is **scalar**: a `Token` of some `type` whose value is a `Slot`
(`{ raw }` or `{ ref }`), optionally `byContext`. That covers color, spacing, radius, font size,
weight, … - anything expressible as one string.

Two essential design-system primitives are **not scalar**:

- **Gradients** - a `linear`/`radial`/`conic` direction plus an _ordered list of color stops_
  (color + position). Not one value; a structure with a variable-length list of sub-values.
- **Text styles** (a.k.a. type styles - Figma "text styles", Material's type scale, Polaris):
  a _named bundle_ of `font-family` + `size` + `weight` + `line-height` + `letter-spacing`. The
  unit a heading/body/caption is, that components reference by name.

Both are first-class foundation citizens in every serious design system. Without them:

- gradients can't exist at all (no facet, no token, no generated var);
- typography is stranded - `fontSize`/`fontWeight` are isolated scalars with nothing binding
  them into reusable styles, so each component would have to re-specify the whole tuple inline
  (loses the single source of truth - the exact failure mode named in the discussion).

## 2. Design - a composite is a token whose value's leaves are `Slot`s

The unifying rule, and the load-bearing decision:

> **A composite token's value is a structure whose leaves are the existing `Slot` atom.**

This is what makes composites _design-system-aware_ rather than dumb literals. Because every leaf
is a `Slot`, we get three behaviours for free, with no new resolution concept:

- **`ref` leaf** → the composite tracks the design system. A gradient built from `accent` →
  `accent-strong` (semantic color tokens) **re-themes automatically** in dark mode, because the
  refs resolve through the existing context-aware engine. Same for a text style referencing
  `fontSize.lg` / `fontWeight.semibold`.
- **`byContext` on the whole value** → an _entirely different_ gradient or text style per context
  (e.g. a flatter gradient in `dark`, a tighter type style in a `compact` density) - falls out of
  the existing `TokenValue = fixed | byContext` shape, since `slots` just holds the composite.
- **`raw` leaf** → the escape hatch for one-offs (an `→ transparent` overlay stop, a bespoke
  brand value) that don't deserve their own token.

Gradients and text styles become **two new `TokenType`s** (`gradient`, `textStyle`). They live in
layers and groups, carry context variation, and are named by the same naming convention as every
other token - they reuse the whole foundation machinery. Only their **value editor** is bespoke
(the scalar swatch/reference popover can't express them).

### 2.1 Gradient stops - `ref` by default, `raw` allowed

A gradient stop's color is itself a `Slot`. The editor surfaces the **token palette first** (push
authors toward refs and the theme-reactivity that buys), with a raw color picker behind a "custom"
affordance. Refs-_only_ was rejected: alpha/`transparent` stops and one-off brand gradients are
common and rarely deserve a promoted token.

> **Related gap (deferred, see §6):** stops frequently want an _alpha variant_ of an existing
> color token (`accent @ 40%`). That argues for a future `{ ref, alpha }` slot modifier, useful
> beyond gradients. Out of scope here; stops can use a `raw` `rgba(...)`/`transparent` meanwhile.

### 2.2 Text styles - atoms stay tokens, the bundle references them

The atoms remain ordinary tokens/registry entries; the text style is the bundle that refs them:

| Field           | Source                                          | Note                                                                                       |
| --------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `family`        | **font registry** (`DocumentFoundations.fonts`) | a _family id_, **not** a token ref - a separate namespace (provenance/license live there). |
| `size`          | `Slot` → `fontSize` token (or raw)              | length token.                                                                              |
| `weight`        | `Slot` → `fontWeight` token (or raw)            | **coupled to family** - see below.                                                         |
| `lineHeight`    | `Slot` → `lineHeight` token (or raw)            | new scale (unitless).                                                                      |
| `letterSpacing` | `Slot` → `letterSpacing` token (or raw)         | new scale (em/px verbatim).                                                                |

This adds two new scalar scales - `lineHeight`, `letterSpacing` - so the bundle has atoms to ref.

**Family↔weight coupling.** A named font ships specific weights (the registry already records
`weights: number[]` per Google font). The weight picker is _informed_ by the selected family's
available weights (snap/warn when a chosen weight isn't shipped), but the field stays a `Slot` for
model consistency - the constraint is editor UX, not an IR change.

## 3. IR delta (`foundations/document.ts`)

`Slot` gains two composite variants; the scalar `raw`/`ref` atom is unchanged, so every existing
value, the resolver's `activeSlot`, and `byContext` keep working verbatim:

```ts
export type Slot =
  | { raw: string }
  | { ref: string }
  | { gradient: GradientValue } // composite - gradient type only
  | { textStyle: TextStyleValue } // composite - textStyle type only

export type GradientKind = 'linear' | 'radial' | 'conic'
export interface GradientStop {
  color: Slot
  position: number
} // color: raw | ref(color)
export interface GradientValue {
  kind: GradientKind
  angle?: number // linear: degrees; conic: from-angle. radial ignores it.
  stops: GradientStop[] // ordered; position 0–100
}

export interface TextStyleValue {
  family: string // FONT REGISTRY id (DocumentFoundations.fonts), NOT a token ref
  size: Slot // ref(fontSize) | raw
  weight: Slot // ref(fontWeight) | raw
  lineHeight: Slot // ref(lineHeight) | raw
  letterSpacing: Slot // ref(letterSpacing) | raw
}
```

`TokenType` extends to include the composites:

```ts
export type TokenType = 'color' | ScaleName | 'gradient' | 'textStyle'
```

New scalar scales (`foundations/scales.ts`, `ScaleName`): `lineHeight`, `letterSpacing`.

**Leaf typing.** Each composite leaf has a _fixed, known_ token type by position - a gradient
stop color is always `color`; `size`→`fontSize`, `weight`→`fontWeight`, `lineHeight`→`lineHeight`,
`letterSpacing`→`letterSpacing`. So `ref` resolution passes the right `type` per leaf with no
ambiguity, reusing `resolveToken` unchanged.

## 4. Resolution & serialization (`facets/resolver.ts`)

Two shapes, because the composites realize differently:

- **Gradient → one CSS string.** `resolveGradient(value, f, ctx)` resolves each stop's color
  `Slot` (via `resolveToken(..., 'color')` for refs) and serializes to
  `linear-gradient(<angle>deg, <c0> <p0>%, …)`. Fits a single `background` value, so it slots into
  the existing `resolveToken → string` path (a `gradient` token resolves to its serialized CSS).
- **Text style → a declaration set.** A text style is _not_ one CSS value; `resolveTextStyle`
  returns `StyleDecl[]` (`fontFamily` via `fontFamilyStack` of the registry entry, `fontSize`,
  `fontWeight`, `lineHeight`, `letterSpacing`). This is its own resolution entry point - callers
  that need a single string (the scalar path) don't apply to text styles.

`slotsEqual` extends to deep-compare the composite variants (so `setTokenSlot`'s collapse-to-fixed
still works when all contexts agree). `activeSlot` is untouched.

## 5. Generator & editor surface

- **`@mildastudio/generate` `themeCss`** - `gradient` tokens emit one custom property
  (`--ds-gradient-<id>: linear-gradient(…)`). `textStyle` tokens emit a _grouped set_
  (`--ds-text-<id>-family|size|weight|line-height|letter-spacing`) since there is no single CSS
  value; the component target composes them (a future `font` shorthand can't carry letter-spacing,
  so per-field vars are the honest emission).
- **Editor** - two bespoke value editors, surfaced as their own concern (the discussion's "separate
  UI, shared mechanism"):
  - **Gradient editor** - kind + angle control, a draggable stop track; per-stop a `Slot` picker
    (token palette first, raw color fallback) and position. Live CSS preview.
  - **Text styles / Typography page** - per style: family (from the registry, with an inline "add
    font" path), and size/weight/lineHeight/letterSpacing pickers that prefer token refs; weight
    informed by the family's shipped weights. Live specimen preview.
  - Both reuse layers/groups/contexts/naming; only the value popover is replaced for these types.

## 6. Explicitly out of scope (keeps it bounded)

- **`{ ref, alpha }` slot modifier** - the alpha-variant-of-a-token idea (§2.1). Real, useful
  beyond gradients, but a separate proposal; `raw` rgba covers the interim.
- **Facet consumption details** - _that_ a `fill` facet may draw from a `gradient` token and a
  `text` facet bundle from a `textStyle` token is the component-side story; this proposal lands the
  **foundation** model, resolver, generator, and editors. The facet-vocabulary wiring (a facet whose
  scale is a union, or a new `surface`/`type` facet) is a focused follow-up.
- **Multi-dimensional composite variation** - a composite leaf may itself `ref` a `byContext`
  token (so multi-dim works through the ref graph, as today); a _composite that is byContext along
  two groups at once_ is not added beyond what the existing `byContext` shape already allows.
- **Gradient colour interpolation hints / colour-space** (`in oklch`, midpoint hints) - `raw`
  stops only for the exotic cases.

## 7. Why it's safe

The `Slot` change is **additive** - two new union members; all scalar code paths (`raw`/`ref`,
`activeSlot`, `byContext`, the migration's `normalizeValue`) are untouched and a document with no
composite tokens is byte-identical. Migration needs no change (new optional token types; old
documents simply have none). The resolver gains two pure functions; `resolveToken`'s scalar
contract is preserved (gradients serialize into it, text styles bypass it). The generator gains two
emission cases gated on token type. The editor changes are isolated to the value-popover dispatch.
