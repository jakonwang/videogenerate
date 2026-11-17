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
    fontsDir: config.fontsDir,
    providers: options.generationProviders,
  })
  const handler = createCloudHttpHandler(config, service, sync, ai, generation)
  const server = http.createServer((req, res) => void handler(req, res))

  return {
    config,
    db,
    repo,
    service,
    server,
    generation,
    listen: () =>
      new Promise<number>((resolve, reject) => {
        server.once('error', reject)
        server.listen(config.port, config.host, () => {
          const address = server.address()
          resolve(typeof address === 'object' && address ? address.port : config.port)
        })
      }),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          db.close()
          resolve()
        })
      }),
  }
}
