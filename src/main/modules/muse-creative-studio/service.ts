import { join } from 'node:path'
import { probeMedia } from '../ffmpeg/probe'
import { getAppPaths } from '../../lib/paths'
import { decryptRuntimeString, encryptRuntimeString, isRuntimeEncryptionAvailable } from '../../lib/runtimeCrypto'
import { createMuseAccounts, type MuseAccounts } from './accounts'
import { checkMuseExit, checkMuseSession, closeMuseBrowsers, loginMuse, MuseProxyError } from './browser'
import { detailImagePicker, MAX_DETAIL_IMAGES, usableImages } from './details'
import { runMuseVideo } from './generate'
import { createMuseJobs, MuseAccountUnavailable } from './jobs'
import { createMuseImages, type MusePrepareImage } from './images'
import { createMusePrompts } from './prompts'
import { museQuotaUsedUp, museResetAt, readMuseQuota } from './quota'
import { createMuseResults, type MuseSubtitleInput, type MuseSubtitleRender } from './results'
import type { MuseAccount, MuseAccountSummary, MuseCreateInput, MuseJob, MusePromptKind, MuseQuota, MuseSettings } from './types'

type Deps = {
  accounts: MuseAccounts
  checkExit: typeof checkMuseExit
  checkSession: typeof checkMuseSession
  login: typeof loginMuse
  generate: typeof runMuseVideo
  readQuota: typeof readMuseQuota
  jobsPath: () => string
  jobsRoot: () => string
  probe: Parameters<typeof runMuseVideo>[0]['probe']
  generateOptions?: Parameters<typeof runMuseVideo>[0]['options']
  timing?: Parameters<typeof createMuseJobs>[0]['timing']
  makePoster: (videoPath: string, posterPath: string) => Promise<void>
  makeLastFrame: (firstFramePath: string, outputDir: string, zoomPercent: number) => Promise<string>
  renderSubtitles: MuseSubtitleRender
  promptsPath: () => string
  prepareImage: MusePrepareImage
  productName: (id: string) => Promise<string | null>
  /** Best picture first; may list files that are gone. */
  productImages: (id: string) => Promise<string[]>
  styleReference: (id: string) => Promise<{ firstFramePath: string; lastFramePath?: string; durationSec: number; aspectRatio: string; prompt: string; firstLastPrompt?: string } | null>
  imageTiming?: Parameters<typeof createMuseImages>[0]['timing']
}

const QUOTA_PAUSE_MS = 12 * 60 * 60_000

