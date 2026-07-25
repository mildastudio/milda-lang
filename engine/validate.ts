import type { Project } from '../types/project'
import type { PreludeDocument } from '../types/prelude'
import type { Component, Part } from '../types/components'
import type { FacetMap, LayoutSpec } from '../types/facets'
import { findToken } from './resolveToken'

export interface ValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  where?: string
  // The id of the most specific entity this issue concerns (token / component id).
  // Lets tooling place the diagnostic on a source span (see NodeSpan) even though
  // `where` is a human-readable string. Part/state issues carry the component id.
  id?: string
}

function facetTokenRefs(facets: FacetMap | undefined): string[] {
  if (!facets) return []
  const ids: string[] = []
  for (const v of Object.values(facets)) {
    if (!v) continue
    if ('token' in v) ids.push(v.token)
    else if ('inset' in v) {
      for (const edge of Object.values(v.inset)) if (typeof edge === 'string') ids.push(edge)
    } else if ('border' in v) {
      // Only the color is a foundations token ref; the width is a border-width scale
      // keyword (hairline|thin|thick), not a document token, so don't dangling-check it.
      if (v.border.color) ids.push(v.border.color)
    }
  }
  return ids
}

function layoutTokenRefs(layout: LayoutSpec | undefined): string[] {
  if (!layout) return []
  const ids: string[] = []
  if (layout.gap) ids.push(layout.gap)
  if (layout.inset)
    for (const edge of Object.values(layout.inset)) if (typeof edge === 'string') ids.push(edge)
  for (const axis of [layout.size?.width, layout.size?.height]) {
    if (axis && typeof axis === 'object') {
      const intent = 'intent' in axis ? axis.intent : axis
      if (intent && typeof intent === 'object' && 'fixed' in intent) ids.push(intent.fixed)
      if ('min' in axis && axis.min) ids.push(axis.min)
      if ('max' in axis && axis.max) ids.push(axis.max)
    }
  }
  return ids
}

export function validate(doc: Project, prelude: PreludeDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const archetypeNames = new Set(prelude.archetypes.map((a) => a.name))
  const facetNames = new Set<string>(prelude.facets.map((f) => f.name))
  const stateNames = new Set<string>(prelude.states.map((s) => s.name))
  const groupIds = new Set(doc.foundations.contextGroups.map((g) => g.id))
  const layers = doc.foundations.layers

  for (const layer of layers) {
    for (const tok of layer.tokens) {
      if (tok.value.kind === 'alias') {
        const where = `token ${tok.name} (${tok.id})`
        // An empty `by` is a default-only alias (the lowering of an unconditional
        // ref, e.g. `token x : color = accent.9`), not a reference to a context
        // group — so there's no group to be "unknown".
        if (tok.value.by !== '' && !groupIds.has(tok.value.by)) {
          issues.push({
            severity: 'error',
            code: 'alias.unknownGroup',
            message: `alias by unknown context group "${tok.value.by}"`,
            where,
            id: tok.id,
          })
        }
        for (const refId of Object.values(tok.value.refs)) {
          if (!findToken(refId, layers)) {
            issues.push({
              severity: 'error',
              code: 'alias.danglingRef',
              message: `alias ref points at missing token "${refId}"`,
              where,
              id: tok.id,
            })
          }
        }
      }
    }
  }

  for (const comp of doc.components) {
    const where = `component ${comp.name} (${comp.id})`
    // Archetype-less components are legal: purely structural primitives (Heading,
    // Text, Box, Flex, Grid, Container, …) declare no archetype. Only validate a
    // declared one.
    if (comp.archetype !== '' && !archetypeNames.has(comp.archetype)) {
      issues.push({
        severity: 'error',
        code: 'component.unknownArchetype',
        message: `unknown archetype "${comp.archetype}"`,
        where,
        id: comp.id,
      })
    }

    const propIds = new Set(comp.contract.props.map((p) => p.id))
    for (const [param, binding] of Object.entries(comp.contract.params)) {
      if ('prop' in binding && !propIds.has(binding.prop)) {
        issues.push({
          severity: 'error',
          code: 'param.danglingProp',
          message: `param "${param}" binds missing prop "${binding.prop}"`,
          where,
          id: comp.id,
        })
      }
    }

    for (const [partName, part] of Object.entries(comp.anatomy)) {
      checkPart(comp, partName, part, { facetNames, stateNames, layers, issues })
    }
  }

  return issues
}

