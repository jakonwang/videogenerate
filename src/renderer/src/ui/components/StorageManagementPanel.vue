<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Bot,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  FileClock,
  FolderLock,
  HardDrive,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-vue-next'
import type {
  StorageCategoryId,
  StorageCategorySnapshot,
  StorageCleanupResult,
} from '../../../../shared/storageManagement'
import { STORAGE_CATEGORY_IDS } from '../../../../shared/storageManagement'
import { storageCleanupChallenge } from '../../../../shared/storageManagement'

const { t } = useI18n()
const categorySnapshots = ref<Partial<Record<StorageCategoryId, StorageCategorySnapshot>>>({})
const categoryLoading = ref<Record<StorageCategoryId, boolean>>(Object.fromEntries(
  STORAGE_CATEGORY_IDS.map((categoryId) => [categoryId, true]),
) as Record<StorageCategoryId, boolean>)
const scannedAt = ref(0)
const cleaningCategoryId = ref<StorageCategoryId | ''>('')
const pendingCategory = ref<StorageCategorySnapshot | null>(null)
const destructiveConfirmed = ref(false)
const typedConfirmation = ref('')
const message = ref('')
const error = ref('')

const categoryMeta: Record<StorageCategoryId, { icon: typeof Database; tone: string; risk: StorageCategorySnapshot['risk']; requiresRuntimeStop: boolean }> = {
  safe_cache: { icon: ShieldCheck, tone: 'green', risk: 'safe', requiresRuntimeStop: false },
  temporary_files: { icon: Clock3, tone: 'blue', risk: 'safe', requiresRuntimeStop: false },
  preview_files: { icon: Eye, tone: 'violet', risk: 'caution', requiresRuntimeStop: false },
  diagnostic_logs: { icon: FileClock, tone: 'blue', risk: 'caution', requiresRuntimeStop: false },
  completed_project_artifacts: { icon: Database, tone: 'amber', risk: 'destructive', requiresRuntimeStop: false },
  hermes_runtime: { icon: Bot, tone: 'cyan', risk: 'destructive', requiresRuntimeStop: true },
  hermes_sessions_memory: { icon: HardDrive, tone: 'red', risk: 'destructive', requiresRuntimeStop: true },
  managed_source_assets: { icon: FolderLock, tone: 'green', risk: 'protected', requiresRuntimeStop: false },
  business_records: { icon: Database, tone: 'red', risk: 'protected', requiresRuntimeStop: false },
  configuration_credentials: { icon: KeyRound, tone: 'violet', risk: 'protected', requiresRuntimeStop: false },
}

const categoryGroupIds: Array<{ id: 'reclaimable' | 'advanced' | 'protected'; categoryIds: StorageCategoryId[] }> = [
  { id: 'reclaimable', categoryIds: ['safe_cache', 'temporary_files', 'preview_files', 'diagnostic_logs'] },
  { id: 'advanced', categoryIds: ['completed_project_artifacts', 'hermes_runtime', 'hermes_sessions_memory'] },
  { id: 'protected', categoryIds: ['managed_source_assets', 'business_records', 'configuration_credentials'] },
]

const categories = computed(() => STORAGE_CATEGORY_IDS.map((id) => categorySnapshots.value[id] || {
  id,
  sizeBytes: 0,
  fileCount: 0,
  itemCount: 0,
  risk: categoryMeta[id].risk,
  available: false,
  requiresRuntimeStop: categoryMeta[id].requiresRuntimeStop,
  cleanupAllowed: categoryMeta[id].risk !== 'protected',
  requiresTypedConfirmation: categoryMeta[id].risk === 'destructive',
  backupRequired: id === 'hermes_sessions_memory',
}))
const categoryGroups = computed(() => categoryGroupIds.map((group) => ({
  ...group,
  categories: group.categoryIds.map((id) => categories.value.find((item) => item.id === id)!),
})))
const loading = computed(() => Object.values(categoryLoading.value).some(Boolean))
const loadedCategoryCount = computed(() => STORAGE_CATEGORY_IDS.filter((id) => Boolean(categorySnapshots.value[id])).length)
const totalBytes = computed(() => categories.value.reduce((sum, item) => sum + item.sizeBytes, 0))
const pendingNeedsAcknowledgement = computed(() => pendingCategory.value?.risk === 'caution' || pendingCategory.value?.risk === 'destructive')
const pendingChallenge = computed(() => pendingCategory.value ? storageCleanupChallenge(pendingCategory.value.id) : '')
const pendingTypedConfirmationValid = computed(() => !pendingCategory.value?.requiresTypedConfirmation || typedConfirmation.value.trim() === pendingChallenge.value)

