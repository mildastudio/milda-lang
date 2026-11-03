import type {
  ArchetypeDef,
  Atom,
  CapabilityDef,
  CompositeBehavior,
  FacetDef,
  PreludeDocument,
  StateDef,
  TaxonomyNote,
} from '../types/prelude'
import type { StateName } from '../types/facets'
import { PRELUDE_VERSION, STATE_NAMES } from '../dsl/vocabulary'

const atoms: Atom[] = [
  {
    kind: 'atom',
    name: 'activation',
    doc: 'invoke an action + emit event/payload on a trigger',
    params: [{ name: 'payload' }],
    states: [{ id: 'ready', initial: true }],
    events: [{ name: 'trigger' }],
    transitions: [
      {
        from: 'ready',
        on: 'trigger',
        when: 'enabled',
        to: 'ready',
        emit: { event: 'invoke', arg: 'payload' },
      },
    ],
    emits: [{ name: 'invoke' }],
    note: 'transducer (single state); foundational atom under almost every interactive archetype',
  },
  {
    kind: 'atom',
    name: 'scheduler',
    doc: 'timed transition: auto-dismiss, auto-advance, debounce, delay',
    modes: ['timeout', 'debounce', 'interval'],
    params: [{ name: 't' }, { name: 'mode' }],
    states: [{ id: 'idle', initial: true }, { id: 'pending' }],
    events: [{ name: 'arm' }, { name: 'cancel' }],
    transitions: [
      { from: 'idle', on: 'arm', to: 'pending' },
      { from: 'pending', after: 't', to: 'idle', emit: { event: 'fire' } },
      { from: 'pending', on: 'arm', to: 'pending', note: 'restart (debounce)' },
      { from: 'pending', on: 'cancel', to: 'idle' },
    ],
    emits: [{ name: 'fire' }],
    note: 'load-bearing: all time-based interactions compose from it',
  },

  {
    kind: 'atom',
    name: 'toggle',
    doc: 'flip a boolean (BooleanInput core; tristate → +mixed)',
    params: [{ name: 'v', bind: true }],
    states: [{ id: 'off', initial: true }, { id: 'on' }],
    events: [{ name: 'toggle' }, { name: 'set', args: ['b'] }],
    transitions: [
      { from: 'off', on: 'toggle', to: 'on', emit: { event: 'change', arg: true } },
      { from: 'on', on: 'toggle', to: 'off', emit: { event: 'change', arg: false } },
      { from: 'any', on: 'set', to: { expr: 'b?on:off' }, note: 'controlled sync, no emit' },
    ],
    exposes: [{ state: 'checked', when: 'state==on' }],
    emits: [{ name: 'change' }],
  },

  {
    kind: 'atom',
    name: 'selection',
    doc: 'choose member(s) of a collection',
    modes: ['single', 'multiple', 'range', 'none'],
    params: [{ name: 'C' }, { name: 'selected', bind: true }],
    context: [{ name: 'sel', type: 'C|none', init: 'none' }],
    states: [{ id: 'empty', initial: true }, { id: 'chosen' }],
    events: [{ name: 'select', args: ['x'] }, { name: 'clear' }, { name: 'set', args: ['x'] }],
    transitions: [
      {
        from: 'any',
        on: 'select',
        when: 'x∈C',
        to: 'chosen',
        ctx: [{ target: 'sel', expr: 'x' }],
        emit: { event: 'change', arg: 'x' },
      },
      {
        from: 'chosen',
        on: 'clear',
        to: 'empty',
        ctx: [{ target: 'sel', expr: 'none' }],
        emit: { event: 'change', arg: 'none' },
      },
      {
        from: 'any',
        on: 'set',
        to: { expr: 'x?chosen:empty' },
        ctx: [{ target: 'sel', expr: 'x' }],
        note: 'controlled sync, no emit',
      },
    ],
    exposes: [{ state: 'selected', arg: 'x', when: 'state==chosen ∧ sel==x' }],
    emits: [{ name: 'change' }],
    note: 'multiple=set; range=anchor+extent (date range, shift-click, cell range)',
  },
  {
    kind: 'atom',
    name: 'browse',
    doc: 'move a cursor over a collection',
    modes: ['roving', 'spatial', 'tree', 'scroll-detent'],
    requires: [{ anyOf: ['input.keyboard', 'input.remote'], when: 'mode∈{roving,tree}' }],
    params: [{ name: 'C' }, { name: 'mode' }],
    context: [{ name: 'active', type: 'C|none', init: 'none' }],
    events: [
      { name: 'move', args: ['dir'] },
      { name: 'to', args: ['x'] },
    ],
    transitions: [
      {
        from: 'any',
        on: 'move',
        to: 'any',
        ctx: [{ target: 'active', expr: 'neighbor(active,dir,mode,wrap)' }],
        emit: { event: 'activeChanged', arg: 'active' },
      },
      {
        from: 'any',
        on: 'to',
        to: 'any',
        ctx: [{ target: 'active', expr: 'x' }],
        emit: { event: 'activeChanged', arg: 'x' },
      },
    ],
    exposes: [{ state: 'active', arg: 'x', when: 'active==x' }],
    emits: [{ name: 'activeChanged' }],
    note: 'neighbor(): roving=linear · spatial=2D · tree=in/out/sib · scroll-detent=nearest',
  },

  {
    kind: 'atom',
    name: 'presentation',
    doc: 'manage a surface',
    modes: ['inline', 'popover', 'menu', 'sheet', 'dialog', 'push', 'wheel'],
    params: [{ name: 'surface' }],
    states: [{ id: 'closed', initial: true }, { id: 'open' }],
    events: [{ name: 'open' }, { name: 'close' }, { name: 'toggle' }],
    transitions: [
      { from: 'closed', on: 'toggle|open', to: 'open', emit: { event: 'opened' } },
      { from: 'open', on: 'toggle|close', to: 'closed', emit: { event: 'closed' } },
    ],
    exposes: [{ state: 'open', when: 'state==open' }],
    emits: [{ name: 'opened' }, { name: 'closed' }],
    note: 'surface is realization-only',
  },
  {
    kind: 'atom',
    name: 'dismiss',
    doc: 'close on a configured trigger',
    params: [{ name: 'when' }],
    states: [{ id: 'armed', initial: true }],
    events: [{ name: 'trigger' }],
    transitions: [
      { from: 'armed', on: 'trigger', to: 'armed', emit: { event: 'dismissRequested' } },
    ],
    emits: [{ name: 'dismissRequested' }],
    note: 'trigger ∈ configured [outside, escape, commit, swipe-down, timeout]',
  },
  {
    kind: 'atom',
    name: 'focus-scope',
    doc: 'trap / contain / restore focus within a region (modal a11y)',

    requires: [{ anyOf: ['input.keyboard', 'input.remote'] }],
    states: [{ id: 'inactive', initial: true }, { id: 'active' }],
    events: [{ name: 'activate' }, { name: 'deactivate' }],
    transitions: [
      {
        from: 'inactive',
        on: 'activate',
        to: 'active',
        note: 'save prior focus; move focus into region; trap Tab',
      },
      {
        from: 'active',
        on: 'deactivate',
        to: 'inactive',
        note: 'release trap; restore prior focus',
      },
    ],
    note: 'no visual states (exposes none) - a behaviour guarantee, not a paint surface; realized as a focus trap on web, OS-owned on native sheets',
  },

  {
    kind: 'atom',
    name: 'value-entry',
    doc: 'free text/value entry; commit on change|blur|enter',
    params: [{ name: 'value', bind: true }, { name: 'commit' }],
    context: [
      { name: 'value', type: 'V' },
      { name: 'draft', type: 'V', init: 'value' },
    ],
    states: [{ id: 'idle', initial: true }, { id: 'editing' }],
    events: [
      { name: 'focus' },
      { name: 'input', args: ['t'] },
      { name: 'enter' },
      { name: 'blur' },
      { name: 'set', args: ['v'] },
    ],
    transitions: [
      { from: 'idle', on: 'focus', to: 'editing' },
      {
        from: 'editing',
        on: 'input',
        to: 'editing',
        ctx: [{ target: 'draft', expr: 't' }],
        when: 'change∈commit',
        emit: { event: 'change', arg: 't' },
        note: 'value:=t only when change∈commit',
      },
      {
        from: 'editing',
        on: 'enter',
        when: 'enter∈commit',
        to: 'editing',
        ctx: [{ target: 'value', expr: 'draft' }],
        emit: { event: 'change', arg: 'draft' },
      },
      {
        from: 'editing',
        on: 'blur',
        to: 'idle',
        note: 'when blur∈commit: value:=draft, emit change(draft); else draft:=value',
      },
      {
        from: 'any',
        on: 'set',
        to: 'any',
        ctx: [
          { target: 'value', expr: 'v' },
          { target: 'draft', expr: 'v' },
        ],
        note: 'controlled, no emit',
      },
    ],
    exposes: [
      { state: 'focused', when: 'state==editing' },
      { state: 'empty', when: 'value empty' },
      { state: 'dirty', when: 'draft≠value' },
    ],
    emits: [{ name: 'change' }],
  },
  {
    kind: 'atom',
    name: 'range',
    doc: 'value(s) along a min/max track (single/dual thumb)',
    params: [
      { name: 'value', bind: true },
      { name: 'min' },
      { name: 'max' },
      { name: 'step' },
      { name: 'thumbs' },
    ],
    context: [
      { name: 'value', type: 'V|{lo,hi}' },
      { name: 'active', type: 'thumb|none', init: 'none' },
    ],
    states: [{ id: 'idle', initial: true }, { id: 'dragging' }],
    events: [
      { name: 'grab', args: ['t'] },
      { name: 'to', args: ['v'] },
      { name: 'release' },
      { name: 'by', args: ['t', 'd'] },
      { name: 'set', args: ['v'] },
    ],
    transitions: [
      { from: 'idle', on: 'grab', to: 'dragging', ctx: [{ target: 'active', expr: 't' }] },
      {
        from: 'dragging',
        on: 'to',
        to: 'dragging',
        ctx: [{ target: 'value[active]', expr: 'clamp+snap(v); lo≤hi' }],
        emit: { event: 'change', arg: 'value' },
      },
      { from: 'dragging', on: 'release', to: 'idle', emit: { event: 'commit', arg: 'value' } },
      {
        from: 'idle',
        on: 'by',
        to: 'idle',
        ctx: [{ target: 'value[t]', expr: 'clamp(value[t]+d)' }],
        emit: { event: 'change', arg: 'value' },
        note: 'keyboard',
      },
      { from: 'any', on: 'set', to: 'any', ctx: [{ target: 'value', expr: 'v' }] },
    ],
    exposes: [{ state: 'active', arg: 't', when: 'state==dragging ∧ active==t' }],
    emits: [{ name: 'change' }, { name: 'commit' }],
    note: 'live (change) vs committed (commit)',
  },
  {
    kind: 'atom',
    name: 'stepping',
    doc: 'increment/decrement a value',
    params: [{ name: 'value', bind: true }, { name: 'min' }, { name: 'max' }, { name: 'step' }],
    context: [{ name: 'value', type: 'number' }],
    events: [{ name: 'inc' }, { name: 'dec' }, { name: 'set', args: ['v'] }],
    transitions: [
      {
        from: 'any',
        on: 'inc',
        when: 'value+step≤max',
        to: 'any',
        ctx: [{ target: 'value', expr: 'value+step' }],
        emit: { event: 'change', arg: 'value' },
      },
      {
        from: 'any',
        on: 'dec',
        when: 'value-step≥min',
        to: 'any',
        ctx: [{ target: 'value', expr: 'value-step' }],
        emit: { event: 'change', arg: 'value' },
      },
      { from: 'any', on: 'set', to: 'any', ctx: [{ target: 'value', expr: 'clamp(v)' }] },
    ],
    exposes: [
      { state: 'atMin', when: 'value≤min' },
      { state: 'atMax', when: 'value≥max' },
    ],
    emits: [{ name: 'change' }],
  },
  {
    kind: 'atom',
    name: 'validation',
    doc: 'valid/invalid against rules (PURE - does not listen to input)',
    params: [{ name: 'value' }, { name: 'rules' }],
    context: [{ name: 'errors', type: 'list', init: '[]' }],
    states: [{ id: 'pristine', initial: true }, { id: 'valid' }, { id: 'invalid' }],
    events: [{ name: 'check' }, { name: 'reset' }],
    transitions: [
      {
        from: 'any',
        on: 'check',
        to: { expr: 'eval(rules)?valid:invalid' },
        ctx: [{ target: 'errors', expr: 'eval(rules).errors' }],
      },
      { from: 'any', on: 'reset', to: 'pristine', ctx: [{ target: 'errors', expr: '[]' }] },
    ],
    exposes: [
      { state: 'invalid', when: 'state==invalid' },
      { state: 'valid', when: 'state==valid' },
      { state: 'pristine', when: 'state==pristine' },
    ],
    emits: [{ name: 'validity' }],
    note: 'the when:change|blur|submit policy = a wire from value-entry/submission into check',
  },
  {
    kind: 'atom',
    name: 'submission',
    doc: 'form-level orchestration: collective validation, submit, focus-first-error',
    params: [{ name: 'fields' }],
    context: [{ name: 'fields', type: 'set<validation>' }],
    states: [{ id: 'editing', initial: true }, { id: 'submitting' }, { id: 'submitted' }],
    events: [{ name: 'submit' }, { name: 'success' }, { name: 'failure', args: ['e'] }],
    transitions: [
      {
        from: 'editing',
        on: 'submit',
        to: 'editing',
        do: 'broadcast fields.check',
        note: 'when allValid → submitting emit submitStart(values); else → editing do firstInvalid.focus',
      },
      { from: 'submitting', on: 'success', to: 'submitted', emit: { event: 'submitSuccess' } },
      {
        from: 'submitting',
        on: 'failure',
        to: 'editing',
        emit: { event: 'submitError', arg: 'e' },
      },
    ],
    exposes: [
      { state: 'loading', when: 'state==submitting' },
      { state: 'dirty', when: 'any(fields,f→f.dirty)' },
    ],
    emits: [{ name: 'submitStart' }, { name: 'submitSuccess' }, { name: 'submitError' }],
    note: 'fields: DYNAMIC set of validation machines; FAN-OUT broadcast + FAN-IN aggregate/select',
  },

  {
    kind: 'atom',
    name: 'gesture',
    doc: 'swipe | long-press | pinch | pan | drag | drop',
    modes: ['swipe', 'long-press', 'pinch', 'pan', 'drag', 'drop'],
    requires: [{ anyOf: ['input.touch'], when: 'per gesture' }],
    params: [{ name: 'kind' }, { name: 'thresholds' }],
    context: [{ name: 'start' }, { name: 'current' }, { name: 't0' }],
    states: [{ id: 'idle', initial: true }, { id: 'tracking' }, { id: 'recognized' }],
    events: [{ name: 'down', args: ['p'] }, { name: 'move', args: ['p'] }, { name: 'up' }],
    transitions: [
      { from: 'idle', on: 'down', to: 'tracking', ctx: [{ target: 'start', expr: 'p' }] },
      {
        from: 'tracking',
        on: 'move',
        to: 'tracking',
        ctx: [{ target: 'current', expr: 'p' }],
        when: 'exceeds(θ)',
        emit: { event: 'begin' },
        note: 'recognized when threshold exceeded',
      },
      {
        from: 'tracking',
        after: 't',
        to: 'recognized',
        emit: { event: 'begin' },
        note: 'long-press',
      },
      { from: 'tracking', on: 'up', to: 'idle', note: 'canceled, threshold not met' },
      { from: 'recognized', on: 'move', to: 'recognized', emit: { event: 'update', arg: 'delta' } },
      { from: 'recognized', on: 'up', to: 'idle', emit: { event: 'end' } },
    ],
    exposes: [{ state: 'dragging', when: 'state==recognized' }],
    emits: [{ name: 'begin' }, { name: 'update' }, { name: 'end' }],
    note: 'load-bearing: all drag-based interactions compose from it',
  },
  {
    kind: 'atom',
    name: 'async-state',
    doc: 'idle | loading | success | error lifecycle',
    states: [{ id: 'idle', initial: true }, { id: 'loading' }, { id: 'success' }, { id: 'error' }],
    events: [{ name: 'start' }, { name: 'resolve', args: ['v'] }, { name: 'reject', args: ['e'] }],
    transitions: [
      { from: 'any', on: 'start', to: 'loading', do: 'run' },
      { from: 'loading', on: 'resolve', to: 'success', emit: { event: 'success', arg: 'v' } },
      { from: 'loading', on: 'reject', to: 'error', emit: { event: 'error', arg: 'e' } },
    ],
    exposes: [
      { state: 'loading', when: 'state==loading' },
      { state: 'success', when: 'state==success' },
      { state: 'error', when: 'state==error' },
    ],
    emits: [{ name: 'success' }, { name: 'error' }],
  },
  {
    kind: 'atom',
    name: 'navigation',
    doc: 'switch between destinations (carries a history stack)',
    params: [{ name: 'dests' }],
    context: [{ name: 'stack', type: 'list', init: '[root]' }],
    events: [{ name: 'go', args: ['d'] }, { name: 'back' }],
    transitions: [
      {
        from: 'any',
        on: 'go',
        to: 'any',
        ctx: [{ target: 'stack', expr: 'stack.push(d)' }],
        emit: { event: 'navigate', arg: 'current' },
      },
      {
        from: 'any',
        on: 'back',
        when: '|stack|>1',
        to: 'any',
        ctx: [{ target: 'stack', expr: 'stack.pop()' }],
        emit: { event: 'navigate', arg: 'current' },
      },
    ],
    exposes: [{ state: 'current', arg: 'd', when: 'current==d' }],
    emits: [{ name: 'navigate' }],
    note: 'history stack shared with undo/redo, wizard-back; richer than selection.single + activation',
  },
  {
    kind: 'atom',
    name: 'scroll',
    doc: 'observe scroll position: infinite-load, scroll-spy, reveal-on-scroll, parallax',
    params: [{ name: 'region' }],
    context: [{ name: 'pos', init: '0' }],
    events: [{ name: 'scrolled', args: ['p'] }],
    transitions: [
      {
        from: 'any',
        on: 'scrolled',
        to: 'any',
        ctx: [{ target: 'pos', expr: 'p' }],
        emit: { event: 'atEnd', arg: 'p' },
        note: 'emit atEnd when p≥max, nearEnd when p≥max-θ',
      },
    ],
    exposes: [
      { state: 'atStart', when: 'pos≤0' },
      { state: 'atEnd', when: 'pos≥max' },
      { state: 'scrolled', when: 'pos>0' },
    ],
    emits: [{ name: 'atEnd' }, { name: 'nearEnd' }],
    note: 'atEnd → wire → async-state.start = infinite-load',
  },

  {
    kind: 'atom',
    name: 'progress',
    doc: 'determinate / indeterminate completion',
    modes: ['determinate', 'indeterminate'],
    params: [{ name: 'value' }, { name: 'max' }],
    events: [{ name: 'set', args: ['v'] }],
    transitions: [
      {
        from: 'any',
        on: 'set',
        to: 'any',
        ctx: [{ target: 'value', expr: 'v' }],
        emit: { event: 'change', arg: 'value' },
      },
    ],
    exposes: [{ state: 'complete', when: 'value≥max' }],
    emits: [{ name: 'change' }],
  },
  {
    kind: 'atom',
    name: 'liveness',
    doc: 'announce dynamic changes (polite/assertive)',
    modes: ['polite', 'assertive'],
    requires: [{ anyOf: ['a11y.screenreader'] }],
    events: [{ name: 'announce', args: ['msg'] }],
    transitions: [
      { from: 'any', on: 'announce', to: 'any', emit: { event: 'announced', arg: 'msg' } },
    ],
    emits: [{ name: 'announced' }],
  },
]

