import type { Part } from '../types/components'
import type { FacetMap, LayoutSpec, StateName } from '../types/facets'

export interface ResolveFacetsInput {
  part: Part
  activeStates: ReadonlySet<StateName>

  stateOrder?: StateName[]
}

export function resolveFacets(input: ResolveFacetsInput): FacetMap {
  const { part, activeStates } = input
  let result: FacetMap = { ...(part.facets ?? {}) }
  const states = part.states ?? {}
  const order = input.stateOrder ?? (Object.keys(states) as StateName[])
  for (const s of order) {
    const override = activeStates.has(s) ? states[s]?.facets : undefined
    if (override) result = { ...result, ...override }
  }
  return result
}

export function resolveLayout(input: ResolveFacetsInput): LayoutSpec | undefined {
  const { part, activeStates } = input
  let result: LayoutSpec | undefined = part.layout ? { ...part.layout } : undefined
  const states = part.states ?? {}
  const order = input.stateOrder ?? (Object.keys(states) as StateName[])
  for (const s of order) {
    const override = activeStates.has(s) ? states[s]?.layout : undefined
    if (override) result = { ...(result ?? {}), ...override }
  }
  return result
}

export function collectActiveStates(
  flags: Partial<Record<StateName, boolean>>,
): ReadonlySet<StateName> {
  const active = new Set<StateName>()
  for (const [state, enabled] of Object.entries(flags) as [StateName, boolean][]) {
    if (enabled) active.add(state)
  }
  return active
}
