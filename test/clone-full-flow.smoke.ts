/**
 * 复刻全流程（离线）：两个项目同时自动跑，界面不停读取、还有旧快照写回，
 * 检查脚本 / 分镜 / 视频 / 成片不错乱；再查续跑、失败、换模特、重新分析、中断。
 */
import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'vg-clone-full-'))
  const dataDir = join(root, '.videogenerate')
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = dataDir
  await mkdir(join(dataDir, 'db'), { recursive: true })
  const log = console.log
  console.log = (...args: unknown[]) => (String(args[0]).startsWith('[clone') || String(args[0]).startsWith('[prompt') ? undefined : log(...args))

  const { cloneRepo, ensureCloneSqliteReady } = await import('../src/main/modules/clone/repo')
  const { cloneService } = (await import('../src/main/modules/clone/service')) as any
  await ensureCloneSqliteReady()
  await cloneRepo.setCredentials({ allowMockWhenNoKey: true, imageProviderPrimary: 'openai', videoProviderPrimary: 'seedance' } as any)
  const image = join(dataDir, 'ref.png')
  await copyFile(join(process.cwd(), 'resources', 'icon.png'), image)

  const shots = [1, 2, 3].map((n) => ({ id: `shot_${n}`, index: n - 1, startSec: n - 1, endSec: n, durationSec: 1, scriptText: `base ${n}`, generationPrompt: 'p', visualDescription: 'v', actionDescription: 'a', cameraDescription: 'c', productFocus: 'f', materialNeed: 'm', role: 'hook', shotType: 'closeup', status: 'pending', productType: 'general', productReferenceImagePaths: [image] }))
  async function seed(title: string) {
    const created = await cloneRepo.createProject({ locale: 'zh-CN', strength: 'structure', runMode: 'auto', title, referenceVideoPath: image, referenceVideoName: 'r.mp4' })
    const project = (await cloneRepo.getProject(created.id))!
    project.outputDir = join(dataDir, 'out', created.id)
    project.baseBlueprint = { id: created.id, title, shots: structuredClone(shots), productCategory: 'general' } as any
    project.blueprint = structuredClone(project.baseBlueprint) as any
    project.originalProductReferenceImagePaths = [image]
    project.productReferenceImagePaths = [image]
    project.sanitizedProductReferenceImagePaths = [image]
    project.selectedModelIdentityId = 'm1'
    project.selectedModelIdentitySnapshot = { id: 'm1', name: 'M', imagePaths: [image], status: 'done', createdAt: 1, updatedAt: 1, productType: 'general', market: 'G', gender: 'female', ageRange: '20', hairStyle: 'n', skinTone: 'f', outfitStyle: 'c', mood: 'c', sceneStyle: 's', description: 'd', model: 'd' } as any
    project.projectIdentityGridPath = image
    project.projectIdentityGridStatus = 'done'
    return cloneRepo.upsertProject(project)
  }

  // ---- 替掉要联网的步骤
  const original = { ...cloneService }
  const frames: string[] = []
  let scripts = 0
  let composes = 0
  let failFrames = new Set<string>()
  let failVideos = false
  cloneService.prepareCloneMaterials = async ({ cloneProjectId }: any) => {
    await wait(20)
    const project = (await cloneRepo.getProject(cloneProjectId))!
    if (!project.projectIdentityGridPath) project.projectIdentityGridPath = image
    return { project: await cloneRepo.upsertProject(project) }
  }
  cloneService.generateScriptVariantsForProject = async ({ cloneProjectId }: any) => {
    scripts += 1
    await wait(60)
    const project = (await cloneRepo.getProject(cloneProjectId))!
    project.scriptVariantCandidates = ['a', 'b'].map((id) => ({ id: `${id}-${project.title}`, title: id, summary: '', fullScript: '', score: 9, reason: '', selected: id === 'a', createdAt: 1, shotScripts: shots.map((shot) => ({ shotId: shot.id, scriptText: `${project.title} ${id} ${shot.id}`, scriptRole: 'hook', visualDescription: 'v', actionDescription: 'a', cameraDescription: 'c', generationPrompt: 'p', timeRange: '' })) })) as any
    project.selectedScriptVariantId = `a-${project.title}`
    return { project: await cloneRepo.upsertProject(project) }
  }
  cloneService.generateGptShotFramesInternal = async ({ cloneProjectId, shotId }: any) => {
    frames.push(`${cloneProjectId}:${shotId}`)
    const held = (await cloneRepo.getProject(cloneProjectId))!
    await wait(40 + Math.random() * 80)
    if (failFrames.has(shotId)) throw new Error('frame boom')
    const dir = join(dataDir, 'viral-clone', cloneProjectId, 'shots', shotId, 'gpt-frames')
    await mkdir(dir, { recursive: true })
    const path = join(dir, `gpt_first_${Date.now()}.png`)
    await copyFile(image, path)
    const mark = (list: any[]) => list.map((shot) => (shot.id === shotId ? { ...shot, gptFirstFramePath: path, generatedFirstFramePath: path, gptFrameStatus: 'done', status: 'ready', error: '' } : shot))
    held.blueprint!.shots = mark(held.blueprint!.shots) as any
    held.baseBlueprint!.shots = mark(held.baseBlueprint!.shots) as any
    if (held.executionBlueprint) held.executionBlueprint.shots = mark(held.executionBlueprint.shots) as any
    return cloneRepo.upsertProject(held)
  }
  const video = async (cloneProjectId: string) => {
    const project = (await cloneRepo.getProject(cloneProjectId))!
    await wait(30)
    const path = join(dataDir, `${cloneProjectId}.mp4`)
    await writeFile(path, 'x')
    project.shotVideoOutputs = project.blueprint!.shots.map((shot, index) => ({ segmentId: shot.id, index, shotId: shot.id, source: 'generated', status: failVideos && index === 2 ? 'failed_terminal' : 'done', error: failVideos && index === 2 ? 'x' : undefined, taskId: `task_${shot.id}`, videoPath: failVideos && index === 2 ? undefined : path, localPath: failVideos && index === 2 ? undefined : path, createdAt: 1, updatedAt: Date.now() })) as any
    return cloneRepo.upsertProject(project)
  }
  const batch = (pending: number, failed: number) => ({ queueSummary: { total: 3, done: 3 - pending - failed, failed, pending, timeout: 0, skipped: 0 }, errors: [] })
  cloneService.generateShotVideosFromStoryboardFrames = async ({ cloneProjectId }: any) => ({ project: await video(cloneProjectId), ...batch(0, failVideos ? 1 : 0) })
  cloneService.composeCloneFinalVideo = async ({ cloneProjectId }: any) => {
    composes += 1
    const project = (await cloneRepo.getProject(cloneProjectId))!
    project.finalCompose = { ...project.finalCompose!, status: 'done', outputPath: join(dataDir, `${cloneProjectId}.mp4`), updatedAt: Date.now() }
    return { project: await cloneRepo.upsertProject(project) }
  }

  try {
    // ---- 1. 两个项目同时跑，界面不停读，旧快照不停写
    const [one, two] = [await seed('P1'), await seed('P2')]
    let running = true
    const noise = (async () => {
      while (running) {
        for (const id of [one.id, two.id]) {
          const stale = (await cloneRepo.getProject(id))!
          void cloneService.getProject({ cloneProjectId: id }).catch(() => undefined)
          await wait(25)
          stale.description = `ui ${Date.now()}`
          await cloneRepo.upsertProject({ ...stale })
        }
      }
    })()
    await Promise.all([one, two].map((project) => cloneService.autoRunCloneToStoryboardVideos({ cloneProjectId: project.id })))
    running = false
    await noise
    for (const seeded of [one, two]) {
      const project = (await cloneRepo.getProject(seeded.id))!
      assert.equal(project.scriptVariantCandidates?.length, 2)
      assert.deepEqual(project.blueprint!.shots.map((shot) => shot.scriptText), shots.map((shot) => `${seeded.title} a ${shot.id}`))
      assert.ok(project.blueprint!.shots.every((shot) => shot.gptFirstFramePath?.includes(seeded.id)), 'frames belong to their own project')
      assert.deepEqual(project.shotVideoOutputs?.map((item) => item.status), ['done', 'done', 'done'])
      assert.deepEqual([project.autoFlowStatus?.status, project.autoFlowStatus?.currentStage, project.finalCompose?.status], ['done', 'final_compose', 'done'])
      assert.equal(project.workflowV2!.stepStatus.identity_grid.status, 'done')
      assert.equal(project.workflowV2!.stepStatus.storyboard_design.status, 'done')
      assert.ok(String(project.description).startsWith('ui'))
    }
    assert.deepEqual([frames.length, scripts, composes], [6, 2, 2], 'every step ran exactly once per project')

    // ---- 2. 读取不写库
    const before = (await cloneRepo.getProject(one.id))!.updatedAt
    await cloneService.getProject({ cloneProjectId: one.id })
    await cloneService.getProject({ cloneProjectId: one.id })
    assert.equal((await cloneRepo.getProject(one.id))!.updatedAt, before)

    // ---- 3. 续跑：脚本、手改的台词、分镜图都不重做
    let project = (await cloneRepo.getProject(one.id))!
    project.autoFlowStatus!.status = 'running'
    project.finalCompose = { ...project.finalCompose!, status: 'idle', outputPath: undefined }
    await cloneRepo.upsertProject(project)
    await cloneService.autoRunCloneToStoryboardVideos({ cloneProjectId: one.id })
    assert.deepEqual([frames.length, scripts], [6, 2])
    // 手改台词 → 内容变了，分镜图重画，但台词不被套回去
    project = (await cloneRepo.getProject(one.id))!
    for (const layer of [project.blueprint, project.baseBlueprint, project.executionBlueprint]) if (layer) layer.shots = layer.shots.map((shot) => (shot.id === 'shot_2' ? { ...shot, scriptText: 'edited by hand' } : shot)) as any
    await cloneRepo.upsertProject(project)
    await cloneService.autoRunCloneToStoryboardVideos({ cloneProjectId: one.id })
    project = (await cloneRepo.getProject(one.id))!
    assert.equal(project.blueprint!.shots[1]!.scriptText, 'edited by hand')
    assert.equal(frames.length, 9)

    // ---- 4. 自动跑的时候不能换模特；跑完换了要重做定妆图
    const busy = cloneService.autoRunCloneToStoryboardVideos({ cloneProjectId: one.id })
    await assert.rejects(cloneService.selectProjectModelIdentity({ cloneProjectId: one.id, identityId: 'm1' }), /正在自动生成/)
    await busy
    await cloneRepo.upsertModelIdentity({ id: 'm2', name: 'M2', status: 'done', imagePaths: [image], coverImagePath: image, productType: 'general', market: 'G', gender: 'female', ageRange: '20', hairStyle: 'n', skinTone: 'f', outfitStyle: 'c', mood: 'c', sceneStyle: 's', description: 'd', model: 'd', createdAt: 1, updatedAt: 1 } as any)
    const manual = (await cloneRepo.getProject(two.id))!
    manual.runMode = 'manual'
    manual.autoFlowStatus = { ...manual.autoFlowStatus!, enabled: false, status: 'done' }
    await cloneRepo.upsertProject(manual)
    await cloneService.selectProjectModelIdentity({ cloneProjectId: two.id, identityId: 'm2' })
    project = (await cloneRepo.getProject(two.id))!
    assert.equal(project.projectIdentityGridPath, undefined)
    assert.equal(project.workflowV2!.stepStatus.storyboard_design.status, 'idle')

    // ---- 5. 换脚本：后面的步骤变成要重做
    const three = await seed('P3')
    await cloneService.autoRunCloneToStoryboardVideos({ cloneProjectId: three.id })
    await cloneService.selectScriptVariantForProject({ cloneProjectId: three.id, variantId: 'b-P3' })
    project = (await cloneRepo.getProject(three.id))!
    assert.equal(project.blueprint!.shots[0]!.scriptText, 'P3 b shot_1')
    assert.deepEqual(['storyboard_design', 'storyboard_videos', 'final_compose'].map((step) => (project.workflowV2!.stepStatus as any)[step].status), ['idle', 'idle', 'idle'])

    // ---- 6. 出错要落成失败，不停在进行中
    const four = await seed('P4')
    const scriptStub = cloneService.generateScriptVariantsForProject
    cloneService.generateScriptVariantsForProject = async () => { throw new Error('script boom') }
    await assert.rejects(cloneService.autoRunCloneToStoryboardVideos({ cloneProjectId: four.id }), /script boom/)
    project = (await cloneRepo.getProject(four.id))!
    assert.deepEqual([project.autoFlowStatus?.status, project.workflowV2!.stepStatus.script_generation.status], ['failed', 'failed'])
    cloneService.generateScriptVariantsForProject = scriptStub

    // ---- 7. 有镜头没出视频：部分失败，不合成
    failVideos = true
    const composedBefore = composes
    const five = await seed('P5')
    await cloneService.autoRunCloneToStoryboardVideos({ cloneProjectId: five.id })
    project = (await cloneRepo.getProject(five.id))!
    assert.equal(project.autoFlowStatus?.status, 'partial_failed')
    assert.equal(composes, composedBefore)
    failVideos = false

    // ---- 8. 视频还在等：停在分镜视频；等齐后自动合成一次
    const six = await seed('P6')
    const videoStub = cloneService.generateShotVideosFromStoryboardFrames
    cloneService.generateShotVideosFromStoryboardFrames = async ({ cloneProjectId }: any) => {
      const current = (await cloneRepo.getProject(cloneProjectId))!
      current.shotVideoOutputs = current.blueprint!.shots.map((shot, index) => ({ segmentId: shot.id, index, shotId: shot.id, source: 'generated', status: 'remote_running', taskId: `task_${shot.id}`, submissionStartedAt: Date.now(), submissionLockedUntil: Date.now() + 1500, createdAt: 1, updatedAt: Date.now() })) as any
      return { project: await cloneRepo.upsertProject(current), ...batch(3, 0) }
    }
    await cloneService.autoRunCloneToStoryboardVideos({ cloneProjectId: six.id })
    project = (await cloneRepo.getProject(six.id))!
    assert.deepEqual([project.autoFlowStatus?.status, project.autoFlowStatus?.currentStage], ['running', 'storyboard_videos'])
    assert.equal(project.finalCompose?.outputPath, undefined)
    cloneService.generateShotVideosFromStoryboardFrames = videoStub
    const composedWaiting = composes
    await video(six.id)
    project = (await cloneRepo.getProject(six.id))!
    for (const layer of [project.blueprint, project.baseBlueprint, project.executionBlueprint]) if (layer) layer.shots = layer.shots.map((shot) => ({ ...shot, status: 'done', error: '', generatedClipPath: join(dataDir, six.id + '.mp4'), canEnterRender: true, qualityStatus: 'passed' })) as any
    await cloneRepo.upsertProject(project)
    await cloneService.reconcileRemoteStoryboardVideos({ cloneProjectId: six.id })
    await cloneService.reconcileRemoteStoryboardVideos({ cloneProjectId: six.id })
    await wait(300)
    project = (await cloneRepo.getProject(six.id))!
    assert.deepEqual([project.autoFlowStatus?.status, project.finalCompose?.status, composes - composedWaiting], ['done', 'done', 1])

    // ---- 9. 分镜图还在出，检查视频不会把镜头判成失败
    const seven = await seed('P7')
    project = (await cloneRepo.getProject(seven.id))!
    project.blueprint!.shots = project.blueprint!.shots.map((shot) => ({ ...shot, status: 'generating', gptFrameStatus: 'generating' })) as any
    await cloneRepo.upsertProject(project)
    await cloneService.reconcileRemoteStoryboardVideos({ cloneProjectId: seven.id })
    project = (await cloneRepo.getProject(seven.id))!
    assert.ok(!(project.shotVideoOutputs ?? []).some((item) => String(item.status).startsWith('failed')), JSON.stringify(project.shotVideoOutputs))

    // ---- 10. 中断后重启：不再一直「进行中」；同步来的项目本机不动
    project.workflowV2!.stepStatus.reference_analysis = { status: 'done', updatedAt: Date.now() } as any
    project.finalCompose = { ...project.finalCompose!, status: 'composing' }
    project.runMode = 'manual'
    await cloneRepo.upsertProject(project)
    const eight = (await cloneRepo.getProject((await seed('P8')).id))!
    eight.autoFlowStatus = { enabled: true, targetStage: 'final_compose', status: 'running', currentStage: 'script_generation', imageRetryLimit: 2, videoRetryLimit: 2 }
    await cloneRepo.importSyncedProject(eight)
    const resumed = await cloneService.resumePendingRemoteStoryboardVideosOnStartup()
    assert.ok(!resumed.autoFlowProjectIds.includes(eight.id), 'another device may be running it')
    project = (await cloneRepo.getProject(seven.id))!
    assert.deepEqual([...new Set(project.blueprint!.shots.map((shot) => shot.gptFrameStatus))], ['failed'])
    assert.equal(project.finalCompose?.status, 'failed')

    // ---- 11. 重新分析之前的旧分镜图不会被捡回来
    const dir = join(dataDir, 'viral-clone', seven.id, 'shots', 'shot_1', 'gpt-frames')
    await mkdir(dir, { recursive: true })
    await copyFile(image, join(dir, 'gpt_first_old.png'))
    await utimes(join(dir, 'gpt_first_old.png'), new Date(1000), new Date(1000))
    await cloneService.getProject({ cloneProjectId: seven.id })
    assert.equal((await cloneRepo.getProject(seven.id))!.blueprint!.shots[0]!.gptFirstFramePath, undefined)

    // ---- 12. 改了分镜，旧成片要清掉
    project = (await cloneRepo.getProject(six.id))!
    assert.ok(project.finalCompose?.outputPath)
    const { __cloneServiceInternals } = (await import('../src/main/modules/clone/service')) as any
    __cloneServiceInternals.resetFinalComposeArtifacts(project)
    await cloneRepo.upsertProject(project)
    assert.equal((await cloneRepo.getProject(six.id))!.finalCompose?.outputPath, undefined)

    // ---- 13. 同一个分镜不能同时出两次图
    const twice = [cloneService.generateGptShotFrames({ cloneProjectId: six.id, shotId: 'shot_1' }), cloneService.generateGptShotFrames({ cloneProjectId: six.id, shotId: 'shot_1' })]
    const settled = await Promise.allSettled(twice)
    assert.deepEqual(settled.map((item) => item.status).sort(), ['fulfilled', 'rejected'])
    log('clone full flow smoke ok')
  } finally {
    Object.assign(cloneService, original)
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
  process.exit(0)
}
void main().catch((error) => { console.error(error); process.exit(1) })