const composites: CompositeBehavior[] = [
  {
    kind: 'composite',
    name: 'disclosure',
    builtFrom: ['toggle', 'presentation'],
    uses: [
      { atom: 'toggle', as: 'T' },
      { atom: 'presentation', as: 'P', params: { surface: 'inline' } },
    ],
    composition: [{ kind: 'wire', from: 'T.change', to: 'P.toggle' }],
    emits: [{ name: 'toggle' }],
    note: '≈ toggle(expanded) + presentation(inline); exposes expanded',
  },
  {
    kind: 'composite',
    name: 'typeahead',
    builtFrom: ['scheduler', 'browse'],
    uses: [
      { atom: 'scheduler', as: 'S', params: { mode: 'debounce' } },
      { atom: 'browse', as: 'B' },
    ],
    note: 'jump to a member by typed prefix; requires input.keyboard',
  },
  {
    kind: 'composite',
    name: 'dnd',
    builtFrom: ['gesture', 'ordering'],
    note: 'drag-and-drop move/reorder across containers; ordering is a non-behavior (collection mutation)',
  },
  {
    kind: 'composite',
    name: 'resize',
    builtFrom: ['gesture'],
    uses: [{ atom: 'gesture', as: 'G', params: { kind: 'drag' } }],
    note: 'drag-resize a region/panel; requires input.pointer',
  },
  {
    kind: 'composite',
    name: 'auto-dismiss',
    builtFrom: ['scheduler'],
    uses: [{ atom: 'scheduler', as: 'S', params: { mode: 'timeout' } }],
    composition: [{ kind: 'wire', from: 'S.fire', to: 'dismissRequested' }],
    note: 'self-close after a timeout (toast)',
  },
  {
    kind: 'composite',
    name: 'stepping-nav',
    builtFrom: ['navigation'],
    emits: [{ name: 'stepChange' }, { name: 'complete' }],
    note: '≈ navigation(ordered) + constraint; ordered progress through steps; exposes active, complete',
  },
  {
    kind: 'composite',
    name: 'pressability',
    builtFrom: ['gesture'],
    note: 'press/hover/active feedback (ripple, highlight); contributes pressed/hovered feedback states ONLY - does not fire the action (that is activation)',
  },
]

