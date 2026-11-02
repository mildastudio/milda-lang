import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '../dsl/parse'
import { preludeV0 } from '../prelude/preludeV0'
import { validate } from './validate'
import type { Project } from '../types/project'

const codes = (dsl: string): string[] =>
  validate(parseMildaDocument(dsl).document as unknown as Project, preludeV0).map((i) => i.code)

describe('validate - archetype checks', () => {
  it('does not flag an archetype-less (structural) component', () => {
    // Box/Flex/Heading/Text… declare no archetype - that is legal, not an error.
    expect(codes('component Box "layout primitive" {\n  part root { }\n}')).not.toContain(
      'component.unknownArchetype',
    )
  })

  it('still flags a declared but unknown archetype', () => {
    expect(codes('component Widget {\n  archetype Nonexistent\n}')).toContain(
      'component.unknownArchetype',
    )
  })
})

describe('validate - alias-group checks', () => {
  it('does not flag a default-only alias (unconditional ref sugar has an empty `by`)', () => {
    const dsl = [
      'foundations {',
      '  token x/a : dimension = { value: 1; unit: px }',
      '  token x/b : dimension = x.a', // ref sugar → alias { by: '', refs: { default: tok.x.a } }
      '}',
    ].join('\n')
    expect(codes(dsl)).not.toContain('alias.unknownGroup')
  })

  // ── an alias has to cover its group ──
  // A context with no line has no value in that context: the theme is short an entry and
  // nothing said so. The empty block (`alias by Mode {}`) is the parser's own `alias-empty`,
  // so the two checks never both fire on one alias.
  describe('coverage of the group', () => {
    const dsl = (aliasBody: string) =>
      [
        'context-group Mode { Light Dark }',
        'foundations {',
        '  token black : color = hex(000)',
        '  token white : color = hex(fff)',
        `  token text : color = alias by Mode {${aliasBody}}`,
        '}',
      ].join('\n')

    it('flags a context the alias left out', () => {
      const issues = validate(
        parseMildaDocument(dsl(' Light -> black ')).document as unknown as Project,
        preludeV0,
      )
      const missing = issues.filter((i) => i.code === 'alias.missingContexts')
      expect(missing).toHaveLength(1)
      expect(missing[0].message).toContain('Dark')
      expect(missing[0].severity).toBe('error')
      // It points at the token, so an editor can put it on the right line.
      expect(missing[0].id).toBe('tok.text')
    })

    it('says nothing when every context is covered, or a default stands in', () => {
      expect(codes(dsl(' Light -> black; Dark -> white '))).not.toContain('alias.missingContexts')
      expect(codes(dsl(' Light -> black; default -> white '))).not.toContain(
        'alias.missingContexts',
      )
    })

    it('leaves the empty block to the parser rather than reporting it twice', () => {
      expect(codes(dsl(''))).not.toContain('alias.missingContexts')
      expect(parseMildaDocument(dsl('')).issues.map((i) => i.code)).toContain('alias-empty')
    })

    it('says nothing about a group it cannot see (a sibling file may declare it)', () => {
      const alone = 'foundations {\n  token t : color = alias by Elsewhere { A -> t }\n}'
      expect(codes(alone)).not.toContain('alias.missingContexts')
    })
  })
})

describe('parser - an empty alias block', () => {
  it('is an error: it resolves to nothing, in every context', () => {
    const { issues } = parseMildaDocument(
      'context-group Mode { Light Dark }\nfoundations {\n  token t : color = alias by Mode {}\n}',
    )
    const empty = issues.filter((i) => i.code === 'alias-empty')
    expect(empty).toHaveLength(1)
    expect(empty[0]).toMatchObject({ severity: 'error', line: 3 })
    expect(empty[0].message).toContain('Mode')
  })

  it('says nothing about an alias that has lines', () => {
    const { issues } = parseMildaDocument(
      'context-group Mode { Light Dark }\nfoundations {\n' +
        '  token b : color = hex(000)\n  token t : color = alias by Mode { Light -> b; Dark -> b }\n}',
    )
    expect(issues.filter((i) => i.code === 'alias-empty')).toEqual([])
  })
})

