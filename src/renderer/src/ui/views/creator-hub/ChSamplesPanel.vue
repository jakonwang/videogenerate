<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ExternalLink, Package, Pencil, Search } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubProductCost, CreatorHubSample, CreatorHubSettings, CreatorHubShop } from '@/../../shared/creatorHub'
import { classifySample, sampleCost, sampleDeadline } from '@/../../shared/creatorHubFulfillment'
import ChPager from './ChPager.vue'
import { SAMPLE_STAGES, formatCount, formatDate, formatMoney, formatPercent, fulfillmentTone, stageTone } from './creatorHubFormat'

const props = defineProps<{ samples: CreatorHubSample[]; costs: CreatorHubProductCost[]; settings: CreatorHubSettings; shops: CreatorHubShop[]; showShop: boolean; preset?: { stage?: string; fulfillment?: string; token: number } | null }>()
const emit = defineEmits<{ saveCost: [payload: { id: string; costOverride: number | null }]; open: [shopId: string] }>()
const { t } = useI18n()

const filters = reactive({ q: '', stage: 'all', fulfillment: 'all' })
const page = ref(1)
const pageSize = ref(20)
const editing = ref('')
const editValue = ref('')
const now = Date.now()

const costMap = computed(() => new Map(props.costs.map((item) => [item.id, item])))
const shopNames = computed(() => new Map(props.shops.map((item) => [item.id, item.name])))

const rows = computed(() => props.samples.map((sample) => ({
  sample,
  state: classifySample(sample, props.settings, now),
  deadline: sampleDeadline(sample, props.settings),
  cost: sampleCost(sample, costMap.value),
})))

const stageCounts = computed(() => {
  const counts: Record<string, number> = { all: rows.value.length }
  for (const row of rows.value) counts[row.sample.stage] = (counts[row.sample.stage] || 0) + 1
  return counts
})