const archetypes: ArchetypeDef[] = [
  {
    kind: 'archetype',
    name: 'Button',
    group: 'Actions',
    contract: 'label/icon, fires action',
    produces: { level: 'phrase', interactive: true },
    anatomy: [
      { name: 'icon', role: 'icon', optional: true },
      { name: 'label', role: 'text' },
    ],

    composes: ['activation', 'pressability', 'async-state?'],
    realizationNote: 'Material FAB/elevated/tonal; iOS .borderedProminent',
  },
  {
    kind: 'archetype',
    name: 'ToggleButton',
    group: 'Actions',
    contract: 'on/off action',
    produces: { level: 'phrase', interactive: true },
    anatomy: [
      { name: 'indicator', role: 'icon', optional: true },
      { name: 'label', role: 'text' },
    ],
    composes: ['toggle', 'pressability'],
  },
  {
    kind: 'archetype',
    name: 'MenuButton',
    group: 'Actions',
    contract: 'opens a menu of actions',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'trigger',
        role: 'control',
        children: [
          { name: 'label', role: 'text' },
          { name: 'indicator', role: 'icon', optional: true },
        ],
      },
      {
        name: 'surface',
        role: 'container',
        children: [{ name: 'item', role: 'item', children: [{ name: 'label', role: 'text' }] }],
      },
    ],
    composes: ['presentation', 'browse', 'typeahead?', 'dismiss'],
  },
  {
    kind: 'archetype',
    name: 'Link',
    group: 'Actions',
    contract: 'navigates',
    produces: { level: 'phrase', interactive: true },
    anatomy: [
      { name: 'label', role: 'text' },
      { name: 'icon', role: 'icon', optional: true },
    ],

    composes: ['activation', 'pressability'],
  },

  {
    kind: 'archetype',
    name: 'Form',
    group: 'Inputs',
    contract: 'a set of fields, one submit',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'content', role: 'container' },
      { name: 'submit', role: 'control', children: [{ name: 'label', role: 'text' }] },
      { name: 'error', role: 'text', optional: true },
    ],
    composes: ['submission'],
  },
  {
    kind: 'archetype',
    name: 'Field',
    group: 'Inputs',
    contract: 'label + control + error/help wrapper',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'label', role: 'text' },
      { name: 'control', role: 'container' },
      { name: 'help', role: 'text', optional: true },
      { name: 'error', role: 'text', optional: true },
    ],
    composes: ['validation'],
  },
  {
    kind: 'archetype',
    name: 'TextField',
    group: 'Inputs',
    contract: 'string value',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'icon', role: 'icon', optional: true },
      { name: 'control', role: 'input' },
    ],
    composes: ['value-entry', 'validation?'],
  },
  {
    kind: 'archetype',
    name: 'TextArea',
    group: 'Inputs',
    contract: 'multiline string value',
    produces: { level: 'region', interactive: false },
    anatomy: [{ name: 'control', role: 'input' }],
    composes: ['value-entry', 'validation?'],
  },
  {
    kind: 'archetype',
    name: 'SearchField',
    group: 'Inputs',
    contract: 'query string + clear',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'icon', role: 'icon', optional: true },
      { name: 'control', role: 'input' },
      { name: 'clear', role: 'control', optional: true },
    ],
    composes: ['value-entry', 'filter?'],
  },
  {
    kind: 'archetype',
    name: 'BooleanInput',
    group: 'Inputs',
    contract: 'one bool',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'control', role: 'input' },
      { name: 'indicator', role: 'icon' },
      { name: 'label', role: 'text', optional: true },
    ],
    composes: ['toggle'],
    realizationNote: 'iOS: checkbox → switch (no indeterminate)',
  },
  {
    kind: 'archetype',
    name: 'ChoiceGroup',
    group: 'Inputs',
    contract: 'one-of-N',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'option',
        role: 'item',
        children: [
          { name: 'indicator', role: 'icon' },
          { name: 'label', role: 'text' },
        ],
      },
    ],

    composes: ['selection.single', 'browse'],
    realizationNote: 'radio stack | segmented (node.group); iOS: radio → wheel/segmented',
  },
  {
    kind: 'archetype',
    name: 'SingleSelect',
    group: 'Inputs',
    contract: 'one of a known set',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'trigger',
        role: 'control',
        children: [
          { name: 'value', role: 'text' },
          { name: 'indicator', role: 'icon' },
        ],
      },
      {
        name: 'surface',
        role: 'container',
        children: [
          {
            name: 'option',
            role: 'item',
            children: [
              { name: 'check', role: 'icon', optional: true },
              { name: 'label', role: 'text' },
            ],
          },
        ],
      },
    ],
    composes: ['selection.single', 'presentation', 'browse', 'dismiss', 'typeahead?'],
    uses: [
      { atom: 'activation', as: 'A' },
      { atom: 'presentation', as: 'P', params: { surface: 'popover' } },
      { atom: 'selection', as: 'S', params: { mode: 'single', over: 'options' } },
      { atom: 'browse', as: 'B', params: { over: 'options', mode: 'roving' } },
      { atom: 'dismiss', as: 'D', params: { when: '[outside,escape]' } },
    ],
    composition: [
      { kind: 'wire', from: 'A.invoke', to: 'P.toggle' },
      { kind: 'wire', from: 'P.opened', to: 'B.to', arg: 'S.sel ?? first' },
      { kind: 'gate', machine: 'D', activeWhen: 'P.open' },
      { kind: 'wire', from: 'D.dismissRequested', to: 'P.close' },
      { kind: 'wire', from: 'option-activate', to: 'S.select', arg: 'B.active' },
      { kind: 'wire', from: 'S.change', to: 'P.close', when: 'closeOnSelect' },
    ],
    exposes: [
      { state: 'open', when: 'P.open' },
      { state: 'selected', when: 'S.selected' },
      { state: 'active', when: 'B.active' },
    ],
    emits: [{ name: 'change', from: 'S.change' }],
    realize: [
      {
        target: 'web',
        surface: 'popover',
        browse: 'roving',
        commit: 'explicit',
        note: 'place bottom-start; flip; matchWidth; commit on click/enter',
      },
      {
        target: 'ios',
        when: 'style=wheel',
        surface: 'inline-wheel',
        browse: 'scroll-detent',
        commit: 'continuous',
        drop: ['activation', 'dismiss'],
        wire: [{ from: 'B.active-changed', to: 'S.select', arg: 'B.active' }],
      },
    ],
    realizationNote: 'web popover-listbox · Android dropdown/dialog · iOS menu/sheet/push/wheel',
  },
  {
    kind: 'archetype',
    name: 'MultiSelect',
    group: 'Inputs',
    contract: 'subset of a set',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'trigger',
        role: 'control',
        children: [
          { name: 'value', role: 'text' },
          { name: 'indicator', role: 'icon' },
        ],
      },
      {
        name: 'surface',
        role: 'container',
        children: [
          {
            name: 'option',
            role: 'item',
            children: [
              { name: 'check', role: 'icon' },
              { name: 'label', role: 'text' },
            ],
          },
        ],
      },
    ],
    composes: ['selection.multiple', 'presentation', 'browse', 'dismiss'],
  },
  {
    kind: 'archetype',
    name: 'Combobox',
    group: 'Inputs',
    contract: 'filtered single-select w/ entry',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'control', role: 'input' },
      {
        name: 'surface',
        role: 'container',
        children: [{ name: 'option', role: 'item', children: [{ name: 'label', role: 'text' }] }],
      },
    ],
    composes: ['value-entry', 'filter', 'selection.single', 'browse', 'presentation', 'dismiss'],
  },
  {
    kind: 'archetype',
    name: 'Slider',
    group: 'Inputs',
    contract: 'value(s) on a range',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'track',
        role: 'container',
        children: [
          { name: 'range', role: 'container', optional: true },
          { name: 'thumb', role: 'control' },
        ],
      },
      { name: 'value', role: 'text', optional: true },
    ],
    composes: ['range', 'gesture(pan)'],
  },
  {
    kind: 'archetype',
    name: 'Stepper',
    group: 'Inputs',
    contract: 'number ±',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'decrement', role: 'control', children: [{ name: 'icon', role: 'icon' }] },
      { name: 'control', role: 'input' },
      { name: 'increment', role: 'control', children: [{ name: 'icon', role: 'icon' }] },
    ],
    composes: ['stepping', 'value-entry'],
  },
  {
    kind: 'archetype',
    name: 'DatePicker',
    group: 'Inputs',
    contract: 'date value',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'trigger',
        role: 'control',
        children: [
          { name: 'value', role: 'text' },
          { name: 'icon', role: 'icon' },
        ],
      },
      {
        name: 'surface',
        role: 'container',
        children: [
          {
            name: 'header',
            role: 'container',
            children: [
              { name: 'prev', role: 'control' },
              { name: 'title', role: 'text' },
              { name: 'next', role: 'control' },
            ],
          },
          {
            name: 'grid',
            role: 'container',
            children: [{ name: 'day', role: 'item', children: [{ name: 'label', role: 'text' }] }],
          },
        ],
      },
    ],

    composes: ['selection.single', 'presentation', 'browse', 'dismiss', 'masking'],
    // Behavior is the shared framework-agnostic calendar core (proposal 0029,
    // targets/behavior/calendar.ts); node.calendar picks single|range + weekStartsOn
    // + disabledWeekdays. The `day` grid cell carries calendar states (today,
    // outsideMonth, selected, rangeStart, rangeEnd, inRange) rendered as data-* attrs.
    realizationNote:
      'web calendar-grid (single|range via node.calendar) · iOS wheel (momentum+detent+haptic) · Android dialog',
  },
  {
    kind: 'archetype',
    name: 'TimePicker',
    group: 'Inputs',
    contract: 'time value',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'trigger',
        role: 'control',
        children: [
          { name: 'value', role: 'text' },
          { name: 'icon', role: 'icon' },
        ],
      },
      {
        name: 'surface',
        role: 'container',
        children: [
          {
            name: 'column',
            role: 'item',
            children: [
              { name: 'option', role: 'item', children: [{ name: 'label', role: 'text' }] },
            ],
          },
        ],
      },
    ],
    composes: ['selection.single', 'presentation', 'browse', 'dismiss', 'masking'],
    // Behavior is the shared framework-agnostic time core (proposal 0029,
    // targets/behavior/timepicker.ts); node.timePicker picks the slot step + 12/24h.
    // Web realization = a listbox of time slots; iOS wheel is a per-platform view.
    realizationNote:
      'web time-slot listbox (step via node.timePicker) · iOS wheel · Android dialog',
  },
  {
    kind: 'archetype',
    name: 'ColorPicker',
    group: 'Inputs',
    contract: 'color value',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'trigger',
        role: 'control',
        children: [
          { name: 'swatch', role: 'icon' },
          { name: 'value', role: 'text' },
        ],
      },
      {
        name: 'surface',
        role: 'container',
        children: [
          { name: 'area', role: 'container' },
          { name: 'hue', role: 'container' },
          { name: 'alpha', role: 'container' },
          { name: 'eyedropper', role: 'control' },
          { name: 'input', role: 'input' },
          {
            name: 'swatches',
            role: 'container',
            children: [{ name: 'swatch', role: 'item' }],
          },
        ],
      },
    ],
    composes: ['range', 'value-entry', 'presentation', 'dismiss'],
    // Behavior is the shared framework-agnostic color core (proposal 0029/0035,
    // targets/behavior/color.ts): HSV<->RGB<->hex + OKLCH math and the area/hue/alpha
    // geometry, so every target computes an identical picker. node.colorPicker (0035)
    // picks the working space (srgb|oklch), the editable format tabs (hex/rgb/hsl/hsb),
    // opacity, eyedropper, preset swatches, and popover-vs-inline layout. The `alpha`,
    // `eyedropper` and `swatches` parts render only when their config flag is on.
    realizationNote:
      'web: SV/OKLCH area + hue + optional alpha, format tabs, eyedropper, swatches, popover|inline · native color input fallback',
  },
  {
    kind: 'archetype',
    name: 'FileUpload',
    group: 'Inputs',
    contract: 'file(s)',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'dropzone',
        role: 'container',
        children: [
          { name: 'icon', role: 'icon' },
          { name: 'label', role: 'text' },
        ],
      },
      { name: 'input', role: 'input' },
      {
        name: 'list',
        role: 'container',
        optional: true,
        children: [
          {
            name: 'item',
            role: 'item',
            children: [
              { name: 'name', role: 'text' },
              { name: 'remove', role: 'control' },
            ],
          },
        ],
      },
    ],

    composes: ['activation', 'gesture(drop)?', 'async-state'],
  },
  {
    kind: 'archetype',
    name: 'TagsInput',
    group: 'Inputs',
    contract: 'list of tokens',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'tag',
        role: 'item',
        children: [
          { name: 'label', role: 'text' },
          { name: 'remove', role: 'control' },
        ],
      },
      { name: 'control', role: 'input' },
    ],
    composes: ['value-entry', 'selection.multiple'],
  },
  {
    kind: 'archetype',
    name: 'Rating',
    group: 'Inputs',
    contract: 'discrete score',
    produces: { level: 'region', interactive: false },
    anatomy: [{ name: 'item', role: 'item', children: [{ name: 'icon', role: 'icon' }] }],
    composes: ['selection.single', 'pressability'],
  },

  {
    kind: 'archetype',
    name: 'Disclosure',
    group: 'Disclosure',
    contract: 'expand region (a.k.a. Collapsible)',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'trigger',
        role: 'control',
        children: [
          { name: 'label', role: 'text' },
          { name: 'indicator', role: 'icon' },
        ],
      },
      { name: 'panel', role: 'container' },
    ],
    composes: ['disclosure'],
  },
  {
    kind: 'archetype',
    name: 'Accordion',
    group: 'Disclosure',
    contract: 'group of disclosures (single/multi)',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'item',
        role: 'item',
        children: [
          {
            name: 'header',
            role: 'control',
            children: [
              { name: 'label', role: 'text' },
              { name: 'indicator', role: 'icon' },
            ],
          },
          { name: 'panel', role: 'container' },
        ],
      },
    ],
    composes: ['disclosure', 'selection'],
  },
  {
    kind: 'archetype',
    name: 'Tabs',
    group: 'Disclosure',
    contract: 'switch panels',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'list',
        role: 'container',
        children: [{ name: 'tab', role: 'control', children: [{ name: 'label', role: 'text' }] }],
      },
      { name: 'panel', role: 'container' },
    ],
    composes: ['navigation', 'browse'],
    realizationNote: 'mobile: swipe-between; web: no swipe',
  },
  {
    kind: 'archetype',
    name: 'Dialog',
    group: 'Disclosure',
    contract: 'blocking layer (a.k.a. Modal)',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'trigger', role: 'control', children: [{ name: 'label', role: 'text' }] },
      { name: 'backdrop', role: 'container', optional: true },
      {
        name: 'surface',
        role: 'container',
        children: [
          { name: 'title', role: 'text' },
          { name: 'content', role: 'container' },
          { name: 'close', role: 'control', optional: true },
        ],
      },
    ],
    composes: ['presentation(dialog)', 'focus-scope', 'dismiss', 'backdrop'],
    realizationNote: 'iOS sheet w/ detents',
  },
  {
    kind: 'archetype',
    name: 'Drawer',
    group: 'Disclosure',
    contract: 'edge-anchored panel (a.k.a. Sidebar)',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'trigger', role: 'control' },
      { name: 'backdrop', role: 'container', optional: true },
      {
        name: 'surface',
        role: 'container',
        children: [
          { name: 'content', role: 'container' },
          { name: 'close', role: 'control', optional: true },
        ],
      },
    ],
    composes: ['presentation(sheet)', 'focus-scope', 'dismiss', 'gesture(swipe)?'],
  },
  {
    kind: 'archetype',
    name: 'Popover',
    group: 'Disclosure',
    contract: 'anchored transient layer',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'trigger', role: 'control' },
      { name: 'surface', role: 'container', children: [{ name: 'content', role: 'container' }] },
    ],
    composes: ['presentation(popover)', 'anchoring', 'dismiss'],
  },
  {
    kind: 'archetype',
    name: 'Tooltip',
    group: 'Disclosure',
    contract: 'hover/focus hint',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'trigger', role: 'control' },
      { name: 'surface', role: 'container', children: [{ name: 'content', role: 'text' }] },
    ],
    composes: ['presentation(popover)', 'anchoring'],
    realizationNote: 'requires input.pointer → tap/long-press fallback',
  },
  {
    kind: 'archetype',
    name: 'ContextMenu',
    group: 'Disclosure',
    contract: 'secondary-action menu',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'surface',
        role: 'container',
        children: [
          {
            name: 'item',
            role: 'item',
            children: [
              { name: 'icon', role: 'icon', optional: true },
              { name: 'label', role: 'text' },
            ],
          },
        ],
      },
    ],
    composes: ['presentation(menu)', 'browse', 'dismiss'],
    realizationNote: 'right-click / long-press',
  },

  {
    kind: 'archetype',
    name: 'Menu',
    group: 'Navigation',
    contract: 'hierarchical actions (a.k.a. MenuBar)',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'surface',
        role: 'container',
        children: [
          {
            name: 'item',
            role: 'item',
            children: [
              { name: 'icon', role: 'icon', optional: true },
              { name: 'label', role: 'text' },
            ],
          },
        ],
      },
    ],
    composes: ['presentation', 'browse', 'typeahead?', 'dismiss'],
  },
  {
    kind: 'archetype',
    name: 'NavigationBar',
    group: 'Navigation',
    contract: 'top-level destinations',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'item',
        role: 'item',
        children: [
          { name: 'icon', role: 'icon', optional: true },
          { name: 'label', role: 'text' },
        ],
      },
    ],
    composes: ['navigation'],
    realizationNote: 'web top-nav · iOS tab-bar · Android bottom-nav/rail',
  },
  {
    kind: 'archetype',
    name: 'Breadcrumbs',
    group: 'Navigation',
    contract: 'path trail',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'item', role: 'item', children: [{ name: 'label', role: 'text' }] },
      { name: 'separator', role: 'icon', optional: true },
    ],
    composes: ['navigation'],
    realizationNote: 'iOS: → nav title + back',
  },
  {
    kind: 'archetype',
    name: 'Pagination',
    group: 'Navigation',
    contract: 'page index',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'previous', role: 'control' },
      { name: 'item', role: 'item', children: [{ name: 'label', role: 'text' }] },
      { name: 'next', role: 'control' },
    ],
    composes: ['navigation', 'stepping'],
  },
  {
    kind: 'archetype',
    name: 'Tree',
    group: 'Navigation',
    contract: 'hierarchical collection',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'item',
        role: 'item',
        children: [
          { name: 'indicator', role: 'icon' },
          { name: 'label', role: 'text' },
        ],
      },
    ],
    composes: ['disclosure', 'browse', 'selection'],
  },
  {
    kind: 'archetype',
    name: 'Wizard',
    group: 'Navigation',
    contract: 'ordered flow (a.k.a. Stepper-nav)',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'step',
        role: 'item',
        children: [
          { name: 'indicator', role: 'icon' },
          { name: 'label', role: 'text' },
        ],
      },
      { name: 'content', role: 'container' },
      { name: 'back', role: 'control' },
      { name: 'next', role: 'control' },
    ],
    composes: ['stepping-nav'],
  },

  {
    kind: 'archetype',
    name: 'List',
    group: 'Collections',
    contract: 'ordered items, optional select (a.k.a. ListBox)',
    produces: { level: 'region', interactive: false },
    anatomy: [{ name: 'item', role: 'item', children: [{ name: 'content', role: 'container' }] }],
    composes: ['browse', 'selection?', 'virtualization?'],
    realizationNote: 'iOS list: swipe-to-delete (gesture)',
  },
  {
    kind: 'archetype',
    name: 'Table',
    group: 'Collections',
    contract: 'rows×cols, sort/select (a.k.a. DataGrid)',
    produces: { level: 'region', interactive: false },
    anatomy: [
      {
        name: 'header',
        role: 'container',
        children: [{ name: 'column', role: 'item', children: [{ name: 'label', role: 'text' }] }],
      },
      {
        name: 'body',
        role: 'container',
        children: [{ name: 'row', role: 'item', children: [{ name: 'cell', role: 'item' }] }],
      },
    ],
    composes: ['selection?', 'ordering', 'browse', 'resize?', 'virtualization?'],
    realizationNote: 'aggregation/grouping is data, not a behavior',
  },
  {
    kind: 'archetype',
    name: 'Carousel',
    group: 'Collections',
    contract: 'paged horizontal items',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'viewport', role: 'container', children: [{ name: 'slide', role: 'item' }] },
      { name: 'previous', role: 'control', optional: true },
      { name: 'next', role: 'control', optional: true },
    ],
    composes: ['browse', 'momentum-scroll', 'gesture(swipe)'],
  },
  {
    kind: 'archetype',
    name: 'Grid',
    group: 'Collections',
    contract: '2D arrangement of items',
    produces: { level: 'region', interactive: false },
    anatomy: [{ name: 'item', role: 'item' }],
    composes: ['browse', 'selection?'],
  },

  {
    kind: 'archetype',
    name: 'Toast',
    group: 'Feedback',
    contract: 'transient message (a.k.a. Snackbar)',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'icon', role: 'icon', optional: true },
      { name: 'content', role: 'text' },
      { name: 'action', role: 'control', optional: true },
      { name: 'close', role: 'control', optional: true },
    ],
    composes: ['presentation', 'auto-dismiss', 'liveness'],
    realizationNote: 'iOS: top banner; Android: snackbar bottom',
  },
  {
    kind: 'archetype',
    name: 'Alert',
    group: 'Feedback',
    contract: 'inline persistent message (a.k.a. Banner)',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'icon', role: 'icon', optional: true },
      { name: 'title', role: 'text', optional: true },
      { name: 'content', role: 'text' },
      { name: 'close', role: 'control', optional: true },
    ],
    composes: ['liveness'],
  },
  {
    kind: 'archetype',
    name: 'ProgressBar',
    group: 'Feedback',
    contract: 'completion feedback (a.k.a. Spinner)',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'track', role: 'container', children: [{ name: 'indicator', role: 'container' }] },
      { name: 'label', role: 'text', optional: true },
    ],

    composes: ['progress', 'liveness'],
  },
  {
    kind: 'archetype',
    name: 'Skeleton',
    group: 'Feedback',
    contract: 'loading placeholder',
    produces: { level: 'region', interactive: false },
    composes: ['async-state'],
  },
  {
    kind: 'archetype',
    name: 'Badge',
    group: 'Feedback',
    contract: 'numeric/status decoration',
    produces: { level: 'phrase', interactive: false },
    anatomy: [{ name: 'label', role: 'text' }],
    composes: [],
  },
  {
    kind: 'archetype',
    name: 'Meter',
    group: 'Feedback',
    contract: 'numeric gauge',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'track', role: 'container', children: [{ name: 'indicator', role: 'container' }] },
      { name: 'label', role: 'text', optional: true },
    ],
    composes: [],
  },
  {
    kind: 'archetype',
    name: 'EmptyState',
    group: 'Feedback',
    contract: 'no-content placeholder',
    produces: { level: 'region', interactive: false },
    anatomy: [
      { name: 'icon', role: 'icon', optional: true },
      { name: 'title', role: 'text' },
      { name: 'description', role: 'text', optional: true },
      { name: 'action', role: 'control', optional: true },
    ],
    composes: [],
  },

  {
    kind: 'archetype',
    name: 'Avatar',
    group: 'Media',
    contract: 'identity image/initials',
    produces: { level: 'phrase', interactive: false },
    anatomy: [
      { name: 'image', role: 'content' },
      { name: 'fallback', role: 'text', optional: true },
      { name: 'badge', role: 'icon', optional: true },
    ],
    composes: [],
  },
  {
    kind: 'archetype',
    name: 'Media',
    group: 'Media',
    contract: 'image/video/audio/embed w/ alt + fit (proposal 0028)',
    produces: { level: 'phrase', interactive: false },
    anatomy: [{ name: 'media', role: 'content' }],
    composes: [],
  },
  {
    kind: 'archetype',
    name: 'Icon',
    group: 'Media',
    contract: 'vector glyph from a set',
    produces: { level: 'phrase', interactive: false },
    composes: [],
  },
  {
    kind: 'archetype',
    name: 'AspectRatio',
    group: 'Media',
    contract: 'ratio-locked box',
    produces: { level: 'region', interactive: false },
    anatomy: [{ name: 'content', role: 'container' }],
    composes: [],
    realizationNote: 'layout facet, not a behavioral archetype',
  },
]

