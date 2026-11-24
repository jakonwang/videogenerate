<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  ArrowDownUp, ArrowLeft, ArrowRight, BarChart3, Bookmark, BookmarkMinus, Check, Columns3, Crown, Gem, Inbox, Plus,
  RefreshCw, Search, Table2, TrendingUp,
} from 'lucide-vue-next'
import { useSchemeWorkspace, type ProductRow } from './useSchemeWorkspace'
import PrPager from './PrPager.vue'
import PrThumb from './PrThumb.vue'
import PrSource from './PrSource.vue'
import { researchCurrencyOf, researchSourceOf } from '../../../../../shared/productResearch'
import { currenciesOf, currencyName, formatMoney, formatNumber, formatPrice, gmvOf, priceOf, ratingOf, sourceLabel, sourcesOf, sumByCurrency } from './productResearchUtils'

const ws = useSchemeWorkspace()
const { keywords, productRows, candidateIds, candidateSet } = ws

type SortKey = 'sales' | 'price' | 'gmv' | 'rating'
const filters = reactive({ priceMin: '', priceMax: '', rating: '', keyword: '', source: '', q: '' })
const sort = reactive<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'sales', dir: 'desc' })
const tab = ref<'all' | 'hot' | 'candidate'>('all')
const view = ref<'table' | 'compare'>('table')
const page = ref(1)
const pageSize = ref(50)
const checked = ref<string[]>([])

const sources = computed(() => sourcesOf(productRows.value))
const currencies = computed(() => currenciesOf(filters.source ? productRows.value.filter((item) => researchSourceOf(item) === filters.source) : productRows.value))
/** 多币种时价格不能互相比较，要先选平台 */
const mixed = computed(() => currencies.value.length > 1)
const currency = computed(() => (mixed.value ? '' : currencies.value[0] || ''))
watch(mixed, (value) => {
  if (!value) return
  Object.assign(filters, { priceMin: '', priceMax: '' })
  if (sort.key === 'price' || sort.key === 'gmv') Object.assign(sort, { key: 'sales', dir: 'desc' })
})
const hasRating = computed(() => productRows.value.some((item) => ratingOf(item) !== undefined))

/** 高潜：销量位于全部商品前 20%，且销量不低于 100。 */
const hotThreshold = computed(() => {
  const sales = productRows.value.map((item) => item.salesValue || 0).sort((a, b) => b - a)
  if (!sales.length) return Infinity
  return Math.max(100, sales[Math.max(0, Math.ceil(sales.length * 0.2) - 1)])
})
const isHot = (item: ProductRow) => (item.salesValue || 0) >= hotThreshold.value

function sortValue(item: ProductRow, key: SortKey) {
  if (key === 'price') return priceOf(item) || 0
  if (key === 'gmv') return item.gmv
  if (key === 'rating') return ratingOf(item) || 0
  return item.salesValue || 0
}

