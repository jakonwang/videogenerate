/**
 * 桌面端商业授权 E2E：真实 Electron + 临时云端服务。
 * 前置：先用商业模式构建  npx electron-vite build（build 默认即 enforced）
 * 运行：npm run test:cloud-license:e2e
 *
 * 覆盖：未登录被拦到登录页、业务 IPC / 本地 API 被拒、注册 → 无会员 → 扫码(模拟)支付 → 解锁、
 * 会员页、退出、超级管理员不受限、云端离线时凭签名令牌继续使用。
 */
const assert = require('node:assert/strict')
const { spawn, spawnSync } = require('node:child_process')
const { generateKeyPairSync } = require('node:crypto')
const { mkdir, mkdtemp, rm, writeFile, readFile } = require('node:fs/promises')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { _electron: electron } = require('playwright')

const TSX = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx')

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

async function waitForHealth(base) {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${base}/api/v1/health`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('cloud server did not start')
}

function startCloud(env) {
  const child = spawn(TSX, ['services/cloud/server.ts'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
  child.stdout.on('data', () => {})
  child.stderr.on('data', (chunk) => {
    const text = String(chunk)
    if (!/ExperimentalWarning|trace-warnings/.test(text)) process.stderr.write(`[cloud] ${text}`)
  })
  return child
}

function stopCloud(child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
  else child.kill('SIGTERM')
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vg-cloud-license-e2e-'))
  const cloudData = path.join(root, 'cloud')
  const userData = path.join(root, 'userData')
  await mkdir(cloudData, { recursive: true })
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privatePath = path.join(cloudData, 'ent.pem')
  await writeFile(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

  const port = await freePort()
  const base = `http://127.0.0.1:${port}`
  const cloudEnv = {
    ...process.env,
    CLOUD_DATA_DIR: cloudData,
    CLOUD_PORT: String(port),
    CLOUD_HOST: '127.0.0.1',
    CLOUD_PAY_MOCK: '1',
    CLOUD_ENTITLEMENT_PRIVATE_KEY: privatePath,
  }
  let cloud = startCloud(cloudEnv)
  await waitForHealth(base)

  const ownerPassword = `owner-${Date.now()}`
  const admin = spawnSync(TSX, ['services/cloud/scripts/create-admin.ts'], {
    cwd: process.cwd(),
    env: { ...cloudEnv, CLOUD_ADMIN_ACCOUNT: 'owner@e2e.test', CLOUD_ADMIN_PASSWORD: ownerPassword },
    shell: process.platform === 'win32',
    encoding: 'utf8',
  })
  assert.equal(admin.status, 0, admin.stderr)

  const adminLogin = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: 'owner@e2e.test', password: ownerPassword, client: 'admin' }),
  }).then((r) => r.json())
  const saveSoftware = (enabled) =>
    fetch(`${base}/api/v1/admin/software-settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminLogin.sessionToken}` },
      body: JSON.stringify({
        settings: {
          enabled,
          platforms: { ai666: { apiKey: 'sk-e2e-ai666-0000', baseUrl: 'https://ai666.e2e.test' } },
          tikhubApiKey: 'tikhub-e2e-1111',
          capabilities: { video: { platform: 'ai666', model: 'veo-e2e' }, image: { platform: 'vectorengine', model: '', quality: 'high' }, chat: { platform: 'vectorengine', model: '' } },
          qiniu: { accessKey: 'AK-E2E', secretKey: 'SK-E2E', bucket: 'e2e-bucket', domain: '', uploadHost: '', prefix: '' },
        },
      }),
    }).then((r) => r.json())
  assert.equal((await saveSoftware(true)).ok, true)

  const launch = () =>
    electron.launch({
      args: ['.'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        VIDEOGENERATE_USER_DATA_DIR: userData,
        VIDEOGENERATE_DATA_DIR: path.join(userData, '.videogenerate'),
        VG_CLOUD_API_BASE: base,
        VG_ENTITLEMENT_PUBLIC_KEY_PEM: publicPem,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
      timeout: 60_000,
    })

  let app = await launch()
  const artifacts = path.join(process.cwd(), 'test-artifacts')
  await mkdir(artifacts, { recursive: true })
  let page
  const step = async (name, fn) => {
    try {
      await fn()
      console.log(`  ✓ ${name}`)
    } catch (error) {
      if (page) {
        await page.screenshot({ path: path.join(artifacts, 'cloud-license-e2e-failure.png') }).catch(() => {})
        const debug = await page
          .evaluate(async () => ({ hash: window.location.hash, status: await window.api.cloud.getStatus(), orders: await window.api.cloud.listOrders(), me: await window.api.cloud.me(), refresh: await window.api.cloud.refresh() }))
          .catch((e) => String(e))
        console.error('debug:', JSON.stringify(debug))
      }
      throw new Error(`${name}: ${error.message}`)
    }
  }

  try {
    page = await app.firstWindow()
    if (process.env.E2E_DEBUG) {
      page.on('console', (msg) => console.log('[renderer]', msg.type(), msg.text().slice(0, 300)))
      app.process().stdout.on('data', (d) => { const t = String(d); if (/cloud|license|LICENSE/i.test(t)) console.log('[main]', t.trim().slice(0, 300)) })
      app.process().stderr.on('data', (d) => { const t = String(d); if (/cloud|license|LICENSE/i.test(t)) console.log('[main-err]', t.trim().slice(0, 300)) })
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 860))

    await step('未登录时被引导到登录页', async () => {
      await page.waitForSelector('[data-testid="cloud-login-form"]', { timeout: 60_000 })
      const status = await page.evaluate(() => window.api.cloud.getStatus())
      assert.equal(status.mode, 'enforced', '需要先用商业模式构建：npx electron-vite build')
      assert.equal(status.licensed, false)
      await page.evaluate(() => { window.location.hash = '#/clone' })
      await page.waitForTimeout(500)
      assert.ok((await page.evaluate(() => window.location.hash)).startsWith('#/login'))
    })

    await step('未授权时业务 IPC 与本地 API 被拒，白名单通道可用', async () => {
      const paths = await page.evaluate(() => window.api.getPaths())
      assert.ok(paths)
      const err = await page.evaluate(() => window.api.products.list().then(() => 'ok', (e) => String(e?.message || e)))
      assert.match(err, /LICENSE_REQUIRED/)
      const info = await page.evaluate(() => window.api.getWebApiInfo())
      if (info.baseUrl) {
        const status = await page.evaluate((url) => fetch(`${url}/health`).then((r) => r.status), info.baseUrl)
        assert.equal(status, 403)
      }
    })

    await step('注册 → 无会员 → 模拟扫码支付 → 自动解锁进入首页', async () => {
      await page.getByText(/没有账号|No account/).click()
      await page.fill('[data-testid="cloud-login-account"]', 'buyer@e2e.test')
      await page.fill('[data-testid="cloud-login-password"]', 'buyer-pass-123')
      await page.click('[data-testid="cloud-login-submit"]')
      await page.waitForSelector('[data-testid="cloud-plan-month"]', { timeout: 20_000 })
      await page.locator('[data-testid="cloud-plan-month"] button').click()
      await page.waitForSelector('[data-testid="cloud-mock-pay"]', { timeout: 20_000 })
      await page.screenshot({ path: path.join(artifacts, 'cloud-license-e2e-qr.png') })
      await page.click('[data-testid="cloud-mock-pay"]')
      // 之前访问过 #/clone，登录后应回到原来要去的页面
      await page.waitForFunction(() => window.location.hash.startsWith('#/clone'), null, { timeout: 20_000 })
      const status = await page.evaluate(() => window.api.cloud.getStatus())
      assert.equal(status.licensed, true)
      assert.equal(status.planName, '月度会员')
      const list = await page.evaluate(() => window.api.products.list().then(() => 'ok', (e) => String(e?.message || e)))
      assert.equal(list, 'ok')
    })

    await step('后台下发的软件设置自动应用，渲染进程只看到掩码，设置页只读', async () => {
      const status = await page.evaluate(() => window.api.cloud.getStatus())
      assert.equal(status.managedSettings, true)
      const creds = await page.evaluate(() => window.api.clone.getModelCredentials())
      assert.equal(creds.videoApifoxHubProfile, 'ai666')
      assert.equal(creds.ai666Hub.baseUrl, 'https://ai666.e2e.test')
      assert.equal(creds.ai666Hub.startEndVideoModel, 'veo-e2e')
      assert.equal(creds.ai666Hub.apiKey, '••••0000')
      assert.equal(creds.qiniuBucket, 'e2e-bucket')
      assert.ok(!JSON.stringify(creds).includes('sk-e2e-ai666'), '渲染进程不应拿到明文 Key')
      // 用户尝试保存别的值：后台字段仍以后台为准
      await page.evaluate((c) => window.api.clone.setModelCredentials({ ...c, ai666Hub: { ...c.ai666Hub, baseUrl: 'https://evil.test' } }), creds)
      const after = await page.evaluate(() => window.api.clone.getModelCredentials())
      assert.equal(after.ai666Hub.baseUrl, 'https://ai666.e2e.test')
      await page.evaluate(() => { window.location.hash = '#/settings' })
      await page.locator('[data-settings-section="platforms"]').click()
      await page.waitForSelector('[data-testid="settings-managed-notice"]', { timeout: 15_000 })
      await page.screenshot({ path: path.join(artifacts, 'cloud-license-e2e-settings-managed.png') })
    })

    await step('后台公告、最低版本、功能开关下发到客户端', async () => {
      const setConfig = (key, value) =>
        fetch(`${base}/api/v1/admin/config/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminLogin.sessionToken}` },
          body: JSON.stringify({ value }),
        }).then((r) => r.json())
      await setConfig('client.announcement', 'E2E 公告：双十一 8 折')
      await setConfig('client.minVersion', '99.0.0')
      await setConfig('client.featureFlags', { clone: false })
      const status = await page.evaluate(() => window.api.cloud.refresh())
      assert.equal(status.announcement, 'E2E 公告：双十一 8 折')
      assert.equal(status.updateRequired, true)
      assert.deepEqual(status.disabledFeatures, ['clone'])
      await page.evaluate(() => { window.location.hash = '#/home' })
      await page.waitForSelector('[data-testid="app-announcement"]', { timeout: 15_000 })
      await page.waitForSelector('[data-testid="app-update-required"]')
      await page.screenshot({ path: path.join(artifacts, 'cloud-license-e2e-banners.png') })
      await page.evaluate(() => { window.location.hash = '#/clone' })
      await page.waitForFunction(() => window.location.hash.startsWith('#/billing'), null, { timeout: 15_000 })
      await setConfig('client.announcement', '')
      await setConfig('client.minVersion', '')
      await setConfig('client.featureFlags', {})
      const after = await page.evaluate(() => window.api.cloud.refresh())
      assert.equal(after.updateRequired, false)
      assert.deepEqual(after.disabledFeatures, [])
    })

    await step('会员页展示套餐与本机设备，退出后回到登录页', async () => {
      await page.evaluate(() => { window.location.hash = '#/billing' })
      await page.waitForSelector('[data-testid="membership-page"]')
      await page.waitForFunction(() => document.querySelector('[data-testid="membership-plan"]')?.textContent?.includes('月度会员'))
      await page.screenshot({ path: path.join(artifacts, 'cloud-license-e2e-membership.png') })
      page.once('dialog', (d) => d.accept())
      await page.click('[data-testid="membership-logout"]')
      await page.waitForSelector('[data-testid="cloud-login-form"]', { timeout: 20_000 })
    })

    await step('退出登录后本机下发的密钥被清除', async () => {
      // 后台关闭下发，再用另一个账号登录，检查本地凭据里不再有上一个账号带来的密钥
      assert.equal((await saveSoftware(false)).ok, true)
    })

    await step('超级管理员登录：不受限', async () => {
      await page.fill('[data-testid="cloud-login-account"]', 'owner@e2e.test')
      await page.fill('[data-testid="cloud-login-password"]', ownerPassword)
      await page.click('[data-testid="cloud-login-submit"]')
      await page.waitForFunction(() => window.location.hash.startsWith('#/home'), null, { timeout: 20_000 })
      const status = await page.evaluate(() => window.api.cloud.getStatus())
      assert.equal(status.unlimited, true)
      assert.ok(status.features.includes('*'))
      assert.equal(status.role, 'super_admin')
      assert.equal(status.managedSettings, false)
      const creds = await page.evaluate(() => window.api.clone.getModelCredentials())
      assert.equal(creds.ai666Hub?.apiKey || '', '', '退出时应清除下发的 Key')
      assert.equal(creds.tikhubApiKey || '', '')
      assert.equal(creds.qiniuAccessKey || '', '')
    })

    await step('登录态加密保存，不含明文密码', async () => {
      const raw = await readFile(path.join(userData, 'cloud-session.dat'), 'utf8')
      assert.ok(!raw.includes(ownerPassword))
      assert.ok(!raw.includes('owner@e2e.test') || raw.startsWith('plain:'), '应使用系统加密存储')
    })

    await step('云端离线时重启应用，凭签名令牌继续可用', async () => {
      await app.close()
      stopCloud(cloud)
      cloud = null
      app = await launch()
      page = await app.firstWindow()
      await page.waitForFunction(() => window.location.hash.startsWith('#/home'), null, { timeout: 60_000 })
      const status = await page.evaluate(() => window.api.cloud.refresh())
      assert.equal(status.licensed, true)
      assert.equal(status.offline, true)
    })
  } finally {
    await app.close().catch(() => {})
    stopCloud(cloud)
    await rm(root, { recursive: true, force: true }).catch(() => {})
  }
  console.log('\ncloud license e2e passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