function formatBytes(value: number) {
  const bytes = Math.max(0, Number(value || 0))
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function categoryKey(id: StorageCategoryId, field: 'label' | 'desc') {
  return `settings.storageManagement.categories.${id}.${field}`
}

function riskLabel(category: StorageCategorySnapshot) {
  return t(`settings.storageManagement.risks.${category.risk}`)
}

function normalizeCategorySnapshot(snapshot: StorageCategorySnapshot): StorageCategorySnapshot {
  const meta = categoryMeta[snapshot.id]
  return {
    ...snapshot,
    cleanupAllowed: typeof snapshot.cleanupAllowed === 'boolean' ? snapshot.cleanupAllowed : meta.risk !== 'protected',
    requiresTypedConfirmation: typeof snapshot.requiresTypedConfirmation === 'boolean'
      ? snapshot.requiresTypedConfirmation
      : meta.risk === 'destructive',
    backupRequired: typeof snapshot.backupRequired === 'boolean'
      ? snapshot.backupRequired
      : snapshot.id === 'hermes_sessions_memory',
  }
}

async function refresh(force = false) {
  error.value = ''
  const storageApi = window.api.storage as typeof window.api.storage & {
    getCategory?: (categoryId: StorageCategoryId, force?: boolean) => Promise<StorageCategorySnapshot>
  }
  if (typeof storageApi.getCategory !== 'function') {
    try {
      const fallbackOverview = await storageApi.getOverview()
      categorySnapshots.value = Object.fromEntries(fallbackOverview.categories.map((item) => [item.id, normalizeCategorySnapshot(item)]))
      categoryLoading.value = Object.fromEntries(STORAGE_CATEGORY_IDS.map((categoryId) => [categoryId, false])) as Record<StorageCategoryId, boolean>
      scannedAt.value = fallbackOverview.scannedAt
    } catch (cause: any) {
      categoryLoading.value = Object.fromEntries(STORAGE_CATEGORY_IDS.map((categoryId) => [categoryId, false])) as Record<StorageCategoryId, boolean>
      error.value = String(cause?.message || cause)
    }
    return
  }
  const failures: string[] = []
  await Promise.all(STORAGE_CATEGORY_IDS.map(async (categoryId) => {
    categoryLoading.value = { ...categoryLoading.value, [categoryId]: true }
    try {
      const snapshot = await storageApi.getCategory(categoryId, force)
      categorySnapshots.value = { ...categorySnapshots.value, [categoryId]: normalizeCategorySnapshot(snapshot) }
    } catch (cause: any) {
      failures.push(String(cause?.message || cause))
    } finally {
      categoryLoading.value = { ...categoryLoading.value, [categoryId]: false }
    }
  }))
  scannedAt.value = Date.now()
  if (failures.length) error.value = failures[0]
}

function requestCleanup(category: StorageCategorySnapshot) {
  if (!category.cleanupAllowed || !category.available || category.sizeBytes <= 0 || cleaningCategoryId.value) return
  pendingCategory.value = category
  destructiveConfirmed.value = category.risk === 'safe'
  typedConfirmation.value = ''
  message.value = ''
  error.value = ''
}

function closeConfirmation() {
  if (cleaningCategoryId.value) return
  pendingCategory.value = null
  destructiveConfirmed.value = false
  typedConfirmation.value = ''
}

async function confirmCleanup() {
  const category = pendingCategory.value
  if (!category || (pendingNeedsAcknowledgement.value && !destructiveConfirmed.value) || !pendingTypedConfirmationValid.value) return
  cleaningCategoryId.value = category.id
  error.value = ''
  message.value = ''
  try {
    const result = await window.api.storage.cleanup(category.id, typedConfirmation.value) as StorageCleanupResult
    categorySnapshots.value = Object.fromEntries(result.overview.categories.map((item) => [item.id, normalizeCategorySnapshot(item)]))
    scannedAt.value = result.overview.scannedAt
    message.value = t('settings.storageManagement.messages.cleaned', {
      size: formatBytes(result.reclaimedBytes),
      files: result.removedFiles,
    })
    if (result.warning) error.value = result.warning
    if (result.backupCreated) message.value += ` ${t('settings.storageManagement.messages.backupCreated')}`
    pendingCategory.value = null
  } catch (cause: any) {
    error.value = String(cause?.message || cause)
  } finally {
    cleaningCategoryId.value = ''
    destructiveConfirmed.value = false
    typedConfirmation.value = ''
  }
}

onMounted(() => {
  void refresh(false)
})
</script>

<template>
  <section class="storage-management-panel">
    <header class="storage-header">
      <div>
        <div class="storage-kicker">{{ t('settings.storageManagement.kicker') }}</div>
        <h2>{{ t('settings.storageManagement.title') }}</h2>
        <p>{{ t('settings.storageManagement.subtitle') }}</p>
      </div>
      <button class="icon-button" type="button" :disabled="loading || Boolean(cleaningCategoryId)" :title="t('settings.actions.refresh')" @click="refresh(true)">
        <LoaderCircle v-if="loading" class="spin" :size="17" />
        <RefreshCw v-else :size="17" />
      </button>
    </header>

    <div class="storage-total">
      <div class="storage-total__icon"><HardDrive :size="20" /></div>
      <div>
        <span>{{ t('settings.storageManagement.total') }}</span>
        <strong>{{ loadedCategoryCount ? formatBytes(totalBytes) : '--' }}</strong>
      </div>
      <small v-if="scannedAt">{{ t('settings.storageManagement.scannedAt', { time: new Date(scannedAt).toLocaleTimeString() }) }}</small>
    </div>

    <div v-if="message" class="storage-notice success"><CheckCircle2 :size="16" />{{ message }}</div>
    <div v-if="error" class="storage-notice error"><X :size="16" />{{ error }}</div>

    <section v-for="group in categoryGroups" :key="group.id" class="storage-group">
      <header class="storage-group__header">
        <strong>{{ t(`settings.storageManagement.groups.${group.id}.label`) }}</strong>
        <span>{{ t(`settings.storageManagement.groups.${group.id}.desc`) }}</span>
      </header>
      <div class="storage-list">
      <article v-for="category in group.categories" :key="category.id" class="storage-row" :data-storage-category="category.id">
        <div class="storage-row__icon" :class="`tone-${categoryMeta[category.id].tone}`">
          <component :is="categoryMeta[category.id].icon" :size="18" />
        </div>
        <div class="storage-row__content">
          <div class="storage-row__title">
            <strong>{{ t(categoryKey(category.id, 'label')) }}</strong>
            <span class="risk-badge" :class="`risk-${category.risk}`">{{ riskLabel(category) }}</span>
          </div>
          <p>{{ t(categoryKey(category.id, 'desc')) }}</p>
          <div class="storage-row__meta">
            <span v-if="categoryLoading[category.id]" class="row-scanning"><LoaderCircle class="spin" :size="12" />{{ t('settings.storageManagement.scanning') }}</span>
            <template v-else>
              <span>{{ t('settings.storageManagement.fileCount', { count: category.fileCount }) }}</span>
              <span v-if="category.itemCount">{{ t('settings.storageManagement.itemCount', { count: category.itemCount }) }}</span>
            </template>
          </div>
        </div>
        <div class="storage-row__size">
          <LoaderCircle v-if="categoryLoading[category.id]" class="spin row-size-loader" :size="17" />
          <strong v-else>{{ formatBytes(category.sizeBytes) }}</strong>
          <button
            type="button"
            class="cleanup-button"
            :class="{ destructive: category.risk === 'destructive', protected: !category.cleanupAllowed }"
            :disabled="categoryLoading[category.id] || !category.cleanupAllowed || !category.available || category.sizeBytes <= 0 || Boolean(cleaningCategoryId)"
            @click="requestCleanup(category)"
          >
            <LoaderCircle v-if="cleaningCategoryId === category.id" class="spin" :size="15" />
            <ShieldCheck v-else-if="!category.cleanupAllowed" :size="15" />
            <Trash2 v-else :size="15" />
            {{ category.cleanupAllowed ? t('settings.storageManagement.clean') : t('settings.storageManagement.protected') }}
          </button>
        </div>
      </article>

      </div>
    </section>

    <div v-if="pendingCategory" class="storage-modal-backdrop" @click.self="closeConfirmation">
      <section class="storage-modal" role="dialog" aria-modal="true">
        <button class="modal-close" type="button" :disabled="Boolean(cleaningCategoryId)" :title="t('settings.storageManagement.cancel')" @click="closeConfirmation">
          <X :size="17" />
        </button>
        <div class="storage-modal__icon" :class="`risk-${pendingCategory.risk}`"><Trash2 :size="20" /></div>
        <h3>{{ t('settings.storageManagement.confirmTitle') }}</h3>
        <p>{{ t(categoryKey(pendingCategory.id, 'desc')) }}</p>
        <div class="storage-modal__summary">
          <span>{{ t(categoryKey(pendingCategory.id, 'label')) }}</span>
          <strong>{{ formatBytes(pendingCategory.sizeBytes) }}</strong>
        </div>
        <label v-if="pendingNeedsAcknowledgement" class="confirm-check">
          <input v-model="destructiveConfirmed" type="checkbox" />
          <span>{{ t(`settings.storageManagement.confirmations.${pendingCategory.id}`) }}</span>
        </label>
        <div v-if="pendingCategory.requiresTypedConfirmation" class="typed-confirmation">
          <label>{{ t('settings.storageManagement.typedConfirmationLabel') }}</label>
          <code>{{ pendingChallenge }}</code>
          <input v-model="typedConfirmation" type="text" autocomplete="off" :placeholder="pendingChallenge" />
        </div>
        <div v-if="pendingCategory.backupRequired" class="backup-note">
          <ShieldCheck :size="15" />{{ t('settings.storageManagement.backupRequired') }}
        </div>
        <div class="storage-modal__actions">
          <button class="modal-button secondary" type="button" :disabled="Boolean(cleaningCategoryId)" @click="closeConfirmation">
            {{ t('settings.storageManagement.cancel') }}
          </button>
          <button
            class="modal-button danger"
            type="button"
            :disabled="Boolean(cleaningCategoryId) || (pendingNeedsAcknowledgement && !destructiveConfirmed) || !pendingTypedConfirmationValid"
            @click="confirmCleanup"
          >
            <LoaderCircle v-if="cleaningCategoryId" class="spin" :size="15" />
            <Trash2 v-else :size="15" />
            {{ t('settings.storageManagement.confirmClean') }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.storage-management-panel {
  display: grid;
  gap: 12px;
  color: var(--theme-text);
}

.storage-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.storage-kicker {
  margin-bottom: 5px;
  color: var(--theme-accent);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

.storage-header h2,
.storage-modal h3 {
  margin: 0;
  color: var(--theme-text);
  letter-spacing: 0;
}

.storage-header h2 {
  font-size: 20px;
}

.storage-header p,
.storage-row p,
.storage-modal p {
  margin: 4px 0 0;
  color: var(--theme-text-muted);
  line-height: 1.55;
}

.storage-header p {
  font-size: 12px;
}

.icon-button,
.modal-close {
  width: 34px;
  height: 34px;
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: var(--theme-panel-soft);
  color: var(--theme-text-muted);
  cursor: pointer;
}

.icon-button:hover,
.modal-close:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 45%, var(--theme-border));
  color: var(--theme-text);
}

.storage-total {
  min-height: 74px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background: var(--theme-panel-soft);
}

.storage-total__icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
  color: var(--theme-accent);
}

