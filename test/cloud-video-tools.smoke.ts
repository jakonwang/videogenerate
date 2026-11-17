/**
 * 第三阶段视频工具冒烟测试：真实 ffmpeg（ffmpeg-static）。语音识别和 TikHub 用假的。
 * 覆盖：文字 / 图片水印、按时长切片、批量混剪（去重、配乐、统一竖屏）、字幕识别 + 压制、链接解析下载、额度计数。
 * 运行：npx tsx test/cloud-video-tools.smoke.ts
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'

async function main() {
  const { createCloudApp } = await import('../services/cloud/src/app')
  const { MANAGED_SETTINGS_KEY } = await import('../services/cloud/src/service')
  const { createCloudClient } = await import('../src/shared/cloud/client')
  const { createDefaultManagedSettings } = await import('../src/shared/cloud/managedSettings')
  const { getFfmpegExecutable, getFfprobeExecutable } = await import('../src/main/lib/binariesPath')
  const ffmpeg = getFfmpegExecutable()
  const fontsDir = join(process.cwd(), 'resources', 'fonts')
  if (!existsSync(join(fontsDir, 'NotoSansSC-Regular.otf'))) throw new Error('run npm run setup:fonts first')

  const dir = mkdtempSync(join(tmpdir(), 'vg-video-tools-'))
  const run = (args: string[]) => {
    const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args])
    assert.equal(result.status, 0, String(result.stderr))
  }
  const probe = (path: string) => JSON.parse(String(spawnSync(getFfprobeExecutable(), ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', path]).stdout))
  // 9s vertical video with a tone, a logo image and a music track.
  const video = join(dir, 'source.mp4')
  run(['-f', 'lavfi', '-i', 'testsrc=s=360x640:d=9:r=30', '-f', 'lavfi', '-i', 'sine=f=440:d=9', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video])
  const logo = join(dir, 'logo.png')
  run(['-f', 'lavfi', '-i', 'color=c=red:s=200x80', '-frames:v', '1', logo])
  const music = join(dir, 'music.mp3')
  run(['-f', 'lavfi', '-i', 'sine=f=660:d=20', '-c:a', 'libmp3lame', music])

  const keyPath = join(dir, 'ent.pem')
  writeFileSync(keyPath, generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  const transcribeCalls: any[] = []
  const app = createCloudApp(
    { dataDir: dir, dbPath: join(dir, 'cloud.sqlite'), entitlementPrivateKeyPath: keyPath, allowRegistration: true, mockPay: true, fontsDir },
    {
      generationProviders: {
        video: {
          transcribe: async (config, input) => {
            transcribeCalls.push({ config, size: readFileSync(input.filePath).length })
            return { language: 'zh', cues: [{ id: '1', startMs: 0, endMs: 2500, text: '这款耳环真的太好看了' }, { id: '2', startMs: 2600, endMs: 6000, text: '现在下单还送礼盒' }], raw: {} }
          },
          fetch: (async (url: string) => {
            if (String(url).includes('tikhub')) return new Response(JSON.stringify({ code: 200, data: { aweme_detail: { desc: '爆款耳环', video: { play_addr: { url_list: ['https://cdn.example.com/v.mp4'] } } } } }))
            return new Response(readFileSync(video))
          }) as typeof fetch,
        },
      },
    },
  )
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  try {
    let token = ''
    const client = createCloudClient({ getBaseUrl: () => base, getToken: () => token })
    await client.register({ account: 'tools@example.com', password: 'password-123' })
    token = (await client.login({ account: 'tools@example.com', password: 'password-123', client: 'mobile', machineId: 'phone' })).sessionToken
    const plans = await client.listPlans()
    await client.mockPay((await client.createOrder({ planCode: plans.plans[0].code, channel: 'mock' })).order.orderNo)
    const settings = createDefaultManagedSettings()
    settings.enabled = true
    settings.platforms.vectorengine = { apiKey: 'sk-ve', baseUrl: 'https://ve.example.com' }
    settings.capabilities.chat = { platform: 'vectorengine', model: 'gpt-4.1-mini' }
    settings.tikhubApiKey = 'tk-test'
    app.repo.upsertConfig({ key: MANAGED_SETTINGS_KEY, value: settings, scope: 'private', description: '', updatedBy: null, now: Date.now() })

    const upload = async (path: string, mime: string) => (await client.sync.uploadFile(readFileSync(path), mime)).fileId
    const videoId = await upload(video, 'video/mp4')
    const runJob = async (input: Parameters<typeof client.ai.createJob>[0]) => {
      const { job } = await client.ai.createJob(input)
      await app.generation.idle()
      const done = (await client.ai.getJob(job.id)).job
      assert.equal(done.status, 'succeeded', `${input.kind}: ${done.error}`)
      return done
    }
    const download = async (fileId: string, name: string) => {
      const path = join(dir, name)
      writeFileSync(path, Buffer.from(await (await client.sync.downloadFile(fileId)).arrayBuffer()))
      return path
    }

    // ---- text watermark keeps size and sound
    let job = await runJob({ kind: 'watermark', videoFileId: videoId, options: { text: 'TiktokCut 官方', position: 'br', opacity: 0.8 } })
    let info = probe(await download(job.outputFileId!, 'wm-text.mp4'))
    assert.equal(info.streams.find((s: any) => s.codec_type === 'video').width, 360)
    assert.ok(info.streams.some((s: any) => s.codec_type === 'audio'), 'audio kept')

    // ---- logo watermark
    const logoId = await upload(logo, 'image/png')
    job = await runJob({ kind: 'watermark', videoFileId: videoId, options: { logoFileId: logoId, position: 'tl' } })
    assert.ok(probe(await download(job.outputFileId!, 'wm-logo.mp4')).format.duration > 8)

    // ---- slicing into 5-second parts (5 s minimum): 9 s → 5 s + 4 s
    job = await runJob({ kind: 'slice', videoFileId: videoId, options: { segmentSec: 5 } })
    let outputs = (job.result as any).outputs
    assert.equal(outputs.length, 2, `parts: ${JSON.stringify(outputs)}`)
    assert.ok(Math.abs(outputs[0].durationSec - 5) < 0.4 && Math.abs(outputs[1].durationSec - 4) < 0.4, JSON.stringify(outputs))

    // ---- mixing: 2 unique 6-second vertical videos with music
    const clipB = join(dir, 'b.mp4')
    run(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=5:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clipB])
    const clipIds = [videoId, await upload(clipB, 'video/mp4')]
    const musicId = await upload(music, 'audio/mpeg')
    job = await runJob({ kind: 'mix', clips: clipIds.map((fileId) => ({ fileId, durationSec: 0 })), options: { count: 2, durationSec: 6, pieceSec: 2, bgmFileId: musicId } })
    outputs = (job.result as any).outputs
    assert.equal(outputs.length, 2)
    assert.notEqual(outputs[0].fileId, outputs[1].fileId, 'mixes are different')
    info = probe(await download(outputs[0].fileId, 'mix0.mp4'))
    const v = info.streams.find((s: any) => s.codec_type === 'video')
    assert.equal(v.width, 720)
    assert.equal(v.height, 1280)
    assert.ok(info.streams.some((s: any) => s.codec_type === 'audio'), 'music added')
    assert.ok(Math.abs(Number(info.format.duration) - 6) < 0.6, `mix duration ${info.format.duration}`)

    // ---- subtitles: speech → captions burned in, transcript returned
    job = await runJob({ kind: 'subtitle', videoFileId: videoId, options: { language: 'zh' } })
    assert.equal(transcribeCalls[0].config.baseUrl, 'https://ve.example.com/v1', 'uses the chat platform for speech recognition')
    assert.ok(transcribeCalls[0].size > 1000, 'audio extracted')
    assert.match((job.result as any).transcript.text, /耳环/)
    assert.ok(probe(await download(job.outputFileId!, 'sub.mp4')).format.duration > 8)

    // ---- link download
    job = await runJob({ kind: 'parse-link', url: '看看这个 https://v.douyin.com/abc123/ 复制打开' })
    assert.equal((job.result as any).title, '爆款耳环')
    assert.ok(probe(await download(job.outputFileId!, 'dl.mp4')).format.duration > 8)

    // ffmpeg-only tools do not use the AI quota; subtitles and link parsing do.
    assert.equal((await client.ai.usage()).usedToday, 2)

    console.log('cloud video tools smoke: ok')
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
