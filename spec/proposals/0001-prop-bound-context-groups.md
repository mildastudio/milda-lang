# Proposal 0001 - Prop-bound context groups

> **Status:** ✅ Accepted - merged into DSL v0.1 (PRELUDE §3/§7/§10 + GRAMMAR; `example-radix/`
> migrated as the first live test) · **Targets:** PRELUDE §3/§7, GRAMMAR §propdecl,
> AST §10 · **Origin:** [`example-radix/FINDINGS.md`](../example-radix/FINDINGS.md) §A
> (the `variant` problem) + §C (responsive props). · **Effort:** 1 new concept, ~2 grammar
> productions, ~3 AST shapes. The single highest-leverage item on the [roadmap](../ROADMAP.md).

## 1. Problem

The DSL has two value-resolution mechanisms but a gap between them:

- **Ambient context groups** (`ColorScheme`, `Platform`, `density`, `brand`) - a dimension
  whose active value comes from the _environment_. Tokens resolve with `alias by <group>`.
- **Component props** (`enum`/`boolean`/`string`/…) - per-instance _inputs_ to the contract.

Radix Themes' `variant` / `size` / `color` / `highContrast` (and the responsive
`{initial, md, …}` prop form) **drive token/facet resolution**, but their value is supplied
_per-instance, by a prop_ - not ambiently. PRELUDE §7 mandates "no `realize style`; all
style/value divergence collapses into token aliasing over context dimensions," yet context
dimensions today have no way to take their value _from a prop_. The Radix mapping worked
around this by declaring `Variant`/`HighContrast` as context groups whose active value has
**no defined source** - a convention the spec does not bless (FINDINGS §A).

## 2. Design - one concept, two reuses

**A context group's active value may come either ambiently (environment/theme) or
per-instance (a prop typed by that group); when a prop supplies it, it _shadows_ the
ambient value for that component's subtree.** Resolution itself (chained single-dimension
aliasing through the layer graph, §3) is **unchanged** - we only add a new _source_ for a
dimension's active value. Nothing else in the model moves.

This requires extending _where_ the existing context-group + alias machinery applies - in
two small places:

### 2a. A prop may be _typed by_ a context group → per-instance binding

```
context-group Variant { Classic Solid Soft Surface Outline Ghost }

component Button {
  props {
    variant      Variant      = Solid     # prop typed by a context group
    color        Accent                    # no default → falls back to the ambient theme accent
    highContrast HighContrast = Off
    size         Size         = S2
  }
  ...
}
```

- The prop's allowed values **are** the group's contexts (1:1, by name). No separate map.
- Semantics: for an instance, the **active context** for `Variant` = the value of the
  `variant` prop. Tokens that `alias by Variant { … }` (e.g. the shared `variant/*` recipe
  in `foundations.milda`) now have a defined per-instance source.
