import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-clone-variant-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { cloneService, buildAvoidScriptsPromptLines, collectVariantAvoidScripts } = await import('../src/main/modules/clone/service')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')

  const candidate = (id: string, title: string, summary: string, selected = false) => ({ id, title, summary, fullScript: '', shotScripts: [], score: 8, reason: '', selected, createdAt: Date.now() })

  try {
    const reference = path.join(root, 'reference.mp4')
    await writeFile(reference, 'seed')
    const created = await cloneRepo.createProject({ locale: 'zh-CN', strength: 'structure', referenceVideoPath: reference, referenceVideoName: 'reference.mp4', title: '上耳特写复刻' } as any)
    const source = await cloneRepo.upsertProject({
      ...created,
      productId: 'product-1',
      selectedModelIdentityId: 'model-1',
      scriptVariantCandidates: [candidate('a', '潮流前卫 · 上耳特写', '强调个性表达', true), candidate('b', '日常百搭 · 通勤', '强调日常佩戴')],
      selectedScriptVariantId: 'a',
      shotVideoOutputs: [{ shotId: 's1', status: 'done', videoPath: path.join(root, 'shot.mp4') }],
      finalCompose: { status: 'done', outputPath: path.join(root, 'final.mp4') },
    } as any)

    // 1. A variant reuses the reference, product and model, and records the script already made.
    const first = await cloneService.createVariantDraftFromProject({ sourceProjectId: source.id })
    assert.notEqual(first.project.id, source.id)
    assert.equal(first.project.title, '上耳特写复刻 · 变体 1')
    assert.equal(first.project.variantOf?.projectId, source.id)
    assert.deepEqual(first.project.variantOf?.avoidScripts, [{ title: '潮流前卫 · 上耳特写', summary: '强调个性表达' }])
    assert.equal(first.productId, 'product-1')
    assert.equal(first.selectedModelIdentityId, 'model-1')
    assert.ok(first.project.referenceVideoPath && existsSync(first.project.referenceVideoPath), 'variant has its own usable reference video')

    // 2. Nothing the source generated is carried over: the variant goes through the normal flow from the start.
    assert.equal(first.project.baseBlueprint, null)
    assert.equal((first.project.scriptVariantCandidates ?? []).length, 0)
    assert.equal(first.project.selectedScriptVariantId, undefined)
    assert.equal((first.project.shotVideoOutputs ?? []).length, 0)
    assert.equal(first.project.finalCompose?.outputPath, undefined)

    // 3. The link survives a reload from storage.
    const reloaded = await cloneRepo.getProject(first.project.id)
    assert.equal(reloaded?.variantOf?.projectId, source.id)
    assert.equal(reloaded?.variantOf?.avoidScripts.length, 1)

    // 4. Later variants also avoid what earlier variants produced.
    await cloneRepo.upsertProject({ ...reloaded!, scriptVariantCandidates: [candidate('c', '礼物心动 · 开箱', '强调礼物感', true)], selectedScriptVariantId: 'c' } as any)
    const second = await cloneService.createVariantDraftFromProject({ sourceProjectId: source.id })
    assert.equal(second.project.title, '上耳特写复刻 · 变体 2')
    assert.deepEqual(second.project.variantOf?.avoidScripts.map((item) => item.title), ['潮流前卫 · 上耳特写', '礼物心动 · 开箱'])

    // 5. The source project itself is untouched.
    const sourceAfter = await cloneRepo.getProject(source.id)
    assert.equal(sourceAfter?.selectedScriptVariantId, 'a')
    assert.equal(sourceAfter?.variantOf, undefined)
    assert.equal(sourceAfter?.scriptVariantCandidates?.length, 2)

    // 6. Unusable sources are refused instead of producing an empty project.
    await assert.rejects(() => cloneService.createVariantDraftFromProject({ sourceProjectId: 'missing' }), /来源复刻项目不存在/)
    const before = (await cloneRepo.listProjects()).length
    const orphan = await cloneRepo.createProject({ locale: 'zh-CN', strength: 'structure', referenceVideoPath: '', referenceVideoName: '' } as any)
    await assert.rejects(() => cloneService.createVariantDraftFromProject({ sourceProjectId: orphan.id }), /参考视频已不存在/)
    assert.equal((await cloneRepo.listProjects()).length, before + 1, 'a refused variant leaves no draft behind')

    // 7. Script generation is told what to avoid; with nothing to avoid the prompt is unchanged.
    const lines = buildAvoidScriptsPromptLines(second.project.variantOf?.avoidScripts)
    assert.equal(lines.length, 4)
    assert.match(lines[2], /Already used 1: 潮流前卫 · 上耳特写 - 强调个性表达/)
    assert.deepEqual(buildAvoidScriptsPromptLines([]), [])
    assert.deepEqual(buildAvoidScriptsPromptLines(undefined), [])
    assert.deepEqual(collectVariantAvoidScripts([{ scriptVariantCandidates: [], selectedScriptVariantId: undefined }]), [])
    assert.equal(collectVariantAvoidScripts([source, source]).length, 1, 'the same script is listed once')

    // 8. The AI producer's capability refuses a missing source before creating anything, and the plan card prices every variant.
    const { resolveCapabilityBinding } = await import('../src/main/modules/agent-os/capabilityRegistry')
    const { estimatePlanCost } = await import('../src/main/modules/content-hub/costEstimate')
    const resolved = await resolveCapabilityBinding({ intentType: 'Intent.CommerceVideoCreate' as any, approvedPolicy: {} })
    const binding = (resolved as any).binding
    const countBefore = (await cloneRepo.listProjects()).length
    const refused = await binding.execute({ variantOfProjectId: 'missing', variantProjects: 1 }, { dependencyArtifacts: [], upstreamArtifacts: [], registerArtifact: () => 'artifact' })
    assert.equal(refused.success, false)
    assert.equal(refused.error?.code, 'variant_source_unavailable')
    assert.equal((await cloneRepo.listProjects()).length, countBefore)
    const single = estimatePlanCost([{ intentType: 'Intent.CommerceVideoCreate', input: { variantOfProjectId: source.id } }])
    const triple = estimatePlanCost([{ intentType: 'Intent.CommerceVideoCreate', input: { variantOfProjectId: source.id, variantProjects: 3 } }])
    assert.equal(triple.modelCalls, single.modelCalls * 3)
    assert.equal(estimatePlanCost([{ intentType: 'Intent.CommerceVideoCreate', input: { variantOfProjectId: source.id, variantProjects: 99 } }]).modelCalls, single.modelCalls * 4)

    console.log('clone-variant-from-winner smoke passed')
  } finally {
    closeCloneSqlite()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
