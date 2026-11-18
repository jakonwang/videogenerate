<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Save, Search, Trash2, Wallet } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubProductCost, CreatorHubSample } from '../../../../../shared/creatorHub'
import { costKey } from '../../../../../shared/creatorHubFulfillment'
import ChPager from './ChPager.vue'
import { formatMoney } from './creatorHubFormat'

/** Sample cost entry per product (default for every SKU). Requires a single shop. */
const props = defineProps<{ shopId: string; samples: CreatorHubSample[]; costs: CreatorHubProductCost[]; saving: string }>()
const emit = defineEmits<{
  save: [payload: { shopId: string; productId: string; productTitle?: string; unitCost: number; shippingCost: number }]
  remove: [id: string]
}>()
const { t } = useI18n()

const q = ref('')
const onlyMissing = ref(false)
const page = ref(1)
const pageSize = ref(20)
const drafts = reactive<Record<string, { unitCost: string; shippingCost: string }>>({})

type Row = { productId: string; title: string; image?: string; samples: number; shipped: number; cost?: CreatorHubProductCost }

const rows = computed<Row[]>(() => {
  const costMap = new Map(props.costs.map((item) => [item.id, item]))
  const byProduct = new Map<string, Row>()
  for (const sample of props.samples) {
    let row = byProduct.get(sample.productId)
    if (!row) {
      row = { productId: sample.productId, title: sample.productTitle, image: sample.skuImage, samples: 0, shipped: 0, cost: costMap.get(costKey(props.shopId, sample.productId)) }
      byProduct.set(sample.productId, row)
    }
    row.samples += 1
    if (sample.hasSampleOrder || sample.stage === 'completed') row.shipped += 1
  }
  // Costs saved for products that are no longer in the sample list stay editable.
  for (const cost of props.costs) {
    if (!cost.skuId && !byProduct.has(cost.productId)) byProduct.set(cost.productId, { productId: cost.productId, title: cost.productTitle || cost.productId, samples: 0, shipped: 0, cost })
  }
  return [...byProduct.values()].sort((a, b) => b.shipped - a.shipped || b.samples - a.samples)
})

const filtered = computed(() => {
  const text = q.value.trim().toLowerCase()
  return rows.value.filter((row) => (!onlyMissing.value || !row.cost) && (!text || `${row.title} ${row.productId}`.toLowerCase().includes(text)))
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const missingCount = computed(() => rows.value.filter((row) => !row.cost && row.shipped > 0).length)
watch([q, onlyMissing], () => { page.value = 1 })

// Drafts are (re)seeded from saved costs outside of render, so typing never mutates during render.
watch(rows, (list) => {
  for (const row of list) drafts[row.productId] = { unitCost: row.cost ? String(row.cost.unitCost) : '', shippingCost: row.cost ? String(row.cost.shippingCost) : '' }
}, { immediate: true })
function draftOf(row: Row) {
  return drafts[row.productId] || { unitCost: '', shippingCost: '' }
}

function isValid(value: string, required: boolean) {
  if (value.trim() === '') return !required
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0
}
function canSave(row: Row) {
  const draft = draftOf(row)
  if (!isValid(draft.unitCost, true) || !isValid(draft.shippingCost, false)) return false
  return !row.cost || Number(draft.unitCost) !== row.cost.unitCost || Number(draft.shippingCost || 0) !== row.cost.shippingCost
}
function save(row: Row) {
  if (!canSave(row)) return
  const draft = draftOf(row)
  emit('save', { shopId: props.shopId, productId: row.productId, productTitle: row.title, unitCost: Number(draft.unitCost), shippingCost: Number(draft.shippingCost || 0) })
}
</script>

<template>
  <div class="vg-stack" data-testid="creator-hub-costs">
    <div class="vg-toolbar">
      <div class="vg-search ch-search">
        <Search :size="15" />
        <input v-model="q" class="vg-input" :placeholder="t('creatorHub.costs.search')" />
      </div>
      <label class="vg-switch" :class="{ 'is-on': onlyMissing }" @click.prevent="onlyMissing = !onlyMissing">
        <span class="vg-switch__track" />{{ t('creatorHub.costs.onlyMissing') }}
      </label>
      <span class="vg-toolbar__spacer" />
      <span v-if="missingCount" class="vg-pill vg-pill--amber">{{ t('creatorHub.costs.missing', { count: missingCount }) }}</span>
    </div>
    <div class="vg-notice"><Wallet :size="16" /><span>{{ t('creatorHub.costs.hint') }}</span></div>

    <section class="vg-card vg-card--flush">
      <div v-if="!rows.length" class="vg-empty">
        <span class="vg-empty__icon"><Wallet :size="26" /></span>
        <h3>{{ t('creatorHub.costs.emptyTitle') }}</h3>
        <p>{{ t('creatorHub.samples.emptyDesc') }}</p>
      </div>
      <template v-else>
        <div class="ch-table-scroll">
          <table class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th>{{ t('creatorHub.samples.colProduct') }}</th>
                <th class="num">{{ t('creatorHub.costs.colSamples') }}</th>
                <th class="num">{{ t('creatorHub.costs.colShipped') }}</th>
                <th>{{ t('creatorHub.costs.colUnitCost') }}</th>
                <th>{{ t('creatorHub.costs.colShipping') }}</th>
                <th class="num">{{ t('creatorHub.costs.colTotal') }}</th>
                <th>{{ t('creatorHub.samples.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in paged" :key="row.productId">
                <td>
                  <div class="ch-person">
                    <img v-if="row.image" class="vg-thumb vg-thumb--sm" :src="row.image" alt="" referrerpolicy="no-referrer" />
                    <div class="vg-list__main ch-product">
                      <span class="vg-list__title" :title="row.title">{{ row.title }}</span>
                      <span class="vg-list__sub vg-num">ID {{ row.productId }}</span>
                    </div>
                  </div>
                </td>
                <td class="num">{{ row.samples }}</td>
                <td class="num">{{ row.shipped }}</td>
                <td><input v-model="draftOf(row).unitCost" class="vg-input vg-input--sm ch-cost-input" :class="{ 'vg-input--error': !isValid(draftOf(row).unitCost, false) }" inputmode="decimal" :placeholder="t('creatorHub.costs.unitPlaceholder')" @keyup.enter="save(row)" /></td>
                <td><input v-model="draftOf(row).shippingCost" class="vg-input vg-input--sm ch-cost-input" :class="{ 'vg-input--error': !isValid(draftOf(row).shippingCost, false) }" inputmode="decimal" placeholder="0" @keyup.enter="save(row)" /></td>
                <td class="num">{{ row.cost ? formatMoney(row.cost.unitCost + row.cost.shippingCost) : '-' }}</td>
                <td>
                  <div class="vg-row ch-nowrap">
                    <button class="vg-btn vg-btn--xs vg-btn--soft" :disabled="!canSave(row) || saving === row.productId" @click="save(row)"><Save :size="12" />{{ t('creatorHub.actions.save') }}</button>
                    <button v-if="row.cost" class="vg-icon-btn vg-icon-btn--danger" :title="t('creatorHub.costs.clear')" @click="emit('remove', row.cost.id)"><Trash2 :size="14" /></button>
                  </div>
                </td>
              </tr>
              <tr v-if="!paged.length"><td colspan="7" class="vg-table__empty">{{ t('creatorHub.samples.noMatch') }}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="ch-pager-wrap"><ChPager v-model:page="page" v-model:page-size="pageSize" :total="filtered.length" /></div>
      </template>
    </section>
  </div>
</template>
