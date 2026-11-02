// ─── The parts an archetype requires ──────────────────────────────────────────
// Which parts a component may not be without is the ARCHETYPE's answer, not the file's: a Button
// has a label because a Button is the thing with a label. The `.milda` surface used to repeat
// that answer per part (`locked`), and proposal 0055 took the word out of the language - the
// reader restores a required part a file leaves out, the editor locks the parts this says are
// required, and editor tooling reports the gap and offers to fill it. All three read the index
// below, so they cannot disagree about what "required" means.
import type { Anatomy } from '../types/components'
import type { AnatomyPart, ArchetypeDef, PartRole } from '../types/prelude'
import { archetypesByName } from './preludeV0'

// An archetype by name (the prelude this package ships) or as a definition (a caller that holds
// its own prelude, as `validate` does).
export type ArchetypeRef = ArchetypeDef | string | null | undefined

function archetypeDef(archetype: ArchetypeRef): ArchetypeDef | undefined {
  return typeof archetype === 'string' ? archetypesByName[archetype] : (archetype ?? undefined)
}

export interface AnatomyEntry {
  name: string
  parentName: string | null
  role: PartRole
  optional: boolean
  // The anatomy uses the name more than once (a MenuButton has a `label` in its trigger and in
  // each item), so a part of this name is only ever found under its own parent.
  repeated: boolean
}

// Keyed by the part's own NAME, not by its path. The anatomy's paths are relative to the
// archetype's own top level, and a file is free to nest those parts deeper: `Menu` declares
// `item`, and the Radix DropdownMenu writes it as `content.item`. A name repeated at two depths
// keeps the shallower entry, which is the one a bare reference means.
export function anatomyIndex(archetype: ArchetypeRef): Map<string, AnatomyEntry> {
  const out = new Map<string, AnatomyEntry>()
  const parts = archetypeDef(archetype)?.anatomy
  if (!parts) return out
  const walk = (part: AnatomyPart, parentName: string | null) => {
    const seen = out.get(part.name)
    if (seen) seen.repeated = true
    else {
      out.set(part.name, {
        name: part.name,
        parentName,
        role: part.role,
        optional: part.optional === true,
        repeated: false,
      })
    }
    for (const child of part.children ?? []) walk(child, part.name)
  }
  for (const part of parts) walk(part, null)
  return out
}

// The anatomy parts an archetype's control LOWERING realizes instead of as parts: a BooleanInput
// is seeded as one boolean input (the checkbox, later materialized into an indicator and its
// glyph), not as the `control` and `indicator` its anatomy lists. The seed collapses these, the
// reader does not seed them, and nothing reports them missing.
const LOWERED_ANATOMY: Readonly<Record<string, readonly string[]>> = {
  BooleanInput: ['control', 'indicator'],
}

export function loweredAnatomy(archetype: ArchetypeRef): readonly string[] {
  const name = typeof archetype === 'string' ? archetype : archetype?.name
  return (name && LOWERED_ANATOMY[name]) || []
}

// Where a file wrote the archetype part `name` that belongs under `parentPath`, if it did. Found
// by NAME rather than by path, because a file may nest an archetype's part deeper than the
// anatomy does (the Radix DropdownMenu writes Menu's `item` as `content.item`) - except for a
// name the anatomy repeats, where any other `label` is some other part's label, so only one under
// the same parent counts. The shallowest candidate wins, which is the one a bare name means.
export function findDeclaredPart(
  name: string,
  parentPath: string,
  rootPath: string,
  paths: Iterable<string>,
  repeated: boolean,
): string | undefined {
  let best: string | undefined
  for (const path of paths) {
    if ((path.split('.').pop() || path) !== name) continue
    const under = parentPath === rootPath || path.startsWith(`${parentPath}.`)
    if (repeated && !under) continue
    if (!best || path.split('.').length < best.split('.').length) best = path
  }
  return best
}

export interface MissingPart {
  // Where the part goes, in the file's own addressing (a dotted path from the root's children).
  path: string
  // What it is: an anatomy role names a node kind one-for-one, so this is what the header says.
  kind: PartRole
  // Under a part that is itself missing. The topmost missing part is the one worth reporting;
  // the ones below it come with it.
  implied: boolean
}

// The required parts a component's declared anatomy leaves out, in the archetype's own order.
// This is the same answer the reader gives when it seeds them (`generate/targets/dsl/toIr.ts`),
// including its allowances: a part is found as `findDeclaredPart` finds it, a form control the
// file names in its own words (`part input: input`) stands in for the archetype's `control`, and
// the parts a lowering realizes (`loweredAnatomy`) are never parts at all.
export function missingRequiredParts(archetype: ArchetypeRef, anatomy: Anatomy): MissingPart[] {
  const parts = archetypeDef(archetype)?.anatomy
  const paths = Object.keys(anatomy)
  const rootPath = paths[0]
  if (!parts || rootPath === undefined) return []
  const known = anatomyIndex(archetype)
  const lowered = new Set(loweredAnatomy(archetype))
  const parentOf = (path: string) =>
    path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : rootPath
  // Narrow on purpose, as in the reader: only a kind the file STATES, and only the form control.
  const standIns = new Set<string>()
  for (const path of paths.slice(1)) {
    const leaf = path.split('.').pop() || path
    if (anatomy[path]?.kind === 'input' && !known.has(leaf)) standIns.add(parentOf(path))
  }

  const out: MissingPart[] = []
  const walk = (part: AnatomyPart, parentPath: string, parentMissing: boolean) => {
    // Looked up even under a missing parent, as the reader does: a unique name the file wrote
    // anywhere is that part (the Radix SegmentedControl's top-level `indicator`).
    const repeated = known.get(part.name)?.repeated ?? false
    const declared = findDeclaredPart(part.name, parentPath, rootPath, paths, repeated)
    if (declared) {
      for (const child of part.children ?? []) walk(child, declared, false)
      return
    }
    if (part.optional) return
    if (!parentMissing && part.role === 'input' && standIns.has(parentPath)) return
    const path = parentPath === rootPath ? part.name : `${parentPath}.${part.name}`
    out.push({ path, kind: part.role, implied: parentMissing })
    for (const child of part.children ?? []) walk(child, path, true)
  }
  for (const part of parts) if (!lowered.has(part.name)) walk(part, rootPath, false)
  return out
}
