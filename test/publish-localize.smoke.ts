import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { buildLocalizedAss, fitCues, localizeSystemPrompt, parseLocalized } from '../src/shared/localize'

function pureTests() {
  // Line 1 fits in its slot; line 2 is too long → sped up (≤1.4x); line 3 is pushed after line 2.
  const fitted = fitCues({
    cues: [{ startMs: 0, endMs: 1500, text: 'a' }, { startMs: 2000, endMs: 3000, text: 'b' }, { startMs: 3200, endMs: 4000, text: 'c' }],
    texts: ['A', 'B', 'C'],
    durationsMs: [1200, 2000, 500],
    videoDurationMs: 5000,
  })
  assert.deepEqual(fitted[0], { startMs: 0, endMs: 1200, tempo: 1, text: 'A' })
  assert.equal(fitted[1]!.startMs, 2000)
  assert.equal(fitted[1]!.tempo, 1.4)
  assert.ok(fitted[2]!.startMs >= fitted[1]!.endMs, 'lines never overlap')
  assert.ok(fitted.every((cue) => cue.tempo <= 1.4))

  assert.match(localizeSystemPrompt('th'), /Thai/)
  assert.match(localizeSystemPrompt('vi'), /Vietnam/)
  assert.deepEqual(parseLocalized('x {"lines":["Xin chào","Mua ngay"],"title":"T","description":"D #vn"} y', 2), { lines: ['Xin chào', 'Mua ngay'], title: 'T', description: 'D #vn' })
  assert.equal(parseLocalized('{"lines":["only one"]}', 2), null, 'wrong line count is rejected')
  assert.equal(parseLocalized('{"lines":["", "x"]}', 2), null, 'empty lines are rejected')
  assert.deepEqual(parseLocalized('{"lines":[],"title":"T"}', 0), { lines: [], title: 'T', description: undefined })

  const ass = buildLocalizedAss({ cues: fitted, width: 1080, height: 1920, font: 'Noto Sans Thai' })
  assert.match(ass, /PlayResY: 1920/)
  assert.match(ass, /Style: Main,Noto Sans Thai,81,/)
  assert.equal((ass.match(/^Dialogue:/gm) || []).length, 3)
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:01\.20,Main,,0,0,0,,A/)
}

