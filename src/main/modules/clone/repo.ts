import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readFile, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import {
  decryptRuntimeString,
  encryptRuntimeString,
  isRuntimeEncryptionAvailable,
} from '../../lib/runtimeCrypto'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import { getAppPaths } from '../../lib/paths'
import {
  canInitializeCloneSqlite,
  getCloneSqliteUnavailableReason,
  initializeCloneSqlite,
  isCloneSqliteEmpty,
  readCloneProjectByIdFromSqlite,
  readCloneProjectsFromSqlite,
  readCloneDbFromSqlite,
  removeCloneProjectFromSqlite,
  upsertCloneProjectInSqlite,
  writeCloneDbToSqlite,
} from './sqlite'
import type {
  CloneGenerationPolicy,
  CloneGenerationQueueJob,
  CloneGenerationQueueOptions,
  CloneExecutionBlueprint,
  CloneHookType,
  CloneLocale,
  ClonePipelineStatus,
  CloneProject,
  CloneProjectGroup,
  CloneProductType,
  CloneRunMode,
  CloneRealismStyle,
  CloneRhythmProfile,
  CloneStrength,
  CloneVisualStyleProfile,
  AiProviderName,
  ImageProviderName,
  ModelCredentials,
  ModelIdentityLibraryItem,
  CloneScriptFramework,
  ClonePromptCacheEntry,
  CloneFrameCacheEntry,
  CloneCloudClipCacheEntry,
  CloneShotVideoOutput,
  ApifoxHubCredentials,
} from './types'
import { buildReferenceLock } from './prompt'

type CloneDbShape = {
  projects: CloneProject[]
  projectGroups?: CloneProjectGroup[]
  modelIdentityLibrary?: ModelIdentityLibraryItem[]
}

type CloneSettingsShape = {
  encryptedCredentials?: string
  plaintextCredentials?: ModelCredentials
  runtimeOptions?: CloneRuntimeOptions
}

export type CloneRuntimeOptions = {
  storyboardFrameConcurrency: number
  globalStoryboardFrameConcurrency: number
}

const DEFAULT_CLONE_RUNTIME_OPTIONS: CloneRuntimeOptions = {
  storyboardFrameConcurrency: 3,
  globalStoryboardFrameConcurrency: 2,
}

const cloneDbPath = () => join(getAppPaths().dbDir, 'clone-projects.json')
const cloneSettingsPath = () => join(getAppPaths().dbDir, 'clone-settings.json')
const legacyUserDataCloneDbPath = () => join(getAppPaths().userData, 'videogenerate', 'db', 'clone-projects.json')
let cloneDbMutationQueue: Promise<unknown> = Promise.resolve()

export type CloneSqliteReadyState = {
  migrated: boolean
  source: 'sqlite' | 'json_import' | 'empty'
}

function now() {
  return Date.now()
}

function defaultCloneProjectTitle(createdAt: number) {
  const d = new Date(Number(createdAt || now()))
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `未命名复刻任务 ${date} ${time}`
}

function normalizeProjectGroup(item: any): CloneProjectGroup {
  return {
    id: String(item?.id ?? randomUUID()),
    name: String(item?.name ?? '').trim() || '未命名分组',
    createdAt: Number(item?.createdAt ?? now()),
    updatedAt: Number(item?.updatedAt ?? now()),
    sortOrder: Number(item?.sortOrder ?? 0),
  }
}

function sanitizeCloneDbText(raw: string) {
  return raw.replace(/(^\s*"[^"\r\n]*)\?(\r?\n\s*[\],])/gm, '$1。"$2')
}

function normalizeOptionalTrimmedField(item: any, key: string) {
  if (!Object.prototype.hasOwnProperty.call(item ?? {}, key)) return undefined
  if (item?.[key] === undefined) return undefined
  const value = String(item?.[key] ?? '').trim()
  return value || undefined
}

async function readCloneDbFileAt(filePath: string): Promise<CloneDbShape> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    try {
      return JSON.parse(raw) as CloneDbShape
    } catch {
      const sanitized = sanitizeCloneDbText(raw)
      return JSON.parse(sanitized) as CloneDbShape
    }
  } catch {
    return { projects: [], projectGroups: [], modelIdentityLibrary: [] }
  }
}

async function readCloneDbFile(): Promise<CloneDbShape> {
  return await readCloneDbFileAt(cloneDbPath())
}

function normalizeIdentityLibraryItem(item: any): ModelIdentityLibraryItem {
  const imagePaths = Array.isArray(item?.imagePaths) ? item.imagePaths.map(String).filter(Boolean) : []
  const rawName = String(item?.name ?? '').trim()
  const normalizedName = /^AI\?+\s+\d{3}$/.test(rawName) ? rawName.replace(/^AI\?+/, 'AI模特') : rawName
  return {
    id: String(item?.id ?? randomUUID()),
    createdAt: Number(item?.createdAt ?? now()),
    updatedAt: Number(item?.updatedAt ?? now()),
    status:
      item?.status === 'generating' || item?.status === 'done' || item?.status === 'failed'
        ? item.status
        : 'idle',
    name: normalizedName || 'AI模特',
    productType:
      item?.productType === 'earrings' ||
      item?.productType === 'phone_case' ||
      item?.productType === 'clothes' ||
      item?.productType === 'toy'
        ? item.productType
        : 'general',
    market: String(item?.market ?? 'Southeast Asian market'),
    gender: String(item?.gender ?? 'female'),
    ageRange: String(item?.ageRange ?? '20-28'),
    hairStyle: String(item?.hairStyle ?? 'natural dark hair'),
    skinTone: String(item?.skinTone ?? 'natural warm skin tone'),
    outfitStyle: String(item?.outfitStyle ?? 'clean casual outfit'),
    mood: String(item?.mood ?? 'calm confident friendly'),
    sceneStyle: String(item?.sceneStyle ?? 'soft daylight social commerce studio'),
    description: String(item?.description ?? '').trim(),
    imagePaths,
    coverImagePath: String(item?.coverImagePath ?? imagePaths[0] ?? '').trim() || undefined,
    model: String(item?.model ?? '').trim() || undefined,
    error: String(item?.error ?? '').trim() || undefined,
  }
}

function toLegacyPack(item: ModelIdentityLibraryItem): any {
  return {
    ...item,
    confirmed: item.status === 'done',
  }
}

function snapshotFromLibraryItem(item: ModelIdentityLibraryItem): ModelIdentityLibraryItem {
  return normalizeIdentityLibraryItem(item)
}

function isStaleImageTaskId(value: unknown) {
  const taskId = String(value ?? '').trim().toLowerCase()
  return taskId.startsWith('gpt_frame_') || taskId.startsWith('mj_')
}

function isCompletedShotVideoStatus(status: unknown) {
  const normalized = String(status ?? '').trim().toLowerCase()
  return normalized === 'done' || normalized === 'remote_succeeded_pending_download'
}

function isRunningShotVideoStatus(status: unknown) {
  const normalized = String(status ?? '').trim().toLowerCase()
  return normalized === 'remote_running' || normalized === 'remote_pending' || normalized === 'submitting' || normalized === 'creating' || normalized === 'generating'
}

function isActiveShotVideoStatus(status: unknown) {
  const normalized = String(status ?? '').trim().toLowerCase()
  return (
    isRunningShotVideoStatus(normalized) ||
    normalized === 'downloading' ||
    normalized === 'remote_succeeded_pending_download' ||
    normalized === 'download_queued'
  )
}

function isPendingRemoteShotVideoStatus(status: unknown) {
  const normalized = String(status ?? '').trim().toLowerCase()
  return normalized === 'created' || normalized === 'queued' || normalized === 'pending' || normalized === 'processing' || normalized === 'running'
}

function shotVideoStatusPriority(status: unknown) {
  const normalized = String(status ?? '').trim().toLowerCase()
  switch (normalized) {
    case 'done':
      return 90
    case 'downloading':
    case 'remote_succeeded_pending_download':
    case 'download_queued':
      return 80
    case 'remote_running':
      return 70
    case 'remote_pending':
    case 'poll_queued':
      return 60
    case 'submitting':
    case 'submit_queued':
    case 'creating':
    case 'generating':
      return 50
    case 'failed_terminal':
      return 40
    case 'failed_retryable':
    case 'failed':
    case 'polling_timeout':
      return 30
    case 'idle':
      return 10
    default:
      return 0
  }
}

function shouldPreferExistingShotVideoState(existing: any, incoming: any, resolvedTaskId?: string) {
  const existingUpdatedAt = Number(existing?.updatedAt ?? 0)
  const incomingUpdatedAt = Number(incoming?.updatedAt ?? 0)
  const existingTaskId = String(existing?.taskId ?? '').trim()
  const incomingTaskId = String(incoming?.taskId ?? '').trim()
  const incomingSourceEvent = String(incoming?.sourceEvent ?? '').trim().toLowerCase()
  const incomingIsReplacementReset = incomingSourceEvent === 'force_regenerate_reset'
  const sameTask = Boolean(existingTaskId) && Boolean(incomingTaskId) && existingTaskId === incomingTaskId
  const taskChanged = Boolean(existingTaskId && incomingTaskId && existingTaskId !== incomingTaskId)
  const existingPriority = shotVideoStatusPriority(existing?.status)
  const incomingPriority = shotVideoStatusPriority(incoming?.status)
  const incomingRemoteStatus = String(incoming?.remoteStatus ?? incoming?.remoteRaw?.status ?? '').trim().toLowerCase()
  const incomingKeepsRemoteInFlightWithoutTask =
    !incomingIsReplacementReset &&
    Boolean(existingTaskId) &&
    !incomingTaskId &&
    (
      isRunningShotVideoStatus(incoming?.status) ||
      incomingRemoteStatus === 'created' ||
      incomingRemoteStatus === 'queued' ||
      incomingRemoteStatus === 'pending' ||
      incomingRemoteStatus === 'processing' ||
      incomingRemoteStatus === 'running'
    )
  if (incomingIsReplacementReset) return false
  if (incomingKeepsRemoteInFlightWithoutTask) return true
  if (taskChanged && resolvedTaskId === existingTaskId && existingUpdatedAt >= incomingUpdatedAt) return true
  if (incomingUpdatedAt <= 0 || existingUpdatedAt <= 0) return false
  if (incomingUpdatedAt > existingUpdatedAt) return false
  if (taskChanged) return true
  if (incomingPriority < existingPriority) return true
  if (sameTask && incomingPriority === existingPriority && incomingUpdatedAt < existingUpdatedAt) return true
  return false
}

