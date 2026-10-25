// Turns the JSON written by `npm run uat` into the "Results" tables of docs/11-UAT-REPORT.md.
//   node uat/report.cjs <results-dir>      (default: UAT_OUT_DIR, else the temp directory)
const fs = require('fs')
const os = require('os')
const path = require('path')

const dir = process.argv[2] || process.env.UAT_OUT_DIR || os.tmpdir()
const files = fs
  .readdirSync(dir)
  .filter((f) => /^windscope-uat-\d\d-.*\.json$/.test(f))
  .sort()
if (files.length === 0) {
  console.error(`No windscope-uat-NN-*.json results in ${dir}`)
  process.exit(1)
}

// Cleanliness checks (one per suite) are listed together, after the last browser section and before the API checks.
const order = (section) => {
  const letter = section[0]
  return letter === 'Z' ? 'O' : letter
}
const cell = (text, max = 160) => {
  const flat = String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

const sections = new Map()
let passed = 0
let total = 0
for (const file of files) {
  for (const r of JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))) {
    if (!sections.has(r.section)) sections.set(r.section, [])
    sections.get(r.section).push(r)
    total += 1
    if (r.ok) passed += 1
  }
}

const lines = []
for (const name of [...sections.keys()].sort((a, b) => order(a).localeCompare(order(b)))) {
  lines.push(`### ${name}`, '', '| ID | Check | Result | Observed |', '|---|---|---|---|')
  for (const r of sections.get(name)) {
    lines.push(`| ${r.id} | ${cell(r.desc, 400)} | ${r.ok ? '✅ pass' : '❌ FAIL'} | ${cell(r.detail)} |`)
  }
  lines.push('')
}
process.stdout.write(`${lines.join('\n')}\n`)
console.error(`${passed} of ${total} checks passed (${files.length} suites in ${dir})`)