const filtered = computed(() => {
  const q = filters.q.trim().toLowerCase()
  return rows.value.filter(({ sample, state }) => {
    if (filters.stage !== 'all' && sample.stage !== filters.stage) return false
    if (filters.fulfillment !== 'all' && state !== filters.fulfillment) return false
    if (q && !`${sample.creatorHandle} ${sample.creatorNickname} ${sample.productTitle} ${sample.productId} ${sample.applyId}`.toLowerCase().includes(q)) return false
    return true
  })
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch(filters, () => { page.value = 1 })
watch(() => props.preset?.token, () => {
  if (!props.preset) return
  filters.stage = props.preset.stage || 'all'
  filters.fulfillment = props.preset.fulfillment || 'all'
  filters.q = ''
}, { immediate: true })

function daysLeft(deadline: number) {
  return Math.ceil((deadline - now) / 86_400_000)
}

function startEdit(sample: CreatorHubSample, current?: number) {
  editing.value = sample.id
  editValue.value = sample.costOverride != null ? String(sample.costOverride) : current != null ? String(current) : ''
}
function commitEdit(sample: CreatorHubSample) {
  if (editing.value !== sample.id) return
  editing.value = ''
  const text = editValue.value.trim()
  const value = text === '' ? null : Number(text)
  if (value != null && (!Number.isFinite(value) || value < 0)) return
  if (value === (sample.costOverride ?? null)) return
  emit('saveCost', { id: sample.id, costOverride: value })
}
</script>

<template>
  <div class="vg-stack" data-testid="creator-hub-samples">
    <div class="vg-toolbar">
      <div class="vg-search ch-search">
        <Search :size="15" />
        <input v-model="filters.q" class="vg-input" :placeholder="t('creatorHub.samples.search')" />
      </div>
      <select v-model="filters.stage" class="vg-select" :aria-label="t('creatorHub.samples.stageFilter')">
        <option value="all">{{ t('creatorHub.samples.allStages') }} ({{ stageCounts.all || 0 }})</option>
        <option v-for="stage in SAMPLE_STAGES" :key="stage" :value="stage">{{ t(`creatorHub.stage.${stage}`) }} ({{ stageCounts[stage] || 0 }})</option>
      </select>
      <select v-model="filters.fulfillment" class="vg-select" :aria-label="t('creatorHub.samples.fulfillmentFilter')">
        <option value="all">{{ t('creatorHub.samples.allFulfillment') }}</option>
        <option value="overdue">{{ t('creatorHub.fulfillmentState.overdue') }}</option>
        <option value="pending">{{ t('creatorHub.fulfillmentState.pending') }}</option>
        <option value="fulfilled">{{ t('creatorHub.fulfillmentState.fulfilled') }}</option>
      </select>
      <span class="vg-toolbar__spacer" />
      <span class="vg-muted">{{ t('creatorHub.samples.readonlyHint') }}</span>
    </div>

    <section class="vg-card vg-card--flush">
      <div v-if="!samples.length" class="vg-empty">
        <span class="vg-empty__icon"><Package :size="26" /></span>
        <h3>{{ t('creatorHub.samples.emptyTitle') }}</h3>
        <p>{{ t('creatorHub.samples.emptyDesc') }}</p>
      </div>
      <template v-else>
        <div class="ch-table-scroll">
          <table class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th>{{ t('creatorHub.samples.colCreator') }}</th>
                <th>{{ t('creatorHub.samples.colProduct') }}</th>
                <th v-if="showShop">{{ t('creatorHub.samples.colShop') }}</th>
                <th>{{ t('creatorHub.samples.colStage') }}</th>
                <th>{{ t('creatorHub.samples.colApplied') }}</th>
                <th>{{ t('creatorHub.samples.colDeadline') }}</th>
                <th>{{ t('creatorHub.samples.colFulfillment') }}</th>
                <th class="num">{{ t('creatorHub.samples.colPlatformRate') }}</th>
                <th class="num">{{ t('creatorHub.samples.colCost') }}</th>
                <th>{{ t('creatorHub.samples.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ sample, state, deadline, cost } in paged" :key="sample.id">
                <td>
                  <div class="ch-person">
                    <img v-if="sample.creatorAvatar" class="vg-avatar" :src="sample.creatorAvatar" alt="" referrerpolicy="no-referrer" />
                    <span v-else class="vg-avatar">{{ (sample.creatorNickname || sample.creatorHandle || '?').slice(0, 1) }}</span>
                    <div class="vg-list__main">
                      <span class="vg-list__title" :title="sample.creatorNickname">{{ sample.creatorNickname || sample.creatorHandle }}</span>
                      <span class="vg-list__sub">@{{ sample.creatorHandle }} · {{ t('creatorHub.samples.followers', { count: formatCount(sample.followers) }) }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="ch-person">
                    <img v-if="sample.skuImage" class="vg-thumb vg-thumb--sm" :src="sample.skuImage" alt="" referrerpolicy="no-referrer" />
                    <div class="vg-list__main ch-product">
                      <span class="vg-list__title" :title="sample.productTitle">{{ sample.productTitle || sample.productId }}</span>
                      <span class="vg-list__sub">{{ sample.skuDesc || sample.skuId }}</span>
                    </div>
                  </div>
                </td>
                <td v-if="showShop" class="vg-muted">{{ shopNames.get(sample.shopId) || '-' }}</td>
                <td><span class="vg-pill" :class="stageTone(sample.stage) && `vg-pill--${stageTone(sample.stage)}`">{{ t(`creatorHub.stage.${sample.stage}`) }}</span></td>
                <td class="vg-num ch-nowrap">{{ formatDate(sample.createdAt) }}</td>
                <td class="vg-num ch-nowrap">
                  <template v-if="state === 'pending'">{{ t('creatorHub.samples.daysLeft', { days: daysLeft(deadline) }) }}</template>
                  <template v-else-if="state === 'overdue'"><span class="ch-error-line">{{ t('creatorHub.samples.daysOver', { days: -daysLeft(deadline) }) }}</span></template>
                  <template v-else>{{ formatDate(deadline) }}</template>
                </td>
                <td><span class="vg-pill vg-pill--dot" :class="fulfillmentTone(state) && `vg-pill--${fulfillmentTone(state)}`">{{ t(`creatorHub.fulfillmentState.${state}`) }}</span></td>
                <td class="num">{{ formatPercent(sample.platformFulfillmentRate) }}</td>
                <td class="num ch-nowrap">
                  <input
                    v-if="editing === sample.id"
                    v-model="editValue"
                    class="vg-input vg-input--sm ch-cost-input"
                    inputmode="decimal"
                    :placeholder="t('creatorHub.samples.costPlaceholder')"
                    @keyup.enter="commitEdit(sample)"
                    @keyup.esc="editing = ''"
                    @blur="commitEdit(sample)"
                  />
                  <button v-else class="ch-cost-btn" :title="t('creatorHub.samples.editCost')" @click="startEdit(sample, cost)">
                    <span :class="{ 'vg-muted': cost == null }">{{ cost == null ? t('creatorHub.samples.noCost') : formatMoney(cost) }}</span>
                    <small v-if="sample.costOverride != null" class="vg-chip">{{ t('creatorHub.samples.override') }}</small>
                    <Pencil :size="12" />
                  </button>
                </td>
                <td><button class="vg-icon-btn" :title="t('creatorHub.shops.openBackend')" @click="emit('open', sample.shopId)"><ExternalLink :size="15" /></button></td>
              </tr>
              <tr v-if="!paged.length"><td :colspan="showShop ? 10 : 9" class="vg-table__empty">{{ t('creatorHub.samples.noMatch') }}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="ch-pager-wrap"><ChPager v-model:page="page" v-model:page-size="pageSize" :total="filtered.length" /></div>
      </template>
    </section>
  </div>
</template>