function mergeShotVideoOutputsForPersistence(current: any[] | undefined, incoming: any[] | undefined) {
  const currentList = Array.isArray(current) ? current : []
  const incomingList = Array.isArray(incoming) ? incoming : []
  const currentMap = new Map(currentList.map((item) => [String(item?.shotId ?? ''), item]))
  const incomingMap = new Map(incomingList.map((item) => [String(item?.shotId ?? ''), item]))
  const orderedShotIds = [
    ...incomingList.map((item) => String(item?.shotId ?? '')).filter(Boolean),
    ...currentList
      .map((item) => String(item?.shotId ?? ''))
      .filter((shotId) => Boolean(shotId) && !incomingMap.has(shotId)),
  ]
  return orderedShotIds.map((shotId) => {
    const item = incomingMap.get(shotId)
    const existing = currentMap.get(shotId)
    if (!item) return existing
    if (!existing) return item
    const incomingTaskId = String(item?.taskId ?? '').trim()
    const existingTaskId = String(existing?.taskId ?? '').trim()
    const hasExplicitTaskReset = Object.prototype.hasOwnProperty.call(item, 'taskId') && item?.taskId === undefined
    const hasExplicitVideoPathReset = Object.prototype.hasOwnProperty.call(item, 'videoPath') && item?.videoPath === undefined
    const hasExplicitLocalPathReset = Object.prototype.hasOwnProperty.call(item, 'localPath') && item?.localPath === undefined
    const hasExplicitVideoUrlReset = Object.prototype.hasOwnProperty.call(item, 'videoUrl') && item?.videoUrl === undefined
    const hasExplicitProviderReset = Object.prototype.hasOwnProperty.call(item, 'provider') && item?.provider === undefined
    const hasExplicitModelReset = Object.prototype.hasOwnProperty.call(item, 'model') && item?.model === undefined
    const hasPendingReplacementMarkers =
      Boolean(item?.previousTaskIds?.length) ||
      Boolean(item?.submissionStartedAt) ||
      Boolean(item?.submissionLockedUntil) ||
      isPendingRemoteShotVideoStatus(item?.remoteStatus) ||
      isPendingRemoteShotVideoStatus(item?.remoteRaw?.status)
    const incomingRemoteStatus = String(item?.remoteStatus ?? item?.remoteRaw?.status ?? '').trim().toLowerCase()
    const incomingSourceEvent = String(item?.sourceEvent ?? '').trim()
    const incomingSourceEventLower = incomingSourceEvent.toLowerCase()
    const incomingIsForceRegenerateReset = incomingSourceEventLower === 'force_regenerate_reset'
    const existingHasStickyTaskBinding =
      Boolean(existingTaskId) &&
      (
        isRunningShotVideoStatus(existing?.status) ||
        existing?.status === 'failed_retryable' ||
        isCompletedShotVideoStatus(existing?.status) ||
        isPendingRemoteShotVideoStatus(existing?.remoteStatus) ||
        isPendingRemoteShotVideoStatus(existing?.remoteRaw?.status) ||
        Boolean(String(existing?.videoUrl ?? '').trim()) ||
        Boolean(String(existing?.videoPath ?? '').trim()) ||
        Boolean(String(existing?.localPath ?? '').trim())
      )
    const incomingLosesStickyTaskBinding =
      !incomingIsForceRegenerateReset &&
      !hasExplicitTaskReset &&
      !incomingTaskId &&
      existingHasStickyTaskBinding &&
      !String(item?.videoUrl ?? '').trim() &&
      !String(item?.videoPath ?? '').trim() &&
      !String(item?.localPath ?? '').trim()
    const existingErrorText = String(existing?.error ?? '').trim().toLowerCase()
    const incomingStatus = String(item?.status ?? '').trim().toLowerCase()
    const incomingStartsReplacementRun =
      (hasPendingReplacementMarkers || incomingIsForceRegenerateReset) &&
      (
        incomingIsForceRegenerateReset ||
        incomingStatus === 'submitting' ||
        incomingStatus === 'remote_pending' ||
        incomingStatus === 'remote_running' ||
        incomingSourceEvent === 'segment_submit_started' ||
        incomingSourceEvent === 'segment_submit_succeeded' ||
        incomingSourceEvent === 'force_regenerate_submit' ||
        incomingSourceEvent === 'storyboard_video_batch_submit_started'
      )
    const existingSourceEvent = String(existing?.sourceEvent ?? '').trim().toLowerCase()
    const existingIsForceRegenerateReset = existingSourceEvent === 'force_regenerate_reset'
    const existingIsRetryLimitTerminal =
      String(existing?.status ?? '').trim().toLowerCase() === 'failed_terminal' &&
      existingErrorText.includes('[retry_limit]')
    const incomingKeepsRemoteInFlightWithoutTask =
      !incomingIsForceRegenerateReset &&
      !hasExplicitTaskReset &&
      !incomingTaskId &&
      Boolean(existingTaskId) &&
      (
        isRunningShotVideoStatus(item?.status) ||
        incomingRemoteStatus === 'created' ||
        incomingRemoteStatus === 'queued' ||
        incomingRemoteStatus === 'pending' ||
        incomingRemoteStatus === 'processing' ||
        incomingRemoteStatus === 'running'
      )
    const explicitTaskResetLooksStale =
      hasExplicitTaskReset &&
      !incomingTaskId &&
      Boolean(existingTaskId) &&
      !incomingIsForceRegenerateReset &&
      !Boolean(item?.previousTaskIds?.length) &&
      !Boolean(item?.submissionStartedAt) &&
      !Boolean(item?.submissionLockedUntil) &&
      !String(item?.videoUrl ?? '').trim() &&
      !String(item?.videoPath ?? '').trim() &&
      !String(item?.localPath ?? '').trim() &&
      (
        isRunningShotVideoStatus(item?.status) ||
        incomingRemoteStatus === 'created' ||
        incomingRemoteStatus === 'queued' ||
        incomingRemoteStatus === 'pending' ||
        incomingRemoteStatus === 'processing' ||
        incomingRemoteStatus === 'running' ||
        incomingSourceEvent === 'segment_submit_started' ||
        incomingSourceEvent === 'storyboard_video_batch_submit_started' ||
        incomingSourceEvent === 'segment_submit_succeeded'
      )
    const shouldClearCompletedArtifactsForPendingReplacement =
      (hasPendingReplacementMarkers || incomingIsForceRegenerateReset) &&
      (
        incomingIsForceRegenerateReset ||
        hasExplicitVideoPathReset ||
        hasExplicitLocalPathReset ||
        hasExplicitVideoUrlReset ||
        isRunningShotVideoStatus(item?.status) ||
        isPendingRemoteShotVideoStatus(item?.remoteStatus) ||
        isPendingRemoteShotVideoStatus(item?.remoteRaw?.status)
      )
    const candidateTaskId = incomingStartsReplacementRun
      ? (incomingTaskId && !isStaleImageTaskId(incomingTaskId) ? incomingTaskId : undefined)
      : hasExplicitTaskReset
        ? undefined
        : incomingTaskId && !isStaleImageTaskId(incomingTaskId)
          ? incomingTaskId
          : existingTaskId && !isStaleImageTaskId(existingTaskId)
            ? existingTaskId
            : incomingTaskId || existingTaskId || undefined
    const preferExistingState = shouldPreferExistingShotVideoState(existing, item, candidateTaskId)
    const shouldForcePreferExistingState =
      (incomingLosesStickyTaskBinding || incomingKeepsRemoteInFlightWithoutTask || explicitTaskResetLooksStale) &&
      !incomingIsForceRegenerateReset &&
      !String(item?.error ?? '').trim()
    const shouldPreferIncomingReplacementState = incomingStartsReplacementRun && existingIsRetryLimitTerminal
    const resolvedTaskId = incomingStartsReplacementRun
      ? candidateTaskId
      : hasExplicitTaskReset
        ? explicitTaskResetLooksStale
          ? existingTaskId || undefined
          : undefined
        : (preferExistingState || incomingLosesStickyTaskBinding || explicitTaskResetLooksStale) &&
            existingTaskId &&
            !shouldPreferIncomingReplacementState
          ? existingTaskId
          : candidateTaskId
    const existingHasCompletedArtifacts =
      Boolean(existing?.videoPath || existing?.localPath || existing?.videoUrl)
    const incomingHasLocalVideoArtifacts =
      Boolean(String(item?.videoPath ?? '').trim()) || Boolean(String(item?.localPath ?? '').trim())
    const shouldPreserveCompletedState =
      existingHasCompletedArtifacts &&
      isCompletedShotVideoStatus(existing?.status) &&
      isActiveShotVideoStatus(item?.status) &&
      !incomingIsForceRegenerateReset &&
      !incomingHasLocalVideoArtifacts &&
      !hasPendingReplacementMarkers &&
      !hasExplicitTaskReset &&
      !hasExplicitVideoPathReset &&
      !hasExplicitLocalPathReset &&
      (!incomingTaskId || !existingTaskId || incomingTaskId === existingTaskId)
    const shouldReplaceCompletedStateWithNewTask =
      existingHasCompletedArtifacts &&
      isCompletedShotVideoStatus(existing?.status) &&
      isActiveShotVideoStatus(item?.status) &&
      Boolean(existingTaskId) &&
      Boolean(incomingTaskId) &&
      incomingTaskId !== existingTaskId
    const shouldPreserveArtifactsFromNewerTask =
      Boolean(existingTaskId) &&
      Boolean(incomingTaskId) &&
      existingTaskId !== incomingTaskId &&
      Boolean(String(existing?.videoPath ?? existing?.localPath ?? existing?.videoUrl ?? '').trim()) &&
      Number(existing?.updatedAt ?? 0) >= Number(item?.updatedAt ?? 0)
    return {
      ...existing,
      ...item,
      taskId: resolvedTaskId,
      provider:
        shouldPreferIncomingReplacementState
          ? (hasExplicitProviderReset ? undefined : String(item?.provider ?? '').trim() ? item.provider : undefined)
          : hasExplicitProviderReset
            ? undefined
            : String(item?.provider ?? '').trim()
              ? item.provider
              : existing?.provider,
      model:
        shouldPreferIncomingReplacementState
          ? (hasExplicitModelReset ? undefined : String(item?.model ?? '').trim() ? item.model : undefined)
          : hasExplicitModelReset
            ? undefined
            : String(item?.model ?? '').trim()
              ? item.model
              : existing?.model,
      videoUrl:
        shouldPreferIncomingReplacementState || shouldClearCompletedArtifactsForPendingReplacement
          ? undefined
          : shouldPreserveArtifactsFromNewerTask
            ? existing?.videoUrl
          : hasExplicitVideoUrlReset
            ? undefined
            : String(item?.videoUrl ?? '').trim()
              ? item.videoUrl
              : existing?.videoUrl,
      videoPath:
        shouldPreferIncomingReplacementState || shouldClearCompletedArtifactsForPendingReplacement
          ? undefined
          : shouldPreserveArtifactsFromNewerTask
            ? existing?.videoPath
          : hasExplicitVideoPathReset
            ? undefined
            : String(item?.videoPath ?? '').trim()
              ? item.videoPath
              : existing?.videoPath,
      localPath:
        shouldPreferIncomingReplacementState || shouldClearCompletedArtifactsForPendingReplacement
          ? undefined
          : shouldPreserveArtifactsFromNewerTask
            ? existing?.localPath
          : hasExplicitLocalPathReset
            ? undefined
            : String(item?.localPath ?? '').trim()
              ? item.localPath
              : existing?.localPath,
      status:
        shouldReplaceCompletedStateWithNewTask
          ? item?.status ?? existing?.status
          : shouldPreferIncomingReplacementState
            ? item?.status ?? existing?.status
          : shouldPreserveCompletedState || preferExistingState || shouldForcePreferExistingState
          ? existing?.status
          : item?.status ?? existing?.status,
      remoteStatus:
        shouldReplaceCompletedStateWithNewTask
          ? item?.remoteStatus ?? existing?.remoteStatus
          : shouldPreferIncomingReplacementState
            ? item?.remoteStatus ?? existing?.remoteStatus
          : shouldPreserveCompletedState || preferExistingState || shouldForcePreferExistingState
          ? existing?.remoteStatus ?? item?.remoteStatus
          : item?.remoteStatus ?? existing?.remoteStatus,
      completedAt:
        shouldPreferIncomingReplacementState || shouldClearCompletedArtifactsForPendingReplacement
          ? undefined
          : shouldReplaceCompletedStateWithNewTask
            ? item?.completedAt ?? existing?.completedAt
            : shouldPreserveCompletedState
            ? existing?.completedAt ?? item?.completedAt
            : item?.completedAt ?? existing?.completedAt,
      updatedAt:
        preferExistingState && !shouldPreferIncomingReplacementState && Number(existing?.updatedAt ?? 0) > Number(item?.updatedAt ?? 0)
          ? existing?.updatedAt
          : item?.updatedAt ?? existing?.updatedAt,
      sourceEvent:
        ((preferExistingState ||
          shouldForcePreferExistingState ||
          (incomingStartsReplacementRun && !incomingTaskId) ||
          (existingIsForceRegenerateReset && !incomingTaskId)) &&
          !shouldPreferIncomingReplacementState &&
          String(existing?.sourceEvent ?? '').trim())
          ? existing?.sourceEvent
          : item?.sourceEvent ?? existing?.sourceEvent,
    }
  }).filter(Boolean)
}

function mergeBlueprintShotsForPersistence(currentBlueprint: any, incomingBlueprint: any) {
  const currentShots = Array.isArray(currentBlueprint?.shots) ? currentBlueprint.shots : []
  const incomingShots = Array.isArray(incomingBlueprint?.shots) ? incomingBlueprint.shots : []
  if (!incomingBlueprint || !Array.isArray(incomingBlueprint?.shots)) {
    return currentBlueprint ?? incomingBlueprint
  }
  const currentMap = new Map(currentShots.map((item: any) => [String(item?.id ?? ''), item]))
  return {
    ...currentBlueprint,
    ...incomingBlueprint,
    shots: incomingShots.map((item: any) => {
      const existing = currentMap.get(String(item?.id ?? '')) as any
      if (!existing) return item
      const incomingTaskId = String(item?.generatedTaskId ?? '').trim()
      const existingTaskId = String(existing?.generatedTaskId ?? '').trim()
      const hasExplicitTaskReset = Object.prototype.hasOwnProperty.call(item, 'generatedTaskId') && item?.generatedTaskId === undefined
      const hasExplicitClipPathReset = Object.prototype.hasOwnProperty.call(item, 'generatedClipPath') && item?.generatedClipPath === undefined
      const hasExplicitProviderReset = Object.prototype.hasOwnProperty.call(item, 'generatedProvider') && item?.generatedProvider === undefined
      const hasExplicitModelReset = Object.prototype.hasOwnProperty.call(item, 'generatedModel') && item?.generatedModel === undefined
      const incomingStatus = String(item?.status ?? '').trim().toLowerCase()
      const existingStatus = String(existing?.status ?? '').trim().toLowerCase()
      const incomingHasRemoteInFlightState =
        incomingStatus === 'generating' ||
        incomingStatus === 'submitting' ||
        incomingStatus === 'remote_pending' ||
        incomingStatus === 'remote_running'
      const existingHasRemoteTaskBinding =
        Boolean(existingTaskId) &&
        (
          existingStatus === 'generating' ||
          existingStatus === 'submitting' ||
          existingStatus === 'remote_pending' ||
          existingStatus === 'remote_running' ||
          existingStatus === 'failed_retryable' ||
          Boolean(String(existing?.generatedClipPath ?? '').trim())
        )
      const shouldKeepClipPath =
        !hasExplicitClipPathReset &&
        (
          incomingStatus === '' ||
          incomingStatus === 'done' ||
          incomingStatus === 'success' ||
          incomingStatus === 'completed'
        )
      const incomingLooksLikeInFlightSnapshotWithoutTask =
        !incomingTaskId &&
        (
          incomingStatus === 'generating' ||
          incomingStatus === 'submitting' ||
          incomingStatus === 'remote_pending' ||
          incomingStatus === 'remote_running'
        )
      const explicitTaskResetLooksStale =
        hasExplicitTaskReset &&
        incomingLooksLikeInFlightSnapshotWithoutTask &&
        !hasExplicitClipPathReset &&
        !hasExplicitProviderReset &&
        !hasExplicitModelReset
      const incomingHasReplacementTaskBinding =
        Boolean(incomingTaskId) &&
        Boolean(existingTaskId) &&
        incomingTaskId !== existingTaskId &&
        incomingHasRemoteInFlightState
      const shouldKeepExistingTaskBinding =
        !incomingHasReplacementTaskBinding &&
        !incomingTaskId &&
        existingHasRemoteTaskBinding &&
        (incomingHasRemoteInFlightState || explicitTaskResetLooksStale)
      return {
        ...existing,
        ...item,
        generatedTaskId:
          shouldKeepExistingTaskBinding
            ? existingTaskId || undefined
          : hasExplicitTaskReset && !explicitTaskResetLooksStale
            ? undefined
            : incomingTaskId && !isStaleImageTaskId(incomingTaskId)
            ? incomingTaskId
            : existingTaskId && !isStaleImageTaskId(existingTaskId)
              ? existingTaskId
              : incomingTaskId || existingTaskId || undefined,
        generatedProvider: hasExplicitProviderReset ? undefined : String(item?.generatedProvider ?? '').trim() ? item.generatedProvider : existing?.generatedProvider,
        generatedModel: hasExplicitModelReset ? undefined : String(item?.generatedModel ?? '').trim() ? item.generatedModel : existing?.generatedModel,
        generatedClipPath:
          hasExplicitClipPathReset
            ? undefined
            : String(item?.generatedClipPath ?? '').trim()
              ? item.generatedClipPath
              : shouldKeepClipPath
                ? existing?.generatedClipPath
                : undefined,
      }
    }),
  }
}

function linkedLegacyPacks(snapshot?: ModelIdentityLibraryItem, selectedId?: string) {
  if (!snapshot || !selectedId) return []
  return [
    {
      ...toLegacyPack(snapshot),
      id: selectedId,
      confirmed: snapshot.status === 'done',
    },
  ]
}

function nextIdentityName(items: ModelIdentityLibraryItem[]) {
  const used = new Set(items.map((x) => String(x.name || '').trim()))
  let i = 1
  while (true) {
    const name = `AI模特 ${String(i).padStart(3, '0')}`
    if (!used.has(name)) return name
    i += 1
  }
}

function defaultPolicy(): CloneGenerationPolicy {
  return {
    qualityPriority: 'high',
    fallbackChain: ['seedance', 'kling', 'grsai'],
    concurrency: 4,
    retries: 2,
    qualityGate: {
      enabled: true,
      minDurationRatio: 0.6,
      maxDurationRatio: 1.6,
      maxBlackFrameRatio: 0.45,
      minShortSide: 720,
      requireAudio: false,
    },
  }
}

function defaultQueueOptions(): CloneGenerationQueueOptions {
  return {
    maxConcurrentCloudJobs: 4,
    maxConcurrentSubmitJobs: 2,
    maxConcurrentPollJobs: 4,
    maxConcurrentDownloadJobs: 1,
    pollIntervalMs: 2000,
    perShotTimeoutMs: 8 * 60 * 1000,
  }
}

function defaultScriptFramework(): CloneScriptFramework {
  return {
    hook: '',
    painPoint: '',
    solution: '',
    proof: '',
    offer: '',
    cta: '',
  }
}

function defaultRhythmProfile(): CloneRhythmProfile {
  return {
    avgShotDurationSec: 1.5,
    cutDensity: 'medium',
    first3SecShotCount: 1,
    hasFastCut: false,
  }
}

function defaultVisualStyle(): CloneVisualStyleProfile {
  return {
    scene: '',
    lighting: '',
    cameraStyle: '',
    movementStyle: '',
    realismStyle: 'ugc',
  }
}

function normalizeProductType(value: unknown): CloneProductType {
  return value === 'earrings' || value === 'phone_case' || value === 'clothes' || value === 'toy' ? value : 'general'
}

function normalizeHookType(value: unknown): CloneHookType {
  return value === 'price' ||
    value === 'pain_point' ||
    value === 'before_after' ||
    value === 'curiosity' ||
    value === 'visual_impact' ||
    value === 'social_proof' ||
    value === 'style_showcase'
    ? value
    : 'unknown'
}

function normalizeRealismStyle(value: unknown): CloneRealismStyle {
  return value === 'studio' || value === 'live_room' || value === 'handheld' || value === 'product_closeup'
    ? value
    : 'ugc'
}

function inferMarket(locale: CloneLocale): 'VN' | 'TH' | 'US' | 'GLOBAL' {
  return locale === 'vi-VN' ? 'VN' : 'GLOBAL'
}

function inferLanguage(locale: CloneLocale) {
  return locale === 'zh-CN' ? 'zh-CN' : 'vi-VN'
}

function normalizeRunMode(value: unknown): CloneRunMode {
  return value === 'auto' ? 'auto' : 'manual'
}

function inferBeatPurpose(
  shot: any,
): 'hook' | 'problem' | 'demo' | 'benefit' | 'proof' | 'offer' | 'cta' {
  if (shot?.scriptRole === 'hook' || shot?.purpose === 'hook') return 'hook'
  if (shot?.scriptRole === 'pain_point' || shot?.purpose === 'problem') return 'problem'
  if (shot?.scriptRole === 'proof' || shot?.purpose === 'proof') return 'proof'
  if (shot?.scriptRole === 'offer') return 'offer'
  if (shot?.scriptRole === 'cta' || shot?.purpose === 'cta') return 'cta'
  if (shot?.scriptRole === 'detail') return 'benefit'
  return 'demo'
}

