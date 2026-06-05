import assert from 'node:assert/strict'

async function main() {
  const source = await import('../src/main/modules/clone/service')
  const serviceText = String(source.cloneService.syncShotVideoTask)
  assert.ok(serviceText.includes("ensureShotVideoState"))
  console.log('clone shot video intent router smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
