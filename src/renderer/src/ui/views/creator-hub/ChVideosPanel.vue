<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Clapperboard, ExternalLink, Eye, Package, Search, ShoppingBag, TrendingUp, Timer } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubShop, CreatorHubVideo } from '../../../../../shared/creatorHub'
import ChPager from './ChPager.vue'
import { formatCount, formatDate, formatMoney, formatPercent } from './creatorHubFormat'

type VideoRow = CreatorHubVideo & { sampleId?: string }
type SortKey = 'gmv' | 'orders' | 'views' | 'gpm' | 'finishRate' | 'postedAt' | 'commission'

const props = defineProps<{ videos: VideoRow[]; shops: CreatorHubShop[]; showShop: boolean }>()
const { t } = useI18n()

const filters = reactive({ q: '', onlySample: false, onlySales: false })
const sortKey = ref<SortKey>('gmv')
const page = ref(1)
const pageSize = ref(20)
const shopNames = computed(() => new Map(props.shops.map((item) => [item.id, item.name])))

const filtered = computed(() => {
  const q = filters.q.trim().toLowerCase()
  const list = props.videos.filter((video) => {
    if (filters.onlySample && !video.sampleId) return false
    if (filters.onlySales && video.gmv <= 0) return false
    if (q && !`${video.title} ${video.creatorHandle} ${video.creatorNickname} ${video.itemId} ${video.productTitles.join(' ')}`.toLowerCase().includes(q)) return false
    return true
  })
  const value = (video: VideoRow) => (sortKey.value === 'finishRate' ? video.finishRate ?? -1 : video[sortKey.value])
  return list.sort((a, b) => value(b) - value(a))
})
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([filters, sortKey], () => { page.value = 1 })

const summary = computed(() => {
  const list = filtered.value
  const sum = (pick: (video: VideoRow) => number) => list.reduce((total, video) => total + pick(video), 0)
  const views = sum((video) => video.views)
  const sampleVideos = list.filter((video) => video.sampleId)
  const finishRates = list.filter((video) => video.finishRate != null && video.views > 0)
  return {
    videos: list.length,
    gmv: sum((video) => video.gmv),
    orders: sum((video) => video.orders),
    views,
    gpm: views ? (sum((video) => video.gmv) / views) * 1000 : 0,
    finishRate: finishRates.length ? finishRates.reduce((total, video) => total + (video.finishRate || 0) * video.views, 0) / finishRates.reduce((total, video) => total + video.views, 0) : undefined,
    sampleVideos: sampleVideos.length,
    sampleGmv: sampleVideos.reduce((total, video) => total + video.gmv, 0),
    window: list[0]?.window || props.videos[0]?.window,
  }
})

function openVideo(video: VideoRow) {
  const handle = video.creatorHandle || 'tiktok'
  void window.api.shell.openExternal(`https://www.tiktok.com/@${encodeURIComponent(handle)}/video/${encodeURIComponent(video.itemId)}`)
}
</script>

