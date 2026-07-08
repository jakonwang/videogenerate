import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-live-photo-video-provider-'))
  try {
    const { generateShotVideoByProviderChain } = await import('../src/main/modules/clone/providers')

    const framesDir = path.join(root, 'frames')
    await mkdir(framesDir, { recursive: true })
    const stillPath = path.join(framesDir, 'still.png')
    await writeFile(stillPath, 'mock-frame', 'utf-8')

    const logs: string[] = []
    const originalConsoleLog = console.log
    console.log = (...args: any[]) => {
      logs.push(
        args
          .map((item) => {
            if (typeof item === 'string') return item
            try {
              return JSON.stringify(item)
            } catch {
              return String(item)
            }
          })
          .join(' '),
      )
    }

    try {
      await assert.rejects(
        generateShotVideoByProviderChain({
        shot: {
          id: 'live-photo-shot',
          index: 0,
          purpose: 'solution',
          startSec: 0,
          endSec: 6,
          durationSec: 6,
          motion: 'zoom_in',
          replaceMode: 'ai_generate',
          productType: 'general',
          productReferenceImagePaths: [],
          productMainImage: stillPath,
          generatedFirstFramePath: stillPath,
          generatedLastFramePath: stillPath,
          scriptText: 'Live photo provider prompt test.',
          scriptRole: 'show',
          visualDescription: 'Locked product-only scene.',
          actionDescription: 'Zero human interaction.',
          cameraDescription: 'Product fully frozen with only extremely subtle non-product micro-movement.',
          productFocus: 'Keep exact product identity.',
          generationPrompt: 'Direct compiled live-photo prompt should be used.',
          scriptConfidence: 1,
          framing: 'closeup',
          cameraMovement: 'Product fully frozen with only extremely subtle non-product micro-movement, with no push-in, no pull-back, no refocus, and no noticeable shake',
          action: 'Product fully frozen with only non-product ambient micro-movement.',
          productVisibility: 'high',
          replacementMode: 'ai_generate',
          aiDifficulty: 'low',
          realismRisk: 'low',
          realismStyle: 'product_closeup',
          forceAi: true,
          locked: true,
          status: 'ready',
          visual: 'live photo motion clip',
          subtitleSuggestion: '',
          materialNeed: 'locked still frame',
          sourceMode: 'ai',
          uploadedAssetIds: [],
          aiEnabled: true,
          reviewStatus: 'pending',
          consistencyMode: 'strict',
          promptCompilerVersion: 'live-photo-v1',
          compiledPrompt:
            'PROVIDER INPUT ROLE LOCK:\nThe uploaded image array contains exactly 1 image.\nThe uploaded image is the locked still scene and product anchor image.\nTreat this single image as the only visual truth for every frame in the video.\nYou are a product-motion video system for a locked still image.\nSTRUCTURE LOCK:\n* Preserve the exact visible structure, silhouette, proportions, connection points, orientation, and local anchor placement from the locked still.\nNO INFERENCE RULE:\n* Do not infer, reconstruct, redesign, beautify, simplify, or generate unseen product parts.\n* If motion would require rebuilding the product, suppress motion instead of changing product structure.\nFRAME-TO-FRAME IDENTITY LOCK:\n* Treat the product as the exact same frozen object instance across all frames.\n* Treat the product pixels as fully frozen across the full clip and do not animate the product body itself.\n* Do not translate, rotate, swing, bounce, breathe, sway, or drift any visible product region.\nREFERENCE PRIORITY:\n* The locked still image is both the scene anchor and the product identity anchor for the video stage.\n* Do not introduce any alternate product interpretation beyond what is already visible in the locked still image.\nSCALE LOCK:\n* Keep the exact same product footprint size and product-to-scene ratio from the locked still.\n* The apparent product size change across the full clip must remain negligible and must not rely on push-in, pull-back, or refocus behavior.\nBODY-CONTROL RULE:\n* preserve the exact same visible crop boundaries from the starting still\n* do not reveal a full face, eyes, nose, mouth, or a wider identity-bearing portrait view\n* keep the clip as a partial non-identity-bearing crop only\n* do not add hands, fingers, palms, wrists, or skin-contact gestures that are not already visible in the starting still\n* same exact visible product instance\n* product fully frozen\n* only tiny non-product micro-movement\n* no push-in\n* no pull-back\n* no refocus',
          compiledNegativePrompt: 'hands, fingers, direct touching',
          prompt: {
            positive:
              'PROVIDER INPUT ROLE LOCK:\nThe uploaded image array contains exactly 1 image.\nThe uploaded image is the locked still scene and product anchor image.\nTreat this single image as the only visual truth for every frame in the video.\nYou are a product-motion video system for a locked still image.\nSTRUCTURE LOCK:\n* Preserve the exact visible structure, silhouette, proportions, connection points, orientation, and local anchor placement from the locked still.\nREFERENCE PRIORITY:\n* The locked still image is both the scene anchor and the product identity anchor for the video stage.\n* Do not introduce any alternate product interpretation beyond what is already visible in the locked still image.\nSCALE LOCK:\n* Keep the exact same product footprint size and product-to-scene ratio from the locked still.\nBODY-CONTROL RULE:\n* preserve the exact same visible crop boundaries from the starting still\n* keep the clip as a partial non-identity-bearing crop only\n* product fully frozen\n* only tiny non-product micro-movement',
            negative: 'hands, fingers, direct touching',
            cameraMotion: 'Product fully frozen with only extremely subtle non-product micro-movement, with no push-in, no pull-back, no refocus, and no noticeable shake',
            aspectRatio: '9:16',
          },
        },
        outDir: path.join(root, 'out'),
        startFramePath: stillPath,
        endFramePath: stillPath,
        consistencyMode: 'hard',
        credentials: { allowMockWhenNoKey: false } as any,
        chain: [],
        compiledPrompt:
        'PROVIDER INPUT ROLE LOCK:\nThe uploaded image array contains exactly 1 image.\nThe uploaded image is the locked still scene and product anchor image.\nTreat this single image as the only visual truth for every frame in the video.\nYou are a product-motion video system for a locked still image.\nSTRUCTURE LOCK:\n* Preserve the exact visible structure, silhouette, proportions, connection points, orientation, and local anchor placement from the locked still.\nNO INFERENCE RULE:\n* Do not infer, reconstruct, redesign, beautify, simplify, or generate unseen product parts.\n* If motion would require rebuilding the product, suppress motion instead of changing product structure.\nFRAME-TO-FRAME IDENTITY LOCK:\n* Treat the product as the exact same frozen object instance across all frames.\n* Treat the product pixels as fully frozen across the full clip and do not animate the product body itself.\n* Do not translate, rotate, swing, bounce, breathe, sway, or drift any visible product region.\nREFERENCE PRIORITY:\n* The locked still image is both the scene anchor and the product identity anchor for the video stage.\n* Do not introduce any alternate product interpretation beyond what is already visible in the locked still image.\nSCALE LOCK:\n* Keep the exact same product footprint size and product-to-scene ratio from the locked still.\n* The apparent product size change across the full clip must remain negligible and must not rely on push-in, pull-back, or refocus behavior.\nBODY-CONTROL RULE:\n* preserve the exact same visible crop boundaries from the starting still\n* do not reveal a full face, eyes, nose, mouth, or a wider identity-bearing portrait view\n* keep the clip as a partial non-identity-bearing crop only\n* do not add hands, fingers, palms, wrists, or skin-contact gestures that are not already visible in the starting still\n* same exact visible product instance\n* product fully frozen\n* only tiny non-product micro-movement\n* no push-in\n* no pull-back\n* no refocus',
        compiledNegativePrompt: 'hands, fingers, direct touching',
      }),
        /Seedance\/AtlasCloud\/GRS\.AI/,
      )
    } finally {
      console.log = originalConsoleLog
    }

    const finalPromptLog = logs.find((line) => line.includes('[clone-debug] final-shot-video-prompts'))
    assert.ok(finalPromptLog, 'Expected final-shot-video-prompts debug log')
    assert.match(finalPromptLog || '', /"useDirectCompiledPrompt":true/i)
    assert.match(finalPromptLog || '', /BODY-CONTROL RULE:/i)
    assert.match(finalPromptLog || '', /PROVIDER INPUT ROLE LOCK:/i)
    assert.match(finalPromptLog || '', /The uploaded image array contains exactly 1 image\./i)
    assert.match(finalPromptLog || '', /The uploaded image array contains exactly 1 image\./i)
    assert.match(finalPromptLog || '', /STRUCTURE LOCK:/i)
    assert.match(finalPromptLog || '', /NO INFERENCE RULE:/i)
    assert.match(finalPromptLog || '', /FRAME-TO-FRAME IDENTITY LOCK:/i)
    assert.match(finalPromptLog || '', /suppress motion instead of changing product structure/i)
    assert.match(finalPromptLog || '', /Treat this single image as the only visual truth for every frame in the video\./i)
    assert.match(finalPromptLog || '', /The locked still image is both the scene anchor and the product identity anchor for the video stage\./i)
    assert.match(finalPromptLog || '', /SCALE LOCK:/i)
    assert.match(finalPromptLog || '', /same exact visible product instance/i)
    assert.match(finalPromptLog || '', /product fully frozen/i)
    assert.match(finalPromptLog || '', /product pixels as fully frozen/i)
    assert.match(finalPromptLog || '', /only tiny non-product micro-movement/i)
    assert.match(finalPromptLog || '', /do not translate, rotate, swing, bounce, breathe, sway, or drift any visible product region/i)
    assert.match(finalPromptLog || '', /no push-in/i)
    assert.match(finalPromptLog || '', /no pull-back/i)
    assert.match(finalPromptLog || '', /no refocus/i)
    assert.match(finalPromptLog || '', /apparent product size change across the full clip must remain negligible/i)
    assert.match(finalPromptLog || '', /locked still image/i)
    assert.match(finalPromptLog || '', /do not reveal a full face/i)
    assert.match(finalPromptLog || '', /partial non-identity-bearing crop only/i)
    assert.doesNotMatch(finalPromptLog || '', /same identity/i)
    assert.doesNotMatch(finalPromptLog || '', /Instagram natural style/i)
    assert.doesNotMatch(finalPromptLog || '', /Xiaohongshu/i)

    console.log('live photo video provider prompt smoke test passed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