function inferBeatMaterialType(shot: any): 'real' | 'ai' | 'mixed' | 'empty-scene' {
  if (shot?.cloneEligible === false) return 'empty-scene'
  if (shot?.uploadedAssetPath) return 'real'
  if (shot?.uploadedImagePath) return 'mixed'
  if (shot?.aiEnabled || shot?.replaceMode === 'ai_generate') return 'ai'
  return 'mixed'
}

function buildLightBlueprintFromLegacy(bp: any, locale: CloneLocale, referenceVideoName: string) {
  if (!bp) return null
  const duration = Number(bp.totalDurationSec ?? bp.duration ?? 0)
  const shots = Array.isArray(bp.shots) ? bp.shots : []
  const storyBeats = Array.isArray(bp.storyBeats) && bp.storyBeats.length
    ? bp.storyBeats
    : shots.map((shot: any, index: number) => ({
        id: String(shot?.id ?? `beat_${index + 1}`),
        start: Number(shot?.startSec ?? 0),
        end: Number(shot?.endSec ?? Number(shot?.startSec ?? 0) + Number(shot?.durationSec ?? 0)),
        purpose: inferBeatPurpose(shot),
        shotType: String(shot?.shotType ?? shot?.cloneClass ?? shot?.visualType ?? 'other'),
        productRole: String(shot?.shotRole ?? shot?.role ?? shot?.scriptRole ?? 'demo'),
        riskLevel:
          shot?.realismRisk === 'high' || shot?.riskLevel === 'high'
            ? 'high'
            : shot?.realismRisk === 'medium' || shot?.riskLevel === 'medium'
              ? 'medium'
              : 'low',
        recommendedMaterialType: inferBeatMaterialType(shot),
      }))
  const firstBeat = storyBeats[0]
  return {
    ...bp,
    id: String(bp.id ?? randomUUID()),
    sourceVideoId: String(bp.sourceVideoId ?? ''),
    title: String(bp.title ?? referenceVideoName.replace(/\.[^.]+$/, '')).trim(),
    duration,
    market: bp.market === 'VN' || bp.market === 'TH' || bp.market === 'US' ? bp.market : inferMarket(locale),
    category: String(bp.category ?? bp.productCategory ?? 'general'),
    hook: bp.hook ?? {
      start: Number(firstBeat?.start ?? 0),
      end: Number(firstBeat?.end ?? Math.min(3, duration || 3)),
      type: String(bp.hookType ?? 'unknown'),
      visualPattern: String(shots[0]?.visualDescription ?? shots[0]?.visualPrompt ?? ''),
      textPattern: String(bp.globalScript?.hook ?? bp.scriptFrame?.hook ?? ''),
      emotion: String(shots[0]?.emotionDescription?.tone ?? 'attention'),
    },
    storyBeats,
    localization: bp.localization ?? {
      language: inferLanguage(locale),
      currencyStyle: inferMarket(locale) === 'VN' ? 'VND' : inferMarket(locale) === 'US' ? 'USD' : 'local',
      subtitleStyle: 'social-commerce-bold',
      culturalNotes: Array.isArray(bp.analysisNotes) ? bp.analysisNotes.slice(0, 3).map(String) : [],
    },
    renderHints: bp.renderHints ?? {
      aspectRatio: '9:16',
      resolution: '1080x1920',
      pacing:
        Number(bp?.rhythm?.avgShotDurationSec ?? 0) > 2.2
          ? 'slow'
          : Number(bp?.rhythm?.avgShotDurationSec ?? 0) > 1.3
            ? 'medium'
            : 'fast',
      bgmMood: String(bp?.visualStyle?.scene ?? 'viral ecommerce'),
      ttsStyle: inferLanguage(locale) === 'zh-CN' ? 'short-commerce-cn' : 'short-commerce-vn',
    },
    createdAt: String(bp.createdAt ?? new Date().toISOString()),
    updatedAt: String(bp.updatedAt ?? new Date().toISOString()),
  }
}

function buildExecutionBlueprint(bp: any): CloneExecutionBlueprint | null {
  if (!bp) return null
  return {
    shots: Array.isArray(bp.shots) ? bp.shots : [],
    variants: bp.variants && typeof bp.variants === 'object' ? bp.variants : {},
    variantScores: bp.variantScores && typeof bp.variantScores === 'object' ? bp.variantScores : {},
    videoPlans: Array.isArray(bp.videoPlans) ? bp.videoPlans : [],
    scriptCandidates: Array.isArray(bp.scriptCandidates) ? bp.scriptCandidates : [],
    consistencyAssets: bp.consistencyAssets ?? undefined,
    strategyNotes: Array.isArray(bp.strategyNotes) ? bp.strategyNotes : [],
  }
}

function normalizePromptCache(input: any) {
  const out: Record<string, ClonePromptCacheEntry> = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input)) {
    const item = value as any
    if (!item || typeof item !== 'object') continue
    const hash = String(item.hash ?? key).trim()
    if (!hash) continue
    out[hash] = {
      hash,
      shotId: String(item.shotId ?? '').trim(),
      positivePrompt: String(item.positivePrompt ?? '').trim(),
      negativePrompt: String(item.negativePrompt ?? '').trim(),
      model: String(item.model ?? '').trim(),
      qualityMode: item.qualityMode === 'fast' || item.qualityMode === 'standard' ? item.qualityMode : 'high',
      createdAt: Number(item.createdAt ?? now()),
    }
  }
  return out
}

function normalizeFrameCache(input: any) {
  const out: Record<string, CloneFrameCacheEntry> = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input)) {
    const item = value as any
    if (!item || typeof item !== 'object') continue
    const hash = String(item.hash ?? key).trim()
    if (!hash) continue
    out[hash] = {
      hash,
      shotId: String(item.shotId ?? '').trim(),
      imagePaths: Array.isArray(item.imagePaths) ? item.imagePaths.map(String).filter(Boolean) : [],
      provider: String(item.provider ?? '').trim(),
      model: String(item.model ?? '').trim(),
      createdAt: Number(item.createdAt ?? now()),
      sourceProductRefs: Array.isArray(item.sourceProductRefs) ? item.sourceProductRefs.map(String).filter(Boolean) : [],
      promptHash: String(item.promptHash ?? '').trim(),
    }
  }
  return out
}

function normalizeCloudClipCache(input: any) {
  const out: Record<string, CloneCloudClipCacheEntry> = {}
  if (!input || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input)) {
    const item = value as any
    if (!item || typeof item !== 'object') continue
    const hash = String(item.hash ?? key).trim()
    if (!hash) continue
    out[hash] = {
      hash,
      shotId: String(item.shotId ?? '').trim(),
      filePath: String(item.filePath ?? '').trim(),
      provider: String(item.provider ?? '').trim(),
      model: String(item.model ?? '').trim(),
      createdAt: Number(item.createdAt ?? now()),
      promptHash: String(item.promptHash ?? '').trim(),
    }
  }
  return out
}

function normalizeQueueJobs(input: any): CloneGenerationQueueJob[] {
  if (!Array.isArray(input)) return []
  return input.map((job: any) => ({
    id: String(job?.id ?? randomUUID()),
    cloneProjectId: String(job?.cloneProjectId ?? '').trim(),
    shotId: String(job?.shotId ?? '').trim(),
    priority: Number(job?.priority ?? 0),
    status:
      job?.status === 'running' || job?.status === 'done' || job?.status === 'failed' || job?.status === 'skipped'
        ? job.status
        : 'queued',
    retryCount: Number(job?.retryCount ?? 0),
    createdAt: Number(job?.createdAt ?? now()),
    updatedAt: Number(job?.updatedAt ?? now()),
  }))
}

function normalizeVideoProvider(v: unknown, fallback: AiProviderName): AiProviderName {
  return v === 'seedance' || v === 'grsai' || v === 'apifox_hub' ? v : fallback
}

function normalizeImageProvider(v: unknown, fallback: ImageProviderName): ImageProviderName {
  return v === 'openai' || v === 'grsai' || v === 'apifox_hub' ? v : fallback
}

function normalizeAi666VideoModel(value: unknown, fallback: string) {
  const raw = String(value ?? '').trim()
  const mapped =
    raw === 'google/veo3.1-lite/image-to-video' || raw === 'google/veo3.1-lite/start-end-frame-to-video'
      ? 'veo_3_1-lite'
      : raw === 'google/veo3.1-fast/image-to-video' || raw === 'google/veo3.1-fast/start-end-frame-to-video'
        ? 'veo_3_1-fast'
        : raw === 'google/veo3.1/image-to-video'
          ? 'veo_3_1'
          : raw === 'bytedance/seedance-2.0/reference-to-video'
            ? 'doubao-seedance-2-0-260128'
            : raw === 'bytedance/seedance-2.0/image-to-video'
              ? 'doubao-seedance-2-0-fast-260128'
              : raw === 'google/veo3.1-lite'
                ? 'veo_3_1-lite'
                : raw === 'google/veo3.1-fast'
                  ? 'veo_3_1-fast'
                  : raw === 'google/veo3.1'
                    ? 'veo_3_1'
                    : raw
  return mapped || fallback
}

function normalizeVectorEngineBaseUrl(value: unknown) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

function normalizeApifoxHubCredentials(parsed: any): ApifoxHubCredentials {
  return {
    enabled: Boolean(parsed?.enabled ?? true),
    baseUrl: normalizeVectorEngineBaseUrl(parsed?.baseUrl),
    apiKey: String(parsed?.apiKey ?? '').trim() || undefined,
    chatProvider:
      parsed?.chatProvider === 'anthropic' || parsed?.chatProvider === 'gemini'
        ? parsed.chatProvider
        : 'openai',
    chatModel: String(parsed?.chatModel ?? '').trim() || 'gpt-4.1-mini',
    chatEndpointStyle:
      parsed?.chatEndpointStyle === 'anthropic_native' || parsed?.chatEndpointStyle === 'gemini_native'
        ? parsed.chatEndpointStyle
        : 'openai_chat',
    imageProvider:
      parsed?.imageProvider === 'gemini' || parsed?.imageProvider === 'jimeng' || parsed?.imageProvider === 'midjourney'
        ? parsed.imageProvider
        : 'openai',
    imageModel: String(parsed?.imageModel ?? '').trim() || 'gpt-image-1',
    imageEditModel: String(parsed?.imageEditModel ?? '').trim() || undefined,
    imageEndpointStyle:
      parsed?.imageEndpointStyle === 'official_rest' || parsed?.imageEndpointStyle === 'midjourney_task'
        ? parsed.imageEndpointStyle
        : 'openai_images',
    videoProvider:
      parsed?.videoProvider === 'sora' ||
      parsed?.videoProvider === 'veo' ||
      parsed?.videoProvider === 'grok' ||
      parsed?.videoProvider === 'jimeng' ||
      parsed?.videoProvider === 'vidu' ||
      parsed?.videoProvider === 'kling' ||
      parsed?.videoProvider === 'seedance2' ||
      parsed?.videoProvider === 'xibapi'
        ? parsed.videoProvider
        : 'openai_video',
    textToVideoModel: normalizeAi666VideoModel(parsed?.textToVideoModel, 'veo_3_1-lite'),
    imageToVideoModel: normalizeAi666VideoModel(parsed?.imageToVideoModel, 'veo_3_1-lite'),
    startEndVideoModel: normalizeAi666VideoModel(parsed?.startEndVideoModel, 'veo_3_1-lite'),
    referenceVideoModel: normalizeAi666VideoModel(parsed?.referenceVideoModel, 'veo_3_1-lite'),
    videoEndpointStyle: parsed?.videoEndpointStyle === 'official_rest' ? 'official_rest' : 'openai_video',
    defaultPollIntervalMs: Math.max(1000, Number(parsed?.defaultPollIntervalMs ?? 2000) || 2000),
    defaultTimeoutMs: Math.max(30000, Number(parsed?.defaultTimeoutMs ?? 600000) || 600000),
  }
}

function normalizeDbCollection<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : []
}

function mergeMissingLegacyEntries(target: CloneDbShape, legacy: CloneDbShape) {
  const nextProjects = [...normalizeDbCollection(target.projects)]
  const nextGroups = [...normalizeDbCollection(target.projectGroups)]
  const nextIdentities = [...normalizeDbCollection(target.modelIdentityLibrary)]
  const projectIds = new Set(nextProjects.map((item) => String((item as any)?.id || '').trim()).filter(Boolean))
  const groupIds = new Set(nextGroups.map((item) => String((item as any)?.id || '').trim()).filter(Boolean))
  const identityIds = new Set(nextIdentities.map((item) => String((item as any)?.id || '').trim()).filter(Boolean))
  let changed = false

  for (const item of normalizeDbCollection(legacy.projects)) {
    const id = String((item as any)?.id || '').trim()
    if (!id || projectIds.has(id)) continue
    nextProjects.push(item)
    projectIds.add(id)
    changed = true
  }
  for (const item of normalizeDbCollection(legacy.projectGroups)) {
    const id = String((item as any)?.id || '').trim()
    if (!id || groupIds.has(id)) continue
    nextGroups.push(item)
    groupIds.add(id)
    changed = true
  }
  for (const item of normalizeDbCollection(legacy.modelIdentityLibrary)) {
    const id = String((item as any)?.id || '').trim()
    if (!id || identityIds.has(id)) continue
    nextIdentities.push(item)
    identityIds.add(id)
    changed = true
  }

  return {
    changed,
    db: {
      projects: nextProjects,
      projectGroups: nextGroups,
      modelIdentityLibrary: nextIdentities,
    } satisfies CloneDbShape,
  }
}

export async function ensureCloneSqliteReady(): Promise<CloneSqliteReadyState> {
  if (!canInitializeCloneSqlite()) {
    throw new Error(`[clone-repo] SQLite unavailable: ${getCloneSqliteUnavailableReason() || 'unknown reason'}`)
  }

  initializeCloneSqlite()
  const legacyCandidates = [cloneDbPath(), legacyUserDataCloneDbPath()]
    .map((item) => String(item || '').trim())
    .filter((item, index, list) => Boolean(item) && list.indexOf(item) === index)

  if (!isCloneSqliteEmpty()) {
    let currentDb = readCloneDbFromSqlite()
    let changed = false
    for (const legacyPath of legacyCandidates) {
      if (!existsSync(legacyPath)) continue
      const legacyDb = await readCloneDbFileAt(legacyPath)
      const merged = mergeMissingLegacyEntries(currentDb, legacyDb)
      if (!merged.changed) continue
      writeCloneDbToSqlite(merged.db)
      currentDb = readCloneDbFromSqlite()
      changed = true
    }
    if (changed) return { migrated: true, source: 'json_import' }
    return { migrated: false, source: 'sqlite' }
  }

  let imported = false
  let nextDb: CloneDbShape = { projects: [], projectGroups: [], modelIdentityLibrary: [] }
  for (const legacyPath of legacyCandidates) {
    if (!existsSync(legacyPath)) continue
    const legacyDb = await readCloneDbFileAt(legacyPath)
    const merged = mergeMissingLegacyEntries(nextDb, legacyDb)
    nextDb = merged.db
    imported = imported || merged.changed
  }

  if (!imported) {
    return { migrated: false, source: 'empty' }
  }
  writeCloneDbToSqlite({
    projects: normalizeDbCollection(nextDb.projects),
    projectGroups: normalizeDbCollection(nextDb.projectGroups),
    modelIdentityLibrary: normalizeDbCollection(nextDb.modelIdentityLibrary),
  })
  return { migrated: true, source: 'json_import' }
}

async function readCloneDbSource(): Promise<CloneDbShape> {
  await ensureCloneSqliteReady()
  const db = readCloneDbFromSqlite()
  return {
    projects: normalizeDbCollection(db.projects),
    projectGroups: normalizeDbCollection(db.projectGroups),
    modelIdentityLibrary: normalizeDbCollection(db.modelIdentityLibrary),
  }
}

