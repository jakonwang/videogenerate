// Build guard: worker threads (out/main/*Worker.js) cannot require('electron'). Rollup may move a
// module's top-level `import ... from 'electron'` into a shared chunk the worker loads, which breaks
// the worker at startup (GMV MAX: "Cannot find module 'electron'"). Fail the build when any chunk a
// worker loads, directly or through other chunks, requires electron at the top level.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out', 'main')
const workers = fs.readdirSync(root).filter((name) => /Worker\.js$/.test(name))
const TOP_LEVEL_ELECTRON = /^(?:const|var|let) [\w$]+ = require\("electron"\);?$/m
const CHUNK_REQUIRE = /require\("(\.{1,2}\/[^"]+\.js)"\)/g

const problems = []
for (const worker of workers) {
  const seen = new Set()
  const queue = [path.join(root, worker)]
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file) || !fs.existsSync(file)) continue
    seen.add(file)
    const code = fs.readFileSync(file, 'utf8')
    if (TOP_LEVEL_ELECTRON.test(code)) problems.push(`${worker} → ${path.relative(root, file)}`)
    for (const match of code.matchAll(CHUNK_REQUIRE)) queue.push(path.resolve(path.dirname(file), match[1]))
  }
}

if (problems.length) {
  console.error('[check-worker-bundles] worker loads a chunk that requires electron at the top level:')
  for (const line of problems) console.error('  ' + line)
  console.error('Move the electron import inside the function that needs it (await import("electron")).')
  process.exit(1)
}
console.log(`[check-worker-bundles] ok (${workers.length} workers)`)
