import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '../dsl/parse'
import { preludeV0 } from '../prelude/preludeV0'
import { validate } from './validate'
import type { Project } from '../types/project'

const codes = (dsl: string): string[] =>
  validate(parseMildaDocument(dsl).document as unknown as Project, preludeV0).map((i) => i.code)

describe('validate — archetype checks', () => {
  it('does not flag an archetype-less (structural) component', () => {
    // Box/Flex/Heading/Text… declare no archetype — that is legal, not an error.
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

describe('validate — alias-group checks', () => {
  it('does not flag a default-only alias (unconditional ref sugar has an empty `by`)', () => {
    const dsl = [
      'foundations {',
      '  token x/a : dimension = { value: 1; unit: px }',
      '  token x/b : dimension = x.a', // ref sugar → alias { by: '', refs: { default: tok.x.a } }
      '}',
    ].join('\n')
    expect(codes(dsl)).not.toContain('alias.unknownGroup')
  })
})

describe('parser — enum facet values', () => {
  it('treats an undotted facet keyword as a raw value, not a token ref', () => {
    const { document } = parseMildaDocument('component T "text" {\n  part root { text.wrap wrap }\n}')
    const facets = document.components[0].anatomy.root?.facets
    // Before the fix this lowered to { token: 'tok.wrap' } → a dangling-token error.
    expect(facets?.textWrap).toEqual({ raw: 'wrap' })
  })
})

describe('parser — typography facets (0035: weight / font / slant)', () => {
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