- `color Accent` with no default means: don't shadow - inherit the ambient `Accent`
  (the theme's `accentColor`). This is exactly Radix's "color overrides theme accent
  per component" semantics, for free.

### 2b. A value may be _context-aliased at the prop level_ → responsive, for free

Responsive props (`size={{ initial:'1', md:'3' }}`) are just **a value resolved `by
Breakpoint`** - the _same_ aliasing used for tokens, applied to a prop value:

```
size Size = alias by Breakpoint { initial -> S1; md -> S3; default -> S1 }
```

`Breakpoint` is an ambient context group (its active context is the viewport). No new
resolver behavior - responsive falls out of mechanism we already have.

> The two reuses are why this is _one_ concept: we did not invent a resolution rule, we
> extended the _type position_ (2a) and the _value position_ (2b) where context groups may
> already appear. The dimension count and the §3 layer-graph algorithm are untouched.

## 3. Resolution precedence (normative)

For a given context group `G` during resolution of any `alias by G`:

1. **Prop-bound (instance):** if the nearest enclosing component instance has a prop typed
   by `G`, its value is the active context. _(shadows everything below)_
2. **Ambient:** else the environment/theme value for `G`.
3. **Group default:** else `G`'s declared `default`.

Most-specific wins, with `default` fallback at each alias link (unchanged from §3).
Multi-dimensional resolution stays chained single-dimension aliases - never composite keys.

## 4. Grammar delta (GRAMMAR.ebnf)

Additive; merges into `§propdecl` on acceptance:

```ebnf
propdecl    = ident , typeexpr , [ "=" , propdefault ] , [ "bind" , ident ] , [ terminator ] ;

propdefault = literal | aliasvalue ;                              (* CHANGED: was `literal` *)
aliasvalue  = "alias" , "by" , ident , "{" , { aliasref } , "}" ; (* NEW; reuses existing `aliasref` *)

typeexpr    = "string" | "number" | "boolean"
            | "enum" , "(" , identlist , ")"
            | "ref" , path
            | "array" , "<" , typeexpr , ">"
            | "object" , "{" , { field } , "}"
            | "union" , "(" , typeexpr , { "," , typeexpr } , ")"
            | "component" , [ "(" , identlist , ")" ]
            | "context" , ident ;                                 (* NEW: prop typed by a context group *)
```

_(Surface choice: a prop typed by a group is written bare - `variant Variant` - desugaring
to `typeexpr = "context", "Variant"`. The leading `context` keyword is the explicit form;
the parser treats a `typeexpr` ident that resolves to a declared context-group as the
sugar.)_

Facet values need **no** change: facets reference tokens, and a token may already be
`alias by Breakpoint`, so facet responsiveness rides through tokens.

## 5. AST delta (PRELUDE §10)

```jsonc
// (i) new type node - a prop typed by a context group
{ "kind": "context", "group": "<cg.id>" }

// (ii) prop default becomes a value-node (was a bare literal), matching token value kinds
"default": { "kind": "raw",   "value": <typed> }
"default": { "kind": "alias", "by": "<cg.id>", "refs": { "<ctx.id>": <typed|tok>, "default": … } }

// (iii) component gains an explicit (derivable) binding list, for generators/checkers
"contextBindings": [ { "group": "<cg.id>", "prop": "<prop.id>" } ]
```

`contextBindings` is derivable from prop types (kind=`context`) but materialized so a
consumer resolves a dimension's source without re-walking the prop list.

## 6. Worked example - Button, before/after

**Before** (current `example-radix/actions.milda` - the unblessed workaround):

```
props { variant enum(classic, solid, soft, surface, outline, ghost) = solid
        color string ; highContrast boolean = false ; size enum(s1,s2,s3,s4) = s2 }
# tokens `alias by Variant {…}` exist, but Variant's active value has no defined source.
```

**After** (this proposal):

```
props { variant Variant = Solid          # drives the Variant dimension per-instance
        color Accent                       # shadows the theme accent when set, else inherits
        highContrast HighContrast = Off
        size Size = S2 }                   # drives a new Size dimension (inset/text/height alias by Size)
# `variant/*`, `accent/*`, size-dependent facet tokens now resolve from these props.
```

This also closes the **size** story (FINDINGS noted size facets - padding/height/font - are
prop-driven too): introduce a `Size { S1 S2 S3 S4 }` group and let size-dependent tokens
(`inset`, `text`, control-height) `alias by Size`, bound by the `size` prop.

## 7. Migration

Mechanical, contingent on acceptance: in `example-radix/*.milda`, rewrite variant/size/
color/highContrast props from `enum(...)`/`boolean`/`string` to their context-group types,
and add a `Size` group + size-aliased facet tokens. No token _values_ change; the `variant/*`
recipe in `foundations.milda` already aliases `by Variant`. Net: deletes the "no defined
source" caveat from FINDINGS §A.

## 8. Explicitly out of scope (keeps it bounded)

- **No new resolution algorithm** - precedence (§3) reuses most-specific-wins + `default`.
- **No composite keys** - multi-dimension stays chained single-dimension aliases.
- **No prop→context value remapping** - prop values must equal the group's contexts 1:1
  (identity). If a future need arises for non-identity maps, that is a separate proposal.
- **No per-component subsetting of the group** - typing a prop `variant Variant` admits the
  _whole_ group; a component that only supports a subset (Radix `Badge` has no `ghost`,
  `Avatar` only `solid|soft`) loses that constraint from the type - it survives only as a
  comment. Surfaced live by the Radix migration (`collections.milda`). A future refinement
  could allow `variant Variant(Solid, Soft)` subset syntax; out of scope here.
- **No render/DOM concerns** - `as`, slots, portals are unrelated (see roadmap items 3–4).

## 9. Why it's safe for the ecosystem

The transpiler/generator already resolve `alias by <group>`; they gain only "this group's
value may come from a prop here" (read `contextBindings`). The parser gains one `typeexpr`
alternative and a value-or-alias default. The conformance/lossless-boundary checker is
unaffected - a prop-bound dimension is complete iff its group resolves, same as ambient.
