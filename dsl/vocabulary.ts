// ─── The surface's closed vocabularies (proposal 0041) ────────────────────────
// Every word set the language fixes: what a part's `kind` may be, which interactions an
// emission can fire on, which free behaviours exist and what fields each one takes, which
// per-archetype config blocks exist and what they accept, which doc blocks and asset kinds
// there are.
//
// They live HERE, in the language package, because three separate consumers need the same
// answer and any two of them drifting is a defect rather than an inconvenience:
//
//   1. the AST→IR lowering (@mildastudio/generate) validates against them - a `.milda` is
//      untrusted input and these fields drive code generation;
//   2. the LSP completes from them, so a suggestion can never be a word the reader rejects;
//   3. the printer's own vocabulary is asserted against them in the round-trip tests.
//
// That is the same class of bug as the token-type map with a silent fallback (0041 §1.1a) and
// the printer's length set diverging from the parser's (§1.1d): two lists that must agree, in
// two files, with nothing checking. One list, imported.
//
// A FIELD's spelling here is the IR's camelCase; the surface writes it kebab-cased
// (`week-starts-on`), which both sides convert. Keeping the camel form canonical means the
// tables read the same as the types they validate.

/** What a part IS. Neutral by design - the platform element is a target decision. */
export const NODE_KINDS: readonly string[] = [
  'container',
  'item',
  'text',
  'control',
  'input',
  'output',
  'icon',
  'content',
  'fragment',
  'foreign',
  'table',
  'row',
  'cell',
  'instance',
]

/** Where a part came from: the archetype, or the author. */
export const NODE_ORIGINS: readonly string[] = ['root', 'archetype', 'author']

/** The interactions an emission (or a demo action) can fire on. */
export const INTERACTION_KINDS: readonly string[] = [
  'activate',
  'change',
  'input',
  'focus',
  'blur',
  'select',
  'open',
  'close',
  'dismiss',
]

/** Control realization (0016) and group realization (0022). */
export const CONTROL_REALIZATIONS: readonly string[] = ['checkbox', 'switch']
export const GROUP_REALIZATIONS: readonly string[] = ['radio', 'segmented']

/** Presentation intent (0022 §8), surface-spelled. */
export const PRESENTATION_KINDS: readonly string[] = ['accessible-name']

/** A media part's type (0028). */
export const MEDIA_TYPES: readonly string[] = ['img', 'video', 'audio', 'embed']

/** A table cell's role. */
export const CELL_MODIFIERS: readonly string[] = ['header', 'col', 'row']

/** The modifiers a `slot` statement accepts after its arity and content spec. */
export const SLOT_MODIFIERS: readonly string[] = [
  'of',
  'keyed-by',
  'default',
  'as',
  'role',
  'sample',
]

/** The structural roles a slot can play in a disclosure. */
export const SLOT_ROLES: readonly string[] = ['trigger', 'panel']

// ─── Free behaviours (0041 §8) ────────────────────────────────────────────────
// Portable by nature: a focus trap or a typeahead is an interaction, not a platform. The two
// web-flavoured fields (`clickaway.eventType`, `scrollLock.target`) are carried verbatim rather
// than reinterpreted, and are named as such here rather than pretended to be neutral.

/** How a behaviour/config field's value is read. `node`/`nodes` name a part BY PATH. */
export type FieldType = 'string' | 'number' | 'boolean' | 'node' | 'nodes'

export const BEHAVIOR_FIELDS: Readonly<Record<string, Readonly<Record<string, FieldType>>>> = {
  focusTrap: {
    initialFocusNodeId: 'node',
    returnFocusOnClose: 'boolean',
    allowEscapeKey: 'boolean',
  },
  typeahead: {
    targetNodeId: 'node',
    labelNodeId: 'node',
    resetDelayMs: 'number',
    caseSensitive: 'boolean',
  },
  cursorNavigation: {
    orientation: 'string',
    wrap: 'boolean',
    targetNodeId: 'node',
    itemNodeId: 'node',
  },
  clickaway: { eventType: 'string', excludeNodeIds: 'nodes' },
  overlayManagement: {
    anchorNodeId: 'node',
    placement: 'string',
    offsetPx: 'number',
    flip: 'boolean',
    sameWidth: 'boolean',
    openPropName: 'string',
    closeOnSelect: 'boolean',
    commitFromBinding: 'string',
  },
  scrollLock: { target: 'string' },
  rovingTabindex: {
    orientation: 'string',
    targetNodeId: 'node',
    itemNodeId: 'node',
    loop: 'boolean',
  },
  filter: {
    queryPropName: 'string',
    itemField: 'string',
    matchMode: 'string',
    caseSensitive: 'boolean',
  },
}

