import type { Component, Part } from '../types/components'
import type { Layer } from '../types/tokens'
import type { FacetMap } from '../types/facets'
import { resolveToken } from './resolveToken'

export interface Hole {
  kind: 'facet' | 'layout' | 'behavior'
  name: string
  where: string
  reason: string
}

export interface Substitution {
  behavior: string
  via: string
}

export interface ConformanceReport {
  target: string
  complete: boolean
  holes: Hole[]
  substitutions: Substitution[]
}

export interface ConformanceOptions {
  target: string

  contextIds: string[]
  layers: Layer[]
}

function walkFacets(
  facets: FacetMap | undefined,
  where: string,
  opts: ConformanceOptions,
  holes: Hole[],
): void {
  if (!facets) return
  for (const [name, value] of Object.entries(facets)) {
    if (!value) continue
    if ('raw' in value) {
      holes.push({
        kind: 'facet',
        name,
        where,
        reason: 'raw escape-hatch value is a platform-specific leaf',
      })
    } else if ('token' in value) {
      const resolved = resolveToken(value.token, opts.contextIds, opts.layers)
      if (resolved === null) {
        holes.push({
          kind: 'facet',
          name,
          where,
          reason: `token "${value.token}" does not resolve for target`,
        })
      } else if (resolved.kind === 'escape') {
        holes.push({
          kind: 'facet',
          name,
          where,
          reason: `token "${value.token}" resolves to an escape-hatch leaf for this target`,
        })
      }
    }
  }
}

function walkPart(
  comp: Component,
  partName: string,
  part: Part,
  opts: ConformanceOptions,
  holes: Hole[],
): void {
  const where = `${comp.name} › ${partName}`
  walkFacets(part.facets, where, opts, holes)
  for (const [stateName, override] of Object.entries(part.states ?? {})) {
    walkFacets(override?.facets, `${where} [${stateName}]`, opts, holes)
  }
}

export function conformance(comp: Component, opts: ConformanceOptions): ConformanceReport {
  const holes: Hole[] = []
  for (const [partName, part] of Object.entries(comp.anatomy)) {
    walkPart(comp, partName, part, opts, holes)
  }

  const substitutions: Substitution[] = []
  const realize = comp.realize.find((r) => r.target === opts.target)
  if (realize) {
    for (const dropped of realize.drop ?? [])
      substitutions.push({ behavior: dropped, via: 'dropped' })
    for (const wire of realize.wire ?? [])
      substitutions.push({ behavior: `${wire.from} → ${wire.to}`, via: 'realize wire' })
  }

  return { target: opts.target, complete: holes.length === 0, holes, substitutions }
}