async function writeCloneDbSource(input: CloneDbShape) {
  const normalized: CloneDbShape = {
    projects: Array.isArray(input.projects) ? input.projects : [],
    projectGroups: Array.isArray(input.projectGroups) ? input.projectGroups : [],
    modelIdentityLibrary: Array.isArray(input.modelIdentityLibrary) ? input.modelIdentityLibrary : [],
  }
  await ensureCloneSqliteReady()
  writeCloneDbToSqlite({
    projects: normalized.projects,
    projectGroups: normalized.projectGroups ?? [],
    modelIdentityLibrary: normalized.modelIdentityLibrary ?? [],
  })
}

export async function exportCloneDbSnapshotToJson(targetPath = cloneDbPath()) {
  const db = await readCloneDbSource()
  await writeJsonFile(targetPath, db)
  return targetPath
}

function queueCloneDbMutation<T>(task: () => Promise<T>): Promise<T> {
  const next = cloneDbMutationQueue.then(task, task)
  cloneDbMutationQueue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

function inferAspectRatio(value: unknown, fallback: '9:16' | '16:9' = '9:16'): '9:16' | '16:9' {
  return value === '16:9' ? '16:9' : value === '9:16' ? '9:16' : fallback
}

function normalizeCredentials(parsed: any): ModelCredentials {
  const ai666Hub = normalizeApifoxHubCredentials(parsed?.ai666Hub ?? parsed?.apifoxHub)
  const vectorEngineHub = normalizeApifoxHubCredentials(parsed?.vectorEngineHub ?? parsed?.apifoxHub)
  const xibapiHub = normalizeApifoxHubCredentials(parsed?.xibapiHub ?? parsed?.apifoxHub)
  const profile: 'ai666' | 'vectorengine' | 'xibapi' =
    parsed?.apifoxHubProfile === 'ai666' ? 'ai666' : parsed?.apifoxHubProfile === 'xibapi' ? 'xibapi' : 'vectorengine'
  const videoProfile: 'ai666' | 'vectorengine' | 'xibapi' =
    parsed?.videoApifoxHubProfile === 'ai666'
      ? 'ai666'
      : parsed?.videoApifoxHubProfile === 'xibapi'
        ? 'xibapi'
        : parsed?.videoApifoxHubProfile === 'vectorengine'
          ? 'vectorengine'
          : profile
  const imageProfile: 'ai666' | 'vectorengine' =
    parsed?.imageApifoxHubProfile === 'ai666'
      ? 'ai666'
      : parsed?.imageApifoxHubProfile === 'vectorengine' || profile === 'xibapi'
        ? 'vectorengine'
        : profile
  const chatProfile: 'ai666' | 'vectorengine' =
    parsed?.chatApifoxHubProfile === 'ai666'
      ? 'ai666'
      : parsed?.chatApifoxHubProfile === 'vectorengine' || profile === 'xibapi'
        ? 'vectorengine'
        : profile
  const activeHub = videoProfile === 'ai666' ? ai666Hub : videoProfile === 'xibapi' ? xibapiHub : vectorEngineHub
  return {
    seedanceApiKey: String(parsed?.seedanceApiKey ?? '').trim() || undefined,
    seedanceHost: String(parsed?.seedanceHost ?? '').trim() || 'https://ark.ap-southeast.bytepluses.com',
    grsaiApiKey: String(parsed?.grsaiApiKey ?? '').trim() || undefined,
    grsaiHost: String(parsed?.grsaiHost ?? '').trim() || 'https://grsaiapi.com',
    qiniuAccessKey: String(parsed?.qiniuAccessKey ?? '').trim() || undefined,
    qiniuSecretKey: String(parsed?.qiniuSecretKey ?? '').trim() || undefined,
    qiniuBucket: String(parsed?.qiniuBucket ?? '').trim() || undefined,
    qiniuDomain: String(parsed?.qiniuDomain ?? '').trim() || undefined,
    qiniuUploadHost: String(parsed?.qiniuUploadHost ?? '').trim() || 'https://upload.qiniup.com',
    qiniuPrefix: String(parsed?.qiniuPrefix ?? '').trim() || 'videogenerate/clone',
    allowMockWhenNoKey: Boolean(parsed?.allowMockWhenNoKey ?? true),
    keyframeModel: String(parsed?.keyframeModel ?? '').trim() || 'local-product-frame',
    videoModelPrimary: normalizeAi666VideoModel(parsed?.videoModelPrimary, 'veo_3_1-lite'),
    videoModelFallback: normalizeAi666VideoModel(parsed?.videoModelFallback, 'veo_3_1-fast'),
    grsaiVideoModel: normalizeAi666VideoModel(parsed?.grsaiVideoModel, 'grok-video-3'),
    grsaiAnalysisModel: String(parsed?.grsaiAnalysisModel ?? '').trim() || 'gemini-3.1-pro',
    chatProviderPrimary: parsed?.chatProviderPrimary === 'grsai' ? 'grsai' : 'apifox_hub',
    videoProviderPrimary: normalizeVideoProvider(parsed?.videoProviderPrimary, 'apifox_hub'),
    videoProviderFallback: normalizeVideoProvider(parsed?.videoProviderFallback, 'grsai'),
    openaiApiKey: String(parsed?.openaiApiKey ?? '').trim() || undefined,
    openaiImageModel: String(parsed?.openaiImageModel ?? '').trim() || 'gpt-image-2',
    openaiImageQuality:
      parsed?.openaiImageQuality === 'low' || parsed?.openaiImageQuality === 'medium'
        ? parsed.openaiImageQuality
        : 'high',
    replicateApiToken: String(parsed?.replicateApiToken ?? '').trim() || undefined,
    imageProviderPrimary: normalizeImageProvider(parsed?.imageProviderPrimary, 'apifox_hub'),
    grsaiImageModel: String(parsed?.grsaiImageModel ?? '').trim() || 'gpt-image-2',
    apifoxHubProfile: profile,
    videoApifoxHubProfile: videoProfile,
    imageApifoxHubProfile: imageProfile,
    chatApifoxHubProfile: chatProfile,
    ai666Hub,
    vectorEngineHub,
    xibapiHub,
    apifoxHub: activeHub,
  }
}

function normalizeScriptRole(value: unknown): any {
  return value === 'hook' ||
    value === 'pain_point' ||
    value === 'solution' ||
    value === 'show' ||
    value === 'detail' ||
    value === 'proof' ||
    value === 'offer' ||
    value === 'cta' ||
    value === 'transition'
    ? value
    : 'unknown'
}

function fallbackShotScript(s: any, index: number) {
  const visualDescription = sanitizeLegacyPromptText(
    String(s?.visualDescription ?? s?.visualPrompt ?? s?.visual ?? s?.promptHint ?? 'reference product demonstration shot').trim(),
    s?.productType,
  )
  const actionDescription = String(s?.actionDescription ?? s?.action ?? s?.visualPrompt ?? 'reference shot action').trim()
  const cameraDescription = String(s?.cameraDescription ?? `${s?.framing ?? 'closeup'} framing, ${s?.cameraMovement ?? s?.motion ?? 'static'} movement`).trim()
  const productFocus = String(s?.productFocus ?? 'preserve the reference product-display purpose while replacing the product').trim()
  return {
    scriptText: String(s?.scriptText ?? '').trim(),
    scriptRole: normalizeScriptRole(s?.scriptRole ?? (index === 0 ? 'hook' : 'unknown')),
    narrationText: String(s?.narrationText ?? '').trim() || undefined,
    onScreenText: String(s?.onScreenText ?? '').trim() || undefined,
    visualDescription,
    subjectPosition:
      s?.subjectPosition && typeof s.subjectPosition === 'object'
        ? {
            person: String(s.subjectPosition.person ?? '').trim() || undefined,
            product: String(s.subjectPosition.product ?? '').trim() || undefined,
            text: String(s.subjectPosition.text ?? '').trim() || undefined,
          }
        : undefined,
    sceneDescription:
      s?.sceneDescription && typeof s.sceneDescription === 'object'
        ? {
            location: String(s.sceneDescription.location ?? '').trim() || undefined,
            background: String(s.sceneDescription.background ?? '').trim() || undefined,
            lighting: String(s.sceneDescription.lighting ?? '').trim() || undefined,
            style: String(s.sceneDescription.style ?? '').trim() || undefined,
          }
        : undefined,
    emotionDescription:
      s?.emotionDescription && typeof s.emotionDescription === 'object'
        ? {
            tone: String(s.emotionDescription.tone ?? '').trim() || undefined,
            intensity: typeof s.emotionDescription.intensity === 'number' ? Number(s.emotionDescription.intensity) : undefined,
          }
        : undefined,
    actionDescription,
    cameraDescription,
    productFocus,
    textOverlay:
      s?.textOverlay && typeof s.textOverlay === 'object'
        ? {
            content: String(s.textOverlay.content ?? '').trim() || undefined,
            position: String(s.textOverlay.position ?? '').trim() || undefined,
            fontSize:
              s.textOverlay.fontSize === 'small' ||
              s.textOverlay.fontSize === 'medium' ||
              s.textOverlay.fontSize === 'large' ||
              s.textOverlay.fontSize === 'extra_large'
                ? s.textOverlay.fontSize
                : undefined,
            style: String(s.textOverlay.style ?? '').trim() || undefined,
            color: String(s.textOverlay.color ?? '').trim() || undefined,
            animation: String(s.textOverlay.animation ?? '').trim() || undefined,
          }
        : undefined,
    generationPrompt: sanitizeLegacyPromptText(String(s?.generationPrompt ?? '').trim(), s?.productType) || [visualDescription, actionDescription, cameraDescription, productFocus].join('\n'),
    negativePrompt: String(s?.negativePrompt ?? '').trim() || undefined,
    scriptConfidence: typeof s?.scriptConfidence === 'number' ? Math.max(0, Math.min(1, s.scriptConfidence)) : 0,
    analysisNotes: Array.isArray(s?.analysisNotes) ? s.analysisNotes.map(String).filter(Boolean) : ['历史项目自动补齐脚本字段'],
  }
}

function normalizeGlobalScript(value: any) {
  if (!value || typeof value !== 'object') return undefined
  return {
    language: String(value.language ?? '').trim(),
    summary: String(value.summary ?? '').trim(),
    sellingLogic: String(value.sellingLogic ?? '').trim(),
    hook: String(value.hook ?? '').trim(),
    cta: String(value.cta ?? '').trim(),
  }
}

function encryptCredentials(input: ModelCredentials): CloneSettingsShape {
  const text = JSON.stringify(input)
  const canSecure = isRuntimeEncryptionAvailable()
  if (canSecure) {
    const encrypted = encryptRuntimeString(text)
    if (!encrypted) {
      return { plaintextCredentials: input }
    }
    return {
      encryptedCredentials: encrypted,
      plaintextCredentials: input,
    }
  }
  return { plaintextCredentials: input }
}

function decryptCredentials(settings: CloneSettingsShape): ModelCredentials {
  if (settings.encryptedCredentials) {
    try {
      const text = decryptRuntimeString(settings.encryptedCredentials)
      if (!text) {
        throw new Error('runtime encryption unavailable')
      }
      return normalizeCredentials(JSON.parse(text))
    } catch (error) {
      if (settings.plaintextCredentials) {
        return normalizeCredentials(settings.plaintextCredentials)
      }
      console.warn('[clone] failed to decrypt model credentials, fallback to default settings:', error)
      return normalizeCredentials({ allowMockWhenNoKey: true })
    }
  }
  return normalizeCredentials(settings.plaintextCredentials ?? { allowMockWhenNoKey: true })
}

function normalizeCloneRuntimeOptions(input?: Partial<CloneRuntimeOptions> | null): CloneRuntimeOptions {
  const local = Number(input?.storyboardFrameConcurrency ?? DEFAULT_CLONE_RUNTIME_OPTIONS.storyboardFrameConcurrency)
  const global = Number(input?.globalStoryboardFrameConcurrency ?? DEFAULT_CLONE_RUNTIME_OPTIONS.globalStoryboardFrameConcurrency)
  return {
    storyboardFrameConcurrency: Math.max(1, Math.min(6, Number.isFinite(local) ? Math.floor(local) : DEFAULT_CLONE_RUNTIME_OPTIONS.storyboardFrameConcurrency)),
    globalStoryboardFrameConcurrency: Math.max(
      1,
      Math.min(6, Number.isFinite(global) ? Math.floor(global) : DEFAULT_CLONE_RUNTIME_OPTIONS.globalStoryboardFrameConcurrency),
    ),
  }
}

function sanitizeLegacyPromptText(value: unknown, productType?: unknown) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const normalizedType = String(productType || '').trim().toLowerCase()
  const earringLike =
    /earrings?/.test(normalizedType) ||
    /silver hoop earring|star-shaped dangles|drop earring|dangle earring|ear wearing|ear jewelry|zircon|stud earring/i.test(text)
  if (!earringLike) return text
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/TEXT PRODUCT DESCRIPTION LOCK/i.test(line))
    .filter((line) => !/^Subject:/i.test(line))
    .filter((line) => !/silver hoop earring|star-shaped dangles|drop earring|dangle earring/i.test(line))
    .map((line) =>
      /Preserve original storyboard\/reference scene:/i.test(line)
        ? 'Preserve original storyboard/reference scene: Extreme close-up of ear wearing the earring.'
        : line,
    )
  return lines.join('\n').trim()
}

function migrateWorkflowStep(value: unknown): CloneProject['workflowV2'] extends { currentStep: infer T } ? T : string {
  const step = String(value || '').trim()
  if (step === 'upload_analyze_script') return 'reference_analysis' as any
  if (step === 'generate_script_variants' || step === 'select_script_variant') return 'script_generation' as any
  if (step === 'model_product_consistency') return 'identity_grid' as any
  if (step === 'generate_storyboard_grids') return 'storyboard_design' as any
  if (step === 'generate_shot_videos' || step === 'review_replace_shots' || step === 'storyboard_video_generation') return 'storyboard_videos' as any
  if (step === 'compose_final_video' || step === 'export_final') return 'final_compose' as any
  if (
    step === 'reference_analysis' ||
    step === 'script_generation' ||
    step === 'identity_grid' ||
    step === 'storyboard_design' ||
    step === 'storyboard_videos' ||
    step === 'final_compose'
  ) return step as any
  return 'reference_analysis' as any
}

function migrateAutoFlowStage(value: unknown) {
  const stage = String(value || '').trim()
  if (stage === 'analyze') return 'reference_analysis' as const
  if (stage === 'materials' || stage === 'script') return stage === 'materials' ? ('identity_grid' as const) : ('script_generation' as const)
  if (stage === 'storyboard_images') return 'storyboard_design' as const
  if (stage === 'quality_gate') return 'final_compose' as const
  if (
    stage === 'reference_analysis' ||
    stage === 'script_generation' ||
    stage === 'identity_grid' ||
    stage === 'storyboard_design' ||
    stage === 'storyboard_videos' ||
    stage === 'final_compose'
  ) return stage
  return undefined
}


