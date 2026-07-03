import { preludeV0 } from '../prelude/preludeV0'
import { validatePrelude } from './validate'

const issues = validatePrelude(preludeV0)
const errors = issues.filter((i) => i.severity === 'error')

if (errors.length) {
  console.error(`✗ ${errors.length} prelude composition issue(s):`)
  for (const e of errors) console.error(`  [${e.code}] ${e.where}: ${e.message}`)
  process.exit(1)
}
console.log(
  `✓ prelude compositions resolve (${preludeV0.archetypes.length} archetypes, ${preludeV0.composites.length} composites checked)`,
)
