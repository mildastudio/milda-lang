import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '../index'

// ─── A skipped character is reported, not swallowed ───────────────────────────
// The lexer skips a character it cannot tokenize rather than failing the file, which is right:
// a half-typed document must still parse. But it used to skip SILENTLY, and inside a literal
// that changes the value: `hex(őfff)` lexed as `hex(fff)` - a white token, no issue, nothing to
// tell the author their `ő` had been eaten. Found in a real file someone was typing.
//
// The same silent-loss class as everything else proposal 0041 had to fix, one layer lower.

describe('an unrecognized character', () => {
  it('is reported as a warning, with its position', () => {
    const { issues } = parseMildaDocument('foundations {\n  token white: color = hex(őfff)\n}\n')
    const skipped = issues.filter((i) => i.code === 'unexpected-character')
    expect(skipped.length).toBe(1)
    expect(skipped[0]).toMatchObject({ severity: 'warning', line: 2, col: 28 })
    expect(skipped[0]?.message).toContain('ő')
  })

  it('does not make the file fatal - the rest still parses', () => {
    const { document, issues } = parseMildaDocument(
      'foundations {\n  token white: color = hex(őfff)\n}\n',
    )
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(document.foundations.layers[0]?.tokens.map((t) => t.name)).toEqual(['white'])
  })

  it('leaves a clean file clean', () => {
    const { issues } = parseMildaDocument('foundations {\n  token white: color = hex(fff)\n}\n')
    expect(issues.filter((i) => i.code === 'unexpected-character')).toEqual([])
  })

  it('reports an alias that points at a token of another kind', () => {
    // The other half of the same file someone was typing: a colour aliased to a radius token.
    // Not a parse error - every word is legal - just a system that cannot work. The check runs
    // after the whole document is read, because an alias may legitimately point FORWARD at a
    // token declared further down (as it does here).
    const { issues } = parseMildaDocument(
      'context-group ColorScheme { Light Dark }\n' +
        'foundations {\n' +
        '  token black: color = hex(000)\n' +
        '  token color/text: color = alias by ColorScheme {\n' +
        '    Light -> black\n' +
        '    Dark -> radius.xs\n' +
        '  }\n' +
        '  token radius/xs: radius = 2px\n' +
        '}\n',
    )
    const mismatch = issues.filter((i) => i.code === 'alias-type-mismatch')
    expect(mismatch.length).toBe(1)
    // An error: a length arrives in a colour slot, so every theme built from this document
    // is wrong wherever that context is active.
    expect(mismatch[0]).toMatchObject({ severity: 'error', line: 6 })
    expect(mismatch[0]?.message).toContain('radius/xs')
    // The legal leg of the same alias says nothing.
    expect(issues.filter((i) => i.message.includes('black'))).toEqual([])
  })

  it('says nothing when the families agree, even across types', () => {
    // `ring` and `backdrop` ARE colours, and every length type fills a length slot - which is
    // why the check compares families rather than exact types.
    const { issues } = parseMildaDocument(
      'context-group Mode { A B }\n' +
        'foundations {\n' +
        '  token focus: ring = hex(00f)\n' +
        '  token accent: color = alias by Mode { A -> focus; B -> focus }\n' +
        '  token gap/sm: spacing = 4px\n' +
        '  token pad: size = alias by Mode { A -> gap.sm; B -> gap.sm }\n' +
        '}\n',
    )
    expect(issues.filter((i) => i.code === 'alias-type-mismatch')).toEqual([])
  })

  it('reports issues in position order', () => {
    // An editor's problem list reads top to bottom; lexer notes are collected after parsing, so
    // without the sort they would all land at the end, away from the lines they belong to.
    const { issues } = parseMildaDocument(
      'foundations {\n  token a: color = hex(ő000)\n  token b: color = hex(ő111)\n}\n',
    )
    const lines = issues.map((i) => i.line)
    expect([...lines].sort((x, y) => x - y)).toEqual(lines)
  })
})
