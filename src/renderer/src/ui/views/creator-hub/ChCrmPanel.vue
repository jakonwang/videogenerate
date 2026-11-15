<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ArrowDownUp, Ban, Pencil, Search, Users } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubCrmRow, CreatorHubShop, CreatorHubTier } from '@/../../shared/creatorHub'
import ChPager from './ChPager.vue'
import { formatCount, formatMoney, formatPercent, rateTone } from './creatorHubFormat'

type SortKey = 'score' | 'gmv' | 'commission' | 'samplesShipped' | 'fulfillmentRate' | 'sampleRoi'

const props = defineProps<{ rows: CreatorHubCrmRow[]; shops: CreatorHubShop[]; showShop: boolean }>()
const emit = defineEmits<{ edit: [row: CreatorHubCrmRow] }>()
const { t } = useI18n()

const filters = reactive({ q: '', tier: 'all', tag: 'all', blocked: 'active' as 'active' | 'blocked' | 'all', withSamples: false })
const sort = reactive<{ key: SortKey; dir: 1 | -1 }>({ key: 'score', dir: -1 })
const page = ref(1)
const pageSize = ref(20)
const shopNames = computed(() => new Map(props.shops.map((item) => [item.id, item.name])))
const allTags = computed(() => [...new Set(props.rows.flatMap((row) => row.tags))].sort())
const tierCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const row of props.rows) if (!row.blocked) counts[row.tier] = (counts[row.tier] || 0) + 1
  return counts
})

