import assert from 'node:assert/strict'
import { access, mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { renderViralCloneBatch } from '../src/main/modules/clone/renderViralCloneBatch'

async function ensureExists(path: string) {
  await access(path)
  return path
}

async function main() {
  const root = 'D:\\phpstudy_pro\\WWW\\videogenerate\\.videogenerate\\viral-clone\\b79f1d94-1ada-43e6-8136-3a42c7b3a411\\outputs\\job_001_try_1'
  const outputDir = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-real-local-assets-'))
  const sourcePaths = await Promise.all([
    ensureExists(join(root, 'shot_1.mp4')),
    ensureExists(join(root, 'shot_2.mp4')),
    ensureExists(join(root, 'shot_3.mp4')),
    ensureExists(join(root, 'shot_4.mp4')),
    ensureExists(join(root, 'shot_5.mp4')),
  ])

  const result = await renderViralCloneBatch({
    projectId: 'real-local-assets-rhythm-project',
    shots: [
      {
        id: 'shot_hook_real',
        index: 0,
        durationSec: 1.9,
        generatedClipPath: sourcePaths[0],
        generatedSource: 'cloud',
        scriptRole: 'hook',
        onScreenText: 'See the result right away.',
        actionDescription: 'direct result reveal with quick payoff',
        productFocus: 'hero result visible immediately',
        motion: 'static',
      } as any,
      {
        id: 'shot_payoff_real',
        index: 1,
        durationSec: 2.2,
        generatedClipPath: sourcePaths[1],
        generatedSource: 'cloud',
        scriptRole: 'proof',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'visible product detail and payoff close-up',
        actionDescription: 'clear proof hold with result focus',
        motion: 'static',
      } as any,
      {
        id: 'shot_repeat_real',
        index: 2,
        durationSec: 2.2,
        generatedClipPath: sourcePaths[2],
        generatedSource: 'cloud',
        scriptRole: 'proof',
        storyboardReferenceMode: 'product_closeup',
        framing: 'closeup',
        productVisibility: 'high',
        shotType: 'closeup',
        productFocus: 'visible product detail and payoff close-up',
        actionDescription: 'steady repeated detail hold',
        motion: 'static',
      } as any,
      {
        id: 'shot_show_real',
        index: 3,
        durationSec: 2.1,
        generatedClipPath: sourcePaths[3],
        generatedSource: 'cloud',
        scriptRole: 'show',
        framing: 'medium',
        productVisibility: 'medium',
        shotType: 'model_demo',
        productFocus: 'natural product use',
        actionDescription: 'natural demo with clean payoff',
        motion: 'pan_right',
      } as any,
      {
        id: 'shot_cta_real',
        index: 4,
        durationSec: 1.8,
        generatedClipPath: sourcePaths[4],
        generatedSource: 'cloud',
        scriptRole: 'cta',
        onScreenText: 'Tap now to get yours before it sells out today only.',
        actionDescription: 'order now limited time full set deal',
        motion: 'static',
      } as any,
    ],
    outDir: outputDir,
    count: 1,
    maxRetry: 0,
  })

  assert.equal(result.outputs.length, 1)
  const report = JSON.parse(await readFile(result.reportPath, 'utf8'))
  const composeSummary = report?.composeSummary
  const sources = report?.items?.[0]?.shotSources ?? []
  const targets = report?.items?.[0]?.shotOptimizationTargets ?? []
  const transitions = report?.items?.[0]?.transitions ?? []
  const repeatProof = sources.find((entry: any) => entry.shotId === 'shot_repeat_real')
  const payoffProof = sources.find((entry: any) => entry.shotId === 'shot_payoff_real')
  const showShot = sources.find((entry: any) => entry.shotId === 'shot_show_real')
  const cta = sources.find((entry: any) => entry.shotId === 'shot_cta_real')
  const repeatProofTarget = targets.find((entry: any) => entry.shotId === 'shot_repeat_real')
  const showTarget = targets.find((entry: any) => entry.shotId === 'shot_show_real')

  assert.equal(report?.success, 1)
  assert.equal(composeSummary?.stageCounts?.hook, 1)
  assert.equal(composeSummary?.stageCounts?.body, 3)
  assert.equal(composeSummary?.stageCounts?.close, 1)
  assert.ok(Number(composeSummary?.rhythmScore || 0) >= 70)
  assert.equal(composeSummary?.upstreamOptimizationPatch?.increaseMidVariation, true)
  assert.equal(Array.isArray(composeSummary?.health?.flags), true)
  assert.equal(composeSummary?.health?.flags.includes('low_variation_signal'), true)
  assert.equal(Boolean(repeatProof?.composeDiagnostics?.adjacency?.needsPatternBreak), true)
  assert.equal(Boolean(repeatProof?.composeDiagnostics?.adjacency?.repeatedCloseupFeel), true)
  assert.equal(Boolean(showShot?.composeDiagnostics?.adjacency?.preCloseConfirmationCandidate), true)
  assert.equal(Boolean(cta?.composeDiagnostics?.ctaPressure?.shouldSnapClose), true)
  assert.equal(repeatProofTarget?.lane, 'body')
  assert.equal(Array.isArray(repeatProofTarget?.promptDirectives), true)
  assert.equal(
    repeatProofTarget?.promptDirectives?.includes('Upgrade this proof beat with a hand demo, wider usage context, angle shift, or momentum lift.'),
    true,
  )
  assert.equal(showTarget?.lane, 'body')
  assert.equal(
    showTarget?.promptDirectives?.includes('Open this show beat into clearer usage context, body interaction, angle shift, or momentum lift.'),
    true,
  )
  assert.equal(transitions.length, 4)
  assert.equal(transitions[0]?.transition, 'fade')
  assert.equal(transitions[3]?.transition, 'hardcut')
  assert.ok(Number(repeatProof?.clipDurationSec || 0) < Number(payoffProof?.clipDurationSec || 0))
  assert.ok(Number(repeatProof?.clipDurationSec || 0) < 2.2)
  assert.ok(Number(showShot?.clipDurationSec || 0) <= 2.121)
  assert.ok(Number(showShot?.clipStartSec || 0) > 0.6)
  assert.ok(Number(cta?.clipDurationSec || 0) < 1.8)
  assert.ok(Number(cta?.clipStartSec || 0) > 0.8)
  console.log('clone final compose real local assets rhythm smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
