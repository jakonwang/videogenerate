<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ArrowDownUp, Ban, Contact, Copy, Eye, Info, MessageCircle, RefreshCw, Search, Sparkles, Star, Trash2, UserSearch } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubDiscoverQuery, CreatorHubPoolRow, CreatorHubShop, CreatorHubTier } from '../../../../../shared/creatorHub'
import { CREATOR_HUB_GMV_GROUPS, CREATOR_HUB_MARKET_CATEGORIES, CREATOR_HUB_UNITS_GROUPS } from '../../../../../shared/creatorHub'
import { zaloNumber } from '../../../../../shared/creatorHubContacts'
import ChPager from './ChPager.vue'
import { formatCount, formatDate, formatMoney, formatPercent, rateTone } from './creatorHubFormat'

type SortKey = 'score' | 'gmv' | 'followers' | 'avgViews' | 'engagementRate' | 'unitsSold' | 'lastSeenAt'
type SearchForm = Omit<CreatorHubDiscoverQuery, 'shopId'>

const props = defineProps<{ rows: CreatorHubPoolRow[]; shops: CreatorHubShop[]; showShop: boolean; selectedShop: CreatorHubShop | null; searching: boolean; fetchingContacts: boolean }>()
const emit = defineEmits<{
  search: [query: SearchForm]
  fetchContacts: [rows: CreatorHubPoolRow[]]
  zalo: [row: CreatorHubPoolRow]
  star: [ids: string[], starred: boolean]
  remove: [ids: string[]]
  detail: [row: CreatorHubPoolRow]
  copied: [count: number]
}>()
const { t } = useI18n()
const FORM_KEY = 'creatorHub.discoverForm'

function readForm(): SearchForm {
  try {
    const raw = JSON.parse(localStorage.getItem(FORM_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch { return {} }
}
const stored = readForm()
const form = reactive({
  keyword: String(stored.keyword || ''),
  categoryIds: Array.isArray(stored.categoryIds) ? stored.categoryIds.map(String) : [] as string[],
  followersMin: stored.followersMin ? String(stored.followersMin) : '',
  followersMax: stored.followersMax ? String(stored.followersMax) : '',
  gmvGroups: Array.isArray(stored.gmvGroups) ? stored.gmvGroups.map(Number) : [] as number[],
  unitsGroups: Array.isArray(stored.unitsGroups) ? stored.unitsGroups.map(Number) : [] as number[],
  starOnly: Boolean(stored.starOnly),
  pages: Number(stored.pages) || 3,
})
const categoryPick = ref('')

const filters = reactive({ q: '', tier: 'all', category: 'all', hideInvited: true, hideBlocked: true, starredOnly: false, collaboratedOnly: false, contact: 'all' as 'all' | 'zalo' | 'backend' | 'unchecked' | 'contacted' })
const sort = reactive<{ key: SortKey; dir: 1 | -1 }>({ key: 'score', dir: -1 })
const page = ref(1)
const pageSize = ref(20)
const selected = ref<Set<string>>(new Set())

const shopNames = computed(() => new Map(props.shops.map((item) => [item.id, item.name])))
const categoryName = (id: string) => CREATOR_HUB_MARKET_CATEGORIES.find((item) => item.id === id)?.name || id
const poolCategories = computed(() => [...new Set(props.rows.flatMap((row) => row.categories))].sort())
const tierCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const row of props.rows) counts[row.tier] = (counts[row.tier] || 0) + 1
  return counts
})
const stats = computed(() => ({
  total: props.rows.length,
  starred: props.rows.filter((row) => row.starred).length,
  fresh: props.rows.filter((row) => !row.invitedIn90d && !row.collaborated && !row.blocked).length,
  tierA: props.rows.filter((row) => row.tier === 'A').length,
}))

