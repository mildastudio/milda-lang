# Proposal 0002 - Facet-vocabulary closure

> **Status:** ✅ Accepted - merged into DSL v0.1 (PRELUDE §3/§10 + GRAMMAR; `typography.milda`
> migrated) · **Targets:** PRELUDE §3 (style facets) + §10
> (AST), GRAMMAR §facetstmt · **Origin:** [`example-radix/FINDINGS.md`](../example-radix/FINDINGS.md)
> §B (Code/Kbd mono, Em italic, Blockquote/TextField edge rule). · **Effort:** 3 facet
> additions + 1 small grammar production. Roadmap item **A2**.

## 1. Problem

The Radix mapping hit three holes in the §3 style-facet vocabulary, all in typography/edges
(FINDINGS §B):

- **No `font` / font-family facet.** The `text` facet bundles _role_ (size/line/tracking) but
  not family; `Code`/`Kbd` (monospace) had to apply `font.mono` as an unblessed token axis.
- **No `slant` / font-style facet.** §3 has `weight` (bundled) and the role bundle, but no
  italic/oblique axis; `Em` applied italic as a render attribute.
- **Per-edge `border` is under-specified.** §3 `border` carries color/width/style but not
  _which edge_; `Blockquote` (inline-start rule) and `TextField` needed edge selection.

A fourth, latent issue surfaced while specifying the above: the dotted facet names §3 already
uses (`text.clamp`, `text.wrap`) **do not parse** under the current grammar - `facetstmt`
keys on a bare `ident`, and `ident` forbids `.`. So the grammar must admit sub-facet names
regardless; this proposal does that once and reuses it for per-edge border.

## 2. Design

Three facet additions + one grammar fix. All token-valued where a value layer exists, keeping
the "no web-specific concepts in core" rule (PRELUDE north star).

### 2a. `font` - font-family (new §3 facet)

Token-valued; token type `font-family` (already in the example foundations: `font/default`,
`font/mono`). `text` stays the _role_ bundle; `font` overrides family orthogonally.

```
font font.mono
```

### 2b. `slant` - font-style axis (new §3 facet)

Enumerated keyword facet: `normal | italic | oblique`. Distinct from `weight`. Decorative,
no token layer needed (it is a typographic mode, like `text.wrap`).

```
slant italic
```

### 2c. `border.<edge>` - per-edge border (extends §3 `border`)

Bare `border` keeps its meaning (all edges). A **sub-facet** addresses one edge using
**logical, cross-platform** edge names - never physical `left/right` in the core:

| edge key                                    | meaning                                  |
| ------------------------------------------- | ---------------------------------------- |
| `border.block-start` / `border.block-end`   | leading / trailing along the block axis  |
| `border.inline-start` / `border.inline-end` | leading / trailing along the inline axis |
| `border.block` / `border.inline`            | both block / both inline edges           |

```
border.inline-start accent.a6      # Blockquote's quote rule
```

Physical edges (`left/right/top/bottom`) are a `realize`-target render detail, not core.

### 2d. `weight` - formalize as a standalone facet (§3 cleanup)

`weight` is already used across the example (`weight weight.medium`) but §3 only lists it as
_bundled into the `text` role_. Formalize it as a standalone token-valued facet (token type
`font-weight`) that overrides the role's weight. Zero new syntax - just an honest §3 entry,
removing a latent inconsistency the same family of findings exposed.

## 3. Grammar delta (GRAMMAR.ebnf)

The one structural change - facet names may carry a sub-key (also legitimizes the existing
`text.clamp` / `text.wrap`):

```ebnf
facetstmt = facetname , value , { value } , [ terminator ] ;   (* was: ident , value , … *)
facetname = ident , [ "." , ident ] ;                          (* v0.1 - facet + optional sub-key *)
```

No change to `value`. `slant`'s keyword (`italic`) is an `ident` value, already legal.

## 4. AST delta (PRELUDE §10)

Facet keys in a part's `facets` map may be **dotted** (`<facet>.<subkey>`), matching the
surface - consistent with how `text.clamp` already appears. New facet value shapes:

```jsonc
"font":  { "token": "<font-family tok.id>" }
"slant": { "raw": "italic" }                       // enum: normal | italic | oblique
"weight":{ "token": "<font-weight tok.id>" }       // formalized standalone
"border.inline-start": { "color": {"token":"…"}, "width": "hairline|thin|thick"?, "style": "…"? }
```

`border.<edge>` carries the same value shape as bare `border`; bare `border` still means
all edges.

## 5. Example impact (the live test)

Mechanical, in `typography.milda`:

- `Code`, `Kbd`: keep `font font.mono` - now a blessed facet (delete the "GAP" notes).
- `Em`: add `slant italic` (delete the render-attribute caveat).
- `Blockquote`: `border accent.a6` → `border.inline-start accent.a6` (delete the edge GAP note).
- `weight weight.*` usages: unchanged - now spec-backed.

No token _values_ change. Net: closes FINDINGS §B (three gaps) and the latent dotted-facet
grammar gap.

## 6. Explicitly out of scope (keeps it bounded)

- **No physical edges in core** - `left/right/top/bottom` stay `realize`-target details.
- **No arbitrary multi-level facet paths** - `facetname` is exactly one optional sub-key
  (`a.b`), not `a.b.c`. Matches every real need (`text.clamp`, `border.inline-start`).
- **No new typographic axes beyond family/slant/weight** - small-caps, optical sizing,
  variable-font axes, etc. are deferred; add per future need, one facet each.
- **`slant` takes no token layer** - it is a mode, like `text.wrap`; if a design system ever
  needs tokenized obliques that is a separate, narrow change.

## 7. Why it's safe for the ecosystem

The parser change is one production (`facetname`) that also fixes existing `text.clamp`
parsing. The generator gains three facet handlers (`font`→family, `slant`→font-style,
`border.<edge>`→edge-scoped border) - all mechanical, all with obvious web realizations. The
lossless-boundary checker is unaffected: a facet is complete iff its value resolves, same as
today.
