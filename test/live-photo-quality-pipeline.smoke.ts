import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { configureAppPathRuntime } from '../src/main/lib/paths'

function buildFixturePpm(kind: 'scene' | 'product' | 'generated') {
  const pixels: string[] = []
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const isProduct = x >= 38 && x <= 90 && y >= 38 && y <= 90
      const active = kind === 'product' ? isProduct : kind === 'generated' ? isProduct : false
      pixels.push(active ? '20 80 180' : kind === 'product' ? '255 255 255' : '220 220 220')
    }
  }
  return Buffer.from(`P3\n128 128\n255\n${pixels.join(' ')}\n`, 'ascii')
}

function buildProductBoardPpm() {
  const pixels: string[] = []
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const grid = x === 127 || x === 128 || y === 127 || y === 128
      const localX = x % 128
      const localY = y % 128
      const product = localX >= 38 && localX <= 90 && localY >= 26 && localY <= 78
      const caption = localY >= 108 && localY <= 113 && localX >= 24 && localX <= 104
      pixels.push(grid || caption ? '20 20 20' : product ? '20 80 180' : '255 255 255')
    }
  }
  return Buffer.from(`P3\n256 256\n255\n${pixels.join(' ')}\n`, 'ascii')
}

function buildTexturedSceneRaw(width: number, height: number) {
  const data = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3
      const checker = (Math.floor(x / 18) + Math.floor(y / 18)) % 2 === 0 ? 34 : 0
      data[offset] = (x * 11 + y * 3 + checker) % 210
      data[offset + 1] = (x * 5 + y * 13 + checker) % 210
      data[offset + 2] = (x * 17 + y * 7 + checker) % 210
    }
  }
  return data
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-quality-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  const sqlite = await import('../src/main/modules/live-photo/sqlite')
  const { livePhotoPromptVersionService } = await import('../src/main/modules/live-photo/promptVersions')
  const { buildLivePhotoQualityCacheKey, livePhotoQualityCache } = await import('../src/main/modules/live-photo/qualityCache')
  const { runLocalLivePhotoQualityCheck, stopLocalLivePhotoQualityChecker } = await import('../src/main/modules/live-photo/qualityChecker')
  const { submitLivePhotoImageGeneration } = await import('../src/main/modules/live-photo/imageGenerationAdapter')

  try {
    const qualityRoot = path.resolve('resources', 'live-photo-quality')
    const bundledPython = path.join(qualityRoot, 'python', 'python.exe')
    const qualityServicePath = path.join(qualityRoot, 'quality_service.py')
    const structureGateResults = JSON.parse(
      execFileSync(
        bundledPython,
        [
          '-c',
          [
            'import importlib.util, json, sys',
            'spec = importlib.util.spec_from_file_location("quality_service", sys.argv[1])',
            'module = importlib.util.module_from_spec(spec)',
            'spec.loader.exec_module(module)',
            'profile = {"minimumDinoV2": 0.72, "minimumOrb": 0.42}',
            'print(json.dumps([module.sparse_structure_gate_failed(0.80, 0.0, profile), module.sparse_structure_gate_failed(0.60, 0.60, profile), module.sparse_structure_gate_failed(0.60, 0.20, profile)]))',
          ].join('\n'),
          qualityServicePath,
        ],
        { encoding: 'utf8' },
      ),
    )
    assert.deepEqual(structureGateResults, [false, false, true])

    const seeded = livePhotoPromptVersionService.list()
    assert.equal(seeded.length, 1)
    assert.equal(seeded[0]?.active, true)
    assert.match(seeded[0]?.prompt || '', /exact physical product from Image 2/i)

    const created = livePhotoPromptVersionService.save({ name: 'Quality Prompt', prompt: 'Prompt version two' })
    assert.equal(created.version, 2)
    const active = livePhotoPromptVersionService.activate(created.id)
    assert.equal(active.id, created.id)
    assert.equal(active.active, true)
    const rollback = livePhotoPromptVersionService.rollback(seeded[0]!.id)
    assert.equal(rollback.version, 3)
    assert.equal(rollback.prompt, seeded[0]!.prompt)
    assert.equal(livePhotoPromptVersionService.getActive().id, rollback.id)

    const providerCalls: string[] = []
    const routed = await submitLivePhotoImageGeneration({
      adapters: [
        {
          provider: 'primary',
          submit: async () => {
            providerCalls.push('primary')
            throw new Error('primary unavailable')
          },
        },
        {
          provider: 'fallback',
          submit: async () => {
            providerCalls.push('fallback')
            return {
              mode: 'direct' as const,
              provider: 'fallback',
              stillPath: 'fixture.png',
              productReferenceImagePaths: ['product.png'],
            }
          },
        },
      ],
    })
    assert.equal(routed.provider, 'fallback')
    assert.deepEqual(providerCalls, ['primary', 'fallback'])

    const scenePath = path.join(root, 'scene.png')
    const productPath = path.join(root, 'product.png')
    const outputPath = path.join(root, 'output.png')
    const sceneBytes = buildFixturePpm('scene')
    const productBytes = buildFixturePpm('product')
    const outputBytes = buildFixturePpm('generated')
    await Promise.all([
      writeFile(scenePath, sceneBytes),
      writeFile(productPath, productBytes),
      writeFile(outputPath, outputBytes),
    ])
    const key = await buildLivePhotoQualityCacheKey({
      scenePath,
      productPath,
      promptHash: rollback.promptHash,
      provider: 'openai',
      model: 'gpt-image-1',
      outputSize: '1024x1536',
      generationParams: { strategy: 'default' },
      checkerVersion: 'live-photo-quality-v6',
    })
    const changedPromptKey = await buildLivePhotoQualityCacheKey({
      scenePath,
      productPath,
      promptHash: `${rollback.promptHash}-changed`,
      provider: 'openai',
      model: 'gpt-image-1',
      outputSize: '1024x1536',
      generationParams: { strategy: 'default' },
      checkerVersion: 'live-photo-quality-v6',
    })
    assert.notEqual(changedPromptKey, key)
    const changedParamsKey = await buildLivePhotoQualityCacheKey({
      scenePath,
      productPath,
      promptHash: rollback.promptHash,
      provider: 'openai',
      model: 'gpt-image-1',
      outputSize: '1024x1536',
      generationParams: { strategy: 'erase_first' },
      checkerVersion: 'live-photo-quality-v6',
    })
    assert.notEqual(changedParamsKey, key)
    await writeFile(productPath, 'product-changed', 'utf8')
    const changedProductKey = await buildLivePhotoQualityCacheKey({
      scenePath,
      productPath,
      promptHash: rollback.promptHash,
      provider: 'openai',
      model: 'gpt-image-1',
      outputSize: '1024x1536',
      generationParams: { strategy: 'default' },
      checkerVersion: 'live-photo-quality-v6',
    })
    assert.notEqual(changedProductKey, key)
    await writeFile(productPath, productBytes)
    const passReport = {
      checkerVersion: 'live-photo-quality-v6',
      mode: 'remote_fallback' as const,
      decision: 'pass' as const,
      score: 0.9,
      threshold: 0.88,
      retryFloor: 0.65,
      components: { clip: 0, dinov2: 0, orb: 0, ssim: 0, scenePreservation: 0.9, textConsistency: 0.9 },
      hardFailures: [],
      notes: [],
      durationMs: 1,
      checkedAt: Date.now(),
    }
    await livePhotoQualityCache.put({ key, sourcePath: outputPath, quality: passReport })
    const cached = await livePhotoQualityCache.get(key)
    assert.equal(cached?.quality.decision, 'pass')
    await writeFile(cached!.imagePath, 'corrupted', 'utf8')
    assert.equal(await livePhotoQualityCache.get(key), null)
    await writeFile(outputPath, outputBytes)
    const rejected = await livePhotoQualityCache.put({
      key: `${key}-reject`,
      sourcePath: outputPath,
      quality: { ...passReport, decision: 'reject', score: 0.4 },
    })
    assert.equal(rejected, null)

    delete process.env.VIDEOGENERATE_LIVE_PHOTO_PYTHON
    process.env.VIDEOGENERATE_LIVE_PHOTO_QUALITY_ROOT = path.join(root, 'missing-quality-root')
    const unavailable = await runLocalLivePhotoQualityCheck({
      scenePath,
      productPath,
      generatedPath: outputPath,
      passThreshold: 0.88,
      retryFloor: 0.65,
      timeoutMs: 5_000,
    })
    assert.equal(unavailable.available, false)
    assert.match(String(unavailable.reason || ''), /bundled_python_missing|quality_service_missing/i)

    stopLocalLivePhotoQualityChecker()
    delete process.env.VIDEOGENERATE_LIVE_PHOTO_QUALITY_ROOT
    const local = await runLocalLivePhotoQualityCheck({
      scenePath,
      productPath,
      generatedPath: outputPath,
      passThreshold: 0.88,
      retryFloor: 0.65,
      timeoutMs: 30_000,
    })
    assert.equal(local.available, true)
    assert.equal(local.report?.mode, 'local_python')
    assert.ok((local.report?.components.clip || 0) > 0.5)
    assert.ok((local.report?.components.dinov2 || 0) > 0.5)

    const productBoardPath = path.join(root, 'product-board.png')
    await writeFile(productBoardPath, buildProductBoardPpm())
    const boardLocal = await runLocalLivePhotoQualityCheck({
      scenePath,
      productPath: productBoardPath,
      generatedPath: outputPath,
      passThreshold: 0.88,
      retryFloor: 0.65,
      timeoutMs: 30_000,
    })
    assert.equal(boardLocal.available, true)
    assert.ok((boardLocal.report?.components.scenePreservation || 0) >= 0.94)
    assert.equal(boardLocal.report?.hardFailures.includes('product_text_consistency'), false)
    assert.match(boardLocal.report?.notes.join('\n') || '', /text_check:not_applicable/)

    const alignedScenePath = path.join(root, 'aligned-scene.png')
    const alignedGeneratedPath = path.join(root, 'aligned-generated.png')
    const alignedProductPath = path.join(root, 'single-product-alignment-fixture.png')
    const sceneWidth = 360
    const sceneHeight = 640
    await sharp(buildTexturedSceneRaw(sceneWidth, sceneHeight), {
      raw: { width: sceneWidth, height: sceneHeight, channels: 3 },
    })
      .composite([{ input: { create: { width: 42, height: 64, channels: 3, background: '#1f8f55' } }, left: 224, top: 252 }])
      .png()
      .toFile(alignedScenePath)
    const replacement = await sharp({ create: { width: 50, height: 66, channels: 3, background: '#d42834' } })
      .composite([
        { input: { create: { width: 38, height: 6, channels: 3, background: '#202020' } }, left: 6, top: 14 },
        { input: { create: { width: 6, height: 38, channels: 3, background: '#202020' } }, left: 22, top: 14 },
      ])
      .png()
      .toBuffer()
    await sharp(alignedScenePath)
      .composite([{ input: replacement, left: 220, top: 251 }])
      .png()
      .toFile(alignedGeneratedPath)
    await sharp({ create: { width: 256, height: 256, channels: 3, background: '#ffffff' } })
      .composite([{ input: replacement, left: 103, top: 95 }])
      .png()
      .toFile(alignedProductPath)
    const alignedLocal = await runLocalLivePhotoQualityCheck({
      scenePath: alignedScenePath,
      productPath: alignedProductPath,
      generatedPath: alignedGeneratedPath,
      passThreshold: 0.88,
      retryFloor: 0.65,
      timeoutMs: 30_000,
    })
    assert.equal(alignedLocal.available, true)
    assert.ok(
      (alignedLocal.report?.components.scenePreservation || 0) >= 0.94,
      JSON.stringify(alignedLocal.report),
    )
    assert.equal(alignedLocal.report?.hardFailures.includes('scene_preservation'), false)
    assert.match(alignedLocal.report?.notes.join('\n') || '', /scene_alignment:feature_homography/)
    const roiNote = alignedLocal.report?.notes.find((note) => note.startsWith('replacement_roi:')) || ''
    const [roiWidth = 0, roiHeight = 0] = roiNote.split(':')[1]?.split(',').slice(2).map(Number) || []
    assert.ok(roiWidth * roiHeight < sceneWidth * sceneHeight * 0.1)

    const pythonLauncher = path.join(String(process.env.WINDIR || 'C:\\Windows'), 'py.exe')
    if (existsSync(pythonLauncher)) {
      const fixtureRoot = path.join(root, 'quality-fixture')
      await mkdir(fixtureRoot, { recursive: true })
      process.env.VIDEOGENERATE_LIVE_PHOTO_PYTHON = String(
        execFileSync(pythonLauncher, ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }),
      ).trim()
      process.env.VIDEOGENERATE_LIVE_PHOTO_QUALITY_ROOT = fixtureRoot
      await writeFile(
        path.join(fixtureRoot, 'quality_service.py'),
        [
          '# -*- coding: utf-8 -*-',
          'import json',
          'print(json.dumps({"ok": True, "score": 0.91, "components": {"clip": 0.92, "dinov2": 0.9, "orb": 0.89, "ssim": 0.88, "scenePreservation": 0.99, "textConsistency": 0.95}, "hardFailures": [], "notes": ["fixture"], "durationMs": 7}))',
        ].join('\n'),
        'utf8',
      )
      const success = await runLocalLivePhotoQualityCheck({
        scenePath,
        productPath,
        generatedPath: outputPath,
        passThreshold: 0.88,
        retryFloor: 0.65,
        timeoutMs: 5_000,
      })
      assert.equal(success.available, true)
      assert.equal(success.report?.decision, 'pass')
      assert.equal(success.report?.durationMs, 7)

      stopLocalLivePhotoQualityChecker()
      await writeFile(
        path.join(fixtureRoot, 'quality_service.py'),
        'import json\nprint(json.dumps({"ok": True, "score": 0.72, "components": {}, "hardFailures": [], "notes": []}))\n',
        'utf8',
      )
      const retry = await runLocalLivePhotoQualityCheck({
        scenePath,
        productPath,
        generatedPath: outputPath,
        passThreshold: 0.88,
        retryFloor: 0.65,
        timeoutMs: 5_000,
      })
      assert.equal(retry.report?.decision, 'retry')

      stopLocalLivePhotoQualityChecker()
      await writeFile(
        path.join(fixtureRoot, 'quality_service.py'),
        'import json\nprint(json.dumps({"ok": True, "score": 0.73, "components": {}, "hardFailures": [], "notes": [], "qualityProfile": "sparse_wearable", "recommendedPassThreshold": 0.72, "recommendedRetryFloor": 0.55}))\n',
        'utf8',
      )
      const sparseWearable = await runLocalLivePhotoQualityCheck({
        scenePath,
        productPath,
        generatedPath: outputPath,
        passThreshold: 0.88,
        retryFloor: 0.65,
        timeoutMs: 5_000,
      })
      assert.equal(sparseWearable.report?.decision, 'pass')
      assert.equal(sparseWearable.report?.threshold, 0.72)

      stopLocalLivePhotoQualityChecker()
      await writeFile(
        path.join(fixtureRoot, 'quality_service.py'),
        'import json\nprint(json.dumps({"ok": True, "score": 0.99, "components": {}, "hardFailures": ["scene_preservation"], "notes": []}))\n',
        'utf8',
      )
      const hardFailure = await runLocalLivePhotoQualityCheck({
        scenePath,
        productPath,
        generatedPath: outputPath,
        passThreshold: 0.88,
        retryFloor: 0.65,
        timeoutMs: 5_000,
      })
      assert.equal(hardFailure.report?.decision, 'reject')

      stopLocalLivePhotoQualityChecker()
      await writeFile(path.join(fixtureRoot, 'quality_service.py'), 'raise RuntimeError("fixture crash")\n', 'utf8')
      const crashed = await runLocalLivePhotoQualityCheck({
        scenePath,
        productPath,
        generatedPath: outputPath,
        passThreshold: 0.88,
        retryFloor: 0.65,
        timeoutMs: 5_000,
      })
      assert.equal(crashed.available, false)
      assert.match(String(crashed.reason || ''), /quality_checker_unavailable|fixture crash/i)

      stopLocalLivePhotoQualityChecker()
      await writeFile(path.join(fixtureRoot, 'quality_service.py'), 'import time\ntime.sleep(10)\n', 'utf8')
      const timedOut = await runLocalLivePhotoQualityCheck({
        scenePath,
        productPath,
        generatedPath: outputPath,
        passThreshold: 0.88,
        retryFloor: 0.65,
        timeoutMs: 5_000,
      })
      assert.equal(timedOut.available, false)
      assert.equal(timedOut.reason, 'quality_checker_timeout')
    }

    console.log('live photo quality pipeline smoke test passed')
  } finally {
    sqlite.closeLivePhotoSqlite()
    stopLocalLivePhotoQualityChecker()
    delete process.env.VIDEOGENERATE_DATA_DIR
    delete process.env.VIDEOGENERATE_LIVE_PHOTO_PYTHON
    delete process.env.VIDEOGENERATE_LIVE_PHOTO_QUALITY_ROOT
    await new Promise((resolve) => setTimeout(resolve, 300))
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
