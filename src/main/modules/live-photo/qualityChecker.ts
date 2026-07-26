import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { LivePhotoQualityReport, LivePhotoReplacementRegion } from './types'

export const LIVE_PHOTO_QUALITY_CHECKER_VERSION = 'live-photo-quality-v8'

type PythonQualityResponse = {
  requestId?: string
  ok?: boolean
  unavailable?: boolean
  reason?: string
  score?: number
  components?: Partial<LivePhotoQualityReport['components']>
  hardFailures?: string[]
  notes?: string[]
  durationMs?: number
  qualityProfile?: string
  recommendedPassThreshold?: number
  recommendedRetryFloor?: number
}

type PendingRequest = {
  resolve: (response: PythonQualityResponse) => void
  timer: NodeJS.Timeout
}

function qualityResourceRoot() {
  const explicit = String(process.env.VIDEOGENERATE_LIVE_PHOTO_QUALITY_ROOT || '').trim()
  if (explicit) return explicit
  const packagedRoot = typeof process.resourcesPath === 'string' ? join(process.resourcesPath, 'live-photo-quality') : ''
  if (packagedRoot && existsSync(packagedRoot)) return packagedRoot
  return join(process.cwd(), 'resources', 'live-photo-quality')
}

function resolvePythonExecutable(root: string) {
  const explicit = String(process.env.VIDEOGENERATE_LIVE_PHOTO_PYTHON || '').trim()
  if (explicit && existsSync(explicit)) return explicit
  const bundled = join(root, 'python', 'python.exe')
  return existsSync(bundled) ? bundled : ''
}

function clampScore(value: unknown) {
  const score = Number(value)
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(1, score))
}

let sharedProcess: LivePhotoQualityProcess | undefined

class LivePhotoQualityProcess {
  private child: ChildProcessWithoutNullStreams | undefined
  private stdoutBuffer = ''
  private stderrBuffer = ''
  private pending = new Map<string, PendingRequest>()
  private idleTimer: NodeJS.Timeout | undefined

  constructor(
    readonly root: string,
    readonly python: string,
    readonly script: string,
  ) {}

  private ensureStarted() {
    if (this.child && !this.child.killed) return this.child
    const child = spawn(this.python, ['-I', this.script, '--serve'], {
      cwd: this.root,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    })
    this.child = child
    this.stdoutBuffer = ''
    this.stderrBuffer = ''
    child.stdout.on('data', (chunk) => this.consumeStdout(String(chunk || '')))
    child.stderr.on('data', (chunk) => {
      this.stderrBuffer = `${this.stderrBuffer}${String(chunk || '')}`.slice(-2_000)
    })
    child.on('error', (error) => this.failAll(`python_spawn_failed:${error.message}`))
    child.on('close', () => {
      this.failAll(String(this.stderrBuffer || 'quality_checker_unavailable').trim())
      this.child = undefined
      if (sharedProcess === this) sharedProcess = undefined
    })
    return child
  }

