import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { builtInEmployeeManifests, cloneEmployeeManifest } from './manifests'
import { buildAgentPlan, rehashAgentPlanRevision } from './planner'
import { capabilityDefinitions, resolveCapabilityBinding, resourceLockKey } from './capabilityRegistry'
import { decideAgentTurn, hasExplicitBusinessExecution } from './brain'
import { routeAgentMessage } from './messageRouter'
import { assertRunTransition, assertStepTransition, canRunTransition, canStepTransition } from './stateMachine'
import { agentOsStore } from './store'
import { livePhotoService } from '../live-photo/service'
import { materializeManagedAsset } from '../managed-assets/service'
import type {
  AgentApproval,
  AgentArtifact,
  AgentArtifactDraft,
  AgentAttachment,
  AgentConversation,
  AgentDomainEvent,
  AgentEmployeeManifest,
  AgentExecutionAttempt,
  AgentMessage,
  AgentIntentType,
  AgentPlanRevision,
  AgentRun,
  AgentRunStatus,
  AgentStepStatus,
  AgentToolResult,
  AgentWorkflowStep,
} from './types'

const activeRuns = new Map<string, Promise<void>>()
const resourceLocks = new Map<string, Promise<void>>()

function now() {
  return Date.now()
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function cleanText(value: unknown) {
  return String(value ?? '').trim()
}

function sanitizeContextValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeContextValue(item, seen))
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return undefined
  seen.add(value)
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase()
    const isReference = normalized.endsWith('ref') || normalized.endsWith('reference') || normalized.endsWith('id')
    if (!isReference && /(secret|password|token|api.?key|authorization|credential)/i.test(key)) continue
    const sanitized = sanitizeContextValue(item, seen)
    if (sanitized !== undefined) output[key] = sanitized
  }
  seen.delete(value)
  return output
}

function sanitizeContext(value: unknown) {
  const sanitized = sanitizeContextValue(value)
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? sanitized as Record<string, unknown>
    : {}
}

function runShortId(id: string) {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase()
}

function deliveryKey(runId: string, channel: string, receiveId: string) {
  return createHash('sha256').update(JSON.stringify({ runId, channel, receiveId })).digest('hex')
}

function titleFromPrompt(prompt: string) {
  const value = cleanText(prompt).replace(/\s+/g, ' ')
  return value.slice(0, 36) || 'New work task'
}

function externalArtifactId(source: string, sourceId: string) {
  return `external-${createHash('sha256').update(`${source}:${sourceId}`).digest('hex').slice(0, 24)}`
}

function livePhotoVideoPath(item: Record<string, unknown>) {
  const candidates = [item.livePhotoVideoPath, item.previewVideoPath, item.motionVideoPath]
    .map((value) => cleanText(value))
    .filter(Boolean)
  return candidates.find((item) => existsSync(item)) || ''
}

async function listRecentLivePhotoArtifacts(limit = 6): Promise<AgentArtifact[]> {
  const items = await livePhotoService.list()
  const rows = (Array.isArray(items) ? items : [])
    .map((item) => ({ item: item as unknown as Record<string, unknown>, path: livePhotoVideoPath(item as unknown as Record<string, unknown>) }))
    .filter((row) => Boolean(row.path))
    .sort((a, b) => Number(b.item.createdAt || b.item.updatedAt || 0) - Number(a.item.createdAt || a.item.updatedAt || 0))
    .slice(0, Math.max(1, Math.min(20, limit)))

  return rows.map(({ item, path }, index) => {
    const sourceId = cleanText(item.id) || path
    return {
      id: externalArtifactId('live-photo-video', sourceId),
      kind: 'video',
      name: cleanText(item.name) || cleanText(item.sourceShotLabel) || `Live Photo video ${index + 1}`,
      uri: `live-photo://${sourceId}/video`,
      localPath: path,
      mimeType: 'video/mp4',
      metadata: {
        source: 'live_photo',
        sourceId,
        productId: cleanText(item.productId) || undefined,
        createdAt: Number(item.createdAt || item.updatedAt || 0),
      },
      sourceArtifactIds: [],
      producerRunId: 'external.live-photo',
      producerStepId: sourceId,
      lifecycle: 'referenced',
      createdAt: Number(item.createdAt || item.updatedAt || now()),
    }
  })
}

function normalizeAttachment(input: Partial<AgentAttachment>): AgentAttachment | null {
  const path = cleanText(input.path)
  if (!path) return null
  const extension = path.split('.').pop()?.toLowerCase() || ''
  const mediaType = /^(png|jpe?g|webp|gif|bmp)$/.test(extension)
    ? 'image'
    : /^(mp4|mov|mkv|webm|avi|m4v)$/.test(extension)
      ? 'video'
      : 'file'
  return {
    id: cleanText(input.id) || randomUUID(),
    name: cleanText(input.name) || basename(path),
    path,
    mediaType,
  }
}

function normalizeAttachments(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeAttachment(item || {})).filter((item): item is AgentAttachment => Boolean(item))
}

function appendEvent(input: {
  emit: Parameters<Parameters<typeof agentOsStore.mutate>[0]>[1]
  type: string
  aggregateType: AgentDomainEvent['aggregateType']
  aggregateId: string
  conversationId?: string
  runId?: string
  stepId?: string
  correlationId: string
  causationId?: string
  payload?: Record<string, unknown>
}) {
  return input.emit({
    type: input.type,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    conversationId: input.conversationId,
    runId: input.runId,
    stepId: input.stepId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    payload: input.payload || {},
  })
}

function transitionRun(run: AgentRun, status: AgentRunStatus) {
  assertRunTransition(run.status, status)
  run.status = status
  run.updatedAt = now()
  if (status === 'running' && !run.startedAt) run.startedAt = now()
  if (status === 'completed' || status === 'failed' || status === 'cancelled') run.completedAt = now()
}

function transitionStep(step: AgentWorkflowStep, status: AgentStepStatus) {
  assertStepTransition(step.status, status)
  step.status = status
  step.updatedAt = now()
  if (status === 'running' && !step.startedAt) step.startedAt = now()
  if (status === 'completed' || status === 'failed' || status === 'cancelled') step.completedAt = now()
}

function idempotencyKey(run: AgentRun, step: AgentWorkflowStep, input: Record<string, unknown>) {
  return createHash('sha256')
    .update(JSON.stringify({ runId: run.id, revision: run.activeRevision, stepId: step.id, input }))
    .digest('hex')
}

async function withResourceLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  if (!key) return await task()
  const previous = resourceLocks.get(key) || Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const queued = previous.then(() => current)
  resourceLocks.set(key, queued)
  await previous
  try {
    return await task()
  } finally {
    release()
    if (resourceLocks.get(key) === queued) resourceLocks.delete(key)
  }
}

function assistantPlanMessage(run: AgentRun, steps: AgentWorkflowStep[]) {
  const revision = run.revisions.find((item) => item.version === run.activeRevision)!
  const lines = steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((step, index) => `${index + 1}. ${step.title}`)
  return `${revision.summary}\n\n${lines.join('\n')}\n\nRun: ${run.shortId}`
}

function isStepSuccessfulResult(result: AgentToolResult) {
  return result.success || (result.status === 'partial' && result.artifactIds.length > 0)
}

