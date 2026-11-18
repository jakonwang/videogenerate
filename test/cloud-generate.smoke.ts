/**
 * 云端生成任务冒烟测试：真实 HTTP 服务 + 假平台（不产生真实调用和费用）。
 * 覆盖：未配置、图片任务（参考图落盘、结果存进云端文件）、视频任务（签名参考图链接可被平台下载、篡改被拒）、
 * GRS.AI 路线、他人图片、失败任务、额度计数。
 * 运行：npx tsx test/cloud-generate.smoke.ts
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { createCloudApp } from '../services/cloud/src/app'
import { MANAGED_SETTINGS_KEY } from '../services/cloud/src/service'
import { createCloudClient, CloudClientError } from '../src/shared/cloud/client'
import { createDefaultManagedSettings } from '../src/shared/cloud/managedSettings'

const PNG = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64'), Buffer.from([7])])
const MP4 = Buffer.from('0000001866747970', 'hex')

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'vg-cloud-gen-'))
  const keyPath = join(dir, 'ent.pem')
  writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())

  const seen: Record<string, any> = {}
  let videoShouldFail = false
  const app = createCloudApp(
    { dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, aiPerDay: 50, publicBaseUrl: '' },
    {
      generationProviders: {
        generateImage: async (input) => {
          seen.image = { prompt: input.prompt, capability: input.capability, refs: input.imagePaths?.map((p) => readFileSync(p)), platform: input.credentials.imageApifoxHubProfile }
          const outputPath = join(input.outDir, 'result.png')
          writeFileSync(outputPath, Buffer.concat([PNG, Buffer.from('generated')]))
          return { outputPath } as any
        },
        generateVideo: async (input) => {
          seen.video = { image: input.image, durationSec: input.durationSec, aspectRatio: input.aspectRatio }
          if (videoShouldFail) throw new Error('provider exploded')
          const outputPath = join(input.outDir, 'result.mp4')
          writeFileSync(outputPath, MP4)
          return { outputPath } as any
        },
        createGrsImageTask: async (input) => {
          seen.grs = { urls: input.urls, model: input.credentials.grsaiImageModel }
          return { taskId: 'grs-1', directUrl: '', model: 'x', raw: {} }
        },
        waitGrsResult: async () => ({ outputUrl: 'https://grs.example.com/out/abc.png', task: {} }),
        download: async (url) => {
          seen.download = url
          return Buffer.concat([PNG, Buffer.from('grs')])
        },
      },
    },
  )
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  const expectError = async (promise: Promise<unknown>, status: number) => {
    try {
      await promise
      assert.fail(`expected HTTP ${status}`)
    } catch (error) {
      assert.ok(error instanceof CloudClientError, String(error))
      assert.equal(error.status, status, error.message)
    }
  }
  const saveSettings = (mutate: (s: ReturnType<typeof createDefaultManagedSettings>) => void) => {
    const settings = createDefaultManagedSettings()
    settings.enabled = true
    mutate(settings)
    app.repo.upsertConfig({ key: MANAGED_SETTINGS_KEY, value: settings, scope: 'private', description: '', updatedBy: null, now: Date.now() })
  }
  const waitJob = async (client: ReturnType<typeof createCloudClient>, id: string) => {
    await app.generation.idle()
    return (await client.ai.getJob(id)).job
  }

  try {
    const makeUser = async (name: string) => {
      let token = ''
      const client = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
      await client.register({ account: `${name}@example.com`, password: 'password-123' })
      token = (await client.login({ account: `${name}@example.com`, password: 'password-123', client: 'mobile', machineId: name })).sessionToken
      const plans = await client.listPlans()
      const order = await client.createOrder({ planCode: plans.plans[0].code, channel: 'mock' })
      await client.mockPay(order.order.orderNo)
      return client
    }
    const alice = await makeUser('alice')
    const bob = await makeUser('bob')
    const photo = await alice.sync.uploadFile(PNG, 'image/png')

    // not configured
    await expectError(alice.ai.createJob({ kind: 'image', prompt: 'scene', imageFileIds: [photo.fileId] }), 503)

    // ---- image via VectorEngine (OpenAI images edit with the product photo as reference)
    saveSettings((s) => {
      s.platforms.vectorengine = { apiKey: 'sk-ve', baseUrl: 'https://ve.example.com' }
      s.capabilities.image = { platform: 'vectorengine', model: 'gpt-image-1', quality: 'high' }
      s.capabilities.video = { platform: 'vectorengine', model: 'veo_3_1-fast' }
    })
    const created = (await alice.ai.createJob({ kind: 'image', prompt: '白色大理石台面上的耳环', imageFileIds: [photo.fileId], purpose: 'product-image' })).job
    assert.ok(['queued', 'running'].includes(created.status))
    let job = await waitJob(alice, created.id)
    assert.equal(job.status, 'succeeded', job.error)
    assert.equal(job.outputMime, 'image/png')
    assert.equal(seen.image.capability, 'image_edit')
    assert.equal(seen.image.platform, 'vectorengine')
    assert.deepEqual(seen.image.refs[0], PNG, 'reference written to disk for the provider')
    const output = Buffer.from(await (await alice.sync.downloadFile(job.outputFileId!)).arrayBuffer())
    assert.ok(output.toString().endsWith('generated'), 'result stored in the account files')
    await expectError(bob.sync.downloadFile(job.outputFileId!), 404)

    // other users cannot read jobs or use someone else's images
    await expectError(bob.ai.getJob(created.id), 404)
    await expectError(bob.ai.createJob({ kind: 'image', prompt: 'x', imageFileIds: [photo.fileId] }), 404)

    // ---- video without qiniu or a public address: the job fails with a clear reason
    const v1 = (await alice.ai.createJob({ kind: 'video', prompt: '耳环缓慢旋转', imageFileIds: [photo.fileId], durationSec: 6 })).job
    job = await waitJob(alice, v1.id)
    assert.equal(job.status, 'failed')
    assert.match(job.error!, /七牛|对外地址/)
    await expectError(alice.ai.createJob({ kind: 'video', prompt: 'no image' }), 400)

    console.log('cloud generate smoke (part 1): ok')
  } finally {
    app.server.close()
    app.db.close()
  }

  // ---- second instance with a public address: signed links, video + GRS.AI routes
  const app2 = createCloudApp(
    { dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, aiPerDay: 50, publicBaseUrl: 'PLACEHOLDER' },
    {
      generationProviders: {
        generateVideo: async (input) => {
          seen.video = { image: input.image, durationSec: input.durationSec, aspectRatio: input.aspectRatio }
          if (videoShouldFail) throw new Error('provider exploded')
          const outputPath = join(input.outDir, 'result.mp4')
          writeFileSync(outputPath, MP4)
          return { outputPath } as any
        },
        createGrsImageTask: async (input) => {
          seen.grs = { urls: input.urls }
          return { taskId: 'grs-1', directUrl: '', model: 'x', raw: {} }
        },
        waitGrsResult: async () => ({ outputUrl: 'https://grs.example.com/out/abc.png', task: {} }),
        download: async () => Buffer.concat([PNG, Buffer.from('grs')]),
      },
    },
  )
  await new Promise<void>((resolve) => app2.server.listen(0, '127.0.0.1', resolve))
  const base2 = `http://127.0.0.1:${(app2.server.address() as AddressInfo).port}`
  // The public address is only known after listen; patch it into the config the service reads.
  ;(app2.config as any).publicBaseUrl = base2
  try {
    let token = ''
    const alice = createCloudClient({ getBaseUrl: () => base2, getToken: () => token })
    token = (await alice.login({ account: 'alice@example.com', password: 'password-123', client: 'mobile', machineId: 'alice' })).sessionToken
    const photo = await alice.sync.uploadFile(PNG, 'image/png')
    const wait = async (id: string) => {
      await app2.generation.idle()
      return (await alice.ai.getJob(id)).job
    }

    // ---- video: the provider gets a signed link it can download without logging in
    const v = (await alice.ai.createJob({ kind: 'video', prompt: '耳环缓慢旋转', imageFileIds: [photo.fileId], durationSec: 6 })).job
    let job = await wait(v.id)
    assert.equal(job.status, 'succeeded', job.error)
    assert.equal(job.outputMime, 'video/mp4')
    assert.equal(seen.video.durationSec, 6)
    assert.equal(seen.video.aspectRatio, '9:16')
    const link = String(seen.video.image)
    assert.ok(link.startsWith(`${base2}/api/v1/public-files/${photo.fileId}?`), link)
    const fetched = await fetch(link)
    assert.equal(fetched.status, 200)
    assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), PNG)
    assert.equal((await fetch(link.replace(/s=[0-9a-f]{4}/, 's=0000'))).status, 403, 'tampered signature rejected')
    assert.equal((await fetch(link.replace(/e=\d+/, 'e=1'))).status, 403, 'expired link rejected')

    // ---- 上架导出：图片的对外链接，签名链接按天数有效（最长 30 天）
    const exported = await alice.ai.publicUrls([photo.fileId], 90)
    assert.equal(exported.days, 30, 'capped at 30 days')
    const exportLink = exported.urls[photo.fileId]!
    assert.ok(exportLink.startsWith(`${base2}/api/v1/public-files/${photo.fileId}?`), exportLink)
    const expires = Number(new URL(exportLink).searchParams.get('e'))
    assert.ok(expires > Date.now() + 29 * 86_400_000, 'long-lived export link')
    assert.equal((await fetch(exportLink)).status, 200)
    await assert.rejects(alice.ai.publicUrls(['file_not_mine']), 'other files are refused')
    // ---- signed relative links for showing one's own media on the web (no auth header needed)
    const { links } = await alice.ai.fileLinks([photo.fileId, 'file_not_mine'])
    assert.deepEqual(Object.keys(links), [photo.fileId], 'only own files get a link')
    assert.ok(links[photo.fileId]!.startsWith(`/api/v1/public-files/${photo.fileId}?`) && links[photo.fileId]!.endsWith('&t=.png'), links[photo.fileId])
    assert.deepEqual(Buffer.from(await (await fetch(`${base2}${links[photo.fileId]}`)).arrayBuffer()), PNG)

    // ---- provider failure → job failed with a readable reason, counted as a failure
    videoShouldFail = true
    job = await wait((await alice.ai.createJob({ kind: 'video', prompt: 'again', imageFileIds: [photo.fileId] })).job.id)
    assert.equal(job.status, 'failed')
    assert.match(job.error!, /provider exploded/)
    videoShouldFail = false

    // ---- image via GRS.AI: signed links as references, result downloaded and stored
    app2.repo.upsertConfig({
      key: MANAGED_SETTINGS_KEY,
      value: (() => {
        const s = createDefaultManagedSettings()
        s.enabled = true
        s.platforms.grsai = { apiKey: 'sk-grs', baseUrl: '' }
        s.capabilities.image = { platform: 'grsai', model: 'gpt-image-2', quality: 'high' }
        return s
      })(),
      scope: 'private',
      description: '',
      updatedBy: null,
      now: Date.now(),
    })
    job = await wait((await alice.ai.createJob({ kind: 'image', prompt: 'scene', imageFileIds: [photo.fileId] })).job.id)
    assert.equal(job.status, 'succeeded', job.error)
    assert.ok(String(seen.grs.urls[0]).includes('/api/v1/public-files/'))
    assert.ok(Buffer.from(await (await alice.sync.downloadFile(job.outputFileId!)).arrayBuffer()).toString().endsWith('grs'))

    // listing several jobs at once
    assert.equal((await alice.ai.listJobs([v.id, job.id, 'job_missing'])).jobs.length, 2)
    const rows = app2.db.prepare("SELECT purpose, calls, failures FROM ai_usage WHERE purpose IN ('video','image','product-image') ORDER BY purpose").all() as any[]
    assert.ok(rows.find((r) => r.purpose === 'video' && r.failures >= 1), 'failed jobs are counted')

    console.log('cloud generate smoke (part 2): ok')
  } finally {
    app2.server.close()
    app2.db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
