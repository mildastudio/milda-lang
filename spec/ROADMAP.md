# Milda DSL - Roadmap

> The path from "describes a Radix-scale design system" (where we are) to "a generator can
> reproduce that system's full interface" (the goal), kept deliberately **finite**. Derived
> from the conformance evidence in [`example-radix/FINDINGS.md`](example-radix/FINDINGS.md):
> mapping all of Radix Themes (49 components, 958 tokens) proved the **behavioral core is
> done** - the open items are a short, enumerable list, almost all _outside_ the behavior model.

## Where we are

The behavior model (atoms + composition algebra + realization, PRELUDE §9) absorbed every
genuinely interactive Radix component **without an escape hatch**. The §2/§9 boundary held:
layout and typography fell out as facets/primitives, and render-plumbing (`Slot`/`Portal`/
`Reset`) correctly didn't map. The one architectural gap inside the component model is
`ScrollArea`'s scrollbar. **The A1–A4 punch-list below is now fully merged into v0.1**, so
for _description_ a Radix-scale system is complete; the work shifts to the ecosystem (B).

## A. Language punch-list - ✅ complete (v0.1)

One large item + four small ones, all merged (proposals 0001–0004). Nothing open-ended.

| #     | item                                                                                                                                              | closes (FINDINGS)                                                                            | status                                                                                                                                        | size                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **1** | **Prop-bound context groups** - a context group's value may come from a prop (shadows ambient); prop values may be context-aliased (⇒ responsive) | §A `variant`, §C responsive props, the `size` facet axis, `color`/`highContrast` overrides   | **✅ merged (v0.1)** - [proposal 0001](proposals/0001-prop-bound-context-groups.md) in PRELUDE §3/§7/§10 + GRAMMAR; `example-radix/` migrated | 1 concept, ~2 grammar prods, ~3 AST shapes |
| 2     | **Facet-vocabulary closure (§3):** add `font` (family), `slant`/italic, per-edge `border`                                                         | §B (Code/Kbd mono, Em italic, Blockquote/TextField edge rule)                                | **✅ merged (v0.1)** - [proposal 0002](proposals/0002-facet-vocabulary-closure.md); also fixed dotted-facet grammar                           | 3 facets + 1 grammar prod                  |
| 3     | **Layout position closure (§4):** add `bleed(edge)`; allow prop-selectable container-kind                                                         | §C (`Inset` edge-bleed, `Flex wrap`→`flow`, `DataList` orientation)                          | **✅ merged (v0.1)** - [proposal 0003](proposals/0003-layout-structure-closure.md); `bleed` + `wrap` facet + conditional `layout when`        | small                                      |
| 4     | **First-class slots** - named anatomy insertion points                                                                                            | §D positional slots; needed for the generator to reproduce Radix's composable component APIs | **✅ merged (v0.1)** - [proposal 0004](proposals/0004-first-class-slots.md); `slot` part statement (arity + content + `keyed-by`)             | medium                                     |
| -     | **ScrollArea scrollbar** - accept as escape-hatch _leaf_ for now                                                                                  | §D the one true partial                                                                      | deferred (revisit with a 2nd backend)                                                                                                         | 0                                          |

**Explicitly NOT in scope** (so the surface stays finite): render plumbing (`Slot`-as-DOM /
`Portal` / `as`) stays in the render/escape layer; data transforms (sort/filter/aggregate)
stay data, not behavior; wide-gamut **P3** is a value-schema extension (`p3` colorspace +
`Gamut` group), not core; part-inheritance is a deferred convenience.

## A′. Post-v0.1 prelude refinements

Additive, prelude-local (the v0.1 _language_ stays frozen):

| #    | item                                                                                                                                                         | driver                                                                | status                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0005 | **Structured archetype anatomy** - `ArchetypeDef.anatomy` from a flat name list to a tree of `{name, role, optional?, children?}` (platform-neutral; no tag) | the v2 visual editor seeds a component's structure from its archetype | **✅ merged (prelude 0.0.2)** - [proposal 0005](proposals/0005-archetype-anatomy.md); PRELUDE §0/§10; all 52 populated. No GRAMMAR/`ast.schema` change (prelude grammar/schema deferred) |

