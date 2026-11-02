# The `.milda` file - what a reader can rely on

Version **0.10** (2026-11-02). Companion to [`GRAMMAR.ebnf`](GRAMMAR.ebnf) (the surface syntax)
and [`PRELUDE.md`](PRELUDE.md) §10 (the canonical AST). This document is the part an
implementer needs that a grammar cannot state: **what the file promises to carry, what it
deliberately does not, and how references resolve.**

It exists because the promise was previously only a test in our repository
([proposal 0041](../../../docs/dsl/proposals/0041-milda-format-completeness.md) §7, open
question 1). A test keeps _us_ honest; anyone else implementing a reader or writer needs the
contract written down.

## 1. The file carries the whole design system

A `.milda` is not a printout of a design system - it **is** one. Everything below survives a
write and a read, structurally (ids may be re-derived, see §3):

|                 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| foundations     | context groups, layers, token groups, every token with its type, value and description                                                                                                                                                                                                                                                                                                                                                                                                                    |
| shared types    | the authored type declarations (the language's builtins are implicit)                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| components      | archetype, description, contract (props with defaults / bindings / annotations, events), authored behaviour composition, and the full anatomy                                                                                                                                                                                                                                                                                                                                                             |
| a part          | its path in the tree, kind, provenance, presence predicate, slot descriptor, text content, accessible naming, event emissions, state and value bindings, declared value type, repetition, table-cell role, control and group realization, presentation intent, media provenance and alt text, link destination, paint facets, layout, conditional state rules, transitions, nested component instances, free behaviours, quarantined foreign content, demo actions, and the per-archetype config surfaces |
| library         | component groups (nestable, with their prose) and each component's membership                                                                                                                                                                                                                                                                                                                                                                                                                             |
| examples        | demo scenes (0021): the component they demonstrate, their own state variables, their node tree                                                                                                                                                                                                                                                                                                                                                                                                            |
| assets          | the library: folders, each asset's identity and metadata, and where its bytes are (§4)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| icons           | the icon library: the sets a bare glyph name resolves against, in order, and every curated glyph - its label, its vendored SVG body, and for a custom glyph the asset that draws it                                                                                                                                                                                                                                                                                                                       |
| docs            | the overlay (0018): site copy, footer, pages with their sidebar section and nesting, prose blocks and every transclusion                                                                                                                                                                                                                                                                                                                                                                                  |
| output settings | the emission idiom and the date/time/colour representations - these are part of the generated components' PUBLIC API, so a file that omits them describes a different contract                                                                                                                                                                                                                                                                                                                            |

## 2. What it deliberately does not carry

This list is part of the contract, not an escape from it. **Anything not on it is a bug.**

| Excluded                                    | Why                                                                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| the document / project id                   | the file is portable _because_ it is not tied to one workspace                                                                      |
| activity history (changelog)                | a record _about_ the system, not the system                                                                                         |
| release history, contract digests           | the project's record of what it shipped                                                                                             |
| publishing config, connections, credentials | ops metadata: where bytes go is not what the system is                                                                              |
| a node's platform element (`tag`)           | `div`/`span`/`svg` would make the file a DOM description. The neutral `kind` is carried and each target derives its element from it |

One item is _carried but not portable by nature_: `foreign` content is target-specific code
(§5).

## 3. How references resolve

**Nothing is addressed by a workspace id.** Every reference names something the file itself
declares, so a reader can resolve it without our database:

| Reference                                                        | Written as                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| a node (ancestor predicate, accessible naming, behaviour target) | its dotted part **path** (`root.surface.label`)                                |
| a component (instance, docs block)                               | its declaration **identifier**                                                 |
| an event (emission)                                              | its declared **name**                                                          |
| a token                                                          | its **path** (`palette.gray.1`), resolved against the referencing site's scale |
| a component group, an asset folder                               | its slash **path**                                                             |
| a docs page (parent)                                             | its **title**                                                                  |
| an example (docs block, slot sample)                             | its **name**                                                                   |
| an asset (docs image, media source)                              | its **name**                                                                   |
| an icon (a part's glyph)                                         | its curated **name** or label, else a name in the first `set`                  |
| an asset (custom glyph)                                          | its **name**                                                                   |

Two consequences a writer must respect:

- **A part's path is its position in the tree.** `root.surface.label` is the child `label` of
  the child `surface` of `root`; the prefix IS the parent. This is the only place nesting is
  recorded.
- **A declaration name is an identifier.** Where a name is free text (a component called
  "Color picker"), the identifier is derived and the authored spelling travels in
  `meta { name "Color picker" }`.

One thing is carried **by value rather than by reference: a font family.** The editor keeps
families in a library and a `font-family` token names one by id - and an id is exactly what
this section forbids, so the file writes the family record instead and the reader rebuilds the
library from it:

```milda foundations
token type/heading : font-family = raw { family: "Inter"; fallback: sans-serif; source: google; license: "OFL-1.1" }
token type/ui      : font-family = raw { family: "system-ui, -apple-system, sans-serif"; fallback: sans-serif; source: system }
```

`source` is the part that earns its keep: a generator has to know whether to emit a stylesheet
link, an `@font-face`, or nothing at all, and a bare CSS stack cannot say. A system family's
`family` IS its stack. Records that describe the same family rebuild **one** library entry,
however many tokens name it. What does not survive: a custom family's faces beyond the first
(only its asset is named) and the library entry's display name, which is editor chrome - both
are reported as export issues rather than dropped in silence.

A **text style** is the same shape one level up, and its `family` may be either: a nested
record, or the **path of a `font-family` token** - which is how a text style stays tied to a
family that can be layered and can differ per context.

```milda foundations
token text/body : typography = raw { family: type.ui; size: 15px; weight: 400; line-height: 1.5; letter-spacing: 0px }
```

The reading rule for both: in a field that takes a value or a token, **a structure is the
value and a bare path is the token.**

The same quantity also exists as a token of its own, and its type word says what it is rather
than what shape it has: a line height is a **`ratio`** - a number with no unit, never a length.

```milda foundations
token text/leading/normal : ratio = 1.5
```

Two older spellings are still _read_ for the same type and neither is written any more:
`line-height` (the kebab form, as the record field above spells it) and `number` (what the
printer emitted before this type had a word). `number` in particular is kept readable because
dropping it would make an already-exported `1.5` come back as `1.5px`.

Equality is **structural after normalisation**, never textual: ids may be re-derived on read,
key order and formatting are irrelevant, but _absent and empty are different states_ (a system
with no docs and one whose docs were dropped must not read the same).

## 4. Asset bytes: two shapes, one grammar

An asset declaration carries its identity and metadata plus **where the bytes are**, and that
is the one choice the format offers:

- `url "https://…"` - the bytes travel beside the file. The text stays diffable, which is what
  a version-control mirror and a pull request need. Ship it as a bundle: the `.milda` plus an
  `assets/` directory.
- `data "data:image/svg+xml;base64,…"` - the bytes are _in_ the file, which then needs nothing
  else to be complete. Bigger, and unpleasant in a diff.

Both are the same production, so a reader implements one path. A writer that cannot read an
asset's bytes must say so rather than emit a file that claims to be self-contained.

## 5. Foreign content is quarantined, and tagged

`foreign <target> ["label"] "<code>"` carries code written for a specific target
(`web-react`). It is in the file because silently dropping authored code is worse than
carrying it - but it is **not portable**, and the target tag is what makes that honest:

> A reader that does not implement `<target>` MUST skip the block. It must not interpret,
> translate, or execute it, and it should surface that the component carries non-portable
> content.

## 6. Versioning

The header declares two versions, and they answer different questions:

```
milda 0.10       the SURFACE version - which statements a reader may encounter
prelude 0.0.2    the design-system vocabulary (archetypes, atoms, facets)
```

`milda` is what tells a reader whether a file omits something because the writer predated it or
because it was dropped: a `milda 0.1` file has no `motion` statement because motion had no
syntax yet, while a `milda 0.5` file without one has no motion. That is why the surface version
is bumped whenever the grammar gains capability - 0.1 → 0.3 for proposal 0041 - and it is why
**no third version number is needed** for the format itself.

**0.3 → 0.4** is the surface's first _breaking_ change rather than an addition: "a name, then
its type" now has one spelling, the colon. A reader that sees 0.4 expects `size : Size` in a
`props` block and `open : boolean` in a `demo` block, exactly as it already expects
`token brand : color` and `field : string`; the colon-less form those two blocks used to accept
is an error. `prelude` is unaffected. A file with no header at all is read as 0.1 - the version
the surface had before anything declared one.

**0.4 → 0.5** adds a _word_ rather than a statement: a unitless ratio is written `ratio` (§3).
That still earns a bump, and the reason is worth stating because it is the rule for every future
type word. A 0.4 reader parses `token leading/normal : ratio = 1.5` perfectly well - the shape of
the statement did not change - but it does not know the word, and its fallback types the token as
a **length**, which is the exact corruption the word exists to prevent. So the version is what
tells a reader whether it may encounter the word: a 0.5 file may say `ratio`, a 0.4 file cannot.
`prelude` is unaffected, and nothing that parsed as 0.4 stops parsing.

**0.5 → 0.6** adds a _statement_: the top-level `icons` block. Until it, the icon library had no
surface, so the reader could only produce an empty one and every icon in an imported system
resolved to nothing. A 0.5 reader meeting the block skips it, which is exactly the silent loss
the version exists to make visible: a 0.6 file without an `icons` block has no library, a 0.5
file could not have said.

**0.6 → 0.7** says how the system is meant to be USED (proposal 0052). It adds one top-level
statement, `rule`, and four things a `props` block may say: `required`, `required when
<predicate>`, a trailing prose string, and the group constraints `one-of`, `any-of` and
`exclusive`. `required` and the prose existed in the document long before they had a spelling,
so a 0.6 export dropped them; a 0.7 one carries them. A 0.6 reader rejects `rule` as an
unexpected top-level word and keeps reading, which is the behaviour this section asks for.

**0.7 → 0.8** closes the gap between the layout model the spec promised and the words the surface
read (proposal 0056). Inside a `layout { }` block an axis intent may now carry `min(…)` / `max(…)`
clamps and may be `ratio(w:h)` - the axis that follows the other - and `position` takes `pinned`
and `bleed` with LOGICAL edges (`block-start`, `inline-end`, …), which is what lets a system read
the same right-to-left. `grid` is a reserved key. Each of these is inside a self-delimiting block,
so a 0.7 reader loses the one statement it does not know and keeps the file - `size fill min(240)`
reads as `fill` plus a warning - which is exactly the degradation this section asks for; the bump
says a reader MAY meet the words. Three older spellings are read and never written: `ratio w h` as
a key (the height follows the width), the physical edge words (`top` is `block-start`), and `flow`
for `wrap wrap`. `prelude` is unaffected, and nothing that parsed as 0.7 stops parsing.

**0.8 → 0.9** is the second _breaking_ change, and the first one a reader cannot ride out
(proposal 0055). What a part IS is said where it is named: `part Button: container {`, the kind
after the colon that already means "a name, then what it is". It lowers to exactly what
`kind container` in the body says, and that statement stays valid for good, so every older file
keeps reading the same; only the header is written. A 0.8 reader expects `{` after the part's
name, and the header is not self-delimiting for one that does not know it: it loses the first
part's body and every part after it, which is well past the "parse what it recognises" below. So
a writer that prints a part header declares 0.9 even when the document it came from declared
older, and a reader a user installed before 0.9 (a Mac app build, an editor extension, the
`milda` package) has to be updated to read a file written since. The same step takes `locked`
out of the format. Which parts a component may not lose is what its archetype REQUIRES, and the
reader already restores a required part a file leaves out, so the flag only ever repeated the
archetype: a reader now derives it, a writer never prints it, and an older file's `locked` is
read and ignored. Editor tooling reports a required part a file leaves out as an error and
offers to add it. `origin` stays in the body, and a part keeps its braces when its body is empty.

**0.9 → 0.10** lets padding differ by edge (proposal 0057). Beside `inset ‹all›` and
`inset ‹block› ‹inline›`, an inset may be stated on one axis - `inset.inline`, `inset.block` - or
on one LOGICAL edge - `inset.inline-start`, `inset.inline-end`, `inset.block-start`,
`inset.block-end`. Each is its own facet statement, and the most specific one wins on its edge:
`inset space.2` with `inset.inline-start space.1` is 2 everywhere and 1 on the leading side.
Before it, an editor document holding one axis exported as `inset ‹one›` and came back with
padding on all four edges; a 0.10 writer prints the keys the document holds, so that loss is
gone. A writer that prints one of the new statements declares 0.10 even when the document
declared older. Each statement is self-delimiting, so a 0.9 reader skips it with a warning and
keeps the file. The physical words (`inset.left`) are read as the logical edge they name left to
right and never written. `prelude` is unaffected, and nothing that parsed as 0.9 stops parsing.

A reader should accept a file whose `milda` version it does not know, parse what it recognises,
and report the rest rather than failing: the grammar is additive, and every statement is
self-delimiting. The one thing it must not do is _guess a type it does not know_ - an unknown
token type is a token whose value the reader cannot claim to have read, and saying so beats
silently making it a length.