async function pipelineTests() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-localize-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  try {
    const { backgroundRecordStore } = await import('../src/main/lib/backgroundRecordStore')
    const memory = new Map<string, Map<string, any>>()
    const bucket = (ns: string) => memory.get(ns) || memory.set(ns, new Map()).get(ns)!
    Object.assign(backgroundRecordStore, {
      migrate: async () => ({ migrated: 0 }),
      list: async (ns: string) => { const items = [...bucket(ns).values()].map((v) => structuredClone(v)); return { items, total: items.length, offset: 0, limit: items.length } },
      get: async (ns: string, key: string) => structuredClone(bucket(ns).get(key) ?? null),
      upsert: async (ns: string, value: any) => { bucket(ns).set(String(value.id), structuredClone(value)); return value },
      upsertMany: async (ns: string, values: any[]) => { values.forEach((v) => bucket(ns).set(String(v.id), structuredClone(v))); return values },
      remove: async (ns: string, key: string) => bucket(ns).delete(key),
    })
    const { runFfmpeg } = await import('../src/main/modules/ffmpeg/runner')
    const { probeMedia } = await import('../src/main/modules/ffmpeg/probe')
    const { creatokPublisherRepo } = await import('../src/main/modules/tiktok-publisher/repo')
    const { publishLocalizeService, setLocalizeTestDependencies, assertLocalizeReady, buildLocalizeRenderArgs } = await import('../src/main/modules/tiktok-publisher/localize')

    const args = buildLocalizeRenderArgs({ source: 's.mp4', output: 'o.mp4', ttsFiles: ['a.mp3', 'b.mp3'], cues: [{ startMs: 0, endMs: 1000, tempo: 1, text: 'A' }, { startMs: 2000, endMs: 3000, tempo: 1.3, text: 'B' }], hasOriginalAudio: true, originalAudio: 'duck', coverOldSubtitles: true, assPath: 'C:\\x\\s.ass', fontsDir: 'C:\\f', durationSec: 5, codec: 'libx264', encoderArgs: [] })
    const graph = args[args.indexOf('-filter_complex') + 1]!
    assert.match(graph, /boxblur/)
    assert.match(graph, /\[0:a\]volume=0\.15\[orig\]/)
    assert.match(graph, /\[2:a\]atempo=1\.3,adelay=2000\|2000/)
    assert.match(graph, /amix=inputs=3/)
    assert.match(graph, /subtitles='C\\:\/x\/s\.ass'/)
    const muted = buildLocalizeRenderArgs({ source: 's.mp4', output: 'o.mp4', ttsFiles: ['a.mp3'], cues: [{ startMs: 0, endMs: 1000, tempo: 1, text: 'A' }], hasOriginalAudio: true, originalAudio: 'mute', coverOldSubtitles: false, durationSec: 5, codec: 'libx264', encoderArgs: [] })
    assert.doesNotMatch(muted[muted.indexOf('-filter_complex') + 1]!, /orig|boxblur/)

    const video = path.join(root, 'earrings.mp4')
    await runFfmpeg({ args: ['-y', '-f', 'lavfi', '-i', 'testsrc=size=540x960:rate=30:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=6', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video] })
    let transcribeCalls = 0
    let speech = true
    setLocalizeTestDependencies({
      now: () => Date.parse('2026-11-22T10:00:00Z'),
      transcribe: async () => { transcribeCalls += 1; return speech ? [{ startMs: 200, endMs: 2000, text: '这款耳环很百搭' }, { startMs: 2500, endMs: 4000, text: '今天下单送礼盒' }] : [] },
      chat: async ({ system }) => JSON.stringify({ lines: [/Thai/.test(system) ? 'ต่างหูคู่นี้เข้ากับทุกชุด' : 'Đôi bông tai này dễ phối đồ', 'Mua ngay tặng hộp quà'], title: /Thai/.test(system) ? 'ต่างหูมุก' : 'Bông tai ngọc trai', description: 'Đẹp lắm #bongtai #xuhuong' }),
      // 1.2s and 2.5s voice lines (the second is longer than its slot → sped up)
      tts: async ({ text, outPath }) => runFfmpeg({ args: ['-y', '-f', 'lavfi', '-i', `sine=frequency=800:duration=${/Mua|ซื้อ/.test(text) ? 2.5 : 1.2}`, '-c:a', 'libmp3lame', outPath] }),
    })
    await creatokPublisherRepo.upsert({ id: 'src', sourceVideoPath: video, operationId: 'o', idempotencyKey: 'k', state: 'draft', videoTitle: '珍珠耳环', description: '好看 #耳环', connectionUid: 'cn', productId: 'p-cn', createdAt: 0, updatedAt: 0 })

    await assert.rejects(publishLocalizeService.create({ taskIds: ['src'], languages: ['xx'] }), /至少选一种语言/)
    const { tasks } = await publishLocalizeService.create({ taskIds: ['src'], languages: ['vi', 'th'] })
    assert.equal(tasks.length, 2)
    assert.ok(tasks.every((task) => !task.connectionUid && !task.productId), 'account and product are left for the target market')
    assert.throws(() => assertLocalizeReady(tasks[0]!), /还在生成/)
    await publishLocalizeService.idle()
    const done = await Promise.all(tasks.map((task) => creatokPublisherRepo.get(task.id)))
    for (const task of done) {
      assert.equal(task!.localize!.status, 'ready', task!.localize!.error)
      assert.ok(existsSync(task!.sourceVideoPath) && task!.sourceVideoPath !== video)
      const probe = await probeMedia(task!.sourceVideoPath)
      assert.equal(probe.width, 540)
      assert.ok(probe.hasAudio)
      assert.ok(Math.abs(probe.durationSec - 6) < 0.3, `duration kept: ${probe.durationSec}`)
    }
    assert.equal(done.find((t) => t!.localize!.language === 'vi')!.videoTitle, 'Bông tai ngọc trai')
    assert.equal(done.find((t) => t!.localize!.language === 'th')!.videoTitle, 'ต่างหูมุก')
    assert.match(path.basename(done[0]!.sourceVideoPath), /^earrings__(vi|th)_/)
    assert.equal(transcribeCalls, 1, 'speech is recognised once per source video')

    // A video without speech: only the captions are localized, the video stays.
    speech = false
    const silent = path.join(root, 'silent.mp4')
    await runFfmpeg({ args: ['-y', '-f', 'lavfi', '-i', 'testsrc=size=540x960:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', silent] })
    await creatokPublisherRepo.upsert({ id: 'quiet', sourceVideoPath: silent, operationId: 'o2', idempotencyKey: 'k2', state: 'draft', videoTitle: '耳环', createdAt: 0, updatedAt: 0 })
    setLocalizeTestDependencies({ transcribe: async () => [], chat: async () => '{"lines":[],"title":"Bông tai","description":"#bongtai"}' })
    const quiet = (await publishLocalizeService.create({ taskIds: ['quiet'], languages: ['vi'] })).tasks[0]!
    await publishLocalizeService.idle()
    const quietDone = await creatokPublisherRepo.get(quiet.id)
    assert.equal(quietDone!.localize!.status, 'ready')
    assert.equal(quietDone!.localize!.noSpeech, true)
    assert.equal(quietDone!.sourceVideoPath, silent)
    assert.equal(quietDone!.videoTitle, 'Bông tai')

    // AI keeps returning the wrong number of lines → failed with a clear reason, then retry works.
    speech = true
    let bad = true
    setLocalizeTestDependencies({
      transcribe: async () => [{ startMs: 0, endMs: 1000, text: '一句' }],
      chat: async () => (bad ? '{"lines":["a","b"]}' : '{"lines":["Một câu"],"title":"T"}'),
      tts: async ({ outPath }) => runFfmpeg({ args: ['-y', '-f', 'lavfi', '-i', 'sine=duration=0.8', '-c:a', 'libmp3lame', outPath] }),
    })
    const other = path.join(root, 'other.mp4')
    await runFfmpeg({ args: ['-y', '-f', 'lavfi', '-i', 'testsrc=size=540x960:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=duration=2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', other] })
    await creatokPublisherRepo.upsert({ id: 'other', sourceVideoPath: other, operationId: 'o3', idempotencyKey: 'k3', state: 'draft', createdAt: 0, updatedAt: 0 })
    const failing = (await publishLocalizeService.create({ taskIds: ['other'], languages: ['vi'] })).tasks[0]!
    await publishLocalizeService.idle()
    const failed = await creatokPublisherRepo.get(failing.id)
    assert.equal(failed!.localize!.status, 'failed')
    assert.throws(() => assertLocalizeReady(failed!), /句子数/)
    bad = false
    await publishLocalizeService.retry([failing.id])
    await publishLocalizeService.idle()
    assert.equal((await creatokPublisherRepo.get(failing.id))!.localize!.status, 'ready')
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main() {
  pureTests()
  await pipelineTests()
  console.log('publish-localize smoke passed')
  process.exit(0)
}
main().catch((error) => { console.error(error); process.exit(1) })
