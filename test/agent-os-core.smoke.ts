import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime, getAppPaths } from '../src/main/lib/paths'

async function waitForRun(service: any, runId: string, expected: string[], timeoutMs = 10000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const detail = await service.getRun(runId)
    if (expected.includes(detail.run.status)) return detail
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timed out waiting for run ${runId}`)
}

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-agent-os-core-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })

  const planner = await import('../src/main/modules/agent-os/planner')
  const brain = await import('../src/main/modules/agent-os/brain')
  const { builtInEmployeeManifests } = await import('../src/main/modules/agent-os/manifests')
  const { resolveCapabilityBinding } = await import('../src/main/modules/agent-os/capabilityRegistry')
  const { assertRunTransition, assertStepTransition } = await import('../src/main/modules/agent-os/stateMachine')
  const { agentOsService } = await import('../src/main/modules/agent-os/service')
  const { agentOsStore } = await import('../src/main/modules/agent-os/store')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')
  const { closeLivePhotoSqlite } = await import('../src/main/modules/live-photo/sqlite')

  const modelInputs: string[] = []
  planner.setAgentPlannerTestDependencies({
    generateChatCompletion: (async (input: any) => {
      modelInputs.push(`${String(input.system || '')}\n${String(input.prompt || '')}`)
      return {
        content: JSON.stringify({
          summary: 'Inspect the product library.',
          intents: ['Intent.ProductInspect'],
        }),
      }
    }) as any,
  })

  const brainInputs: string[] = []
  brain.setAgentBrainTestDependencies({
    generateChatCompletion: (async (input: any) => {
      brainInputs.push(`${String(input.system || '')}\n${String(input.prompt || '')}`)
      return {
        content: JSON.stringify({
          action: 'workflow',
          summary: 'Inspect the product and prepare its materials.',
          intents: ['Intent.ProductInspect', 'Intent.MaterialPrepare'],
          context: { quantity: 2 },
        }),
      }
    }) as any,
  })

  try {
    assert.doesNotThrow(() => assertRunTransition('draft', 'planning'))
    assert.throws(() => assertRunTransition('draft', 'completed'), /Invalid run status transition/)
    assert.doesNotThrow(() => assertStepTransition('ready', 'running'))
    assert.throws(() => assertStepTransition('completed', 'running'), /Invalid step status transition/)

    const employee = builtInEmployeeManifests.find((item) => item.id === 'employee.supervisor')!
    const planned = await planner.buildAgentPlan({
      runId: 'run-test',
      revision: 1,
      prompt: 'Inspect the product library.',
      context: { quantity: 1 },
      attachments: [],
      employee,
    })
    assert.equal(planned.steps[0].intentType, 'Intent.ProductInspect')
    assert.equal('tool' in planned.steps[0], false)
    assert.equal('capabilityId' in planned.steps[0], false)
    assert.equal('bindingId' in planned.steps[0], false)
    assert.equal(/binding\.|adapter|provider|tool/i.test(modelInputs[0]), false)

    const dedicatedEmployee = {
      ...employee,
      id: 'employee.dedicated',
      role: 'custom' as const,
      plannerPolicy: 'Keep the workflow limited to product inspection.',
    }
    const dedicatedPlan = await planner.buildAgentPlan({
      runId: 'run-dedicated',
      revision: 1,
      prompt: 'Inspect the product library.',
      context: {},
      attachments: [],
      employee: dedicatedEmployee,
    })
    assert.equal(dedicatedPlan.steps[0].employeeId, dedicatedEmployee.id)
    assert.match(modelInputs.at(-1) || '', /Keep the workflow limited to product inspection/)

    const brainDecision = await brain.decideAgentTurn({
      request: 'Inspect this product and prepare two material sets.',
      employee,
      messages: [{
        id: 'history-1',
        conversationId: 'conversation-test',
        role: 'user',
        content: 'Use the latest product.',
        attachments: [],
        createdAt: Date.now(),
      }],
      attachments: [],
      context: { quantity: 2, globalPolicy: { 'Product.Read': 'binding.product.read.local.v1' } },
      artifacts: [],
    })
    assert.equal(brainDecision?.action, 'workflow')
    assert.deepEqual(brainDecision?.action === 'workflow' ? brainDecision.intents : [], [
      'Intent.ProductInspect',
      'Intent.MaterialPrepare',
    ])
    assert.match(brainInputs[0], /Use the latest product/)
    assert.equal(/binding\.|adapter|provider|tool/i.test(brainInputs[0]), false)

    let conversationalDecisionCalls = 0
    brain.setAgentBrainTestDependencies({
      generateChatCompletion: (async () => {
        conversationalDecisionCalls += 1
        return {
          content: conversationalDecisionCalls === 1
            ? JSON.stringify({
                action: 'workflow',
                summary: 'Create media.',
                intents: ['Intent.LivePhotoCreate'],
              })
            : JSON.stringify({ action: 'reply', response: 'The project code is Polaris.' }),
        }
      }) as any,
    })
    const conversationalDecision = await brain.decideAgentTurn({
      request: 'What was the project code I mentioned?',
      employee,
      messages: [{
        id: 'history-2',
        conversationId: 'conversation-test',
        role: 'user',
        content: 'Remember that the project code is Polaris.',
        attachments: [],
        createdAt: Date.now(),
      }],
      attachments: [],
      context: {},
      artifacts: [],
    })
    assert.equal(conversationalDecisionCalls, 2)
    assert.equal(conversationalDecision?.action, 'reply')
    assert.equal(conversationalDecision?.action === 'reply' ? conversationalDecision.response : '', 'The project code is Polaris.')

    brain.setAgentBrainTestDependencies({
      generateChatCompletion: (async () => {
        throw new Error('Decision brain disabled for fallback tests')
      }) as any,
    })

    const firstResolution = await resolveCapabilityBinding({ intentType: 'Intent.ProductInspect', approvedPolicy: {} })
    const secondResolution = await resolveCapabilityBinding({ intentType: 'Intent.ProductInspect', approvedPolicy: {} })
    assert.equal(firstResolution.binding.id, secondResolution.binding.id)

    await agentOsService.initialize()

    const linkedConversation = await agentOsService.createConversation({ employeeId: 'employee.supervisor' })
    await agentOsService.linkHermesSession({ conversationId: linkedConversation.id, storedSessionId: 'hermes-session-primary' })
    await agentOsService.linkHermesSession({ conversationId: linkedConversation.id, storedSessionId: 'hermes-session-branch' })
    assert.equal((await agentOsService.findConversationByHermesSession('hermes-session-primary'))?.id, linkedConversation.id)
    assert.equal((await agentOsService.findConversationByHermesSession('hermes-session-branch'))?.id, linkedConversation.id)
    const linkedConversationDetail = await agentOsService.getConversation(linkedConversation.id)
    assert.deepEqual(linkedConversationDetail.conversation.hermesStoredSessionIds, ['hermes-session-primary', 'hermes-session-branch'])
    brain.setAgentBrainTestDependencies({
      generateChatCompletion: (async () => ({
        content: JSON.stringify({
          action: 'workflow',
          summary: 'Inspect the latest product.',
          intents: ['Intent.ProductInspect'],
          context: { productId: 'product-latest' },
        }),
      })) as any,
    })
    const brainConversation = await agentOsService.createConversation()
    const plannerCallsBeforeBrainRun = modelInputs.length
    const brainRun = await agentOsService.sendMessage({
      conversationId: brainConversation.id,
      content: 'Handle the latest product for me.',
    })
    assert.equal(brainRun.mode, 'workflow')
    assert.equal(brainRun.steps[0].intentType, 'Intent.ProductInspect')
    assert.equal(brainRun.run?.revisions[0].summary, 'Inspect the latest product.')
    assert.equal(modelInputs.length, plannerCallsBeforeBrainRun)
    brain.setAgentBrainTestDependencies({
      generateChatCompletion: (async () => {
        throw new Error('Decision brain disabled for fallback tests')
      }) as any,
    })

    const directConversation = await agentOsService.createConversation()
    const greeting = await agentOsService.sendMessage({
      conversationId: directConversation.id,
      content: 'Hello',
    })
    assert.equal(greeting.mode, 'direct')
    assert.equal(greeting.run, null)
    assert.equal(greeting.message.responseCode, 'greeting')
    assert.equal((await agentOsService.getConversation(directConversation.id)).runs.length, 0)

    const unavailableConversation = await agentOsService.createConversation()
    const unavailableReply = await agentOsService.sendMessage({
      conversationId: unavailableConversation.id,
      content: 'Remember this conversation detail for later.',
    })
    assert.equal(unavailableReply.mode, 'direct')
    assert.equal(unavailableReply.message.responseCode, 'assistant_unavailable')
    assert.equal((await agentOsService.getConversation(unavailableConversation.id)).runs.length, 0)

    const artifactQuery = await agentOsService.sendMessage({
      conversationId: directConversation.id,
      content: 'Show me the recent Live Photo videos.',
    })
    assert.equal(artifactQuery.mode, 'artifact_query')
    assert.equal(artifactQuery.run, null)
    assert.equal(artifactQuery.message.responseCode, 'artifact_empty')
    assert.equal((await agentOsService.getConversation(directConversation.id)).runs.length, 0)

    const clarificationConversation = await agentOsService.createConversation()
    const clarification = await agentOsService.sendMessage({
      conversationId: clarificationConversation.id,
      content: 'Export the latest result.',
    })
    assert.equal(clarification.mode, 'clarification')
    assert.equal(clarification.run, null)
    assert.equal(clarification.message.responseCode, 'output_directory')
    const resumedAfterClarification = await agentOsService.sendMessage({
      conversationId: clarificationConversation.id,
      content: 'C:\\Temp\\AgentExport',
    })
    assert.equal(resumedAfterClarification.mode, 'clarification')
    assert.equal(resumedAfterClarification.message.responseCode, 'source_artifact')
    const resumedWithArtifact = await agentOsService.sendMessage({
      conversationId: clarificationConversation.id,
      content: 'Use this result.',
      attachments: [{ id: 'export-source', name: 'result.mp4', path: 'C:\\Temp\\result.mp4', mediaType: 'video' }],
    })
    assert.equal(resumedWithArtifact.mode, 'workflow')
    assert.equal(resumedWithArtifact.run?.status, 'waiting_approval')
    assert.equal(resumedWithArtifact.run?.revisions[0].requestSnapshot, 'Export the latest result.')

    const conversation = await agentOsService.createConversation({
      context: {
        quantity: 1,
        apiKey: 'must-not-persist',
        accessToken: 'must-not-persist',
        credentialRef: 'credential:primary',
      },
    })
    const created = await agentOsService.sendMessage({
      conversationId: conversation.id,
      content: 'Inspect the product library.',
      context: { password: 'must-not-persist', projectId: 'project-1' },
    })
    assert.equal(created.run.status, 'waiting_approval')
    const revision = created.run.revisions[0]
    assert.ok(revision.capabilityPolicySnapshot['Product.Read'])
    await assert.rejects(
      agentOsService.approveRun({ runId: created.run.id, revision: revision.version, planHash: 'stale' }),
      /plan version or digest/i,
    )

    await agentOsService.approveRun({ runId: created.run.id, revision: revision.version, planHash: revision.hash })
    const completed = await waitForRun(agentOsService, created.run.id, ['completed', 'failed'])
    assert.equal(completed.run.status, 'completed')
    assert.equal(completed.steps[0].status, 'completed')
    assert.ok(completed.artifacts.some((item: any) => item.kind === 'report'))
    assert.ok(completed.artifacts.every((item: any) => item.producerStepId && item.producerRunId === created.run.id))
    assert.deepEqual(
      completed.events.map((item: any) => item.sequence),
      completed.events.map((item: any) => item.sequence).slice().sort((a: number, b: number) => a - b),
    )

    const persisted = await readFile(path.join(getAppPaths().dbDir, 'agent-os.json'), 'utf-8')
    assert.equal(persisted.includes('must-not-persist'), false)
    assert.equal(persisted.includes('credential:primary'), true)
    assert.equal(persisted.includes('binding.product.read.local.v1'), true)

    const tail = await agentOsService.listEvents(completed.events.at(-2)?.sequence || 0, 10)
    assert.ok(tail.length >= 1)
    assert.ok(tail.every((item) => item.sequence > (completed.events.at(-2)?.sequence || 0)))

    const interruptedConversation = await agentOsService.createConversation()
    const interrupted = await agentOsService.sendMessage({
      conversationId: interruptedConversation.id,
      content: 'Inspect the product library.',
    })
    await agentOsStore.mutate((db) => {
      const run = db.runs.find((item) => item.id === interrupted.run.id)!
      const step = db.steps.find((item) => item.runId === interrupted.run.id)!
      run.status = 'running'
      step.status = 'running'
      db.attempts.push({
        id: 'interrupted-attempt',
        runId: run.id,
        stepId: step.id,
        sequence: 1,
        capabilityId: 'Product.Read',
        capabilityVersion: 1,
        bindingId: 'binding.product.read.local.v1',
        adapterVersion: '1.0.0',
        inputSnapshot: step.input,
        idempotencyKey: 'interrupted-key',
        status: 'running',
        createdAt: Date.now(),
      })
    })
    await agentOsService.initialize()
    const recovered = await agentOsService.getRun(interrupted.run.id)
    assert.equal(recovered.run.status, 'paused')
    assert.equal(recovered.steps[0].status, 'blocked')
    assert.equal(recovered.recovery.action, 'reconcile')
    assert.equal(recovered.recovery.canResume, false)
    assert.deepEqual(recovered.recovery.blockedStepIds, [recovered.steps[0].id])
    assert.deepEqual(recovered.recovery.unresolvedAttemptIds, ['interrupted-attempt'])
    assert.ok(recovered.events.some((item) => item.type === 'agent.run.recovery_blocked'))
    await assert.rejects(
      async () => await agentOsService.resumeRun(interrupted.run.id),
      /External execution status must be reconciled before resuming/,
    )
    const stillPaused = await agentOsService.getRun(interrupted.run.id)
    assert.equal(stillPaused.run.status, 'paused')
    assert.equal(stillPaused.steps[0].status, 'blocked')

    console.log('agent-os-core.smoke: ok')
  } finally {
    planner.resetAgentPlannerTestDependencies()
    brain.resetAgentBrainTestDependencies()
    closeCloneSqlite()
    closeLivePhotoSqlite()
    await rm(root, { recursive: true, force: true })
  }
}

void main()