const facets: FacetDef[] = [
  { name: 'fill', covers: 'surface/background' },
  { name: 'ink', covers: 'text + icon foreground' },
  {
    name: 'border',
    covers: 'edge: color + width (hairline|thin|thick) + style',
    divergence: 'iOS often overlay-stroke',
  },
  { name: 'border.top', covers: 'top edge (physical side)' },
  { name: 'border.right', covers: 'right edge (physical side)' },
  { name: 'border.bottom', covers: 'bottom edge (physical side)' },
  { name: 'border.left', covers: 'left edge (physical side)' },
  { name: 'border.inline-start', covers: 'leading edge (logical, writing-direction)' },
  { name: 'border.inline-end', covers: 'trailing edge (logical, writing-direction)' },
  { name: 'border.block-start', covers: 'block-start edge (logical)' },
  { name: 'border.block-end', covers: 'block-end edge (logical)' },
  { name: 'corner', covers: 'corner radius (token role)' },
  { name: 'inset', covers: 'internal padding (block/inline)' },
  { name: 'gap', covers: 'spacing between children' },
  {
    name: 'text',
    covers: 'typography role (body|caption|title…) - bundles size/weight/line/tracking',
    divergence: 'iOS Dynamic Type = OS-resolved role',
  },
  {
    name: 'textClamp',
    covers: 'truncate to N lines + ellipsis',
    divergence: 'web -webkit-line-clamp · .lineLimit · maxLines+overflow',
  },
  { name: 'textWrap', covers: 'wrap | nowrap | break' },
  {
    name: 'weight',
    covers: 'font-weight (typography axis §3, split out of the `text` role bundle)',
    divergence: 'web font-weight · .fontWeight · TextStyle.fontWeight',
  },
  {
    name: 'font',
    covers: 'font-family (typography axis §3)',
    divergence: 'web font-family · UIFont · Typeface',
  },
  { name: 'slant', covers: 'font-style: normal | italic | oblique (typography axis §3)' },
  {
    name: 'elevation',
    covers: 'depth',
    divergence: 'web box-shadow · Android tonal-elevation · iOS none/sheet',
  },
  {
    name: 'overlay',
    covers: 'state layer (Material hover/press tint)',
    divergence: 'Material-specific; web ≈ bg shift',
  },
  { name: 'opacity', covers: 'transparency' },
  {
    name: 'ring',
    covers: 'focus indicator',
    divergence: 'desktop ring · mobile none · tv strong highlight',
  },
  { name: 'backdrop', covers: 'scrim / blur behind layer', divergence: 'iOS material/vibrancy' },
]

