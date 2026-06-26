import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readFile, readdir, rm } from 'node:fs/promises'
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
  readCloneSettingsFromSqlite,
  readCloneProjectByIdFromSqlite,
  readCloneProjectsFromSqlite,
  readCloneDbFromSqlite,
  removeCloneProjectFromSqlite,
  upsertCloneProjectInSqlite,
  writeCloneSettingsToSqlite,
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
  ModelTask,
  CloneScriptFramework,
  ClonePromptCacheEntry,
  CloneFrameCacheEntry,
  CloneCloudClipCacheEntry,
  CloneShotVideoOutput,
  ApifoxHubCredentials,
  HermesIntegrationSettings,
} from './types'
import { buildReferenceLock } from './prompt'
import { inferStoryboardReferenceDecision } from './storyboardReference'
import {
  mapPlatformToStoredProvider,
  normalizeIncomingPlatformProfile,
  resolveCapabilityPlatform,
  type PlatformProfile,
} from '../../../shared/platformSettings'

type CloneDbShape = {
  projects: CloneProject[]
  projectGroups?: CloneProjectGroup[]
  modelIdentityLibrary?: ModelIdentityLibraryItem[]
  modelTasks?: ModelTask[]
}

type CloneSettingsShape = {
  encryptedCredentials?: string
  plaintextCredentials?: ModelCredentials
  runtimeOptions?: CloneRuntimeOptions
  hermesIntegration?: HermesIntegrationSettings
}

export type CloneRuntimeOptions = {
  storyboardFrameConcurrency: number
  globalStoryboardFrameConcurrency: number
}

const DEFAULT_CLONE_RUNTIME_OPTIONS: CloneRuntimeOptions = {
  storyboardFrameConcurrency: 3,
  globalStoryboardFrameConcurrency: 2,
}

const DEFAULT_HERMES_INTEGRATION_SETTINGS: HermesIntegrationSettings = {
  enabled: false,
  callbackBaseUrl: '',
  feishu: {
    enabled: false,
    appId: '',
    appSecret: '',
    tenantAccessToken: '',
    receiveIdType: 'open_id',
    defaultReceiveId: '',
  },
  wecom: {
    enabled: false,
    corpId: '',
    corpSecret: '',
    accessToken: '',
    agentId: '',
    defaultToUser: '',
  },
}

const cloneDbPath = () => join(getAppPaths().dbDir, 'clone-projects.json')
const cloneSettingsPath = () => join(getAppPaths().dbDir, 'clone-settings.json')
const legacyUserDataCloneDbPath = () => join(getAppPaths().userData, 'videogenerate', 'db', 'clone-projects.json')
const legacyUserDataCloneSettingsPath = () => join(getAppPaths().userData, 'videogenerate', 'db', 'clone-settings.json')
let cloneDbMutationQueue: Promise<unknown> = Promise.resolve()
const removedProjectTombstones = new Map<string, number>()
const removedModelIdentityTombstones = new Map<string, number>()
const REMOVED_PROJECT_TOMBSTONE_TTL_MS = 30 * 60 * 1000
const REMOVED_MODEL_IDENTITY_TOMBSTONE_TTL_MS = 30 * 60 * 1000

export type CloneSqliteReadyState = {
  migrated: boolean
  source: 'sqlite' | 'json_import' | 'empty'
}

function now() {
  return Date.now()
}

function pruneRemovedProjectTombstones(currentTime = now()) {
  for (const [projectId, expiresAt] of removedProjectTombstones.entries()) {
    if (expiresAt <= currentTime) removedProjectTombstones.delete(projectId)
  }
}

function markRemovedProject(projectId: string, currentTime = now()) {
  const safeProjectId = String(projectId || '').trim()
  if (!safeProjectId) return
  pruneRemovedProjectTombstones(currentTime)
  removedProjectTombstones.set(safeProjectId, currentTime + REMOVED_PROJECT_TOMBSTONE_TTL_MS)
}

function isRemovedProjectMarked(projectId: string, currentTime = now()) {
  const safeProjectId = String(projectId || '').trim()
  if (!safeProjectId) return false
  pruneRemovedProjectTombstones(currentTime)
  const expiresAt = removedProjectTombstones.get(safeProjectId)
  return typeof expiresAt === 'number' && expiresAt > currentTime
}

function pruneRemovedModelIdentityTombstones(currentTime = now()) {
  for (const [identityId, expiresAt] of removedModelIdentityTombstones.entries()) {
    if (expiresAt <= currentTime) removedModelIdentityTombstones.delete(identityId)
  }
}

function markRemovedModelIdentity(identityId: string, currentTime = now()) {
  const safeIdentityId = String(identityId || '').trim()
  if (!safeIdentityId) return
  pruneRemovedModelIdentityTombstones(currentTime)
  removedModelIdentityTombstones.set(safeIdentityId, currentTime + REMOVED_MODEL_IDENTITY_TOMBSTONE_TTL_MS)
}

function isRemovedModelIdentityMarked(identityId: string, currentTime = now()) {
  const safeIdentityId = String(identityId || '').trim()
  if (!safeIdentityId) return false
  pruneRemovedModelIdentityTombstones(currentTime)
  const expiresAt = removedModelIdentityTombstones.get(safeIdentityId)
  return typeof expiresAt === 'number' && expiresAt > currentTime
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
    return { projects: [], projectGroups: [], modelIdentityLibrary: [], modelTasks: [] }
  }
}

async function readCloneDbFile(): Promise<CloneDbShape> {
  return await readCloneDbFileAt(cloneDbPath())
}

