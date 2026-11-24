<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileImage, Tag } from 'lucide-vue-next'
import { normalizeProductCode, type ProductCodeLink } from '../../../../../shared/productCode'
import { HOT_TYPES } from '../../../../../shared/productCodeStats'
import { productCodeError } from './productCodeText'

/** 商品详情里的款号：填写，并列出两家店用这个款号的商品。 */
const props = defineProps<{ code?: string; hotType?: string; save: (code: string) => Promise<void>; saveHotType: (value: string) => Promise<void> }>()
const { t } = useI18n()
const draft = ref('')
const saving = ref(false)
const error = ref('')
const links = ref<ProductCodeLink[] | null>(null)
const changed = computed(() => normalizeProductCode(draft.value) !== normalizeProductCode(props.code))

const suggestion = ref<{ type: string; reason: string } | null>(null)
const hotOptions = computed(() => [...new Set([...HOT_TYPES, ...(props.hotType ? [props.hotType] : [])])])

let request = 0
async function loadLinks() {
  const id = ++request
  const api = window.api.productCodes
  const next = props.code && api ? await api.links(props.code).catch(() => null) : null
  if (id !== request) return
  links.value = next
  const detail = props.code && api ? await api.detail(props.code).catch(() => null) : null
  if (id === request) suggestion.value = detail?.suggestion ? { type: detail.suggestion, reason: detail.reason || '' } : null
}

watch(() => props.code, (value) => {
  draft.value = value || ''
  error.value = ''
  void loadLinks()
}, { immediate: true })

async function submit() {
  if (!changed.value || saving.value) return
  saving.value = true
  error.value = ''
  try {
    await props.save(normalizeProductCode(draft.value))
  } catch (reason) {
    error.value = productCodeError(reason, t)
  } finally {
    saving.value = false
  }
}

function price(value?: number) {
  return value === undefined ? '-' : value.toLocaleString()
}
</script>

<template>
  <article class="vg-card" data-testid="product-code-card">
    <div class="vg-card__head"><span class="vg-card__title"><Tag :size="16" /> {{ t('productLibrary.code.title') }}</span></div>
    <form class="pcode-form" @submit.prevent="submit">
      <input v-model="draft" class="vg-input" maxlength="80" :placeholder="t('productLibrary.code.placeholder')" data-testid="product-code-input" />
      <button class="vg-btn vg-btn--primary vg-btn--sm" type="submit" :disabled="!changed || saving" data-testid="product-code-save">{{ t('productLibrary.code.save') }}</button>
    </form>
    <p v-if="error" class="pcode-error" role="alert">{{ error }}</p>
    <p v-else class="pcode-hint">{{ t('productLibrary.code.hint') }}</p>
    <div class="pcode-hot">
      <label>{{ t('productLibrary.hot.label') }}
        <select class="vg-select vg-select--sm" :value="hotType || ''" data-testid="product-hot-type" @change="saveHotType(($event.target as HTMLSelectElement).value)">
          <option value="">{{ t('productLibrary.hot.none') }}</option>
          <option v-for="item in hotOptions" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <span v-if="suggestion && suggestion.type !== hotType" :title="suggestion.reason">{{ t('productLibrary.hot.suggest', { type: suggestion.type }) }}<small>{{ suggestion.reason }}</small> <button class="vg-btn vg-btn--xs" type="button" @click="saveHotType(suggestion.type)">{{ t('productLibrary.hot.use') }}</button></span>
    </div>
    <template v-if="code && links">
      <h4 class="pcode-sub">{{ t('productLibrary.code.linked', { count: links.length }) }}</h4>
      <p v-if="!links.length" class="pcode-hint">{{ t('productLibrary.code.noLink') }}</p>
      <ul v-else class="pcode-links">
        <li v-for="item in links" :key="`${item.shopKey}:${item.productId}`">
          <img v-if="item.image" :src="item.image" alt="" loading="lazy" /><span v-else class="pcode-links__ph"><FileImage :size="16" /></span>
          <div>
            <b :title="item.title">{{ item.title }}</b>
            <small>{{ item.shopName }} · {{ t('productLibrary.code.price') }} {{ price(item.price) }} · {{ t('productLibrary.code.stock') }} {{ item.stock }}<template v-if="item.shared"> · {{ t('productLibrary.code.shared') }}</template></small>
          </div>
        </li>
      </ul>
    </template>
  </article>
</template>

<style scoped>
.pcode-hot { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; margin-top: 12px; font-size: 12px; color: var(--theme-text-secondary); }
.pcode-hot label, .pcode-hot span { display: inline-flex; align-items: center; gap: 8px; }
.pcode-hot small { color: var(--theme-text-muted); }
.pcode-form { display: flex; gap: 8px; align-items: center; }
.pcode-form .vg-input { flex: 1; min-width: 0; text-transform: uppercase; }
.pcode-form .vg-input::placeholder { text-transform: none; }
.pcode-hint, .pcode-error { margin: 8px 0 0; font-size: 12px; line-height: 1.5; color: var(--theme-text-muted); }
.pcode-error { color: var(--theme-tone-red); }
.pcode-sub { margin: 14px 0 8px; font-size: 12px; font-weight: 700; color: var(--theme-text-secondary); }
.pcode-links { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 260px; overflow: auto; scrollbar-width: thin; }
.pcode-links li { display: flex; gap: 10px; align-items: center; min-width: 0; }
.pcode-links img, .pcode-links__ph { width: 40px; height: 40px; flex: none; border-radius: 6px; object-fit: cover; background: var(--theme-panel-soft); display: grid; place-items: center; color: var(--theme-text-muted); }
.pcode-links div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pcode-links b { font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pcode-links small { font-size: 11px; color: var(--theme-text-muted); }
</style>