// Which behaviour emits each UI state. Total over the vocabulary's `STATE_NAMES`, so a word added
// there is a compile error here until it says where it comes from, and the taxonomy cannot list a
// word the reader does not accept (see the vocabulary's own note for what left this list, and why).
const STATE_SOURCES: Record<StateName, string> = {
  hovered: 'pressability',
  pressed: 'pressability',
  focused: 'value-entry',
  'focus-visible': 'value-entry (keyboard focus)',
  active: 'browse',
  selected: 'selection',
  checked: 'toggle',
  indeterminate: 'toggle (tristate)',
  expanded: 'disclosure',
  open: 'presentation',
  disabled: 'ambient (global gate)',
  readonly: 'ambient',
  loading: 'async-state',
  error: 'async-state',
  success: 'async-state',
  first: 'collection-position',
  last: 'collection-position',
  odd: 'collection-position',
  even: 'collection-position',
  today: 'the calendar core (DatePicker day)',
  'outside-month': 'the calendar core (DatePicker day)',
  'range-start': 'the calendar core (range mode)',
  'range-end': 'the calendar core (range mode)',
  'in-range': 'the calendar core (range mode)',
  highlighted: 'browse (the calendar cursor)',
}

const states: StateDef[] = STATE_NAMES.map((name) => ({ name, from: STATE_SOURCES[name] }))

