<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, FolderOpen, Images, Sparkles, X } from 'lucide-vue-next'
import { defaultRecipeValues, recipeMissingFields, type Recipe, type RecipeBuild, type RecipeValues } from '@/lib/aiRecipes'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'
import { thumbnailUrl } from '@/lib/localMedia'

const props = defineProps<{ recipe: Recipe; preset?: RecipeValues }>()
const emit = defineEmits<{ (e: 'submit', build: RecipeBuild): void; (e: 'back'): void }>()
const { t } = useI18n()

const values = ref<RecipeValues>(defaultRecipeValues(props.recipe, props.preset || {}))
const products = ref<Array<{ id: string; name: string; coverImagePath?: string }>>([])
const schemes = ref<Array<{ id: string; name: string; status: string }>>([])
const touched = ref(false)

const visibleFields = computed(() => props.recipe.fields.filter((field) => !field.when || values.value[field.when.key] === field.when.equals))
const missing = computed(() => recipeMissingFields(props.recipe, values.value))
const missingKeys = computed(() => new Set(missing.value.map((field) => field.key)))

onMounted(async () => {
  try {
    products.value = ((await window.api.products.list()) as any[]).map((item) => ({ id: item.id, name: item.name, coverImagePath: item.coverImagePath }))
  } catch {
    products.value = []
  }
  if (props.recipe.fields.some((field) => field.type === 'scheme')) {
    try {
      schemes.value = (await window.api.productResearch.listSchemes()) as any[]
      if (!values.value.schemeId && schemes.value[0]) values.value.schemeId = schemes.value[0].id
    } catch {
      schemes.value = []
    }
    // No research scheme yet: start from the product library instead of a dead-end empty select.
    if (!schemes.value.length && values.value.source === 'scheme') values.value.source = 'products'
  }
})

function fileName(path: string) {
  return path.split(/[\\/]/).pop() || path
}

async function pickFromLibrary(key: string, type: 'image' | 'video') {
  const picked = await openAssetLibraryPicker({ type, multiple: true })
  if (!picked?.length) return
  const current: string[] = values.value[key] || []
  values.value[key] = Array.from(new Set([...current, ...picked.map((item) => item.filePath)]))
}

async function pickFromDisk(key: string, type: 'image' | 'video') {
  const extensions = type === 'image' ? ['png', 'jpg', 'jpeg', 'webp'] : ['mp4', 'mov', 'webm', 'mkv']
  const picked = (await window.api.pickFiles({ multiple: true, filters: [{ name: type === 'image' ? 'Images' : 'Videos', extensions }] })) as string[]
  if (!picked?.length) return
  const current: string[] = values.value[key] || []
  values.value[key] = Array.from(new Set([...current, ...picked]))
}

function removePath(key: string, path: string) {
  values.value[key] = (values.value[key] || []).filter((item: string) => item !== path)
}

function toggleProduct(key: string, id: string) {
  const current: string[] = values.value[key] || []
  values.value[key] = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
}

function submit() {
  touched.value = true
  if (missing.value.length) return
  emit('submit', props.recipe.build(values.value, (key, params) => t(key, params || {})))
}
</script>