/** The behaviour kinds, in the surface's kebab spelling (`focus-trap`). */
export const BEHAVIOR_KINDS: readonly string[] = Object.keys(BEHAVIOR_FIELDS).map(kebab)

// ─── Per-archetype config surfaces (0029/0034/0035) ───────────────────────────
// Each block is a flat record of scalars whose accepted values are fixed, so a malformed file
// cannot produce a config the generator then emits.

export type ConfigFieldSpec =
  | { kind: 'boolean' }
  | { kind: 'number' }
  | { kind: 'numbers' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'enums'; values: readonly string[] }

export interface ConfigSurface {
  /** The node field this block configures. */
  field: string
  fields: Readonly<Record<string, ConfigFieldSpec>>
  /** True for a single-valued surface written `severity danger` rather than as a block. */
  single?: boolean
}

export const PART_CONFIGS: Readonly<Record<string, ConfigSurface>> = {
  calendar: {
    field: 'calendar',
    fields: {
      selectionMode: { kind: 'enum', values: ['single', 'range'] },
      weekStartsOn: { kind: 'number' },
      disabledWeekdays: { kind: 'numbers' },
    },
  },
  'time-picker': {
    field: 'timePicker',
    fields: { step: { kind: 'number' }, use24Hour: { kind: 'boolean' } },
  },
  tabs: {
    field: 'tabs',
    fields: {
      orientation: { kind: 'enum', values: ['horizontal', 'vertical'] },
      activation: { kind: 'enum', values: ['automatic', 'manual'] },
    },
  },
  slider: {
    field: 'slider',
    fields: {
      range: { kind: 'boolean' },
      orientation: { kind: 'enum', values: ['horizontal', 'vertical'] },
    },
  },
  rating: { field: 'rating', fields: { max: { kind: 'number' }, allowHalf: { kind: 'boolean' } } },
  'color-picker': {
    field: 'colorPicker',
    fields: {
      formats: { kind: 'enums', values: ['hex', 'rgb', 'hsl', 'hsb'] },
      defaultFormat: { kind: 'enum', values: ['hex', 'rgb', 'hsl', 'hsb'] },
      colorSpace: { kind: 'enum', values: ['srgb', 'oklch'] },
      alpha: { kind: 'boolean' },
      eyedropper: { kind: 'boolean' },
      swatches: { kind: 'boolean' },
      layout: { kind: 'enum', values: ['popover', 'inline'] },
    },
  },
  overlay: {
    field: 'overlay',
    fields: {
      dismiss: { kind: 'enums', values: ['outside', 'escape', 'closeButton'] },
      placement: { kind: 'enum', values: ['top', 'bottom', 'left', 'right', 'center'] },
      backdrop: { kind: 'enum', values: ['none', 'scrim', 'blur'] },
    },
  },
  severity: {
    field: 'severity',
    single: true,
    fields: { value: { kind: 'enum', values: ['info', 'success', 'warning', 'danger'] } },
  },
  accordion: {
    field: 'accordion',
    single: true,
    fields: { value: { kind: 'enum', values: ['single', 'multiple'] } },
  },
}

/** The block-shaped config surfaces - read as a config only when a `{` follows the word,
 *  which is what keeps `overlay { … }` apart from the `overlay` paint facet. */
export const PART_CONFIG_NAMES: ReadonlySet<string> = new Set(
  Object.entries(PART_CONFIGS)
    .filter(([, s]) => !s.single)
    .map(([name]) => name),
)

/** The single-valued config surfaces (`severity danger`). */
export const PART_CONFIG_WORDS: readonly string[] = Object.entries(PART_CONFIGS)
  .filter(([, s]) => s.single)
  .map(([name]) => name)

// ─── Docs (0018) ──────────────────────────────────────────────────────────────

/** The prose blocks, whose keyword IS their kind. */
export const DOC_PROSE_KINDS: readonly string[] = [
  'heading',
  'subheading',
  'paragraph',
  'list',
  'quote',
  'callout',
  'code',
]

