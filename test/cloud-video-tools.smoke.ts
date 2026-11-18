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
            if (String(url).includes('tikhub')) return new Response(JSON.stringify({ code: 200, data: { aweme_detail: { desc: '爆款耳环', author: { nickname: '耳环小店' }, video: { play_addr: { url_list: ['https://cdn.example.com/v.mp4'] } } } } }))
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
    // size / margin like the desktop sliders
    job = await runJob({ kind: 'watermark', videoFileId: videoId, options: { logoFileId: logoId, position: 'br', scale: 0.3, margin: 0.05, opacity: 0.6 } })
    assert.equal(job.status, 'succeeded', job.error)
    // 批量字幕: a full-frame transparent title image stretched over the video
    const titleImage = join(dir, 'title.png')
    run(['-f', 'lavfi', '-i', 'color=c=red@0.5:s=1080x1920', '-frames:v', '1', '-pix_fmt', 'rgba', titleImage])
    job = await runJob({ kind: 'watermark', videoFileId: videoId, options: { logoFileId: await upload(titleImage, 'image/png'), fullFrame: true, opacity: 1 } })
    assert.equal(job.status, 'succeeded', job.error)
    const titled = probe(await download(job.outputFileId!, 'titled.mp4'))
    assert.ok(titled.format.duration > 8)
    assert.equal(titled.streams.find((s: any) => s.codec_type === 'video').width, 360, 'keeps the video size')

    // ---- slicing into 5-second parts (5 s minimum): 9 s → 5 s + 4 s
    job = await runJob({ kind: 'slice', videoFileId: videoId, options: { segmentSec: 5 } })
    let outputs = (job.result as any).outputs
    assert.equal(outputs.length, 2, `parts: ${JSON.stringify(outputs)}`)
    assert.ok(Math.abs(outputs[0].durationSec - 5) < 0.4 && Math.abs(outputs[1].durationSec - 4) < 0.4, JSON.stringify(outputs))

    // ---- 视频拆图: 3 hard-cut scenes (red / blue / green, 3 s each) → one frame from the middle of each scene
    const scenes = join(dir, 'scenes.mp4')
    run(['-f', 'lavfi', '-i', 'color=c=red:s=360x640:d=3:r=30', '-f', 'lavfi', '-i', 'color=c=blue:s=360x640:d=3:r=30', '-f', 'lavfi', '-i', 'color=c=green:s=360x640:d=3:r=30', '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', scenes])
    job = await runJob({ kind: 'frames', videoFileId: await upload(scenes, 'video/mp4') })
    const frames = (job.result as any).outputs
    assert.equal(frames.length, 3, `frames: ${JSON.stringify(frames)}`)
    assert.ok(frames.every((f: any) => f.mime === 'image/jpeg'), 'frames are jpeg')
    assert.deepEqual(frames.map((f: any) => Math.floor(f.atSec / 3)), [0, 1, 2], `one frame inside each scene: ${JSON.stringify(frames)}`)

    // ---- 直播切片: analysis (energy every 0.5 s + scene cuts), then export clips like the desktop slicer
    job = await runJob({ kind: 'live-analyze', videoFileId: videoId })
    assert.equal(job.status, 'succeeded', job.error)
    const analysis = (job.result as any).analysis
    assert.ok(Math.abs(analysis.durationSec - 9) < 0.5, JSON.stringify(analysis.durationSec))
    assert.equal(analysis.step, 0.5)
    assert.ok(analysis.energy.length >= 16 && analysis.energy.length <= 19, `energy readings: ${analysis.energy.length}`)
    assert.ok(analysis.energy.every((v: number) => v <= 0 && v >= -90), 'dBFS values')
    assert.ok(Array.isArray(analysis.scenes))
    job = await runJob({ kind: 'live-export', videoFileId: videoId, options: { segments: [{ id: 'a', start: 1, end: 3 }, { id: 'b', start: 5, end: 8 }], aspectMode: '1:1', resolution: '1080', fade: true, normalizeAudio: true } })
    assert.equal(job.status, 'succeeded', job.error)
    let clips = (job.result as any).outputs
    assert.deepEqual(clips.map((c: any) => c.segmentId), ['a', 'b'])
    const square = probe(await download(clips[1].fileId, 'live-b.mp4'))
    const squareVideo = square.streams.find((s: any) => s.codec_type === 'video')
    assert.equal(squareVideo.width, squareVideo.height, '1:1 crop')
    assert.ok(Math.abs(square.format.duration - 3) < 0.4, `clip length ${square.format.duration}`)
    assert.ok(square.streams.some((s: any) => s.codec_type === 'audio'), 'keeps audio')
    job = await runJob({ kind: 'live-export', videoFileId: videoId, options: { segments: [{ id: 'c', start: 2, end: 6 }], cutMode: 'fast', padding: 1 } })
    assert.equal(job.status, 'succeeded', job.error)
    clips = (job.result as any).outputs
    assert.ok(probe(await download(clips[0].fileId, 'live-fast.mp4')).format.duration > 4, 'fast cut with padding')

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

    // ---- mixing with a template: duration range, title burned in, letterbox, color, mirroring, quiet music
    const { templateMixOptions, normalizeSyncTemplate } = await import('../src/shared/cloud/templates')
    const template = normalizeSyncTemplate({ name: '测试模板', durationSec: { min: 6, max: 8 }, pieceSec: { min: 1.5, max: 2.5 }, titles: ['今日上新\n✨✨'],bgmFileIds: [musicId], bgmVolume: 0.2, aspect: 'contain_pad', colorGrade: { enabled: true, brightness: 0.05, contrast: 1.1, saturation: 1.2 }, hflip: true })
    job = await runJob({ kind: 'mix', clips: clipIds.map((fileId) => ({ fileId, durationSec: 0 })), options: templateMixOptions(template, 2) })
    outputs = (job.result as any).outputs
    assert.equal(outputs.length, 2, JSON.stringify(job))
    for (const output of outputs) assert.ok(output.durationSec >= 5.6 && output.durationSec <= 8.4, `template duration ${output.durationSec}`)
    info = probe(await download(outputs[0].fileId, 'mix-tpl.mp4'))
    const tv = info.streams.find((s: any) => s.codec_type === 'video')
    assert.equal(tv.width, 720)
    assert.equal(tv.height, 1280)
    assert.ok(info.streams.some((s: any) => s.codec_type === 'audio'), 'template music added')

    // ---- 生产中心 cloud fallback: one video cut exactly as planned, with a title and music
    job = await runJob({ kind: 'mix', clips: [{ fileId: clipIds[0], startSec: 1, durationSec: 1.5 }, { fileId: clipIds[1], startSec: 2, durationSec: 2 }, { fileId: clipIds[0], startSec: 4, durationSec: 1 }], options: { exactShots: true, title: '到货啦', bgmFileIds: [musicId], bgmVolume: 0.5, aspect: 'cover_crop' } })
    outputs = (job.result as any).outputs
    assert.equal(outputs.length, 1, JSON.stringify(job))
    info = probe(await download(outputs[0].fileId, 'mix-shots.mp4'))
    assert.ok(Math.abs(Number(info.format.duration) - 4.5) < 0.5, `exact shots duration ${info.format.duration}`)
    assert.ok(info.streams.some((s: any) => s.codec_type === 'audio'), 'music added to planned mix')

    // ---- subtitles: speech → captions burned in, transcript returned
    job = await runJob({ kind: 'subtitle', videoFileId: videoId, options: { language: 'zh' } })
    assert.equal(transcribeCalls[0].config.baseUrl, 'https://ve.example.com/v1', 'uses the chat platform for speech recognition')
    assert.ok(transcribeCalls[0].size > 1000, 'audio extracted')
    assert.match((job.result as any).transcript.text, /耳环/)
    assert.ok(probe(await download(job.outputFileId!, 'sub.mp4')).format.duration > 8)

    // ---- link download
    job = await runJob({ kind: 'parse-link', url: '看看这个 https://v.douyin.com/abc123/ 复制打开' })
    assert.equal((job.result as any).title, '爆款耳环')
    assert.equal((job.result as any).author, '耳环小店')
    const poster = (job.result as any).outputs[0].posterFileId
    assert.ok(poster, 'a cover frame is saved')
    assert.ok(readFileSync(await download(poster, 'poster.jpg')).length > 100, 'cover is a real image')
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