function normalizeModelTask(item: any): ModelTask {
  return {
    id: String(item?.id ?? randomUUID()),
    createdAt: Number(item?.createdAt ?? now()),
    updatedAt: Number(item?.updatedAt ?? now()),
    title: String(item?.title ?? '').trim() || 'New Model Task',
    description: String(item?.description ?? '').trim() || undefined,
    status:
      item?.status === 'generating' || item?.status === 'done' || item?.status === 'failed'
        ? item.status
        : 'draft',
    sourceProjectId: String(item?.sourceProjectId ?? '').trim() || undefined,
    sourceProjectTitle: String(item?.sourceProjectTitle ?? '').trim() || undefined,
    sourceProjectReferenceVideoName: String(item?.sourceProjectReferenceVideoName ?? '').trim() || undefined,
    sourceProjectReferenceVideoPath: String(item?.sourceProjectReferenceVideoPath ?? '').trim() || undefined,
    productType:
      item?.productType === 'earrings' ||
      item?.productType === 'phone_case' ||
      item?.productType === 'clothes' ||
      item?.productType === 'toy'
        ? item.productType
        : 'general',
    productPoints: String(item?.productPoints ?? '').trim() || undefined,
    modelProfileOptions: item?.modelProfileOptions && typeof item.modelProfileOptions === 'object' ? { ...item.modelProfileOptions } : undefined,
    productReferenceImagePaths: Array.isArray(item?.productReferenceImagePaths) ? item.productReferenceImagePaths.map(String).filter(Boolean) : [],
    modelReferenceImagePaths: Array.isArray(item?.modelReferenceImagePaths) ? item.modelReferenceImagePaths.map(String).filter(Boolean) : [],
    projectIdentityGridPath: String(item?.projectIdentityGridPath ?? '').trim() || undefined,
    projectIdentityGridStatus:
      item?.projectIdentityGridStatus === 'generating' ||
      item?.projectIdentityGridStatus === 'done' ||
      item?.projectIdentityGridStatus === 'failed'
        ? item.projectIdentityGridStatus
        : 'idle',
    projectIdentityGridUpdatedAt: Number(item?.projectIdentityGridUpdatedAt ?? 0) || undefined,
    projectIdentityGridPromptPreview:
      item?.projectIdentityGridPromptPreview && typeof item.projectIdentityGridPromptPreview === 'object'
        ? {
            ...item.projectIdentityGridPromptPreview,
            profile:
              item.projectIdentityGridPromptPreview.profile && typeof item.projectIdentityGridPromptPreview.profile === 'object'
                ? { ...item.projectIdentityGridPromptPreview.profile }
                : undefined,
          }
        : undefined,
    selectedModelIdentityId: String(item?.selectedModelIdentityId ?? '').trim() || undefined,
    selectedModelIdentitySnapshot: item?.selectedModelIdentitySnapshot ? normalizeIdentityLibraryItem(item.selectedModelIdentitySnapshot) : undefined,
    modelIdentityPackId: String(item?.modelIdentityPackId ?? '').trim() || undefined,
    error: String(item?.error ?? '').trim() || undefined,
  }
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

function inferNormalizedRunMode(projectLike: any): CloneRunMode {
  if (projectLike?.runMode === 'auto') return 'auto'
  if (projectLike?.autoFlowStatus?.enabled) return 'auto'
  const autoTargetStage = String(projectLike?.autoFlowStatus?.targetStage ?? '').trim()
  if (autoTargetStage === 'final_compose') return 'auto'
  const hasAutoRunSubmitAudit = Array.isArray(projectLike?.generationQueue?.submissionAuditLogs) &&
    projectLike.generationQueue.submissionAuditLogs.some((item: any) => String(item?.trigger ?? '').trim() === 'auto_run_submit')
  if (hasAutoRunSubmitAudit) return 'auto'
  return 'manual'
}

function shouldPersistInferredRunMode(projectLike: any) {
  const stored = String(projectLike?.runMode ?? '').trim()
  if (stored === 'auto' || stored === 'manual') return false
  return inferNormalizedRunMode(projectLike) === 'auto'
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
  return v === 'seedance' || v === 'kling' || v === 'grsai' || v === 'apifox_hub' ? v : fallback
}

function normalizeImageProvider(v: unknown, fallback: ImageProviderName): ImageProviderName {
  return v === 'openai' || v === 'grsai' || v === 'apifox_hub' ? v : fallback
}

function normalizeCapabilityProvider(v: unknown, fallback: 'grsai' | 'apifox_hub'): 'grsai' | 'apifox_hub' {
  return v === 'grsai' || v === 'apifox_hub' ? v : fallback
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
      parsed?.videoProvider === 'xibapi' ||
      parsed?.videoProvider === 'gaorui'
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

function hasOwnHubPayload(parsed: any, key: 'ai666Hub' | 'vectorEngineHub' | 'xibapiHub' | 'gaoruiHub') {
  return Boolean(parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, key))
}

function normalizeDbCollection<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : []
}

function mergeMissingLegacyEntries(target: CloneDbShape, legacy: CloneDbShape) {
  const nextProjects = [...normalizeDbCollection(target.projects)]
  const nextGroups = [...normalizeDbCollection(target.projectGroups)]
  const nextIdentities = [...normalizeDbCollection(target.modelIdentityLibrary)]
  const nextModelTasks = [...normalizeDbCollection(target.modelTasks)]
  const projectIds = new Set(nextProjects.map((item) => String((item as any)?.id || '').trim()).filter(Boolean))
  const groupIds = new Set(nextGroups.map((item) => String((item as any)?.id || '').trim()).filter(Boolean))
  const identityIds = new Set(nextIdentities.map((item) => String((item as any)?.id || '').trim()).filter(Boolean))
  const modelTaskIds = new Set(nextModelTasks.map((item) => String((item as any)?.id || '').trim()).filter(Boolean))
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
    if (isRemovedModelIdentityMarked(id)) continue
    if (!id || identityIds.has(id)) continue
    nextIdentities.push(item)
    identityIds.add(id)
    changed = true
  }
  for (const item of normalizeDbCollection(legacy.modelTasks)) {
    const id = String((item as any)?.id || '').trim()
    if (!id || modelTaskIds.has(id)) continue
    nextModelTasks.push(item)
    modelTaskIds.add(id)
    changed = true
  }

  return {
    changed,
    db: {
      projects: nextProjects,
      projectGroups: nextGroups,
      modelIdentityLibrary: nextIdentities,
      modelTasks: nextModelTasks,
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
  let nextDb: CloneDbShape = { projects: [], projectGroups: [], modelIdentityLibrary: [], modelTasks: [] }
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
    modelTasks: normalizeDbCollection(nextDb.modelTasks),
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
    modelTasks: normalizeDbCollection(db.modelTasks),
  }
}

