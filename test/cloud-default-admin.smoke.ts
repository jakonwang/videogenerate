/**
 * 首次部署自动创建超级管理员：随机初始密码写入数据目录、登录后必须先改密码、改完文件删除、已有超管时不重复创建。
 * 运行：npm run test:cloud-default-admin
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCloudApp } from '../services/cloud/src/app'
import { CloudClientError, createCloudClient } from '../src/shared/cloud/client'

const dir = mkdtempSync(join(tmpdir(), 'vg-default-admin-'))
const keyPath = join(dir, 'ent.pem')
writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
let app: ReturnType<typeof createCloudApp>

async function main() {
  app = createCloudApp({ dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, isProduction: false })
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  let token = ''
  const client = createCloudClient({ getBaseUrl: () => base, getToken: () => token })

  // 没有超管 → 自动创建，随机密码写进数据目录
  const created = await app.service.ensureDefaultAdmin()
  assert.deepEqual(created, { account: 'admin@tiktokcut.local', generated: true })
  const file = join(dir, 'initial-admin-password.txt')
  const password = /密码：(\S+)/.exec(readFileSync(file, 'utf8'))![1]
  assert.ok(password.length >= 12, '随机密码足够长')
  assert.equal(await app.service.ensureDefaultAdmin(), null, '已有超管时不再创建')
  console.log('  ✓ 首次启动自动创建超级管理员，随机初始密码写到数据目录')

  // 登录后必须先改密码，后台接口被拒
  token = (await client.login({ account: 'admin@tiktokcut.local', password, client: 'admin' })).sessionToken
  assert.equal((await client.me()).user.mustChangePassword, true)
  try {
    await client.admin.stats()
    assert.fail('改密码前后台接口应被拒')
  } catch (error) {
    assert.ok(error instanceof CloudClientError)
    assert.equal(error.status, 403)
    assert.match(error.message, /修改初始密码/)
  }
  await assert.rejects(client.changePassword(password, password), /不能和原密码相同/)
  await client.changePassword(password, 'my-new-password-1')
  assert.equal((await client.me()).user.mustChangePassword, false)
  assert.ok((await client.admin.stats()).channels, '改密码后可以使用后台')
  assert.ok(!existsSync(file), '改密码后初始密码文件被删除')
  console.log('  ✓ 登录后必须先改密码，改完才能用后台，初始密码文件自动删除')

  // 指定了 CLOUD_ADMIN_PASSWORD 时用指定的密码，不写文件
  app.db.prepare("UPDATE users SET role = 'admin'").run()
  const custom = await app.service.ensureDefaultAdmin({ account: 'boss@example.com', password: 'chosen-password-1' })
  assert.deepEqual(custom, { account: 'boss@example.com', generated: false })
  assert.ok(!existsSync(file))
  token = (await client.login({ account: 'boss@example.com', password: 'chosen-password-1', client: 'admin' })).sessionToken
  assert.equal((await client.me()).user.mustChangePassword, true)
  console.log('  ✓ 用环境变量指定账号密码时同样要求首次登录改密码')

  console.log('\ncloud default admin smoke passed')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await app?.close()
    } catch {
      // ignore
    }
    rmSync(dir, { recursive: true, force: true })
  })
