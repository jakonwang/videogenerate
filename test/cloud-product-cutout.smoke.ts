/**
 * 图生视频「贴真实商品」的云端抠图接口：真实 HTTP 云端 + 假的腾讯云抠图。
 * 走客户端 client.productCutout（和桌面端、网页引擎一样），确认 JSON 能解析、要登录、没配置时报清楚的错。
 * 运行：npx tsx test/cloud-product-cutout.smoke.ts
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { createCloudApp } from '../services/cloud/src/app'
import { createCloudClient } from '../src/shared/cloud/client'

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'vg-product-cutout-'))
  const keyPath = join(dir, 'ent.pem')
  writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  let available = true
  let received = 0
  const matting = {
    available: () => available,
    run: async (input: string, output: string) => {
      const meta = await sharp(input).metadata()
      received = meta.width || 0
      await sharp({ create: { width: meta.width!, height: meta.height!, channels: 3, background: '#ffffff' } }).png().toFile(output)
    },
  }
  const app = createCloudApp({ dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, publicBaseUrl: '' } as any, { matting } as any)
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  try {
    // 没登录：401
    const anon = createCloudClient({ getBaseUrl: () => base, getToken: () => '' })
    await assert.rejects(anon.productCutout({ image: 'x' }), (error: any) => error.status === 401)

    let token = ''
    const client = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
    await client.register({ account: 'cutout@example.com', password: 'password-123' })
    token = (await client.login({ account: 'cutout@example.com', password: 'password-123', client: 'mobile', machineId: 'm1' })).sessionToken

    // 正常：几 MB 以内的图走大请求体路由，JSON 要能解析出来
    const photo = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#e0e0e0' } }).jpeg().toBuffer()
    const result = await client.productCutout({ image: photo.toString('base64') })
    assert.equal(received, 1200, 'server received the image')
    const mask = await sharp(Buffer.from(result.mask, 'base64')).metadata()
    assert.equal(mask.width, 1200)

    // 空图：清楚的错误
    await assert.rejects(client.productCutout({ image: '' }), /缺少商品图/)
    // 后台没配置抠图
    available = false
    await assert.rejects(client.productCutout({ image: photo.toString('base64') }), /没有配置腾讯云抠图/)
    console.log('cloud product cutout smoke test passed')
  } finally {
    await new Promise<void>((resolve) => app.server.close(() => resolve()))
    ;(app as any).close?.()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // Windows 上数据库文件可能还被占用，临时目录留给系统清理
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