describe('parser - enum facet values', () => {
  it('treats an undotted facet keyword as a raw value, not a token ref', () => {
    const { document } = parseMildaDocument(
      'component T "text" {\n  part root { text.wrap wrap }\n}',
    )
    const facets = document.components[0].anatomy.root?.facets
    // Before the fix this lowered to { token: 'tok.wrap' } → a dangling-token error.
    expect(facets?.textWrap).toEqual({ raw: 'wrap' })
  })
})

describe('parser - typography facets (0035: weight / font / slant)', () => {
  it('carries weight/font/slant into the AST facet map instead of dropping them', () => {
    const dsl = [
      'component T "text" {',
      '  part root {',
      '    weight weight.bold',
      '    font font.mono',
      '    slant italic',
      '  }',
      '}',
    ].join('\n')
    const { document, issues } = parseMildaDocument(dsl)
    const facets = document.components[0].anatomy.root?.facets
    expect(facets?.weight).toEqual({ token: 'tok.weight.bold' })
    expect(facets?.font).toEqual({ token: 'tok.font.mono' })
    expect(facets?.slant).toEqual({ raw: 'italic' }) // font-style is an enum keyword
    // No more "facet has no AST FacetMap home" warning for these axes.
    expect(issues.map((i) => i.code)).not.toContain('facet-nohome')
  })

  it('parses `font-weight` as a first-class token type with a numeric value', () => {
    const { document, issues } = parseMildaDocument(
      'foundations {\n  token weight/bold : font-weight = raw 700\n}',
    )
    const tok = document.foundations.layers[0].tokens[0]
    expect(tok.type).toBe('fontWeight')
    expect(tok.value).toEqual({ kind: 'raw', value: { weight: 700 } })
    // No longer flagged as a non-canonical token type.
    expect(issues.map((i) => i.code)).not.toContain('token-type')
  })
})

// ─── token first, literal second (proposal 0049) ───
// The parser mints a token id for every word in a layout position and in the inset/border facets,
// so a literal arrives here looking exactly like a reference. The Studio's own export is full of
// them (`gap 0px`, `fixed(50%)`, `border transparent Hairline`), and calling each one a missing
// token put red squiggles on valid lines in every editor that runs this pass.
describe('validate - literals in token positions', () => {
  const component = (body: string) =>
    [
      'foundations {',
      '  token accent/3 : color = hex(39f)',
      '  token SM : dimension = { value: 8; unit: px }',
      '}',
      'component Box {',
      '  part root {',
      ...body.split('\n').map((l) => `    ${l}`),
      '  }',
      '}',
    ].join('\n')
  const dangling = (body: string) =>
    codes(component(body)).filter(
      (c) => c === 'facet.danglingToken' || c === 'layout.danglingToken',
    )

  it('reads a length, a percentage, a number and a colour keyword as literals', () => {
    expect(dangling('layout { gap 0px; size fixed(50%) fixed(16px) }')).toEqual([])
    expect(dangling('layout { gap 0 }')).toEqual([])
    expect(dangling('inset 6px SM')).toEqual([])
    expect(dangling('border transparent Hairline')).toEqual([])
    expect(dangling('border #39f Hairline')).toEqual([])
  })

  it('still reports a misspelled token, in every position that mints one', () => {
    expect(dangling('layout { gap acent-3 }')).toEqual(['layout.danglingToken'])
    expect(dangling('layout { size fixed(acent-3) fill }')).toEqual(['layout.danglingToken'])
    expect(dangling('inset acent-3')).toEqual(['facet.danglingToken'])
    expect(dangling('border acent-3 Hairline')).toEqual(['facet.danglingToken'])
    expect(dangling('fill acent.3')).toEqual(['facet.danglingToken'])
  })

  it('asks the foundations first, so a token named like a literal is still a token', () => {
    expect(dangling('layout { gap SM }')).toEqual([])
    expect(dangling('fill accent.3')).toEqual([])
  })
})
