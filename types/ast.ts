export type Id = string

export interface TypeRef {
  kind: 'ref'
  ref: Id
}

export type TypeExpr =
  | { kind: 'string' }
  | { kind: 'number'; min?: number; max?: number }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'union'; members: TypeExpr[] }
  | TypeRef
  | { kind: 'array'; item: TypeExpr }
  | { kind: 'object'; fields: ObjectField[] }
  | { kind: 'component'; componentIds?: Id[] }

export interface ObjectField {
  id: Id
  name: string
  type: TypeExpr
  required: boolean
  description?: string
}

export type PropValue = string | number | boolean | PropValue[] | { [key: string]: PropValue }

// Free-form descriptive metadata (proposal 0026) — attached to a component (and, via
// `Foundations.metadata`, the document). Deliberately loose: metadata is descriptive,
// never contractual, so it does not participate in the contract digest / semver.
export type Metadata = Record<string, PropValue>

export interface SharedType {
  id: Id
  name: string
  description?: string
  definition: TypeExpr
}

export type ParamBinding = { prop: Id } | { static: PropValue }

export interface DocumentMeta {
  id: Id
  name: string
  version: string
  description?: string
  createdAt?: string
  updatedAt?: string
}

export type DocumentKind = 'prelude' | 'design-system'

export interface MildaDocumentBase {
  milda: string
  kind: DocumentKind

  prelude: string
  meta: DocumentMeta
}