/** The transclusion blocks - each names what it shows, by name. */
export const DOC_TRANSCLUSIONS: readonly string[] = [
  'divider',
  'image',
  'component',
  'component-props',
  'component-events',
  'component-composition',
  'component-prop',
  'component-event',
  'example',
  'component-group',
  'tokens',
  'swatch',
]

export const DOC_BLOCK_KEYWORDS: readonly string[] = [...DOC_PROSE_KINDS, ...DOC_TRANSCLUSIONS]

/** Statement keywords inside `docs { … }` and inside a `page { … }`'s header. */
export const DOCS_KEYWORDS: readonly string[] = ['site', 'footer', 'page']
export const DOCS_SITE_KEYS: readonly string[] = [
  'name',
  'tagline',
  'version',
  'search-placeholder',
]
export const DOCS_FOOTER_KEYWORDS: readonly string[] = ['copyright', 'link']

// ─── Assets (§1.2) ────────────────────────────────────────────────────────────

export const ASSET_KINDS: readonly string[] = ['font', 'image', 'svg', 'video', 'animation']

/** The fields every asset carries, whatever its kind. `url`/`data` are the two shapes the
 *  bytes can take: beside the file, or in it. */
export const ASSET_BASE_KEYS: readonly string[] = [
  'mime',
  'size',
  'uploaded',
  'tags',
  'url',
  'data',
]

/** Per-kind metadata, validated on lowering. */
export const ASSET_FIELDS: Readonly<
  Record<string, Readonly<Record<string, FieldType | 'strings'>>>
> = {
  font: { fontFamily: 'string', fontStyle: 'string', fontWeight: 'number', formats: 'strings' },
  image: { width: 'number', height: 'number', alt: 'string' },
  svg: { viewBox: 'string', width: 'number', height: 'number' },
  video: { width: 'number', height: 'number', durationMs: 'number', poster: 'string' },
  animation: { format: 'string', durationMs: 'number', loop: 'boolean' },
}

/** The value each asset kind's fields take, in the surface's kebab spelling. */
export const ASSET_FIELD_KEYS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(ASSET_FIELDS).map(([kind, fields]) => [kind, Object.keys(fields).map(kebab)]),
)

// ─── Value literals (0036 colours · 0038 lengths) ─────────────────────────────
// The self-typing literal functions, and what each one's arguments MEAN. The parser reads
// them (its own `COLOR_FNS` / `LENGTH_FNS` are these keys), so an editor that completes a
// literal from this table and an editor that explains one while you type its channels are
// both describing the function the reader actually accepts.
//
// `sample` is a value in range, so a completion can offer the call already filled in - and a
// filled-in call is what makes the difference between being told a function exists and being
// able to write it. The RANGES here are the authoring surface; the numeric conversion
// (which percentage is taken of what) stays in the parser, where the maths is.

export interface LiteralChannel {
  /** The channel's name, as the docs and the argument hint call it. */
  name: string
  /** What it accepts, in one phrase. */
  hint: string
  /** An in-range value, for a pre-filled call. */
  sample: string
}

export interface LiteralFnSpec {
  channels: readonly LiteralChannel[]
  /** Whether a trailing alpha is accepted (`… / 50%`, or a bare fourth channel). */
  alpha: boolean
  /** One line on what the function is. */
  doc: string
}