<template>
  <div class="vg-stack" data-testid="creator-hub-videos">
    <div class="vg-stats">
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--blue"><Clapperboard :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.videos.count') }}</span><span class="vg-stat__value">{{ formatCount(summary.videos) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon"><TrendingUp :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.videos.gmv') }}</span><span class="vg-stat__value">{{ formatMoney(summary.gmv) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--blue"><ShoppingBag :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.videos.orders') }}</span><span class="vg-stat__value">{{ formatCount(summary.orders) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--amber"><Eye :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.videos.views') }}</span><span class="vg-stat__value">{{ formatCount(summary.views) }}</span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--violet"><Timer :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.videos.gpmFinish') }}</span><span class="vg-stat__value">{{ formatMoney(summary.gpm) }}<small>{{ formatPercent(summary.finishRate) }}</small></span></div></div>
      <div class="vg-stat"><span class="vg-stat__icon"><Package :size="17" /></span><div class="vg-stat__body"><span class="vg-stat__label">{{ t('creatorHub.videos.sampleVideos') }}</span><span class="vg-stat__value">{{ formatCount(summary.sampleVideos) }}<small>{{ formatMoney(summary.sampleGmv) }}</small></span></div></div>
    </div>

    <div class="vg-toolbar">
      <div class="vg-search ch-search">
        <Search :size="15" />
        <input v-model="filters.q" class="vg-input" :placeholder="t('creatorHub.videos.search')" />
      </div>
      <select v-model="sortKey" class="vg-select" :aria-label="t('creatorHub.videos.sortBy')">
        <option value="gmv">{{ t('creatorHub.videos.sortGmv') }}</option>
        <option value="orders">{{ t('creatorHub.videos.sortOrders') }}</option>
        <option value="views">{{ t('creatorHub.videos.sortViews') }}</option>
        <option value="gpm">{{ t('creatorHub.videos.sortGpm') }}</option>
        <option value="finishRate">{{ t('creatorHub.videos.sortFinish') }}</option>
        <option value="commission">{{ t('creatorHub.videos.sortCommission') }}</option>
        <option value="postedAt">{{ t('creatorHub.videos.sortPosted') }}</option>
      </select>
      <label class="vg-switch" :class="{ 'is-on': filters.onlySample }" @click.prevent="filters.onlySample = !filters.onlySample"><span class="vg-switch__track" />{{ t('creatorHub.videos.onlySample') }}</label>
      <label class="vg-switch" :class="{ 'is-on': filters.onlySales }" @click.prevent="filters.onlySales = !filters.onlySales"><span class="vg-switch__track" />{{ t('creatorHub.videos.onlySales') }}</label>
      <span class="vg-toolbar__spacer" />
      <span v-if="summary.window" class="vg-muted">{{ t('creatorHub.overview.window', { start: formatDate(summary.window.start), end: formatDate(summary.window.end - 1) }) }}</span>
    </div>

    <section class="vg-card vg-card--flush">
      <div v-if="!videos.length" class="vg-empty">
        <span class="vg-empty__icon"><Clapperboard :size="26" /></span>
        <h3>{{ t('creatorHub.videos.emptyTitle') }}</h3>
        <p>{{ t('creatorHub.videos.emptyDesc') }}</p>
      </div>
      <template v-else>
        <div class="ch-table-scroll">
          <table class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th>{{ t('creatorHub.videos.colVideo') }}</th>
                <th>{{ t('creatorHub.samples.colCreator') }}</th>
                <th v-if="showShop">{{ t('creatorHub.samples.colShop') }}</th>
                <th class="num">{{ t('creatorHub.videos.colGmv') }}</th>
                <th class="num">{{ t('creatorHub.videos.colOrders') }}</th>
                <th class="num">{{ t('creatorHub.videos.colViews') }}</th>
                <th class="num">{{ t('creatorHub.videos.colFinish') }}</th>
                <th class="num">{{ t('creatorHub.videos.colCtr') }}</th>
                <th class="num">GPM</th>
                <th class="num">{{ t('creatorHub.videos.colCommission') }}</th>
                <th>{{ t('creatorHub.samples.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="video in paged" :key="video.id">
                <td>
                  <div class="ch-person ch-video">
                    <img v-if="video.cover" class="vg-thumb ch-video__cover" :src="video.cover" alt="" referrerpolicy="no-referrer" />
                    <span v-else class="vg-thumb ch-video__cover"><Clapperboard :size="16" /></span>
                    <div class="vg-list__main">
                      <span class="vg-list__title" :title="video.title">{{ video.title || video.itemId }}</span>
                      <span class="vg-list__sub">{{ formatDate(video.postedAt) }} · {{ video.productTitles[0] || '-' }}</span>
                      <span v-if="video.sampleId" class="vg-pill vg-pill--accent ch-sample-tag">{{ t('creatorHub.videos.sampleTag') }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="vg-list__main">
                    <span class="vg-list__title">{{ video.creatorNickname || video.creatorHandle }}</span>
                    <span class="vg-list__sub">@{{ video.creatorHandle }} · {{ t('creatorHub.samples.followers', { count: formatCount(video.followers) }) }}</span>
                  </div>
                </td>
                <td v-if="showShop" class="vg-muted">{{ shopNames.get(video.shopId) || '-' }}</td>
                <td class="num">{{ formatMoney(video.gmv) }}</td>
                <td class="num">{{ formatCount(video.orders) }}</td>
                <td class="num">{{ formatCount(video.views) }}</td>
                <td class="num">{{ formatPercent(video.finishRate) }}</td>
                <td class="num">{{ formatPercent(video.ctr) }}</td>
                <td class="num">{{ formatMoney(video.gpm) }}</td>
                <td class="num">{{ formatMoney(video.commission) }}</td>
                <td><button class="vg-icon-btn" :title="t('creatorHub.videos.open')" @click="openVideo(video)"><ExternalLink :size="15" /></button></td>
              </tr>
              <tr v-if="!paged.length"><td :colspan="showShop ? 11 : 10" class="vg-table__empty">{{ t('creatorHub.samples.noMatch') }}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="ch-pager-wrap"><ChPager v-model:page="page" v-model:page-size="pageSize" :total="filtered.length" /></div>
      </template>
    </section>
  </div>
</template>
