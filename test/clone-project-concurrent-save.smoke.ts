import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { mergeThreeWay } from '../src/main/modules/clone/projectMerge'

async function main() {
  assert.deepEqual(mergeThreeWay({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 3 }), { a: 2, b: 3 })
  assert.deepEqual(mergeThreeWay([{ shotId: 'x', v: 1 }], [{ shotId: 'x', v: 1 }, { shotId: 'y', v: 2 }], [{ shotId: 'x', v: 9 }, { shotId: 'z', v: 3 }]), [{ shotId: 'x', v: 9 }, { shotId: 'y', v: 2 }, { shotId: 'z', v: 3 }])
  assert.deepEqual(Object.keys(mergeThreeWay({ a: 1 }, { a: undefined }, { a: 1, b: 2 }) as object).sort(), ['a', 'b'])

  const root = await mkdtemp(path.join(tmpdir(), 'vg-clone-save-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
  try {
    const created = await cloneRepo.createProject({ locale: 'zh-CN', strength: 'structure', runMode: 'auto', referenceVideoPath: '', referenceVideoName: '' } as any)
    const shot = (n: number) => ({ id: `shot_${n}`, index: n - 1, startSec: 0, endSec: 1, durationSec: 1, scriptText: 'old' })
    const seeded = (await cloneRepo.getProject(created.id))!
    seeded.blueprint = { shots: [shot(1), shot(2)] } as any
    await cloneRepo.upsertProject(seeded)

    // 界面先读了一份，脚本随后生成并保存，界面再把旧的那份写回
    const stale = (await cloneRepo.getProject(created.id))!
    const script = (await cloneRepo.getProject(created.id))!
    script.scriptVariantCandidates = [{ id: 'v1', title: 't', summary: 's', fullScript: 'f', shotScripts: [], score: 9, reason: '', selected: true, createdAt: 1 }] as any
    script.selectedScriptVariantId = 'v1'
    script.workflowV2!.stepStatus.script_generation = { status: 'done', updatedAt: 2 } as any
    script.blueprint!.shots[0]!.scriptText = 'new'
    await cloneRepo.upsertProject(script)
    stale.lastError = 'from stale'
    await cloneRepo.upsertProject({ ...stale, description: 'ui' })
    let now = (await cloneRepo.getProject(created.id))!
    assert.equal(now.scriptVariantCandidates?.length, 1)
    assert.equal(now.selectedScriptVariantId, 'v1')
    assert.equal(now.workflowV2!.stepStatus.script_generation.status, 'done')
    assert.equal(now.blueprint!.shots[0]!.scriptText, 'new')
    assert.deepEqual([now.lastError, now.description], ['from stale', 'ui'])

    // 两个分镜同时出图，各存各的，不互相盖掉
    const one = (await cloneRepo.getProject(created.id))!
    const two = (await cloneRepo.getProject(created.id))!
    one.blueprint!.shots[0]!.gptFirstFramePath = 'a.png'
    two.blueprint!.shots[1]!.gptFirstFramePath = 'b.png'
    await cloneRepo.upsertProject(one)
    await cloneRepo.upsertProject(two)
    // 同一份接着改、接着存
    two.lastError = 'again'
    await cloneRepo.upsertProject(two)
    now = (await cloneRepo.getProject(created.id))!
    assert.deepEqual(now.blueprint!.shots.map((item) => item.gptFirstFramePath), ['a.png', 'b.png'])
    assert.equal(now.lastError, 'again')

    // 清空照样生效
    now.blueprint!.shots[0]!.gptFirstFramePath = undefined
    now.scriptVariantCandidates = []
    now.selectedScriptVariantId = undefined
    await cloneRepo.upsertProject(now)
    now = (await cloneRepo.getProject(created.id))!
    assert.equal(now.blueprint!.shots[0]!.gptFirstFramePath, undefined)
    assert.equal(now.scriptVariantCandidates?.length, 0)
    assert.equal(now.selectedScriptVariantId, undefined)

    // 云端版本下载期间本机又改过：不整份替换
    assert.equal(await cloneRepo.importSyncedProject({ ...now, title: 'cloud' } as any, Number(now.updatedAt) - 1), null)
    assert.ok(await cloneRepo.importSyncedProject({ ...now, title: 'cloud' } as any, Number(now.updatedAt)))
    console.log('clone project concurrent save smoke ok')
  } finally {
    closeCloneSqlite()
    delete process.env.VIDEOGENERATE_DATA_DIR
    await rm(root, { recursive: true, force: true })
  }
}
void main().catch((error) => { console.error(error); process.exit(1) })
