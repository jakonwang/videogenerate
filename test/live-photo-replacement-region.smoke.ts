import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import {
  compositeLivePhotoReplacementCrop,
  normalizeAutoLocatedLivePhotoReplacementRegion,
  normalizeLivePhotoReplacementRegion,
  prepareLivePhotoReplacementCrop,
  resolveLivePhotoReplacementGeometry,
} from '../src/main/modules/live-photo/replacementRegion'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-region-'))
  try {
    const scenePath = path.join(root, 'scene.png')
    const cropPath = path.join(root, 'crop.png')
    const generatedPath = path.join(root, 'generated.png')
    const outputPath = path.join(root, 'output.png')
    await sharp({ create: { width: 400, height: 300, channels: 3, background: '#e52f42' } }).png().toFile(scenePath)
    await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#2357df' } }).png().toFile(generatedPath)

    const region = normalizeLivePhotoReplacementRegion({
      x: 0.4,
      y: 0.35,
      width: 0.2,
      height: 0.3,
      source: 'manual',
      revision: 3,
      updatedAt: 1,
    })
    assert.ok(region)
    assert.equal(normalizeLivePhotoReplacementRegion({ x: 0, y: 0, width: 0, height: 0 }), null)
    assert.equal(normalizeAutoLocatedLivePhotoReplacementRegion({ x: 0.2, y: 0.2, width: 0.2, height: 0.2, confidence: 0.74 }), null)
    assert.equal(normalizeAutoLocatedLivePhotoReplacementRegion({ x: 0.9, y: 0.2, width: 0.2, height: 0.2, confidence: 0.9 }), null)
    assert.deepEqual(
      normalizeAutoLocatedLivePhotoReplacementRegion({ x: 0.2, y: 0.3, width: 0.2, height: 0.1, confidence: 0.75 }, 1234),
      { x: 0.2, y: 0.3, width: 0.2, height: 0.1, source: 'auto', confidence: 0.75, revision: 1, updatedAt: 1234 },
    )
    const prepared = await prepareLivePhotoReplacementCrop({ scenePath, outputPath: cropPath, region })
    assert.equal(prepared.geometry.context.width, prepared.geometry.context.height)
    const expected = resolveLivePhotoReplacementGeometry({ region, imageWidth: 400, imageHeight: 300 })
    assert.deepEqual(prepared.geometry, expected)
    const portraitGeometry = resolveLivePhotoReplacementGeometry({
      region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5, source: 'auto', confidence: 0.95, revision: 1, updatedAt: 1 },
      imageWidth: 96,
      imageHeight: 128,
    })
    assert.ok(portraitGeometry.writeback.left >= portraitGeometry.context.left)
    assert.ok(portraitGeometry.writeback.top >= portraitGeometry.context.top)
    assert.ok(portraitGeometry.writeback.left + portraitGeometry.writeback.width <= portraitGeometry.context.left + portraitGeometry.context.width)
    assert.ok(portraitGeometry.writeback.top + portraitGeometry.writeback.height <= portraitGeometry.context.top + portraitGeometry.context.height)

    await compositeLivePhotoReplacementCrop({
      scenePath,
      generatedCropPath: generatedPath,
      outputPath,
      geometry: prepared.geometry,
    })
    const outputMetadata = await sharp(outputPath).metadata()
    assert.equal(outputMetadata.width, 400)
    assert.equal(outputMetadata.height, 300)
    const source = await sharp(scenePath).removeAlpha().raw().toBuffer()
    const output = await sharp(outputPath).removeAlpha().raw().toBuffer()
    const writeback = prepared.geometry.writeback
    let changedInside = 0
    for (let y = 0; y < 300; y += 1) {
      for (let x = 0; x < 400; x += 1) {
        const offset = (y * 400 + x) * 3
        const changed = source[offset] !== output[offset] || source[offset + 1] !== output[offset + 1] || source[offset + 2] !== output[offset + 2]
        const inside = x >= writeback.left && x < writeback.left + writeback.width && y >= writeback.top && y < writeback.top + writeback.height
        if (!inside) assert.equal(changed, false)
        if (inside && changed) changedInside += 1
      }
    }
    assert.ok(changedInside > 0)
    console.log('live photo replacement region smoke test passed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
