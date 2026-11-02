import type { Id, PropValue, SharedType, TypeExpr } from './ast'
import type { Predicate } from './components'
import type { ContextGroup, Layer, TokenType } from './tokens'

export interface ProjectMetadataEntry {
  id: Id
  key: string
  type: TypeExpr
  value?: PropValue
}

/**
 * A prop declared ONCE for the whole system, which any component may take by reference
 * (proposal 0051 §5). Its default is the system-wide value; an instance overrides it by passing
 * the prop, exactly as it would a local one.
 *
 * It lives in the foundations rather than on a component because that is what it IS: a
 * system-wide decision, next to the context groups it usually names. A design system with a
 * `variant` dimension says so once - the Radix mapping restated the same five props on 49
 * components, and the restatement carried no information.
 */
export interface GlobalProp {
  id: Id
  name: string
  type: TypeExpr
  /** The system-wide value. Absent means "no default" - for a context type, inherit the theme. */
  default?: PropValue
  description?: string
}

/**
 * How the system is meant to be put together (proposal 0052 §5): a top-level `rule`. Mirrors the
 * editor IR's `UsageRule` (@mildastudio/core) for the reason `Predicate` does - this package is
 * standalone - and is lowered to it by the AST adapter in `@mildastudio/generate`.
 *
 * Every reference is by NAME, so a rule naming a component another file declares survives a
 * per-file round trip; a reference nothing resolves is a warning, never a drop.
 */
export interface RuleSubject {
  kind: 'component' | 'archetype'
  name: string
  where?: Predicate
}

export type UsageRule = {
  id: string
  severity: 'error' | 'warning'
  rationale: string
} & (
  | { kind: 'count'; subject: RuleSubject; within: RuleSubject; min?: number; max?: number }
  | { kind: 'never'; subject: RuleSubject; within: RuleSubject }
  | { kind: 'only-within'; subject: RuleSubject; within: RuleSubject[] }
  | { kind: 'tokens-only'; types: TokenType[] }
  | { kind: 'prefer'; component: string; archetypes: string[] }
)

export interface Foundations {
  contextGroups: ContextGroup[]
  layers: Layer[]
  sharedTypes: SharedType[]
  metadata: ProjectMetadataEntry[]
  /** Absent when the system declares none, so a file that has never used one is unchanged. */
  globalProps?: GlobalProp[]
  /** Usage rules (0052 §5). Absent when the file declares none. */
  rules?: UsageRule[]
}