export const VALUE_LITERAL_FNS: Readonly<Record<string, LiteralFnSpec>> = {
  // `#` opens a comment in this language, so hex digits are written inside a call.
  hex: {
    channels: [{ name: 'digits', hint: '3, 4, 6 or 8 hex digits (0-9, a-f)', sample: 'ffffff' }],
    alpha: false,
    doc: 'sRGB as hex digits - `hex(fff)`, `hex(3b82f6)`, `hex(3b82f6cc)`',
  },
  srgb: {
    channels: [
      { name: 'r', hint: '0..1 or a percentage', sample: '1' },
      { name: 'g', hint: '0..1 or a percentage', sample: '1' },
      { name: 'b', hint: '0..1 or a percentage', sample: '1' },
    ],
    alpha: true,
    doc: 'sRGB channels in 0..1',
  },
  rgb: {
    channels: [
      { name: 'r', hint: '0..255 or a percentage', sample: '59' },
      { name: 'g', hint: '0..255 or a percentage', sample: '130' },
      { name: 'b', hint: '0..255 or a percentage', sample: '246' },
    ],
    alpha: true,
    doc: 'sRGB channels in 0..255',
  },
  p3: {
    channels: [
      { name: 'r', hint: '0..1 or a percentage', sample: '1' },
      { name: 'g', hint: '0..1 or a percentage', sample: '0' },
      { name: 'b', hint: '0..1 or a percentage', sample: '0' },
    ],
    alpha: true,
    doc: 'Display-P3 channels in 0..1 - a wider gamut than sRGB',
  },
  oklch: {
    channels: [
      { name: 'L', hint: 'lightness, 0..1 or a percentage', sample: '0.62' },
      { name: 'C', hint: 'chroma, 0..0.4 (100% = 0.4)', sample: '0.19' },
      { name: 'H', hint: 'hue in degrees, 0..360', sample: '256' },
    ],
    alpha: true,
    doc: 'Perceptual lightness/chroma/hue - the space to pick a scale in',
  },
  hsl: {
    channels: [
      { name: 'H', hint: 'hue in degrees, 0..360', sample: '210' },
      { name: 'S', hint: 'saturation, 0..1 or a percentage', sample: '0.5' },
      { name: 'L', hint: 'lightness, 0..1 or a percentage', sample: '0.4' },
    ],
    alpha: true,
    doc: 'Hue/saturation/lightness, converted to sRGB on read',
  },
  // A length, not a colour: the one function on the length side of the surface.
  scaled: {
    channels: [{ name: 'n', hint: "a multiple of the user's text size", sample: '1.25' }],
    alpha: false,
    doc: "A text-relative length - `scaled(1.25)` is 1.25x the reader's text size",
  },
}

/** The colour-space literals, in the order a picker should offer them. */
export const COLOR_LITERAL_FNS: readonly string[] = ['hex', 'oklch', 'srgb', 'rgb', 'p3', 'hsl']

/**
 * Spellings a reader accepts for a function it already has. In CSS Color 4 `rgba`/`hsla` ARE
 * `rgb`/`hsl` - the alpha is a fourth channel either way - and someone coming from CSS writes
 * the four-letter name without thinking about it. Read, never offered, never written: the
 * canonical name is the target. (The same treatment `rem`/`dp`/`sp` get on the length side.)
 */
export const COLOR_LITERAL_ALIASES: Readonly<Record<string, string>> = { rgba: 'rgb', hsla: 'hsl' }

/** Every spelling of a colour function the reader accepts - the canonical ones and the aliases.
 *  What a highlighter needs: `rgba(1 0 0 / 0.5)` is a colour literal, so its payload is a value
 *  and not four identifiers. */
export const COLOR_LITERAL_SPELLINGS: readonly string[] = [
  ...COLOR_LITERAL_FNS,
  ...Object.keys(COLOR_LITERAL_ALIASES),
]

/** Colour words that name a value rather than a token. `transparent` is the absence of a colour,
 *  which every platform has a spelling for; the Studio seeds one (a tab's resting border). */
export const COLOR_KEYWORDS: readonly string[] = ['transparent']

/** The length-valued literals (0038). */
export const LENGTH_LITERAL_FNS: readonly string[] = ['scaled']

// ─── Layout (proposals 0003, 0056) ────────────────────────────────────────────
// The layout model's words, in the one place the surface, the IR, the three targets and the
// Inspector read them from. Proposal 0056 found the model in four sizes - the spec promised
// `layers`, `weight(n)`, `ratio(w:h)`, per-axis clamps and logical-edge positions, the parser
// accepted some of them with other words, the IR stored fewer, the targets rendered fewer again -
// and the first step of closing that was giving the words one home. Core re-exports these as its
// neutral vocabulary (`facets/layout.ts`); what `layers` means in a browser stays the web tier's.

/** What a stack's children flow along. `layers` draws them on top of each other. */
export const LAYOUT_DIRECTIONS = ['row', 'column', 'layers'] as const
export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number]

/** Cross-axis placement (vertical in a `layers` stack). */
export const LAYOUT_ALIGNS = ['start', 'center', 'end', 'stretch', 'baseline'] as const
export type LayoutAlign = (typeof LAYOUT_ALIGNS)[number]

/** Main-axis placement (horizontal in a `layers` stack). */
export const LAYOUT_DISTRIBUTES = ['start', 'center', 'end', 'between', 'around', 'evenly'] as const
export type LayoutDistribute = (typeof LAYOUT_DISTRIBUTES)[number]

