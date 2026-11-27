<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ScrollText, X } from 'lucide-vue-next'

const { t: tr } = useI18n()

type RuntimeLogItem = {
  id: string
  level: 'info' | 'success' | 'error'
  message: string
  time: number
}

type RuntimeLogCategory = 'all' | 'generation' | 'export' | 'sync' | 'stage' | 'model' | 'error' | 'other'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    logs: RuntimeLogItem[]
    title?: string
    description?: string
    hint?: string
    fabLabel?: string
    emptyTitle?: string
    emptyDescription?: string
    showAll?: boolean
  }>(),
  {
    title: '',
    description: '',
    hint: '',
    showAll: false,
    fabLabel: '',
    emptyTitle: '',
    emptyDescription: '',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const runtimeNoisePatterns = [/runtime console ready/i, /open export config dialog/i, /view item/i, /remove listing image/i, /refresh list$/i]

const cloneDebugNoisePatterns = [
  /\[clone-debug\]\s+repo-upsert-project/i,
  /\[clone-debug\]\s+stage-state/i,
]

const runtimeImportantPatterns = [
  /model-routing/i,
  /start generate/i,
  /retry/i,
  /generate/i,
  /export/i,
  /save export/i,
  /save item/i,
  /remove item/i,
  /error/i,
  /failed/i,
  /success/i,
  /completed/i,
]

function isImportantRuntimeLog(item: RuntimeLogItem) {
  const text = String(item.message || '').trim()
  if (!text) return false
  if (item.level === 'error' || item.level === 'success') return true
  if (runtimeNoisePatterns.some((pattern) => pattern.test(text))) return false
  if (cloneDebugNoisePatterns.some((pattern) => pattern.test(text))) return false
  return runtimeImportantPatterns.some((pattern) => pattern.test(text))
}

function resolveRuntimeCategory(item: RuntimeLogItem): Exclude<RuntimeLogCategory, 'all'> {
  const text = String(item.message || '').toLowerCase()
  if (item.level === 'error' || /error|failed|timeout|warning/.test(text)) return 'error'
  if (/model-routing|provider|profile|baseurl|model=/.test(text)) return 'model'
  if (/stage|step|retry/.test(text)) return 'stage'
  if (/export|excel/.test(text)) return 'export'
  if (/sync|upload|download|query/.test(text)) return 'sync'
  if (/generate|save item|remove item/.test(text)) return 'generation'
  return 'other'
}

const categoryOptions = computed<Array<{ value: RuntimeLogCategory; label: string }>>(() => [
  { value: 'all', label: tr('autoUi.k_778fc8f99453') },
  { value: 'generation', label: tr('autoUi.k_4aa23063955b') },
  { value: 'export', label: tr('autoUi.k_188896795f1d') },
  { value: 'sync', label: tr('autoUi.k_e88ab5ba616a') },
  { value: 'stage', label: tr('autoUi.k_4ca39faad0bd') },
  { value: 'model', label: tr('autoUi.k_98fd0cbd9c31') },
  { value: 'error', label: tr('autoUi.k_b859c7be7501') },
  { value: 'other', label: tr('autoUi.k_1a26edf94a81') },
])

const activeCategory = ref<RuntimeLogCategory>('all')
const resolvedTitle = computed(() => props.title || tr('autoUi.k_a8ce402665f3'))
const resolvedDescription = computed(() => props.description || tr('autoUi.k_9bac1ee6e12b'))
const resolvedFabLabel = computed(() => props.fabLabel || tr('autoUi.k_a8ce402665f3'))
const resolvedEmptyTitle = computed(() => props.emptyTitle || tr('autoUi.k_44060e77b11c'))
const resolvedEmptyDescription = computed(() => props.emptyDescription || tr('autoUi.k_21f67051b889'))
const importantLogs = computed(() =>
  (Array.isArray(props.logs) ? props.logs : []).filter((item) =>
    props.showAll ? Boolean(String(item.message || '').trim()) : isImportantRuntimeLog(item),
  ),
)
const visibleLogs = computed(() =>
  importantLogs.value.filter((item) => activeCategory.value === 'all' || resolveRuntimeCategory(item) === activeCategory.value),
)
const countLabel = computed(() => tr('autoUi.k_2a23e842e5d2', { p0: visibleLogs.value.length }))

const categoryCountMap = computed(() => {
  const counts: Record<RuntimeLogCategory, number> = {
    all: importantLogs.value.length,
    generation: 0,
    export: 0,
    sync: 0,
    stage: 0,
    model: 0,
    error: 0,
    other: 0,
  }
  for (const item of importantLogs.value) {
    counts[resolveRuntimeCategory(item)] += 1
  }
  return counts
})

// Only show categories that actually have logs, so the filter row isn't a wall of zeros.
const visibleCategoryOptions = computed(() =>
  categoryOptions.value.filter(
    (option) => option.value === 'all' || option.value === activeCategory.value || categoryCountMap.value[option.value] > 0,
  ),
)
const showFilters = computed(() => visibleCategoryOptions.value.length > 2)
const errorCount = computed(() => categoryCountMap.value.error)

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeDialog()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) window.addEventListener('keydown', handleKeydown)
    else window.removeEventListener('keydown', handleKeydown)
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))

