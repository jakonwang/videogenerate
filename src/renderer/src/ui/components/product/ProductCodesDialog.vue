<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tag, X } from 'lucide-vue-next'
import type { ProductCodeOverview } from '../../../../../shared/productCode'
import type { CodeGap } from '../../../../../shared/productCodeStats'

/** 款号检查：旧商品一键补款号，以及需要人工确认的清单。只列问题，不自动改店铺数据。 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; changed: []; openProduct: [id: string] }>()
const { t } = useI18n()
const data = ref<ProductCodeOverview | null>(null)
const gaps = ref<CodeGap[]>([])
const busy = ref(false)
const message = ref('')
type Tab = 'gaps' | 'suggestions' | 'conflicts' | 'duplicates' | 'unmatched' | 'notListed'
const tab = ref<Tab>('suggestions')

async function load() {
  busy.value = true
  try {
    data.value = await window.api.productCodes.overview()
    gaps.value = (await window.api.productCodes.stats().catch(() => null))?.gaps || []
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

watch(() => props.open, async (open) => {
  if (!open) return
  message.value = ''
  await load()
  const first = tabs.value.find((item) => item.count)
  tab.value = first?.key || 'suggestions'
})

const tabs = computed(() => (['suggestions', 'conflicts', 'duplicates', 'gaps', 'unmatched', 'notListed'] as Tab[]).map((key) => ({ key, count: key === 'gaps' ? gaps.value.length : data.value?.[key].length || 0 })))
const ready = computed(() => data.value?.suggestions.filter((item) => !item.duplicate).length || 0)

async function apply() {
  busy.value = true
  try {
    const result = await window.api.productCodes.applySuggestions()
    message.value = t('productLibrary.code.applied', { count: result.applied })
    emit('changed')
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  }
  await load()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="vg-scope vg-backdrop" data-testid="product-codes-dialog" @click.self="emit('close')" @keydown.esc="emit('close')">
      <section class="vg-dialog vg-dialog--wide" role="dialog" aria-modal="true" :aria-label="t('productLibrary.code.check')">
        <header class="vg-dialog__head">
          <div class="vg-dialog__title">
            <span class="vg-dialog__title-icon"><Tag :size="19" /></span>
            <div>
              <h2>{{ t('productLibrary.code.check') }}</h2>
              <p v-if="data">{{ t('productLibrary.code.summary', { matched: data.matchedProducts, total: data.storeProducts }) }}</p>
            </div>
          </div>
          <button class="vg-icon-btn" type="button" :aria-label="t('productLibrary.promptSettings.close')" @click="emit('close')"><X :size="18" /></button>
        </header>
        <div class="vg-dialog__body pcd-body">
          <div class="pcd-tabs" role="tablist">
            <button v-for="item in tabs" :key="item.key" type="button" role="tab" :aria-selected="tab === item.key" class="vg-btn vg-btn--sm" :class="{ 'vg-btn--soft': tab === item.key }" @click="tab = item.key">
              {{ t(`productLibrary.code.tabs.${item.key}`) }} <b class="vg-num">{{ item.count }}</b>
            </button>
          </div>
          <p class="pcd-tip">{{ t(`productLibrary.code.tips.${tab}`) }}</p>
          <p v-if="message" class="pcd-message" role="status">{{ message }}</p>
          <div v-if="data" class="pcd-list">
            <template v-if="tab === 'suggestions'">
              <button v-for="item in data.suggestions" :key="item.productId" type="button" class="pcd-row" @click="emit('openProduct', item.productId)">
                <b>{{ item.code }}</b><span>{{ item.name }}</span><em v-if="item.duplicate">{{ t('productLibrary.code.repeat') }}</em>
              </button>
            </template>
            <template v-else-if="tab === 'conflicts'">
              <div v-for="item in data.conflicts" :key="item.productId + item.sellerSku" class="pcd-row">
                <img v-if="item.image" :src="item.image" alt="" loading="lazy" />
                <span :title="item.title">{{ item.title }}<small>{{ item.shopName }} · {{ t('productLibrary.code.inTitle') }} {{ item.titleCode }} · {{ t('productLibrary.code.inSku') }} {{ item.sellerSku }}</small></span>
              </div>
            </template>
            <template v-else-if="tab === 'duplicates'">
              <template v-for="group in data.duplicates" :key="group.code">
                <button v-for="item in group.products" :key="item.id" type="button" class="pcd-row" @click="emit('openProduct', item.id)"><b>{{ group.code }}</b><span>{{ item.name }}</span></button>
              </template>
            </template>
            <template v-else-if="tab === 'gaps'">
              <div v-for="item in gaps" :key="item.code" class="pcd-row">
                <img v-if="item.image" :src="item.image" alt="" loading="lazy" /><b>{{ item.code }}</b>
                <span :title="item.name">{{ item.name }}<small>{{ t('productLibrary.code.gapLine', { units: item.units30, sold: item.soldIn, missing: item.missingIn }) }}</small></span>
                <em v-if="item.suggestion">{{ item.suggestion }}</em>
              </div>
            </template>
            <template v-else-if="tab === 'unmatched'">
              <div v-for="item in data.unmatched" :key="item.productId" class="pcd-row">
                <img v-if="item.image" :src="item.image" alt="" loading="lazy" /><span :title="item.title">{{ item.title }}<small>{{ item.shopName }}</small></span>
              </div>
            </template>
            <template v-else>
              <div v-for="code in data.notListed" :key="code" class="pcd-row"><b>{{ code }}</b></div>
            </template>
            <p v-if="!tabs.find((item) => item.key === tab)?.count" class="pcd-empty">{{ t('productLibrary.code.empty') }}</p>
          </div>
        </div>
        <footer class="vg-dialog__foot">
          <span></span>
          <div class="vg-dialog__foot-actions">
            <button v-if="tab === 'suggestions'" class="vg-btn vg-btn--primary" type="button" data-testid="product-codes-apply" :disabled="busy || !ready" @click="apply">{{ t('productLibrary.code.apply', { count: ready }) }}</button>
            <button class="vg-btn" type="button" @click="emit('close')">{{ t('productLibrary.promptSettings.close') }}</button>
          </div>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.pcd-body { display: flex; flex-direction: column; gap: 10px; }
.pcd-tabs { display: flex; flex-wrap: wrap; gap: 8px; }
.pcd-tip, .pcd-message { margin: 0; font-size: 12px; color: var(--theme-text-muted); }
.pcd-message { color: var(--vg-accent); }
.pcd-list { display: flex; flex-direction: column; max-height: 46vh; overflow: auto; scrollbar-width: thin; border: 1px solid var(--theme-border); border-radius: 8px; }
.pcd-row { display: flex; align-items: center; gap: 12px; min-height: 42px; padding: 6px 12px; border: 0; border-bottom: 1px solid var(--theme-divider); background: transparent; color: var(--theme-text); font: inherit; font-size: 13px; text-align: left; }
button.pcd-row { cursor: pointer; }
button.pcd-row:hover { background: var(--theme-panel-soft); }
.pcd-row:last-child { border-bottom: 0; }
.pcd-row b { flex: none; min-width: 72px; color: var(--vg-accent); }
.pcd-row img { width: 36px; height: 36px; flex: none; border-radius: 6px; object-fit: cover; }
.pcd-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pcd-row small { display: block; font-size: 11px; color: var(--theme-text-muted); }
.pcd-row em { margin-left: auto; flex: none; font-style: normal; font-size: 12px; color: var(--theme-tone-amber); }
.pcd-empty { margin: 0; padding: 28px; text-align: center; font-size: 13px; color: var(--theme-text-muted); }
</style>
