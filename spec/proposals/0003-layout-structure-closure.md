# Proposal 0003 - Layout-structure closure

> **Status:** ✅ Accepted - merged into DSL v0.1 (PRELUDE §4/§8/§10 + GRAMMAR; `layout.milda`
>
> - `collections.milda` migrated) · **Targets:** PRELUDE §4 (layout) + §8
>   (redundancies) + §10 (AST), GRAMMAR §layoutblock · **Origin:**
>   [`example-radix/FINDINGS.md`](../example-radix/FINDINGS.md) §C (Inset edge-bleed;
>   Flex `wrap` / DataList `orientation` container-kind swaps). · **Effort:** 1 position value,
>   1 container facet (reclassification), 1 small grammar production. Roadmap item **A3**.

## 1. Problem

Two §C holes in the layout model, both about _structure_:

- **No edge-bleed position.** `Inset` is a child that stays **in flow** but cancels the
  parent's padding (negative margin) to bleed to the edge. §4's position vocabulary
  `{flow | overlay | pinned(edge)}` has no member for it; `Inset` was escape-hatched.
- **Container-kind isn't prop-selectable.** `Flex` `wrap` "selects a different container"
  (`flow` vs `stack`); `DataList` `orientation` swaps a column for a 2-track grid. Choosing
  the container was a static decl, not a prop-driven choice.

The second hole conflates two different things - one dissolves, one needs a small construct.

## 2. Design - one addition, one reclassification, one construct

### 2a. `bleed(edge)` - a new in-flow position (new §4 position value)

Add `bleed(edge)` to the position vocabulary `{flow | overlay | pinned(edge) | bleed(edge)}`.
`bleed` stays **in flow** (unlike `overlay`) but extends the child past the parent's content
box, cancelling the parent's inset on the named **logical** edges:

| edge arg                                              | cancels parent inset on |
| ----------------------------------------------------- | ----------------------- |
| `all`                                                 | every edge              |
| `block-start` `block-end` `inline-start` `inline-end` | that one edge           |
| `block` `inline`                                      | both edges of that axis |

Surface syntax needs **no grammar change** - `position` is already a facet taking value
tokens, and the grammar is permissive about arity (§GRAMMAR header), so the edge rides as a
second value:

```
position bleed all
position bleed block-start inline      # multiple edges
```

Web realization: negative margin = parent padding on those edges (Radix Inset). Native: the
analogous edge-bleed. Physical edges (`left/right/top/bottom`) stay `realize`-only.

### 2b. `wrap` is a container facet - `flow` becomes a convenience macro

`Flex` `wrap` does **not** pick a different container - flex-wrap / FlowRow is just a `stack`
that wraps. So **`wrap` is a container facet** (`nowrap | wrap | wrap-reverse`) on `stack`,
and the §4 `flow` container is reclassified as a **convenience macro** = `stack` + `wrap`
(joining the §8 list of derived-form macros). Consequence: `Flex`'s `wrap` is an ordinary
facet driven by a prop (via a propref or prop-bound group), with **no container-kind swap**.

```
layout { stack row; wrap wrap; gap space.3 }      # = the old `flow`
```

### 2c. Conditional layout - `layout when <cond>` (the one genuine structure switch)

The residue after 2b is the real stack↔**grid** switch (`DataList` `orientation`): a prop
choosing between _fundamentally different containers_. Model it with a **conditional layout
block**, reusing the exact `when condition` that `realize` already has (GRAMMAR §realize):

```
part root {
  layout { stack column; gap space.3 }                 # default
  layout when orientation=horizontal { grid cols 2 }   # prop-driven structure switch
}
```

First (`when`-less) block = default; `when`-matched block overrides. This is the principled
home for any prop-driven _structure_ change (orientation, a future responsive direction
switch), without a per-prop layout-aliasing mechanism.

## 3. Grammar delta (GRAMMAR.ebnf)

One production - `layoutblock` gains an optional `when` (reusing `condition`):

```ebnf
layoutblock = "layout" , [ "when" , condition ] , "{" , { facetstmt } , "}" ;  (* v0.1 - conditional layout *)
```

`bleed` (2a) and `wrap` (2b) need **no** grammar change - both are facet _values_/_names_
already admitted by `facetstmt`.

## 4. AST delta (PRELUDE §10)

- **Position value** gains `bleed`: a layout/position facet value
  `{"position":"bleed","edges":["all"]}` (edges = logical names).
- **`wrap`** is a container facet: `"wrap":"nowrap|wrap|wrap-reverse"`. `flow` no longer a
  distinct container kind in the AST - it lowers to `stack` + `wrap`.
- **Conditional layout:** a part's `layout` may be an **array** of blocks, each optionally
  carrying `"when":{"prop":"…","eq":"…"}` (same shape as `realize[].when`); the `when`-less
  block is the default. A single object stays valid shorthand for "default only".

## 5. Example impact (the live test)

- `layout.milda` · **Inset**: replace the escape-hatch with `position bleed all` (driven by
  the `side` prop → logical edges); delete the GAP note.
- `layout.milda` · **Flex**: add `wrap <prop>` as a container facet; delete the
  "container-kind swap" note (it's now an ordinary facet).
- `collections.milda` · **DataList**: add `layout when orientation=horizontal { grid cols 2 }`
  to `root`; delete the container-swap note.

No token values change. Net: closes FINDINGS §C (both items) and removes two escape-hatch /
GAP notes.

## 6. Explicitly out of scope (keeps it bounded)

- **No responsive-layout engine** - breakpoint-driven layout is the same `alias by
Breakpoint` value mechanism (0001) applied to facet values / a `layout when`; not a new
  system here.
- **Advanced grid tracks** (`fr`/`minmax`/`auto-fit`/`repeat`) remain documented §4
  `realize` residue - unchanged by this proposal.
- **One condition level** - `layout when <cond>` takes a single `condition` (one prop = one
  value), like `realize`; no boolean combinators.
- **Physical edges stay realize-only** - `bleed` and `pinned` name logical edges in core.

## 7. Why it's safe for the ecosystem

The parser change is one optional `when` on `layoutblock`, reusing the `condition` production
the generator/parser already handle for `realize`. `bleed` and `wrap` are new facet
vocabulary with obvious web realizations (negative margin; `flex-wrap`). The lossless checker
is unaffected - a conditional layout is complete iff each branch's facets resolve.