function openDialog() {
  emit('update:modelValue', true)
}

function closeDialog() {
  emit('update:modelValue', false)
}

function formatRuntimeTime(value: number) {
  const date = new Date(value)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function levelLabel(level: RuntimeLogItem['level']) {
  if (level === 'error') return tr('autoUi.k_b859c7be7501')
  if (level === 'success') return tr('autoUi.k_51991a5d111a')
  return tr('autoUi.k_4de50894b8c1')
}

function extractField(text: string, key: string) {
  const match = text.match(new RegExp(`${key}=([^\\s]+)`))
  return match?.[1] || ''
}

function extractJsonValue(text: string, key: string) {
  const match = text.match(new RegExp(`"${key}"\\s*:\\s*("([^"]*)"|\\d+|true|false|null)`))
  if (!match) return ''
  return String(match[2] ?? match[1] ?? '').replace(/^"|"$/g, '')
}

function resolveRuntimeAction(item: RuntimeLogItem) {
  const text = String(item.message || '').toLowerCase()
  if (item.level === 'error') return tr('autoUi.k_3e3c8068bb0e')
  if (text.includes('model-routing')) return tr('autoUi.k_98fd0cbd9c31')
  if (text.includes('export')) return tr('autoUi.k_188896795f1d')
  if (text.includes('retry')) return tr('autoUi.k_e2d53a6d3a6a')
  if (text.includes('stage')) return tr('autoUi.k_4ca39faad0bd')
  if (text.includes('generate')) return tr('autoUi.k_4aa23063955b')
  if (item.level === 'success') return tr('autoUi.k_33246f6a5e5b')
  return tr('autoUi.k_4de50894b8c1')
}

function formatRuntimeMessage(message: string) {
  const text = String(message || '').replace(/\u001b\[[0-9;]*m/g, '').trim()
  if (!text) return ''

  if (cloneDebugNoisePatterns.some((pattern) => pattern.test(text))) return ''

  if (text.includes('tiktok-listing-model-routing')) {
    const provider = extractJsonValue(text, 'provider') || tr('autoUi.k_8fa4efdb7e89')
    const model = extractJsonValue(text, 'model') || tr('autoUi.k_8b2303608fbd')
    return tr('autoUi.k_a4541621551b', { p0: provider, p1: model })
  }
  if (text.includes('[tiktok-listing] start generate')) {
    const sku = extractField(text, 'sku')
    return sku ? tr('autoUi.k_61d7005f0c6f', { p0: sku }) : tr('autoUi.k_970fb9cadf54')
  }
  if (text.includes('[tiktok-listing] stage title')) {
    const sku = extractField(text, 'sku')
    return sku ? tr('autoUi.k_271402093c17', { p0: sku }) : tr('autoUi.k_ef9b4a19c536')
  }
  if (text.includes('[tiktok-listing] stage analysis-board')) {
    const sku = extractField(text, 'sku')
    return sku ? tr('autoUi.k_8934eb45b7c6', { p0: sku }) : tr('autoUi.k_cccc23dbfb80')
  }
  if (text.includes('[tiktok-listing] stage images')) {
    const sku = extractField(text, 'sku')
    return sku ? tr('autoUi.k_c712d7b3eaf8', { p0: sku }) : tr('autoUi.k_147fdf88c8f9')
  }
  if (text.includes('[tiktok-listing] stage description-html')) {
    const sku = extractField(text, 'sku')
    return sku ? tr('autoUi.k_f28b2ed6097e', { p0: sku }) : tr('autoUi.k_ed06cecdcf72')
  }
  if (text.includes('[tiktok-listing] retry title')) {
    const sku = extractField(text, 'sku')
    const attempt = extractField(text, 'attempt')
    return sku ? tr('autoUi.k_dc203b880cda', { p0: sku, p1: attempt }) : tr('autoUi.k_6dc66fcb580a', { p0: attempt })
  }
  if (text.includes('[tiktok-listing] retry analysis-board')) {
    const sku = extractField(text, 'sku')
    const attempt = extractField(text, 'attempt')
    return sku ? tr('autoUi.k_6630bfad7331', { p0: sku, p1: attempt }) : tr('autoUi.k_62f8f9df54a1', { p0: attempt })
  }
  if (text.includes('[tiktok-listing] retry images')) {
    const sku = extractField(text, 'sku')
    const attempt = extractField(text, 'attempt')
    return sku ? tr('autoUi.k_6fc7adf3f79a', { p0: sku, p1: attempt }) : tr('autoUi.k_47e11419947e', { p0: attempt })
  }
  if (text.includes('[tiktok-listing] save item sku=')) {
    const sku = extractField(text, 'sku')
    return sku ? tr('autoUi.k_2eef583f38bc', { p0: sku }) : tr('autoUi.k_69f15098edc4')
  }
  if (text.includes('[tiktok-listing] remove item completed')) {
    const sku = extractField(text, 'sku')
    return sku ? tr('autoUi.k_1692579fe5d6', { p0: sku }) : tr('autoUi.k_4478a948f85b')
  }
  if (text.includes('[tiktok-listing] export excel path=')) return tr('autoUi.k_9303cc81f994')
  if (text.includes('[tiktok-listing] save export category configs')) return tr('autoUi.k_eab6bee944f2')

  return text.replace(/^\[[^\]]+\]\s*/, '')
}
</script>

<template>
  <button class="runtime-fab" type="button" @click="openDialog">
    <span class="runtime-fab__dot" :class="{ active: visibleLogs.length > 0, error: errorCount > 0 }"></span>
    <span>{{ resolvedFabLabel }}</span>
    <strong>{{ visibleLogs.length }}</strong>
  </button>

  <Transition name="runtime-drawer">
    <div v-if="modelValue" class="runtime-dialog" role="dialog" aria-modal="true">
      <div class="runtime-dialog__backdrop" @click="closeDialog"></div>
      <aside class="runtime-dialog__panel">
        <header class="runtime-head">
          <span class="runtime-head__icon"><ScrollText :size="18" /></span>
          <div class="runtime-head__text">
            <div class="runtime-head__title">
              <strong>{{ resolvedTitle }}</strong>
              <span class="runtime-head__count">{{ countLabel }}</span>
            </div>
            <p>{{ resolvedDescription }}</p>
          </div>
          <button class="runtime-head__close" type="button" :title="tr('autoUi.k_6c14bd7f6f9e')" @click="closeDialog">
            <X :size="16" />
          </button>
        </header>

        <nav v-if="showFilters" class="runtime-tabs">
          <button
            v-for="option in visibleCategoryOptions"
            :key="option.value"
            class="runtime-tab"
            :class="{ 'runtime-tab--active': activeCategory === option.value, 'runtime-tab--error': option.value === 'error' }"
            type="button"
            @click="activeCategory = option.value"
          >
            {{ option.label }}
            <span>{{ categoryCountMap[option.value] }}</span>
          </button>
        </nav>

        <div class="runtime-body">
          <ol v-if="visibleLogs.length" class="runtime-timeline">
            <li v-for="item in visibleLogs" :key="item.id" class="runtime-row" :class="`runtime-row--${item.level}`">
              <time>{{ formatRuntimeTime(item.time) }}</time>
              <span class="runtime-row__dot"></span>
              <div class="runtime-row__content">
                <span class="runtime-row__tag">{{ resolveRuntimeAction(item) }}</span>
                <p>{{ formatRuntimeMessage(item.message) }}</p>
              </div>
            </li>
          </ol>

          <div v-else class="runtime-empty">
            <span class="runtime-empty__icon"><ScrollText :size="22" /></span>
            <strong>{{ resolvedEmptyTitle }}</strong>
            <p>{{ resolvedEmptyDescription }}</p>
          </div>
        </div>

        <footer v-if="hint" class="runtime-foot">{{ hint }}</footer>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.runtime-fab {
  position: fixed;
  right: 24px;
  bottom: 28px;
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 8px 0 14px;
  border: 1px solid var(--theme-border);
  border-radius: 999px;
  background: var(--theme-panel);
  box-shadow: var(--theme-shadow-float);
  color: var(--theme-text);
  font-size: 13px;
  cursor: pointer;
}

.runtime-fab:hover {
  border-color: var(--theme-accent);
}

.runtime-fab strong {
  min-width: 24px;
  height: 24px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--theme-accent-soft);
  color: var(--theme-control-selected-text);
  font-size: 12px;
  font-weight: 700;
  box-sizing: border-box;
}