const capabilities: CapabilityDef[] = [
  { name: 'input.keyboard' },
  { name: 'input.pointer', note: 'hover' },
  { name: 'input.touch' },
  { name: 'input.remote', note: 'tv focus engine' },

  {
    name: 'input.voice',
    status: 'aspirational',
    note: 'aspirational - declared but consumed by no atom yet (no voice/turn-taking machine in v0); see NOTES-modality-coverage',
  },
  { name: 'motion.haptic' },
  { name: 'runtime.dynamic-color', note: 'Material You' },
  { name: 'display.density' },
  { name: 'a11y.screenreader' },
  { name: 'platform.web' },
  { name: 'platform.ios' },
  { name: 'platform.android' },
  { name: 'platform.tvos' },
]

const decorations: TaxonomyNote[] = [
  {
    name: 'motion',
    note: 'decorates existing transitions (spring/flip/fade+slide); adds no states',
  },
  {
    name: 'masking',
    note: 'format/constrain entry (date/phone/currency) - decorates value-entry draft',
  },

  {
    name: 'anchoring',
    note: 'position a surface relative to a reference (placement/flip/offset/match-size) - decorates presentation(popover|menu)',
  },
  {
    name: 'backdrop',
    note: 'scrim / blur behind a layer - decorates a modal presentation; painted via the `backdrop` facet on the backdrop anatomy part',
  },
  {
    name: 'momentum-scroll',
    note: 'inertial scroll with snap / detent - decorates scroll/browse on touch surfaces',
  },
]

