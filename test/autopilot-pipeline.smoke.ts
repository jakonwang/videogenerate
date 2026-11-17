import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { AI_RECIPES, defaultRecipeValues, recipeById, recipeMissingFields } from '../src/renderer/src/lib/aiRecipes'

async function waitForRun(service: any, runId: string, expected: string[], timeoutMs = 20000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const detail = await service.getRun(runId)
    if (expected.includes(detail.run.status)) return detail
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for run ${runId}`)
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-autopilot-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const brain = await import('../src/main/modules/agent-os/brain')
  const { agentOsService } = await import('../src/main/modules/agent-os/service')
  const registry = await import('../src/main/modules/agent-os/capabilityRegistry')
  const { builtInEmployeeManifests } = await import('../src/main/modules/agent-os/manifests')
  const { pipelineProductIds, pipelineContentRefs, pipelineApprovedRefs } = await import('../src/main/modules/agent-os/pipelineContext')
  const { estimatePlanCost } = await import('../src/main/modules/content-hub/costEstimate')
  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { assetLibraryService } = await import('../src/main/modules/asset-library/service')
  const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
  const { contentIndex } = await import('../src/main/modules/content-hub/contentIndex')
  const { reviewInbox } = await import('../src/main/modules/content-hub/reviewInbox')
  const { brandMemoryStore } = await import('../src/main/modules/content-hub/stores')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
  const { closeLivePhotoSqlite } = await import('../src/main/modules/live-photo/sqlite')

  brain.setAgentBrainTestDependencies({
    generateChatCompletion: (async () => ({ content: JSON.stringify({ action: 'reply', response: 'ok' }) })) as any,
  })
  const analyzed: string[] = []
  registry.setAgentCapabilityTestDependencies({
    analyzeProduct: (async (input: { productId: string }) => {
      analyzed.push(input.productId)
    }) as any,
  })

  const t = (key: string, params?: Record<string, unknown>) => `${key}${params ? JSON.stringify(params) : ''}`
  const supervisor = builtInEmployeeManifests.find((item) => item.id === 'employee.supervisor')!

  async function runPlan(conversationId: string, intents: string[], context: Record<string, unknown>) {
    const planned = await agentOsService.sendMessage({ conversationId, content: 'autopilot', context, plan: { intents, summary: 'autopilot' } })
    assert.equal(planned.run!.status, 'waiting_approval')
    const revision = planned.run!.revisions[0]
    await agentOsService.approveRun({ runId: planned.run!.id, revision: revision.version, planHash: revision.hash })
    return await waitForRun(agentOsService, planned.run!.id, ['completed', 'failed', 'paused'])
  }

  function stepReport(detail: any) {
    return JSON.stringify(detail.steps.map((step: any) => [step.intentType, step.status, step.error]))
  }

  try {
    // 1. The autopilot recipe is first, and every variant only uses intents the supervisor may plan and run.
    assert.equal(AI_RECIPES[0].id, 'autopilot')
    const recipe = recipeById('autopilot')!
    const variants = [
      { source: 'scheme', schemeId: 's1' },
      { source: 'link', url: 'https://shop.example/p/1', productName: 'Jade Ring' },
      { source: 'products', productIds: ['p1', 'p2'] },
      { source: 'products', productIds: ['p1'], referenceMode: 'links', links: 'https://www.tiktok.com/@a/video/1\nnot-a-link', autoApprove: true, livePhoto: false },
    ]
    for (const preset of variants) {
      const values = defaultRecipeValues(recipe, preset)
      assert.deepEqual(recipeMissingFields(recipe, values).map((field) => field.key), [], `no missing fields for ${JSON.stringify(preset)}`)
      const build = recipe.build(values, t)
      for (const intent of build.plan.intents) {
        assert.ok(supervisor.allowedIntents.includes(intent as any), `supervisor allows ${intent}`)
        const resolved = await registry.resolveCapabilityBinding({ intentType: intent as any, approvedPolicy: {} })
        assert.ok(supervisor.allowedCapabilities.includes(resolved.definition.id), `supervisor may use ${resolved.definition.id}`)
        const specialist = builtInEmployeeManifests.find((item) => item.id !== 'employee.supervisor' && item.allowedIntents.includes(intent as any))
        assert.ok(specialist?.allowedCapabilities.includes(resolved.definition.id), `a specialist runs ${intent}`)
      }
      assert.equal(build.plan.intents[0], 'Intent.SystemHealthCheck')
      assert.equal(build.plan.intents.at(-1), 'Intent.InsightsRead')
      assert.ok(build.plan.intents.indexOf('Intent.OutputsAwait') > build.plan.intents.indexOf('Intent.CommerceVideoCreate'))
      assert.equal(build.plan.intents.includes('Intent.PublishDraft'), preset.autoApprove === true, 'publish drafts only with auto-approval')
      assert.equal(build.context.scope, 'run')
    }
    const defaults = recipe.build(defaultRecipeValues(recipe, { schemeId: 's1' }), t)
    assert.deepEqual(defaults.plan.intents, [
      'Intent.SystemHealthCheck', 'Intent.ProductResearchPromote', 'Intent.ProductAnalyze', 'Intent.ReferenceDiscover',
      'Intent.CommerceVideoCreate', 'Intent.CloneShotsSend', 'Intent.OutputsAwait', 'Intent.ReviewSubmit', 'Intent.InsightsRead',
    ])
    const withLinks = recipe.build(defaultRecipeValues(recipe, variants[3]), t)
    assert.deepEqual(withLinks.context.shareUrls, ['https://www.tiktok.com/@a/video/1'])
    assert.ok(!withLinks.plan.intents.includes('Intent.CloneShotsSend'))
    // Required fields hidden by `when` do not block; visible ones do.
    assert.deepEqual(recipeMissingFields(recipe, defaultRecipeValues(recipe, { source: 'link' })).map((field) => field.key), ['url'])
    assert.deepEqual(recipeMissingFields(recipe, defaultRecipeValues(recipe, { source: 'products', referenceMode: 'links' })).map((field) => field.key), ['productIds', 'links'])
    // The plan card estimate follows the number of references the AI will pick.
    const estimate = estimatePlanCost([{ intentType: 'Intent.CommerceVideoCreate', input: { referenceCount: 2, productIds: ['a', 'b'] } } as any])
    assert.equal(estimate.modelCalls, 16 * 4)

    // 2. Pipeline helpers.
    const productArtifact = { id: 'a1', kind: 'product', metadata: { productId: 'p9' }, producerStepId: 's0' } as any
    assert.deepEqual(pipelineProductIds({}, { dependencyArtifacts: [], upstreamArtifacts: [productArtifact] }), ['p9'])
    assert.deepEqual(pipelineProductIds({ productId: 'explicit' }, { dependencyArtifacts: [], upstreamArtifacts: [productArtifact] }), ['explicit'], 'explicit product wins')
    assert.deepEqual(pipelineContentRefs({
      dependencyArtifacts: [],
      upstreamArtifacts: [
        { kind: 'project', metadata: { projectId: 'c1' } },
        { kind: 'task', metadata: { livePhotoId: 'l1' } },
        { kind: 'task', metadata: { creativeTaskId: 't1' } },
        { kind: 'report', metadata: {} },
      ] as any,
    }), ['clone:c1', 'livephoto:l1', 'creative:t1'])
    assert.deepEqual(pipelineApprovedRefs({ dependencyArtifacts: [], upstreamArtifacts: [{ kind: 'report', metadata: { approvedRefs: ['clone:c1'] } }] as any }), ['clone:c1'])

    // 3. A product created by the first step reaches a step two hops later (transitive upstream artifacts).
    const conversation = await agentOsService.createConversation({ context: {} })
    const chained = await runPlan(conversation.id, ['Intent.ProductImportFromLink', 'Intent.SystemHealthCheck', 'Intent.ProductAnalyze'], {
      url: 'http://127.0.0.1:9/product',
      productName: 'Jade Ring',
    })
    assert.equal(chained.run.status, 'completed', stepReport(chained))
    const created = (await productsRepo.list()).find((item) => item.name === 'Jade Ring')
    assert.ok(created, 'product created from link')
    assert.deepEqual(analyzed, [created!.id], 'analysis ran on the product handed down the pipeline')

    // 4. Reference discovery: fails clearly on an empty workspace, then finds a video in a reference folder.
    const empty = await runPlan(conversation.id, ['Intent.ReferenceDiscover'], {})
    assert.equal(empty.run.status, 'failed')
    assert.match(String(empty.run.error), /参考视频/)
    const viralPath = path.join(root, 'viral.mp4')
    await writeFile(viralPath, Buffer.from('00000018667479706d703432', 'hex'))
    const plainFolder = await assetLibraryService.createFolder('产品实拍', null)
    await assetLibraryService.importFile(viralPath, 'desktop', 'raw-footage.mp4', plainFolder.id)
    const stillEmpty = await runPlan(conversation.id, ['Intent.ReferenceDiscover'], {})
    assert.equal(stillEmpty.run.status, 'failed', 'ordinary library videos are never used as viral references')
    const referenceFolder = await assetLibraryService.createFolder('爆款参考', null)
    await assetLibraryService.importFile(viralPath, 'desktop', 'hook-first.mp4', referenceFolder.id)
    const discovered = await runPlan(conversation.id, ['Intent.ReferenceDiscover'], { referenceCount: 2 })
    assert.equal(discovered.run.status, 'completed', stepReport(discovered))
    const references = discovered.artifacts.filter((artifact: any) => artifact.kind === 'source_video')
    assert.equal(references.length, 1)
    assert.equal(references[0].metadata.origin, 'asset')
    assert.equal(references[0].name, 'hook-first.mp4')

    // 5. Await → auto-approve → publish, driven through the real bindings with an upstream Live Photo task.
    const videoPath = path.join(root, 'live.mp4')
    await writeFile(videoPath, Buffer.from('00000018667479706d703432', 'hex'))
    const now = Date.now()
    const seedLivePhoto = async (id: string, done: boolean) => await livePhotoRepo.upsert({
      id,
      sourceType: 'reference_replace',
      productId: created!.id,
      packagingStatus: done ? 'completed' : 'pending',
      previewVideoPath: done ? videoPath : undefined,
      autoFlowStatus: { enabled: true, status: done ? 'completed' : 'running' },
      createdAt: now,
      updatedAt: Date.now(),
    } as any)
    await seedLivePhoto('lp-run', false)
    await seedLivePhoto('lp-other', true)
    contentIndex.invalidate()
    assert.equal((await contentIndex.get('livephoto:lp-run'))?.status, 'running')

    const registered: any[] = []
    const upstream: any[] = [{ id: 'task-1', kind: 'task', metadata: { livePhotoId: 'lp-run' }, producerStepId: 'earlier' }]
    const context = (extra: any[] = []) => ({
      run: { id: 'run-not-stored' },
      step: { id: 'step' },
      idempotencyKey: 'k',
      dependencyArtifacts: [],
      upstreamArtifacts: [...upstream, ...extra],
      registerArtifact: (draft: any) => {
        const id = `artifact-${registered.length + 1}`
        registered.push({ ...draft, id })
        return id
      },
    }) as any
    const bindingFor = async (intentType: string) => (await registry.resolveCapabilityBinding({ intentType: intentType as any, approvedPolicy: {} })).binding

    const awaitBinding = await bindingFor('Intent.OutputsAwait')
    const startedAt = Date.now()
    setTimeout(() => void seedLivePhoto('lp-run', true), 200)
    const awaited = await awaitBinding.execute({ awaitPollMs: 30 }, context())
    assert.equal(awaited.success, true, JSON.stringify(awaited))
    assert.equal(awaited.status, 'completed')
    assert.ok(Date.now() - startedAt >= 150, 'waited for the running output instead of returning early')
    assert.equal(awaited.artifactIds.length, 1)
    assert.equal(registered.at(-1).metadata.ref, 'livephoto:lp-run')
    const nothing = await awaitBinding.execute({}, { ...context(), upstreamArtifacts: [] })
    assert.equal(nothing.success, true)
    assert.equal(nothing.artifactIds.length, 0)

    // Auto-approval only touches this run's output and does not teach brand memory.
    const reviewBinding = await bindingFor('Intent.ReviewSubmit')
    const manual = await reviewBinding.execute({}, context())
    assert.equal(manual.success, true)
    assert.equal((await reviewInbox.counts()).pending, 2, 'without auto-approval everything waits for the user')
    const reviewed = await reviewBinding.execute({ autoApprove: true }, context())
    assert.equal(reviewed.success, true)
    const reviewReport = registered.at(-1)
    assert.deepEqual(reviewReport.metadata.approvedRefs, ['livephoto:lp-run'])
    const counts = await reviewInbox.counts()
    assert.equal(counts.approved, 1)
    assert.equal(counts.pending, 1, 'outputs of other work stay pending')
    assert.ok(!(await brandMemoryStore.read()).feedback.some((item) => item.ref === 'livephoto:lp-run'), 'auto-approval is not recorded as a personal preference')

    // Run-scoped publishing never falls back to the rest of the library.
    await reviewInbox.decide({ ref: 'livephoto:lp-other', decision: 'approved' })
    const publishBinding = await bindingFor('Intent.PublishDraft')
    const noApproval = await publishBinding.execute({ scope: 'run' }, context())
    assert.equal(noApproval.success, false)
    assert.equal(noApproval.error?.code, 'nothing_to_publish')
    const livePhotoOnly = await publishBinding.execute({ scope: 'run' }, context([{ id: 'report-1', kind: 'report', metadata: reviewReport.metadata }]))
    assert.equal(livePhotoOnly.success, false, 'Live Photos are not turned into video publish drafts')
    assert.equal((await contentIndex.list({ line: 'publish' })).length, 0, 'no publish drafts were created')

    // Listing copy step: one listing per pipeline product, never with an invented price.
    const listingRecipe = AI_RECIPES[0]
    const listingValues = defaultRecipeValues(listingRecipe, { source: 'products', productIds: ['p1'], listing: true })
    assert.deepEqual(recipeMissingFields(listingRecipe, listingValues).map((field) => field.key), ['listingPrice'], 'price is required for listing copy')
    const listingBuild = listingRecipe.build({ ...listingValues, listingPrice: '9.99' }, t)
    assert.ok(listingBuild.plan.intents.includes('Intent.ListingGenerate'))
    assert.equal(listingBuild.context.listingPrice, '9.99')
    assert.equal(listingBuild.context.titleLanguage, 'en-US')
    assert.ok(!listingRecipe.build(defaultRecipeValues(listingRecipe, { source: 'products', productIds: ['p1'] }), t).plan.intents.includes('Intent.ListingGenerate'), 'listing is opt-in')

    const imageDir = path.join(root, 'listing-images')
    await mkdir(imageDir, { recursive: true })
    await writeFile(path.join(imageDir, 'ring.png'), 'png')
    const ring = await productsRepo.upsert({ name: 'Silver Ring', type: 'ring', images: [{ filePath: path.join(imageDir, 'ring.png') } as any] })
    const bag = await productsRepo.upsert({ name: 'Tote Bag', type: 'bag', images: [{ filePath: path.join(imageDir, 'ring.png') } as any] })
    const savedListings: any[] = []
    registry.setAgentCapabilityTestDependencies({
      listListings: (async () => savedListings) as any,
      saveListing: (async (input: any) => {
        const row = { ...input, id: input.id || `listing-${savedListings.length + 1}`, listingImages: [], generationStatus: 'idle' }
        savedListings.push(row)
        return row
      }) as any,
      generateListing: (async ({ id }: { id: string }) => ({ ...savedListings.find((row) => row.id === id), generatedTitle: 'Silver Ring', generationStatus: 'done', listingImages: [] })) as any,
    })
    const listingBinding = await bindingFor('Intent.ListingGenerate')
    const productArtifacts = [ring, bag].map((product) => ({ id: `a-${product.id}`, kind: 'product', metadata: { productId: product.id } }))
    const noPrice = await listingBinding.execute({}, context(productArtifacts))
    assert.equal(noPrice.success, false)
    assert.equal(noPrice.error?.code, 'missing_listing_price')
    const listed = await listingBinding.execute({ listingPrice: '9.99' }, context(productArtifacts))
    assert.equal(listed.success, true, JSON.stringify(listed))
    assert.equal(listed.status, 'partial', 'unsupported category is reported, not silently dropped')
    assert.equal(savedListings.length, 1)
    assert.equal(savedListings[0].category, 'ring')
    assert.equal(savedListings[0].localDisplayPrice, '9.99')
    assert.equal(savedListings[0].sourceImagePath, ring.images![0].filePath, 'uses the product library image')
    assert.ok(listed.warnings.some((warning: string) => /Tote Bag/.test(warning)))

    console.log('autopilot-pipeline smoke: ok')
  } finally {
    brain.resetAgentBrainTestDependencies()
    registry.resetAgentCapabilityTestDependencies()
    try { closeCloneSqlite() } catch { /* ignore */ }
    try { closeLivePhotoSqlite() } catch { /* ignore */ }
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