const filtered = computed(() => {
  const min = Number(filters.priceMin) || 0
  const max = Number(filters.priceMax) || 0
  const minRating = Number(filters.rating) || 0
  const q = filters.q.trim().toLowerCase()
  const list = productRows.value.filter((item) => {
    if (min && (priceOf(item) || 0) < min) return false
    if (max && (priceOf(item) || 0) > max) return false
    if (minRating && (ratingOf(item) || 0) < minRating) return false
    if (filters.source && researchSourceOf(item) !== filters.source) return false
    if (filters.keyword && item.keyword !== filters.keyword) return false
    if (q && !`${item.title} ${item.shopName}`.toLowerCase().includes(q)) return false
    return true
  })
  const dir = sort.dir === 'asc' ? 1 : -1
  return list.sort((a, b) => (sortValue(a, sort.key) - sortValue(b, sort.key)) * dir)
})
const hotList = computed(() => filtered.value.filter(isHot))
const candidateList = computed(() => filtered.value.filter((item) => candidateSet.value.has(item.id)))
const display = computed(() => (tab.value === 'hot' ? hotList.value : tab.value === 'candidate' ? candidateList.value : filtered.value))
const paged = computed(() => display.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const pageAllChecked = computed(() => paged.value.length > 0 && paged.value.every((item) => checked.value.includes(item.id)))
const hasFilters = computed(() => Boolean(filters.priceMin || filters.priceMax || filters.rating || filters.keyword || filters.source || filters.q.trim()))

const overview = computed(() => {
  const list = display.value
  const counts = new Map<string, number>()
  for (const item of list) if (priceOf(item)) counts.set(researchCurrencyOf(item), (counts.get(researchCurrencyOf(item)) || 0) + 1)
  return {
    count: list.length,
    avgPrice: sumByCurrency(list, (item) => priceOf(item) || 0).map((row) => formatMoney(row.value / (counts.get(row.currency) || 1), row.currency)),
    totalSales: list.reduce((sum, item) => sum + (item.salesValue || 0), 0),
    totalGmv: sumByCurrency(list, (item) => gmvOf(item)).map((row) => formatMoney(row.value, row.currency)),
  }
})

watch([filters, tab, sort], () => { page.value = 1 }, { deep: true })
watch(productRows, (rows) => {
  const ids = new Set(rows.map((item) => item.id))
  checked.value = checked.value.filter((id) => ids.has(id))
})

function setSort(key: SortKey) {
  if (mixed.value && (key === 'price' || key === 'gmv')) { ws.notify('不同平台的币种不同，请先选择来源平台再按金额排序'); return }
  if (sort.key === key) sort.dir = sort.dir === 'asc' ? 'desc' : 'asc'
  else { sort.key = key; sort.dir = key === 'price' ? 'asc' : 'desc' }
}
const sortPreset = computed({
  get: () => `${sort.key}:${sort.dir}`,
  set: (value: string) => { const [key, dir] = value.split(':'); sort.key = key as SortKey; sort.dir = dir as 'asc' | 'desc' },
})

function resetFilters() {
  Object.assign(filters, { priceMin: '', priceMax: '', rating: '', keyword: '', source: '', q: '' })
}

function togglePage() {
  const ids = paged.value.map((item) => item.id)
  checked.value = pageAllChecked.value ? checked.value.filter((id) => !ids.includes(id)) : [...new Set([...checked.value, ...ids])]
}

function addChecked() {
  const added = ws.addCandidates(checked.value)
  ws.notify(added ? `已加入候选 ${added} 个商品` : '选中的商品均已在候选中', added ? 'success' : 'info')
  checked.value = []
}
function removeChecked() {
  ws.removeCandidates(checked.value)
  ws.notify(`已移出候选 ${checked.value.length} 个商品`)
  checked.value = []
}

function globalRank(item: ProductRow) {
  return display.value.indexOf(item) + 1
}

// ===== Compare view =====
const compareItems = computed(() => {
  const picked = checked.value.map((id) => productRows.value.find((item) => item.id === id)).filter(Boolean) as ProductRow[]
  return (picked.length >= 2 ? picked : display.value).slice(0, 4)
})
const compareBest = computed(() => {
  const items = compareItems.value
  const sameCurrency = currenciesOf(items).length <= 1
  const best = (fn: (item: ProductRow) => number, low = false) => {
    const values = items.map(fn).filter((value) => value > 0)
    if (!values.length) return -1
    return low ? Math.min(...values) : Math.max(...values)
  }
  return {
    price: sameCurrency ? best((item) => priceOf(item) || 0, true) : -1,
    sales: best((item) => item.salesValue || 0),
    gmv: sameCurrency ? best((item) => item.gmv) : -1,
    rating: best((item) => ratingOf(item) || 0),
    match: best((item) => item.match),
  }
})
</script>

<template>
  <div class="sa">
    <section class="prd-card sa-main">
      <div class="prd-section-head">
        <h2><BarChart3 :size="22" />分析商品</h2>
        <p>对已采集的商品进行数据分析与对比，筛选出符合需求的潜力商品。</p>
      </div>

      <div class="sa-filters">
        <label><span>排序</span>
          <select v-model="sortPreset" class="prd-select">
            <option value="sales:desc">销量从高到低</option>
            <option value="sales:asc">销量从低到高</option>
            <option v-if="!mixed" value="gmv:desc">GMV 从高到低</option>
            <option v-if="!mixed" value="price:asc">价格从低到高</option>
            <option v-if="!mixed" value="price:desc">价格从高到低</option>
            <option v-if="hasRating" value="rating:desc">评分从高到低</option>
          </select>
        </label>
        <label v-if="sources.length > 1"><span>来源平台</span>
          <select v-model="filters.source" class="prd-select"><option value="">全部</option><option v-for="value in sources" :key="value" :value="value">{{ sourceLabel(value) }}</option></select>
        </label>
        <label :title="mixed ? '不同平台币种不同，请先选择来源平台' : ''"><span>采集价（{{ mixed ? '请先选平台' : currencyName(currency) }}）</span>
          <span class="sa-range"><input v-model="filters.priceMin" :disabled="mixed" type="number" min="0" class="prd-input" placeholder="最低价" /><i>–</i><input v-model="filters.priceMax" :disabled="mixed" type="number" min="0" class="prd-input" placeholder="最高价" /></span>
        </label>
        <label v-if="hasRating"><span>评分区间</span>
          <select v-model="filters.rating" class="prd-select">
            <option value="">不限</option><option value="4">4.0 以上</option><option value="4.5">4.5 以上</option><option value="4.8">4.8 以上</option>
          </select>
        </label>
        <label><span>来源搜索词</span>
          <select v-model="filters.keyword" class="prd-select"><option value="">全部</option><option v-for="kw in keywords" :key="kw.id" :value="kw.value">{{ kw.value }}</option></select>
        </label>
        <label class="sa-filters__q"><span>商品关键词</span>
          <span class="prd-search"><Search :size="14" /><input v-model="filters.q" class="prd-input" placeholder="请输入关键词" /></span>
        </label>
        <button v-if="hasFilters" class="prd-btn prd-btn--outline sa-filters__reset" @click="resetFilters"><RefreshCw :size="14" />重置筛选</button>
      </div>

      <div class="sa-bar">
        <div class="prd-seg">
          <button class="prd-seg__btn" :class="{ 'is-active': tab === 'all' }" @click="tab = 'all'">全部商品<span class="prd-seg__count">{{ formatNumber(filtered.length) }}</span></button>
          <button class="prd-seg__btn" :class="{ 'is-active': tab === 'hot' }" :title="`销量 ≥ ${formatNumber(hotThreshold)}（前 20%）`" @click="tab = 'hot'"><Gem :size="14" />高潜商品<span class="prd-seg__count">{{ hotList.length }}</span></button>
          <button class="prd-seg__btn" :class="{ 'is-active': tab === 'candidate' }" @click="tab = 'candidate'"><Bookmark :size="14" />已加入候选<span class="prd-seg__count">{{ candidateIds.length }}</span></button>
        </div>
        <div v-if="checked.length" class="sa-checked">
          已勾选 <b>{{ checked.length }}</b> 项
          <button class="prd-btn prd-btn--sm prd-btn--primary" @click="addChecked"><Plus :size="13" />加入候选</button>
          <button class="prd-btn prd-btn--sm" @click="removeChecked"><BookmarkMinus :size="13" />移出候选</button>
          <button class="prd-link prd-link--muted" @click="checked = []">清空</button>
        </div>
        <div class="prd-seg sa-view">
          <button class="prd-seg__btn" :class="{ 'is-active': view === 'table' }" @click="view = 'table'"><Table2 :size="14" />表格视图</button>
          <button class="prd-seg__btn" :class="{ 'is-active': view === 'compare' }" @click="view = 'compare'"><Columns3 :size="14" />对比视图</button>
        </div>
      </div>

      <div class="sa-layout">
        <div class="sa-content">
          <template v-if="view === 'table'">
            <div class="prd-table-wrap">
              <table class="prd-table">
                <thead>
                  <tr>
                    <th class="chk"><input type="checkbox" :checked="pageAllChecked" aria-label="全选本页" @change="togglePage" /></th>
                    <th>#</th>
                    <th>商品图片</th>
                    <th>商品名称</th>
                    <th class="num"><span class="prd-th-sort" :class="{ 'is-active': sort.key === 'price' }" @click="setSort('price')">采集价<ArrowDownUp :size="11" /></span></th>
                    <th class="num"><span class="prd-th-sort" :class="{ 'is-active': sort.key === 'sales' }" @click="setSort('sales')">销量<ArrowDownUp :size="11" /></span></th>
                    <th class="num"><span class="prd-th-sort" :class="{ 'is-active': sort.key === 'gmv' }" @click="setSort('gmv')">预估 GMV<ArrowDownUp :size="11" /></span></th>
                    <th v-if="hasRating"><span class="prd-th-sort" :class="{ 'is-active': sort.key === 'rating' }" @click="setSort('rating')">评分<ArrowDownUp :size="11" /></span></th>
                    <th>来源搜索词</th>
                    <th class="center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!paged.length">
                    <td colspan="10" class="prd-empty-cell">{{ tab === 'candidate' ? '还没有加入候选的商品' : '暂无符合条件的商品' }}</td>
                  </tr>
                  <tr v-for="item in paged" :key="item.id" :class="{ 'is-selected': checked.includes(item.id) }">
                    <td class="chk"><input v-model="checked" type="checkbox" :value="item.id" /></td>
                    <td class="nowrap">
                      <span class="sa-rank">{{ globalRank(item) }}<Crown v-if="globalRank(item) <= 3" :size="15" class="sa-crown" :class="`sa-crown--${globalRank(item)}`" /></span>
                    </td>
                    <td><PrThumb :result="item" size="lg" /></td>
                    <td>
                      <div class="prd-product__meta">
                        <span class="prd-product__name" :title="item.title">{{ item.title }}</span>
                        <span class="prd-product__chips">
                          <PrSource :item="item" class="sa-source" />
                          <span v-if="isHot(item)" class="prd-chip sa-chip-hot"><TrendingUp :size="10" />高潜</span>
                          <span v-if="item.shopName" class="prd-chip">{{ item.shopName }}</span>
                        </span>
                      </div>
                    </td>
                    <td class="num">{{ formatPrice(item) }}</td>
                    <td class="num prd-num-green">{{ item.salesValue !== undefined ? formatNumber(item.salesValue) : item.salesText || '-' }}</td>
                    <td class="num" title="采集价 × 销量">{{ item.gmv ? formatMoney(item.gmv, researchCurrencyOf(item)) : '-' }}</td>
                    <td v-if="hasRating" class="nowrap"><template v-if="ratingOf(item) !== undefined"><span class="prd-star">★</span> {{ ratingOf(item)!.toFixed(1) }}</template><span v-else class="muted">-</span></td>
                    <td>{{ item.keyword }}</td>
                    <td class="center">
                      <button v-if="candidateSet.has(item.id)" class="prd-btn prd-btn--sm prd-btn--success sa-added" title="点击移出候选" @click="ws.toggleCandidate(item.id)"><Check :size="13" />已加入</button>
                      <button v-else class="prd-btn prd-btn--sm" @click="ws.toggleCandidate(item.id)"><Plus :size="13" />加入候选</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <PrPager v-model:page="page" v-model:page-size="pageSize" :total="display.length" :page-sizes="[20, 50, 100]" />
          </template>

          <template v-else>
            <p class="sa-compare-tip">{{ checked.length >= 2 ? `正在对比勾选的 ${compareItems.length} 个商品（最多 4 个）` : '勾选 2-4 个商品可自定义对比，当前展示排序前 4 的商品' }}</p>
            <div v-if="compareItems.length" class="sa-compare" :style="{ gridTemplateColumns: `110px repeat(${compareItems.length}, minmax(0, 1fr))` }">
              <div class="sa-compare__label" />
              <div v-for="item in compareItems" :key="`h-${item.id}`" class="sa-compare__head">
                <PrThumb :result="item" size="lg" />
                <span class="prd-product__name" :title="item.title">{{ item.title }}</span>
              </div>
              <div class="sa-compare__label">采集价</div>
              <div v-for="item in compareItems" :key="`p-${item.id}`" :class="{ 'is-best': priceOf(item) === compareBest.price }">{{ formatPrice(item) }}</div>
              <div class="sa-compare__label">销量</div>
              <div v-for="item in compareItems" :key="`s-${item.id}`" :class="{ 'is-best': item.salesValue === compareBest.sales }">{{ formatNumber(item.salesValue) }}</div>
              <div class="sa-compare__label">预估 GMV</div>
              <div v-for="item in compareItems" :key="`g-${item.id}`" :class="{ 'is-best': item.gmv === compareBest.gmv }">{{ item.gmv ? formatMoney(item.gmv, researchCurrencyOf(item)) : '-' }}</div>
              <div class="sa-compare__label">来源平台</div>
              <div v-for="item in compareItems" :key="`src-${item.id}`"><PrSource :item="item" /></div>
              <div class="sa-compare__label">评分</div>
              <div v-for="item in compareItems" :key="`r-${item.id}`" :class="{ 'is-best': ratingOf(item) === compareBest.rating }">{{ ratingOf(item)?.toFixed(1) ?? '-' }}</div>
              <div class="sa-compare__label">需求匹配度</div>
              <div v-for="item in compareItems" :key="`m-${item.id}`" :class="{ 'is-best': item.match === compareBest.match }">{{ item.match }}%</div>
              <div class="sa-compare__label">来源搜索词</div>
              <div v-for="item in compareItems" :key="`k-${item.id}`">{{ item.keyword }}</div>
              <div class="sa-compare__label">店铺</div>
              <div v-for="item in compareItems" :key="`shop-${item.id}`">{{ item.shopName || '-' }}</div>
              <div class="sa-compare__label" />
              <div v-for="item in compareItems" :key="`a-${item.id}`">
                <button class="prd-btn prd-btn--sm prd-btn--block" :class="candidateSet.has(item.id) ? 'prd-btn--success' : 'prd-btn--primary'" @click="ws.toggleCandidate(item.id)">
                  <Check v-if="candidateSet.has(item.id)" :size="13" /><Plus v-else :size="13" />{{ candidateSet.has(item.id) ? '已加入候选' : '加入候选' }}
                </button>
              </div>
            </div>
            <div v-else class="prd-empty"><h3>暂无可对比的商品</h3></div>
          </template>
        </div>

        <aside class="sa-side">
          <div class="prd-card sa-side__card">
            <div class="prd-card__title"><BarChart3 :size="15" />筛选概况</div>
            <dl class="sa-overview">
              <dt>商品数</dt><dd>{{ formatNumber(overview.count) }}</dd>
              <dt>平均价格</dt><dd><span v-for="text in overview.avgPrice" :key="text" class="sa-money">{{ text }}</span><template v-if="!overview.avgPrice.length">-</template></dd>
              <dt>总销量</dt><dd class="prd-num-green">{{ formatNumber(overview.totalSales) }}</dd>
              <dt>预估总 GMV</dt><dd><span v-for="text in overview.totalGmv" :key="text" class="sa-money">{{ text }}</span><template v-if="!overview.totalGmv.length">-</template></dd>
            </dl>
          </div>
          <div v-if="!display.length" class="prd-card sa-side__card prd-empty">
            <Inbox :size="26" />
            <h3>暂无符合条件的商品</h3>
            <p>请调整筛选条件后重试</p>
            <button class="prd-btn prd-btn--sm" :disabled="!hasFilters" @click="resetFilters">重置筛选</button>
          </div>
          <div class="prd-card sa-side__card sa-next">
            <button class="prd-btn prd-btn--block" :class="candidateIds.length ? 'prd-btn--primary' : ''" :disabled="!candidateIds.length" @click="ws.goStep(3)">下一步：确定商品<ArrowRight :size="15" /></button>
            <small>{{ candidateIds.length ? `已加入 ${candidateIds.length} 个候选商品` : '请至少选择 1 个商品后继续' }}</small>
          </div>
        </aside>
      </div>
    </section>

    <footer class="prd-footer">
      <div class="prd-footer__left">已选择 <b>{{ candidateIds.length }}</b> 个商品</div>
      <div class="prd-footer__right">
        <button class="prd-btn prd-btn--outline prd-btn--lg" @click="ws.goStep(1)"><ArrowLeft :size="16" />上一步：商品采集</button>
        <button class="prd-btn prd-btn--primary prd-btn--lg" :disabled="!candidateIds.length" @click="ws.goStep(3)">下一步：确定商品<ArrowRight :size="16" /></button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.sa { display: flex; flex-direction: column; gap: 12px; }
.sa-main { display: flex; flex-direction: column; gap: 14px; }
.sa-filters { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.sa-filters label { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--theme-text-secondary); white-space: nowrap; }
.sa-filters label > span:first-child { font-weight: 600; }
.sa-filters .prd-select { min-width: 120px; }
.sa-source { font-size: 12px; color: var(--theme-text-secondary); }
.sa-money { display: block; }
.sa-range { display: inline-flex; align-items: center; gap: 6px; }
.sa-range .prd-input { width: 100px; }
.sa-range i { font-style: normal; color: var(--theme-text-muted); }
.sa-filters__q .prd-search .prd-input { width: 170px; }
.sa-filters__reset { margin-left: auto; }
.sa-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sa-checked { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--theme-text-secondary); }
.sa-checked b { color: var(--theme-accent); }
.sa-view { margin-left: auto; }
.sa-layout { display: grid; grid-template-columns: minmax(0, 1fr) 230px; gap: 12px; align-items: start; }
.sa-content { min-width: 0; }
.sa-rank { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; }
.sa-crown--1 { color: #f59e0b; } .sa-crown--2 { color: #cbd5e1; } .sa-crown--3 { color: #d97706; }
.sa-chip-hot { color: #fbbf24; border-color: color-mix(in srgb, #fbbf24 40%, transparent); gap: 3px; }
.sa-added { min-width: 88px; }
.sa-side { display: flex; flex-direction: column; gap: 10px; position: sticky; top: 0; }
.sa-side__card { padding: 12px; }
.sa-overview { display: grid; grid-template-columns: auto 1fr; gap: 8px 10px; margin: 10px 0 0; font-size: 12px; }
.sa-overview dt { color: var(--theme-text-muted); }
.sa-overview dd { margin: 0; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.sa-next { display: flex; flex-direction: column; gap: 8px; text-align: center; }
.sa-next small { font-size: 11px; color: var(--theme-text-muted); }
.sa-compare-tip { margin: 0 0 10px; font-size: 12px; color: var(--theme-text-muted); }
.sa-compare { display: grid; border: 1px solid var(--theme-border); border-radius: 10px; overflow: hidden; }
.sa-compare > div { padding: 10px 12px; border-bottom: 1px solid var(--theme-divider); border-left: 1px solid var(--theme-divider); font-size: 13px; font-variant-numeric: tabular-nums; min-width: 0; }
.sa-compare__label { color: var(--theme-text-muted); font-size: 12px !important; background: var(--theme-panel-soft); border-left: 0 !important; }
.sa-compare__head { display: flex; flex-direction: column; gap: 8px; }
.sa-compare .is-best { color: var(--theme-accent); font-weight: 800; background: color-mix(in srgb, var(--theme-accent) 7%, transparent); }
@media (max-width: 1200px) { .sa-layout { grid-template-columns: 1fr; } .sa-side { position: static; flex-direction: row; flex-wrap: wrap; } .sa-side__card { flex: 1; min-width: 200px; } }
</style>
