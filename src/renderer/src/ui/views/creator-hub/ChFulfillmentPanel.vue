<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { AlertTriangle, ArrowDownUp, CheckCircle2, Clock3, Info, Package, Percent, Save, Search, Users, Wallet } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubCreatorStat, CreatorHubFulfillmentReport, CreatorHubSettings, CreatorHubShop } from '../../../../../shared/creatorHub'
import ChPager from './ChPager.vue'
import { formatCount, formatDate, formatMoney, formatPercent, rateTone } from './creatorHubFormat'

const props = defineProps<{ report: CreatorHubFulfillmentReport | null; shops: CreatorHubShop[]; showShop: boolean; savingSettings: boolean }>()
const emit = defineEmits<{ saveSettings: [settings: Partial<CreatorHubSettings>] }>()
const { t } = useI18n()

type SortKey = 'fulfillmentRate' | 'overdue' | 'shipped' | 'sampleCost' | 'lastAppliedAt'
const sort = reactive<{ key: SortKey; dir: 1 | -1 }>({ key: 'overdue', dir: -1 })
const filters = reactive({ q: '', onlyDue: true })
const page = ref(1)
const pageSize = ref(20)
const draft = reactive({ fulfillmentWindowDays: 30, logisticsBufferDays: 7 })

watch(() => props.report?.settings, (settings) => { if (settings) { draft.fulfillmentWindowDays = settings.fulfillmentWindowDays; draft.logisticsBufferDays = settings.logisticsBufferDays } }, { immediate: true })

const shopNames = computed(() => new Map(props.shops.map((item) => [item.id, item.name])))
const summary = computed(() => props.report?.summary)
const settingsDirty = computed(() => Boolean(props.report) && (draft.fulfillmentWindowDays !== props.report!.settings.fulfillmentWindowDays || draft.logisticsBufferDays !== props.report!.settings.logisticsBufferDays))

