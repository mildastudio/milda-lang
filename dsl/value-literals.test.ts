import { describe, expect, it } from 'vitest'
import { parseMildaDocument } from '../index'

const tok = (line: string) =>
  parseMildaDocument(`foundations {\n  ${line}\n}`).document.foundations.layers[0].tokens[0]

describe('first-class value literals', () => {
  it('color functions carry the color space (never a raw hex string)', () => {
    expect(tok('token c : color = oklch(0.62 0.19 256)').value).toEqual({
      kind: 'raw',
      value: { space: 'oklch', channels: [0.62, 0.19, 256] },
    })
    expect(tok('token c : color = srgb(1 1 1 0.8)').value).toEqual({
      kind: 'raw',
      value: { space: 'srgb', channels: [1, 1, 1], alpha: 0.8 },
    })
    expect(tok('token c : color = p3(1 0 0)').value).toEqual({
      kind: 'raw',
      value: { space: 'display-p3', channels: [1, 0, 0] },
    })
  })

  it('hex() and rgb() map to sRGB (0..1 channels)', () => {
    expect(
      (tok('token c : color = hex(ff0000)').value as { value: { channels: number[] } }).value
        .channels,
    ).toEqual([1, 0, 0])
    expect(
      (tok('token c : color = rgb(255 0 0)').value as { value: { channels: number[] } }).value
        .channels,
    ).toEqual([1, 0, 0])
  })

  it('unit-suffixed numbers map to typed dimension / duration', () => {
    expect(tok('token s : spacing = 8px').value).toEqual({
      kind: 'raw',
      value: { value: 8, unit: 'fixed' },
    })
    expect(tok('token s : spacing = 0.5rem').value).toEqual({
      kind: 'raw',
      value: { value: 0.5, unit: 'scaled' },
    })
    expect(tok('token s : spacing = 50%').value).toEqual({
      kind: 'raw',
      value: { value: 50, unit: 'percent' },
    })
    expect(tok('token d : duration = 150ms').value).toEqual({ kind: 'raw', value: { ms: 150 } })
    expect(tok('token d : duration = 2s').value).toEqual({ kind: 'raw', value: { ms: 2000 } })
  })

  // 0038: `px`/`dp` are one unit and `rem`/`sp`/`scaled(n)` are another. All four
  // spellings are READ; only `px` and `scaled(n)` are ever written back.
  it('reads every accepted length spelling as one of two neutral units', () => {
    expect(tok('token s : spacing = 12dp').value).toEqual({
      kind: 'raw',
      value: { value: 12, unit: 'fixed' },
    })
    expect(tok('token s : spacing = 0.75sp').value).toEqual({
      kind: 'raw',
      value: { value: 0.75, unit: 'scaled' },
    })
    expect(tok('token s : spacing = scaled(0.75)').value).toEqual({
      kind: 'raw',
      value: { value: 0.75, unit: 'scaled' },
    })
  })

  it('reads `pill` as a radius intent', () => {
    expect(tok('token r : radius = pill').value).toEqual({
      kind: 'raw',
      value: { keyword: 'pill' },
    })
  })

  it('still accepts the `raw` escape-hatch form (back-compat)', () => {
    const v = tok('token c : color = raw "#00000000"').value as {
      value: { space: string; alpha?: number }
    }
    expect(v.value.space).toBe('srgb')
    expect(v.value.alpha).toBe(0)
  })

  it('also parses first-class literals inside structured values (typography)', () => {
    const v = tok('token t : typography = { role: "body"; size: 1rem; line: 1.5rem }')
      .value as unknown as {
      value: { size: unknown; line: unknown }
    }
    expect(v.value.size).toEqual({ value: 1, unit: 'scaled' })
    expect(v.value.line).toEqual({ value: 1.5, unit: 'scaled' })
  })
})

describe('literal type validation (self-typing)', () => {
  const codes = (line: string) =>
    parseMildaDocument(`foundations {\n  ${line}\n}`).issues.filter((i) => i.code === 'value-type')

  it('flags a literal whose kind mismatches the declared token type', () => {
    expect(codes('token c : color = 8px')).toHaveLength(1)
    expect(codes('token d : duration = 8px')).toHaveLength(1)
    expect(codes('token s : spacing = hex(fff)')).toHaveLength(1)
  })

  it('accepts matching literals', () => {
    expect(codes('token c : color = oklch(0.6 0.1 250)')).toEqual([])
    expect(codes('token s : spacing = 0.5rem')).toEqual([])
    expect(codes('token d : duration = 150ms')).toEqual([])
  })
})