function recoveryAdvice(run: AgentRun, steps: AgentWorkflowStep[], attempts: AgentExecutionAttempt[]) {
  const blockedSteps = steps.filter((step) => step.status === 'blocked')
  if (run.status === 'paused' && blockedSteps.length) {
    const unresolvedExternalAttempts = attempts.filter((attempt) =>
      blockedSteps.some((step) => step.id === attempt.stepId) &&
      (attempt.status === 'running' || (!attempt.result && Boolean(attempt.id))),
    )
    return {
      action: 'reconcile' as const,
      canResume: false,
      blockedStepIds: blockedSteps.map((step) => step.id),
      unresolvedAttemptIds: unresolvedExternalAttempts.map((attempt) => attempt.id),
      reason: run.error || 'External execution status must be reconciled before resuming',
    }
  }
  if (run.status === 'paused') {
    return { action: 'resume' as const, canResume: true, blockedStepIds: [], unresolvedAttemptIds: [], reason: '' }
  }
  if (run.status === 'failed') {
    const retryable = attempts.some((attempt) => attempt.status === 'failed' && attempt.result?.retryable)
    return {
      action: 'diagnose' as const,
      canResume: false,
      blockedStepIds: blockedSteps.map((step) => step.id),
      unresolvedAttemptIds: [],
      retryable,
      reason: run.error || 'The failed run must be diagnosed before another side-effecting operation is submitted',
    }
  }
  return { action: 'none' as const, canResume: false, blockedStepIds: [], unresolvedAttemptIds: [], reason: '' }
}

async function executeStep(runId: string, stepId: string) {
  const snapshot = await agentOsStore.read()
  const run = snapshot.runs.find((item) => item.id === runId)
  const step = snapshot.steps.find((item) => item.id === stepId)
  if (!run || !step || run.status !== 'running' || step.status !== 'ready') return
  const revision = run.revisions.find((item) => item.version === run.activeRevision)
  if (!revision) throw new Error('Active run revision is missing')
  const employee = snapshot.employees.find((item) => item.id === step.employeeId && item.enabled && !item.archivedAt)
  if (!employee) {
    await failStep(run, step, 'Assigned employee is unavailable')
    return
  }
  const resolved = await resolveCapabilityBinding({
    intentType: step.intentType,
    approvedPolicy: revision.capabilityPolicySnapshot,
    projectPolicy: typeof revision.contextSnapshot.projectPolicy === 'object' ? revision.contextSnapshot.projectPolicy as Record<string, string> : undefined,
    globalPolicy: typeof revision.contextSnapshot.globalPolicy === 'object' ? revision.contextSnapshot.globalPolicy as Record<string, string> : undefined,
  })
  if (!employee.allowedCapabilities.includes(resolved.definition.id)) {
    await failStep(run, step, `Employee is not allowed to use capability ${resolved.definition.id}`)
    return
  }
  const dependencyArtifacts = snapshot.artifacts.filter((item) => step.dependsOn.includes(item.producerStepId))
  const executionInput = { ...step.input, dependencyArtifactIds: dependencyArtifacts.map((item) => item.id) }
  const sequence = snapshot.attempts.filter((item) => item.stepId === step.id).length + 1
  const attemptId = randomUUID()
  const attempt: AgentExecutionAttempt = {
    id: attemptId,
    runId: run.id,
    stepId: step.id,
    sequence,
    capabilityId: resolved.definition.id,
    capabilityVersion: resolved.definition.version,
    bindingId: resolved.binding.id,
    adapterVersion: resolved.binding.adapterVersion,
    modelSnapshot: await resolved.binding.getModelSnapshot?.(),
    inputSnapshot: executionInput,
    idempotencyKey: idempotencyKey(run, step, executionInput),
    status: 'running',
    createdAt: now(),
  }
  await agentOsStore.mutate((db, emit) => {
    const storedRun = db.runs.find((item) => item.id === run.id)
    const storedStep = db.steps.find((item) => item.id === step.id)
    if (!storedRun || !storedStep || storedRun.status !== 'running' || storedStep.status !== 'ready') return
    transitionStep(storedStep, 'running')
    storedStep.currentAttemptId = attempt.id
    db.attempts.push(attempt)
    appendEvent({
      emit,
      type: 'agent.step.started',
      aggregateType: 'step',
      aggregateId: storedStep.id,
      conversationId: storedRun.conversationId,
      runId: storedRun.id,
      stepId: storedStep.id,
      correlationId: storedRun.id,
      payload: { title: storedStep.title, intentType: storedStep.intentType, employeeId: storedStep.employeeId },
    })
  })

  const pendingArtifacts: AgentArtifact[] = []
  const registerArtifact = (draft: AgentArtifactDraft) => {
    const id = draft.id || randomUUID()
    pendingArtifacts.push({
      ...draft,
      id,
      producerRunId: run.id,
      producerStepId: step.id,
      createdAt: now(),
    })
    return id
  }
  const lockKey = resourceLockKey(resolved.binding, executionInput, dependencyArtifacts)
  let result: AgentToolResult
  try {
    result = await withResourceLock(lockKey, async () => await resolved.binding.execute(executionInput, {
      run,
      step,
      idempotencyKey: attempt.idempotencyKey,
      dependencyArtifacts,
      registerArtifact,
    }))
  } catch (error) {
    result = {
      success: false,
      status: 'failed',
      artifactIds: [],
      logs: [],
      warnings: [],
      cost: {},
      retryable: false,
      externalRefs: {},
      error: { code: 'execution_failed', message: cleanText((error as Error)?.message || error) || 'Execution failed' },
    }
  }

  await agentOsStore.mutate((db, emit) => {
    const storedRun = db.runs.find((item) => item.id === run.id)
    const storedStep = db.steps.find((item) => item.id === step.id)
    const storedAttempt = db.attempts.find((item) => item.id === attempt.id)
    if (!storedRun || !storedStep || !storedAttempt) return
    for (const artifact of pendingArtifacts) {
      if (db.artifacts.some((item) => item.id === artifact.id)) continue
      db.artifacts.push(artifact)
      if (!storedRun.artifactIds.includes(artifact.id)) storedRun.artifactIds.push(artifact.id)
      appendEvent({
        emit,
        type: 'agent.artifact.created',
        aggregateType: 'artifact',
        aggregateId: artifact.id,
        conversationId: storedRun.conversationId,
        runId: storedRun.id,
        stepId: storedStep.id,
        correlationId: storedRun.id,
        causationId: attempt.id,
        payload: { artifactId: artifact.id, kind: artifact.kind, name: artifact.name },
      })
    }
    storedAttempt.result = result
    storedAttempt.status = isStepSuccessfulResult(result) ? 'completed' : 'failed'
    storedAttempt.completedAt = now()
    transitionStep(storedStep, 'reviewing')
    appendEvent({
      emit,
      type: 'agent.step.reviewing',
      aggregateType: 'step',
      aggregateId: storedStep.id,
      conversationId: storedRun.conversationId,
      runId: storedRun.id,
      stepId: storedStep.id,
      correlationId: storedRun.id,
      causationId: attempt.id,
      payload: { title: storedStep.title, success: result.success, status: result.status, warningCount: result.warnings.length },
    })
    const shouldRepair = !isStepSuccessfulResult(result) && result.retryable && !result.artifactIds.length && storedStep.repairCount < 1
    if (shouldRepair) {
      storedStep.repairCount += 1
      transitionStep(storedStep, 'ready')
      storedStep.error = result.error?.message
      return
    }
    if (isStepSuccessfulResult(result)) {
      transitionStep(storedStep, 'completed')
      storedStep.error = result.status === 'partial' ? result.error?.message : undefined
      storedRun.warningCount += result.warnings.length + (result.status === 'partial' ? 1 : 0)
      appendEvent({
        emit,
        type: 'agent.step.completed',
        aggregateType: 'step',
        aggregateId: storedStep.id,
        conversationId: storedRun.conversationId,
        runId: storedRun.id,
        stepId: storedStep.id,
        correlationId: storedRun.id,
        causationId: attempt.id,
        payload: { title: storedStep.title, artifactIds: result.artifactIds, warnings: result.warnings },
      })
    } else {
      transitionStep(storedStep, 'failed')
      storedStep.error = result.error?.message || 'Execution failed'
      appendEvent({
        emit,
        type: 'agent.step.failed',
        aggregateType: 'step',
        aggregateId: storedStep.id,
        conversationId: storedRun.conversationId,
        runId: storedRun.id,
        stepId: storedStep.id,
        correlationId: storedRun.id,
        causationId: attempt.id,
        payload: { title: storedStep.title, error: storedStep.error, retryable: result.retryable },
      })
    }
  })
}