.runtime-fab__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--theme-text-muted);
}

.runtime-fab__dot.active {
  background: var(--theme-success-text);
  box-shadow: 0 0 0 4px var(--theme-success-soft);
}

.runtime-fab__dot.error {
  background: var(--theme-danger-text);
  box-shadow: 0 0 0 4px var(--theme-danger-soft);
}

/* Drawer */
.runtime-dialog {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  justify-content: flex-end;
}

.runtime-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
}

.runtime-dialog__panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(480px, 100vw);
  height: 100%;
  border-left: 1px solid var(--theme-border);
  background: var(--theme-panel);
  box-shadow: var(--theme-shadow-dialog);
}

.runtime-drawer-enter-active,
.runtime-drawer-leave-active {
  transition: opacity 0.18s ease;
}

.runtime-drawer-enter-active .runtime-dialog__panel,
.runtime-drawer-leave-active .runtime-dialog__panel {
  transition: transform 0.22s ease;
}

.runtime-drawer-enter-from,
.runtime-drawer-leave-to {
  opacity: 0;
}

.runtime-drawer-enter-from .runtime-dialog__panel,
.runtime-drawer-leave-to .runtime-dialog__panel {
  transform: translateX(24px);
}

/* Header */
.runtime-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--theme-border);
}

.runtime-head__icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--theme-accent-soft);
  color: var(--theme-accent);
}

