import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function main() {
  const source = await readFile('src/main/modules/clone/service.ts', 'utf8')

  assert.match(
    source,
    /if \(finalOutputPath\) \{\s*await cleanupCloneOutputArtifacts\(\{\s*outputDir: String\(input\.outputDir \|\| latest\.outputDir \|\| ''\)\.trim\(\),\s*keepVideoPath: finalOutputPath,\s*keepReportPath: String\(rendered\.reportPath \|\| ''\)\.trim\(\),\s*\}\)\s*\}/,
  )

  console.log('clone final compose cleans old outputs smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
