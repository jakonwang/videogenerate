/**
 * 复刻云端任务冒烟测试：真实 ffmpeg（ffmpeg-static）+ 桌面端同一个分镜拆解器，AI 脚本分析用 mock。
 * 覆盖：拆解对标视频（场景切分、参考帧存云端）、按原片节奏合成成片（视频 + 静帧混合、尺寸统一）。
 * 运行：npx tsx test/cloud-clone.smoke.ts
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

process.env.CLONE_SCRIPT_ANALYZER_MOCK = '1'

async function main() {
  const { createCloudApp } = await import('../services/cloud/src/app')
  const { MANAGED_SETTINGS_KEY } = await import('../services/cloud/src/service')
  const { createCloudClient } = await import('../src/shared/cloud/client')
  const { createDefaultManagedSettings } = await import('../src/shared/cloud/managedSettings')
  const { getFfmpegExecutable, getFfprobeExecutable } = await import('../src/main/lib/binariesPath')
  const ffmpeg = getFfmpegExecutable()

  const dir = mkdtempSync(join(tmpdir(), 'vg-cloud-clone-'))
  const keyPath = join(dir, 'ent.pem')
  writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())

  // A 6-second vertical "reference" video with three hard scene changes (red → green → blue).
  const reference = join(dir, 'reference.mp4')
  const make = spawnSync(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=red:s=360x640:d=2:r=30',
    '-f', 'lavfi', '-i', 'color=c=green:s=360x640:d=2:r=30',
    '-f', 'lavfi', '-i', 'color=c=blue:s=360x640:d=2:r=30',
    '-filter_complex', '[0][1][2]concat=n=3:v=1:a=0',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', reference,
  ])
  assert.equal(make.status, 0, String(make.stderr))

  const app = createCloudApp({ dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true })
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  try {
    let token = ''
    const client = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
    await client.register({ account: 'clone@example.com', password: 'password-123' })
    token = (await client.login({ account: 'clone@example.com', password: 'password-123', client: 'mobile', machineId: 'phone' })).sessionToken
    const plans = await client.listPlans()
    const order = await client.createOrder({ planCode: plans.plans[0].code, channel: 'mock' })
    await client.mockPay(order.order.orderNo)

    const settings = createDefaultManagedSettings()
    settings.enabled = true
    settings.platforms.vectorengine = { apiKey: 'sk-test', baseUrl: 'http://127.0.0.1:9' }
    settings.capabilities.chat = { platform: 'vectorengine', model: 'gpt-4.1-mini' }
    app.repo.upsertConfig({ key: MANAGED_SETTINGS_KEY, value: settings, scope: 'private', description: '', updatedBy: null, now: Date.now() })

    // ---- analyze
    const video = await client.sync.uploadFile(readFileSync(reference), 'video/mp4')
    let job = (await client.ai.createJob({ kind: 'analyze-video', videoFileId: video.fileId, locale: 'zh-CN' })).job
    await app.generation.idle()
    job = (await client.ai.getJob(job.id)).job
    assert.equal(job.status, 'succeeded', job.error)
    const analysis = job.result as any
    assert.equal(analysis.aspectRatio, '9:16')
    assert.ok(Math.abs(analysis.totalDurationSec - 6) < 0.6, `duration ${analysis.totalDurationSec}`)
    // The desktop detector may merge short segments; it must still split at least once.
    assert.ok(analysis.shots.length >= 2, `expected ≥2 shots from 3 scenes, got ${analysis.shots.length}`)
    for (const shot of analysis.shots) {
      assert.ok(shot.frameFileId, `shot ${shot.id} has a reference frame`)
      assert.ok(shot.durationSec > 0)
    }
    const frame = await client.sync.downloadFile(analysis.shots[0].frameFileId)
    assert.equal(frame.type, 'image/jpeg')

    // ---- compose: a real video clip + a still frame, kept to the reference rhythm
    const clip = await client.sync.uploadFile(readFileSync(reference), 'video/mp4')
    job = (await client.ai.createJob({
      kind: 'compose',
      aspectRatio: '9:16',
      clips: [
        { fileId: clip.fileId, durationSec: 1.5 },
        { fileId: analysis.shots[1].frameFileId, durationSec: 2 },
        { fileId: clip.fileId, durationSec: 8 }, // longer than the clip: last frame is held
      ],
    })).job
    await app.generation.idle()
    job = (await client.ai.getJob(job.id)).job
    assert.equal(job.status, 'succeeded', job.error)
    assert.equal(job.outputMime, 'video/mp4')
    const final = join(dir, 'final.mp4')
    writeFileSync(final, Buffer.from(await (await client.sync.downloadFile(job.outputFileId!)).arrayBuffer()))
    const probe = spawnSync(getFfprobeExecutable(), ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', final])
    const info = JSON.parse(String(probe.stdout))
    assert.equal(info.streams[0].width, 720)
    assert.equal(info.streams[0].height, 1280)
    assert.ok(Math.abs(Number(info.format.duration) - 11.5) < 0.4, `final duration ${info.format.duration}`)

    // compose does not use the AI quota
    const usage = await client.ai.usage()
    assert.equal(usage.usedToday, 1)

    console.log('cloud clone smoke: ok')
  } finally {
    app.server.close()
    app.db.close()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* cleaned up by the OS */
    }
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