async function failStep(run: AgentRun, step: AgentWorkflowStep, error: string) {
  await agentOsStore.mutate((db, emit) => {
    const storedRun = db.runs.find((item) => item.id === run.id)
    const storedStep = db.steps.find((item) => item.id === step.id)
    if (!storedRun || !storedStep) return
    if (canStepTransition(storedStep.status, 'failed')) transitionStep(storedStep, 'failed')
    storedStep.error = error
    appendEvent({ emit, type: 'agent.step.failed', aggregateType: 'step', aggregateId: storedStep.id, conversationId: storedRun.conversationId, runId: storedRun.id, stepId: storedStep.id, correlationId: storedRun.id, payload: { error } })
  })
}

async function finishRun(runId: string) {
  await agentOsStore.mutate((db, emit) => {
    const run = db.runs.find((item) => item.id === runId)
    if (!run || run.status !== 'running') return
    const steps = db.steps.filter((item) => item.runId === run.id && item.revision === run.activeRevision)
    transitionRun(run, 'reviewing')
    appendEvent({ emit, type: 'agent.run.reviewing', aggregateType: 'run', aggregateId: run.id, conversationId: run.conversationId, runId: run.id, correlationId: run.id })
    const failedSteps = steps.filter((item) => item.status === 'failed' || item.status === 'blocked')
    const completed = failedSteps.length === 0
    if (!completed) {
      transitionRun(run, 'failed')
      run.error = failedSteps.map((item) => `${item.title}: ${item.error || 'failed'}`).join('; ')
    } else {
      transitionRun(run, 'completed')
    }
    const artifacts = db.artifacts.filter((item) => item.producerRunId === run.id)
    const message: AgentMessage = {
      id: randomUUID(),
      conversationId: run.conversationId,
      runId: run.id,
      role: 'assistant',
      content: completed
        ? `Run ${run.shortId} completed with ${artifacts.length} artifacts${run.warningCount ? ` and ${run.warningCount} warnings` : ''}.`
        : `Run ${run.shortId} failed: ${run.error || 'one or more steps failed'}.`,
      attachments: [],
      createdAt: now(),
    }
    db.messages.push(message)
    appendEvent({
      emit,
      type: completed ? 'agent.run.completed' : 'agent.run.failed',
      aggregateType: 'run',
      aggregateId: run.id,
      conversationId: run.conversationId,
      runId: run.id,
      correlationId: run.id,
      payload: { status: run.status, artifactIds: artifacts.map((item) => item.id), error: run.error },
    })
  })
}

async function executeRun(runId: string) {
  while (true) {
    const db = await agentOsStore.read()
    const run = db.runs.find((item) => item.id === runId)
    if (!run || run.status !== 'running') return
    const steps = db.steps.filter((item) => item.runId === run.id && item.revision === run.activeRevision)
    const failedIds = new Set(steps.filter((item) => item.status === 'failed' || item.status === 'blocked').map((item) => item.id))
    const completedIds = new Set(steps.filter((item) => item.status === 'completed' || item.status === 'skipped').map((item) => item.id))
    const pendingUpdates = steps.filter((item) => item.status === 'pending' && item.dependsOn.every((id) => completedIds.has(id)))
    const blockedUpdates = steps.filter((item) => item.status === 'pending' && item.dependsOn.some((id) => failedIds.has(id)))
    if (pendingUpdates.length || blockedUpdates.length) {
      await agentOsStore.mutate((stored) => {
        for (const item of pendingUpdates) {
          const step = stored.steps.find((candidate) => candidate.id === item.id)
          if (step?.status === 'pending') transitionStep(step, 'ready')
        }
        for (const item of blockedUpdates) {
          const step = stored.steps.find((candidate) => candidate.id === item.id)
          if (step?.status === 'pending') {
            transitionStep(step, 'blocked')
            step.error = 'Dependency failed'
          }
        }
      })
      continue
    }
    const ready = steps.filter((item) => item.status === 'ready').slice(0, 2)
    if (ready.length) {
      await Promise.all(ready.map((item) => executeStep(run.id, item.id)))
      continue
    }
    if (steps.some((item) => item.status === 'running' || item.status === 'reviewing')) return
    await finishRun(run.id)
    return
  }
}

function scheduleRun(runId: string) {
  if (activeRuns.has(runId)) return
  const task = executeRun(runId)
    .catch(async (error) => {
      await agentOsStore.mutate((db, emit) => {
        const run = db.runs.find((item) => item.id === runId)
        if (!run || !canRunTransition(run.status, 'failed')) return
        transitionRun(run, 'failed')
        run.error = cleanText((error as Error)?.message || error) || 'Run failed'
        appendEvent({ emit, type: 'agent.run.failed', aggregateType: 'run', aggregateId: run.id, conversationId: run.conversationId, runId: run.id, correlationId: run.id, payload: { error: run.error } })
      })
    })
    .finally(() => activeRuns.delete(runId))
  activeRuns.set(runId, task)
}

async function findPendingRunByShortId(conversationId: string, shortId: string) {
  const db = await agentOsStore.read()
  const normalized = cleanText(shortId).toUpperCase()
  return db.runs
    .filter((item) => item.conversationId === conversationId && item.status === 'waiting_approval')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .find((item) => !normalized || item.shortId === normalized) || null
}

function extractFeishuText(body: Record<string, unknown>) {
  if (typeof body.text === 'string') return body.text.trim()
  const event = body.event as any
  const content = event?.message?.content
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      return cleanText(parsed?.text)
    } catch {
      return content.trim()
    }
  }
  return ''
}

function extractFeishuIdentity(body: Record<string, unknown>) {
  const event = body.event as any
  const senderId = event?.sender?.sender_id || {}
  return {
    userId: cleanText(body.userId || senderId.open_id || senderId.user_id || 'feishu-user'),
    conversationId: cleanText(body.conversationId || event?.message?.chat_id || body.chatId || 'feishu-chat'),
  }
}

