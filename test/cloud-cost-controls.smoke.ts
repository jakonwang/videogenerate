/**
 * Cloud cost controls (web plan W3): ffmpeg jobs run in their own lane (1 at a time by default, never
 * blocking AI jobs), report their queue position, are capped per user per 24 h, and files nothing
 * references any more are cleaned up after the retention window.
 */
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { createCloudApp } from '../services/cloud/src/app'
import { createCloudClient, CloudClientError } from '../src/shared/cloud/client'

const MP4 = Buffer.from('0000001866747970', 'hex')

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'vg-cloud-cost-'))
  const keyPath = join(dir, 'ent.pem')
  writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  const app = createCloudApp(
    { dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, aiPerDay: 50, publicBaseUrl: '', ffmpegConcurrency: 1, ffmpegPerDay: 3, orphanFileDays: 7 },
    {
      generationProviders: {
        // Hold every compose so we can look at the queue while jobs are in flight.
        clone: { probeDuration: async () => 3, ffmpeg: async () => { await gate; throw new Error('ffmpeg stub') } } as any,
      },
    },
  )
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  let token = ''
  const client = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
  try {
    await client.register({ account: 'cost@example.com', password: 'password-123' })
    token = (await client.login({ account: 'cost@example.com', password: 'password-123', client: 'web' })).sessionToken
    const plans = await client.listPlans()
    await client.mockPay((await client.createOrder({ planCode: plans.plans[0].code, channel: 'mock' })).order.orderNo)
    const userId = (await client.me()).user.id

    // ---- ffmpeg lane: one runs, the rest wait in line with their position
    const clip = await client.sync.uploadFile(MP4, 'video/mp4')
    const compose = () => client.ai.createJob({ kind: 'compose', clips: [{ fileId: clip.fileId, durationSec: 3 }] })
    const first = (await compose()).job
    const second = (await compose()).job
    const third = (await compose()).job
    assert.equal((await client.ai.getJob(first.id)).job.status, 'running')
    const secondNow = (await client.ai.getJob(second.id)).job
    const thirdNow = (await client.ai.getJob(third.id)).job
    assert.equal(secondNow.status, 'queued')
    assert.equal(secondNow.queuePosition, 1)
    assert.equal(thirdNow.queuePosition, 2)

    // ---- daily cap on server video processing
    try {
      await compose()
      assert.fail('expected the 24 h cap')
    } catch (error) {
      assert.ok(error instanceof CloudClientError, String(error))
      assert.equal(error.status, 429)
      assert.match(error.message, /24 小时内最多 3 次/)
    }
    release()
    await app.generation.idle()

    // ---- orphan cleanup: only old files no record or recent job refers to
    const kept = await client.sync.uploadFile(Buffer.concat([MP4, Buffer.from('kept')]), 'video/mp4')
    const orphan = await client.sync.uploadFile(Buffer.concat([MP4, Buffer.from('orphan')]), 'video/mp4')
    const fresh = await client.sync.uploadFile(Buffer.concat([MP4, Buffer.from('fresh')]), 'video/mp4')
    await client.sync.push([{ collection: 'assets', id: 'asset_1', updatedAt: Date.now(), deleted: false, data: { name: 'kept', kind: 'video', fileId: kept.fileId, mime: 'video/mp4', size: 10, createdAt: Date.now() } }])
    const old = Date.now() - 10 * 24 * 60 * 60 * 1000
    app.db.prepare('UPDATE sync_files SET created_at = ? WHERE id IN (?, ?, ?)').run(old, kept.fileId, orphan.fileId, clip.fileId)
    // The compose jobs used `clip` but are older than the window now too.
    app.db.prepare('UPDATE ai_jobs SET updated_at = ?').run(old)
    const result = app.sync.cleanupOrphans(7 * 24 * 60 * 60 * 1000)
    assert.equal(result.removed, 2, 'orphan + the old clip whose jobs are past the window')
    const userFiles = readdirSync(join(dir, 'files')).flatMap((sub) => readdirSync(join(dir, 'files', sub)))
    assert.ok(userFiles.includes(kept.fileId), 'referenced by a 素材库 record')
    assert.ok(userFiles.includes(fresh.fileId), 'newer than the window')
    assert.ok(!userFiles.includes(orphan.fileId), 'orphan removed from disk')
    await assert.rejects(client.sync.downloadFile(orphan.fileId))
    assert.ok(existsSync(dir))
    assert.equal(userId.length > 0, true)
    console.log('cloud-cost-controls smoke: ok')
  } finally {
    release()
    await new Promise<void>((resolve) => app.server.close(() => resolve()))
    app.db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
