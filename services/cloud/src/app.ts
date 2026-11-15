import http from 'node:http'
import { loadCloudConfig, readKeyFile, type CloudConfig } from './config'
import { openCloudDb } from './db'
import { createCloudHttpHandler } from './http'
import { createRepo } from './repo'
import { createCloudService } from './service'

/** 组装云端服务（供 server.ts 与测试复用） */
export function createCloudApp(overrides: Partial<CloudConfig> = {}, options: { now?: () => number } = {}) {
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
  const handler = createCloudHttpHandler(config, service)
  const server = http.createServer((req, res) => void handler(req, res))

  return {
    config,
    db,
    repo,
    service,
    server,
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
