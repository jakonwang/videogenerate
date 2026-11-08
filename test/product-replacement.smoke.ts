import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const dataDir = await mkdtemp(join(tmpdir(), 'product-replacement-smoke-'))
  assert.ok(dataDir.startsWith(tmpdir()))
  configureAppPathRuntime({ userDataDir: dataDir, dataDir })

  try {
    const { productReplacementService } = await import('../src/main/modules/product-replacement/service')
    const initial = await productReplacementService.listPromptVersions()
    assert.equal(initial.length, 1)
    assert.equal(initial[0].active, true)
    assert.equal(initial[0].promptHash.length, 64)
    assert.equal(initial[0].name, 'Basic Product Replacement')
    assert.match(initial[0].prompt, /Image 1 is the scene to edit/)
    assert.match(initial[0].prompt, /Images 2 and onward show the target product/)

    const saved = await productReplacementService.savePromptVersion({ name: 'Smoke test', prompt: 'Replace the object in the first image.' })
    assert.equal(saved.version, 2)
    const active = await productReplacementService.activatePromptVersion(saved.id)
    assert.equal(active?.active, true)
    assert.equal((await productReplacementService.listPromptVersions()).filter((item) => item.active).length, 1)

    const rolledBack = await productReplacementService.rollbackPromptVersion(initial[0].id)
    assert.equal(rolledBack?.active, true)
    assert.equal(rolledBack?.prompt, initial[0].prompt)
    assert.equal(rolledBack?.version, 3)

    await assert.rejects(
      productReplacementService.createBatch({
        productName: 'Invalid', productImagePaths: [], sourceImages: [], variantCount: 1,
      }),
      /product reference image/i,
    )
    console.log('product-replacement smoke passed')
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }
}

void main()