function normalizeProject(p: CloneProject): CloneProject {
  const normalizeShot = (s: any, index: number) => {
    const durationSec = Number(s?.durationSec ?? 1.5)
    const startSec = Number(s?.startSec ?? 0)
    const endSec = Number(s?.endSec ?? startSec + durationSec)
    const generatedSource = String(s?.generatedSource ?? '')
    const generatedProvider = String(s?.generatedProvider ?? '')
    const generatedModel = String(s?.generatedModel ?? '')
    const normalizedShotStatus = String(s?.status ?? '').trim().toLowerCase()
    const shouldKeepGeneratedClipPath =
      normalizedShotStatus === 'done' ||
      normalizedShotStatus === 'success' ||
      normalizedShotStatus === 'completed'
    const hasLocalMockClip =
      Boolean(s?.generatedClipPath) &&
      (generatedSource === 'mock' ||
        generatedSource === 'local' ||
        generatedProvider === 'local' ||
        generatedProvider === 'mock' ||
        generatedModel.startsWith('mock-') ||
        generatedModel === 'mock-i2v' ||
        generatedModel === 'mock-image2video')
    return {
      ...s,
      id: String(s?.id ?? `shot_${index + 1}`),
      index: Number(s?.index ?? index),
      startSec,
      endSec,
      durationSec,
      role: s?.role ?? (s?.purpose === 'hook' ? 'hook' : s?.purpose === 'proof' ? 'social_proof' : s?.purpose === 'cta' ? 'cta' : 'detail'),
      visualType: s?.visualType ?? s?.role ?? 'detail',
      captionPosition: s?.captionPosition ?? 'bottom',
      motion: s?.motion ?? 'static',
      transitionIn: s?.transitionIn ?? 'hardcut',
      transitionOut: s?.transitionOut ?? 'hardcut',
      replaceMode: s?.replaceMode ?? 'upload_video',
      requiredAssetType: s?.requiredAssetType ?? 'any',
      productReferenceImagePaths: Array.isArray(s?.productReferenceImagePaths) ? s.productReferenceImagePaths : [],
      originalProductReferenceImagePaths: Array.isArray(s?.originalProductReferenceImagePaths) ? s.originalProductReferenceImagePaths : [],
      sanitizedProductReferenceImagePaths: Array.isArray(s?.sanitizedProductReferenceImagePaths) ? s.sanitizedProductReferenceImagePaths : [],
      isMock: Boolean(s?.isMock ?? hasLocalMockClip),
      qualityMode: s?.qualityMode === 'fast' || s?.qualityMode === 'standard' ? s.qualityMode : 'high',
      qualityStatus:
        hasLocalMockClip
          ? 'failed'
          : s?.qualityStatus === 'pending' || s?.qualityStatus === 'passed' || s?.qualityStatus === 'warning' || s?.qualityStatus === 'failed'
            ? s.qualityStatus
            : 'unchecked',
      qualityScore: typeof s?.qualityScore === 'number' ? s.qualityScore : undefined,
      qualityReasons: Array.isArray(s?.qualityReasons) ? s.qualityReasons : hasLocalMockClip ? ['mock_clip'] : [],
      retrySuggestion: String(s?.retrySuggestion ?? '').trim() || undefined,
      freezeRatio: typeof s?.freezeRatio === 'number' ? s.freezeRatio : undefined,
      blackFrameRatio: typeof s?.blackFrameRatio === 'number' ? s.blackFrameRatio : undefined,
      productVisibilityScore: typeof s?.productVisibilityScore === 'number' ? s.productVisibilityScore : undefined,
      canEnterRender: typeof s?.canEnterRender === 'boolean' ? s.canEnterRender : !hasLocalMockClip,
      retryCount: Number(s?.retryCount ?? 0) || 0,
      productType:
        s?.productType === 'earrings' || s?.productType === 'phone_case' || s?.productType === 'clothes' || s?.productType === 'toy'
          ? s.productType
          : 'general',
      productMainImage: String(s?.productMainImage ?? '').trim() || undefined,
      productDetailImages: Array.isArray(s?.productDetailImages) ? s.productDetailImages.map(String) : [],
      productUsageImages: Array.isArray(s?.productUsageImages) ? s.productUsageImages.map(String) : [],
      styleReferenceImages: Array.isArray(s?.styleReferenceImages) ? s.styleReferenceImages.map(String) : [],
      gptFirstFramePath: String(s?.gptFirstFramePath ?? '').trim() || undefined,
      gptLastFramePath: String(s?.gptLastFramePath ?? '').trim() || undefined,
      generatedFirstFramePath: String(s?.generatedFirstFramePath ?? '').trim() || undefined,
      generatedLastFramePath: String(s?.generatedLastFramePath ?? '').trim() || undefined,
      gptFrameStatus:
        s?.gptFrameStatus === 'generating' || s?.gptFrameStatus === 'done' || s?.gptFrameStatus === 'failed'
          ? s.gptFrameStatus
          : 'idle',
      gptFrameError: String(s?.gptFrameError ?? '').trim() || undefined,
      gptFrameConfirmed: Boolean(s?.gptFrameConfirmed ?? false),
      gptFrameSource: s?.gptFrameSource === 'gpt_image' ? 'gpt_image' : undefined,
      gptFrameModel: String(s?.gptFrameModel ?? '').trim() || undefined,
      generatedClipDurationSec: typeof s?.generatedClipDurationSec === 'number' ? s.generatedClipDurationSec : undefined,
      generatedClipWidth: typeof s?.generatedClipWidth === 'number' ? s.generatedClipWidth : undefined,
      generatedClipHeight: typeof s?.generatedClipHeight === 'number' ? s.generatedClipHeight : undefined,
      promptHash: String(s?.promptHash ?? '').trim() || undefined,
      imagePromptHash: String(s?.imagePromptHash ?? '').trim() || undefined,
      normalizedCacheKey: String(s?.normalizedCacheKey ?? '').trim() || undefined,
      assetMatchScore: typeof s?.assetMatchScore === 'number' ? s.assetMatchScore : undefined,
      assetMatchLabel: String(s?.assetMatchLabel ?? '').trim() || undefined,
      assetMatchReasons: Array.isArray(s?.assetMatchReasons) ? s.assetMatchReasons.map(String) : [],
      assetMatchDetail:
        s?.assetMatchDetail && typeof s.assetMatchDetail === 'object'
          ? {
              role: Number(s.assetMatchDetail.role ?? 0),
              clarity: Number(s.assetMatchDetail.clarity ?? 0),
              duration: Number(s.assetMatchDetail.duration ?? 0),
              aspectRatio: Number(s.assetMatchDetail.aspectRatio ?? 0),
              resolution: Number(s.assetMatchDetail.resolution ?? 0),
              realism: Number(s.assetMatchDetail.realism ?? 0),
              history: Number(s.assetMatchDetail.history ?? 0),
              total: Number(s.assetMatchDetail.total ?? 0),
            }
          : undefined,
      selectedAssetId: String(s?.selectedAssetId ?? '').trim() || undefined,
      forceAi: Boolean(s?.forceAi ?? false),
      shotRole:
        s?.shotRole === 'hook' ||
        s?.shotRole === 'product_show' ||
        s?.shotRole === 'detail' ||
        s?.shotRole === 'try_on' ||
        s?.shotRole === 'proof' ||
        s?.shotRole === 'price' ||
        s?.shotRole === 'cta'
          ? s.shotRole
          : s?.purpose === 'hook'
            ? 'hook'
            : s?.purpose === 'proof'
              ? 'proof'
              : s?.purpose === 'cta'
                ? 'cta'
                : 'detail',
      shotType:
        s?.shotType === 'real_product' ||
        s?.shotType === 'model_demo' ||
        s?.shotType === 'handheld' ||
        s?.shotType === 'closeup' ||
        s?.shotType === 'packaging' ||
        s?.shotType === 'screen_recording' ||
        s?.shotType === 'result_showcase'
          ? s.shotType
          : s?.cloneClass === 'screen_recording'
            ? 'screen_recording'
            : s?.cloneClass === 'result_showcase'
              ? 'result_showcase'
              : s?.cloneClass === 'real_product'
                ? 'real_product'
                : s?.cloneClass === 'model_demo'
                  ? 'model_demo'
                  : 'other',
      framing:
        s?.framing === 'extreme_closeup' || s?.framing === 'closeup' || s?.framing === 'medium' || s?.framing === 'wide'
          ? s.framing
          : 'closeup',
      cameraMovement: String(s?.cameraMovement ?? s?.motion ?? '').trim() || 'static',
      action: String(s?.action ?? '').trim() || undefined,
      productVisibility:
        s?.productVisibility === 'none' || s?.productVisibility === 'low' || s?.productVisibility === 'medium'
          ? s.productVisibility
          : 'high',
      replacementMode:
        s?.replacementMode === 'local_video' ||
        s?.replacementMode === 'local_image_to_video' ||
        s?.replacementMode === 'ai_generate' ||
        s?.replacementMode === 'skip'
          ? s.replacementMode
          : s?.replaceMode === 'upload_video'
            ? 'local_video'
            : s?.replaceMode === 'upload_image_to_video'
              ? 'local_image_to_video'
              : s?.replaceMode === 'locked'
                ? 'skip'
                : 'ai_generate',
      aiDifficulty: s?.aiDifficulty === 'low' || s?.aiDifficulty === 'medium' ? s.aiDifficulty : 'medium',
      realismRisk: s?.realismRisk === 'low' || s?.realismRisk === 'medium' ? s.realismRisk : 'medium',
      requiredAssets: Array.isArray(s?.requiredAssets) ? s.requiredAssets.map(String).filter(Boolean) : [],
      promptHint: String(s?.promptHint ?? '').trim() || undefined,
      negativePromptHint: String(s?.negativePromptHint ?? '').trim() || undefined,
      realismStyle:
        s?.realismStyle === 'studio' || s?.realismStyle === 'live_room' || s?.realismStyle === 'handheld' || s?.realismStyle === 'product_closeup'
          ? s.realismStyle
          : 'ugc',
      referenceFramePaths:
        s?.referenceFramePaths && typeof s.referenceFramePaths === 'object'
          ? {
              start: String(s.referenceFramePaths.start ?? '').trim() || undefined,
              mid: String(s.referenceFramePaths.mid ?? '').trim() || undefined,
              end: String(s.referenceFramePaths.end ?? '').trim() || undefined,
            }
          : undefined,
      ...fallbackShotScript(s, index),
      referenceLock: buildReferenceLock(s as any, String(s?.referenceLock?.sceneEnvironment ?? 'reference video scene atmosphere')),
      locked: Boolean(s?.locked ?? false),
      generatedClipPath: hasLocalMockClip ? undefined : shouldKeepGeneratedClipPath ? s?.generatedClipPath : undefined,
      generatedSource: hasLocalMockClip ? undefined : s?.generatedSource,
      generatedProvider: hasLocalMockClip ? undefined : s?.generatedProvider,
      generatedModel: hasLocalMockClip ? undefined : s?.generatedModel,
      generatedTaskId: hasLocalMockClip ? undefined : s?.generatedTaskId,
      status: hasLocalMockClip ? 'failed' : (s?.status ?? 'empty'),
      error: hasLocalMockClip ? '历史本地 mock/图片拼接片段已判定无效，请重新调用 Seedance/Kling 云端生成。' : s?.error,
      uploadedAssetIds: Array.isArray(s?.uploadedAssetIds) ? s.uploadedAssetIds : [],
      aiEnabled: Boolean(s?.aiEnabled ?? false),
      reviewStatus: s?.reviewStatus ?? 'pending',
    }
  }
  const normalizedBlueprint = p.blueprint ?? p.baseBlueprint ?? null
  const normalizedShots = (normalizedBlueprint?.shots ?? []).map((s, i) => normalizeShot(s as any, i))
  const blueprintAspectRatio = inferAspectRatio(
    normalizedBlueprint?.referenceAspectRatio,
    Number(normalizedBlueprint?.referenceWidth ?? 0) > Number(normalizedBlueprint?.referenceHeight ?? 0) ? '16:9' : '9:16',
  )
  const normalizedConsistencyAssets =
    (normalizedBlueprint as any)?.consistencyAssets && typeof (normalizedBlueprint as any).consistencyAssets === 'object'
      ? {
          ...(normalizedBlueprint as any).consistencyAssets,
          originalProductReferenceImages: Array.isArray((normalizedBlueprint as any)?.consistencyAssets?.originalProductReferenceImages)
            ? (normalizedBlueprint as any).consistencyAssets.originalProductReferenceImages.map(String).filter(Boolean)
            : [],
          sanitizedProductReferenceImages: Array.isArray((normalizedBlueprint as any)?.consistencyAssets?.sanitizedProductReferenceImages)
            ? (normalizedBlueprint as any).consistencyAssets.sanitizedProductReferenceImages.map(String).filter(Boolean)
            : [],
          productImageSanitization:
            (normalizedBlueprint as any)?.consistencyAssets?.productImageSanitization &&
            typeof (normalizedBlueprint as any).consistencyAssets.productImageSanitization === 'object'
              ? {
                  status:
                    (normalizedBlueprint as any).consistencyAssets.productImageSanitization.status === 'processing' ||
                    (normalizedBlueprint as any).consistencyAssets.productImageSanitization.status === 'done' ||
                    (normalizedBlueprint as any).consistencyAssets.productImageSanitization.status === 'failed'
                      ? (normalizedBlueprint as any).consistencyAssets.productImageSanitization.status
                      : 'idle',
                  originalPaths: Array.isArray((normalizedBlueprint as any).consistencyAssets.productImageSanitization.originalPaths)
                    ? (normalizedBlueprint as any).consistencyAssets.productImageSanitization.originalPaths.map(String).filter(Boolean)
                    : [],
                  sanitizedPaths: Array.isArray((normalizedBlueprint as any).consistencyAssets.productImageSanitization.sanitizedPaths)
                    ? (normalizedBlueprint as any).consistencyAssets.productImageSanitization.sanitizedPaths.map(String).filter(Boolean)
                    : [],
                  failedPaths: Array.isArray((normalizedBlueprint as any).consistencyAssets.productImageSanitization.failedPaths)
                    ? (normalizedBlueprint as any).consistencyAssets.productImageSanitization.failedPaths.map(String).filter(Boolean)
                    : [],
                  diagnostics: Array.isArray((normalizedBlueprint as any).consistencyAssets.productImageSanitization.diagnostics)
                    ? (normalizedBlueprint as any).consistencyAssets.productImageSanitization.diagnostics
                    : [],
                  error: String((normalizedBlueprint as any).consistencyAssets.productImageSanitization.error ?? '').trim() || undefined,
                  updatedAt: Number((normalizedBlueprint as any).consistencyAssets.productImageSanitization.updatedAt ?? now()) || now(),
                }
              : undefined,
        }
      : undefined
  const bp = normalizedBlueprint
    ? {
        ...normalizedBlueprint,
        videoSummary: String((normalizedBlueprint as any)?.videoSummary ?? '').trim(),
        productCategory: normalizeProductType((normalizedBlueprint as any)?.productCategory),
        referenceAspectRatio: blueprintAspectRatio,
        referenceWidth: typeof (normalizedBlueprint as any)?.referenceWidth === 'number' ? (normalizedBlueprint as any).referenceWidth : undefined,
        referenceHeight: typeof (normalizedBlueprint as any)?.referenceHeight === 'number' ? (normalizedBlueprint as any).referenceHeight : undefined,
        hookType: normalizeHookType((normalizedBlueprint as any)?.hookType),
        scriptFramework: {
          ...defaultScriptFramework(),
          ...(((normalizedBlueprint as any)?.scriptFramework ?? {}) as Record<string, unknown>),
        },
        rhythm: {
          ...defaultRhythmProfile(),
          ...(((normalizedBlueprint as any)?.rhythm ?? {}) as Record<string, unknown>),
        },
        visualStyle: {
          ...defaultVisualStyle(),
          ...(((normalizedBlueprint as any)?.visualStyle ?? {}) as Record<string, unknown>),
          realismStyle: normalizeRealismStyle((normalizedBlueprint as any)?.visualStyle?.realismStyle),
        },
        globalScript: normalizeGlobalScript((normalizedBlueprint as any)?.globalScript),
        scriptAnalysisError: String((normalizedBlueprint as any)?.scriptAnalysisError ?? '').trim() || undefined,
        consistencyAssets: normalizedConsistencyAssets,
        shots: normalizedShots.map((shot: any) => ({
          ...shot,
          prompt: {
            ...shot.prompt,
            aspectRatio: inferAspectRatio(shot?.prompt?.aspectRatio, blueprintAspectRatio),
          },
        })),
      }
    : normalizedBlueprint
  const lightBlueprint = buildLightBlueprintFromLegacy(bp, p.locale === 'zh-CN' ? 'zh-CN' : 'vi-VN', String(p.referenceVideoName ?? 'reference.mp4'))
  const executionBlueprint = (p as any).executionBlueprint
    ? buildExecutionBlueprint((p as any).executionBlueprint)
    : buildExecutionBlueprint(bp)
  const scriptVariantCandidates = Array.isArray((p as any).scriptVariantCandidates)
    ? (p as any).scriptVariantCandidates.map((item: any, index: number) => ({
        id: String(item?.id ?? randomUUID()),
        title: String(item?.title ?? `脚本变体 ${index + 1}`).trim(),
        summary: String(item?.summary ?? '').trim(),
        fullScript: String(item?.fullScript ?? '').trim(),
        shotScripts: Array.isArray(item?.shotScripts)
          ? item.shotScripts.map((shot: any, shotIndex: number) => ({
              shotId: String(shot?.shotId ?? '').trim(),
              shotIndex: Number(shot?.shotIndex ?? shotIndex),
              timeRange: String(shot?.timeRange ?? shot?.time_range ?? '').trim() || undefined,
              scriptText: String(shot?.scriptText ?? '').trim(),
              scriptRole: normalizeScriptRole(shot?.scriptRole),
              visualDescription: String(shot?.visualDescription ?? '').trim(),
              actionDescription: String(shot?.actionDescription ?? '').trim(),
              cameraDescription: String(shot?.cameraDescription ?? '').trim(),
              generationPrompt: String(shot?.generationPrompt ?? '').trim(),
            }))
          : [],
        score: Number(item?.score ?? 0),
        reason: String(item?.reason ?? '').trim(),
        selected: Boolean(item?.selected ?? false),
        createdAt: Number(item?.createdAt ?? now()),
      }))
    : []
  const storyboardGridBatches = Array.isArray((p as any).storyboardGridBatches)
    ? (p as any).storyboardGridBatches.map((item: any) => ({
        id: String(item?.id ?? randomUUID()),
        shotIds: Array.isArray(item?.shotIds) ? item.shotIds.map(String).filter(Boolean) : [],
        frameCount: Number(item?.frameCount ?? 0),
        gridType: item?.gridType === 'grid-6' ? 'grid-6' : 'grid-9',
        imagePath: String(item?.imagePath ?? '').trim() || undefined,
        croppedFramePaths: Array.isArray(item?.croppedFramePaths) ? item.croppedFramePaths.map(String).filter(Boolean) : [],
        status:
          item?.status === 'generating' || item?.status === 'done' || item?.status === 'failed'
            ? item.status
            : 'idle',
        provider: String(item?.provider ?? '').trim() || undefined,
        model: String(item?.model ?? '').trim() || undefined,
        error: String(item?.error ?? '').trim() || undefined,
        createdAt: Number(item?.createdAt ?? now()),
        updatedAt: Number(item?.updatedAt ?? now()),
      }))
    : []
  const storyboardFrames = Array.isArray((p as any).storyboardFrames)
    ? (p as any).storyboardFrames.map((item: any, index: number) => ({
        id: String(item?.id ?? randomUUID()),
        shotId: String(item?.shotId ?? '').trim(),
        batchId: String(item?.batchId ?? '').trim() || undefined,
        frameIndex: Number.isFinite(Number(item?.frameIndex)) ? Number(item?.frameIndex) : index,
        imagePath: String(item?.imagePath ?? '').trim() || undefined,
        aspectRatio: '9:16' as const,
        status:
          item?.status === 'generating' || item?.status === 'cropped' || item?.status === 'failed'
            ? item.status
            : 'idle',
        error: String(item?.error ?? '').trim() || undefined,
        retryCount: typeof item?.retryCount === 'number' ? Number(item.retryCount) : undefined,
        updatedAt: Number(item?.updatedAt ?? now()) || now(),
      }))
    : []
  const boundProductSnapshot = (p as any).boundProductSnapshot
    ? {
        id: String((p as any).boundProductSnapshot.id ?? '').trim(),
        name: String((p as any).boundProductSnapshot.name ?? '').trim(),
        type: String((p as any).boundProductSnapshot.type ?? '').trim(),
        storyboardTemplateType:
          (p as any).boundProductSnapshot.storyboardTemplateType === 'general' ||
          (p as any).boundProductSnapshot.storyboardTemplateType === 'jewelry' ||
          (p as any).boundProductSnapshot.storyboardTemplateType === 'ecommerce_packaging' ||
          (p as any).boundProductSnapshot.storyboardTemplateType === 'lifestyle_interaction'
            ? (p as any).boundProductSnapshot.storyboardTemplateType
            : undefined,
        remark: String((p as any).boundProductSnapshot.remark ?? '').trim() || undefined,
        coverImagePath: String((p as any).boundProductSnapshot.coverImagePath ?? '').trim() || undefined,
        analysisBoardPath: String((p as any).boundProductSnapshot.analysisBoardPath ?? '').trim() || undefined,
        analysisBoardStatus:
          (p as any).boundProductSnapshot.analysisBoardStatus === 'processing' ||
          (p as any).boundProductSnapshot.analysisBoardStatus === 'done' ||
          (p as any).boundProductSnapshot.analysisBoardStatus === 'failed'
            ? (p as any).boundProductSnapshot.analysisBoardStatus
            : 'idle',
        canonicalSourcePath: String((p as any).boundProductSnapshot.canonicalSourcePath ?? '').trim() || undefined,
        canonicalSourceStatus:
          (p as any).boundProductSnapshot.canonicalSourceStatus === 'processing' ||
          (p as any).boundProductSnapshot.canonicalSourceStatus === 'done' ||
          (p as any).boundProductSnapshot.canonicalSourceStatus === 'failed'
            ? (p as any).boundProductSnapshot.canonicalSourceStatus
            : 'idle',
        productAnalysis:
          (p as any).boundProductSnapshot.productAnalysis && typeof (p as any).boundProductSnapshot.productAnalysis === 'object'
            ? {
                category: String((p as any).boundProductSnapshot.productAnalysis.category ?? '').trim(),
                summary: String((p as any).boundProductSnapshot.productAnalysis.summary ?? '').trim(),
                coreSubject: String((p as any).boundProductSnapshot.productAnalysis.coreSubject ?? '').trim(),
                connectionStructure: String((p as any).boundProductSnapshot.productAnalysis.connectionStructure ?? '').trim(),
                materialDetails: String((p as any).boundProductSnapshot.productAnalysis.materialDetails ?? '').trim(),
                wearingPosition: String((p as any).boundProductSnapshot.productAnalysis.wearingPosition ?? '').trim(),
                surfaceDetails: String((p as any).boundProductSnapshot.productAnalysis.surfaceDetails ?? '').trim(),
                colorDetails: String((p as any).boundProductSnapshot.productAnalysis.colorDetails ?? '').trim(),
                geometryDetails: String((p as any).boundProductSnapshot.productAnalysis.geometryDetails ?? '').trim(),
                sizeScale: String((p as any).boundProductSnapshot.productAnalysis.sizeScale ?? '').trim(),
                matchingRules: Array.isArray((p as any).boundProductSnapshot.productAnalysis.matchingRules)
                  ? (p as any).boundProductSnapshot.productAnalysis.matchingRules.map(String).filter(Boolean)
                  : [],
                rawDescription: String((p as any).boundProductSnapshot.productAnalysis.rawDescription ?? '').trim(),
                updatedAt: Number((p as any).boundProductSnapshot.productAnalysis.updatedAt ?? now()),
              }
            : undefined,
        originalImagePaths: Array.isArray((p as any).boundProductSnapshot.originalImagePaths)
          ? (p as any).boundProductSnapshot.originalImagePaths.map(String).filter(Boolean)
          : [],
        frozenReferenceImagePaths: Array.isArray((p as any).boundProductSnapshot.frozenReferenceImagePaths)
          ? (p as any).boundProductSnapshot.frozenReferenceImagePaths.map(String).filter(Boolean)
          : [],
        boundAt: Number((p as any).boundProductSnapshot.boundAt ?? now()),
        updatedAt: Number((p as any).boundProductSnapshot.updatedAt ?? now()),
      }
    : undefined
  const shotVideoOutputs = Array.isArray((p as any).shotVideoOutputs)
    ? (p as any).shotVideoOutputs.map((item: any) => ({
        segmentId: String(item?.segmentId ?? item?.shotId ?? '').trim() || undefined,
        index: typeof item?.index === 'number' ? Number(item.index) : undefined,
        shotId: String(item?.shotId ?? '').trim(),
        source: item?.source === 'uploaded_replacement' ? 'uploaded_replacement' : 'generated',
        videoPath: Object.prototype.hasOwnProperty.call(item ?? {}, 'videoPath')
          ? normalizeOptionalTrimmedField(item, 'videoPath')
          : undefined,
        localPath: Object.prototype.hasOwnProperty.call(item ?? {}, 'localPath')
          ? normalizeOptionalTrimmedField(item, 'localPath')
          : Object.prototype.hasOwnProperty.call(item ?? {}, 'videoPath')
            ? normalizeOptionalTrimmedField(item, 'videoPath')
            : undefined,
        videoUrl: Object.prototype.hasOwnProperty.call(item ?? {}, 'videoUrl')
          ? normalizeOptionalTrimmedField(item, 'videoUrl')
          : undefined,
        taskId: Object.prototype.hasOwnProperty.call(item ?? {}, 'taskId')
          ? normalizeOptionalTrimmedField(item, 'taskId')
          : undefined,
        previousTaskIds: Array.isArray(item?.previousTaskIds) ? item.previousTaskIds.map(String).filter(Boolean) : undefined,
        provider: String(item?.provider ?? '').trim() || undefined,
        model: String(item?.model ?? '').trim() || undefined,
        requestCapability: item?.requestCapability,
        endpointStyle: String(item?.endpointStyle ?? '').trim() || undefined,
        remoteStatus: String(item?.remoteStatus ?? '').trim() || undefined,
        remoteRaw: item?.remoteRaw,
        submissionFingerprint: String(item?.submissionFingerprint ?? '').trim() || undefined,
        submissionStartedAt: Number(item?.submissionStartedAt ?? 0) || undefined,
        submissionLockedUntil: Number(item?.submissionLockedUntil ?? 0) || undefined,
        durationSec: typeof item?.durationSec === 'number' ? Number(item.durationSec) : undefined,
        status:
          item?.status === 'submitting' ||
          item?.status === 'remote_pending' ||
          item?.status === 'creating' ||
          item?.status === 'remote_running' ||
          item?.status === 'remote_succeeded_pending_download' ||
          item?.status === 'polling_timeout' ||
          item?.status === 'downloading' ||
          item?.status === 'generating' ||
          item?.status === 'done' ||
          item?.status === 'failed_retryable' ||
          item?.status === 'failed_terminal' ||
          item?.status === 'failed' ||
          item?.status === 'success' ||
          item?.status === 'completed'
            ? item.status === 'success' || item.status === 'completed'
              ? 'done'
              : item.status
            : 'idle',
        error: String(item?.error ?? '').trim() || undefined,
        retryCount: typeof item?.retryCount === 'number' ? Number(item.retryCount) : undefined,
        sourceEvent: String(item?.sourceEvent ?? '').trim() || undefined,
        createdAt: Number(item?.createdAt ?? now()),
        lastPollAt: Number(item?.lastPollAt ?? 0) || undefined,
        completedAt: Number(item?.completedAt ?? 0) || undefined,
        updatedAt: Number(item?.updatedAt ?? now()),
      }))
    : []
  const generatedShotOutputs = (bp?.shots ?? [])
    .filter((shot: any) => {
      const status = String(shot?.status ?? '').trim().toLowerCase()
      const hasClip = String(shot?.generatedClipPath ?? '').trim()
      if (!String(shot?.id ?? '').trim() || !hasClip) return false
      return status === 'done' || status === 'success' || status === 'completed'
    })
    .map((shot: any) => ({
      segmentId: String(shot.id).trim(),
      index: Number(shot.index ?? 0),
      shotId: String(shot.id).trim(),
      source: 'generated' as const,
      videoPath: String(shot.generatedClipPath).trim(),
      localPath: String(shot.generatedClipPath).trim(),
      videoUrl: String(shot.generatedClipPath).trim(),
      taskId: String(shot.generatedTaskId ?? '').trim() || undefined,
      provider: String(shot.generatedProvider ?? '').trim() || undefined,
      model: String(shot.generatedModel ?? '').trim() || undefined,
      durationSec: typeof shot.generatedClipDurationSec === 'number' ? Number(shot.generatedClipDurationSec) : undefined,
      status: 'done' as const,
      error: String(shot.error ?? '').trim() || undefined,
      createdAt: Number((p as any).createdAt ?? now()),
      completedAt: Number((p as any).updatedAt ?? now()),
      updatedAt: Number((p as any).updatedAt ?? now()),
    }))
  const mergedShotVideoOutputs = new Map<string, CloneShotVideoOutput>()
  for (const output of shotVideoOutputs) {
    if (output.shotId) mergedShotVideoOutputs.set(output.shotId, output)
  }
  for (const output of generatedShotOutputs) {
    const existing = mergedShotVideoOutputs.get(output.shotId)
    const existingSourceEvent = String(existing?.sourceEvent ?? '').trim().toLowerCase()
    const existingIsReplacementRun =
      Boolean(existing?.previousTaskIds?.length) ||
      Boolean(existing?.submissionStartedAt) ||
      Boolean(existing?.submissionLockedUntil) ||
      existingSourceEvent === 'force_regenerate_reset' ||
      existingSourceEvent === 'segment_submit_started' ||
      existingSourceEvent === 'segment_submit_succeeded' ||
      existingSourceEvent === 'storyboard_video_batch_submit_started'
    if (!existing?.videoPath && !existingIsReplacementRun) mergedShotVideoOutputs.set(output.shotId, output)
  }
  for (const [shotId, output] of mergedShotVideoOutputs.entries()) {
    if (!output.segmentId) {
      mergedShotVideoOutputs.set(shotId, {
        ...output,
        segmentId: shotId,
        index: Number(output.index ?? normalizedBlueprint?.shots.find((shot: any) => String(shot.id) === shotId)?.index ?? 0),
      })
    }
  }
  const finalCompose = (p as any).finalCompose && typeof (p as any).finalCompose === 'object'
    ? {
        status:
          (p as any).finalCompose.status === 'ready' ||
          (p as any).finalCompose.status === 'composing' ||
          (p as any).finalCompose.status === 'done' ||
          (p as any).finalCompose.status === 'failed'
            ? (p as any).finalCompose.status
            : 'idle',
        outputPath: String((p as any).finalCompose.outputPath ?? '').trim() || undefined,
        coverImagePath: String((p as any).finalCompose.coverImagePath ?? '').trim() || undefined,
        error: String((p as any).finalCompose.error ?? '').trim() || undefined,
        updatedAt: Number((p as any).finalCompose.updatedAt ?? now()),
      }
    : undefined
  const rawWorkflow = (p as any).workflowV2 && typeof (p as any).workflowV2 === 'object' ? (p as any).workflowV2 : undefined
  const currentWorkflowStep = migrateWorkflowStep(rawWorkflow?.currentStep)
  const workflowUpdatedAt = Number(rawWorkflow?.updatedAt ?? now()) || now()
  const workflowStepStatus: Record<string, { status: 'idle' | 'running' | 'done' | 'failed'; error?: string; updatedAt: number }> = {
    reference_analysis: { status: 'idle' as const, updatedAt: workflowUpdatedAt },
    script_generation: { status: 'idle' as const, updatedAt: workflowUpdatedAt },
    identity_grid: { status: 'idle' as const, updatedAt: workflowUpdatedAt },
    storyboard_design: { status: 'idle' as const, updatedAt: workflowUpdatedAt },
    storyboard_videos: { status: 'idle' as const, updatedAt: workflowUpdatedAt },
    final_compose: { status: 'idle' as const, updatedAt: workflowUpdatedAt },
  }
  if (rawWorkflow?.stepStatus && typeof rawWorkflow.stepStatus === 'object') {
    for (const [rawStep, rawStatus] of Object.entries(rawWorkflow.stepStatus)) {
      const migratedStep = migrateWorkflowStep(rawStep) as keyof typeof workflowStepStatus
      const normalizedStatus = String((rawStatus as any)?.status ?? '').trim()
      workflowStepStatus[migratedStep] = {
        status:
          normalizedStatus === 'running' || normalizedStatus === 'done' || normalizedStatus === 'failed'
            ? (normalizedStatus as 'idle' | 'running' | 'done' | 'failed')
            : workflowStepStatus[migratedStep].status,
        error: String((rawStatus as any)?.error ?? '').trim() || undefined,
        updatedAt: Number((rawStatus as any)?.updatedAt ?? workflowUpdatedAt) || workflowUpdatedAt,
      }
    }
  }
  return {
    ...p,
    userId: String((p as any)?.userId ?? '').trim() || undefined,
    subscriptionPlanId: String((p as any)?.subscriptionPlanId ?? '').trim() || undefined,
    billingStatus:
      (p as any)?.billingStatus === 'not_required' ||
      (p as any)?.billingStatus === 'pending' ||
      (p as any)?.billingStatus === 'paid' ||
      (p as any)?.billingStatus === 'failed'
        ? (p as any).billingStatus
        : undefined,
    estimatedCost: typeof (p as any)?.estimatedCost === 'number' ? Number((p as any).estimatedCost) : undefined,
    actualCost: typeof (p as any)?.actualCost === 'number' ? Number((p as any).actualCost) : undefined,
    deductionStatus:
      (p as any)?.deductionStatus === 'none' ||
      (p as any)?.deductionStatus === 'reserved' ||
      (p as any)?.deductionStatus === 'charged' ||
      (p as any)?.deductionStatus === 'refunded'
        ? (p as any).deductionStatus
        : undefined,
    assetStorageProvider:
      (p as any)?.assetStorageProvider === 'local_fs' ||
      (p as any)?.assetStorageProvider === 'qiniu' ||
      (p as any)?.assetStorageProvider === 'web_object_storage'
        ? (p as any).assetStorageProvider
        : undefined,
    title: String((p as any)?.title ?? '').trim() || defaultCloneProjectTitle(Number((p as any)?.createdAt ?? now())),
    description: String((p as any)?.description ?? '').trim() || undefined,
    groupId: String((p as any)?.groupId ?? '').trim() || undefined,
    groupName: String((p as any)?.groupName ?? '').trim() || undefined,
    archived: Boolean((p as any)?.archived ?? false),
    originalProductReferenceImagePaths: Array.isArray((p as any)?.originalProductReferenceImagePaths)
      ? (p as any).originalProductReferenceImagePaths.map(String).filter(Boolean)
      : [],
    sanitizedProductReferenceImagePaths: Array.isArray((p as any)?.sanitizedProductReferenceImagePaths)
      ? (p as any).sanitizedProductReferenceImagePaths.map(String).filter(Boolean)
      : [],
    productImageSanitizationStatus:
      (p as any)?.productImageSanitizationStatus === 'processing' ||
      (p as any)?.productImageSanitizationStatus === 'done' ||
      (p as any)?.productImageSanitizationStatus === 'failed'
        ? (p as any).productImageSanitizationStatus
        : 'idle',
    productImageSanitizationError: String((p as any)?.productImageSanitizationError ?? '').trim() || undefined,
    locale: p.locale === 'zh-CN' ? 'zh-CN' : 'vi-VN',
    runMode: normalizeRunMode((p as any)?.runMode),
    strength: 'structure',
    policy: {
      ...(p.policy ?? defaultPolicy()),
      fallbackChain: ['seedance', 'kling', 'grsai'],
    },
    blueprint: lightBlueprint,
    baseBlueprint: bp,
    executionBlueprint,
    aiTasks: Array.isArray(p.aiTasks) ? p.aiTasks : [],
    reviewDecisions: p.reviewDecisions && typeof p.reviewDecisions === 'object' ? p.reviewDecisions : {},
    sessions: Array.isArray((p as any).sessions) ? (p as any).sessions : [],
    modelIdentityPacks: Array.isArray((p as any).modelIdentityPacks)
      ? (p as any).modelIdentityPacks.map((pack: any) => ({
          id: String(pack?.id ?? randomUUID()),
          createdAt: Number(pack?.createdAt ?? now()),
          updatedAt: Number(pack?.updatedAt ?? now()),
          status:
            pack?.status === 'generating' || pack?.status === 'done' || pack?.status === 'failed'
              ? pack.status
              : 'idle',
          confirmed: Boolean(pack?.confirmed ?? false),
          productType:
            pack?.productType === 'earrings' ||
            pack?.productType === 'phone_case' ||
            pack?.productType === 'clothes' ||
            pack?.productType === 'toy'
              ? pack.productType
              : 'general',
          market: String(pack?.market ?? 'Southeast Asian market'),
          gender: String(pack?.gender ?? 'female'),
          ageRange: String(pack?.ageRange ?? '20-28'),
          hairStyle: String(pack?.hairStyle ?? 'natural dark hair'),
          skinTone: String(pack?.skinTone ?? 'natural warm skin tone'),
          outfitStyle: String(pack?.outfitStyle ?? 'clean casual outfit'),
          mood: String(pack?.mood ?? 'calm confident friendly'),
          sceneStyle: String(pack?.sceneStyle ?? 'soft daylight social commerce studio'),
          description: String(pack?.description ?? ''),
          imagePaths: Array.isArray(pack?.imagePaths) ? pack.imagePaths.map(String).filter(Boolean) : [],
          model: String(pack?.model ?? '').trim() || undefined,
          error: String(pack?.error ?? '').trim() || undefined,
        }))
      : [],
    selectedModelIdentityPackId: String((p as any).selectedModelIdentityPackId ?? '').trim() || undefined,
    selectedModelIdentityId: String((p as any).selectedModelIdentityId ?? '').trim() || undefined,
    selectedModelIdentitySnapshot: (p as any).selectedModelIdentitySnapshot
      ? normalizeIdentityLibraryItem((p as any).selectedModelIdentitySnapshot)
      : undefined,
    promptCache: normalizePromptCache((p as any).promptCache),
    frameCache: normalizeFrameCache((p as any).frameCache),
    cloudClipCache: normalizeCloudClipCache((p as any).cloudClipCache),
    generationQueue: {
      options: {
        ...defaultQueueOptions(),
        ...(((p as any).generationQueue?.options ?? {}) as Record<string, unknown>),
      },
      jobs: normalizeQueueJobs((p as any).generationQueue?.jobs),
      submissionAuditLogs: Array.isArray((p as any).generationQueue?.submissionAuditLogs)
        ? (p as any).generationQueue.submissionAuditLogs
            .map((item: any) => ({
              id: String(item?.id ?? randomUUID()),
              shotId: String(item?.shotId ?? '').trim(),
              shotIndex: Number(item?.shotIndex ?? 0) || undefined,
              trigger:
                String(item?.trigger ?? '').trim() === 'single_submit' ||
                String(item?.trigger ?? '').trim() === 'batch_submit' ||
                String(item?.trigger ?? '').trim() === 'auto_run_submit' ||
                String(item?.trigger ?? '').trim() === 'force_regenerate_submit'
                  ? item.trigger
                  : 'single_submit',
              provider: String(item?.provider ?? '').trim() || undefined,
              model: String(item?.model ?? '').trim() || undefined,
              requestCapability: String(item?.requestCapability ?? '').trim() || undefined,
              submissionFingerprint: String(item?.submissionFingerprint ?? '').trim() || undefined,
              firstFramePath: String(item?.firstFramePath ?? '').trim() || undefined,
              lastFramePath: String(item?.lastFramePath ?? '').trim() || undefined,
              taskId: String(item?.taskId ?? '').trim() || undefined,
              remoteStatus: String(item?.remoteStatus ?? '').trim() || undefined,
              sourceEvent: String(item?.sourceEvent ?? '').trim() || undefined,
              status:
                String(item?.status ?? '').trim() === 'task_accepted' ||
                String(item?.status ?? '').trim() === 'direct_output' ||
                String(item?.status ?? '').trim() === 'missing_task' ||
                String(item?.status ?? '').trim() === 'request_failed'
                  ? item.status
                  : 'request_started',
              error: String(item?.error ?? '').trim() || undefined,
              createdAt: Number(item?.createdAt ?? now()) || now(),
            }))
            .filter((item: any) => Boolean(item.shotId))
            .slice(0, 200)
        : [],
      runtime: {
        submitActive: Number((p as any).generationQueue?.runtime?.submitActive ?? 0) || 0,
        pollActive: Number((p as any).generationQueue?.runtime?.pollActive ?? 0) || 0,
        downloadActive: Number((p as any).generationQueue?.runtime?.downloadActive ?? 0) || 0,
        submitQueued: Number((p as any).generationQueue?.runtime?.submitQueued ?? 0) || 0,
        pollQueued: Number((p as any).generationQueue?.runtime?.pollQueued ?? 0) || 0,
        downloadQueued: Number((p as any).generationQueue?.runtime?.downloadQueued ?? 0) || 0,
        updatedAt: Number((p as any).generationQueue?.runtime?.updatedAt ?? now()) || now(),
      },
      paused: Boolean((p as any).generationQueue?.paused ?? false),
    },
    scriptVariantCandidates,
    selectedScriptVariantId: String((p as any).selectedScriptVariantId ?? '').trim() || undefined,
    storyboardGridBatches,
    storyboardFrames,
    projectIdentityGridPath: String((p as any).projectIdentityGridPath ?? '').trim() || undefined,
    projectIdentityGridStatus:
      (p as any).projectIdentityGridStatus === 'generating' ||
      (p as any).projectIdentityGridStatus === 'done' ||
      (p as any).projectIdentityGridStatus === 'failed'
        ? (p as any).projectIdentityGridStatus
        : 'idle',
    projectIdentityGridUpdatedAt: Number((p as any).projectIdentityGridUpdatedAt ?? 0) || undefined,
    projectIdentityGridPromptPreview:
      (p as any).projectIdentityGridPromptPreview && typeof (p as any).projectIdentityGridPromptPreview === 'object'
        ? {
            profile:
              (p as any).projectIdentityGridPromptPreview.profile &&
              typeof (p as any).projectIdentityGridPromptPreview.profile === 'object'
                ? { ...(p as any).projectIdentityGridPromptPreview.profile }
                : undefined,
            description: String((p as any).projectIdentityGridPromptPreview.description ?? '').trim() || undefined,
            prompt: String((p as any).projectIdentityGridPromptPreview.prompt ?? '').trim() || undefined,
            productType:
              (p as any).projectIdentityGridPromptPreview.productType === 'earrings' ||
              (p as any).projectIdentityGridPromptPreview.productType === 'phone_case' ||
              (p as any).projectIdentityGridPromptPreview.productType === 'clothes' ||
              (p as any).projectIdentityGridPromptPreview.productType === 'toy'
                ? (p as any).projectIdentityGridPromptPreview.productType
                : 'general',
            productPoints: String((p as any).projectIdentityGridPromptPreview.productPoints ?? '').trim() || undefined,
            productReferenceImageCount: Number((p as any).projectIdentityGridPromptPreview.productReferenceImageCount ?? 0) || 0,
            productReferenceImagePaths: Array.isArray((p as any).projectIdentityGridPromptPreview.productReferenceImagePaths)
              ? (p as any).projectIdentityGridPromptPreview.productReferenceImagePaths.map(String).filter(Boolean)
              : [],
            modelReferenceImageCount: Number((p as any).projectIdentityGridPromptPreview.modelReferenceImageCount ?? 0) || 0,
            modelReferenceImagePaths: Array.isArray((p as any).projectIdentityGridPromptPreview.modelReferenceImagePaths)
              ? (p as any).projectIdentityGridPromptPreview.modelReferenceImagePaths.map(String).filter(Boolean)
              : [],
            gridUsagePlan: Array.isArray((p as any).projectIdentityGridPromptPreview.gridUsagePlan)
              ? (p as any).projectIdentityGridPromptPreview.gridUsagePlan.map(String).filter(Boolean)
              : [],
            requestProvider: String((p as any).projectIdentityGridPromptPreview.requestProvider ?? '').trim() || undefined,
            requestModel: String((p as any).projectIdentityGridPromptPreview.requestModel ?? '').trim() || undefined,
            requestJson: String((p as any).projectIdentityGridPromptPreview.requestJson ?? '').trim() || undefined,
          }
        : undefined,
    boundProductSnapshot,
    shotVideoOutputs: Array.from(mergedShotVideoOutputs.values()),
    autoFlowStatus: (p as any).autoFlowStatus
      ? {
          enabled: Boolean((p as any).autoFlowStatus.enabled),
          targetStage:
            String((p as any).autoFlowStatus.targetStage ?? '').trim() === 'final_compose'
              ? ('final_compose' as const)
              : ('storyboard_videos' as const),
          status:
            (p as any).autoFlowStatus.status === 'running' ||
            (p as any).autoFlowStatus.status === 'done' ||
            (p as any).autoFlowStatus.status === 'partial_failed' ||
            (p as any).autoFlowStatus.status === 'failed'
              ? (p as any).autoFlowStatus.status
              : 'idle',
          currentStage: migrateAutoFlowStage((p as any).autoFlowStatus.currentStage),
          imageRetryLimit: Number((p as any).autoFlowStatus.imageRetryLimit ?? 2) || 2,
          videoRetryLimit: Number((p as any).autoFlowStatus.videoRetryLimit ?? 2) || 2,
          lastStartedAt: Number((p as any).autoFlowStatus.lastStartedAt ?? 0) || undefined,
          lastCompletedAt: Number((p as any).autoFlowStatus.lastCompletedAt ?? 0) || undefined,
          lastSummary: String((p as any).autoFlowStatus.lastSummary ?? '').trim() || undefined,
        }
      : undefined,
    finalCompose,
    previewPipeline: (p as any).previewPipeline
      ? {
          status: ['idle', 'running', 'preview_ready', 'background_running', 'done', 'failed'].includes(String((p as any).previewPipeline?.status))
            ? (p as any).previewPipeline.status
            : 'idle',
          previewOutputPath: String((p as any).previewPipeline?.previewOutputPath ?? '').trim() || undefined,
          previewReportPath: String((p as any).previewPipeline?.previewReportPath ?? '').trim() || undefined,
          foregroundPlanId: String((p as any).previewPipeline?.foregroundPlanId ?? '').trim() || undefined,
          remainingPlanIds: Array.isArray((p as any).previewPipeline?.remainingPlanIds)
            ? (p as any).previewPipeline.remainingPlanIds.map(String).filter(Boolean)
            : [],
          lastError: String((p as any).previewPipeline?.lastError ?? '').trim() || undefined,
          updatedAt: Number((p as any).previewPipeline?.updatedAt || now()),
        }
      : undefined,
    defaultGenerationPolicy: (p as any).defaultGenerationPolicy ?? {
      qualityProfile: 'high',
      variantStrength: 'medium',
    },
    workflowV2: {
      currentStep: currentWorkflowStep as any,
      stepStatus: workflowStepStatus as any,
      updatedAt: workflowUpdatedAt,
    },
  }
}