> **Status (2026-11-01):** everything below is built. The language's forward plan now lives in
> the numbered proposals (`proposals/` here for 0001-0009, and the product repository's
> `docs/dsl/proposals/` for 0010 onward, with a verified status table in its README). This file is
> kept as the record of how the language reached v0.1 and what was decided then.

## B. Ecosystem-readiness (the generator/tooling, NOT new language features)

The transpiler, syntax highlighter, docs, and generator all depend on **frozen, formal
artifacts** - not on more language capability. In dependency order:

| #   | artifact                                                                                                                 | unblocks                             | notes                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **AST JSON Schema** - formalize the canonical AST (§10) as a schema                                                      | every tool's I/O contract            | **✅ done** - [`ast.schema.json`](ast.schema.json) (draft 2020-12) + [`validate.js`](validate.js); validates `examples/select.json` + `examples/v01-features.json` (all v0.1 shapes), 8 negative cases rejected. v0.1 **frozen** in PRELUDE + GRAMMAR. (Strict structure; typed-value payloads permissive - future tightening.) |
| B2  | **Executable grammar** - tree-sitter (highlighter + editors) and a PEG (parser front-end), generated from `GRAMMAR.ebnf` | highlighter, transpiler, docs        | **✅ done, differently** - a hand-written recursive-descent parser (`dsl/parse.ts`) is the one reader; the language server, the VS Code and JetBrains extensions and the Playground reuse it, and the TextMate and JetBrains highlighters are generated from the parser's own vocabulary (`gen:highlight`)                      |
| B3  | **Lossless-boundary checker** (conformance, §4 #4)                                                                       | trustworthy generation               | **✅ done** - the `.milda` round-trip is a tested fixed point over the real corpus, and every target reports what it could not express (the Figma target's `skipped` list, the React target's constraint report)                                                                                                                |
| B4  | **Generator** - web-first; 3 registries (primitive · behavior · layout) + a template (the §4 decision)                   | "reproduce the full Radix interface" | **✅ done** - the React target emits every archetype the prelude defines and its output is typechecked against the real React types; a Figma library target is the second reader of the same document                                                                                                                           |

## Sequencing

1. ~~**Land the punch-list (A1–A4).**~~ ✅ done - merged (proposals 0001–0004), example migrated.
2. ~~**Freeze v0.1:** merge A1–A4 into PRELUDE + GRAMMAR + the AST schema (B1), version-tag.~~
   ✅ done (frozen 2026-06-19). _The language has stopped moving - tooling now builds against
   a fixed target._
3. **B2 + B3 in parallel** against the frozen v0.1 (grammar tooling; conformance using the
   Radix corpus as golden tests).
4. **B4 generator**, validated by regenerating `example-radix/` and diffing against real
   Radix Themes output. A second (non-web) backend remains the long-term proof that the
   cross-platform abstractions aren't web-over-fit (PRELUDE Live work #4) - out of this
   roadmap's critical path but the eventual honesty check.

## Are we far?

- **Description: done.** The whole A1–A4 punch-list is merged into v0.1 (proposals
  0001–0004) and validated against the full Radix Themes mapping. The descriptive language
  now expresses a Radix-scale system end-to-end; the only remaining residue is the
  intentionally-deferred `ScrollArea` scrollbar chrome (escape-hatch leaf) and documented §4
  advanced-grid-track realize-residue. **The center of gravity has shifted from the language
  to the ecosystem (B).**
- **Generation back to Radix:** the _language_ isn't the blocker - the **generator (B4) is
  the real remaining build**, and it's an engineering build, not a research question,
  because the hard parts (behavior-as-state-machine, the lossless boundary, the composition
  API via slots) are already decided. The residual risk is generator _fidelity_ to Radix's
  exact DOM/ARIA/CSS - bounded by design via leaf-only, partial-marking escape hatches.

**In one line:** the descriptive language is **v0.1-complete** for a Radix-scale system; next
is the **v0.1 freeze** (lock PRELUDE + GRAMMAR + write the AST JSON Schema, B1) and then the
three remaining ecosystem artifacts (B2 grammar tooling · B3 lossless checker · B4 generator).
