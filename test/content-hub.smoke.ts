import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function waitForRun(service: any, runId: string, expected: string[], timeoutMs = 15000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const detail = await service.getRun(runId)
    if (expected.includes(detail.run.status)) return detail
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for run ${runId}`)
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-content-hub-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const brain = await import('../src/main/modules/agent-os/brain')
  const { agentOsService, stepRequiresConfirmation } = await import('../src/main/modules/agent-os/service')
  const { resolveCapabilityBinding, capabilityDefinitions } = await import('../src/main/modules/agent-os/capabilityRegistry')
  const { builtInEmployeeManifests } = await import('../src/main/modules/agent-os/manifests')
  const { productsRepo } = await import('../src/main/modules/products/repo')
  const { contentIndex } = await import('../src/main/modules/content-hub/contentIndex')
  const { reviewInbox } = await import('../src/main/modules/content-hub/reviewInbox')
  const { lineage, brandMemoryStore } = await import('../src/main/modules/content-hub/stores')
  const { buildMemoryGuidance } = await import('../src/main/modules/content-hub/brandMemory')
  const { buildInsights } = await import('../src/main/modules/content-hub/insights')
  const { estimatePlanCost } = await import('../src/main/modules/content-hub/costEstimate')
  const { briefs } = await import('../src/main/modules/content-hub/briefs')
  const { buildWorkspaceSnapshot } = await import('../src/main/modules/content-hub/workspaceSnapshot')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
  const { closeLivePhotoSqlite } = await import('../src/main/modules/live-photo/sqlite')

  const brainPrompts: string[] = []
  brain.setAgentBrainTestDependencies({
    generateChatCompletion: (async (input: any) => {
      brainPrompts.push(`${String(input.system || '')}\n${String(input.prompt || '')}`)
      return { content: JSON.stringify({ action: 'reply', response: 'ok' }) }
    }) as any,
  })

  try {
    // 1. Every new intent resolves to a registered capability and every built-in employee that owns it may use it.
    const newIntents = [
      'Intent.SystemHealthCheck', 'Intent.AssetSearch', 'Intent.AssetArchive', 'Intent.CloneShotsSend', 'Intent.CreativeFromImages',
      'Intent.LivePhotoFromVideo', 'Intent.ReviewSubmit', 'Intent.ProductImportFromLink', 'Intent.ProductResearchPromote',
      'Intent.PublishDraft', 'Intent.InsightsRead',
    ] as const
    const supervisor = builtInEmployeeManifests.find((item) => item.id === 'employee.supervisor')!
    for (const intent of newIntents) {
      const resolved = await resolveCapabilityBinding({ intentType: intent as any, approvedPolicy: {} })
      assert.ok(capabilityDefinitions.some((item) => item.id === resolved.definition.id), `capability for ${intent}`)
      assert.ok(supervisor.allowedIntents.includes(intent as any), `supervisor allows ${intent}`)
      const specialist = builtInEmployeeManifests.find((item) => item.id !== 'employee.supervisor' && item.allowedIntents.includes(intent as any))
      assert.ok(specialist, `a specialist owns ${intent}`)
      assert.ok(specialist!.allowedCapabilities.includes(resolved.definition.id), `${specialist!.id} may use ${resolved.definition.id}`)
    }

    // 2. Dangerous-step gate.
    assert.equal(stepRequiresConfirmation({ intentType: 'Intent.ProductManage', input: {} } as any), true)
    assert.equal(stepRequiresConfirmation({ intentType: 'Intent.MaterialManage', input: { action: 'delete' } } as any), true)
    assert.equal(stepRequiresConfirmation({ intentType: 'Intent.MaterialManage', input: { action: 'retry' } } as any), false)
    assert.equal(stepRequiresConfirmation({ intentType: 'Intent.CommerceVideoCreate', input: { request: 'delete nothing' } } as any), false)

    // 3. Cost estimate.
    const estimate = estimatePlanCost([
      { intentType: 'Intent.CommerceVideoCreate', title: 'clone', input: { referenceVideoPaths: ['a', 'b'] } } as any,
      { intentType: 'Intent.CreativeFromImages', title: 'creative', input: { imagePaths: ['1', '2', '3'] } } as any,
      { intentType: 'Intent.PublishDraft', title: 'publish', input: {} } as any,
    ])
    assert.equal(estimate.modelCalls, 16 * 2 + 2 * 3)
    assert.equal(estimate.accountCredits, 3)
    assert.equal(estimate.dangerousSteps.length, 1)

    // 4. Product, brand memory and workspace snapshot.
    const product = await productsRepo.upsert({ name: 'Pearl Earring', type: 'earring' } as any)
    await brandMemoryStore.saveBrand({ brandName: 'Lumi', tone: 'premium and calm', bannedWords: ['cheapest'] })
    await brandMemoryStore.saveProduct({ productId: product.id, sellingPoints: 'hand-picked freshwater pearls' })
    await brandMemoryStore.addFeedback({ ref: 'clone:x', line: 'clone', productId: product.id, decision: 'redo', reason: 'product_mismatch' })
    await brandMemoryStore.addFeedback({ ref: 'clone:y', line: 'clone', productId: product.id, decision: 'redo', reason: 'product_mismatch' })
    const guidance = await buildMemoryGuidance(product.id)
    assert.match(guidance, /Lumi/)
    assert.match(guidance, /cheapest/)
    assert.match(guidance, /freshwater pearls/)
    assert.match(guidance, /商品不像 \(2x\)/)
    const snapshot = await buildWorkspaceSnapshot()
    assert.ok(snapshot.products.some((item) => item.id === product.id))

    // 5. Brain receives memory and workspace when a normal message is sent.
    const conversation = await agentOsService.createConversation({ context: { productId: product.id } })
    const reply = await agentOsService.sendMessage({ conversationId: conversation.id, content: 'What should I make for this earring?' })
    assert.equal(reply.mode, 'direct')
    assert.ok(brainPrompts.some((prompt) => prompt.includes('Lumi') && prompt.includes(product.id)), 'brain prompt includes memory and workspace')

    // 6. Recipe plan override skips the brain and waits for approval with an estimate.
    const promptsBefore = brainPrompts.length
    const planned = await agentOsService.sendMessage({
      conversationId: conversation.id,
      content: 'Health check then insights',
      plan: { intents: ['Intent.SystemHealthCheck', 'Intent.InsightsRead'], summary: 'Check and review' },
    })
    assert.equal(brainPrompts.length, promptsBefore, 'brain skipped for recipes')
    assert.equal(planned.mode, 'workflow')
    assert.equal(planned.run!.status, 'waiting_approval')
    assert.deepEqual(planned.steps.map((step: any) => step.intentType), ['Intent.SystemHealthCheck', 'Intent.InsightsRead'])
    const runEstimate = await agentOsService.estimateRun(planned.run!.id)
    assert.ok(runEstimate.minutes >= 1)

    // 7. Approving runs the read-only capabilities end to end.
    const revision = planned.run!.revisions[0]
    await agentOsService.approveRun({ runId: planned.run!.id, revision: revision.version, planHash: revision.hash })
    const finished = await waitForRun(agentOsService, planned.run!.id, ['completed', 'failed'])
    assert.equal(finished.run.status, 'completed', JSON.stringify(finished.steps.map((step: any) => [step.title, step.status, step.error])))
    assert.ok(finished.artifacts.some((artifact: any) => artifact.uri === 'content-hub://health'))
    assert.ok(finished.artifacts.some((artifact: any) => artifact.uri === 'content-hub://insights'))

    // 8. Dangerous step pauses at execution time until confirmed.
    const dangerous = await agentOsService.sendMessage({
      conversationId: conversation.id,
      content: 'delete the product',
      context: { productId: product.id, action: 'delete' },
      plan: { intents: ['Intent.ProductManage'], summary: 'Delete product' },
    })
    const dangerousRevision = dangerous.run!.revisions[0]
    await agentOsService.approveRun({ runId: dangerous.run!.id, revision: dangerousRevision.version, planHash: dangerousRevision.hash })
    const paused = await waitForRun(agentOsService, dangerous.run!.id, ['paused', 'completed', 'failed'])
    assert.equal(paused.run.status, 'paused')
    const waitingStep = paused.steps.find((step: any) => step.error === 'awaiting_confirmation')
    assert.ok(waitingStep, 'step waits for confirmation')
    assert.ok(await productsRepo.list().then((rows) => rows.some((row) => row.id === product.id)), 'product still exists before confirmation')
    await assert.rejects(() => agentOsService.resumeRun(dangerous.run!.id))
    await agentOsService.cancelRun(dangerous.run!.id)

    // 9. Content index, inbox, lineage, insights and briefs work on an empty workspace.
    const items = await contentIndex.list()
    assert.ok(Array.isArray(items))
    const sync = await reviewInbox.sync()
    assert.equal(sync.added, 0)
    const edge = await lineage.record({ fromRef: 'clone:p1', toRef: 'livephoto:l1', relation: 'sent_to', productId: product.id })
    const again = await lineage.record({ fromRef: 'clone:p1', toRef: 'livephoto:l1', relation: 'sent_to', productId: product.id })
    assert.equal(edge?.id, again?.id, 'lineage edges are idempotent')
    assert.equal((await lineage.listByProduct(product.id)).length, 1)
    const insights = await buildInsights(7)
    assert.equal(insights.lines.length, 4)
    assert.ok(insights.recommendations.length >= 1)
    const daily = await briefs.generateDaily({ summarize: false })
    assert.equal(daily.kind, 'daily')
    assert.ok(daily.items.length >= 1)
    const dailyAgain = await briefs.generateDaily({ summarize: false })
    assert.equal(dailyAgain.id, daily.id, 'daily brief is generated once per day')
    const weekly = await briefs.generateWeekly({ summarize: false })
    assert.ok(weekly.items.some((item) => item.aiPrompt), 'weekly review offers an AI plan prompt')

    // 10. Asset archive capability imports a real file into the library.
    const filePath = path.join(root, 'sample.png')
    await writeFile(filePath, Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'))
    const archive = await agentOsService.sendMessage({
      conversationId: conversation.id,
      content: 'archive this',
      context: { paths: [filePath] },
      plan: { intents: ['Intent.AssetArchive'], summary: 'Archive' },
    })
    const archiveRevision = archive.run!.revisions[0]
    await agentOsService.approveRun({ runId: archive.run!.id, revision: archiveRevision.version, planHash: archiveRevision.hash })
    const archived = await waitForRun(agentOsService, archive.run!.id, ['completed', 'failed'])
    assert.equal(archived.run.status, 'completed', JSON.stringify(archived.steps.map((step: any) => step.error)))
    assert.equal(archived.artifacts.filter((artifact: any) => artifact.uri.startsWith('asset://')).length, 1)

    // 11. A finished Live Photo lands in the inbox; approving archives it and records lineage + feedback.
    const { livePhotoRepo } = await import('../src/main/modules/live-photo/repo')
    const videoPath = path.join(root, 'live.mp4')
    await writeFile(videoPath, Buffer.from('00000018667479706d703432', 'hex'))
    const now = Date.now()
    await livePhotoRepo.upsert({
      id: 'lp-1',
      sourceType: 'reference_replace',
      productId: product.id,
      packagingStatus: 'completed',
      previewVideoPath: videoPath,
      createdAt: now,
      updatedAt: now,
    } as any)
    contentIndex.invalidate()
    const indexed = await contentIndex.get('livephoto:lp-1')
    assert.equal(indexed?.status, 'ready')
    assert.equal((await reviewInbox.sync()).added, 1)
    const pending = await reviewInbox.list({ decision: 'pending' })
    assert.equal(pending.length, 1)
    const decided = await reviewInbox.decide({ ref: 'livephoto:lp-1', decision: 'approved' })
    assert.ok(decided.review.archivedAssetId, 'approved output archived to asset library')
    assert.ok((await lineage.listFor('livephoto:lp-1')).some((item) => item.relation === 'archived_as'))
    assert.equal((await reviewInbox.counts()).approved, 1)
    assert.ok((await brandMemoryStore.read()).feedback.some((item) => item.ref === 'livephoto:lp-1' && item.decision === 'approved'))
    await reviewInbox.reopen('livephoto:lp-1')
    assert.equal((await reviewInbox.counts()).pending, 1)

    console.log('content-hub smoke: ok')
  } finally {
    brain.resetAgentBrainTestDependencies()
    try { closeCloneSqlite() } catch { /* ignore */ }
    try { closeLivePhotoSqlite() } catch { /* ignore */ }
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
