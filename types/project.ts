import type { MildaDocumentBase } from './ast'
import type { Foundations } from './foundations'
import type { AssetRegistry } from './assets'
import type { Component } from './components'

export interface Project extends MildaDocumentBase {
  kind: 'design-system'
  foundations: Foundations
  assets: AssetRegistry
  components: Component[]
}

export type { DocumentMeta as ProjectMeta } from './ast'