async function writeCloneDbSource(input: CloneDbShape) {
  const normalized: CloneDbShape = {
    projects: Array.isArray(input.projects) ? input.projects : [],
    projectGroups: Array.isArray(input.projectGroups) ? input.projectGroups : [],
    modelIdentityLibrary: Array.isArray(input.modelIdentityLibrary) ? input.modelIdentityLibrary : [],
    modelTasks: Array.isArray(input.modelTasks) ? input.modelTasks : [],
  }
  await ensureCloneSqliteReady()
  writeCloneDbToSqlite({
    projects: normalized.projects,
    projectGroups: normalized.projectGroups ?? [],
    modelIdentityLibrary: normalized.modelIdentityLibrary ?? [],
    modelTasks: normalized.modelTasks ?? [],
  })
}

async function removeProjectFromLegacyJsonSnapshots(projectId: string) {
  const safeProjectId = String(projectId || '').trim()
  if (!safeProjectId) return
  const legacyCandidates = [cloneDbPath(), legacyUserDataCloneDbPath()]
    .map((item) => String(item || '').trim())
    .filter((item, index, list) => Boolean(item) && list.indexOf(item) === index)
  for (const legacyPath of legacyCandidates) {
    if (!existsSync(legacyPath)) continue
    try {
      const legacyDb = await readCloneDbFileAt(legacyPath)
      const currentProjects = Array.isArray(legacyDb.projects) ? legacyDb.projects : []
      const nextProjects = currentProjects.filter((project) => String(project?.id || '').trim() !== safeProjectId)
      if (nextProjects.length === currentProjects.length) continue
      await writeJsonFile(legacyPath, {
        ...legacyDb,
        projects: nextProjects,
      })
    } catch (error) {
      console.warn('[clone-repo] remove project from legacy json skipped', {
        projectId: safeProjectId,
        legacyPath,
        message: String((error as Error)?.message ?? error ?? 'unknown error'),
      })
    }
  }
}