// ─── hex() says what it read, or says why it could not ────────────────────────
// An unreadable payload used to fall back to black in silence, so `hex(12345)` became a
// colour nobody wrote: the file looked fine, the theme was wrong, and the only clue was
// the swatch. The same silent-substitution class as everything else 0041 had to fix.
describe('hex() digits', () => {
  const codes = (line: string) =>
    parseMildaDocument(`foundations {\n  ${line}\n}`).issues.filter((i) => i.code === 'color-hex')
  const channels = (line: string) =>
    (tok(line).value as { value: { channels: number[]; alpha?: number } }).value

  it('reads all four CSS shapes - 3, 4, 6 and 8 digits', () => {
    expect(channels('token c : color = hex(f00)').channels).toEqual([1, 0, 0])
    expect(channels('token c : color = hex(ff0000)').channels).toEqual([1, 0, 0])
    // The 4-digit shorthand carries alpha, exactly as `#rgba` does.
    expect(channels('token c : color = hex(f000)')).toEqual({
      space: 'srgb',
      channels: [1, 0, 0],
      alpha: 0,
    })
    expect(channels('token c : color = hex(ff000080)').alpha).toBeCloseTo(0.502, 3)
    expect(codes('token c : color = hex(ABCDEF)')).toEqual([]) // upper case reads too
  })

  it('reports a payload it cannot read instead of quietly turning black', () => {
    for (const bad of ['hex(12345)', 'hex(ff)', 'hex(zzz)', 'hex()', 'hex(fffffffff)']) {
      const reported = codes(`token c : color = ${bad}`)
      expect(reported, bad).toHaveLength(1)
      expect(reported[0].severity, bad).toBe('error')
    }
    expect(codes('token c : color = hex()')[0].message).toContain('needs digits')
    expect(codes('token c : color = hex(zzz)')[0].message).toContain('"zzz"')
  })
})

// ─── 0038: a length needs a unit, and the platform-named spellings are hinted ──
describe('length strictness and hints (0038)', () => {
  const issues = (line: string, code: string) =>
    parseMildaDocument(`foundations {\n  ${line}\n}`).issues.filter((i) => i.code === code)

  it('rejects a bare number on a length token', () => {
    // This is the drift vector: a bare number used to be read as `rem`, so a fixed 12
    // came back as 12rem. Requiring the unit makes that unrepresentable.
    expect(issues('token s : spacing = 12', 'length-unit-required')).toHaveLength(1)
    expect(issues('token r : radius = 4', 'length-unit-required')).toHaveLength(1)
    expect(issues('token d : dimension = 0', 'length-unit-required')).toHaveLength(1)
  })

  it('still accepts a bare number where it is not a length', () => {
    expect(issues('token o : opacity = 0.5', 'length-unit-required')).toEqual([])
    expect(issues('token w : font-weight = 600', 'length-unit-required')).toEqual([])
  })

  it('hints at rem rather than rejecting it (importers carry it)', () => {
    const hints = issues('token s : spacing = 0.75rem', 'web-unit')
    expect(hints).toHaveLength(1)
    expect(hints[0].severity).toBe('warning')
    expect(hints[0].message).toContain('scaled(n)')
    expect(issues('token s : spacing = 12px', 'web-unit')).toEqual([])
    expect(issues('token s : spacing = 0.75sp', 'web-unit')).toEqual([])
  })

  it('warns when a text-scaled length is used off typography', () => {
    expect(issues('token s : spacing = scaled(0.5)', 'scaled-length')).toHaveLength(1)
    expect(issues('token s : spacing = 8px', 'scaled-length')).toEqual([])
    // …and says nothing on the types that measure text, where growing with the reader's
    // text size is the whole point of the unit.
    expect(issues('token t : font-size = scaled(1.25)', 'scaled-length')).toEqual([])
    expect(issues('token t : letter-spacing = scaled(0.01)', 'scaled-length')).toEqual([])
  })

  it('rejects `pill` anywhere but a radius', () => {
    expect(issues('token s : spacing = pill', 'value-type')).toHaveLength(1)
    expect(issues('token r : radius = pill', 'value-type')).toEqual([])
  })
})

// ─── A name, then its type: one spelling, the colon (milda 0.4) ───────────────
// A token writes `token brand : color` and an object field writes `field : string`. A props
// block and a demo block wrote the name and the type with nothing between them, which is the
// surface disagreeing with itself about a single idea. Both now require the colon - the reader
// reports its absence and the printer writes it - so the file has one form to learn, not two.
describe('a declared type after a name', () => {
  const props = (line: string) =>
    parseMildaDocument(`component B {\n  props {\n    ${line}\n  }\n}\n`)
  const errors = (r: ReturnType<typeof parseMildaDocument>) =>
    r.issues.filter((i) => i.severity === 'error')

  it('is read with the colon', () => {
    const { document, issues } = props('size : Size = S2')
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(document.components[0].contract.props[0]).toMatchObject({ name: 'size', default: 'S2' })
  })

  it('reports the missing colon, and reads the declaration anyway', () => {
    const parsed = props('size Size = S2')
    expect(errors(parsed).map((i) => i.code)).toEqual(['prop-colon'])
    // Error-recovering: one omitted colon costs one diagnostic, not the rest of the block.
    expect(parsed.document.components[0].contract.props[0]).toMatchObject({
      name: 'size',
      default: 'S2',
    })
  })

  it('reads the rest of the declaration the same way', () => {
    const { document, issues } = props('value : string bind selected')
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    const prop = document.components[0].contract.props[0]
    expect(prop).toMatchObject({ name: 'value', binding: 'selected' })
  })

  it('is read in a demo block too, where the shape is the same', () => {
    const dsl = (decl: string) =>
      'component Card {\n  part root { kind container }\n}\n' +
      `example "one" for Card {\n  demo {\n    ${decl}\n  }\n}\n`
    const parsed = parseMildaDocument(dsl('open : boolean = false'))
    expect(errors(parsed)).toEqual([])
    expect(parsed.document.examples?.[0].demo?.open).toMatchObject({ initial: false })
    expect(errors(parseMildaDocument(dsl('open boolean = false'))).map((i) => i.code)).toEqual([
      'demo-colon',
    ])
  })
})