const filtered = computed(() => {
  const q = filters.q.trim().toLowerCase()
  const list = props.rows.filter((row) => {
    if (filters.blocked === 'active' && row.blocked) return false
    if (filters.blocked === 'blocked' && !row.blocked) return false
    if (filters.tier !== 'all' && row.tier !== filters.tier) return false
    if (filters.tag !== 'all' && !row.tags.includes(filters.tag)) return false
    if (filters.withSamples && !row.samplesShipped) return false
    if (q && !`${row.creatorHandle} ${row.creatorNickname} ${row.note || ''} ${row.tags.join(' ')}`.toLowerCase().includes(q)) return false
    return true
  })
  const value = (row: CreatorHubCrmRow) => {
    if (sort.key === 'fulfillmentRate') return row.fulfillmentRate ?? -1
    if (sort.key === 'sampleRoi') return row.sampleRoi ?? -1
    return row[sort.key]
  }
  return list.sort((a, b) => (value(a) - value(b)) * sort.dir || b.gmv - a.gmv)
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([filters, sort], () => { page.value = 1 })

function toggleSort(key: SortKey) {
  if (sort.key === key) sort.dir = sort.dir === 1 ? -1 : 1
  else { sort.key = key; sort.dir = -1 }
}
function tierTone(tier: CreatorHubTier) {
  return tier === 'A' ? 'vg-pill--green' : tier === 'B' ? 'vg-pill--blue' : tier === 'C' ? 'vg-pill--amber' : 'vg-pill--red'
}

defineExpose({ allTags })
</script>

<template>
  <div class="vg-stack" data-testid="creator-hub-crm">
    <div class="vg-toolbar">
      <div class="vg-search ch-search">
        <Search :size="15" />
        <input v-model="filters.q" class="vg-input" :placeholder="t('creatorHub.crm.search')" />
      </div>
      <div class="vg-seg vg-seg--sm" role="group" :aria-label="t('creatorHub.crm.tier')">
        <button class="vg-seg__btn" :class="{ 'is-active': filters.tier === 'all' }" @click="filters.tier = 'all'">{{ t('creatorHub.crm.allTiers') }}</button>
        <button v-for="tier in ['A', 'B', 'C', 'D']" :key="tier" class="vg-seg__btn" :class="{ 'is-active': filters.tier === tier }" @click="filters.tier = tier">{{ tier }}<span class="vg-count">{{ tierCounts[tier] || 0 }}</span></button>
      </div>
      <select v-if="allTags.length" v-model="filters.tag" class="vg-select" :aria-label="t('creatorHub.crm.tags')">
        <option value="all">{{ t('creatorHub.crm.allTags') }}</option>
        <option v-for="tag in allTags" :key="tag" :value="tag">{{ tag }}</option>
      </select>
      <select v-model="filters.blocked" class="vg-select" :aria-label="t('creatorHub.crm.blocked')">
        <option value="active">{{ t('creatorHub.crm.activeOnly') }}</option>
        <option value="blocked">{{ t('creatorHub.crm.blockedOnly') }}</option>
        <option value="all">{{ t('creatorHub.crm.everyone') }}</option>
      </select>
      <label class="vg-switch" :class="{ 'is-on': filters.withSamples }" @click.prevent="filters.withSamples = !filters.withSamples"><span class="vg-switch__track" />{{ t('creatorHub.crm.withSamples') }}</label>
    </div>
    <div class="vg-notice"><Users :size="16" /><span>{{ t('creatorHub.crm.scoreRule') }}</span></div>

    <section class="vg-card vg-card--flush">
      <div v-if="!rows.length" class="vg-empty">
        <span class="vg-empty__icon"><Users :size="26" /></span>
        <h3>{{ t('creatorHub.crm.emptyTitle') }}</h3>
        <p>{{ t('creatorHub.videos.emptyDesc') }}</p>
      </div>
      <template v-else>
        <div class="ch-table-scroll">
          <table class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th>{{ t('creatorHub.samples.colCreator') }}</th>
                <th v-if="showShop">{{ t('creatorHub.samples.colShop') }}</th>
                <th><span class="ch-sort" :class="{ 'is-active': sort.key === 'score' }" @click="toggleSort('score')">{{ t('creatorHub.crm.colScore') }}<ArrowDownUp :size="12" /></span></th>
                <th>{{ t('creatorHub.crm.tags') }}</th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'gmv' }" @click="toggleSort('gmv')">GMV<ArrowDownUp :size="12" /></span></th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'commission' }" @click="toggleSort('commission')">{{ t('creatorHub.overview.commission') }}<ArrowDownUp :size="12" /></span></th>
                <th class="num">{{ t('creatorHub.crm.colContent') }}</th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'samplesShipped' }" @click="toggleSort('samplesShipped')">{{ t('creatorHub.fulfillment.colShipped') }}<ArrowDownUp :size="12" /></span></th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'fulfillmentRate' }" @click="toggleSort('fulfillmentRate')">{{ t('creatorHub.fulfillment.colRate') }}<ArrowDownUp :size="12" /></span></th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'sampleRoi' }" @click="toggleSort('sampleRoi')">{{ t('creatorHub.crm.colRoi') }}<ArrowDownUp :size="12" /></span></th>
                <th>{{ t('creatorHub.crm.note') }}</th>
                <th>{{ t('creatorHub.samples.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in paged" :key="row.key" :class="{ 'ch-row-muted': row.blocked }">
                <td>
                  <div class="ch-person">
                    <img v-if="row.creatorAvatar" class="vg-avatar" :src="row.creatorAvatar" alt="" referrerpolicy="no-referrer" />
                    <span v-else class="vg-avatar">{{ (row.creatorNickname || row.creatorHandle || '?').slice(0, 1) }}</span>
                    <div class="vg-list__main">
                      <span class="vg-list__title">{{ row.creatorNickname || row.creatorHandle }}<Ban v-if="row.blocked" :size="12" class="ch-ban" /></span>
                      <span class="vg-list__sub">@{{ row.creatorHandle }} · {{ t('creatorHub.samples.followers', { count: formatCount(row.followers) }) }}</span>
                    </div>
                  </div>
                </td>
                <td v-if="showShop" class="vg-muted">{{ shopNames.get(row.shopId) || '-' }}</td>
                <td class="ch-nowrap"><span class="vg-pill" :class="tierTone(row.tier)">{{ row.tier }}</span> <span class="vg-num vg-muted">{{ row.score }}</span></td>
                <td><div class="vg-row ch-tags"><span v-for="tag in row.tags" :key="tag" class="vg-chip">{{ tag }}</span></div></td>
                <td class="num">{{ formatMoney(row.gmv) }}</td>
                <td class="num">{{ formatMoney(row.commission) }}</td>
                <td class="num ch-nowrap">{{ row.videos }} / {{ row.lives }}</td>
                <td class="num">{{ row.samplesShipped }}</td>
                <td class="num"><span v-if="row.fulfillmentRate != null" class="vg-pill" :class="`vg-pill--${rateTone(row.fulfillmentRate)}`">{{ formatPercent(row.fulfillmentRate) }}</span><span v-else class="vg-muted">-</span></td>
                <td class="num">{{ row.sampleRoi != null ? `${row.sampleRoi.toFixed(1)}x` : '-' }}</td>
                <td><span class="vg-ellipsis ch-note" :title="row.note">{{ row.note || '' }}</span></td>
                <td><button class="vg-icon-btn" :title="t('creatorHub.crm.edit')" data-testid="creator-hub-crm-edit" @click="emit('edit', row)"><Pencil :size="14" /></button></td>
              </tr>
              <tr v-if="!paged.length"><td :colspan="showShop ? 12 : 11" class="vg-table__empty">{{ t('creatorHub.samples.noMatch') }}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="ch-pager-wrap"><ChPager v-model:page="page" v-model:page-size="pageSize" :total="filtered.length" /></div>
      </template>
    </section>
  </div>
</template>
