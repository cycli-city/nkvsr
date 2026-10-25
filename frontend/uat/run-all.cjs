// Runs the three acceptance-test suites one after another and exits non-zero if any check failed.
const { spawnSync } = require('node:child_process')
const path = require('node:path')

const suites = [
  '01-shell-controls-dashboard.cjs',
  '02-panels-intervals-vintages-methodology.cjs',
  '03-phone-tablet-keyboard.cjs',
  '04-api-checks.cjs',
]
let failed = false
for (const suite of suites) {
  console.log(`\n######## ${suite}`)
  const r = spawnSync(process.execPath, [path.join(__dirname, suite)], { stdio: 'inherit', env: process.env })
  if (r.status !== 0) failed = true
}
process.exit(failed ? 1 : 0)
