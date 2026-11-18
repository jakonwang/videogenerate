<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { CircleCheck, Copy, History, LoaderCircle, Save, SlidersHorizontal, Trash2, X } from 'lucide-vue-next'

type PromptKind = 'shot_video' | 'storyboard_model' | 'storyboard_product' | 'script_analysis'

type PromptVersion = {
  id: string
  kind: PromptKind
  productType: string
  name: string
  version: number
  prompt: string
  active: boolean
  builtin: boolean
}

const props = defineProps<{
  open: boolean
  /** Category to preselect, e.g. the bound product's category of the open project. */
  initialProductType?: string
  initialKind?: PromptKind
  /** Limit the dialog to the prompts of one pipeline step. Defaults to all kinds. */
  kinds?: PromptKind[]
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const ALL_KINDS: PromptKind[] = ['script_analysis', 'storyboard_model', 'storyboard_product', 'shot_video']
const visibleKinds = computed<PromptKind[]>(() => {
  const wanted = (props.kinds ?? []).filter((item) => ALL_KINDS.includes(item))
  return wanted.length ? wanted : ALL_KINDS
})

const kind = ref<PromptKind>('shot_video')
const productType = ref('all')
const productTypes = ref<string[]>(['all'])
const placeholdersByKind = ref<Record<string, string[]>>({})
const activeScopes = ref<string[]>([])
const versions = ref<PromptVersion[]>([])
const selectedId = ref('')
const draftName = ref('')
const draftPrompt = ref('')
const busy = ref(false)
const loading = ref(false)
const notice = ref('')
const errorText = ref('')

const selected = computed(() => versions.value.find((item) => item.id === selectedId.value))
const placeholders = computed(() => placeholdersByKind.value[kind.value] ?? [])
const dirty = computed(() => {
  const current = selected.value
  if (!current) return false
  return draftPrompt.value !== current.prompt || (!current.builtin && draftName.value !== current.name)
})

function scopeLabel(scope: string) {
  return t(`cloneUi.promptManager.categories.${scope}`)
}

function versionLabel(version: PromptVersion) {
  const name = version.builtin ? t('cloneUi.promptManager.builtinName') : `V${version.version} · ${version.name}`
  return version.active ? `${name} · ${t('cloneUi.promptManager.active')}` : name
}

function applySelection(preferId?: string) {
  const next =
    versions.value.find((item) => item.id === preferId) ||
    versions.value.find((item) => item.active) ||
    versions.value[0]
  selectedId.value = next?.id ?? ''
  draftName.value = next && !next.builtin ? next.name : ''
  draftPrompt.value = next?.prompt ?? ''
}

async function loadVersions(preferId?: string) {
  loading.value = true
  try {
    const [list, scopes] = await Promise.all([
      window.api.clone.listPromptTemplates({ kind: kind.value, productType: productType.value }) as Promise<PromptVersion[]>,
      window.api.clone.listActivePromptTemplateScopes({ kind: kind.value }) as Promise<string[]>,
    ])
    versions.value = Array.isArray(list) ? list : []
    activeScopes.value = Array.isArray(scopes) ? scopes : []
    applySelection(preferId)
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function initialize() {
  notice.value = ''
  errorText.value = ''
  try {
    const meta = (await window.api.clone.describePromptTemplates()) as {
      kinds: Array<{ kind: string; placeholders: string[] }>
      productTypes: string[]
    }
    productTypes.value = Array.isArray(meta?.productTypes) && meta.productTypes.length ? meta.productTypes : ['all']
    placeholdersByKind.value = Object.fromEntries((meta?.kinds ?? []).map((item) => [item.kind, item.placeholders]))
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
  kind.value = props.initialKind && visibleKinds.value.includes(props.initialKind) ? props.initialKind : visibleKinds.value[0]
  const wanted = String(props.initialProductType || '').trim()
  productType.value = productTypes.value.includes(wanted) ? wanted : 'all'
  await loadVersions()
}

watch(
  () => props.open,
  (open) => {
    if (open) void initialize()
  },
  { immediate: true },
)

function confirmDiscard() {
  return !dirty.value || window.confirm(t('cloneUi.promptManager.discardConfirm'))
}

async function switchKind(next: PromptKind) {
  if (next === kind.value || !confirmDiscard()) return
  kind.value = next
  notice.value = ''
  errorText.value = ''
  await loadVersions()
}

async function switchProductType(event: Event) {
  const target = event.target as HTMLSelectElement
  if (!confirmDiscard()) {
    target.value = productType.value
    return
  }
  productType.value = target.value
  notice.value = ''
  errorText.value = ''
  await loadVersions()
}

function switchVersion(event: Event) {
  const target = event.target as HTMLSelectElement
  if (!confirmDiscard()) {
    target.value = selectedId.value
    return
  }
  notice.value = ''
  errorText.value = ''
  applySelection(target.value)
}

async function run(action: () => Promise<void>) {
  busy.value = true
  notice.value = ''
  errorText.value = ''
  try {
    await action()
  } catch (error: any) {
    errorText.value = String(error?.message ?? error).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '')
  } finally {
    busy.value = false
  }
}

function save(asNew: boolean) {
  return run(async () => {
    const current = selected.value
    const createNew = asNew || !current || current.builtin
    const saved = (await window.api.clone.savePromptTemplate({
      id: createNew ? undefined : current.id,
      kind: kind.value,
      productType: productType.value,
      name: createNew && current && !current.builtin && draftName.value === current.name ? '' : draftName.value,
      prompt: draftPrompt.value,
    })) as PromptVersion
    await loadVersions(saved.id)
    notice.value = t('cloneUi.promptManager.saved', { version: saved.version })
  })
}

function activate() {
  return run(async () => {
    if (!selected.value) return
    await window.api.clone.activatePromptTemplate({ id: selected.value.id, kind: kind.value, productType: productType.value })
    await loadVersions(selected.value.id)
    notice.value = t('cloneUi.promptManager.activated')
  })
}

function rollback() {
  return run(async () => {
    if (!selected.value) return
    const restored = (await window.api.clone.rollbackPromptTemplate({
      id: selected.value.id,
      kind: kind.value,
      productType: productType.value,
    })) as PromptVersion
    await loadVersions(restored.id)
    notice.value = t('cloneUi.promptManager.restored', { version: restored.version })
  })
}

function remove() {
  return run(async () => {
    const current = selected.value
    if (!current || current.builtin) return
    if (!window.confirm(t('cloneUi.promptManager.deleteConfirm', { version: current.version }))) return
    await window.api.clone.removePromptTemplate({ id: current.id })
    await loadVersions()
    notice.value = t('cloneUi.promptManager.deleted')
  })
}

function placeholderToken(name: string) {
  return ['{', '{', name, '}', '}'].join('')
}

function insertPlaceholder(name: string) {
  draftPrompt.value = `${draftPrompt.value}${placeholderToken(name)}`
}

function close() {
  if (busy.value || !confirmDiscard()) return
  emit('close')
}
</script>

<template>
  <div v-if="open" class="vg-scope vg-backdrop" data-testid="clone-prompt-manager" @click.self="close">
    <section class="vg-dialog vg-dialog--xl cpm-dialog" role="dialog" aria-modal="true" @click.stop>
      <header class="vg-dialog__head">
        <div class="vg-dialog__title">
          <span class="vg-dialog__title-icon"><SlidersHorizontal :size="20" /></span>
          <div>
            <h2>{{ visibleKinds.length === 1 ? t('cloneUi.promptManager.titleFor', { kind: t(`cloneUi.promptManager.kinds.${kind}.label`) }) : t('cloneUi.promptManager.title') }}</h2>
            <p>{{ t('cloneUi.promptManager.desc') }}</p>
          </div>
        </div>
        <button type="button" class="vg-icon-btn" :aria-label="t('cloneUi.close')" :disabled="busy" @click="close"><X :size="18" /></button>
      </header>

      <div class="vg-dialog__body">
        <nav v-if="visibleKinds.length > 1" class="vg-tabs cpm-tabs" role="tablist">
          <button
            v-for="item in visibleKinds"
            :key="item"
            type="button"
            role="tab"
            class="vg-tabs__btn"
            :class="{ 'is-active': item === kind }"
            :aria-selected="item === kind"
            :data-testid="`clone-prompt-kind-${item}`"
            :disabled="busy"
            @click="switchKind(item)"
          >
            {{ t(`cloneUi.promptManager.kinds.${item}.label`) }}
          </button>
        </nav>
        <p class="vg-field__hint">{{ t(`cloneUi.promptManager.kinds.${kind}.hint`) }}</p>

        <div class="cpm-row">
          <label class="vg-field">
            <span class="vg-field__label">{{ t('cloneUi.promptManager.category') }}</span>
            <select class="vg-select" data-testid="clone-prompt-category" :value="productType" :disabled="busy" @change="switchProductType">
              <option v-for="scope in productTypes" :key="scope" :value="scope">
                {{ scopeLabel(scope) }}{{ activeScopes.includes(scope) ? ` · ${t('cloneUi.promptManager.customized')}` : '' }}
              </option>
            </select>
            <span class="vg-field__hint">{{ t('cloneUi.promptManager.categoryHint') }}</span>
          </label>
          <label class="vg-field">
            <span class="vg-field__label">{{ t('cloneUi.promptManager.version') }}</span>
            <select class="vg-select" data-testid="clone-prompt-version" :value="selectedId" :disabled="busy || loading" @change="switchVersion">
              <option v-for="version in versions" :key="version.id" :value="version.id">{{ versionLabel(version) }}</option>
            </select>
            <span class="vg-field__hint">{{ selected?.builtin ? t('cloneUi.promptManager.builtinHint') : t('cloneUi.promptManager.versionHint') }}</span>
          </label>
          <label class="vg-field">
            <span class="vg-field__label">{{ t('cloneUi.promptManager.name') }}</span>
            <input v-model="draftName" class="vg-input" type="text" maxlength="80" data-testid="clone-prompt-name" :placeholder="t('cloneUi.promptManager.namePlaceholder')" :disabled="busy" />
          </label>
        </div>

        <label class="vg-field">
          <span class="vg-field__label">{{ t('cloneUi.promptManager.content') }}</span>
          <textarea v-model="draftPrompt" class="vg-textarea cpm-textarea" rows="16" spellcheck="false" data-testid="clone-prompt-content" :disabled="busy" />
        </label>

        <div v-if="placeholders.length" class="cpm-placeholders">
          <span class="vg-field__hint">{{ t('cloneUi.promptManager.placeholders') }}</span>
          <button v-for="name in placeholders" :key="name" type="button" class="vg-chip cpm-placeholder" :title="t('cloneUi.promptManager.insertPlaceholder')" :disabled="busy" @click="insertPlaceholder(name)">
            {{ placeholderToken(name) }}
          </button>
        </div>

        <p v-if="errorText" class="cpm-message cpm-message--error" role="alert" data-testid="clone-prompt-error">{{ errorText }}</p>
        <p v-else-if="notice" class="cpm-message" data-testid="clone-prompt-notice">{{ notice }}</p>
      </div>

      <footer class="vg-dialog__foot">
        <div class="cpm-foot-left">
          <button type="button" class="vg-btn vg-btn--sm vg-btn--danger" data-testid="clone-prompt-delete" :disabled="busy || !selected || selected.builtin" @click="remove"><Trash2 :size="13" />{{ t('cloneUi.promptManager.remove') }}</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" data-testid="clone-prompt-rollback" :disabled="busy || !selected || dirty" @click="rollback"><History :size="13" />{{ t('cloneUi.promptManager.rollback') }}</button>
        </div>
        <div class="vg-dialog__foot-actions">
          <LoaderCircle v-if="busy" :size="16" class="vg-spin" />
          <button type="button" class="vg-btn vg-btn--sm" data-testid="clone-prompt-save-new" :disabled="busy || !draftPrompt.trim()" @click="save(true)"><Copy :size="13" />{{ t('cloneUi.promptManager.saveAsNew') }}</button>
          <button type="button" class="vg-btn vg-btn--sm" data-testid="clone-prompt-activate" :disabled="busy || !selected || selected.active || dirty" @click="activate"><CircleCheck :size="13" />{{ t('cloneUi.promptManager.activate') }}</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--primary" data-testid="clone-prompt-save" :disabled="busy || !selected || selected.builtin || !dirty || !draftPrompt.trim()" @click="save(false)"><Save :size="13" />{{ t('cloneUi.promptManager.save') }}</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.cpm-dialog { max-height: 94vh; }
.cpm-tabs { flex-shrink: 0; overflow-y: hidden; }
.cpm-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
.cpm-textarea { min-height: 260px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
.cpm-placeholders { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cpm-placeholder { cursor: pointer; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.cpm-placeholder:hover:not(:disabled) { color: var(--vg-accent); border-color: var(--vg-accent-line); }
.cpm-message { margin: 0; font-size: 12px; color: var(--vg-accent); }
.cpm-message--error { color: var(--vg-red); white-space: pre-wrap; }
.cpm-foot-left { display: inline-flex; gap: 8px; }
@media (max-width: 860px) {
  .cpm-row { grid-template-columns: minmax(0, 1fr); }
}
</style>