.storage-total span,
.storage-total small {
  display: block;
  color: var(--theme-text-muted);
  font-size: 11px;
}

.storage-total strong {
  display: block;
  margin-top: 2px;
  font-size: 22px;
  letter-spacing: 0;
}

.storage-list {
  overflow: hidden;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background: var(--theme-panel);
}

.storage-group {
  display: grid;
  gap: 7px;
}

.storage-group__header {
  display: flex;
  align-items: baseline;
  gap: 9px;
  padding: 2px 2px 0;
}

.storage-group__header strong {
  color: var(--theme-text);
  font-size: 12px;
}

.storage-group__header span {
  color: var(--theme-text-muted);
  font-size: 10px;
}

.storage-row {
  min-height: 92px;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 142px;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}

.storage-row + .storage-row {
  border-top: 1px solid var(--theme-border);
}

.storage-row__icon {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 7px;
}

.tone-green { background: rgba(34, 197, 94, 0.13); color: #22c55e; }
.tone-blue { background: rgba(59, 130, 246, 0.13); color: #60a5fa; }
.tone-violet { background: rgba(139, 92, 246, 0.13); color: #a78bfa; }
.tone-amber { background: rgba(245, 158, 11, 0.13); color: #f59e0b; }
.tone-cyan { background: rgba(6, 182, 212, 0.13); color: #22d3ee; }
.tone-red { background: rgba(239, 68, 68, 0.13); color: #f87171; }

.storage-row__title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.storage-row__title strong {
  font-size: 13px;
}

.storage-row p {
  font-size: 11px;
}

.storage-row__meta {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  color: var(--theme-text-muted);
  font-size: 10px;
}

.row-scanning {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.risk-badge {
  padding: 2px 6px;
  border: 1px solid var(--theme-border);
  border-radius: 999px;
  font-size: 9px;
  font-weight: 750;
}

.risk-safe { color: #22c55e; background: rgba(34, 197, 94, 0.1); }
.risk-caution { color: #f59e0b; background: rgba(245, 158, 11, 0.1); }
.risk-destructive { color: #f87171; background: rgba(239, 68, 68, 0.1); }
.risk-protected { color: var(--theme-text-muted); background: var(--theme-panel-soft); }

.storage-row__size {
  display: grid;
  justify-items: end;
  gap: 8px;
}

.storage-row__size > strong {
  font-size: 15px;
  letter-spacing: 0;
}

.row-size-loader {
  color: var(--theme-text-muted);
}

.cleanup-button,
.modal-button {
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: var(--theme-panel-soft);
  color: var(--theme-text);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.cleanup-button:hover {
  border-color: color-mix(in srgb, var(--theme-accent) 48%, var(--theme-border));
}

.cleanup-button.destructive:hover,
.modal-button.danger {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(239, 68, 68, 0.13);
  color: #f87171;
}

.cleanup-button.protected {
  color: var(--theme-text-muted);
}

button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.storage-loading {
  min-height: 180px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  color: var(--theme-text-muted);
  font-size: 12px;
}

.storage-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  font-size: 11px;
}

.storage-notice.success { color: #22c55e; background: rgba(34, 197, 94, 0.09); }
.storage-notice.error { color: #f87171; background: rgba(239, 68, 68, 0.09); }

.storage-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.56);
}

.storage-modal {
  position: relative;
  width: min(440px, 100%);
  padding: 20px;
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  background: var(--theme-panel);
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.34);
}

.modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
}

.storage-modal__icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  margin-bottom: 12px;
  border-radius: 7px;
}

.storage-modal h3 {
  padding-right: 42px;
  font-size: 17px;
}

.storage-modal p {
  font-size: 12px;
}

.storage-modal__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 11px 12px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  background: var(--theme-panel-soft);
  font-size: 12px;
}

.confirm-check {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  margin-top: 14px;
  color: var(--theme-text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.confirm-check input {
  width: 15px;
  height: 15px;
  margin: 1px 0 0;
  accent-color: var(--theme-accent);
}

.typed-confirmation {
  display: grid;
  gap: 7px;
  margin-top: 14px;
}

.typed-confirmation label,
.backup-note {
  color: var(--theme-text-muted);
  font-size: 11px;
}

.typed-confirmation code {
  width: fit-content;
  padding: 4px 7px;
  border-radius: 5px;
  background: var(--theme-panel-soft);
  color: var(--theme-text);
  font-size: 10px;
}

.typed-confirmation input {
  min-height: 34px;
  padding: 0 10px;
  border: 1px solid var(--theme-border);
  border-radius: 6px;
  outline: none;
  background: var(--theme-panel-soft);
  color: var(--theme-text);
  font-size: 11px;
}

.typed-confirmation input:focus {
  border-color: color-mix(in srgb, var(--theme-accent) 55%, var(--theme-border));
}

.backup-note {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, var(--theme-accent) 24%, var(--theme-border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-accent) 7%, transparent);
}

.storage-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.modal-button {
  min-width: 92px;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 760px) {
  .storage-total {
    grid-template-columns: 42px minmax(0, 1fr);
  }

  .storage-total small {
    grid-column: 1 / -1;
  }

  .storage-row {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .storage-row__size {
    grid-column: 2;
    grid-template-columns: 1fr auto;
    justify-items: start;
    align-items: center;
  }
}
</style>
