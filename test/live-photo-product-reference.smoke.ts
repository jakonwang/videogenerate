import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { prepareLivePhotoProductReference } from '../src/main/modules/live-photo/productReference'

async function colorCounts(imagePath: string) {
  const { data, info } = await sharp(imagePath).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let red = 0
  let green = 0
  let blue = 0
  for (let offset = 0; offset < data.length; offset += info.channels) {
    const r = data[offset] || 0
    const g = data[offset + 1] || 0
    const b = data[offset + 2] || 0
    if (r > 180 && g < 100 && b < 100) red += 1
    if (g > 140 && r < 100 && b < 100) green += 1
    if (b > 180 && r < 100 && g < 100) blue += 1
  }
  return { red, green, blue, width: info.width, height: info.height }
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-product-reference-'))
  try {
    const boardPath = path.join(root, 'fixture_analysis_board_test.png')
    await sharp({ create: { width: 600, height: 900, channels: 3, background: '#ffffff' } })
      .composite([
        { input: { create: { width: 100, height: 170, channels: 3, background: '#ef3038' } }, left: 335, top: 55 },
        { input: { create: { width: 100, height: 170, channels: 3, background: '#20a84a' } }, left: 475, top: 55 },
        { input: { create: { width: 150, height: 180, channels: 3, background: '#2855e8' } }, left: 375, top: 650 },
      ])
      .png()
      .toFile(boardPath)

    const outputDir = path.join(root, 'prepared')
    const primary = await prepareLivePhotoProductReference({ sourcePath: boardPath, outputDir, variant: 'primary' })
    const retry = await prepareLivePhotoProductReference({ sourcePath: boardPath, outputDir, variant: 'structure_retry' })
    const cached = await prepareLivePhotoProductReference({ sourcePath: boardPath, outputDir, variant: 'primary' })
    assert.equal(cached.path, primary.path)

    const primaryColors = await colorCounts(primary.path)
    assert.equal(primaryColors.width, 1024)
    assert.equal(primaryColors.height, 1024)
    assert.ok(primaryColors.blue > 10_000)
    assert.equal(primaryColors.red, 0)
    assert.equal(primaryColors.green, 0)

    const retryColors = await colorCounts(retry.path)
    assert.equal(retryColors.width, 1024)
    assert.equal(retryColors.height, 1024)
    assert.ok(retryColors.red > 10_000)
    assert.equal(retryColors.green, 0)
    assert.equal(retryColors.blue, 0)

    const pairPath = path.join(root, 'pair.png')
    await sharp({ create: { width: 800, height: 800, channels: 3, background: '#ffffff' } })
      .composite([
        { input: { create: { width: 130, height: 220, channels: 3, background: '#ef3038' } }, left: 220, top: 290 },
        { input: { create: { width: 130, height: 220, channels: 3, background: '#20a84a' } }, left: 450, top: 290 },
      ])
      .png()
      .toFile(pairPath)
    const pairPrimary = await prepareLivePhotoProductReference({ sourcePath: pairPath, outputDir, variant: 'primary' })
    const pairColors = await colorCounts(pairPrimary.path)
    assert.ok(pairColors.red > 10_000)
    assert.equal(pairColors.green, 0)

    const ringBoardPath = path.join(root, 'ring_fixture_analysis_board_test.png')
    await sharp({ create: { width: 600, height: 900, channels: 3, background: '#ffffff' } })
      .composite([
        {
          input: await sharp({ create: { width: 120, height: 180, channels: 4, background: '#ffffff' } })
            .composite([
              { input: { create: { width: 88, height: 88, channels: 4, background: '#ef3038' } }, left: 16, top: 40 },
              { input: { create: { width: 40, height: 40, channels: 4, background: '#ffffff' } }, left: 40, top: 64 },
              { input: { create: { width: 38, height: 38, channels: 4, background: '#ef3038' } }, left: 41, top: 17 },
            ])
            .png()
            .toBuffer(),
          left: 348,
          top: 42,
        },
        {
          input: await sharp({ create: { width: 120, height: 180, channels: 3, background: '#ffffff' } })
            .composite([{ input: { create: { width: 92, height: 92, channels: 3, background: '#20a84a' } }, left: 14, top: 28 }])
            .png()
            .toBuffer(),
          left: 468,
          top: 42,
        },
        {
          input: await sharp({ create: { width: 150, height: 180, channels: 3, background: '#2855e8' } })
            .png()
            .toBuffer(),
          left: 375,
          top: 650,
        },
      ])
      .png()
      .toFile(ringBoardPath)
    const ringPrimary = await prepareLivePhotoProductReference({
      sourcePath: ringBoardPath,
      outputDir,
      variant: 'primary',
      hint: { type: 'ring', category: 'rings' },
    })
    const ringRetry = await prepareLivePhotoProductReference({
      sourcePath: ringBoardPath,
      outputDir,
      variant: 'structure_retry',
      hint: { type: 'ring', category: 'rings' },
    })
    const ringPrimaryColors = await colorCounts(ringPrimary.path)
    assert.ok(ringPrimaryColors.red > 6_000)
    assert.ok(ringPrimaryColors.green > 6_000)
    assert.equal(ringPrimaryColors.blue, 0)
    const ringRetryColors = await colorCounts(ringRetry.path)
    assert.ok(ringRetryColors.red > 6_000)
    assert.ok(ringRetryColors.green > 6_000)
    assert.equal(ringRetryColors.blue, 0)

    console.log('live photo product reference smoke test passed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