async function removeModelIdentityFromLegacyJsonSnapshots(identityId: string) {
  const safeIdentityId = String(identityId || '').trim()
  if (!safeIdentityId) return
  const legacyCandidates = [cloneDbPath(), legacyUserDataCloneDbPath()]
    .map((item) => String(item || '').trim())
    .filter((item, index, list) => Boolean(item) && list.indexOf(item) === index)
  for (const legacyPath of legacyCandidates) {
    if (!existsSync(legacyPath)) continue
    try {
      const legacyDb = await readCloneDbFileAt(legacyPath)
      const currentLibrary = Array.isArray(legacyDb.modelIdentityLibrary) ? legacyDb.modelIdentityLibrary : []
      const nextLibrary = currentLibrary.filter((item) => String(item?.id || '').trim() !== safeIdentityId)
      if (nextLibrary.length === currentLibrary.length) continue
      await writeJsonFile(legacyPath, {
        ...legacyDb,
        modelIdentityLibrary: nextLibrary,
      })
    } catch (error) {
      console.warn('[clone-repo] remove model identity from legacy json skipped', {
        identityId: safeIdentityId,
        legacyPath,
        message: String((error as Error)?.message ?? error ?? 'unknown error'),
      })
    }
  }
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
  const legacySharedHub = parsed?.apifoxHub
  const ai666Hub = normalizeApifoxHubCredentials(hasOwnHubPayload(parsed, 'ai666Hub') ? parsed?.ai666Hub : legacySharedHub)
  const vectorEngineHub = normalizeApifoxHubCredentials(hasOwnHubPayload(parsed, 'vectorEngineHub') ? parsed?.vectorEngineHub : legacySharedHub)
  const xibapiHub = normalizeApifoxHubCredentials(hasOwnHubPayload(parsed, 'xibapiHub') ? parsed?.xibapiHub : legacySharedHub)
  const gaoruiHub = normalizeApifoxHubCredentials(hasOwnHubPayload(parsed, 'gaoruiHub') ? parsed?.gaoruiHub : legacySharedHub)
  const rawVideoProviderPrimary = normalizeCapabilityProvider(parsed?.videoProviderPrimary, 'apifox_hub')
  const rawImageProviderPrimary = normalizeImageProvider(parsed?.imageProviderPrimary, 'openai')
  const rawChatProviderPrimary = parsed?.chatProviderPrimary === 'grsai' ? 'grsai' : 'apifox_hub'
  const normalizedVideoModelPrimary = normalizeAi666VideoModel(parsed?.videoModelPrimary, 'veo_3_1-lite')
  const legacyVideoPlatform =
    parsed?.videoProviderPrimary === 'ai666' || parsed?.videoProviderPrimary === 'vectorengine' || parsed?.videoProviderPrimary === 'xibapi' || parsed?.videoProviderPrimary === 'gaorui'
      ? parsed.videoProviderPrimary
      : parsed?.videoProviderFallback === 'ai666' || parsed?.videoProviderFallback === 'vectorengine' || parsed?.videoProviderFallback === 'xibapi' || parsed?.videoProviderFallback === 'gaorui'
        ? parsed.videoProviderFallback
        : undefined
  const legacyImagePlatform = parsed?.imageProviderPrimary === 'ai666' || parsed?.imageProviderPrimary === 'vectorengine' ? parsed.imageProviderPrimary : undefined
  const legacyChatPlatform = parsed?.chatProviderPrimary === 'ai666' || parsed?.chatProviderPrimary === 'vectorengine' ? parsed.chatProviderPrimary : undefined
  const rawVideoProfile = parsed?.videoApifoxHubProfile === 'ai666' || parsed?.videoApifoxHubProfile === 'vectorengine' || parsed?.videoApifoxHubProfile === 'xibapi' || parsed?.videoApifoxHubProfile === 'gaorui'
    ? parsed.videoApifoxHubProfile
    : undefined
  const rawImageProfile = parsed?.imageApifoxHubProfile === 'ai666' || parsed?.imageApifoxHubProfile === 'vectorengine'
    ? parsed.imageApifoxHubProfile
    : undefined
  const rawChatProfile = parsed?.chatApifoxHubProfile === 'ai666' || parsed?.chatApifoxHubProfile === 'vectorengine'
    ? parsed.chatApifoxHubProfile
    : undefined
  const sharedFallbackProfile = normalizeIncomingPlatformProfile('video', legacyVideoPlatform ?? 'vectorengine', 'vectorengine') as PlatformProfile
  const videoPlatform = normalizeIncomingPlatformProfile('video', rawVideoProfile ?? legacyVideoPlatform ?? sharedFallbackProfile, sharedFallbackProfile) as PlatformProfile
  const imagePlatform = normalizeIncomingPlatformProfile('image', rawImageProfile ?? legacyImagePlatform ?? sharedFallbackProfile, sharedFallbackProfile) as 'ai666' | 'vectorengine'
  const chatPlatform = normalizeIncomingPlatformProfile('chat', rawChatProfile ?? legacyChatPlatform ?? sharedFallbackProfile, sharedFallbackProfile) as 'ai666' | 'vectorengine'
  const normalizedVideoProviderPrimary = legacyVideoPlatform
    ? (mapPlatformToStoredProvider(videoPlatform).provider as 'grsai' | 'apifox_hub')
    : normalizeVideoProvider(rawVideoProviderPrimary, 'apifox_hub')
  const normalizedImageProviderPrimary = legacyImagePlatform
    ? (mapPlatformToStoredProvider(imagePlatform).provider as 'grsai' | 'apifox_hub')
    : normalizeImageProvider(rawImageProviderPrimary, 'apifox_hub')
  const normalizedChatProviderPrimary = legacyChatPlatform
    ? (mapPlatformToStoredProvider(chatPlatform).provider as 'grsai' | 'apifox_hub')
    : rawChatProviderPrimary
  const persistedVideoProfile = videoPlatform as 'ai666' | 'vectorengine' | 'xibapi' | 'gaorui'
  const persistedImageProfile = imagePlatform as 'ai666' | 'vectorengine'
  const persistedChatProfile = chatPlatform as 'ai666' | 'vectorengine'
  const activeVideoProfile = resolveCapabilityPlatform(normalizedVideoProviderPrimary as 'grsai' | 'apifox_hub', videoPlatform, 'video') as PlatformProfile
  const profile = persistedVideoProfile
  const activeHub =
    activeVideoProfile === 'ai666'
      ? ai666Hub
      : activeVideoProfile === 'xibapi'
        ? xibapiHub
        : activeVideoProfile === 'gaorui'
          ? gaoruiHub
          : vectorEngineHub
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
    videoModelPrimary: normalizedVideoModelPrimary,
    videoModelFallback: normalizedVideoModelPrimary,
    grsaiVideoModel: normalizeAi666VideoModel(parsed?.grsaiVideoModel, 'grok-video-3'),
    grsaiAnalysisModel: String(parsed?.grsaiAnalysisModel ?? '').trim() || 'gemini-3.1-pro',
    chatProviderPrimary: normalizedChatProviderPrimary,
    videoProviderPrimary: normalizedVideoProviderPrimary,
    videoProviderFallback: normalizedVideoProviderPrimary,
    openaiApiKey: String(parsed?.openaiApiKey ?? '').trim() || undefined,
    openaiImageModel: String(parsed?.openaiImageModel ?? '').trim() || 'gpt-image-2',
    openaiImageQuality:
      parsed?.openaiImageQuality === 'low' || parsed?.openaiImageQuality === 'medium'
        ? parsed.openaiImageQuality
        : 'high',
    replicateApiToken: String(parsed?.replicateApiToken ?? '').trim() || undefined,
    imageProviderPrimary: normalizedImageProviderPrimary,
    grsaiImageModel: String(parsed?.grsaiImageModel ?? '').trim() || 'gpt-image-2',
    apifoxHubProfile: profile,
    videoApifoxHubProfile: persistedVideoProfile,
    imageApifoxHubProfile: persistedImageProfile,
    chatApifoxHubProfile: persistedChatProfile,
    ai666Hub,
    vectorEngineHub,
    xibapiHub,
    gaoruiHub,
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

async function readLegacyCloneSettingsFileAt(filePath: string): Promise<CloneSettingsShape> {
  return await readJsonFile<CloneSettingsShape>(filePath, {})
}

function normalizeCloneSettingsShape(input?: CloneSettingsShape | null): CloneSettingsShape {
  const settings = input && typeof input === 'object' ? input : {}
  return {
    encryptedCredentials: typeof settings.encryptedCredentials === 'string' ? settings.encryptedCredentials : undefined,
    plaintextCredentials: settings.plaintextCredentials ? normalizeCredentials(settings.plaintextCredentials) : undefined,
    runtimeOptions: normalizeCloneRuntimeOptions(settings.runtimeOptions),
    hermesIntegration: normalizeHermesIntegrationSettings(settings.hermesIntegration ?? DEFAULT_HERMES_INTEGRATION_SETTINGS),
  }
}

async function ensureCloneSettingsSqliteReady() {
  await ensureCloneSqliteReady()
  const existing = readCloneSettingsFromSqlite()
  if (existing?.payload) return

  const legacyCandidates = [cloneSettingsPath(), legacyUserDataCloneSettingsPath()]
    .map((item) => String(item || '').trim())
    .filter((item, index, list) => Boolean(item) && list.indexOf(item) === index)

  for (const legacyPath of legacyCandidates) {
    if (!existsSync(legacyPath)) continue
    const legacySettings = normalizeCloneSettingsShape(await readLegacyCloneSettingsFileAt(legacyPath))
    writeCloneSettingsToSqlite(JSON.stringify(legacySettings), now())
    return
  }

  const defaults = normalizeCloneSettingsShape({})
  writeCloneSettingsToSqlite(JSON.stringify(defaults), now())
}

async function readCloneSettingsSource(): Promise<CloneSettingsShape> {
  await ensureCloneSettingsSqliteReady()
  const row = readCloneSettingsFromSqlite()
  if (!row?.payload) return normalizeCloneSettingsShape({})
  try {
    return normalizeCloneSettingsShape(JSON.parse(String(row.payload || '{}')) as CloneSettingsShape)
  } catch {
    return normalizeCloneSettingsShape({})
  }
}

async function writeCloneSettingsSource(input: CloneSettingsShape) {
  await ensureCloneSettingsSqliteReady()
  const normalized = normalizeCloneSettingsShape(input)
  writeCloneSettingsToSqlite(JSON.stringify(normalized), now())
}

function readCloneSettingsSourceSync(): CloneSettingsShape {
  try {
    initializeCloneSqlite()
    const row = readCloneSettingsFromSqlite()
    if (row?.payload) {
      return normalizeCloneSettingsShape(JSON.parse(String(row.payload || '{}')) as CloneSettingsShape)
    }
  } catch {
    // Fall through to legacy compatibility read.
  }
  try {
    return normalizeCloneSettingsShape(JSON.parse(readFileSync(cloneSettingsPath(), 'utf8') || '{}') as CloneSettingsShape)
  } catch {
    return normalizeCloneSettingsShape({})
  }
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

function normalizeHermesIntegrationSettings(input?: Partial<HermesIntegrationSettings> | null): HermesIntegrationSettings {
  const feishu: Partial<HermesIntegrationSettings['feishu']> = input?.feishu ?? {}
  const wecom: Partial<HermesIntegrationSettings['wecom']> = input?.wecom ?? {}
  return {
    enabled: Boolean(input?.enabled ?? false),
    callbackBaseUrl: String(input?.callbackBaseUrl ?? '').trim(),
    feishu: {
      enabled: Boolean(feishu.enabled ?? false),
      appId: String(feishu.appId ?? '').trim() || undefined,
      appSecret: String(feishu.appSecret ?? '').trim() || undefined,
      tenantAccessToken: String(feishu.tenantAccessToken ?? '').trim() || undefined,
      receiveIdType:
        feishu.receiveIdType === 'user_id' ||
        feishu.receiveIdType === 'union_id' ||
        feishu.receiveIdType === 'chat_id' ||
        feishu.receiveIdType === 'email'
          ? feishu.receiveIdType
          : 'open_id',
      defaultReceiveId: String(feishu.defaultReceiveId ?? '').trim() || undefined,
    },
    wecom: {
      enabled: Boolean(wecom.enabled ?? false),
      corpId: String(wecom.corpId ?? '').trim() || undefined,
      corpSecret: String(wecom.corpSecret ?? '').trim() || undefined,
      accessToken: String(wecom.accessToken ?? '').trim() || undefined,
      agentId: String(wecom.agentId ?? '').trim() || undefined,
      defaultToUser: String(wecom.defaultToUser ?? '').trim() || undefined,
    },
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

function inferStoryboardReferenceDecisionForStoredShot(projectLike: any, shotLike: any) {
  return inferStoryboardReferenceDecision({
    productType:
      normalizeProductType(
        shotLike?.productType ||
          projectLike?.boundProductSnapshot?.productAnalysis?.category ||
          projectLike?.boundProductSnapshot?.type ||
          projectLike?.baseBlueprint?.productCategory ||
          projectLike?.blueprint?.productCategory ||
          'general',
      ),
    shot: shotLike,
    extraTexts: [projectLike?.title],
  })
}

function resolveStoryboardReferenceDecisionForStoredShot(projectLike: any, shotLike: any) {
  const inferred = inferStoryboardReferenceDecisionForStoredShot(projectLike, shotLike)
  const subjectType = String(shotLike?.storyboardSubjectType ?? shotLike?.storyboard_subject_type ?? '').trim()
  const mode = String(shotLike?.storyboardReferenceMode ?? shotLike?.storyboard_reference_mode ?? '').trim()
  const confidence = String(shotLike?.storyboardReferenceConfidence ?? shotLike?.storyboard_reference_confidence ?? '').trim()
  const reasonsSource = Array.isArray(shotLike?.storyboardReferenceReason)
    ? shotLike.storyboardReferenceReason
    : Array.isArray(shotLike?.storyboard_reference_reason)
      ? shotLike.storyboard_reference_reason
      : []
  const reasons = Array.isArray(reasonsSource) ? reasonsSource.map((item: unknown) => String(item || '').trim()).filter(Boolean) : []
  const validSubjectType =
    subjectType === 'product_only' ||
    subjectType === 'hand_only_product' ||
    subjectType === 'local_wearable_closeup' ||
    subjectType === 'model_visible' ||
    subjectType === 'unknown'
  const validMode = mode === 'product_closeup' || mode === 'model_presentation'
  const validConfidence = confidence === 'high' || confidence === 'medium' || confidence === 'low'
  if (validSubjectType && validMode && validConfidence) {
    return {
      ...inferred,
      subjectType,
      mode,
      confidence,
      reasons: reasons.length ? reasons : inferred.reasons,
    }
  }
  return inferred
}


function normalizeProject(p: CloneProject): CloneProject {
  const persistedShotVideoOutputByShotId = new Map(
    (Array.isArray((p as any).shotVideoOutputs) ? (p as any).shotVideoOutputs : [])
      .map((item: any) => {
        const shotId = String(item?.shotId ?? item?.segmentId ?? '').trim()
        if (!shotId) return null
        return [shotId, item] as const
      })
      .filter(Boolean) as Array<readonly [string, any]>,
  )
  const normalizeShot = (s: any, index: number) => {
    const persistedStoryboardDecision = resolveStoryboardReferenceDecisionForStoredShot(p, s)
    const persistedShotVideoOutput = persistedShotVideoOutputByShotId.get(String(s?.id ?? '').trim())
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
    const persistedOutputStatus = String(persistedShotVideoOutput?.status ?? '').trim().toLowerCase()
    const persistedOutputVideoPath =
      String(persistedShotVideoOutput?.videoPath ?? persistedShotVideoOutput?.localPath ?? '').trim()
    const shouldPreservePersistedDoneOutput =
      Boolean(persistedOutputVideoPath) &&
      (persistedOutputStatus === 'done' || persistedOutputStatus === 'success' || persistedOutputStatus === 'completed')
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
        hasLocalMockClip && !shouldPreservePersistedDoneOutput
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
      canEnterRender: typeof s?.canEnterRender === 'boolean' ? s.canEnterRender : (!hasLocalMockClip || shouldPreservePersistedDoneOutput),
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
      compiledPrompt: String(s?.compiledPrompt ?? '').trim() || undefined,
      compiledNegativePrompt: String(s?.compiledNegativePrompt ?? '').trim() || undefined,
      promptCompilerVersion: String(s?.promptCompilerVersion ?? '').trim() || undefined,
      nextRoundPromptDirectives: Array.isArray(s?.nextRoundPromptDirectives)
        ? s.nextRoundPromptDirectives.map(String).filter(Boolean)
        : undefined,
      consistencyMode:
        s?.consistencyMode === 'strict' || s?.consistencyMode === 'standard'
          ? s.consistencyMode
          : undefined,
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
      storyboardSubjectType: persistedStoryboardDecision.subjectType,
      storyboardReferenceMode:
        Boolean(s?.referenceModeLocked ?? s?.reference_mode_locked) &&
        (s?.referenceModeLockReason === 'manual' || s?.reference_mode_lock_reason === 'manual')
          ? (s?.storyboardReferenceMode === 'product_closeup' || s?.storyboardReferenceMode === 'model_presentation'
              ? s.storyboardReferenceMode
              : s?.storyboard_reference_mode === 'product_closeup' || s?.storyboard_reference_mode === 'model_presentation'
                ? s.storyboard_reference_mode
                : persistedStoryboardDecision.mode)
          : persistedStoryboardDecision.mode,
      storyboardReferenceConfidence: persistedStoryboardDecision.confidence,
      storyboardReferenceReason: persistedStoryboardDecision.reasons,
      referenceModeLocked:
        Boolean(s?.referenceModeLocked ?? s?.reference_mode_locked) &&
        (s?.referenceModeLockReason === 'manual' || s?.reference_mode_lock_reason === 'manual'),
      referenceModeLockReason:
        s?.referenceModeLockReason === 'manual'
          ? s.referenceModeLockReason
          : s?.reference_mode_lock_reason === 'manual'
            ? s.reference_mode_lock_reason
            : undefined,
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
      generatedClipPath:
        hasLocalMockClip && !shouldPreservePersistedDoneOutput ? undefined : shouldKeepGeneratedClipPath ? s?.generatedClipPath : undefined,
      generatedSource: hasLocalMockClip && !shouldPreservePersistedDoneOutput ? undefined : s?.generatedSource,
      generatedProvider: hasLocalMockClip && !shouldPreservePersistedDoneOutput ? undefined : s?.generatedProvider,
      generatedModel: hasLocalMockClip && !shouldPreservePersistedDoneOutput ? undefined : s?.generatedModel,
      generatedTaskId: hasLocalMockClip && !shouldPreservePersistedDoneOutput ? undefined : s?.generatedTaskId,
      status: hasLocalMockClip && !shouldPreservePersistedDoneOutput ? 'failed' : (s?.status ?? 'empty'),
      error:
        hasLocalMockClip && !shouldPreservePersistedDoneOutput
          ? '历史本地 mock/图片拼接片段已判定无效，请重新调用 Seedance/Kling 云端生成。'
          : s?.error,
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
        composeHealth:
          (p as any).finalCompose.composeHealth && typeof (p as any).finalCompose.composeHealth === 'object'
            ? {
                verdict:
                  (p as any).finalCompose.composeHealth.verdict === 'balanced' ||
                  (p as any).finalCompose.composeHealth.verdict === 'needs_tuning'
                    ? (p as any).finalCompose.composeHealth.verdict
                    : undefined,
                flags: Array.isArray((p as any).finalCompose.composeHealth.flags)
                  ? (p as any).finalCompose.composeHealth.flags.map(String).filter(Boolean)
                  : undefined,
                recommendations: Array.isArray((p as any).finalCompose.composeHealth.recommendations)
                  ? (p as any).finalCompose.composeHealth.recommendations.map(String).filter(Boolean)
                  : undefined,
              }
            : undefined,
        nextRoundPlanPath: String((p as any).finalCompose.nextRoundPlanPath ?? '').trim() || undefined,
        composeSummary:
          (p as any).finalCompose.composeSummary && typeof (p as any).finalCompose.composeSummary === 'object'
            ? {
                totalShots: Number((p as any).finalCompose.composeSummary.totalShots ?? 0) || 0,
                stageCounts:
                  (p as any).finalCompose.composeSummary.stageCounts &&
                  typeof (p as any).finalCompose.composeSummary.stageCounts === 'object'
                    ? {
                        hook: Number((p as any).finalCompose.composeSummary.stageCounts.hook ?? 0) || 0,
                        body: Number((p as any).finalCompose.composeSummary.stageCounts.body ?? 0) || 0,
                        close: Number((p as any).finalCompose.composeSummary.stageCounts.close ?? 0) || 0,
                      }
                    : undefined,
                aggressiveShotCount: Number((p as any).finalCompose.composeSummary.aggressiveShotCount ?? 0) || 0,
                readabilityProtectedCount: Number((p as any).finalCompose.composeSummary.readabilityProtectedCount ?? 0) || 0,
                productPriorityCount: Number((p as any).finalCompose.composeSummary.productPriorityCount ?? 0) || 0,
                averageClipDurationSec: Number((p as any).finalCompose.composeSummary.averageClipDurationSec ?? 0) || 0,
                strongHookCount: Number((p as any).finalCompose.composeSummary.strongHookCount ?? 0) || 0,
                payoffHandoffCount: Number((p as any).finalCompose.composeSummary.payoffHandoffCount ?? 0) || 0,
                closeConfirmationCount: Number((p as any).finalCompose.composeSummary.closeConfirmationCount ?? 0) || 0,
                strongCtaCount: Number((p as any).finalCompose.composeSummary.strongCtaCount ?? 0) || 0,
                snapCloseCount: Number((p as any).finalCompose.composeSummary.snapCloseCount ?? 0) || 0,
                rhythmScore: Number((p as any).finalCompose.composeSummary.rhythmScore ?? 0) || 0,
                optimizationLanes: Array.isArray((p as any).finalCompose.composeSummary.optimizationLanes)
                  ? (p as any).finalCompose.composeSummary.optimizationLanes
                      .map(String)
                      .filter((item: string) => item === 'hook' || item === 'payoff' || item === 'body' || item === 'close')
                  : undefined,
                nextActions: Array.isArray((p as any).finalCompose.composeSummary.nextActions)
                  ? (p as any).finalCompose.composeSummary.nextActions.map(String).filter(Boolean)
                  : undefined,
                optimizationBrief:
                  (p as any).finalCompose.composeSummary.optimizationBrief &&
                  typeof (p as any).finalCompose.composeSummary.optimizationBrief === 'object'
                    ? {
                        focusArea: ['hook', 'payoff', 'body', 'close', 'maintain'].includes(
                          String((p as any).finalCompose.composeSummary.optimizationBrief.focusArea ?? ''),
                        )
                          ? (String((p as any).finalCompose.composeSummary.optimizationBrief.focusArea) as
                              | 'hook'
                              | 'payoff'
                              | 'body'
                              | 'close'
                              | 'maintain')
                          : undefined,
                        urgency: ['low', 'medium', 'high'].includes(
                          String((p as any).finalCompose.composeSummary.optimizationBrief.urgency ?? ''),
                        )
                          ? (String((p as any).finalCompose.composeSummary.optimizationBrief.urgency) as 'low' | 'medium' | 'high')
                          : undefined,
                        primaryGoal:
                          String((p as any).finalCompose.composeSummary.optimizationBrief.primaryGoal ?? '').trim() || undefined,
                        actionItems: Array.isArray((p as any).finalCompose.composeSummary.optimizationBrief.actionItems)
                          ? (p as any).finalCompose.composeSummary.optimizationBrief.actionItems.map(String).filter(Boolean)
                          : undefined,
                        upstreamPromptHints: Array.isArray(
                          (p as any).finalCompose.composeSummary.optimizationBrief.upstreamPromptHints,
                        )
                          ? (p as any).finalCompose.composeSummary.optimizationBrief.upstreamPromptHints
                              .map(String)
                              .filter(Boolean)
                          : undefined,
                      }
                    : undefined,
                bodyUpgradePlan:
                  (p as any).finalCompose.composeSummary.bodyUpgradePlan &&
                  typeof (p as any).finalCompose.composeSummary.bodyUpgradePlan === 'object'
                    ? {
                        proofUpgrade: Boolean((p as any).finalCompose.composeSummary.bodyUpgradePlan.proofUpgrade),
                        showUpgrade: Boolean((p as any).finalCompose.composeSummary.bodyUpgradePlan.showUpgrade),
                        preferredMoves: Array.isArray((p as any).finalCompose.composeSummary.bodyUpgradePlan.preferredMoves)
                          ? (p as any).finalCompose.composeSummary.bodyUpgradePlan.preferredMoves.map(String).filter(Boolean)
                          : undefined,
                      }
                    : undefined,
                upstreamOptimizationPatch:
                  (p as any).finalCompose.composeSummary.upstreamOptimizationPatch &&
                  typeof (p as any).finalCompose.composeSummary.upstreamOptimizationPatch === 'object'
                    ? {
                        tightenOpening: Boolean((p as any).finalCompose.composeSummary.upstreamOptimizationPatch.tightenOpening),
                        addImmediatePayoff: Boolean((p as any).finalCompose.composeSummary.upstreamOptimizationPatch.addImmediatePayoff),
                        increaseMidVariation: Boolean((p as any).finalCompose.composeSummary.upstreamOptimizationPatch.increaseMidVariation),
                        strengthenCtaUrgency: Boolean((p as any).finalCompose.composeSummary.upstreamOptimizationPatch.strengthenCtaUrgency),
                        preferSnapClose: Boolean((p as any).finalCompose.composeSummary.upstreamOptimizationPatch.preferSnapClose),
                      }
                    : undefined,
              }
            : undefined,
        subtitleOverlay:
          (p as any).finalCompose.subtitleOverlay && typeof (p as any).finalCompose.subtitleOverlay === 'object'
            ? {
                active: Boolean((p as any).finalCompose.subtitleOverlay.active),
                originalOutputPath: String((p as any).finalCompose.subtitleOverlay.originalOutputPath ?? '').trim(),
                originalCoverImagePath: String((p as any).finalCompose.subtitleOverlay.originalCoverImagePath ?? '').trim() || undefined,
                subtitleOutputPath: String((p as any).finalCompose.subtitleOverlay.subtitleOutputPath ?? '').trim(),
                subtitleCoverImagePath: String((p as any).finalCompose.subtitleOverlay.subtitleCoverImagePath ?? '').trim() || undefined,
                appliedAt: Number((p as any).finalCompose.subtitleOverlay.appliedAt ?? now()) || now(),
              }
            : undefined,
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
    hiddenFromCloneTaskList: Boolean((p as any)?.hiddenFromCloneTaskList ?? false),
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
    runMode: inferNormalizedRunMode(p),
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

function isModelLibraryScratchProject(project: CloneProject) {
  const title = String(project.title || '').trim()
  const description = String(project.description || '').trim()
  return title === '模特创建临时项目' || description.includes('用于桌面端创建模特时自动兜底的轻量草稿项目')
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
            if (isRemovedModelIdentityMarked(recoveredId)) continue
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
      let changed = false
      const normalized = projects.map((project) => {
        if (shouldPersistInferredRunMode(project)) {
          changed = true
          return normalizeProject({ ...project, runMode: 'auto' as const })
        }
        return normalizeProject(project)
      })
      const visible = normalized.filter((project) => !isModelLibraryScratchProject(project))
      if (changed) {
        for (const project of normalized) upsertCloneProjectInSqlite(project)
      }
      return visible
    })
  },

  async listRawProjects(): Promise<CloneProject[]> {
    return await queueCloneDbMutation(async () => {
      const projects = readCloneProjectsFromSqlite()
      let changed = false
      const normalized = projects.map((project) => {
        if (shouldPersistInferredRunMode(project)) {
          changed = true
          return normalizeProject({ ...project, runMode: 'auto' as const })
        }
        return normalizeProject(project)
      })
      if (changed) {
        for (const project of normalized) upsertCloneProjectInSqlite(project)
      }
      return normalized.filter((project) => !isModelLibraryScratchProject(project))
    })
  },

  async getProject(id: string): Promise<CloneProject | null> {
    const targetId = String(id || '').trim()
    if (!targetId) return null
    return await queueCloneDbMutation(async () => {
      const project = readCloneProjectByIdFromSqlite(targetId)
      if (!project) return null
      const normalized = shouldPersistInferredRunMode(project)
        ? normalizeProject({ ...project, runMode: 'auto' as const })
        : normalizeProject(project)
      if (shouldPersistInferredRunMode(project)) upsertCloneProjectInSqlite(normalized)
      return normalized
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
        hiddenFromCloneTaskList: false,
        status: 'draft',
        runMode: inferNormalizedRunMode(input),
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
      const safeProjectId = String(input?.id || '').trim()
      if (!safeProjectId) throw new Error('clone project id is required')
      const current = readCloneProjectByIdFromSqlite(input.id)
      if (!current && isRemovedProjectMarked(safeProjectId)) {
        console.log('[clone-debug] repo-upsert-project:skip-removed-project', {
          dbDir: getAppPaths().dbDir,
          projectId: safeProjectId,
        })
        throw new Error(`clone project removed: ${safeProjectId}`)
      }
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
      const safeProjectId = String(id || '').trim()
      removeCloneProjectFromSqlite(safeProjectId)
      markRemovedProject(safeProjectId)
      await removeProjectFromLegacyJsonSnapshots(safeProjectId)
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

  async listModelTasks(): Promise<ModelTask[]> {
    const db = await this.readDb()
    return [...(db.modelTasks ?? [])].map(normalizeModelTask).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
  },

  async getModelTask(id: string): Promise<ModelTask | null> {
    const all = await this.listModelTasks()
    const targetId = String(id || '').trim()
    return all.find((item) => item.id === targetId) ?? null
  },

  async upsertModelTask(input: ModelTask): Promise<ModelTask> {
    return await queueCloneDbMutation(async () => {
      const db = await readCloneDbSource()
      const tasks = Array.isArray(db.modelTasks) ? db.modelTasks.map(normalizeModelTask) : []
      const next = normalizeModelTask({ ...input, updatedAt: now() })
      const idx = tasks.findIndex((item) => item.id === next.id)
      if (idx >= 0) tasks[idx] = next
      else tasks.unshift(next)
      db.modelTasks = tasks
      await writeCloneDbSource(db)
      return next
    })
  },

  async removeModelTask(id: string): Promise<{ ok: true }> {
    return await queueCloneDbMutation(async () => {
      const db = await readCloneDbSource()
      db.modelTasks = (db.modelTasks ?? []).map(normalizeModelTask).filter((item) => item.id !== id)
      await writeCloneDbSource(db)
      return { ok: true }
    })
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
      markRemovedModelIdentity(id)
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
      await removeModelIdentityFromLegacyJsonSnapshots(id)
      return { ok: true }
    })
  },

  async getCredentials(): Promise<ModelCredentials> {
    const settings = await readCloneSettingsSource()
    return decryptCredentials(settings)
  },

  getCredentialsSync(): ModelCredentials {
    return decryptCredentials(readCloneSettingsSourceSync())
  },

  async setCredentials(input: ModelCredentials): Promise<{ ok: true }> {
    const current = await readCloneSettingsSource()
    const normalizedCredentials = normalizeCredentials(input)
    await writeCloneSettingsSource({
      ...encryptCredentials(normalizedCredentials),
      runtimeOptions: normalizeCloneRuntimeOptions(current.runtimeOptions),
      hermesIntegration: normalizeHermesIntegrationSettings(current.hermesIntegration ?? DEFAULT_HERMES_INTEGRATION_SETTINGS),
    })
    return { ok: true }
  },

  async getRuntimeOptions(): Promise<CloneRuntimeOptions> {
    const settings = await readCloneSettingsSource()
    return normalizeCloneRuntimeOptions(settings.runtimeOptions)
  },

  async setRuntimeOptions(input: Partial<CloneRuntimeOptions>): Promise<CloneRuntimeOptions> {
    const settings = await readCloneSettingsSource()
    const next = normalizeCloneRuntimeOptions({
      ...settings.runtimeOptions,
      ...input,
    })
    await writeCloneSettingsSource({
      ...settings,
      runtimeOptions: next,
    })
    return next
  },

  async getHermesIntegrationSettings(): Promise<HermesIntegrationSettings> {
    const settings = await readCloneSettingsSource()
    return normalizeHermesIntegrationSettings(settings.hermesIntegration ?? DEFAULT_HERMES_INTEGRATION_SETTINGS)
  },

  async setHermesIntegrationSettings(input: Partial<HermesIntegrationSettings>): Promise<HermesIntegrationSettings> {
    const settings = await readCloneSettingsSource()
    const current = normalizeHermesIntegrationSettings(settings.hermesIntegration ?? DEFAULT_HERMES_INTEGRATION_SETTINGS)
    const next = normalizeHermesIntegrationSettings({
      ...current,
      ...input,
      feishu: {
        ...current.feishu,
        ...(input.feishu ?? {}),
      },
      wecom: {
        ...current.wecom,
        ...(input.wecom ?? {}),
      },
    })
    await writeCloneSettingsSource({
      ...settings,
      hermesIntegration: next,
    })
    return next
  },


  async ensureSeed() {
    const readyState = await ensureCloneSqliteReady()
    await ensureCloneSettingsSqliteReady()
    return readyState
  },
}