function checkPart(
  comp: Component,
  partName: string,
  part: Part,
  ctx: {
    facetNames: Set<string>
    stateNames: Set<string>
    layers: Project['foundations']['layers']
    issues: ValidationIssue[]
  },
): void {
  const where = `${comp.name} › part ${partName}`
  const { facetNames, stateNames, layers, issues } = ctx

  const checkFacets = (facets: FacetMap | undefined, scope: string) => {
    if (!facets) return
    for (const name of Object.keys(facets)) {
      if (!facetNames.has(name)) {
        issues.push({
          severity: 'error',
          code: 'facet.unknown',
          message: `unknown facet "${name}"`,
          where: scope,
          id: comp.id,
        })
      }
    }
    for (const id of facetTokenRefs(facets)) {
      if (!findToken(id, layers)) {
        issues.push({
          severity: 'error',
          code: 'facet.danglingToken',
          message: `facet references missing token "${id}"`,
          where: scope,
          id: comp.id,
        })
      }
    }
  }
  const checkLayoutRefs = (layout: LayoutSpec | undefined, scope: string) => {
    for (const id of layoutTokenRefs(layout)) {
      if (!findToken(id, layers)) {
        issues.push({
          severity: 'error',
          code: 'layout.danglingToken',
          message: `layout references missing token "${id}"`,
          where: scope,
          id: comp.id,
        })
      }
    }
  }

  checkFacets(part.facets, where)
  checkLayoutRefs(part.layout, where)
  for (const [stateName, override] of Object.entries(part.states ?? {})) {
    const scope = `${where} [${stateName}]`
    if (!stateNames.has(stateName)) {
      issues.push({
        severity: 'error',
        code: 'state.unknown',
        message: `unknown state "${stateName}"`,
        where: scope,
        id: comp.id,
      })
    }
    checkFacets(override?.facets, scope)
    checkLayoutRefs(override?.layout, scope)
  }
}

function parseComposeRef(ref: string): { name: string; mode?: string } {
  const body = ref.trim().replace(/\?$/, '').trim()
  const paren = body.match(/^([^(]+)\(([^)]+)\)$/)
  if (paren) return { name: paren[1].trim(), mode: paren[2].trim() }
  if (body.includes('.')) {
    const [name, mode] = body.split('.')
    return { name: name.trim(), mode: mode.trim() }
  }
  return { name: body }
}

export function validatePrelude(prelude: PreludeDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const atomsByName = new Map(prelude.atoms.map((a) => [a.name, a]))

  const vocab = new Set<string>([
    ...prelude.atoms.map((a) => a.name),
    ...prelude.composites.map((c) => c.name),
    ...prelude.decorations.map((d) => d.name),
    ...prelude.nonBehaviors.map((n) => n.name),
  ])
  const capabilities = new Set(prelude.capabilities.map((c) => c.name))

  const checkRef = (ref: string, where: string, modeOk = true) => {
    const { name, mode } = parseComposeRef(ref)
    if (!vocab.has(name)) {
      issues.push({
        severity: 'error',
        code: 'prelude.danglingComposeRef',
        message: `composes "${ref}" → undeclared primitive "${name}"`,
        where,
      })
      return
    }
    if (modeOk && mode) {
      const atom = atomsByName.get(name)
      if (atom?.modes && !atom.modes.includes(mode)) {
        issues.push({
          severity: 'error',
          code: 'prelude.unknownMode',
          message: `"${name}(${mode})" — "${mode}" is not a declared mode of ${name} [${atom.modes.join('|')}]`,
          where,
        })
      }
    }
  }

  for (const arch of prelude.archetypes) {
    for (const ref of arch.composes ?? []) checkRef(ref, `archetype ${arch.name}`)

    for (const u of arch.uses ?? []) {
      if (!atomsByName.has(u.atom)) {
        issues.push({
          severity: 'error',
          code: 'prelude.danglingComposeRef',
          message: `uses atom "${u.atom}" — not a declared atom`,
          where: `archetype ${arch.name}`,
        })
      }
    }
  }

  for (const comp of prelude.composites) {
    for (const ref of comp.builtFrom ?? []) checkRef(ref, `composite ${comp.name}`)
    for (const u of comp.uses ?? []) {
      if (!atomsByName.has(u.atom)) {
        issues.push({
          severity: 'error',
          code: 'prelude.danglingComposeRef',
          message: `uses atom "${u.atom}" — not a declared atom`,
          where: `composite ${comp.name}`,
        })
      }
    }
  }

  for (const atom of prelude.atoms) {
    for (const req of atom.requires ?? []) {
      for (const cap of req.anyOf) {
        if (!capabilities.has(cap)) {
          issues.push({
            severity: 'error',
            code: 'prelude.unknownCapability',
            message: `atom ${atom.name} requires undeclared capability "${cap}"`,
            where: `atom ${atom.name}`,
          })
        }
      }
    }
  }
  return issues
}