export function createMuseService({ accounts, checkExit, checkSession, login, generate, readQuota, jobsPath, jobsRoot, probe, generateOptions, timing, makePoster, makeLastFrame, renderSubtitles, promptsPath, prepareImage, productName, productImages, styleReference, imageTiming }: Deps) {
  const busy = new Set<string>()

  async function exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    if (busy.has(id)) throw new MuseAccountUnavailable('该账号正在使用中，请稍候')
    busy.add(id)
    try {
      return await work()
    } finally {
      busy.delete(id)
    }
  }

  async function orProxyError<T>(id: string, work: () => Promise<T>): Promise<T | MuseAccount> {
    try {
      return await work()
    } catch (error) {
      if (!(error instanceof MuseProxyError)) throw error
      return await accounts.setState(id, 'proxy_error', error.message)
    }
  }

  /** Runs before any Muse access. Returns the paused account, or null when the exit may be used. */
  const blockedByExit = (id: string): Promise<MuseAccount | null> => orProxyError(id, async () => {
    const { exit, pinnedIp } = await accounts.recordExit(id, await checkExit(await accounts.getProxy(id)))
    if (exit!.country !== 'US') return await accounts.setState(id, 'region_blocked', `代理出口在 ${exit!.country}，不是美国，已停止访问`)
    if (pinnedIp !== exit!.ip) return await accounts.setState(id, 'ip_changed', `出口 IP 由 ${pinnedIp} 变为 ${exit!.ip}，请确认后再用`)
    if (!exit!.museReachable) return await accounts.setState(id, 'region_blocked', `该出口打不开 muse.ai${exit!.museStatus ? `（${exit!.museStatus}）` : ''}`)
    return null
  })

  const verifySession = (id: string): Promise<MuseAccount> => orProxyError(id, async () => {
    const cookies = await accounts.getCookies(id)
    if (!cookies.length) return await accounts.setState(id, 'login_required')
    const result = await checkSession(await accounts.getProxy(id), cookies)
    if (result.cookies) await accounts.saveCookies(id, result.cookies)
    const { enabled } = await accounts.get(id)
    return await accounts.setState(id, result.state === 'ready' && !enabled ? 'disabled' : result.state, result.error)
  })

  const pausedUntil = (quota: MuseQuota) => (museQuotaUsedUp(quota) ? museResetAt(quota.weeklyReset) ?? Date.now() + QUOTA_PAUSE_MS : undefined)

  /** Muse said the quota is gone: the panel tells until when. Without a clear answer the short pause stays. */
  async function refineQuotaPause(id: string) {
    await exclusive(id, async () => {
      const { quota, cookies } = await readQuota(await accounts.getProxy(id), await accounts.getCookies(id))
      if (cookies) await accounts.saveCookies(id, cookies)
      const current = (await accounts.get(id)).quotaUntil
      // The panel disagreeing with the reply (a daily limit, say) does not lift the pause.
      await accounts.setQuota(id, quota, pausedUntil(quota) ?? current)
    })
  }
  const refining = new Set<Promise<void>>()

  /** Exit and session are checked again right before every run. */
  const listeners = new Set<(job: MuseJob) => void>()
  const jobs = createMuseJobs({
    onStatus: (job) => {
      for (const listener of listeners) {
        try { listener(job) } catch { // a listener must not break the queue
        }
      }
    },
    path: jobsPath,
    root: jobsRoot,
    makeLastFrame,
    timing,
    listAccounts: () => accounts.list(),
    accountBusy: (id) => busy.has(id),
    onQuota: async (id) => {
      await accounts.setQuotaUntil(id, Date.now() + QUOTA_PAUSE_MS)
      const work = refineQuotaPause(id).catch((error) => console.warn('[muse-creative] quota panel not read', error instanceof Error ? error.message : error))
      refining.add(work)
      void work.finally(() => { refining.delete(work); jobs.kick() })
    },
    recheck: async (id) => { await exclusive(id, async () => (await blockedByExit(id)) ?? (await verifySession(id))) },
    run: (id, context) => exclusive(id, async () => {
      if (!(await accounts.get(id)).enabled) throw new MuseAccountUnavailable('账号未启用')
      const checked = (await blockedByExit(id)) ?? (await verifySession(id))
      if (checked.state !== 'ready') throw new MuseAccountUnavailable(checked.lastError || '账号未就绪')
      return await generate({
        ...context,
        proxy: await accounts.getProxy(id),
        cookies: await accounts.getCookies(id),
        probe,
        onCookies: async (cookies) => { await accounts.saveCookies(id, cookies) },
        options: generateOptions,
      })
    }),
  })

  const results = createMuseResults({
    list: async () => (await jobs.list()).jobs,
    patch: (id, apply, log, level) => jobs.patch(id, apply, log, level),
    removeJob: (id) => jobs.remove(id),
    makePoster,
    renderSubtitles,
  })

  const prompts = createMusePrompts(promptsPath)
  const images = createMuseImages({
    queue: () => jobs.list(),
    get: (id) => jobs.get(id),
    patch: (id, apply, log, level) => jobs.patch(id, apply, log, level),
    root: jobsRoot,
    prepare: prepareImage,
    onQueued: () => jobs.kick(),
    timing: imageTiming,
  })

  async function named(id: string) {
    const name = await productName(id)
    if (name === null) throw new Error('商品不存在')
    return { productId: id, productName: name }
  }

  async function createJobs(input: MuseCreateInput) {
    const unique = (values: unknown) => Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean)))
    const manual = unique(input.detailImagePaths)
    const library = async (id: string) => {
      if (!input.useProductImages) return []
      if (!id) throw new Error('用商品库图片需要先选择商品')
      const paths = await productImages(id)
      if (!(await usableImages(paths, 1)).length) throw new Error(`商品「${(await named(id)).productName}」没有可用的图片`)
      return paths
    }
    const review = input.reviewImage !== false
    const imageVersion = await prompts.active('image')
    const image = { review, prompt: imageVersion.prompt, promptVersionId: imageVersion.id, promptVersion: imageVersion.version }
    if (input.styleReferenceId) {
      const reference = await styleReference(String(input.styleReferenceId))
      if (!reference) throw new Error('同款模板不存在，请重新上传参考视频')
      const productIds = unique(input.productIds)
      if (!productIds.length) throw new Error('请至少选择一个商品')
      const durationSec = [5, 6, 8, 10].reduce((best, value) => (Math.abs(value - reference.durationSec) < Math.abs(best - reference.durationSec) ? value : best))
      const lastFramePath = input.mode === 'first_last' ? reference.lastFramePath : undefined
      const created = await jobs.createBatch({
        entries: await Promise.all(productIds.map(async (id) => ({ imagePath: reference.firstFramePath, lastFramePath, ...(await named(id)), detailImagePaths: await (await detailImagePicker([], await library(id)))() }))),
        prompt: (lastFramePath && reference.firstLastPrompt) || reference.prompt,
        // Used when no closing frame can be made.
        zoomPercent: lastFramePath ? 20 : undefined,
        durationSec,
        aspect: reference.aspectRatio,
        accountId: input.accountId,
        styleReferenceId: String(input.styleReferenceId),
        image,
      })
      images.start()
      return created
    }
    const product = input.productId ? await named(String(input.productId)) : {}
    if (input.swapProduct && !input.productId) throw new Error('换图需要先选择商品')
    if ((await Promise.all(manual.map((path) => usableImages([path])))).some((found) => !found.length)) throw new Error('有商品细节图不存在或不支持，只支持 40 MB 以内的 JPG、PNG、WebP')
    if (manual.length > MAX_DETAIL_IMAGES) throw new Error(`商品细节图最多 ${MAX_DETAIL_IMAGES} 张`)
    const pickDetails = await detailImagePicker(manual, await library(String(input.productId || '')))
    const created = await jobs.createBatch({
      // A picture that gets its product swapped is sent in another form, so only unswapped ones count as already there.
      entries: await Promise.all(unique(input.imagePaths).map(async (imagePath) => ({ imagePath, ...product, detailImagePaths: await pickDetails(input.swapProduct ? undefined : imagePath) }))),
      prompt: input.prompt,
      durationSec: input.durationSec,
      aspect: input.aspect,
      accountId: input.accountId,
      image: input.swapProduct ? image : undefined,
      zoomPercent: input.mode === 'first_last' ? ([10, 20, 30, 40, 50].includes(Number(input.zoomPercent)) ? Number(input.zoomPercent) : 20) : undefined,
    })
    images.start()
    return created
  }

  return {
    async listJobs() {
      const queue = await jobs.list()
      void results.queuePosters(queue.jobs)
      return queue
    },
    getJob: (id: string) => jobs.get(id),
    onJobStatus(listener: (job: MuseJob) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    patchClone: (id: string, patch: Partial<NonNullable<MuseJob['clone']>>) => jobs.patch(id, (job) => (job.clone ? { clone: { ...job.clone, ...patch } } : {})),
    /** Storyboard frames already show the product, so they are used as they are. */
    async createFromClone(input: { projectId: string; productId: string; durationSec?: number; frames: Array<{ imagePath: string; shotId: string; autoReplace: boolean; baseline?: string }> }) {
      const product = await named(input.productId)
      const created = await jobs.createBatch({
        entries: input.frames.map((frame) => ({
          imagePath: frame.imagePath,
          ...product,
          clone: { projectId: input.projectId, shotId: frame.shotId, autoReplace: frame.autoReplace, baseline: frame.baseline, status: frame.autoReplace ? 'waiting' : undefined },
        })),
        prompt: (await prompts.active('video')).prompt,
        durationSec: input.durationSec ?? 5,
        aspect: '9:16',
      })
      return created
    },
    /** Opens the usage panel of the account; a failed read keeps the last known numbers. */
    queryQuota: (id: string) => exclusive(id, async () => {
      const checked = (await blockedByExit(id)) ?? (await verifySession(id))
      if (checked.state !== 'ready' && checked.state !== 'disabled') throw new Error(checked.lastError || '账号未就绪，请先登录')
      const read = await orProxyError(id, async () => {
        const { quota, cookies } = await readQuota(await accounts.getProxy(id), await accounts.getCookies(id))
        if (cookies) await accounts.saveCookies(id, cookies)
        return await accounts.setQuota(id, quota, pausedUntil(quota))
      })
      if (read.state === 'proxy_error') throw new Error(read.lastError || '代理异常')
      jobs.kick()
      return read
    }),
    addSubtitles: (input: MuseSubtitleInput) => results.addSubtitles(input),
    revertSubtitles: (ids: string[]) => results.revertSubtitles(ids),
    exportJobs: (input: { ids: string[]; outputDir: string }) => results.exportJobs(input),
    removeJobs: (ids: string[]) => results.removeMany(ids),
    createJobs,
    approveImages: (ids: string[]) => images.approve(Array.isArray(ids) ? ids : []),
    redoImage: (input: { id: string; region?: { x: number; y: number; width: number; height: number }; closing?: boolean }) => images.redo(input),
    saveSettings: (input: Partial<MuseSettings>) => jobs.saveSettings(input),
    listPrompts: (kind: MusePromptKind) => prompts.list(kind),
    updatePrompt: (input: { id: string; name?: string; prompt: string }) => prompts.update(input),
    copyPrompt: (input: { kind: MusePromptKind; name?: string; prompt: string }) => prompts.copy(input),
    activatePrompt: (id: string) => prompts.activate(id),
    rollbackPrompt: (id: string) => prompts.rollback(id),
    moveAccount: (input: { id: string; step: -1 | 1 }) => accounts.move(input.id, input.step),
    collectJob: (id: string) => jobs.collect(id),
    retryJob: async (id: string) => {
      await jobs.retry(id)
      images.start()
    },
    dismissJob: (id: string) => jobs.dismiss(id),
    cancelQueuedJobs: () => jobs.cancelQueued(),
    setQueuePaused: async (paused: boolean) => {
      await jobs.setPaused(paused)
      images.start()
    },
    setQueueConcurrency: (value: number) => jobs.setConcurrency(value),
    activeJobs: () => jobs.activeCount(),
    resumeJobs: async () => {
      const result = await jobs.resume()
      images.start()
      return result
    },
    cancelJob: (id: string) => jobs.cancel(id),
    stopJobs: async () => {
      images.stop()
      await jobs.stopAll()
      await Promise.all(refining)
    },
    async list() {
      return { encryptionAvailable: isRuntimeEncryptionAvailable(), accounts: await accounts.list() }
    },
    /** For the web and phone: no proxy, no exit address. */
    async listSummaries(): Promise<{ accounts: MuseAccountSummary[] }> {
      return {
        accounts: (await accounts.list()).map(({ id, name, enabled, priority, state, hasSession, quotaUntil, quota, lastError, updatedAt }) => ({
          id, name, enabled, priority, state, hasSession, quotaUntil, quota, updatedAt,
          lastError: lastError?.replace(/\d{1,3}(\.\d{1,3}){3}|[\da-f]{0,4}(:[\da-f]{0,4}){3,7}/gi, '***'),
        })),
      }
    },
    create: (input: { name: string; proxy: string }) => accounts.create(input),
    update: (input: { id: string; name?: string; proxy?: string }) => exclusive(input.id, () => accounts.update(input)),
    setEnabled: (input: { id: string; enabled: boolean }) => exclusive(input.id, () => accounts.setEnabled(input.id, Boolean(input.enabled))),
    acceptExit: (id: string) => exclusive(id, async () => {
      await accounts.acceptExit(id)
      return (await blockedByExit(id)) ?? (await verifySession(id))
    }),
    test: (id: string) => exclusive(id, async () => {
      await accounts.setQuotaUntil(id)
      return (await blockedByExit(id)) ?? (await verifySession(id))
    }),
    login: (id: string) => exclusive(id, async () => {
      const blocked = await blockedByExit(id)
      if (blocked) return blocked
      return await orProxyError(id, async () => {
        await accounts.saveCookies(id, await login(id, await accounts.getProxy(id), await accounts.getCookies(id)))
        return await verifySession(id)
      })
    }),
    importCookies: (input: { id: string; cookieJson: string }) => exclusive(input.id, async () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(String(input.cookieJson || ''))
      } catch {
        throw new Error('Cookie JSON 格式不正确')
      }
      await accounts.saveCookies(input.id, parsed)
      return (await blockedByExit(input.id)) ?? (await verifySession(input.id))
    }),
    cancelLogin: (id: string) => closeMuseBrowsers(id),
    async remove(id: string) {
      if (busy.has(id)) throw new Error('该账号正在使用中，请先取消')
      return await accounts.remove(id)
    },
  }
}

