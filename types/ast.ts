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
  // A prop TYPED BY a context group (proposal 0001 §5): its values are the group's contexts, and
  // an instance's value selects that context for the tokens that `alias by` it. The parser used to
  // lower this to a `ref` with a warning, since the AST had no arm for it - which is how a Radix
  // `variant Variant` prop became a reference to a shared type nobody declared, and the generated
  // component typed it `unknown` and ignored it.
  | { kind: 'context'; group: Id }
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

// Free-form descriptive metadata (proposal 0026) - attached to a component (and, via
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
