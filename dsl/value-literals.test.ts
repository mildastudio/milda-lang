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
    expect((tok('token c : color = hex(ff0000)').value as { value: { channels: number[] } }).value.channels).toEqual([1, 0, 0])
    expect((tok('token c : color = rgb(255 0 0)').value as { value: { channels: number[] } }).value.channels).toEqual([1, 0, 0])
  })

  it('unit-suffixed numbers map to typed dimension / duration', () => {
    expect(tok('token s : spacing = 8px').value).toEqual({ kind: 'raw', value: { value: 8, unit: 'fixed' } })
    expect(tok('token s : spacing = 0.5rem').value).toEqual({ kind: 'raw', value: { value: 0.5, unit: 'scaled' } })
    expect(tok('token s : spacing = 50%').value).toEqual({ kind: 'raw', value: { value: 50, unit: 'percent' } })
    expect(tok('token d : duration = 150ms').value).toEqual({ kind: 'raw', value: { ms: 150 } })
    expect(tok('token d : duration = 2s').value).toEqual({ kind: 'raw', value: { ms: 2000 } })
  })

  it('still accepts the `raw` escape-hatch form (back-compat)', () => {
    const v = tok('token c : color = raw "#00000000"').value as { value: { space: string; alpha?: number } }
    expect(v.value.space).toBe('srgb')
    expect(v.value.alpha).toBe(0)
  })

  it('also parses first-class literals inside structured values (typography)', () => {
    const v = tok('token t : typography = { role: "body"; size: 1rem; line: 1.5rem }').value as unknown as {
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
