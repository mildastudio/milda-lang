# milda

The **Milda language** — a platform-neutral design language for describing design
systems and their components, and the canonical AST that tools exchange.

Milda separates *what a component is* (its contract, anatomy, behavior, and
styling intent) from *how any one platform realizes it*. A description written
once can be generated into React, CSS, Figma variables, and — by design — other
targets, without the description itself leaking platform assumptions.

## What's in here

- **AST** (`types/ast.ts`) — the canonical interchange artifact. The spec in
  `docs/dsl/PRELUDE.md` is the normative source of truth; this package is one
  implementation of it.
- **Tokens** (`types/tokens.ts`) — layered, context-aware token values
  (color, dimension, shadow, typography, …) with alias chains and an explicit
  `escape` leaf for values a target can't express natively.
- **Facets, layout, states, capabilities** (`types/facets.ts`) — the
  platform-neutral styling and layout vocabulary.
- **Prelude** (`prelude/preludeV0.ts`) — the standard library expressed as
  data: behavior *atoms*, *archetypes*, facets, states, and capabilities.
- **Engine** (`engine/*`) — pure, side-effect-free semantics over the AST:
  `resolveToken`, `resolveFacets`/`resolveLayout`, `validate`, and `conformance`
  (which reports where a description has holes for a given target).

## Design invariants

- **Platform-neutral by construction.** Facet and token resolution is a pure
  structural merge; nothing here encodes CSS pseudo-classes, DOM tags, or any
  single platform's model. Target-specific lowering lives in the generators, not
  in the language.
- **Honest escape hatches.** Where a value or capability can't be expressed
  cleanly, the model carries an explicit `escape` leaf rather than silently
  approximating — so `conformance` can tell you exactly what won't survive a
  given target.

## Status

`0.x` — the language and AST are still evolving; treat the shape as unstable
until `1.0`.

## License

MIT
