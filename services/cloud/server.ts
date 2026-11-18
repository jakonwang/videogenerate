import { createCloudApp } from './src/app'

async function main() {
  const app = createCloudApp()
  // 首次部署没有超级管理员时自动创建（账号 / 密码可用 CLOUD_ADMIN_ACCOUNT / CLOUD_ADMIN_PASSWORD 指定）
  await app.service.ensureDefaultAdmin({ account: process.env.CLOUD_ADMIN_ACCOUNT, password: process.env.CLOUD_ADMIN_PASSWORD })
  const port = await app.listen()
  console.log(`[videogen-cloud] listening on http://${app.config.host}:${port}`)
  console.log(`[videogen-cloud] data dir: ${app.config.dataDir}`)
  console.log(`[videogen-cloud] pay channels: ${app.service.availableChannels().join(', ') || '(none configured)'}`)
  if (app.config.mockPay) console.warn('[videogen-cloud] 模拟支付已开启（CLOUD_PAY_MOCK=1），仅限本地联调！')
  const shutdown = () => void app.close().then(() => process.exit(0))
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  console.error('[videogen-cloud] 启动失败:', error?.message ?? error)
  process.exitCode = 1
})
