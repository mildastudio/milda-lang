# @mildastudio/milda

The **Milda language** - a platform-neutral design language for describing design
systems and their components, and the canonical AST that tools exchange.

Milda separates _what a component is_ (its contract, anatomy, behavior, and
styling intent) from _how any one platform realizes it_. A description written
once can be generated into React, CSS, Figma variables, and - by design - other
targets, without the description itself leaking platform assumptions.

> This repository is the public, open-source mirror of the `packages/milda`
> package from the Milda monorepo, which stays the single source of truth. See
> [milda.dev](https://milda.dev) for the product and the full DSL documentation.

Try the language in the browser, with live preview of the tokens and components a file
describes, at [play.milda.dev](https://play.milda.dev).

## Install

```bash
npm install @mildastudio/milda
```

```ts
import { preludeV0, validate, resolveToken } from '@mildastudio/milda'
```

## What's in here

- **Spec** (`spec/`) - the normative language: [`PRELUDE.md`](spec/PRELUDE.md)
  (source of truth), [`GRAMMAR.ebnf`](spec/GRAMMAR.ebnf), [`ast.schema.json`](spec/ast.schema.json),
  [`ROADMAP.md`](spec/ROADMAP.md), the language design [`proposals/`](spec/proposals/),
  and `examples/` (validate them with `node spec/validate.js`).
- **AST** (`types/ast.ts`) - the canonical interchange artifact. The spec in
  [`spec/PRELUDE.md`](spec/PRELUDE.md) is the normative source of truth; this package
  is one implementation of it.
- **Tokens** (`types/tokens.ts`) - layered, context-aware token values
  (color, dimension, shadow, typography, ...) with alias chains and an explicit
  `escape` leaf for values a target can't express natively.
- **Facets, layout, states, capabilities** (`types/facets.ts`) - the
  platform-neutral styling and layout vocabulary.
- **Prelude** (`prelude/preludeV0.ts`) - the standard library expressed as
  data: behavior _atoms_, _archetypes_, facets, states, and capabilities.
- **Parser and printer** (`dsl/*`) - the `.milda` reader (`parseMildaDocument`), the closed
  vocabularies every tool imports (`dsl/vocabulary.ts`), and the surface version.
- **Engine** (`engine/*`) - pure, side-effect-free semantics over the AST: `resolveToken`,
  `validate`, and `conformance` (which reports where a description has holes for a given
  target).

## Design invariants

- **Platform-neutral by construction.** Facet and token resolution is a pure
  structural merge; nothing here encodes CSS pseudo-classes, DOM tags, or any
  single platform's model. Target-specific lowering lives in the generators, not
  in the language.
- **Honest escape hatches.** Where a value or capability can't be expressed
  cleanly, the model carries an explicit `escape` leaf rather than silently
  approximating - so `conformance` can tell you exactly what won't survive a
  given target.

## Where it fits

`@mildastudio/milda` is the language layer. The generators and pipeline that
consume it live in the [milda-engine](https://github.com/mildastudio/milda-engine)
repo (`@mildastudio/core`, `@mildastudio/contract`, `@mildastudio/generate`,
`@mildastudio/release`), which depends on this package.

## Status

`0.x` - the language and AST are still evolving; treat the shape as unstable until `1.0`. The
surface syntax is versioned separately (the `milda` line of a file's header) and every change to it is
recorded in [`spec/FORMAT.md`](spec/FORMAT.md) §6. The documentation, including a tour and a
keyword-by-keyword reference held to this parser by tests, is at [milda.dev](https://milda.dev).

## License

MIT
