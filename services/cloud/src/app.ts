import http from 'node:http'
import { loadCloudConfig, readKeyFile, type CloudConfig } from './config'
import { openCloudDb } from './db'
import { createCloudHttpHandler } from './http'
import { createRepo } from './repo'
import { createCloudService } from './service'
import { createSyncService } from './sync'
import { createAiService } from './ai'
import { createGenerationService, type GenerationProviders } from './generate'
import { createHash } from 'node:crypto'
import { createCloneEngine } from './cloneEngine'
import { createRelay } from './relay'
import { applyManagedSettings } from '../../../src/shared/cloud/managedSettings'
import { normalizeCredentials } from '../../../src/main/modules/clone/credentials'

/** 组装云端服务（供 server.ts 与测试复用） */
export function createCloudApp(overrides: Partial<CloudConfig> = {}, options: { now?: () => number; fetchImpl?: typeof fetch; generationProviders?: Partial<GenerationProviders> } = {}) {
  const config = { ...loadCloudConfig(), ...overrides }
  if (config.isProduction && config.mockPay) {
    throw new Error('生产环境禁止开启 CLOUD_PAY_MOCK')
  }
  const privateKey = readKeyFile(config.entitlementPrivateKeyPath)
  if (!privateKey) {
    throw new Error(`缺少授权签名私钥：${config.entitlementPrivateKeyPath}\n请先运行：npm run cloud:keygen`)
  }
  const db = openCloudDb(config.dbPath)
  const repo = createRepo(db)
  const service = createCloudService({ config, db, repo, entitlementPrivateKey: privateKey, now: options.now })
  service.ensureSeed()
  const sync = createSyncService({ db, dataDir: config.dataDir, quotaBytes: config.syncQuotaBytes, now: options.now ?? Date.now })
  const ai = createAiService({
    db,
    now: options.now ?? Date.now,
    readManagedSettings: service.readManagedSettings,
    readFile: (userId, fileId) => sync.readFile(userId, fileId),
    perMinute: config.aiPerMinute,
    perDay: config.aiPerDay,
    cloneEnginePerDay: config.cloneEnginePerDay,
    fetchImpl: options.fetchImpl,
  })
  const generation = createGenerationService({
    db,
    now: options.now ?? Date.now,
    readManagedSettings: service.readManagedSettings,
    files: { read: (userId, fileId) => sync.readFile(userId, fileId), store: (userId, body, mime) => sync.uploadFile(userId, body, mime) },
    quota: ai.quota,
    publicBaseUrl: () => config.publicBaseUrl,
    // Signing key for reference-image links, derived from the private key so it needs no extra setup.
    linkSecret: createHash('sha256').update(`public-files:${privateKey}`).digest('hex'),
    concurrency: config.aiJobConcurrency,
    ffmpegConcurrency: config.ffmpegConcurrency,
    ffmpegPerDay: config.ffmpegPerDay,
    fontsDir: config.fontsDir,
    providers: options.generationProviders,
  })
  let listenPort = config.port
  const cloneEngine = createCloneEngine({
    dataDir: config.dataDir,
    baseUrl: () => `http://127.0.0.1:${listenPort}`,
    issueToken: (userId) => service.issueEngineSession(userId),
    revokeToken: (token) => service.revokeSessionToken(token),
    credentials: () => {
      const settings = service.readManagedSettings()
      return normalizeCredentials({ ...applyManagedSettings({}, settings), allowMockWhenNoKey: config.cloneEngineAllowMock && !config.isProduction, openaiImageQuality: settings.capabilities.image.quality })
    },
    meter: (userId) => ai.cloneEngine.meter(userId),
    maxWorkers: Math.max(1, config.cloneEngineMaxWorkers),
    idleMs: Math.max(1, config.cloneEngineIdleMinutes) * 60_000,
  })
  const handler = createCloudHttpHandler(config, service, sync, ai, generation, createRelay(), cloneEngine)
  const server = http.createServer((req, res) => void handler(req, res))

  // Storage housekeeping: files no record points to are removed after CLOUD_ORPHAN_FILE_DAYS.
  let cleanupTimer: NodeJS.Timeout | null = null
  function runCleanup() {
    if (!config.orphanFileDays) return
    try {
      const result = sync.cleanupOrphans(config.orphanFileDays * 24 * 60 * 60 * 1000)
      if (result.removed) console.log(`[videogen-cloud] 清理未引用文件 ${result.removed} 个，释放 ${(result.bytes / 1024 / 1024).toFixed(1)} MB`)
    } catch (error) {
      console.warn('[videogen-cloud] 文件清理失败', error)
    }
  }

  return {
    config,
    db,
    repo,
    service,
    server,
    generation,
    sync,
    cloneEngine,
    listen: () =>
      new Promise<number>((resolve, reject) => {
        server.once('error', reject)
        server.listen(config.port, config.host, () => {
          if (config.orphanFileDays && !cleanupTimer) {
            cleanupTimer = setInterval(runCleanup, 6 * 60 * 60 * 1000)
            cleanupTimer.unref()
            setTimeout(runCleanup, 60 * 60 * 1000).unref()
          }
          const address = server.address()
          listenPort = typeof address === 'object' && address ? address.port : config.port
          resolve(listenPort)
        })
      }),
    close: () =>
      new Promise<void>((resolve) => {
        if (cleanupTimer) clearInterval(cleanupTimer)
        cleanupTimer = null
        cloneEngine.close()
        server.close(() => {
          db.close()
          resolve()
        })
      }),
  }
}