const filtered = computed(() => {
  const q = filters.q.trim().toLowerCase()
  const list = props.rows.filter((row) => {
    if (filters.hideInvited && row.invitedIn90d) return false
    if (filters.hideBlocked && (row.blocked || row.blockedByShop)) return false
    if (filters.starredOnly && !row.starred) return false
    if (filters.collaboratedOnly && !row.collaborated && !row.ourSamples) return false
    if (filters.tier !== 'all' && row.tier !== filters.tier) return false
    if (filters.category !== 'all' && !row.categories.includes(filters.category)) return false
    if (filters.contact === 'zalo' && !zaloNumber(row.contact)) return false
    if (filters.contact === 'backend' && !(row.contact?.contactInfoAvailable && !zaloNumber(row.contact))) return false
    if (filters.contact === 'unchecked' && row.contact?.bioFetchedAt) return false
    if (filters.contact === 'contacted' && (!row.contact || row.contact.status === 'none')) return false
    if (q && !`${row.handle} ${row.nickname} ${row.tags.join(' ')} ${row.note || ''} ${row.categories.join(' ')}`.toLowerCase().includes(q)) return false
    return true
  })
  const value = (row: CreatorHubPoolRow) => {
    if (sort.key === 'gmv') return row.gmv ?? -1
    if (sort.key === 'engagementRate') return row.engagementRate ?? -1
    return row[sort.key]
  }
  return list.sort((a, b) => (value(a) - value(b)) * sort.dir || b.score - a.score)
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const selectedRows = computed(() => props.rows.filter((row) => selected.value.has(row.id)))
const allOnPageSelected = computed(() => paged.value.length > 0 && paged.value.every((row) => selected.value.has(row.id)))
watch([filters, sort], () => { page.value = 1 })
watch(() => props.rows, (rows) => {
  const ids = new Set(rows.map((row) => row.id))
  selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
})

function toggleSort(key: SortKey) {
  if (sort.key === key) sort.dir = sort.dir === 1 ? -1 : 1
  else { sort.key = key; sort.dir = -1 }
}
function toggleIn(list: number[], id: number) {
  const index = list.indexOf(id)
  if (index >= 0) list.splice(index, 1)
  else list.push(id)
}
function addCategory() {
  if (categoryPick.value && !form.categoryIds.includes(categoryPick.value)) form.categoryIds.push(categoryPick.value)
  categoryPick.value = ''
}
function toggleRow(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function togglePage() {
  const next = new Set(selected.value)
  if (allOnPageSelected.value) paged.value.forEach((row) => next.delete(row.id))
  else paged.value.forEach((row) => next.add(row.id))
  selected.value = next
}
function submit() {
  const query: SearchForm = {
    keyword: form.keyword.trim() || undefined,
    categoryIds: form.categoryIds.length ? [...form.categoryIds] : undefined,
    followersMin: Number(form.followersMin) || undefined,
    followersMax: Number(form.followersMax) || undefined,
    gmvGroups: form.gmvGroups.length ? [...form.gmvGroups] : undefined,
    unitsGroups: form.unitsGroups.length ? [...form.unitsGroups] : undefined,
    starOnly: form.starOnly || undefined,
    pages: form.pages,
  }
  try { localStorage.setItem(FORM_KEY, JSON.stringify(query)) } catch { /* storage unavailable */ }
  emit('search', query)
}
async function copyHandles() {
  const handles = selectedRows.value.map((row) => row.handle)
  if (!handles.length) return
  try {
    await navigator.clipboard.writeText(handles.join('\n'))
    emit('copied', handles.length)
  } catch { /* clipboard unavailable */ }
}
function fetchSelected() {
  emit('fetchContacts', selectedRows.value.slice(0, 50))
}
function statusTone(status: string) {
  return status === 'agreed' ? 'vg-pill--green' : status === 'replied' ? 'vg-pill--blue' : status === 'declined' ? 'vg-pill--red' : 'vg-pill--amber'
}
function starSelected(starred: boolean) {
  emit('star', [...selected.value], starred)
}
function removeSelected() {
  emit('remove', [...selected.value])
  selected.value = new Set()
}
function tierTone(tier: CreatorHubTier) {
  return tier === 'A' ? 'vg-pill--green' : tier === 'B' ? 'vg-pill--blue' : tier === 'C' ? 'vg-pill--amber' : 'vg-pill--red'
}
function gmvText(row: CreatorHubPoolRow) {
  return row.gmv != null ? formatMoney(row.gmv) : row.gmvRange || '-'
}
function scoreTitle(row: CreatorHubPoolRow) {
  return t('creatorHub.discover.scoreParts', { sales: row.parts.sales, content: row.parts.content, account: row.parts.account, history: row.parts.history })
}
</script>

<template>
  <div class="vg-stack" data-testid="creator-hub-discover">
    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><UserSearch :size="16" />{{ t('creatorHub.discover.searchTitle') }}<small v-if="selectedShop">{{ selectedShop.name }}</small></span>
        <span class="vg-muted ch-small-inline">{{ t('creatorHub.discover.readonly') }}</span>
      </div>
      <div v-if="!selectedShop" class="vg-notice vg-notice--warning"><Info :size="16" /><span>{{ t('creatorHub.discover.pickShop') }}</span></div>
      <div class="vg-form-grid ch-discover-form">
        <div class="vg-field span-2">
          <label for="ch-discover-keyword">{{ t('creatorHub.discover.keyword') }}</label>
          <input id="ch-discover-keyword" v-model="form.keyword" class="vg-input" :placeholder="t('creatorHub.discover.keywordPlaceholder')" @keydown.enter="selectedShop && !searching && submit()" />
        </div>
        <div class="vg-field span-2">
          <label for="ch-discover-category">{{ t('creatorHub.discover.category') }}</label>
          <div class="vg-row">
            <select id="ch-discover-category" v-model="categoryPick" class="vg-select ch-discover-category" @change="addCategory">
              <option value="">{{ t('creatorHub.discover.categoryAdd') }}</option>
              <option v-for="item in CREATOR_HUB_MARKET_CATEGORIES" :key="item.id" :value="item.id" :disabled="form.categoryIds.includes(item.id)">{{ item.name }}</option>
            </select>
            <button v-for="id in form.categoryIds" :key="id" type="button" class="vg-chip ch-chip-btn" :title="t('creatorHub.discover.remove')" @click="form.categoryIds = form.categoryIds.filter((item) => item !== id)">{{ categoryName(id) }} ×</button>
          </div>
        </div>
        <div class="vg-field">
          <span class="vg-field__label">{{ t('creatorHub.discover.followers') }}</span>
          <div class="vg-row ch-range">
            <input v-model="form.followersMin" class="vg-input" type="number" min="0" :placeholder="t('creatorHub.discover.min')" :aria-label="t('creatorHub.discover.min')" />
            <span class="vg-muted">-</span>
            <input v-model="form.followersMax" class="vg-input" type="number" min="0" :placeholder="t('creatorHub.discover.max')" :aria-label="t('creatorHub.discover.max')" />
          </div>
        </div>
        <div class="vg-field">
          <span class="vg-field__label">{{ t('creatorHub.discover.gmv') }}</span>
          <div class="vg-seg vg-seg--sm">
            <button v-for="item in CREATOR_HUB_GMV_GROUPS" :key="item.id" type="button" class="vg-seg__btn" :class="{ 'is-active': form.gmvGroups.includes(item.id) }" @click="toggleIn(form.gmvGroups, item.id)">{{ item.label }}</button>
          </div>
        </div>
        <div class="vg-field">
          <span class="vg-field__label">{{ t('creatorHub.discover.units') }}</span>
          <div class="vg-seg vg-seg--sm">
            <button v-for="item in CREATOR_HUB_UNITS_GROUPS" :key="item.id" type="button" class="vg-seg__btn" :class="{ 'is-active': form.unitsGroups.includes(item.id) }" @click="toggleIn(form.unitsGroups, item.id)">{{ item.label }}</button>
          </div>
        </div>
        <div class="vg-field">
          <label for="ch-discover-pages">{{ t('creatorHub.discover.pages') }}</label>
          <div class="vg-row">
            <select id="ch-discover-pages" v-model.number="form.pages" class="vg-select">
              <option v-for="n in [1, 3, 5, 10]" :key="n" :value="n">{{ t('creatorHub.discover.pagesOption', { count: n * 20 }) }}</option>
            </select>
            <label class="vg-switch" :class="{ 'is-on': form.starOnly }" @click.prevent="form.starOnly = !form.starOnly"><span class="vg-switch__track" />{{ t('creatorHub.discover.starOnly') }}</label>
          </div>
        </div>
      </div>
      <div class="vg-card__foot">
        <span class="vg-muted ch-small-inline">{{ t('creatorHub.discover.searchHint') }}</span>
        <button class="vg-btn vg-btn--primary" :disabled="!selectedShop || searching" data-testid="creator-hub-discover-search" @click="submit">
          <RefreshCw v-if="searching" :size="14" class="vg-spin" /><Search v-else :size="14" />{{ searching ? t('creatorHub.discover.searching') : t('creatorHub.discover.search') }}
        </button>
      </div>
    </section>

    <div class="vg-stats">
      <div class="vg-stat"><span class="vg-stat__icon"><UserSearch :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.discover.statTotal') }}</span><span class="vg-stat__value">{{ formatCount(stats.total) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--blue"><Sparkles :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.discover.statFresh') }}</span><span class="vg-stat__value">{{ formatCount(stats.fresh) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--violet"><ArrowDownUp :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.discover.statTierA') }}</span><span class="vg-stat__value">{{ formatCount(stats.tierA) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--amber"><Star :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.discover.statStarred') }}</span><span class="vg-stat__value">{{ formatCount(stats.starred) }}</span></div></div>
    </div>

    <div class="vg-toolbar">
      <div class="vg-search ch-search">
        <Search :size="15" />
        <input v-model="filters.q" class="vg-input" :placeholder="t('creatorHub.discover.filterSearch')" />
      </div>
      <div class="vg-seg vg-seg--sm" role="group" :aria-label="t('creatorHub.crm.tier')">
        <button class="vg-seg__btn" :class="{ 'is-active': filters.tier === 'all' }" @click="filters.tier = 'all'">{{ t('creatorHub.crm.allTiers') }}</button>
        <button v-for="tier in ['A', 'B', 'C', 'D']" :key="tier" class="vg-seg__btn" :class="{ 'is-active': filters.tier === tier }" @click="filters.tier = tier">{{ tier }}<span class="vg-count">{{ tierCounts[tier] || 0 }}</span></button>
      </div>
      <select v-if="poolCategories.length" v-model="filters.category" class="vg-select" :aria-label="t('creatorHub.discover.category')">
        <option value="all">{{ t('creatorHub.discover.allCategories') }}</option>
        <option v-for="name in poolCategories" :key="name" :value="name">{{ name }}</option>
      </select>
      <label class="vg-switch" :class="{ 'is-on': filters.hideInvited }" @click.prevent="filters.hideInvited = !filters.hideInvited"><span class="vg-switch__track" />{{ t('creatorHub.discover.hideInvited') }}</label>
      <label class="vg-switch" :class="{ 'is-on': filters.hideBlocked }" @click.prevent="filters.hideBlocked = !filters.hideBlocked"><span class="vg-switch__track" />{{ t('creatorHub.discover.hideBlocked') }}</label>
      <label class="vg-switch" :class="{ 'is-on': filters.starredOnly }" @click.prevent="filters.starredOnly = !filters.starredOnly"><span class="vg-switch__track" />{{ t('creatorHub.discover.starredOnly') }}</label>
      <label class="vg-switch" :class="{ 'is-on': filters.collaboratedOnly }" @click.prevent="filters.collaboratedOnly = !filters.collaboratedOnly"><span class="vg-switch__track" />{{ t('creatorHub.discover.collaboratedOnly') }}</label>
      <select v-model="filters.contact" class="vg-select" :aria-label="t('creatorHub.contact.filter')" data-testid="creator-hub-contact-filter">
        <option value="all">{{ t('creatorHub.contact.filterAll') }}</option>
        <option value="zalo">{{ t('creatorHub.contact.filterZalo') }}</option>
        <option value="backend">{{ t('creatorHub.contact.filterBackend') }}</option>
        <option value="unchecked">{{ t('creatorHub.contact.filterUnchecked') }}</option>
        <option value="contacted">{{ t('creatorHub.contact.filterContacted') }}</option>
      </select>
    </div>
    <div class="vg-notice"><Info :size="16" /><span>{{ t('creatorHub.discover.scoreRule') }}</span></div>

    <div v-if="selected.size" class="vg-notice vg-notice--accent ch-bulk">
      <span>{{ t('creatorHub.discover.selected', { count: selected.size }) }}</span>
      <div class="vg-row">
        <button class="vg-btn vg-btn--sm vg-btn--primary" :disabled="fetchingContacts" :title="t('creatorHub.contact.fetchHint')" data-testid="creator-hub-fetch-contacts" @click="fetchSelected">
          <RefreshCw v-if="fetchingContacts" :size="13" class="vg-spin" /><Contact v-else :size="13" />{{ fetchingContacts ? t('creatorHub.contact.fetching') : t('creatorHub.contact.fetch', { count: Math.min(50, selected.size) }) }}
        </button>
        <button class="vg-btn vg-btn--sm vg-btn--soft" @click="starSelected(true)"><Star :size="13" />{{ t('creatorHub.discover.star') }}</button>
        <button class="vg-btn vg-btn--sm vg-btn--outline" @click="starSelected(false)">{{ t('creatorHub.discover.unstar') }}</button>
        <button class="vg-btn vg-btn--sm vg-btn--outline" :title="t('creatorHub.discover.copyHint')" @click="copyHandles"><Copy :size="13" />{{ t('creatorHub.discover.copy') }}</button>
        <button class="vg-btn vg-btn--sm vg-btn--danger" @click="removeSelected"><Trash2 :size="13" />{{ t('creatorHub.discover.remove') }}</button>
        <button class="vg-link vg-link--muted" @click="selected = new Set()">{{ t('creatorHub.actions.cancel') }}</button>
      </div>
    </div>

    <section class="vg-card vg-card--flush">
      <div v-if="!rows.length" class="vg-empty">
        <span class="vg-empty__icon"><UserSearch :size="26" /></span>
        <h3>{{ t('creatorHub.discover.emptyTitle') }}</h3>
        <p>{{ t('creatorHub.discover.emptyDesc') }}</p>
      </div>
      <template v-else>
        <div class="ch-table-scroll">
          <table class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th class="chk"><input type="checkbox" :checked="allOnPageSelected" :aria-label="t('creatorHub.discover.selectPage')" @change="togglePage" /></th>
                <th>{{ t('creatorHub.samples.colCreator') }}</th>
                <th v-if="showShop">{{ t('creatorHub.samples.colShop') }}</th>
                <th><span class="ch-sort" :class="{ 'is-active': sort.key === 'score' }" :title="t('creatorHub.discover.scoreRule')" @click="toggleSort('score')">{{ t('creatorHub.crm.colScore') }}<ArrowDownUp :size="12" /></span></th>
                <th>{{ t('creatorHub.discover.colCategory') }}</th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'followers' }" @click="toggleSort('followers')">{{ t('creatorHub.discover.colFollowers') }}<ArrowDownUp :size="12" /></span></th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'gmv' }" @click="toggleSort('gmv')">GMV<ArrowDownUp :size="12" /></span></th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'unitsSold' }" @click="toggleSort('unitsSold')">{{ t('creatorHub.discover.colUnits') }}<ArrowDownUp :size="12" /></span></th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'avgViews' }" @click="toggleSort('avgViews')">{{ t('creatorHub.discover.colViews') }}<ArrowDownUp :size="12" /></span></th>
                <th class="num"><span class="ch-sort" :class="{ 'is-active': sort.key === 'engagementRate' }" @click="toggleSort('engagementRate')">{{ t('creatorHub.discover.colEngagement') }}<ArrowDownUp :size="12" /></span></th>
                <th>{{ t('creatorHub.discover.colHistory') }}</th>
                <th>{{ t('creatorHub.contact.col') }}</th>
                <th><span class="ch-sort" :class="{ 'is-active': sort.key === 'lastSeenAt' }" @click="toggleSort('lastSeenAt')">{{ t('creatorHub.discover.colSeen') }}<ArrowDownUp :size="12" /></span></th>
                <th>{{ t('creatorHub.samples.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in paged" :key="row.id" :class="{ 'is-selected': selected.has(row.id), 'ch-row-muted': row.blocked || row.blockedByShop }">
                <td class="chk"><input type="checkbox" :checked="selected.has(row.id)" :aria-label="row.handle" @change="toggleRow(row.id)" /></td>
                <td>
                  <button class="ch-person ch-person-btn" type="button" @click="emit('detail', row)">
                    <img v-if="row.avatar" class="vg-avatar" :src="row.avatar" alt="" referrerpolicy="no-referrer" />
                    <span v-else class="vg-avatar">{{ (row.nickname || row.handle || '?').slice(0, 1) }}</span>
                    <span class="vg-list__main">
                      <span class="vg-list__title">{{ row.nickname || row.handle }}<Star v-if="row.starred" :size="12" class="ch-star" /><Ban v-if="row.blocked || row.blockedByShop" :size="12" class="ch-ban" /></span>
                      <span class="vg-list__sub">@{{ row.handle }}<template v-if="row.level"> · Lv.{{ row.level }}</template></span>
                    </span>
                  </button>
                </td>
                <td v-if="showShop" class="vg-muted">{{ shopNames.get(row.shopId) || '-' }}</td>
                <td class="ch-nowrap" :title="scoreTitle(row)"><span class="vg-pill" :class="tierTone(row.tier)">{{ row.tier }}</span> <span class="vg-num vg-muted">{{ row.score }}</span></td>
                <td><div class="vg-row ch-tags"><span v-for="name in row.categories.slice(0, 2)" :key="name" class="vg-chip">{{ name }}</span><span v-if="row.categories.length > 2" class="vg-muted">+{{ row.categories.length - 2 }}</span></div></td>
                <td class="num ch-nowrap">
                  <div>{{ formatCount(row.followers) }}</div>
                  <div v-if="row.topGender" class="vg-muted ch-sub">{{ row.topGender.key }} {{ row.topGender.share != null ? formatPercent(row.topGender.share, 0) : '' }}<template v-if="row.topAges.length"> · {{ row.topAges[0] }}</template></div>
                </td>
                <td class="num ch-nowrap">{{ gmvText(row) }}</td>
                <td class="num">{{ formatCount(row.unitsSold) }}</td>
                <td class="num">{{ formatCount(row.avgViews) }}</td>
                <td class="num">{{ formatPercent(row.engagementRate, 2) }}</td>
                <td>
                  <div class="vg-row ch-flags">
                    <span v-if="row.ourSamples" class="vg-pill" :class="row.ourFulfillmentRate != null ? `vg-pill--${rateTone(row.ourFulfillmentRate)}` : 'vg-pill--blue'">{{ t('creatorHub.discover.ourSamples', { count: row.ourSamples }) }}<template v-if="row.ourFulfillmentRate != null"> · {{ formatPercent(row.ourFulfillmentRate, 0) }}</template></span>
                    <span v-if="row.ourGmv > 0" class="vg-pill vg-pill--green">{{ t('creatorHub.discover.sold') }}</span>
                    <span v-if="row.collaborated && !row.ourSamples" class="vg-pill vg-pill--blue">{{ t('creatorHub.discover.collaborated') }}</span>
                    <span v-if="row.invitedIn90d" class="vg-pill vg-pill--amber">{{ t('creatorHub.discover.invited') }}</span>
                    <span v-if="row.risingStar" class="vg-pill vg-pill--violet">Star</span>
                  </div>
                </td>
                <td class="ch-nowrap">
                  <div class="vg-row ch-flags">
                    <button v-if="zaloNumber(row.contact)" class="vg-btn vg-btn--xs vg-btn--soft" :title="zaloNumber(row.contact)" data-testid="creator-hub-zalo" @click="emit('zalo', row)"><MessageCircle :size="12" />Zalo</button>
                    <span v-else-if="row.contact?.contactInfoAvailable" class="vg-pill vg-pill--blue" :title="t('creatorHub.contact.onBackendHint')">{{ t('creatorHub.contact.onBackend') }}</span>
                    <span v-else-if="row.contact?.email" class="vg-pill" :title="row.contact.email">Email</span>
                    <span v-else-if="row.contact?.bioFetchedAt" class="vg-muted">{{ t('creatorHub.contact.none') }}</span>
                    <span v-else class="vg-muted">-</span>
                    <span v-if="row.contact && row.contact.status !== 'none'" class="vg-pill" :class="statusTone(row.contact.status)">{{ t(`creatorHub.contact.status.${row.contact.status}`) }}</span>
                  </div>
                </td>
                <td class="vg-muted ch-nowrap">{{ formatDate(row.lastSeenAt) }}</td>
                <td class="ch-nowrap">
                  <button class="vg-icon-btn" :class="{ 'is-active': row.starred }" :title="row.starred ? t('creatorHub.discover.unstar') : t('creatorHub.discover.star')" @click="emit('star', [row.id], !row.starred)"><Star :size="14" /></button>
                  <button class="vg-icon-btn" :title="t('creatorHub.discover.detail')" data-testid="creator-hub-discover-detail" @click="emit('detail', row)"><Eye :size="14" /></button>
                </td>
              </tr>
              <tr v-if="!paged.length"><td :colspan="showShop ? 14 : 13" class="vg-table__empty">{{ t('creatorHub.samples.noMatch') }}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="ch-pager-wrap"><ChPager v-model:page="page" v-model:page-size="pageSize" :total="filtered.length" /></div>
      </template>
    </section>
  </div>
</template>
