#!/usr/bin/env node
// Validate Milda canonical-AST JSON instances against ast.schema.json (v0.1).
// Usage:  npm i ajv && node validate.js [file.json ...]
// With no args, validates the bundled examples/. This is the seed of the B3
// lossless-boundary/conformance checker (ROADMAP) - for now, structural validation only.
const Ajv = require('ajv/dist/2020')
const fs = require('fs')
const path = require('path')

const here = __dirname
const schema = JSON.parse(fs.readFileSync(path.join(here, 'ast.schema.json'), 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(schema)

const targets = process.argv.slice(2)
if (targets.length === 0) {
  targets.push(path.join(here, 'examples', 'select.json'))
  targets.push(path.join(here, 'examples', 'v01-features.json'))
}

let allOk = true
for (const t of targets) {
  const data = JSON.parse(fs.readFileSync(t, 'utf8'))
  const ok = validate(data)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${path.relative(process.cwd(), t)}`)
  if (!ok) {
    allOk = false
    for (const e of validate.errors) console.log(`   ${e.instancePath || '/'} ${e.message}`)
  }
}
process.exit(allOk ? 0 : 1)