<template>
  <form class="ai-recipe-form" @submit.prevent="submit">
    <header class="ai-recipe-form__head">
      <button type="button" class="vg-icon-btn vg-icon-btn--sm" :aria-label="t('common.cancel')" @click="emit('back')"><ArrowLeft :size="15" /></button>
      <div>
        <strong>{{ t(recipe.titleKey) }}</strong>
        <small>{{ t(recipe.outputKey) }}</small>
      </div>
    </header>

    <div v-for="field in visibleFields" :key="field.key" class="vg-field">
      <span class="vg-field__label">{{ t(field.labelKey) }}<span v-if="field.required" class="vg-req">*</span></span>

      <select v-if="field.type === 'product'" v-model="values[field.key]" class="vg-select">
        <option value="">{{ t('ai.fields.selectProduct') }}</option>
        <option v-for="product in products" :key="product.id" :value="product.id">{{ product.name }}</option>
      </select>

      <div v-else-if="field.type === 'products'" class="ai-recipe-form__chips">
        <button
          v-for="product in products"
          :key="product.id"
          type="button"
          class="vg-chip ai-recipe-form__chip"
          :class="{ 'is-on': (values[field.key] || []).includes(product.id) }"
          @click="toggleProduct(field.key, product.id)"
        >{{ product.name }}</button>
        <span v-if="!products.length" class="vg-muted">{{ t('ai.fields.noProducts') }}</span>
      </div>

      <select v-else-if="field.type === 'scheme'" v-model="values[field.key]" class="vg-select">
        <option v-for="scheme in schemes" :key="scheme.id" :value="scheme.id">{{ scheme.name }}</option>
      </select>

      <div v-else-if="field.type === 'videos' || field.type === 'images'" class="ai-recipe-form__media">
        <div class="vg-row">
          <button type="button" class="vg-btn vg-btn--sm" @click="pickFromLibrary(field.key, field.type === 'images' ? 'image' : 'video')"><Images :size="14" /> {{ t('ai.fields.fromLibrary') }}</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" @click="pickFromDisk(field.key, field.type === 'images' ? 'image' : 'video')"><FolderOpen :size="14" /> {{ t('ai.fields.fromDisk') }}</button>
          <span class="vg-muted">{{ t('ai.fields.selectedCount', { count: (values[field.key] || []).length }) }}</span>
        </div>
        <div v-if="(values[field.key] || []).length" class="ai-recipe-form__thumbs">
          <span v-for="path in values[field.key]" :key="path" class="ai-recipe-form__thumb" :title="fileName(path)">
            <img v-if="field.type === 'images'" :src="thumbnailUrl(path, 96)" alt="" />
            <span v-else class="ai-recipe-form__file vg-ellipsis">{{ fileName(path) }}</span>
            <button type="button" class="ai-recipe-form__remove" :aria-label="t('common.remove')" @click="removePath(field.key, path)"><X :size="11" /></button>
          </span>
        </div>
      </div>

      <textarea v-else-if="field.type === 'links'" v-model="values[field.key]" class="vg-textarea" rows="3" placeholder="https://"></textarea>
      <input v-else-if="field.type === 'number'" v-model.number="values[field.key]" class="vg-input" type="number" :min="field.min" :max="field.max" />
      <input v-else-if="field.type === 'datetime'" v-model="values[field.key]" class="vg-input" type="datetime-local" />
      <input v-else-if="field.type === 'text'" v-model="values[field.key]" class="vg-input" type="text" />
      <select v-else-if="field.type === 'select'" v-model="values[field.key]" class="vg-select">
        <option v-for="option in field.options" :key="option.value" :value="option.value">{{ t(option.labelKey) }}</option>
      </select>
      <button
        v-else-if="field.type === 'toggle'"
        type="button"
        class="vg-switch ai-recipe-form__switch"
        role="switch"
        :aria-checked="Boolean(values[field.key])"
        :class="{ 'is-on': values[field.key] }"
        @click="values[field.key] = !values[field.key]"
      >
        <span class="vg-switch__track"></span>
        <small>{{ values[field.key] ? t('ai.fields.on') : t('ai.fields.off') }}</small>
      </button>

      <span v-if="field.hintKey" class="vg-field__hint">{{ t(field.hintKey) }}</span>
      <span v-if="touched && missingKeys.has(field.key)" class="vg-field__error">{{ t('ai.fields.required') }}</span>
    </div>

    <p class="ai-recipe-form__note">{{ t('ai.recipes.approvalNote') }}</p>
    <button type="submit" class="vg-btn vg-btn--primary vg-btn--block" data-testid="ai-recipe-submit"><Sparkles :size="15" /> {{ t('ai.recipes.makePlan') }}</button>
  </form>
</template>

<style scoped>
.ai-recipe-form { display: flex; flex-direction: column; gap: 12px; }
.ai-recipe-form__head { display: flex; align-items: center; gap: 10px; }
.ai-recipe-form__head div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ai-recipe-form__head strong { font-size: 14px; }
.ai-recipe-form__head small { font-size: 12px; color: var(--theme-text-muted); }
.ai-recipe-form__chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 140px; overflow: auto; }
.ai-recipe-form__chip { cursor: pointer; height: 26px; padding: 0 10px; font-size: 12px; }
.ai-recipe-form__switch { border: 0; background: transparent; padding: 0; align-self: flex-start; }
.ai-recipe-form__chip.is-on { background: var(--vg-accent-soft); border-color: var(--vg-accent-line); color: var(--vg-accent); }
.ai-recipe-form__media { display: flex; flex-direction: column; gap: 8px; }
.ai-recipe-form__thumbs { display: flex; flex-wrap: wrap; gap: 6px; max-height: 160px; overflow: auto; }
.ai-recipe-form__thumb { position: relative; width: 64px; height: 64px; border-radius: 7px; overflow: hidden; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); display: inline-flex; align-items: center; justify-content: center; }
.ai-recipe-form__thumb img { width: 100%; height: 100%; object-fit: cover; }
.ai-recipe-form__file { font-size: 10px; padding: 4px; color: var(--theme-text-secondary); max-width: 100%; }
.ai-recipe-form__remove { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; border: 0; border-radius: 50%; background: rgba(0, 0, 0, .6); color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.ai-recipe-form__note { margin: 0; font-size: 12px; color: var(--theme-text-muted); }
</style>
