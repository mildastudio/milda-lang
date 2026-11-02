import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '../index'

// ─── Recovery from one bad statement stays inside that statement ──────────────
// A facet points AT a token; the token is what carries a context alias. So
// `fill alias by Size { … }` has no home in the format - and the parser used to read
// `alias` as a raw enum word and then skip to the first terminator, which sat INSIDE the
// `{ … }` it had already opened. The `{` was left unmatched, so every following brace
// closed one scope too early: the bad facet closed its part, the part's `}` closed the
// component, and the component's own members (`realize`) were read at the top level.
// One mistyped line in a highlight-corpus fixture produced seven "unexpected top-level"
// errors on the lines after it, and the real cause was reported nowhere.

const bad = [
  'component Menu "a disclosure menu" {',
  '  archetype Menu',
  '  part item {',
  '    fill alias by Size { S1 -> accent.3; default -> accent.9 }',
  '  }',
  '  realize web { drop item }',
  '}',
].join('\n')

describe('a facet value that cannot be context-aliased', () => {
  it('is reported where it is written, as one error', () => {
    const { issues } = parseMildaDocument(bad)
    const errors = issues.filter((i) => i.severity === 'error')
    expect(errors.length).toBe(1)
    expect(errors[0]).toMatchObject({ code: 'facet-alias', line: 4 })
    expect(errors[0]?.message).toContain('fill')
  })

  it('does not leak out of its own statement - the component still closes', () => {
    const { document, issues } = parseMildaDocument(bad)
    expect(issues.filter((i) => i.code === 'top-level')).toEqual([])
    expect(document.components.map((c) => c.name)).toEqual(['Menu'])
    // The members that FOLLOW the bad line are still read as members of the component.
    expect(document.components[0]?.realize.map((r) => r.target)).toEqual(['web'])
  })
})

describe('an unknown facet whose value opens a block', () => {
  it('skips the block whole rather than unbalancing the braces', () => {
    const src = [
      'component Menu "m" {',
      '  archetype Menu',
      '  part item {',
      '    nosuchfacet { a -> b; c -> d }',
      '  }',
      '  realize web { drop item }',
      '}',
    ].join('\n')
    const { document, issues } = parseMildaDocument(src)
    expect(issues.map((i) => i.code)).toContain('facet-unknown')
    expect(issues.filter((i) => i.code === 'top-level')).toEqual([])
    expect(document.components[0]?.realize.map((r) => r.target)).toEqual(['web'])
  })
})
