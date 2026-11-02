import type { AnyTokenValue, Layer, Token, TokenType } from '../types/tokens'

export type ResolvedToken =
  | { kind: 'value'; type: TokenType; value: AnyTokenValue }
  | { kind: 'escape'; raw: string; note?: string }
  /**
   * A computed value (proposal 0044), reported rather than evaluated: the maths - colour
   * spaces, dp lowering - lives in the editor IR's resolver, not in this lightweight AST
   * walk. It is its own answer because neither alternative is true: `null` would say the
   * token does not resolve (it does, and a conformance check would report a hole that is not
   * there), and returning the base's value would say the token IS its base, unmodified.
   */
  | { kind: 'computed'; type: TokenType; from: string }
  | null

export function resolveToken(
  tokenId: string,
  contextIds: string | readonly string[],
  layers: Layer[],
  _depth = 0,
): ResolvedToken {
  if (_depth > 20) return null

  const ids = typeof contextIds === 'string' ? [contextIds] : contextIds
  const token = findToken(tokenId, layers)?.token
  if (!token) return null

  const v = token.value
  if (v.kind === 'raw') return { kind: 'value', type: token.type, value: v.value }
  if (v.kind === 'escape') return { kind: 'escape', raw: v.raw, note: v.note }
  if (v.kind === 'compute') return { kind: 'computed', type: token.type, from: v.base }

  const ref =
    ids.reduce<string | undefined>((found, id) => found ?? v.refs[id], undefined) ??
    v.refs['default'] ??
    null
  if (!ref) return null
  return resolveToken(ref, contextIds, layers, _depth + 1)
}

export function findToken(
  tokenId: string,
  layers: Layer[],
): { token: Token; layerId: string } | null {
  for (const layer of layers) {
    const token = layer.tokens.find((t) => t.id === tokenId)
    if (token) return { token, layerId: layer.id }
  }
  return null
}

export function allTokensOfType(
  type: TokenType,
  layers: Layer[],
): Array<{ token: Token; layerId: string; layerName: string }> {
  const sorted = [...layers].sort((a, b) => a.order - b.order)
  const result: Array<{ token: Token; layerId: string; layerName: string }> = []
  for (const layer of sorted) {
    for (const token of layer.tokens) {
      if (token.type === type) result.push({ token, layerId: layer.id, layerName: layer.name })
    }
  }
  return result
}