export const museCreativeStudioService = createMuseService({
  accounts: createMuseAccounts({
    path: () => join(getAppPaths().dbDir, 'muse-creative-studio-accounts.json'),
    vault: { encrypt: encryptRuntimeString, decrypt: decryptRuntimeString },
  }),
  checkExit: checkMuseExit,
  checkSession: checkMuseSession,
  login: loginMuse,
  generate: runMuseVideo,
  readQuota: readMuseQuota,
  jobsPath: () => join(getAppPaths().dbDir, 'muse-creative-studio-jobs.json'),
  jobsRoot: () => join(getAppPaths().dataDir, 'muse-creative-studio'),
  probe: probeMedia,
  // Loaded on first use: both pull in the whole video pipeline.
  makePoster: async (videoPath, posterPath) => await (await import('./subtitles')).makeMusePoster(videoPath, posterPath),
  makeLastFrame: async (firstFramePath, outputDir, zoomPercent) => (await (await import('../tiktok-creative-studio/imageAspect')).createTiktokZoomedLastFrame(firstFramePath, outputDir, zoomPercent)).path,
  renderSubtitles: async (input) => await (await import('./subtitles')).renderMuseSubtitles(input),
  promptsPath: () => join(getAppPaths().dbDir, 'muse-creative-studio-prompts.json'),
  prepareImage: async (input) => {
    const [{ prepareReferenceImageForExternalWorkflow }, { hashLivePhotoPrompt }] = await Promise.all([import('../live-photo/service'), import('../live-photo/promptVersions')])
    const { autoLocate, promptVersion, state, ...rest } = input
    return await prepareReferenceImageForExternalWorkflow({
      ...rest,
      state: state as Parameters<typeof prepareReferenceImageForExternalWorkflow>[0]['state'],
      promptVersion: { ...promptVersion, promptHash: hashLivePhotoPrompt(promptVersion.prompt) },
      // In the shared workflow this switch only turns automatic localisation on and off.
      qualityCheckerEnabled: autoLocate,
    })
  },
  productName: async (id) => {
    const { productsRepo } = await import('../products/repo')
    const product = (await productsRepo.list()).find((item) => item.id === id)
    return product ? String(product.name || '').trim() || '商品' : null
  },
  productImages: async (id) => {
    const { productsRepo } = await import('../products/repo')
    const product = (await productsRepo.list()).find((item) => item.id === id)
    if (!product) return []
    return [product.livePhotoReferenceImagePath, product.coverImagePath, ...(product.images ?? []).map((item) => item.filePath)].filter((path): path is string => Boolean(path))
  },
  styleReference: async (id) => {
    const { buildStyleReferenceMotionPrompt, styleReferenceService } = await import('../style-reference/service')
    const item = await styleReferenceService.get(id)
    return item ? { firstFramePath: item.firstFramePath, lastFramePath: item.lastFramePath, firstLastPrompt: buildStyleReferenceMotionPrompt({ ...item, hasLastFrame: true }), durationSec: item.durationSec, aspectRatio: item.aspectRatio, prompt: buildStyleReferenceMotionPrompt({ ...item, hasLastFrame: false }) } : null
  },
})