const filtered = computed(() => {
  const q = filters.q.trim().toLowerCase()
  const list = (props.report?.creators || []).filter((item) => {
    if (filters.onlyDue && item.fulfilled + item.overdue === 0) return false
    if (q && !`${item.creatorHandle} ${item.creatorNickname}`.toLowerCase().includes(q)) return false
    return true
  })
  const value = (item: CreatorHubCreatorStat) => sort.key === 'fulfillmentRate' ? (item.fulfillmentRate ?? -1) : item[sort.key]
  return list.sort((a, b) => (value(a) - value(b)) * sort.dir || b.shipped - a.shipped)
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch(filters, () => { page.value = 1 })

function toggleSort(key: SortKey) {
  if (sort.key === key) sort.dir = sort.dir === 1 ? -1 : 1
  else { sort.key = key; sort.dir = key === 'fulfillmentRate' ? 1 : -1 }
}
function saveSettings() {
  emit('saveSettings', { fulfillmentWindowDays: Number(draft.fulfillmentWindowDays), logisticsBufferDays: Number(draft.logisticsBufferDays) })
}
</script>

<template>
  <div class="vg-stack" data-testid="creator-hub-fulfillment">
    <div class="vg-stats">
      <div class="vg-stat"><span class="vg-stat__icon"><Percent :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.fulfillment.overallRate') }}</span><span class="vg-stat__value">{{ formatPercent(summary?.fulfillmentRate) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--blue"><Users :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.fulfillment.creators') }}</span><span class="vg-stat__value">{{ formatCount(summary?.creators || 0) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--blue"><Package :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.fulfillment.shipped') }}</span><span class="vg-stat__value">{{ formatCount(summary?.shipped || 0) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon"><CheckCircle2 :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.fulfillment.fulfilled') }}</span><span class="vg-stat__value">{{ formatCount(summary?.fulfilled || 0) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--red"><AlertTriangle :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.fulfillment.overdue') }}</span><span class="vg-stat__value">{{ formatCount(summary?.overdue || 0) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--amber"><Clock3 :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.fulfillment.pending') }}</span><span class="vg-stat__value">{{ formatCount(summary?.pending || 0) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--violet"><Wallet :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.fulfillment.sampleCost') }}</span><span class="vg-stat__value">{{ formatMoney(summary?.sampleCost || 0) }}</span></div></div>
    </div>

    <section class="vg-card">
      <div class="ch-rule">
        <div class="vg-notice vg-notice--accent ch-rule__text"><Info :size="16" /><span>{{ t('creatorHub.fulfillment.rule', { window: report?.settings.fulfillmentWindowDays ?? 30, buffer: report?.settings.logisticsBufferDays ?? 7 }) }}</span></div>
        <div class="vg-row">
          <label class="vg-field ch-num-field"><span class="vg-field__label">{{ t('creatorHub.fulfillment.windowDays') }}</span><input v-model.number="draft.fulfillmentWindowDays" class="vg-input vg-input--sm" type="number" min="1" max="365" /></label>
          <label class="vg-field ch-num-field"><span class="vg-field__label">{{ t('creatorHub.fulfillment.bufferDays') }}</span><input v-model.number="draft.logisticsBufferDays" class="vg-input vg-input--sm" type="number" min="0" max="60" /></label>
          <button class="vg-btn vg-btn--sm ch-rule__save" :disabled="!settingsDirty || savingSettings" @click="saveSettings"><Save :size="13" />{{ t('creatorHub.actions.save') }}</button>
        </div>
      </div>
    </section>

    <div class="vg-toolbar">
      <div class="vg-search ch-search">
        <Search :size="15" />
        <input v-model="filters.q" class="vg-input" :placeholder="t('creatorHub.fulfillment.search')" />
      </div>
      <label class="vg-switch" :class="{ 'is-on': filters.onlyDue }" @click.prevent="filters.onlyDue = !filters.onlyDue">
        <span class="vg-switch__track" />{{ t('creatorHub.fulfillment.onlyDue') }}
      </label>
    </div>

    <section class="vg-card vg-card--flush">
      <div v-if="!report?.creators.length" class="vg-empty">
        <span class="vg-empty__icon"><Users :size="26" /></span>
        <h3>{{ t('creatorHub.fulfillment.emptyTitle') }}</h3>
        <p>{{ t('creatorHub.samples.emptyDesc') }}</p>
      </div>
      <template v-else>
        <div class="ch-table-scroll">
          <table class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th>{{ t('creatorHub.samples.colCreator') }}</th>
                <th v-if="showShop">{{ t('creatorHub.samples.colShop') }}</th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'fulfillmentRate' }" @click="toggleSort('fulfillmentRate')">{{ t('creatorHub.fulfillment.colRate') }}<ArrowDownUp :size="12" /></span></th>
                <th class="num">{{ t('creatorHub.samples.colPlatformRate') }}</th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'shipped' }" @click="toggleSort('shipped')">{{ t('creatorHub.fulfillment.colShipped') }}<ArrowDownUp :size="12" /></span></th>
                <th class="num">{{ t('creatorHub.fulfillment.colFulfilled') }}</th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'overdue' }" @click="toggleSort('overdue')">{{ t('creatorHub.fulfillment.colOverdue') }}<ArrowDownUp :size="12" /></span></th>
                <th class="num">{{ t('creatorHub.fulfillment.colPending') }}</th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'sampleCost' }" @click="toggleSort('sampleCost')">{{ t('creatorHub.fulfillment.colCost') }}<ArrowDownUp :size="12" /></span></th>
                <th><span class="ch-sort" :class="{ 'is-active': sort.key === 'lastAppliedAt' }" @click="toggleSort('lastAppliedAt')">{{ t('creatorHub.fulfillment.colLastApplied') }}<ArrowDownUp :size="12" /></span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in paged" :key="`${item.shopId}:${item.creatorId || item.creatorHandle}`">
                <td>
                  <div class="ch-person">
                    <img v-if="item.creatorAvatar" class="vg-avatar" :src="item.creatorAvatar" alt="" referrerpolicy="no-referrer" />
                    <span v-else class="vg-avatar">{{ (item.creatorNickname || item.creatorHandle || '?').slice(0, 1) }}</span>
                    <div class="vg-list__main">
                      <span class="vg-list__title">{{ item.creatorNickname || item.creatorHandle }}</span>
                      <span class="vg-list__sub">@{{ item.creatorHandle }} · {{ t('creatorHub.samples.followers', { count: formatCount(item.followers) }) }}</span>
                    </div>
                  </div>
                </td>
                <td v-if="showShop" class="vg-muted">{{ shopNames.get(item.shopId) || '-' }}</td>
                <td class="num">
                  <span v-if="item.fulfillmentRate != null" class="vg-pill" :class="`vg-pill--${rateTone(item.fulfillmentRate)}`">{{ formatPercent(item.fulfillmentRate) }}</span>
                  <span v-else class="vg-muted">{{ t('creatorHub.fulfillment.notDue') }}</span>
                </td>
                <td class="num vg-muted">{{ formatPercent(item.platformFulfillmentRate) }}</td>
                <td class="num">{{ item.shipped }}</td>
                <td class="num">{{ item.fulfilled }}</td>
                <td class="num"><span :class="{ 'ch-error-line': item.overdue > 0 }">{{ item.overdue }}</span></td>
                <td class="num">{{ item.pending }}</td>
                <td class="num ch-nowrap">
                  {{ formatMoney(item.sampleCost) }}
                  <small v-if="item.missingCost" class="vg-chip" :title="t('creatorHub.fulfillment.missingCostHint')">{{ t('creatorHub.fulfillment.missingCost', { count: item.missingCost }) }}</small>
                </td>
                <td class="vg-num ch-nowrap">{{ formatDate(item.lastAppliedAt) }}</td>
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