export const LAYOUT_WRAPS = ['nowrap', 'wrap', 'wrap-reverse'] as const
export type LayoutWrap = (typeof LAYOUT_WRAPS)[number]

/** How one axis of a part is sized (PRELUDE §4 "child sizing"). `weight`, `fixed` and `ratio`
 *  take an argument: `weight(2)`, `fixed(size.md)`, `ratio(16:9)`. */
export const AXIS_INTENTS = ['fit', 'fill', 'weight', 'fixed', 'ratio'] as const
export type AxisIntentKind = (typeof AXIS_INTENTS)[number]

/** The clamps an axis intent may be followed by: `min(size.sm)`, `max(size.lg)`. */
export const AXIS_CLAMPS = ['min', 'max'] as const

/** Where a part sits relative to the flow. `pinned` and `bleed` take logical edges. */
export const POSITION_KINDS = ['flow', 'overlay', 'pinned', 'bleed'] as const
export type PositionKind = (typeof POSITION_KINDS)[number]

/** Logical edges, so a design system reads the same in a right-to-left locale. */
export const LOGICAL_EDGES = [
  'block-start',
  'block-end',
  'inline-start',
  'inline-end',
  'block',
  'inline',
  'all',
] as const
export type LogicalEdge = (typeof LOGICAL_EDGES)[number]

/** The edges an inset can be stated on, besides all four at once (proposal 0057). A dotted facet
 *  name each - `inset.inline`, `inset.block-start` - the way `border` takes `.<edge>`. The bare
 *  `inset` already means all four, so `all` is not one of them. */
export const INSET_EDGES = [
  'block',
  'inline',
  'block-start',
  'block-end',
  'inline-start',
  'inline-end',
] as const satisfies readonly LogicalEdge[]
export type InsetEdge = (typeof INSET_EDGES)[number]

/** The physical edge words the parser used to take, read as the logical edge each names in a
 *  horizontal left-to-right system. Read, never offered, never written - the `rgba` treatment. */
export const PHYSICAL_EDGE_ALIASES: Readonly<Record<string, LogicalEdge>> = {
  top: 'block-start',
  bottom: 'block-end',
  left: 'inline-start',
  right: 'inline-end',
}

/** The keys of the editor's layout record (`node.layout`), whose values are the words above:
 *  a direction, an alignment, a distribution, a wrap, an axis intent spelled as the surface
 *  spells it (`fill`, `weight(2)`, `ratio(16:9)`, a size token or a length), a clamp as a size
 *  token or a length, and a position as its surface words (`overlay`, `pinned block-start`). */
export const LAYOUT_RECORD_KEYS = [
  'direction',
  'align',
  'distribute',
  'wrap',
  'width',
  'height',
  'widthMin',
  'widthMax',
  'heightMin',
  'heightMax',
  'position',
] as const
export type LayoutRecordKey = (typeof LAYOUT_RECORD_KEYS)[number]

// ─── UI states (PRELUDE §5) ───────────────────────────────────────────────────
// The words a `state <name> { }` block, a `bind state <name>`, a `when state <name>` and a
// `when ancestor <part> <name>` may use. The IR's `StateName` IS this list (core imports it), so
// a word here is one every target is told how to realize - the web tier's `STATE_SELECTOR` is a
// `Record<StateName, string>`, total by construction - and a word missing from it is one no
// target can draw.
//
// It used to exist twice, disagreeing both ways: the prelude's taxonomy also had `invalid`,
// `valid`, `dragging`, `empty` and `complete`, and the IR had `focus-visible` and the calendar
// states. The prelude-only five were never UI states. They are states of behaviour MACHINES
// (`validation` goes pristine -> valid | invalid, `drag` idle -> dragging), which no target
// exposes as a stylable condition: before this list was closed, `state invalid { ring … }` reached
// the CSS emitter with no selector for it and came out as an unconditional rule - the ring always
// on. The read still keeps such a word (it warns), so the web target now leaves the rule out and
// names it in its `skipped` report rather than drawing it in every state. A state of that kind that should be stylable joins this list together with its realization
// in every target, which is proposal 0050's rule: a `StateName` that compiles on both sides and is
// realized by neither is the failure, not the cure.
export const STATE_NAMES = [
  'hovered',
  'pressed',
  'focused',
  'focus-visible',
  'active',
  'selected',
  'checked',
  'indeterminate',
  'expanded',
  'open',
  'disabled',
  'readonly',
  'loading',
  'error',
  'success',
  'first',
  'last',
  'odd',
  'even',
  // Calendar/time cell states (proposal 0029) - data-driven by the behaviour core, stylable on
  // the DatePicker `day` / TimePicker `option` parts.
  'today',
  'outside-month',
  'range-start',
  'range-end',
  'in-range',
  'highlighted',
] as const
export type StateName = (typeof STATE_NAMES)[number]