export const agentOsService = {
  async initialize() {
    await agentOsStore.mutate((db, emit) => {
      for (const run of db.runs.filter((item) => item.status === 'running')) {
        const interrupted = db.steps.filter((item) =>
          item.runId === run.id &&
          item.revision === run.activeRevision &&
          (item.status === 'running' || item.status === 'reviewing'),
        )
        if (!interrupted.length) continue
        transitionRun(run, 'paused')
        run.error = 'External execution status must be reconciled before resuming'
        for (const step of interrupted) {
          if (step.status === 'running') transitionStep(step, 'reviewing')
          transitionStep(step, 'blocked')
          step.error = run.error
        }
        appendEvent({
          emit,
          type: 'agent.run.recovery_blocked',
          aggregateType: 'run',
          aggregateId: run.id,
          conversationId: run.conversationId,
          runId: run.id,
          correlationId: run.id,
          payload: { stepIds: interrupted.map((item) => item.id), reason: run.error },
        })
      }
    })
    const db = await agentOsStore.read()
    for (const run of db.runs.filter((item) => item.status === 'running')) scheduleRun(run.id)
  },

  async listEmployees() {
    const db = await agentOsStore.read()
    return db.employees.filter((item) => !item.archivedAt).sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.createdAt - b.createdAt)
  },

  async createEmployee(input: Partial<AgentEmployeeManifest> & { name: string; sourceEmployeeId?: string }) {
    const db = await agentOsStore.read()
    const source = db.employees.find((item) => item.id === input.sourceEmployeeId) || builtInEmployeeManifests[0]
    const employee = cloneEmployeeManifest(source, randomUUID(), cleanText(input.name) || 'Custom employee')
    employee.description = cleanText(input.description) || employee.description
    employee.enabled = typeof input.enabled === 'boolean' ? input.enabled : true
    employee.color = cleanText(input.color) || employee.color
    employee.icon = cleanText(input.icon) || employee.icon
    employee.allowedCapabilities = Array.isArray(input.allowedCapabilities)
      ? input.allowedCapabilities.filter((id) => capabilityDefinitions.some((item) => item.id === id))
      : employee.allowedCapabilities
    employee.allowedIntents = Array.isArray(input.allowedIntents)
      ? input.allowedIntents.filter((intent) => capabilityDefinitions.some((item) => item.intentType === intent))
      : employee.allowedIntents
    employee.defaultContext = input.defaultContext ? sanitizeContext(input.defaultContext) : employee.defaultContext
    employee.plannerPolicy = cleanText(input.plannerPolicy) || employee.plannerPolicy
    employee.reviewerPolicy = cleanText(input.reviewerPolicy) || employee.reviewerPolicy
    return await agentOsStore.mutate((stored, emit) => {
      stored.employees.push(employee)
      appendEvent({ emit, type: 'agent.employee.created', aggregateType: 'employee', aggregateId: employee.id, correlationId: employee.id, payload: { name: employee.name } })
      return employee
    })
  },

  async updateEmployee(input: Partial<AgentEmployeeManifest> & { id: string }) {
    return await agentOsStore.mutate((db, emit) => {
      const employee = db.employees.find((item) => item.id === input.id)
      if (!employee) throw new Error('Employee does not exist')
      const allowedCapabilities = Array.isArray(input.allowedCapabilities)
        ? input.allowedCapabilities.filter((id) => capabilityDefinitions.some((item) => item.id === id))
        : employee.allowedCapabilities
      const allowedIntents = Array.isArray(input.allowedIntents)
        ? input.allowedIntents.filter((intent) => capabilityDefinitions.some((item) => item.intentType === intent))
        : employee.allowedIntents
      Object.assign(employee, {
        name: cleanText(input.name) || employee.name,
        description: cleanText(input.description) || employee.description,
        enabled: typeof input.enabled === 'boolean' ? input.enabled : employee.enabled,
        color: cleanText(input.color) || employee.color,
        icon: cleanText(input.icon) || employee.icon,
        allowedCapabilities,
        allowedIntents,
        defaultContext: input.defaultContext && typeof input.defaultContext === 'object' ? sanitizeContext(input.defaultContext) : employee.defaultContext,
        plannerPolicy: cleanText(input.plannerPolicy) || employee.plannerPolicy,
        reviewerPolicy: cleanText(input.reviewerPolicy) || employee.reviewerPolicy,
        version: employee.version + 1,
        updatedAt: now(),
      })
      appendEvent({ emit, type: 'agent.employee.updated', aggregateType: 'employee', aggregateId: employee.id, correlationId: employee.id, payload: { name: employee.name, version: employee.version } })
      return employee
    })
  },

  async duplicateEmployee(input: { id: string; name?: string }) {
    const db = await agentOsStore.read()
    const source = db.employees.find((item) => item.id === input.id)
    if (!source) throw new Error('Employee does not exist')
    return await this.createEmployee({ name: cleanText(input.name) || `${source.name} copy`, sourceEmployeeId: source.id })
  },

  async archiveEmployee(id: string) {
    return await agentOsStore.mutate((db, emit) => {
      const employee = db.employees.find((item) => item.id === id)
      if (!employee) throw new Error('Employee does not exist')
      if (employee.builtIn) throw new Error('Built-in employees cannot be archived')
      employee.archivedAt = now()
      employee.enabled = false
      employee.updatedAt = now()
      appendEvent({ emit, type: 'agent.employee.archived', aggregateType: 'employee', aggregateId: employee.id, correlationId: employee.id })
      return { ok: true as const }
    })
  },

  async createConversation(input?: {
    title?: string
    employeeId?: string
    channel?: 'desktop' | 'feishu'
    externalUserId?: string
    externalConversationId?: string
    context?: Record<string, unknown>
    hermesStoredSessionId?: string
  }) {
    const timestamp = now()
    const conversation: AgentConversation = {
      id: randomUUID(),
      title: cleanText(input?.title) || 'New work task',
      channel: input?.channel === 'feishu' ? 'feishu' : 'desktop',
      externalUserId: cleanText(input?.externalUserId) || undefined,
      externalConversationId: cleanText(input?.externalConversationId) || undefined,
      employeeId: cleanText(input?.employeeId) || 'employee.supervisor',
      hermesStoredSessionId: cleanText(input?.hermesStoredSessionId) || undefined,
      context: sanitizeContext(input?.context),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return await agentOsStore.mutate((db, emit) => {
      db.conversations.push(conversation)
      appendEvent({ emit, type: 'agent.conversation.created', aggregateType: 'conversation', aggregateId: conversation.id, conversationId: conversation.id, correlationId: conversation.id, payload: { channel: conversation.channel } })
      return conversation
    })
  },

  async linkHermesSession(input: { conversationId: string; storedSessionId: string }) {
    return await agentOsStore.mutate((db, emit) => {
      const conversation = db.conversations.find((item) => item.id === input.conversationId)
      if (!conversation) throw new Error('Conversation does not exist')
      const storedSessionId = cleanText(input.storedSessionId)
      if (!storedSessionId) throw new Error('Hermes stored session ID is required')
      const linkedSessionIds = new Set([
        ...(conversation.hermesStoredSessionId ? [conversation.hermesStoredSessionId] : []),
        ...(conversation.hermesStoredSessionIds || []),
        storedSessionId,
      ])
      conversation.hermesStoredSessionId ||= storedSessionId
      conversation.hermesStoredSessionIds = Array.from(linkedSessionIds)
      conversation.updatedAt = now()
      appendEvent({
        emit,
        type: 'agent.conversation.hermes_linked',
        aggregateType: 'conversation',
        aggregateId: conversation.id,
        conversationId: conversation.id,
        correlationId: conversation.id,
        payload: { storedSessionId, linkedSessionCount: conversation.hermesStoredSessionIds.length },
      })
      return conversation
    })
  },

  async findConversationByHermesSession(storedSessionId: string) {
    const id = cleanText(storedSessionId)
    if (!id) return undefined
    const db = await agentOsStore.read()
    return db.conversations.find((conversation) => (
      conversation.hermesStoredSessionId === id
      || (conversation.hermesStoredSessionIds || []).includes(id)
    ))
  },

  async createIntentRun(input: {
    conversationId?: string
    employeeId?: string
    intentType: AgentIntentType
    request: string
    stepInput?: Record<string, unknown>
    context?: Record<string, unknown>
    requireApproval?: boolean
    idempotencyKey?: string
  }) {
    const requestKey = cleanText(input.idempotencyKey).slice(0, 200)
    return await withResourceLock(requestKey ? `IntentRequest:${requestKey}` : '', async () => {
    const snapshot = await agentOsStore.read()
    const existingRun = requestKey ? snapshot.runs.find((item) => item.requestKey === requestKey) : undefined
    if (existingRun) {
      const existingStep = snapshot.steps.find((item) => item.runId === existingRun.id && item.revision === existingRun.activeRevision)
      if (existingStep?.intentType !== input.intentType) throw new Error('Idempotency key is already assigned to another business intent')
      return await this.getRun(existingRun.id)
    }
    const employeeId = cleanText(input.employeeId) || 'employee.supervisor'
    const employee = snapshot.employees.find((item) => item.id === employeeId && item.enabled && !item.archivedAt)
    if (!employee) throw new Error('The assigned employee is unavailable')
    if (!employee.allowedIntents.includes(input.intentType)) throw new Error('The employee cannot perform this intent')
    const resolved = await resolveCapabilityBinding({ intentType: input.intentType, approvedPolicy: {} })
    if (!employee.allowedCapabilities.includes(resolved.definition.id)) throw new Error('The employee cannot use this capability')
    let conversation = input.conversationId
      ? snapshot.conversations.find((item) => item.id === input.conversationId)
      : undefined
    if (!conversation) {
      conversation = await this.createConversation({
        employeeId: employee.id,
        title: titleFromPrompt(input.request),
        context: input.context,
      })
    }
    const timestamp = now()
    const runId = randomUUID()
    const stepId = randomUUID()
    const request = cleanText(input.request) || resolved.definition.title
    const contextSnapshot = sanitizeContext({ ...conversation.context, ...input.context })
    const revision: AgentPlanRevision = {
      version: 1,
      summary: request,
      requestSnapshot: request,
      contextSnapshot,
      capabilityPolicySnapshot: { [resolved.definition.id]: resolved.binding.id },
      workflowVersion: 1,
      quantity: Math.max(1, Number(input.stepInput?.quantity || 1)),
      budget: {},
      promptSnapshot: request,
      stepIds: [stepId],
      hash: '',
      createdAt: timestamp,
    }
    revision.hash = rehashAgentPlanRevision(revision)
    const needsApproval = input.requireApproval ?? resolved.binding.lockMode === 'write'
    const run: AgentRun = {
      id: runId,
      shortId: runShortId(runId),
      conversationId: conversation.id,
      employeeId: employee.id,
      ...(requestKey ? { requestKey } : {}),
      status: needsApproval ? 'waiting_approval' : 'running',
      activeRevision: 1,
      revisions: [revision],
      artifactIds: [],
      warningCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(needsApproval ? {} : { startedAt: timestamp }),
    }
    const step: AgentWorkflowStep = {
      id: stepId,
      runId,
      revision: 1,
      order: 0,
      title: resolved.definition.title,
      intentType: input.intentType,
      intentVersion: 1,
      input: sanitizeContext({ request, ...contextSnapshot, ...input.stepInput }),
      dependsOn: [],
      employeeId: employee.id,
      status: 'pending',
      repairCount: 0,
      updatedAt: timestamp,
    }
    await agentOsStore.mutate((db, emit) => {
      db.runs.push(run)
      db.steps.push(step)
      db.messages.push({
        id: randomUUID(),
        conversationId: conversation!.id,
        runId,
        role: 'user',
        content: request,
        attachments: [],
        createdAt: timestamp,
      })
      const storedConversation = db.conversations.find((item) => item.id === conversation!.id)
      if (storedConversation) storedConversation.updatedAt = timestamp
      appendEvent({
        emit,
        type: needsApproval ? 'agent.run.waiting_approval' : 'agent.run.started',
        aggregateType: 'run',
        aggregateId: run.id,
        conversationId: run.conversationId,
        runId: run.id,
        correlationId: run.id,
        payload: { revision: 1, planHash: revision.hash, summary: revision.summary, stepCount: 1 },
      })
    })
    if (!needsApproval) scheduleRun(run.id)
    return await this.getRun(run.id)
    })
  },

  async waitForRun(runId: string, timeoutMs = 7_200_000) {
    const deadline = Date.now() + Math.max(1_000, timeoutMs)
    while (Date.now() < deadline) {
      const detail = await this.getRun(runId)
      if (['completed', 'failed', 'cancelled'].includes(detail.run.status)) return detail
      await new Promise((resolve) => setTimeout(resolve, 750))
    }
    throw new Error('Business run timed out')
  },

  async listConversations(limit = 30) {
    const db = await agentOsStore.read()
    return db.conversations.slice().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, Math.max(1, Math.min(100, Number(limit || 30))))
  },

  async getConversation(id: string) {
    const db = await agentOsStore.read()
    const conversation = db.conversations.find((item) => item.id === id)
    if (!conversation) throw new Error('Conversation does not exist')
    const messages = db.messages.filter((item) => item.conversationId === id).sort((a, b) => a.createdAt - b.createdAt)
    const artifactIds = new Set(messages.flatMap((item) => item.artifactIds || []))
    return {
      conversation,
      messages,
      runs: db.runs.filter((item) => item.conversationId === id).sort((a, b) => b.createdAt - a.createdAt),
      artifacts: db.artifacts.filter((item) => artifactIds.has(item.id)),
    }
  },

  async sendMessage(input: {
    conversationId: string
    content: string
    attachments?: AgentAttachment[]
    context?: Record<string, unknown>
  }) {
    const prompt = cleanText(input.content)
    if (!prompt) throw new Error('Enter a work objective')
    const rawAttachments = normalizeAttachments(input.attachments)
    const snapshot = await agentOsStore.read()
    const conversation = snapshot.conversations.find((item) => item.id === input.conversationId)
    if (!conversation) throw new Error('Conversation does not exist')
    const attachments = await Promise.all(
      rawAttachments.map(async (attachment) => ({
        ...attachment,
        path: await materializeManagedAsset({
          sourcePath: attachment.path,
          module: 'agent-os',
          ownerId: conversation.id,
          assetId: attachment.id,
        }),
      })),
    )
    const employee = snapshot.employees.find((item) => item.id === conversation.employeeId && item.enabled && !item.archivedAt)
    if (!employee) throw new Error('The assigned employee is unavailable')
    const projectContext = conversation.context.projectContext && typeof conversation.context.projectContext === 'object'
      ? conversation.context.projectContext as Record<string, unknown>
      : {}
    const requestContext = sanitizeContext(input.context)
    const conversationArtifactIds = new Set(
      snapshot.messages
        .filter((item) => item.conversationId === conversation.id)
        .flatMap((item) => item.artifactIds || []),
    )
    const conversationArtifacts = snapshot.artifacts.filter((item) => conversationArtifactIds.has(item.id) && item.localPath && existsSync(item.localPath))
    const conversationVideo = [...conversationArtifacts].reverse().find((item) => item.kind === 'video')
    let mergedContext = sanitizeContext({
      quantity: 1,
      ...employee.defaultContext,
      ...projectContext,
      ...conversation.context,
      artifactIds: conversationArtifacts.map((item) => item.id),
      artifactPaths: conversationArtifacts.map((item) => item.localPath),
      videoPath: conversationVideo?.localPath,
      ...requestContext,
    })
    const pendingClarification = conversation.context.pendingClarification && typeof conversation.context.pendingClarification === 'object'
      ? conversation.context.pendingClarification as Record<string, unknown>
      : null
    let workflowPrompt = prompt
    let resolvedClarification: { key: string; value: unknown } | null = null
    if (pendingClarification) {
      const responseCode = cleanText(pendingClarification.responseCode)
      const originalRequest = cleanText(pendingClarification.request)
      if (responseCode === 'output_directory' && (/^[a-z]:[\\/]/i.test(prompt) || /^\\\\/.test(prompt))) {
        mergedContext = { ...mergedContext, outputDir: prompt }
        workflowPrompt = originalRequest || prompt
        resolvedClarification = { key: 'outputDir', value: prompt }
      } else if (responseCode === 'publish_account' && prompt) {
        mergedContext = { ...mergedContext, publishAccountId: prompt }
        workflowPrompt = originalRequest || prompt
        resolvedClarification = { key: 'publishAccountId', value: prompt }
      } else if (responseCode === 'source_video' && attachments.some((item) => item.mediaType === 'video')) {
        workflowPrompt = originalRequest || prompt
        resolvedClarification = { key: 'sourceVideoAttached', value: true }
      } else if (responseCode === 'source_artifact' && (attachments.length || conversationArtifacts.length)) {
        mergedContext = {
          ...mergedContext,
          artifactPaths: attachments.length ? attachments.map((item) => item.path) : conversationArtifacts.map((item) => item.localPath),
          videoPath: attachments.find((item) => item.mediaType === 'video')?.path || conversationVideo?.localPath,
        }
        workflowPrompt = originalRequest || prompt
        resolvedClarification = { key: 'sourceArtifactSelected', value: true }
      }
    }
    let preferredIntents: AgentWorkflowStep['intentType'][] | undefined
    let preferredSummary: string | undefined
    let modelDecision: Awaited<ReturnType<typeof decideAgentTurn>> = null
    let decisionBrainUnavailable = false
    try {
      modelDecision = await withTimeout(
        decideAgentTurn({
          request: resolvedClarification ? workflowPrompt : prompt,
          employee,
          messages: snapshot.messages.filter((item) => item.conversationId === conversation.id),
          attachments,
          context: mergedContext,
          artifacts: conversationArtifacts,
        }),
        25_000,
        'Agent decision timed out',
      )
    } catch (error) {
      decisionBrainUnavailable = true
      console.warn('[agent-os] decision brain unavailable, using deterministic routing', cleanText((error as Error)?.message || error))
    }
    if (modelDecision?.action === 'workflow') {
      preferredIntents = modelDecision.intents
      preferredSummary = modelDecision.summary
      mergedContext = sanitizeContext({ ...mergedContext, ...modelDecision.context })
    }
    const routedRequest = resolvedClarification ? workflowPrompt : prompt
    const fallbackRoute = routeAgentMessage({ content: routedRequest, attachments, context: mergedContext })
    const safeFallbackRoute = decisionBrainUnavailable && fallbackRoute.kind === 'workflow' && !hasExplicitBusinessExecution(routedRequest)
      ? { kind: 'direct' as const, responseCode: 'assistant_unavailable' as const }
      : fallbackRoute
    const route = modelDecision?.action === 'reply'
      ? { kind: 'model_reply' as const, content: modelDecision.response }
      : modelDecision?.action === 'clarify'
        ? { kind: 'model_clarification' as const, content: modelDecision.response }
        : modelDecision?.action === 'artifact_query'
          ? { kind: 'artifact_query' as const, artifactType: modelDecision.artifactType, limit: modelDecision.limit, content: modelDecision.response }
          : modelDecision?.action === 'workflow'
            ? fallbackRoute.kind === 'workflow' ? { kind: 'workflow' as const } : fallbackRoute
            : safeFallbackRoute
    if (route.kind !== 'workflow') {
      const artifacts = route.kind === 'artifact_query'
        ? route.artifactType === 'conversation_artifacts'
          ? conversationArtifacts.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 'limit' in route ? route.limit : 6)
          : await listRecentLivePhotoArtifacts('limit' in route ? route.limit : 6)
        : []
      const responseCode = route.kind === 'artifact_query'
        ? route.artifactType === 'conversation_artifacts'
          ? artifacts.length ? 'existing_results' : 'existing_empty'
          : artifacts.length ? 'artifact_results' : 'artifact_empty'
        : route.kind === 'model_reply' || route.kind === 'model_clarification'
          ? undefined
          : route.responseCode
      const responseParams = route.kind === 'artifact_query' ? { count: artifacts.length } : undefined
      const fallbackContent: Record<string, string> = {
        greeting: 'Hello. Tell me what you want to create, inspect, publish, or retrieve.',
        capabilities: 'I can inspect products, prepare materials, manage model identities and production templates, create videos and Live Photos, generate subtitles, publish approved videos, and retrieve existing results.',
        thanks: 'You are welcome. Send the next objective when you are ready.',
        assistant_unavailable: 'The intelligent assistant is temporarily unavailable. I did not create a workflow from this conversational request. Please try again.',
        artifact_results: `I found ${artifacts.length} recent Live Photo videos. Open any result below.`,
        artifact_empty: 'I could not find a completed Live Photo video on this device.',
        existing_results: `I found ${artifacts.length} existing results in this conversation.`,
        existing_empty: 'There are no existing results in this conversation yet.',
        output_directory: 'Which output directory should I use for the export?',
        publish_account: 'Which approved publishing account should I use?',
        source_video: 'Please attach or select the source video before I create this workflow.',
        source_artifact: 'Please attach a result or ask me to show existing results before exporting.',
      }
      const timestamp = now()
      const userMessage: AgentMessage = {
        id: randomUUID(),
        conversationId: conversation.id,
        role: 'user',
        content: prompt,
        attachments,
        createdAt: timestamp,
      }
      const assistantMessage: AgentMessage = {
        id: randomUUID(),
        conversationId: conversation.id,
        role: 'assistant',
        content: route.kind === 'model_reply' || route.kind === 'model_clarification'
          ? route.content
          : route.kind === 'artifact_query' && 'content' in route && route.content && artifacts.length
            ? route.content
            : fallbackContent[responseCode!],
        attachments: [],
        artifactIds: artifacts.map((item) => item.id),
        responseCode,
        responseParams,
        createdAt: timestamp + 1,
      }
      return await agentOsStore.mutate((db, emit) => {
        db.messages.push(userMessage, assistantMessage)
        for (const artifact of artifacts) {
          const existing = db.artifacts.find((item) => item.id === artifact.id)
          if (existing) Object.assign(existing, artifact)
          else db.artifacts.push(artifact)
        }
        const storedConversation = db.conversations.find((item) => item.id === conversation.id)!
        storedConversation.title = storedConversation.title === 'New work task' ? titleFromPrompt(prompt) : storedConversation.title
        let nextConversationContext = storedConversation.context
        if (resolvedClarification) {
          const { pendingClarification: _pendingClarification, ...contextWithoutPending } = nextConversationContext
          nextConversationContext = {
            ...contextWithoutPending,
            ...(['sourceVideoAttached', 'sourceArtifactSelected'].includes(resolvedClarification.key)
              ? {}
              : { [resolvedClarification.key]: resolvedClarification.value }),
          }
        }
        if (route.kind === 'clarification') {
          nextConversationContext = {
            ...nextConversationContext,
            pendingClarification: { responseCode: route.responseCode, request: resolvedClarification ? workflowPrompt : prompt },
          }
        }
        storedConversation.context = sanitizeContext(nextConversationContext)
        storedConversation.updatedAt = timestamp + 1
        appendEvent({
          emit,
          type: route.kind === 'artifact_query' ? 'agent.conversation.artifacts_returned' : 'agent.conversation.replied',
          aggregateType: 'conversation',
          aggregateId: conversation.id,
          conversationId: conversation.id,
          correlationId: assistantMessage.id,
          payload: { responseCode, artifactIds: assistantMessage.artifactIds || [] },
        })
        return {
          mode: route.kind === 'model_reply'
            ? 'direct'
            : route.kind === 'model_clarification'
              ? 'clarification'
              : route.kind,
          run: null,
          steps: [],
          message: assistantMessage,
          artifacts,
        }
      })
    }
    const runId = randomUUID()
    const timestamp = now()
    const run: AgentRun = {
      id: runId,
      shortId: runShortId(runId),
      conversationId: conversation.id,
      employeeId: employee.id,
      status: 'draft',
      activeRevision: 1,
      revisions: [],
      artifactIds: [],
      warningCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    assertRunTransition(run.status, 'planning')
    run.status = 'planning'
    const userMessage: AgentMessage = {
      id: randomUUID(),
      conversationId: conversation.id,
      runId: run.id,
      role: 'user',
      content: prompt,
      attachments,
      createdAt: timestamp,
    }
    await agentOsStore.mutate((db, emit) => {
      db.messages.push(userMessage)
      db.runs.push(run)
      const storedConversation = db.conversations.find((item) => item.id === conversation.id)!
      storedConversation.title = storedConversation.title === 'New work task' ? titleFromPrompt(prompt) : storedConversation.title
      if (resolvedClarification) {
        const { pendingClarification: _pendingClarification, ...contextWithoutPending } = storedConversation.context
        storedConversation.context = sanitizeContext({
          ...contextWithoutPending,
          ...(['sourceVideoAttached', 'sourceArtifactSelected'].includes(resolvedClarification.key) ? {} : { [resolvedClarification.key]: resolvedClarification.value }),
        })
      }
      storedConversation.updatedAt = timestamp
      appendEvent({ emit, type: 'agent.run.planning', aggregateType: 'run', aggregateId: run.id, conversationId: conversation.id, runId: run.id, correlationId: run.id, payload: { requestLength: prompt.length } })
    })
    try {
      const planned = await buildAgentPlan({
        runId: run.id,
        revision: 1,
        prompt: workflowPrompt,
        context: mergedContext,
        attachments,
        employee,
        preferredIntents,
        preferredSummary,
      })
      const projectPolicy = typeof mergedContext.projectPolicy === 'object' ? mergedContext.projectPolicy as Record<string, string> : undefined
      const globalPolicy = typeof mergedContext.globalPolicy === 'object' ? mergedContext.globalPolicy as Record<string, string> : undefined
      for (const step of planned.steps) {
        const resolved = await resolveCapabilityBinding({
          intentType: step.intentType,
          approvedPolicy: planned.revision.capabilityPolicySnapshot,
          projectPolicy,
          globalPolicy,
        })
        planned.revision.capabilityPolicySnapshot[resolved.definition.id] = resolved.binding.id
      }
      planned.revision.hash = rehashAgentPlanRevision(planned.revision)
      return await agentOsStore.mutate((db, emit) => {
        const storedRun = db.runs.find((item) => item.id === run.id)!
        storedRun.revisions.push(planned.revision)
        db.steps.push(...planned.steps)
        transitionRun(storedRun, 'waiting_approval')
        const assistantMessage: AgentMessage = {
          id: randomUUID(),
          conversationId: conversation.id,
          runId: run.id,
          role: 'assistant',
          content: assistantPlanMessage(storedRun, planned.steps),
          attachments: [],
          createdAt: now(),
        }
        db.messages.push(assistantMessage)
        appendEvent({ emit, type: 'agent.run.waiting_approval', aggregateType: 'run', aggregateId: run.id, conversationId: conversation.id, runId: run.id, correlationId: run.id, payload: { revision: 1, planHash: planned.revision.hash, summary: planned.revision.summary, stepCount: planned.steps.length } })
        return { mode: 'workflow' as const, run: storedRun, steps: planned.steps, message: assistantMessage, artifacts: [] }
      })
    } catch (error) {
      await agentOsStore.mutate((db, emit) => {
        const storedRun = db.runs.find((item) => item.id === run.id)!
        transitionRun(storedRun, 'failed')
        storedRun.error = cleanText((error as Error)?.message || error)
        appendEvent({ emit, type: 'agent.run.failed', aggregateType: 'run', aggregateId: run.id, conversationId: conversation.id, runId: run.id, correlationId: run.id, payload: { error: storedRun.error } })
      })
      throw error
    }
  },

  async getRun(runId: string) {
    const db = await agentOsStore.read()
    const run = db.runs.find((item) => item.id === runId)
    if (!run) throw new Error('Run does not exist')
    const steps = db.steps.filter((item) => item.runId === run.id && item.revision === run.activeRevision).sort((a, b) => a.order - b.order)
    const attempts = db.attempts.filter((item) => item.runId === run.id)
    return {
      run,
      steps,
      attempts,
      artifacts: db.artifacts.filter((item) => item.producerRunId === run.id),
      approvals: db.approvals.filter((item) => item.runId === run.id),
      events: db.events.filter((item) => item.runId === run.id).slice(-300),
      recovery: recoveryAdvice(run, steps, attempts),
    }
  },

  async approveRun(input: { runId: string; revision: number; planHash: string; channel?: 'desktop' | 'feishu'; approverId?: string }) {
    const result = await agentOsStore.mutate((db, emit) => {
      const run = db.runs.find((item) => item.id === input.runId)
      if (!run) throw new Error('Run does not exist')
      if (run.status !== 'waiting_approval') throw new Error('Run is not waiting for approval')
      const revision = run.revisions.find((item) => item.version === input.revision)
      if (!revision || revision.version !== run.activeRevision || revision.hash !== input.planHash) throw new Error('The plan version or digest has changed')
      const approval: AgentApproval = {
        id: randomUUID(),
        runId: run.id,
        revision: revision.version,
        planHash: revision.hash,
        status: 'approved',
        channel: input.channel === 'feishu' ? 'feishu' : 'desktop',
        approverId: cleanText(input.approverId) || 'desktop-local',
        createdAt: now(),
      }
      db.approvals.push(approval)
      transitionRun(run, 'running')
      appendEvent({ emit, type: 'agent.run.approved', aggregateType: 'run', aggregateId: run.id, conversationId: run.conversationId, runId: run.id, correlationId: run.id, payload: { revision: revision.version, planHash: revision.hash, channel: approval.channel } })
      return run
    })
    scheduleRun(result.id)
    return result
  },

  async rejectRun(input: { runId: string; revision: number; planHash: string; channel?: 'desktop' | 'feishu'; approverId?: string }) {
    return await agentOsStore.mutate((db, emit) => {
      const run = db.runs.find((item) => item.id === input.runId)
      if (!run) throw new Error('Run does not exist')
      if (run.status !== 'waiting_approval') throw new Error('Run is not waiting for approval')
      const revision = run.revisions.find((item) => item.version === input.revision)
      if (!revision || revision.hash !== input.planHash) throw new Error('The plan version or digest has changed')
      db.approvals.push({ id: randomUUID(), runId: run.id, revision: revision.version, planHash: revision.hash, status: 'rejected', channel: input.channel === 'feishu' ? 'feishu' : 'desktop', approverId: cleanText(input.approverId) || 'desktop-local', createdAt: now() })
      transitionRun(run, 'cancelled')
      for (const step of db.steps.filter((item) => item.runId === run.id && canStepTransition(item.status, 'cancelled'))) transitionStep(step, 'cancelled')
      appendEvent({ emit, type: 'agent.run.rejected', aggregateType: 'run', aggregateId: run.id, conversationId: run.conversationId, runId: run.id, correlationId: run.id, payload: { revision: revision.version } })
      return run
    })
  },

  async pauseRun(runId: string) {
    return await agentOsStore.mutate((db, emit) => {
      const run = db.runs.find((item) => item.id === runId)
      if (!run) throw new Error('Run does not exist')
      transitionRun(run, 'paused')
      appendEvent({ emit, type: 'agent.run.paused', aggregateType: 'run', aggregateId: run.id, conversationId: run.conversationId, runId: run.id, correlationId: run.id })
      return run
    })
  },

  async resumeRun(runId: string) {
    const run = await agentOsStore.mutate((db, emit) => {
      const item = db.runs.find((candidate) => candidate.id === runId)
      if (!item) throw new Error('Run does not exist')
      const blockedSteps = db.steps.filter((step) => step.runId === item.id && step.revision === item.activeRevision && step.status === 'blocked')
      if (blockedSteps.length) throw new Error(item.error || 'External execution status must be reconciled before resuming')
      transitionRun(item, 'running')
      appendEvent({ emit, type: 'agent.run.resumed', aggregateType: 'run', aggregateId: item.id, conversationId: item.conversationId, runId: item.id, correlationId: item.id })
      return item
    })
    scheduleRun(run.id)
    return run
  },

  async cancelRun(runId: string) {
    return await agentOsStore.mutate((db, emit) => {
      const run = db.runs.find((item) => item.id === runId)
      if (!run) throw new Error('Run does not exist')
      transitionRun(run, 'cancelled')
      for (const step of db.steps.filter((item) => item.runId === run.id && canStepTransition(item.status, 'cancelled'))) transitionStep(step, 'cancelled')
      appendEvent({ emit, type: 'agent.run.cancelled', aggregateType: 'run', aggregateId: run.id, conversationId: run.conversationId, runId: run.id, correlationId: run.id })
      return run
    })
  },

  async listArtifacts(input?: { runId?: string; conversationId?: string }) {
    const db = await agentOsStore.read()
    const runIds = input?.conversationId
      ? new Set(db.runs.filter((item) => item.conversationId === input.conversationId).map((item) => item.id))
      : null
    return db.artifacts.filter((item) => (!input?.runId || item.producerRunId === input.runId) && (!runIds || runIds.has(item.producerRunId)))
  },

  async getArtifact(id: string) {
    const db = await agentOsStore.read()
    const artifact = db.artifacts.find((item) => item.id === id)
    if (!artifact) throw new Error('Artifact does not exist')
    return artifact
  },

  subscribe(listener: (events: AgentDomainEvent[]) => void) {
    return agentOsStore.subscribe(listener)
  },

  async listEvents(afterSequence?: number, limit?: number) {
    return await agentOsStore.listEvents(afterSequence, limit)
  },

  async handleFeishuOfficialEvent(body: Record<string, unknown>) {
    const rawText = extractFeishuText(body)
    const identity = extractFeishuIdentity(body)
    const db = await agentOsStore.read()
    let conversation = db.conversations.find((item) => item.channel === 'feishu' && item.externalConversationId === identity.conversationId && item.externalUserId === identity.userId)
    if (!conversation) {
      conversation = await this.createConversation({ channel: 'feishu', externalUserId: identity.userId, externalConversationId: identity.conversationId, employeeId: 'employee.supervisor' })
    }
    const approvalMatch = /^(\u786e\u8ba4|\u62d2\u7edd)\s*([A-Z0-9]{0,8})$/i.exec(rawText)
    if (approvalMatch) {
      const run = await findPendingRunByShortId(conversation.id, approvalMatch[2])
      if (!run) return { ok: true, matched: true, actions: [{ type: 'text', text: 'No run is waiting for approval.' }] }
      const revision = run.revisions.find((item) => item.version === run.activeRevision)!
      if (approvalMatch[1] === '\u786e\u8ba4') {
        await this.approveRun({ runId: run.id, revision: revision.version, planHash: revision.hash, channel: 'feishu', approverId: identity.userId })
        return { ok: true, matched: true, runId: run.id, actions: [{ type: 'text', text: `Run ${run.shortId} started.` }] }
      }
      await this.rejectRun({ runId: run.id, revision: revision.version, planHash: revision.hash, channel: 'feishu', approverId: identity.userId })
      return { ok: true, matched: true, runId: run.id, actions: [{ type: 'text', text: `Run ${run.shortId} was cancelled.` }] }
    }
    const prefixMatch = /^(?:AI\u5458\u5de5|\u5458\u5de5)\s*[:\uFF1A]\s*([\s\S]+)$/i.exec(rawText)
    if (!prefixMatch) return { ok: true, matched: false, actions: [] }
    const result = await this.sendMessage({ conversationId: conversation.id, content: prefixMatch[1], context: typeof body.context === 'object' && body.context ? body.context as Record<string, unknown> : {} })
    if (!result.run) {
      const actions: Array<Record<string, unknown>> = [{ type: 'text', text: result.message.content }]
      for (const artifact of result.artifacts) {
        if (artifact.kind === 'video' && artifact.localPath) actions.push({ type: 'video', path: artifact.localPath, name: artifact.name })
        else if (artifact.kind === 'image' && artifact.localPath) actions.push({ type: 'image', path: artifact.localPath, name: artifact.name })
      }
      return { ok: true, matched: true, actions }
    }
    return {
      ok: true,
      matched: true,
      runId: result.run.id,
      actions: [{ type: 'text', text: `${result.message.content}\n\nReply with \u201c\u786e\u8ba4 ${result.run.shortId}\u201d to start or \u201c\u62d2\u7edd ${result.run.shortId}\u201d to cancel.` }],
    }
  },

  async buildFeishuFinalActions(runId: string) {
    const detail = await this.getRun(runId)
    if (detail.run.status !== 'completed' && detail.run.status !== 'failed') {
      return [{ type: 'text', text: `Run ${detail.run.shortId} is ${detail.run.status}.` }]
    }
    const actions: Array<Record<string, unknown>> = []
    actions.push({ type: 'text', text: detail.run.status === 'completed' ? `Run ${detail.run.shortId} completed.` : `Run ${detail.run.shortId} failed: ${detail.run.error || 'one or more steps failed'}.` })
    for (const artifact of detail.artifacts) {
      if (artifact.kind === 'video' && artifact.localPath) actions.push({ type: 'video', path: artifact.localPath, name: artifact.name })
      else if (artifact.kind === 'image' && artifact.localPath) actions.push({ type: 'image', path: artifact.localPath, name: artifact.name })
      else actions.push({ type: 'text', text: `Artifact: ${artifact.name}` })
    }
    return actions
  },

  async claimFeishuFinalDelivery(input: { runId: string; receiveId: string }) {
    const key = deliveryKey(input.runId, 'feishu', cleanText(input.receiveId))
    return await agentOsStore.mutate((db, emit) => {
      const run = db.runs.find((item) => item.id === input.runId)
      if (!run) throw new Error('Run does not exist')
      const related = db.events.filter((item) => item.runId === run.id && item.payload.deliveryKey === key)
      if (related.some((item) => item.type === 'agent.delivery.completed')) {
        return { claimed: false as const, alreadySent: true as const, deliveryKey: key }
      }
      const latest = related.at(-1)
      if (latest?.type === 'agent.delivery.started' && now() - latest.createdAt < 5 * 60_000) {
        return { claimed: false as const, alreadySent: false as const, deliveryKey: key }
      }
      appendEvent({
        emit,
        type: 'agent.delivery.started',
        aggregateType: 'run',
        aggregateId: run.id,
        conversationId: run.conversationId,
        runId: run.id,
        correlationId: key,
        payload: { deliveryKey: key, channel: 'feishu', receiveId: cleanText(input.receiveId) },
      })
      return { claimed: true as const, alreadySent: false as const, deliveryKey: key }
    })
  },

  async completeFeishuFinalDelivery(input: { runId: string; deliveryKey: string; resultCount: number }) {
    return await agentOsStore.mutate((db, emit) => {
      const run = db.runs.find((item) => item.id === input.runId)
      if (!run) throw new Error('Run does not exist')
      appendEvent({
        emit,
        type: 'agent.delivery.completed',
        aggregateType: 'run',
        aggregateId: run.id,
        conversationId: run.conversationId,
        runId: run.id,
        correlationId: input.deliveryKey,
        payload: { deliveryKey: input.deliveryKey, channel: 'feishu', resultCount: input.resultCount },
      })
      return { ok: true as const }
    })
  },

  async failFeishuFinalDelivery(input: { runId: string; deliveryKey: string; error: string }) {
    return await agentOsStore.mutate((db, emit) => {
      const run = db.runs.find((item) => item.id === input.runId)
      if (!run) return { ok: false as const }
      appendEvent({
        emit,
        type: 'agent.delivery.failed',
        aggregateType: 'run',
        aggregateId: run.id,
        conversationId: run.conversationId,
        runId: run.id,
        correlationId: input.deliveryKey,
        payload: { deliveryKey: input.deliveryKey, channel: 'feishu', error: cleanText(input.error) },
      })
      return { ok: true as const }
    })
  },
}
