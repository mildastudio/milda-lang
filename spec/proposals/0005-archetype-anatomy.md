# Proposal 0005 - Structured archetype anatomy

> **Status:** ✅ Accepted - merged into Prelude 0.0.2 (PRELUDE §0/§10; all 52 archetypes
> populated in `preludeV0.ts`) · **Targets:** PRELUDE §0 (anatomy) + §10 (Prelude AST). No
> GRAMMAR / `ast.schema.json` change - the archetype-definition surface is the deferred
> _prelude_ grammar/schema, not the design-system document. · **Origin:** the visual editor
> (v2) needs to **seed a component's structure from its archetype** - the empty preview offers
> archetypes, and choosing one must produce the right starting parts. · **Effort:** 1 schema
> field reshaped, 1 vocabulary added, data for 52 archetypes.

## 1. Problem

An archetype publishes a **named anatomy** (PRELUDE §0). The prelude encoded it as
`anatomy?: string[]` - a flat list of part names - and only `SingleSelect` declared it
(`['trigger','value','indicator','surface','option','option.check']`). That is too thin to
**seed a structure** from:

- **No nesting.** `value`/`indicator` live _inside_ the trigger; `option.check` inside the
  option. A flat list can encode some of that by dotted convention, but inconsistently.
- **No semantic role.** Is `surface` a container, `value` text, `trigger` interactive? Nothing
  says, so a consumer (the editor, a generator) has to guess from the name.

The editor worked around this by hand-authoring part trees in the **app layer** - which made the
app a second, shadow source of truth for anatomy. Anatomy is a **DSL-core** concern: the prelude
must own it.

## 2. Change

Reshape `ArchetypeDef.anatomy` from `string[]` to a small **platform-neutral tree**:

```
PartRole   = "container" | "item" | "text" | "control" | "input" | "icon" | "content"
AnatomyPart = { name: string, role: PartRole, optional?: boolean, children?: AnatomyPart[] }
ArchetypeDef.anatomy?: AnatomyPart[]
```

- **`role`** is semantic and platform-neutral. The concrete element (HTML tag, native view) is a
  **realization** concern and is _not_ stored here - keeping the north star honest ("no
  web-specific concepts in the core"). A consumer defaults an element per role (`control`→
  `<button>` on web) and lets the author override.
- **`children`** express containment; the flattened **dotted path** (`surface.option.check`) is
  the part's stable name - the same names a component's realization `anatomy` (§10) keys by.
- **`optional`** marks archetype-optional parts (a `clear` on SearchField, a `close` on Dialog)
  vs. structurally required ones.

All 52 archetypes are now populated in `preludeV0.ts` (a few - `Skeleton`, `Image`, `Icon` -
are intentionally part-less). `SingleSelect`'s parts are re-nested: `value`/`indicator` move
under `trigger`, `check`/`label` under `option`.

## 3. Why no grammar / AST-schema change

`GRAMMAR.ebnf` and `ast.schema.json` cover the **design-system document** (a component's
_usage_ of an archetype: `part trigger { … }` → `component.anatomy`). The archetype
_definition_ lives in the **prelude document**, whose grammar/schema is explicitly **deferred**
(GRAMMAR scope note; ast.schema `$id` description). This proposal touches only the prelude AST,
so those artifacts stay valid as-is. Component-level anatomy (`Record<part, Part>`) is unchanged.

## 4. Versioning

Prelude **0.0.1 → 0.0.2** (additive, prelude-local; the language `milda` version and the
design-system AST schema are untouched).
