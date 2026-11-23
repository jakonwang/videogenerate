/**
 * Seeds the 图生视频 library with one task per state (locating, waiting for the image model,
 * auto-retrying, failed after retries, image-check decision, done) for the library e2e.
 * Uses VIDEOGENERATE_DATA_DIR from the environment; LP_STUB_URL is the local GRS stub.
 */
import { execFileSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import ffmpegPath from 'ffmpeg-static'
import { cloneRepo } from '../src/main/modules/clone/repo'
import { livePhotoRepo } from '../src/main/modules/live-photo/repo'

const dataDir = String(process.env.VIDEOGENERATE_DATA_DIR || '')
if (!dataDir) throw new Error('VIDEOGENERATE_DATA_DIR is required')
const stub = String(process.env.LP_STUB_URL || 'http://127.0.0.1:9')
const fixtures = path.join(dataDir, 'fixtures')
const now = Date.now()
const sec = 1000
const min = 60 * sec

function svg(bg: string, accent: string, shape: 'ring' | 'earring' | 'hand') {
  const body =
    shape === 'ring'
      ? `<circle cx="300" cy="420" r="95" fill="none" stroke="${accent}" stroke-width="26"/><circle cx="300" cy="318" r="34" fill="#f8fafc" stroke="${accent}" stroke-width="8"/>`
      : shape === 'earring'
        ? `<path d="M240 300 l40 -60 l40 60 l-40 60z" fill="${accent}"/><path d="M340 330 l40 -60 l40 60 l-40 60z" fill="${accent}"/>`
        : `<rect x="180" y="250" width="240" height="420" rx="110" fill="#e7c4a6"/><circle cx="300" cy="330" r="40" fill="none" stroke="${accent}" stroke-width="14"/>`
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="#1f2937"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/>${body}</svg>`,
  )
}

async function image(name: string, bg: string, accent: string, shape: 'ring' | 'earring' | 'hand') {
  const file = path.join(fixtures, name)
  await sharp(svg(bg, accent, shape)).jpeg({ quality: 82 }).toFile(file)
  return file
}

function log(message: string, time: number, level: 'info' | 'success' | 'error' = 'info') {
  return { id: `${time}-${Math.random().toString(16).slice(2)}`, level, message, time }
}

function workflow(step: string, status: 'running' | 'done' | 'failed', updatedAt: number) {
  const steps = ['queued', 'image_generation', 'image_validation', 'video_generation', 'live_photo_packaging', 'completed']
  const index = steps.indexOf(step)
  const stepStatus = Object.fromEntries(
    steps.map((key, i) => [key, { status: i < index ? 'done' : i === index ? status : 'idle', updatedAt: i <= index ? updatedAt - (index - i) * 40 * sec : 0 }]),
  )
  return { currentStep: step, stepStatus, updatedAt }
}

const region = (at: number) => ({ x: 0.3, y: 0.3, width: 0.35, height: 0.3, source: 'auto', confidence: 0.93, revision: 1, updatedAt: at })
const interaction = (at: number) => ({ mode: 'worn', confidence: 0.9, revision: 1, updatedAt: at })
const locateCall = (at: number) => log('[live-photo] model call: step=locate_product provider=grsai model=gpt-5.6-sol endpoint=/v1/chat/completions', at)
const imageCall = (at: number) => log('[live-photo] model call: step=image_generation provider=grsai model=gpt-image-2 endpoint=/v1/draw/completions', at)

async function main() {
  await mkdir(fixtures, { recursive: true })
  await cloneRepo.setCredentials({
    imageProviderPrimary: 'grsai',
    grsaiApiKey: 'stub-key',
    grsaiHost: stub,
    grsaiImageModel: 'gpt-image-2',
    grsaiAnalysisModel: 'gpt-5.6-sol',
    chatProviderPrimary: 'grsai',
    videoProviderPrimary: 'grsai',
    grsaiVideoModel: 'veo3.1-fast',
  } as any)

  const product = await image('product-a1005.jpg', '#f5efe6', '#d97757', 'earring')
  const refEarring = await image('ref-earring.jpg', '#d6c7b0', '#9ca3af', 'earring')
  const refRing = await image('ref-ring.jpg', '#c9a98d', '#cbd5e1', 'hand')
  const stillRing = await image('still-ring.jpg', '#c9a98d', '#f8fafc', 'hand')
  const poster = await image('poster-ring.jpg', '#c9a98d', '#f8fafc', 'hand')
  const video = path.join(fixtures, 'motion-ring.mp4')
  execFileSync(String(ffmpegPath), ['-y', '-loop', '1', '-i', stillRing, '-t', '2', '-vf', 'scale=600:800,zoompan=z=\'min(zoom+0.002,1.1)\':d=50:s=600x800', '-pix_fmt', 'yuv420p', '-r', '25', video], { stdio: 'ignore' })

  const snapshot = (name: string) => ({ id: `p-${name}`, name, type: 'earrings', coverImagePath: product, authoritativeProductReferencePath: product, imagePaths: [product] })
  const base = (id: string, name: string, createdAt: number, ref: string) => ({
    id,
    sourceType: 'reference_replace' as const,
    productId: `p-${name}`,
    productSnapshot: snapshot(name),
    referenceImagePath: ref,
    imagePromptPreview: { provider: 'grsai', model: 'gpt-image-2', prompt: 'Replace the product in Image 1 with the exact physical product from Image 2. Keep pose, lighting and background unchanged.', negativePrompt: 'no extra jewelry, no text', referenceImagePaths: [ref, product] },
    videoPromptPreview: { provider: 'grsai', model: 'veo3.1-fast', prompt: 'Slow push-in on the hand, soft natural light, the ring catches a sparkle.', referenceImagePaths: [ref] },
    promptVersion: 1,
    createdAt,
  })
  const auto = (status: string, stage: string, extra: Record<string, unknown> = {}) => ({ enabled: true, status, currentStage: stage, retryLimit: 2, retryCount: 0, imageRetryMode: 'auto', ...extra })

  const items: any[] = [
    // 1. Locating the product in the reference image (chat model call in flight).
    {
      ...base('lp-locating', 'A-1005', now - 50 * sec, refEarring),
      packagingStatus: 'processing',
      workflow: workflow('image_generation', 'running', now - 40 * sec),
      autoFlowStatus: auto('running', 'image_generation', { lastStartedAt: now - 40 * sec }),
      logs: [log('[live-photo] reference task created', now - 50 * sec), log('[live-photo] stage locate_product started', now - 40 * sec)],
      updatedAt: now - 40 * sec,
    },
    // 2. Image submitted to the image model, waiting for the result.
    {
      ...base('lp-waiting', 'A-1006', now - 3 * min, refEarring),
      packagingStatus: 'processing',
      replacementRegion: region(now - 150 * sec),
      sceneInteraction: interaction(now - 150 * sec),
      imageTaskId: 'grs-img-7f3c21',
      imageTaskProvider: 'grsai',
      imageTaskModel: 'gpt-image-2',
      error: '[remote_pending] 图片任务已提交，正在等待远端结果。taskId=grs-img-7f3c21',
      workflow: workflow('image_generation', 'running', now - 5 * sec),
      autoFlowStatus: auto('running', 'image_generation', { lastStartedAt: now - 5 * sec, lastError: '[remote_pending] 图片任务已提交，正在等待远端结果。taskId=grs-img-7f3c21' }),
      logs: [
        log('[live-photo] reference task created', now - 3 * min),
        log('[live-photo] stage locate_product started', now - 170 * sec),
        locateCall(now - 150 * sec),
        imageCall(now - 140 * sec),
        log('[live-photo] image task submitted: provider=grsai taskId=grs-img-7f3c21', now - 140 * sec),
      ],
      updatedAt: now - 5 * sec,
    },
    // 3. Image service hiccup: counted retry, will try again by itself.
    {
      ...base('lp-retrying', 'B-07', now - 6 * min, refRing),
      packagingStatus: 'failed',
      replacementRegion: region(now - 5 * min),
      sceneInteraction: interaction(now - 5 * min),
      error: '[retryable_remote] Remote image service is temporarily unavailable. fetch failed',
      workflow: workflow('image_generation', 'failed', now - 20 * sec),
      autoFlowStatus: auto('failed_retryable', 'image_generation', { retryCount: 1, failedStage: 'image', retryScope: 'image', imageRetryCount: 1, videoRetryCount: 0, lastError: '[retryable_remote] Remote image service is temporarily unavailable. fetch failed' }),
      logs: [log('[live-photo] reference task created', now - 6 * min), locateCall(now - 5 * min), log('[live-photo] task failed: [retryable_remote] Remote image service is temporarily unavailable. fetch failed', now - 20 * sec, 'error')],
      updatedAt: now - 20 * sec,
    },
    // 4. Product localization kept failing: stopped after the retry limit.
    {
      ...base('lp-failed', 'B-21', now - 12 * min, refRing),
      packagingStatus: 'failed',
      error: '[retry_limit] Image generation retry limit reached after 2 attempts. [locate_failed] Product localization request failed: model=gpt-5.6-sol fetch failed',
      workflow: workflow('image_generation', 'failed', now - 9 * min),
      autoFlowStatus: auto('failed_terminal', 'image_generation', { retryCount: 2, failedStage: 'image', retryScope: 'image', imageRetryCount: 2, videoRetryCount: 0, lastError: '[locate_failed] Product localization request failed: model=gpt-5.6-sol fetch failed' }),
      logs: [log('[live-photo] reference task created', now - 12 * min), log('[live-photo] stage locate_product started', now - 11 * min), log('[live-photo] task failed: [locate_failed] Product localization request failed: model=gpt-5.6-sol fetch failed', now - 9 * min, 'error')],
      updatedAt: now - 9 * min,
    },
    // 5. The generated image failed the check: the user decides.
    {
      ...base('lp-decide', 'C-08', now - 20 * min, refRing),
      packagingStatus: 'failed',
      replacementRegion: region(now - 19 * min),
      sceneInteraction: interaction(now - 19 * min),
      generatedStillPath: stillRing,
      error: '[image_validation_failed] [scale_mismatch] reject: product looks oversized on the finger',
      qualityReport: { checkerVersion: 'v3', mode: 'remote_fallback', decision: 'reject', score: 0.41, threshold: 0.7, retryFloor: 0.5, components: {}, hardFailures: ['scale_mismatch'], notes: [], durationMs: 1200, checkedAt: now - 15 * min },
      workflow: workflow('image_validation', 'failed', now - 15 * min),
      autoFlowStatus: auto('failed_terminal', 'image_validation', { paused: true, retryCount: 2, failedStage: 'image', retryScope: 'image', imageRetryCount: 2, videoRetryCount: 0, lastError: '[image_validation_failed] [scale_mismatch] reject: product looks oversized on the finger' }),
      logs: [log('[live-photo] reference task created', now - 20 * min), locateCall(now - 19 * min), imageCall(now - 18 * min)],
      updatedAt: now - 15 * min,
    },
    // 6. Done.
    {
      ...base('lp-done', 'E-33', now - 60 * min, refRing),
      packagingStatus: 'completed',
      replacementRegion: region(now - 58 * min),
      sceneInteraction: interaction(now - 58 * min),
      generatedStillPath: stillRing,
      motionVideoPath: video,
      previewVideoPath: video,
      posterPath: poster,
      videoTaskId: 'grs-vid-91ab04',
      videoTaskProvider: 'grsai',
      videoTaskModel: 'veo3.1-fast',
      workflow: workflow('completed', 'done', now - 50 * min),
      autoFlowStatus: auto('done', 'completed', { lastCompletedAt: now - 50 * min }),
      logs: [
        log('[live-photo] reference task created', now - 60 * min),
        log('[live-photo] model call: step=locate_product provider=grsai model=gpt-5.6-sol endpoint=/v1/chat/completions cached=1', now - 58 * min),
        imageCall(now - 57 * min),
        log('[live-photo] video task submitted: taskId=grs-vid-91ab04', now - 55 * min),
        log('[live-photo] task completed', now - 50 * min, 'success'),
      ],
      updatedAt: now - 50 * min,
    },
  ]
  for (const item of items) await livePhotoRepo.upsert(item)
  console.log(`seeded ${items.length} live photo tasks`)
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