export const cloneRepo = {
  async readDb(): Promise<CloneDbShape> {
    return await queueCloneDbMutation(async () => {
      const db = await readCloneDbSource()
      const normalizedLibrary = Array.isArray(db.modelIdentityLibrary) ? db.modelIdentityLibrary.map(normalizeIdentityLibraryItem) : []
      const normalizedGroups = Array.isArray(db.projectGroups) ? db.projectGroups.map(normalizeProjectGroup) : []
      const normalizedProjects = db.projects.map(normalizeProject)
      let changed = JSON.stringify(normalizedLibrary) !== JSON.stringify(db.modelIdentityLibrary ?? [])
      changed = changed || JSON.stringify(normalizedGroups) !== JSON.stringify(db.projectGroups ?? [])
      const groupById = new Map(normalizedGroups.map((x) => [x.id, x]))

      const libraryById = new Map(normalizedLibrary.map((x) => [x.id, x]))
      const existingImagePathSet = new Set(
        normalizedLibrary.flatMap((x) => x.imagePaths.map((p) => String(p || '').trim()).filter(Boolean)),
      )

      // Recover legacy model packs/snapshots from every project into the global model library.
      for (const project of normalizedProjects) {
        const legacyPacks = Array.isArray(project.modelIdentityPacks) ? project.modelIdentityPacks : []
        const candidates: Array<any> = []
        if (project.selectedModelIdentitySnapshot) {
          candidates.push({
            ...project.selectedModelIdentitySnapshot,
            id: project.selectedModelIdentitySnapshot.id || project.selectedModelIdentityId,
          })
        }
        for (const pack of legacyPacks) {
          if (!pack) continue
          candidates.push(pack)
        }
        for (const item of candidates) {
          const candidateId = String(item?.id ?? '').trim()
          if (!candidateId || libraryById.has(candidateId)) continue
          const recovered = normalizeIdentityLibraryItem({
            ...item,
            id: candidateId,
            name: String(item?.name ?? '').trim() || nextIdentityName(normalizedLibrary),
            coverImagePath: item?.coverImagePath ?? item?.imagePaths?.[0],
          })
          normalizedLibrary.unshift(recovered)
          libraryById.set(recovered.id, recovered)
          for (const p of recovered.imagePaths) existingImagePathSet.add(String(p || '').trim())
          changed = true
        }
      }

      // Recover orphan model-identity image folders from disk when db records were lost.
      if (normalizedLibrary.length <= 1) {
        try {
          const viralCloneRoot = join(getAppPaths().dataDir, 'viral-clone')
          const rootDirs = await readdir(viralCloneRoot, { withFileTypes: true })
          for (const rootDir of rootDirs) {
            if (!rootDir.isDirectory()) continue
            const projectId = rootDir.name
            const modelDir = join(viralCloneRoot, projectId, 'model-identity')
            let images: string[] = []
            try {
              images = (await readdir(modelDir, { withFileTypes: true }))
                .filter((x) => x.isFile() && /\.png$/i.test(x.name))
                .map((x) => join(modelDir, x.name))
            } catch {
              continue
            }
            if (!images.length) continue
            images.sort((a, b) => b.localeCompare(a))
            const uniqueNew = images.filter((p) => !existingImagePathSet.has(p))
            if (!uniqueNew.length) continue
            const recoveredId = `recovered-${projectId}`
            if (libraryById.has(recoveredId)) continue
            const recovered = normalizeIdentityLibraryItem({
              id: recoveredId,
              status: 'done',
              name: `恢复模特 ${projectId.slice(0, 8)}`,
              productType: 'general',
              market: 'Southeast Asian market',
              gender: 'female',
              ageRange: '20-28',
              hairStyle: 'natural dark hair',
              skinTone: 'natural warm skin tone',
              outfitStyle: 'clean casual outfit',
              mood: 'calm confident friendly',
              sceneStyle: 'soft daylight social commerce studio',
              description: `Recovered from local folder ${projectId}/model-identity`,
              imagePaths: uniqueNew,
              coverImagePath: uniqueNew[0],
              model: 'recovered-local',
            })
            normalizedLibrary.unshift(recovered)
            libraryById.set(recovered.id, recovered)
            for (const p of recovered.imagePaths) existingImagePathSet.add(String(p || '').trim())
            changed = true
          }
        } catch {
          // ignore recovery scan errors
        }
      }

      const migratedProjects = normalizedProjects.map((project) => {
        const next = { ...project }
        const linkedGroup = next.groupId ? groupById.get(next.groupId) : undefined
        if (next.groupId && linkedGroup) {
          next.groupName = linkedGroup.name
        } else if (next.groupId && !linkedGroup) {
          next.groupId = undefined
          next.groupName = undefined
          changed = true
        } else if (!next.groupId && next.groupName) {
          next.groupName = undefined
          changed = true
        }
        const hasSelectedIdentity = Boolean(next.selectedModelIdentityId)
        const legacyPacks = next.modelIdentityPacks ?? []
        if (!hasSelectedIdentity && legacyPacks.length) {
          const selectedLegacy =
            legacyPacks.find((x) => x.id === next.selectedModelIdentityPackId) ??
            legacyPacks.find((x) => x.confirmed) ??
            legacyPacks[0]
          if (selectedLegacy) {
            let libraryItem = libraryById.get(selectedLegacy.id)
            if (!libraryItem) {
              libraryItem = normalizeIdentityLibraryItem({
                ...selectedLegacy,
                name: nextIdentityName(normalizedLibrary),
                coverImagePath: selectedLegacy.imagePaths?.[0],
              })
              normalizedLibrary.unshift(libraryItem)
              libraryById.set(libraryItem.id, libraryItem)
              changed = true
            }
            next.selectedModelIdentityId = libraryItem.id
            next.selectedModelIdentitySnapshot = snapshotFromLibraryItem(libraryItem)
            changed = true
          }
        } else if (next.selectedModelIdentityId) {
          const linked = libraryById.get(next.selectedModelIdentityId)
          if (linked) {
            next.selectedModelIdentitySnapshot = snapshotFromLibraryItem(linked)
          } else {
            const fallbackSource =
              next.selectedModelIdentitySnapshot ??
              legacyPacks.find((x) => x.id === next.selectedModelIdentityId) ??
              legacyPacks[0]
            if (fallbackSource) {
              const recovered = normalizeIdentityLibraryItem({
                ...fallbackSource,
                id: next.selectedModelIdentityId,
                name: String((fallbackSource as any)?.name ?? '').trim() || nextIdentityName(normalizedLibrary),
                coverImagePath: (fallbackSource as any)?.coverImagePath ?? (fallbackSource as any)?.imagePaths?.[0],
              })
              normalizedLibrary.unshift(recovered)
              libraryById.set(recovered.id, recovered)
              next.selectedModelIdentitySnapshot = snapshotFromLibraryItem(recovered)
              changed = true
            }
          }
        }
        next.modelIdentityPacks = legacyPacks.length ? legacyPacks : linkedLegacyPacks(next.selectedModelIdentitySnapshot, next.selectedModelIdentityId)
        return next
      })

      if (changed || JSON.stringify(migratedProjects) !== JSON.stringify(db.projects)) {
        await writeCloneDbSource({ projects: migratedProjects, projectGroups: normalizedGroups, modelIdentityLibrary: normalizedLibrary })
      }
      return { projects: migratedProjects, projectGroups: normalizedGroups, modelIdentityLibrary: normalizedLibrary }
    })
  },

  async listProjects(): Promise<CloneProject[]> {
    return await queueCloneDbMutation(async () => {
      const projects = readCloneProjectsFromSqlite()
      return projects.map(normalizeProject)
    })
  },

  async listRawProjects(): Promise<CloneProject[]> {
    return await queueCloneDbMutation(async () => {
      return readCloneProjectsFromSqlite()
    })
  },

  async getProject(id: string): Promise<CloneProject | null> {
    const targetId = String(id || '').trim()
    if (!targetId) return null
    return await queueCloneDbMutation(async () => {
      const project = readCloneProjectByIdFromSqlite(targetId)
      return project ? normalizeProject(project) : null
    })
  },

  async createProject(input: {
    locale: CloneLocale
    strength: CloneStrength
    runMode?: CloneRunMode
    referenceVideoPath: string
    referenceVideoName: string
    title?: string
    description?: string
  }): Promise<CloneProject> {
    return await queueCloneDbMutation(async () => {
      const item: CloneProject = {
        id: randomUUID(),
        createdAt: now(),
        updatedAt: now(),
        title: String(input.title ?? '').trim() || defaultCloneProjectTitle(now()),
        description: String(input.description ?? '').trim() || undefined,
        archived: false,
        status: 'draft',
        runMode: normalizeRunMode(input.runMode),
        locale: input.locale,
        strength: input.strength,
        referenceVideoPath: input.referenceVideoPath,
        referenceVideoName: input.referenceVideoName,
        baseBlueprint: null,
        blueprint: null,
        aiTasks: [],
        reviewDecisions: {},
        sessions: [],
        modelIdentityPacks: [],
        defaultGenerationPolicy: {
          qualityProfile: 'high',
          variantStrength: 'medium',
        },
        policy: defaultPolicy(),
      }
      const next = normalizeProject(item)
      upsertCloneProjectInSqlite(next)
      return next
    })
  },

  async upsertProject(input: CloneProject): Promise<CloneProject> {
    return await queueCloneDbMutation(async () => {
      const current = readCloneProjectByIdFromSqlite(input.id)
      const normalizedCurrent = current ? normalizeProject(current) : null
      const mergedInput =
        normalizedCurrent
          ? {
              ...normalizedCurrent,
              ...input,
              blueprint: mergeBlueprintShotsForPersistence(normalizedCurrent.blueprint, input.blueprint),
              shotVideoOutputs: mergeShotVideoOutputsForPersistence(normalizedCurrent.shotVideoOutputs, input.shotVideoOutputs),
            }
          : input
      const next = normalizeProject({ ...mergedInput, updatedAt: now() })
      const debugOutputs = Array.isArray(next.shotVideoOutputs)
        ? next.shotVideoOutputs
            .filter((item) => ['shot_1', 'shot_2', 'shot_3'].includes(String(item?.shotId ?? '')))
            .map((item) => ({
              shotId: item.shotId,
              taskId: item.taskId,
              provider: item.provider,
              model: item.model,
              status: item.status,
            }))
        : []
      console.log('[clone-debug] repo-upsert-project', {
        dbDir: getAppPaths().dbDir,
        projectId: next.id,
        shotVideoOutputs: debugOutputs,
      })
      upsertCloneProjectInSqlite(next)
      return next
    })
  },

  async removeProject(id: string): Promise<{ ok: true }> {
    return await queueCloneDbMutation(async () => {
      removeCloneProjectFromSqlite(id)
      return { ok: true }
    })
  },

  async listProjectGroups(): Promise<CloneProjectGroup[]> {
    const db = await this.readDb()
    return [...(db.projectGroups ?? [])].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || Number(a.createdAt || 0) - Number(b.createdAt || 0))
  },

  async getProjectGroup(id: string): Promise<CloneProjectGroup | null> {
    const all = await this.listProjectGroups()
    return all.find((x) => x.id === id) ?? null
  },

  async createProjectGroup(input: { name: string }): Promise<CloneProjectGroup> {
    return await queueCloneDbMutation(async () => {
      const db = await readCloneDbSource()
      const groups = Array.isArray(db.projectGroups) ? db.projectGroups.map(normalizeProjectGroup) : []
      const next = normalizeProjectGroup({
        id: randomUUID(),
        name: input.name,
        createdAt: now(),
        updatedAt: now(),
        sortOrder: groups.length,
      })
      db.projectGroups = [...groups, next]
      await writeCloneDbSource(db)
      return next
    })
  },

  async upsertProjectGroup(input: CloneProjectGroup): Promise<CloneProjectGroup> {
    return await queueCloneDbMutation(async () => {
      const db = await readCloneDbSource()
      const groups = Array.isArray(db.projectGroups) ? db.projectGroups.map(normalizeProjectGroup) : []
      const idx = groups.findIndex((x) => x.id === input.id)
      const next = normalizeProjectGroup({ ...input, updatedAt: now() })
      if (idx >= 0) groups[idx] = next
      else groups.push(next)
      db.projectGroups = groups
      db.projects = (Array.isArray(db.projects) ? db.projects : []).map((project) => {
        const normalized = normalizeProject(project)
        if (normalized.groupId !== next.id) return normalized
        return normalizeProject({ ...normalized, groupName: next.name })
      })
      await writeCloneDbSource(db)
      return next
    })
  },

  async removeProjectGroup(id: string): Promise<{ ok: true }> {
    return await queueCloneDbMutation(async () => {
      const db = await readCloneDbSource()
      db.projectGroups = (Array.isArray(db.projectGroups) ? db.projectGroups : []).map(normalizeProjectGroup).filter((x) => x.id !== id)
      db.projects = (Array.isArray(db.projects) ? db.projects : []).map((project) => {
        const normalized = normalizeProject(project)
        if (normalized.groupId !== id) return normalized
        return normalizeProject({ ...normalized, groupId: undefined, groupName: undefined })
      })
      await writeCloneDbSource(db)
      return { ok: true }
    })
  },

  async listModelIdentityLibrary(): Promise<ModelIdentityLibraryItem[]> {
    const db = await this.readDb()
    return [...(db.modelIdentityLibrary ?? [])].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  },

  async getModelIdentity(id: string): Promise<ModelIdentityLibraryItem | null> {
    const all = await this.listModelIdentityLibrary()
    return all.find((x) => x.id === id) ?? null
  },

  async upsertModelIdentity(input: ModelIdentityLibraryItem): Promise<ModelIdentityLibraryItem> {
    return await queueCloneDbMutation(async () => {
      const db = await readCloneDbSource()
      const idx = (db.modelIdentityLibrary ?? []).findIndex((x) => x.id === input.id)
      const next = normalizeIdentityLibraryItem({ ...input, updatedAt: now() })
      if (!db.modelIdentityLibrary) db.modelIdentityLibrary = []
      if (idx >= 0) db.modelIdentityLibrary[idx] = next
      else db.modelIdentityLibrary.unshift(next)

      db.projects = (Array.isArray(db.projects) ? db.projects : []).map((project) => {
        const normalizedProject = normalizeProject(project)
        if (normalizedProject.selectedModelIdentityId !== next.id) return normalizedProject
        return normalizeProject({
          ...normalizedProject,
          selectedModelIdentitySnapshot: snapshotFromLibraryItem(next),
          selectedModelIdentityPackId: next.id,
          modelIdentityPacks: linkedLegacyPacks(snapshotFromLibraryItem(next), next.id),
        })
      })
      await writeCloneDbSource(db)
      return next
    })
  },

  async deleteModelIdentity(id: string): Promise<{ ok: true }> {
    return await queueCloneDbMutation(async () => {
      const db = await readCloneDbSource()
      db.modelIdentityLibrary = (db.modelIdentityLibrary ?? []).filter((x) => x.id !== id)
      db.projects = (Array.isArray(db.projects) ? db.projects : []).map((project) => {
        const normalizedProject = normalizeProject(project)
        if (normalizedProject.selectedModelIdentityId !== id) return normalizedProject
        return normalizeProject({
          ...normalizedProject,
          selectedModelIdentityId: undefined,
          selectedModelIdentityPackId: undefined,
          selectedModelIdentitySnapshot: undefined,
          modelIdentityPacks: [],
        })
      })
      await writeCloneDbSource(db)
      return { ok: true }
    })
  },

  async getCredentials(): Promise<ModelCredentials> {
    const settings = await readJsonFile<CloneSettingsShape>(cloneSettingsPath(), {})
    return decryptCredentials(settings)
  },

  getCredentialsSync(): ModelCredentials {
    try {
      const raw = readFileSync(cloneSettingsPath(), 'utf8')
      return decryptCredentials(JSON.parse(raw || '{}') as CloneSettingsShape)
    } catch {
      return decryptCredentials({})
    }
  },

  async setCredentials(input: ModelCredentials): Promise<{ ok: true }> {
    const current = await readJsonFile<CloneSettingsShape>(cloneSettingsPath(), {})
    await writeJsonFile(cloneSettingsPath(), {
      ...encryptCredentials(normalizeCredentials(input)),
      runtimeOptions: normalizeCloneRuntimeOptions(current.runtimeOptions),
    })
    return { ok: true }
  },

  async getRuntimeOptions(): Promise<CloneRuntimeOptions> {
    const settings = await readJsonFile<CloneSettingsShape>(cloneSettingsPath(), {})
    return normalizeCloneRuntimeOptions(settings.runtimeOptions)
  },

  async setRuntimeOptions(input: Partial<CloneRuntimeOptions>): Promise<CloneRuntimeOptions> {
    const settings = await readJsonFile<CloneSettingsShape>(cloneSettingsPath(), {})
    const next = normalizeCloneRuntimeOptions({
      ...settings.runtimeOptions,
      ...input,
    })
    await writeJsonFile(cloneSettingsPath(), {
      ...settings,
      runtimeOptions: next,
    })
    return next
  },


  async ensureSeed() {
    const readyState = await ensureCloneSqliteReady()
    await readJsonFile<CloneSettingsShape>(cloneSettingsPath(), {})
    return readyState
  },
}
