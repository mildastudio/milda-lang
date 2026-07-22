# Proposal 0004 — First-class slots

> **Status:** ✅ Accepted — merged into DSL v0.1 (PRELUDE §0/§10 + GRAMMAR; demonstrators
> migrated across all slot modes) · **Targets:** PRELUDE §0 (anatomy) + §10 (AST),
> GRAMMAR §part · **Origin:** [`example-radix/FINDINGS.md`](../example-radix/FINDINGS.md) §D
> (positional slots) + ROADMAP A4 (composable APIs the generator must reproduce). · **Effort:**
> 1 anatomy construct, 1 grammar production. The largest of the language punch-list.

## 1. Problem

The DSL has **anatomy parts** (`part trigger {…}`) — named structural pieces with facets and
states. But a part is a *styling target the component renders itself*; the DSL cannot declare
that a part is a **consumer-fillable insertion point** (a "slot"), nor its **arity** or **what
it accepts**. Radix's whole composition model is slots:

- `TextField` has `start` / `end` adornment slots — FINDINGS §D collapsed both to one `slot`
  part "used twice," losing *which side*.
- `Dialog` has `Title` / `Description` / body / `Close` — heterogeneous named slots.
- `DropdownMenu` accepts many `Item` / `Separator` / `Label` children.
- `Tabs` pairs many `Trigger`s with many `Content` panels **by value** (compound component).
- `Card` accepts arbitrary content.

Without slots, the generator cannot emit these composable children APIs — the core reason
A4 gates "reproduce the full Radix interface."

## 2. Design — a slot is a part with a content contract

A slot is structurally a part (it has a position, facets, states) that *also* declares a
consumer-content contract. So: **add a `slot` statement to the part body** — no new top-level
construct, no duplication into the contract (the set of slotted parts *is* the composition
API, derivable).

```
slot [<arity>] [of <contentspec>] [keyed-by <ident>]
```
- **`<arity>`** — `single` (default) · `optional` · `many`.
- **`<contentspec>`** (default `content`) — what may fill it:
  - `content` — arbitrary consumer nodes (icon, text, any element). The common case.
  - `ref <Type>` — typed *data* (a data-driven slot).
  - `<ComponentName>` — a compound **child component** (e.g. `MenuItem`, `TabPanel`).
- **`keyed-by <ident>`** (only on `many`) — the field that identifies/pairs children, for
  compound pairing (Tabs `Trigger`↔`Content` by `value`). The generator uses it to wire the
  paired children.

Examples:
```
part start    { slot optional of content;  layout { align center } }   # TextField adornment
part title    { slot single;  text text-size.5; weight weight.bold }    # free content, exactly one
part item     { slot many of MenuItem;  ... }                           # repeated typed child
part content  { slot many of content keyed-by value;  ... }             # keyed compound (Tabs panels)
```

A `part` with no `slot` statement stays a component-rendered styling target (Button `root`,
the indicator pill) — slots mark the subset that are *insertion points*.

## 3. Grammar delta (GRAMMAR.ebnf)

`slot` becomes a part-body statement (a `pstmt`), like `layout`:
```ebnf
pstmt    = layoutblock | stateblock | slotstmt | facetstmt ;            (* + slotstmt *)
slotstmt = "slot" , [ arity ] , [ "of" , contentspec ] ,
           [ "keyed-by" , ident ] , [ terminator ] ;                   (* v0.1 *)
arity       = "single" | "optional" | "many" ;
contentspec = "content" | "ref" , path | ident ;                       (* free | typed data | child component *)
```
Defaults: omitted `arity` ⇒ `single`; omitted `of` ⇒ `content`.

## 4. AST delta (PRELUDE §10)

A part gains an optional `slot` descriptor:
```jsonc
"anatomy": {
  "<part>": {
    "slot": {
      "arity": "single|optional|many",
      "accepts": { "kind": "content" }                       // free nodes
                | { "kind": "type",      "ref": "<type.id>" } // typed data
                | { "kind": "component", "ref": "<ComponentName>" },
      "keyedBy": "<field>"?                                   // many only
    },
    "layout"?, "facets"?, "states"?
  }
}
```
The component's **composition API** = the set of parts carrying a `slot` (derivable; not
duplicated into `contract`).

## 5. Example impact (the live test — one demonstrator per slot feature)

- **`TextField`** (positional): `part start { slot optional of content }`,
  `part end { slot optional of content }` — replaces the "one slot used twice" workaround,
  closing FINDINGS §D.
- **`Dialog`** (named heterogeneous): `title` (`slot single`), `description`
  (`slot optional`), `body` (`slot many of content`), `close` (`slot optional`).
- **`DropdownMenu`** (typed many): `item` (`slot many of content`) — retrofits the existing
  repeated `item` part as a slot; `separator`/`label` likewise.
- **`Tabs`** (keyed compound): `trigger` (`slot many keyed-by value`) +
  `content` (`slot many of content keyed-by value`) — the Trigger↔Panel pairing.
- **`Card`** (free many): `content` (`slot many of content`).

Other components' insertion points are slot-able by the same rule; only these demonstrators
are annotated (as with the 0002/0003 migrations).

## 6. Explicitly out of scope (keeps it bounded)

- **No default-content syntax** — Radix's `Dialog.Close` default X is a `realize`-target
  render convenience, not core slot machinery.
- **No slot-level prop forwarding / `asChild`** — `asChild`/`Slot`-merge is render plumbing
  (the §"correct non-mappings" family), not a core concept.
- **No nested-slot type system** — `contentspec` references a component by *name*; it does
  not recursively constrain that component's own slots. Compound validity beyond `keyed-by`
  is a consumer concern.
- **One `keyed-by` field** — pairing is by a single field (Radix uses `value`); no composite
  keys.

## 7. Why it's safe for the ecosystem

The parser change is one `pstmt` alternative. The generator reads each part's `slot`
descriptor to emit the children API: `single`/`optional` → a named child prop / sub-element;
`many` → a repeated child; `keyed-by` → paired rendering. The lossless checker is unaffected
— a slot is complete iff its `accepts` resolves (a known type/component or free `content`).
This is the construct that lets web codegen reproduce Radix's compound components.
