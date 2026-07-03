import type { Id, PropValue, SharedType, TypeExpr } from './ast'
import type { ContextGroup, Layer } from './tokens'

export interface ProjectMetadataEntry {
  id: Id
  key: string
  type: TypeExpr
  value?: PropValue
}

export interface Foundations {
  contextGroups: ContextGroup[]
  layers: Layer[]
  sharedTypes: SharedType[]
  metadata: ProjectMetadataEntry[]
}
