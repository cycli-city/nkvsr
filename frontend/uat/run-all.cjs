// Runs every suite in ./suites (in file-name order) and exits non-zero if any check failed.
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const dir = path.join(__dirname, 'suites')
const suites = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.cjs'))
  .sort()
let failed = false
for (const suite of suites) {
  console.log(`\n######## ${suite}`)
  const r = spawnSync(process.execPath, [path.join(dir, suite)], { stdio: 'inherit', env: process.env })
  if (r.status !== 0) failed = true
}
process.exit(failed ? 1 : 0)