// ─── Examples (0021) ──────────────────────────────────────────────────────────

export const EXAMPLE_KEYWORDS: readonly string[] = ['demo', 'part']
export const DEMO_ACTION_OPS: readonly string[] = ['set', 'toggle']

// A camelCase field name → the surface's kebab spelling. Declared here rather than imported so
// this module stays dependency-free (it is the language's vocabulary, not its machinery).
function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export { kebab as kebabField }

/** A surface kebab key → the IR's camelCase field (`week-starts-on` → `weekStartsOn`). */
export function camelField(s: string): string {
  return s.replace(/-([a-z0-9])/g, (_, c: string) => (c as string).toUpperCase())
}

// ─── Surface and prelude versions (0041 §6 / spec/FORMAT.md §6) ───────────────
// The SURFACE version is bumped whenever the grammar gains capability. It is what lets a
// reader tell "this file predates motion" from "this file has no motion": a `milda 0.1`
// file could not express a transition, a `milda 0.5` file without one has none.
//
// 0.4 -> 0.5: the ratio token type got its own word (`ratio`). Additive vocabulary rather
// than new syntax, so a 0.4 reader still parses the statement - but it does not know the
// word, and its fallback types the token as a LENGTH, which is the exact corruption the
// word exists to prevent.
//
// 0.5 -> 0.6: the icon library got a surface (the top-level `icons` block). New syntax, so a
// 0.5 reader skips the block - and an imported system draws a placeholder for every icon.
//
// 0.6 -> 0.7: how the system is USED (proposal 0052). A new top-level statement (`rule`), and in a
// props block `required`, `required when <predicate>`, a prop's prose, and the group constraints
// `one-of` / `any-of` / `exclusive`. A 0.6 reader rejects `rule` as an unexpected top-level word.
//
// 0.7 -> 0.8: the layout model in one size (proposal 0056). Inside a `layout { }` block an axis
// may carry `min(…)` / `max(…)` clamps and the `ratio(w:h)` intent, `position` takes `pinned` and
// `bleed` with LOGICAL edges, and `grid` is a reserved key. All of it is inside a block that is
// self-delimiting, so a 0.7 reader loses the statement it does not know and keeps the file -
// but it does not know the words, and the version is what says it may meet them.
//
// 0.8 -> 0.9: what a part IS is said where it is named (proposal 0055): `part Button: container {`.
// The second BREAKING step after 0.3 -> 0.4, and worse than an unknown statement: a 0.8 reader
// expects `{` after the name, so the header costs it the first part's body and every part after
// it. `kind container` in the body stays valid for good. The same step takes `locked` out of the
// language: whether a part may be removed is what the archetype requires, so the reader works it
// out and the writer never prints it; an old `locked` is read and ignored.
//
// 0.9 -> 0.10: an inset is said on one axis or one edge (proposal 0057): `inset.inline`,
// `inset.block` and the four `inset.<logical edge>` statements. Each is a self-delimiting facet
// statement, so a 0.9 reader skips it with an unknown-facet warning and keeps the file - it
// loses that padding, not the part.
//
// These live here, with the rest of the closed surface, because the reader and the writer
// both need them and disagreeing is a defect. They had been declared separately in the
// parser (as `'0.1'`) and the printer (as `'0.5'`), which meant a file with no header was
// parsed as 0.1 and then PRINTED as `milda 0.1` - permanently stamping a document with a
// claim about its own syntax that nothing had checked, and that was wrong for the entire
// `docs/dsl/` corpus.
//
// This is the DEFAULT only. A document that carries its own version keeps it, so
// re-exporting an older file does not silently claim it uses syntax it does not.
export const MILDA_SURFACE_VERSION = '0.10'
export const PRELUDE_VERSION = '0.0.2'