.runtime-head__text {
  flex: 1;
  min-width: 0;
}

.runtime-head__title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.runtime-head__title strong {
  color: var(--theme-text);
  font-size: 15px;
  font-weight: 700;
}

.runtime-head__count {
  color: var(--theme-text-muted);
  font-size: 12px;
}

.runtime-head__text p {
  margin: 4px 0 0;
  color: var(--theme-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.runtime-head__close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--theme-text-muted);
  cursor: pointer;
}

.runtime-head__close:hover {
  background: var(--theme-control);
  color: var(--theme-text);
}

/* Category tabs */
.runtime-tabs {
  display: flex;
  gap: 18px;
  padding: 0 18px;
  border-bottom: 1px solid var(--theme-border);
  overflow-x: auto;
}

.runtime-tab {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  color: var(--theme-text-muted);
  font-size: 13px;
  cursor: pointer;
}

.runtime-tab span {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

.runtime-tab:hover {
  color: var(--theme-text);
}

.runtime-tab--active {
  border-bottom-color: var(--theme-accent);
  color: var(--theme-text);
  font-weight: 600;
}

.runtime-tab--error span {
  color: var(--theme-danger-text);
  opacity: 1;
}

/* Timeline */
.runtime-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.runtime-timeline {
  list-style: none;
  margin: 0;
  padding: 10px 18px 18px;
}

.runtime-row {
  position: relative;
  display: grid;
  grid-template-columns: 58px 14px minmax(0, 1fr);
  column-gap: 8px;
  padding: 8px 0;
}

.runtime-row time {
  padding-top: 2px;
  color: var(--theme-text-muted);
  font-size: 11px;
  font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

.runtime-row__dot {
  position: relative;
  justify-self: center;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 999px;
  background: var(--theme-text-muted);
  box-shadow: 0 0 0 3px var(--theme-panel);
}

/* vertical line connecting dots */
.runtime-row::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(58px + 8px + 7px);
  width: 1px;
  background: color-mix(in srgb, var(--theme-text-muted) 35%, transparent);
}

.runtime-row:first-child::before {
  top: 13px;
}

.runtime-row:last-child::before {
  bottom: calc(100% - 13px);
}

.runtime-row--success .runtime-row__dot {
  background: var(--theme-success-text);
  box-shadow: 0 0 0 3px var(--theme-success-soft);
}

.runtime-row--error .runtime-row__dot {
  background: var(--theme-danger-text);
  box-shadow: 0 0 0 3px var(--theme-danger-soft);
}

.runtime-row__content {
  min-width: 0;
}

.runtime-row__tag {
  display: inline-block;
  margin-bottom: 2px;
  color: var(--theme-text-muted);
  font-size: 11px;
}

.runtime-row--error .runtime-row__tag {
  color: var(--theme-danger-text);
}

.runtime-row--success .runtime-row__tag {
  color: var(--theme-success-text);
}

.runtime-row p {
  margin: 0;
  color: var(--theme-text);
  font-size: 13px;
  line-height: 1.55;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.runtime-row--error .runtime-row__content {
  padding: 6px 10px;
  margin: -4px 0;
  border-left: 2px solid var(--theme-danger-text);
  border-radius: 6px;
  background: color-mix(in srgb, var(--theme-danger-soft) 55%, transparent);
}

/* Empty */
.runtime-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  padding: 32px 24px;
  text-align: center;
}

.runtime-empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-bottom: 6px;
  border-radius: 14px;
  background: var(--theme-panel-soft);
  color: var(--theme-text-muted);
}

.runtime-empty strong {
  color: var(--theme-text);
  font-size: 14px;
  font-weight: 600;
}

.runtime-empty p {
  margin: 0;
  color: var(--theme-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

.runtime-foot {
  padding: 10px 18px;
  border-top: 1px solid var(--theme-border);
  color: var(--theme-text-muted);
  font-size: 11px;
}

@media (max-width: 1024px) {
  .runtime-fab {
    right: 14px;
    bottom: 16px;
  }
}
</style>
