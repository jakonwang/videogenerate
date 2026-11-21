import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { getFfmpegExecutable } from '../src/main/lib/binariesPath'
import { probeMedia } from '../src/main/modules/ffmpeg/probe'
import {
  buildLongTakeMemberships,
  buildLongTakePrompt,
  classifyBoundary,
  cutVideoPart,
  detectFreezeEdges,
  longTakePartWindow,
  measureClipColor,
  measureFrameSimilarity,
  planLongTakeGroups,
  resolveColorMatchFilters,
  resolveRetimeFactor,
  snapRequestedVideoDurationSec,
} from '../src/main/modules/clone/continuity'
import { renderViralCloneBatch } from '../src/main/modules/clone/renderViralCloneBatch'
import { DEFAULT_CLONE_PROVIDERS, runCompose } from '../services/cloud/src/cloneJobs'

async function ffmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(getFfmpegExecutable(), ['-y', '-hide_banner', '-loglevel', 'error', ...args], { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${code} ${stderr}`))))
  })
}

function planPure() {
  // The reported case: a 15.4s single take split at fixed points into 5 pieces.
  const one = [3.1, 3.4, 3.0, 3.1, 2.8].map((durationSec, i) => ({ id: `s${i + 1}`, durationSec, continuousWithNext: i < 4 }))
  const groups = planLongTakeGroups(one)
  assert.equal(groups.length, 2, 'a 15.4s take needs two ≤10s generations')
  assert.deepEqual(groups.flat(), ['s1', 's2', 's3', 's4', 's5'])
  const lengths = groups.map((ids) => ids.reduce((sum, id) => sum + one.find((s) => s.id === id)!.durationSec, 0))
  assert.ok(lengths.every((value) => value <= 10), `groups fit one generation: ${lengths}`)
  assert.ok(Math.abs(lengths[0]! - lengths[1]!) < 3.5, `groups are balanced: ${lengths}`)

  // A real cut splits the run; a lone shot stays on its own.
  const withCut = [
    { id: 'a', durationSec: 3, continuousWithNext: true },
    { id: 'b', durationSec: 3, continuousWithNext: false },
    { id: 'c', durationSec: 4, continuousWithNext: false },
  ]
  assert.deepEqual(planLongTakeGroups(withCut), [['a', 'b'], ['c']])
  // A shot longer than the limit is still its own group.
  assert.deepEqual(planLongTakeGroups([{ id: 'long', durationSec: 14, continuousWithNext: false }]), [['long']])

  const memberships = buildLongTakeMemberships([['a', 'b'], ['c']], { a: 3, b: 3, c: 4 })
  assert.equal(memberships.a?.leaderShotId, 'a')
  assert.equal(memberships.b?.offsetSec, 3)
  assert.equal(memberships.b?.groupDurationSec, 6)
  assert.equal(memberships.c, undefined, 'single shots are not long takes')

  assert.equal(snapRequestedVideoDurationSec('kling', 6.5), 10)
  assert.equal(snapRequestedVideoDurationSec('kling', 3.1), 5)
  assert.equal(snapRequestedVideoDurationSec('vidu', 6), 8)
  assert.equal(snapRequestedVideoDurationSec('seedance2', 9.5), 10)
  assert.equal(snapRequestedVideoDurationSec('xibapi', 9.5), undefined, 'unknown providers keep their default length')

  // Part windows scale with the length the provider actually returned.
  assert.deepEqual(longTakePartWindow({ offsetSec: 3, durationSec: 3, groupDurationSec: 6 }, 12), { startSec: 6, durationSec: 6 })
  assert.deepEqual(longTakePartWindow({ offsetSec: 0, durationSec: 3, groupDurationSec: 6 }, 6), { startSec: 0, durationSec: 3 })

  const prompt = buildLongTakePrompt('Base prompt', [
    { offsetSec: 0, durationSec: 3, text: 'first' },
    { offsetSec: 3, durationSec: 3, text: 'push in to the earring' },
  ])
  assert.match(prompt, /continuous single take/)
  assert.match(prompt, /From 3\.0s: push in to the earring/)

  assert.equal(resolveRetimeFactor(8, 8), 1)
  assert.equal(resolveRetimeFactor(5, 3.1), 0.62)
  assert.equal(resolveRetimeFactor(2, 10), 1.8, 'never slows down more than 1.8x')

  const filters = resolveColorMatchFilters([{ luma: 100, saturation: 50 }, { luma: 120, saturation: 50 }, { luma: 101, saturation: 70 }])
  assert.equal(filters[0], '', 'the median clip is left alone')
  assert.match(filters[1]!, /brightness=-0\.0[0-9]+/)
  assert.match(filters[2]!, /saturation=0\.88/)
  assert.deepEqual(resolveColorMatchFilters([{ luma: 90, saturation: 40 }]), [''], 'one clip has nothing to match')
}

async function ffmpegChecks(root: string) {
  const a = join(root, 'a.png')
  const aNext = join(root, 'a_next.png')
  const other = join(root, 'other.png')
  await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=360x640:d=1', '-frames:v', '1', a])
  await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=360x640:d=1', '-vf', 'crop=iw-6:ih:6:0,scale=360:640', '-frames:v', '1', aNext])
  await ffmpeg(['-f', 'lavfi', '-i', 'mandelbrot=s=360x640', '-frames:v', '1', other])
  const same = await measureFrameSimilarity(a, aNext)
  const different = await measureFrameSimilarity(a, other)
  assert.ok(same !== null && different !== null, 'similarity is measurable')
  assert.equal(classifyBoundary(same), 'continuous', `near-identical frames: ${same}`)
  assert.equal(classifyBoundary(different), 'cut', `different scenes: ${different}`)
  assert.equal(classifyBoundary(await measureFrameSimilarity(a, join(root, 'missing.png'))), 'cut', 'missing frames count as a cut')

  // A clip whose first 0.6s and last 0.5s are frozen.
  const frozen = join(root, 'frozen.mp4')
  await ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=3',
    '-vf', 'tpad=start_mode=clone:start_duration=0.6:stop_mode=clone:stop_duration=0.5',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', frozen,
  ])
  const frozenMeta = await probeMedia(frozen)
  const edges = await detectFreezeEdges(frozen, Number(frozenMeta.durationSec))
  assert.ok(edges.headSec >= 0.4 && edges.headSec <= 0.8, `head freeze found: ${edges.headSec}`)
  assert.ok(edges.tailSec >= 0.3 && edges.tailSec <= 0.8, `tail freeze found: ${edges.tailSec}`)

  const part = join(root, 'part.longtake-part.mp4')
  await cutVideoPart({ src: frozen, out: part, startSec: 1, durationSec: 1.5 })
  const partMeta = await probeMedia(part)
  assert.ok(Math.abs(Number(partMeta.durationSec) - 1.5) < 0.15, `cut length: ${partMeta.durationSec}`)

  const color = await measureClipColor(frozen, 0, 1)
  assert.ok(color && color.luma > 0, 'colour stats measured')
  return { frozen }
}

async function composeLockedTake(root: string) {
  // One 6s "long take" shared by two shots, then a separate shot after a real cut.
  const take = join(root, 'take.mp4')
  const solo = join(root, 'solo.mp4')
  await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', take])
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x553322:s=1080x1920:r=30:d=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', solo])
  const partA = join(root, 'shot_a.longtake-part.mp4')
  const partB = join(root, 'shot_b.longtake-part.mp4')
  await cutVideoPart({ src: take, out: partA, ...longTakePartWindow({ offsetSec: 0, durationSec: 3, groupDurationSec: 6 }, 6) })
  await cutVideoPart({ src: take, out: partB, ...longTakePartWindow({ offsetSec: 3, durationSec: 3, groupDurationSec: 6 }, 6) })
  const window = (offsetSec: number) => ({ taskId: 'task_1', leaderShotId: 'shot_a', offsetSec, durationSec: 3, groupDurationSec: 6 })
  const base = { purpose: 'detail', generatedSource: 'cloud', status: 'done' } as any
  const result = await renderViralCloneBatch({
    projectId: 'continuity-smoke',
    outDir: join(root, 'out'),
    count: 1,
    shots: [
      { ...base, id: 'shot_a', index: 0, startSec: 0, durationSec: 3, generatedClipPath: partA, generatedTaskId: 'task_1', longTakeWindow: window(0), continuityWithNext: 'continuous' },
      { ...base, id: 'shot_b', index: 1, startSec: 3, durationSec: 3, generatedClipPath: partB, generatedTaskId: 'task_1', longTakeWindow: window(3), continuityWithNext: 'cut' },
      { ...base, id: 'shot_c', index: 2, startSec: 6, durationSec: 3, generatedClipPath: solo, generatedTaskId: 'task_2' },
    ],
  })
  assert.equal(result.outputs.length, 1, 'final video rendered')
  const report = JSON.parse(await readFile(result.reportPath, 'utf8'))
  const item = report.items[0]
  const modes = item.shotSources.map((s: any) => s.clipMode)
  assert.deepEqual(modes.slice(0, 2), ['continuity_full', 'continuity_full'], 'long-take parts are kept whole')
  assert.notEqual(modes[2], 'continuity_full', 'an independent shot keeps the normal window logic')
  assert.equal(item.transitions[0].transition, 'hardcut', 'parts of one take join with a hard cut')
  const meta = await probeMedia(result.outputs[0]!)
  assert.ok(Number(meta.durationSec) > 7.5 && Number(meta.durationSec) < 9.6, `final length close to the script: ${meta.durationSec}`)
}

async function cloudCompose(root: string) {
  // Phone pipeline: one 6s take shared by two shots (locked join), then a still after a soft 'continuous' join.
  const take = join(root, 'cloud_take.mp4')
  const still = join(root, 'cloud_still.png')
  await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=720x1280:r=30:d=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', take])
  await ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x335577:s=720x1280:d=1', '-frames:v', '1', still])
  const store: Record<string, { mime: string; body: Buffer }> = {
    take: { mime: 'video/mp4', body: await readFile(take) },
    still: { mime: 'image/png', body: await readFile(still) },
  }
  const workDir = await mkdtemp(join(root, 'cloud-'))
  const output = await runCompose({
    clips: [
      { fileId: 'take', durationSec: 3, take: { offsetSec: 0, durationSec: 3, groupDurationSec: 6 }, joinNext: 'locked' },
      { fileId: 'take', durationSec: 3, take: { offsetSec: 3, durationSec: 3, groupDurationSec: 6 }, joinNext: 'continuous' },
      { fileId: 'still', durationSec: 2 },
    ],
    aspectRatio: '9:16',
    workDir,
    files: { read: (fileId) => store[fileId]!, store: () => ({ fileId: 'out' }) },
    providers: DEFAULT_CLONE_PROVIDERS,
  })
  const meta = await probeMedia(output)
  // 3 + 3 + 2 minus one 0.25s fade.
  assert.ok(Math.abs(Number(meta.durationSec) - 7.75) < 0.4, `cloud compose length: ${meta.durationSec}`)
}

async function main() {
  planPure()
  const root = await mkdtemp(join(os.tmpdir(), 'clone-shot-continuity-'))
  await ffmpegChecks(root)
  await composeLockedTake(root)
  await cloudCompose(root)
  console.log('clone shot continuity smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