  private consumeStdout(chunk: string) {
    this.stdoutBuffer += chunk
    const lines = this.stdoutBuffer.split(/\r?\n/)
    this.stdoutBuffer = lines.pop() || ''
    for (const line of lines.map((item) => item.trim()).filter(Boolean)) {
      let parsed: PythonQualityResponse
      try {
        parsed = JSON.parse(line) as PythonQualityResponse
      } catch (error) {
        this.failAll(`quality_response_invalid:${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      const requestId = String(parsed.requestId || '').trim() || (this.pending.size === 1 ? this.pending.keys().next().value : '')
      if (!requestId) continue
      const pending = this.pending.get(requestId)
      if (!pending) continue
      clearTimeout(pending.timer)
      this.pending.delete(requestId)
      pending.resolve(parsed)
      this.scheduleIdleStop()
    }
  }

  private failAll(reason: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.resolve({ ok: false, unavailable: true, reason })
    }
    this.pending.clear()
  }

  private scheduleIdleStop() {
    if (this.pending.size) return
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.stop(), 60_000)
    this.idleTimer.unref()
  }

  async request(payload: Record<string, unknown>, timeoutMs: number) {
    const child = this.ensureStarted()
    if (this.idleTimer) clearTimeout(this.idleTimer)
    const requestId = randomUUID()
    return await new Promise<PythonQualityResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        resolve({ ok: false, unavailable: true, reason: 'quality_checker_timeout' })
        this.stop()
      }, Math.max(5_000, timeoutMs))
      this.pending.set(requestId, { resolve, timer })
      child.stdin.write(`${JSON.stringify({ ...payload, requestId })}\n`, 'utf8', (error) => {
        if (!error) return
        const pending = this.pending.get(requestId)
        if (!pending) return
        clearTimeout(pending.timer)
        this.pending.delete(requestId)
        pending.resolve({ ok: false, unavailable: true, reason: `quality_request_write_failed:${error.message}` })
      })
    })
  }

  stop() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = undefined
    const child = this.child
    this.child = undefined
    if (child && !child.killed) child.kill()
  }
}

export function stopLocalLivePhotoQualityChecker() {
  sharedProcess?.stop()
  sharedProcess = undefined
}

export async function runLocalLivePhotoQualityCheck(input: {
  scenePath: string
  productPath: string
  generatedPath: string
  passThreshold: number
  retryFloor: number
  timeoutMs?: number
  productType?: string
  productCategory?: string
  replacementRegion?: LivePhotoReplacementRegion
}): Promise<{ available: boolean; reason?: string; report?: LivePhotoQualityReport }> {
  const startedAt = Date.now()
  const root = qualityResourceRoot()
  const python = resolvePythonExecutable(root)
  const script = join(root, 'quality_service.py')
  if (!python) return { available: false, reason: 'bundled_python_missing' }
  if (!existsSync(script)) return { available: false, reason: 'quality_service_missing' }

  if (!sharedProcess || sharedProcess.root !== root || sharedProcess.python !== python || sharedProcess.script !== script) {
    sharedProcess?.stop()
    sharedProcess = new LivePhotoQualityProcess(root, python, script)
  }
  const parsed = await sharedProcess.request(
    {
      scenePath: input.scenePath,
      productPath: input.productPath,
      generatedPath: input.generatedPath,
      productType: String(input.productType || '').trim() || undefined,
      productCategory: String(input.productCategory || '').trim() || undefined,
      replacementRegion: input.replacementRegion,
      modelRoot: join(root, 'models'),
    },
    Number(input.timeoutMs || 120_000),
  )
  if (parsed.unavailable || !parsed.ok) {
    return { available: false, reason: String(parsed.reason || 'quality_checker_unavailable').slice(0, 500) }
  }
  const components = {
    clip: clampScore(parsed.components?.clip),
    dinov2: clampScore(parsed.components?.dinov2),
    orb: clampScore(parsed.components?.orb),
    ssim: clampScore(parsed.components?.ssim),
    scenePreservation: clampScore(parsed.components?.scenePreservation),
    textConsistency: clampScore(parsed.components?.textConsistency),
  }
  const score = clampScore(parsed.score)
  const hardFailures = Array.isArray(parsed.hardFailures) ? parsed.hardFailures.map(String).filter(Boolean) : []
  const recommendedPassThreshold = typeof parsed.recommendedPassThreshold === 'number'
    ? parsed.recommendedPassThreshold
    : Number.NaN
  const recommendedRetryFloor = typeof parsed.recommendedRetryFloor === 'number'
    ? parsed.recommendedRetryFloor
    : Number.NaN
  const passThreshold = Number.isFinite(recommendedPassThreshold)
    ? Math.min(input.passThreshold, clampScore(recommendedPassThreshold))
    : input.passThreshold
  const retryFloor = Number.isFinite(recommendedRetryFloor)
    ? Math.min(input.retryFloor, clampScore(recommendedRetryFloor), passThreshold)
    : input.retryFloor
  const decision = hardFailures.length ? 'reject' : score >= passThreshold ? 'pass' : score >= retryFloor ? 'retry' : 'reject'
  return {
    available: true,
    report: {
      checkerVersion: LIVE_PHOTO_QUALITY_CHECKER_VERSION,
      mode: 'local_python',
      decision,
      score,
      threshold: passThreshold,
      retryFloor,
      components,
      hardFailures,
      notes: [
        ...(Array.isArray(parsed.notes) ? parsed.notes.map(String).filter(Boolean) : []),
        ...(parsed.qualityProfile ? [`quality_profile:${String(parsed.qualityProfile)}`] : []),
      ],
      durationMs: Math.max(0, Number(parsed.durationMs ?? Date.now() - startedAt) || 0),
      checkedAt: Date.now(),
    },
  }
}