const nonBehaviors: TaxonomyNote[] = [
  { name: 'filter', note: 'derived view over a collection (data, not interaction)' },
  { name: 'virtualization', note: 'render windowing' },
  { name: 'ordering', note: 'collection mutation (reorder/sort)' },
  { name: 'aggregation', note: 'data transformation (grouping/totals) - DataGrid math' },
]

export const preludeV0: PreludeDocument = {
  milda: '0.0.1',
  kind: 'prelude',
  // The prelude names its own version from the one constant the reader and the writer stamp
  // into a file header. As two literals they had parted: this said 0.0.1 for months after
  // the anatomy tree (proposal 0005) made it 0.0.2 everywhere else.
  prelude: PRELUDE_VERSION,
  meta: {
    id: 'prelude.milda',
    name: 'Milda Prelude',
    version: PRELUDE_VERSION,
    description: 'Built-in standard library: atoms, archetypes, facets, states, capabilities.',
  },
  atoms,
  composites,
  archetypes,
  facets,
  states,
  capabilities,
  decorations,
  nonBehaviors,
}

export const atomsByName: Record<string, Atom> = Object.fromEntries(atoms.map((a) => [a.name, a]))
export const compositesByName: Record<string, CompositeBehavior> = Object.fromEntries(
  composites.map((c) => [c.name, c]),
)
export const archetypesByName: Record<string, ArchetypeDef> = Object.fromEntries(
  archetypes.map((a) => [a.name, a]),
)
