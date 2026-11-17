<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  ArrowLeft,
  BarChart3,
  Link2,
  Loader,
  RefreshCw,
  Repeat,
  Send,
  Trash2,
  Trophy,
  Unlink,
  X,
} from 'lucide-vue-next'
import type { MixCreativeOption, MixInsights, MixLedgerEntry, MixScoreRow } from '../../../../shared/mixInsights'

type Product = { id: string; name: string }

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const products = ref<Product[]>([])
const productId = ref('')
const entries = ref<MixLedgerEntry[]>([])
const insights = ref<MixInsights | null>(null)
const busy = ref('')
const notice = ref<{ tone: 'accent' | 'danger' | 'warning'; text: string } | null>(null)
const linkFor = ref<MixLedgerEntry | null>(null)
const creatives = ref<MixCreativeOption[]>([])
const creativeQuery = ref('')

const totals = computed(() => insights.value?.totals)
const productName = computed(() => new Map(products.value.map((p) => [p.id, p.name])))
const unpublished = computed(() => entries.value.filter((e) => !e.publishTaskIds?.length))
const filteredCreatives = computed(() => {
  const q = creativeQuery.value.trim().toLowerCase()
  return creatives.value.filter((c) => !q || c.name.toLowerCase().includes(q) || c.creativeId.includes(q))
})

function fileUrl(filePath?: string) {
  return filePath ? `vg://file?path=${encodeURIComponent(filePath)}` : ''
}
function pct(v?: number) {
  return v === undefined ? '—' : `${(v * 100).toFixed(1)}%`
}
function fixed(v?: number, d = 2) {
  return v === undefined ? '—' : v.toFixed(d)
}
function gradeClass(g?: string) {
  return g === 'S' ? '' : g === 'A' ? 'vg-pill--solid-blue' : g === 'B' ? 'vg-pill--solid-amber' : 'vg-pill--solid-red'
}
function shareLabel(row: MixScoreRow) {
  return row.measured ? `×${row.weight.toFixed(2)}` : t('production.mixInsights.noData')
}
function statusOf(e: MixLedgerEntry) {
  if (e.link) return e.link.method === 'manual' ? 'linkedManual' : 'linkedAuto'
  if (e.publishTaskIds?.length) return 'published'
  return 'rendered'
}
function shortStyle(s?: string) {
  return s ? s.replace(/\s*\(.*$/, '') : '—'
}
function flash(text: string, tone: 'accent' | 'danger' | 'warning' = 'accent') {
  notice.value = { tone, text }
}

async function load() {
  const pid = productId.value || undefined
  const [l, ins] = await Promise.all([window.api.mixStudio.ledger(pid), window.api.mixStudio.insights(pid)])
  entries.value = l
  insights.value = ins
}

async function run(key: string, fn: () => Promise<void>) {
  busy.value = key
  notice.value = null
  try {
    await fn()
  } catch (e: any) {
    flash(String(e?.message ?? e), 'danger')
  } finally {
    busy.value = ''
  }
}

function refresh() {
  return run('refresh', async () => {
    const r = await window.api.mixStudio.refreshPerformance()
    if (!r.gmvMaxAvailable || !r.creatives) {
      flash(r.message ? `${t('production.mixInsights.noGmvMax')} (${r.message})` : t('production.mixInsights.noGmvMax'), 'warning')
    } else {
      flash(t('production.mixInsights.refreshed', { creatives: r.creatives, linked: r.newlyLinked, updated: r.updated }))
    }
    await load()
  })
}

function publish(ids: string[]) {
  return run('publish', async () => {
    const r = await window.api.mixStudio.sendToPublish(ids)
    flash(t('production.mixInsights.published', { count: r.created }))
    await load()
  })
}

async function openLink(e: MixLedgerEntry) {
  linkFor.value = e
  creativeQuery.value = ''
  await run('creatives', async () => {
    creatives.value = await window.api.mixStudio.listCreatives()
  })
}

function link(creativeId: string | null, entry = linkFor.value) {
  if (!entry) return
  return run('link', async () => {
    await window.api.mixStudio.linkCreative({ entryId: entry.id, creativeId })
    linkFor.value = null
    await load()
  })
}

function remove(e: MixLedgerEntry) {
  if (!window.confirm(t('production.mixInsights.removeConfirm'))) return
  return run('remove', async () => {
    await window.api.mixStudio.removeLedgerEntry(e.id)
    await load()
  })
}

function remake(e: MixLedgerEntry) {
  void router.push({ path: '/production/mix', query: { productId: e.productId, winner: e.id } })
}

watch(productId, (id) => {
  void router.replace({ query: { ...route.query, productId: id || undefined } })
  void load()
})

onMounted(async () => {
  products.value = ((await window.api.products.list()) as Product[]) ?? []
  const wanted = String(route.query.productId || '')
  productId.value = products.value.some((p) => p.id === wanted) ? wanted : ''
  await load()
})
</script>

<template>
  <div class="vg-scope vg-page mi">
    <header class="vg-page-head">
      <button class="vg-icon-btn" type="button" :title="t('production.mixInsights.back')" @click="router.push({ path: '/production/mix', query: productId ? { productId } : {} })">
        <ArrowLeft :size="18" />
      </button>
      <div class="vg-page-head__text">
        <h1>{{ t('production.mixInsights.title') }}</h1>
        <p>{{ t('production.mixInsights.desc') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <select v-model="productId" class="vg-select mi__product" :aria-label="t('production.pool.product')">
          <option value="">{{ t('production.mixInsights.allProducts') }}</option>
          <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <button class="vg-btn vg-btn--primary" type="button" :disabled="busy !== ''" @click="refresh">
          <Loader v-if="busy === 'refresh'" :size="15" class="vg-spin" /><RefreshCw v-else :size="15" />
          {{ t('production.mixInsights.refresh') }}
        </button>
      </div>
    </header>

    <div v-if="notice" class="vg-notice" :class="`vg-notice--${notice.tone}`">{{ notice.text }}</div>

    <section class="vg-stats mi__stats">
      <div v-for="k in (['rendered', 'published', 'linked', 'measured', 'winners'] as const)" :key="k" class="vg-stat">
        <span class="vg-stat__icon" :class="{ 'vg-stat__icon--amber': k === 'winners', 'vg-stat__icon--blue': k === 'linked' }">
          <Trophy v-if="k === 'winners'" :size="17" /><Link2 v-else-if="k === 'linked'" :size="17" /><Send v-else-if="k === 'published'" :size="17" /><BarChart3 v-else :size="17" />
        </span>
        <span class="vg-stat__body">
          <span class="vg-stat__label">{{ t(`production.mixInsights.totals.${k}`) }}</span>
          <span class="vg-stat__value">{{ totals?.[k] ?? 0 }}</span>
        </span>
      </div>
    </section>

    <p class="vg-muted mi__how">{{ t('production.mixInsights.how') }}</p>

    <div class="mi__boards">
      <section v-for="board in (['formulas', 'hookStyles'] as const)" :key="board" class="vg-card">
        <div class="vg-card__head">
          <span class="vg-card__title"><Trophy :size="16" /> {{ t(`production.mixInsights.board.${board}`) }}</span>
        </div>
        <div v-if="insights?.[board]?.length" class="vg-table-wrap">
          <table class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th>{{ t('production.mixInsights.col.name') }}</th>
                <th>{{ t('production.mixInsights.col.measured') }}</th>
                <th>S / A</th>
                <th>CTR</th>
                <th>{{ t('production.mixInsights.col.score') }}</th>
                <th>{{ t('production.mixInsights.col.share') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in insights[board]" :key="row.key">
                <td class="mi__name" :title="row.label">{{ board === 'hookStyles' ? shortStyle(row.label) : row.label }}</td>
                <td class="vg-num">{{ row.measured }}/{{ row.rendered }}</td>
                <td class="vg-num">{{ row.sCount }} / {{ row.aCount }}</td>
                <td class="vg-num">{{ pct(row.avgCtr) }}</td>
                <td>
                  <span class="vg-progress mi__score"><span class="vg-progress__bar"><span class="vg-progress__fill" :style="{ width: `${Math.round(row.score * 100)}%` }" /></span></span>
                </td>
                <td class="vg-num" :class="{ 'mi__up': row.weight > 1.05, 'mi__down': row.weight < 0.95 && row.measured }">{{ shareLabel(row) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="vg-empty"><p>{{ t('production.mixInsights.emptyBoard') }}</p></div>
      </section>
    </div>

    <section v-if="insights?.hookClips?.length" class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><Trophy :size="16" /> {{ t('production.mixInsights.board.hookClips') }}</span>
      </div>
      <div class="mi__hooks">
        <figure v-for="row in insights.hookClips.slice(0, 12)" :key="row.key" class="mi-hook">
          <img v-if="row.thumbnailPath" :src="fileUrl(row.thumbnailPath)" alt="" loading="lazy" />
          <figcaption>
            <span class="vg-num" :class="{ 'mi__up': row.weight > 1.05, 'mi__down': row.weight < 0.95 }">{{ Math.round(row.score * 100) }}</span>
            <span class="vg-muted vg-num">{{ row.measured }}×</span>
          </figcaption>
        </figure>
      </div>
    </section>

    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><BarChart3 :size="16" /> {{ t('production.mixInsights.videos', { count: entries.length }) }}</span>
        <button v-if="unpublished.length" class="vg-btn vg-btn--sm" type="button" :disabled="busy !== ''" @click="publish(unpublished.map((e) => e.id))">
          <Send :size="14" /> {{ t('production.mixInsights.publishAll', { count: unpublished.length }) }}
        </button>
      </div>
      <div v-if="entries.length" class="vg-table-wrap">
        <table class="vg-table vg-table--compact">
          <thead>
            <tr>
              <th>{{ t('production.mixInsights.col.video') }}</th>
              <th>{{ t('production.mixInsights.col.status') }}</th>
              <th>{{ t('production.mixInsights.col.grade') }}</th>
              <th>ROI</th>
              <th>CTR</th>
              <th>CVR</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in entries" :key="e.id">
              <td>
                <div class="mi-video">
                  <img v-if="e.hookThumbnailPath" class="mi-video__thumb" :src="fileUrl(e.hookThumbnailPath)" alt="" loading="lazy" />
                  <div class="mi-video__text">
                    <strong class="vg-ellipsis" :title="e.title">{{ e.title || '—' }}</strong>
                    <small class="vg-muted vg-ellipsis">
                      {{ e.formulaName }} · {{ shortStyle(e.hookStyle) }}<template v-if="!productId"> · {{ productName.get(e.productId) ?? '' }}</template>
                    </small>
                    <small v-if="e.link" class="vg-muted vg-ellipsis" :title="e.link.creativeName">↳ {{ e.link.creativeName }}</small>
                  </div>
                </div>
              </td>
              <td>
                <span class="vg-pill vg-pill--dot" :class="e.link ? 'vg-pill--green' : e.publishTaskIds?.length ? 'vg-pill--blue' : ''">
                  {{ t(`production.mixInsights.status.${statusOf(e)}`) }}
                  <template v-if="e.link?.method === 'auto' && e.link.confidence">{{ Math.round(e.link.confidence * 100) }}%</template>
                </span>
              </td>
              <td>
                <span v-if="e.performance" class="vg-pill vg-pill--solid" :class="gradeClass(e.performance.grade)">{{ e.performance.grade }}</span>
                <span v-else class="vg-muted">—</span>
              </td>
              <td class="vg-num">{{ fixed(e.performance?.roi) }}</td>
              <td class="vg-num">{{ pct(e.performance?.ctr) }}</td>
              <td class="vg-num">{{ pct(e.performance?.cvr) }}</td>
              <td>
                <div class="vg-row mi__actions">
                  <button
                    v-if="e.performance && (e.performance.grade === 'S' || e.performance.grade === 'A')"
                    class="vg-btn vg-btn--xs vg-btn--primary"
                    type="button"
                    @click="remake(e)"
                  >
                    <Repeat :size="13" /> {{ t('production.mixInsights.remake') }}
                  </button>
                  <button v-if="!e.publishTaskIds?.length" class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('production.mixInsights.publish')" :disabled="busy !== ''" @click="publish([e.id])">
                    <Send :size="14" />
                  </button>
                  <button v-if="e.link" class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('production.mixInsights.unlink')" @click="link(null, e)">
                    <Unlink :size="14" />
                  </button>
                  <button v-else class="vg-icon-btn vg-icon-btn--sm" type="button" :title="t('production.mixInsights.link')" @click="openLink(e)">
                    <Link2 :size="14" />
                  </button>
                  <button class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" type="button" :title="t('production.mixInsights.remove')" @click="remove(e)">
                    <Trash2 :size="14" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="vg-empty">
        <span class="vg-empty__icon"><BarChart3 :size="24" /></span>
        <p>{{ t('production.mixInsights.empty') }}</p>
      </div>
    </section>

    <div v-if="linkFor" class="vg-backdrop" @click.self="linkFor = null">
      <div class="vg-dialog vg-dialog--wide" role="dialog" aria-modal="true">
        <div class="vg-dialog__head">
          <span class="vg-dialog__title">{{ t('production.mixInsights.linkTitle') }}</span>
          <button class="vg-icon-btn" type="button" :aria-label="t('production.pool.close')" @click="linkFor = null"><X :size="16" /></button>
        </div>
        <div class="vg-dialog__body mi__dialog">
          <p class="vg-muted">{{ linkFor.title }} · {{ linkFor.durationSec?.toFixed(1) }}s</p>
          <input v-model="creativeQuery" class="vg-input" :placeholder="t('production.mixInsights.searchCreative')" />
          <div v-if="busy === 'creatives'" class="vg-row"><Loader :size="15" class="vg-spin" /></div>
          <div v-else-if="filteredCreatives.length" class="vg-list mi__creatives">
            <button
              v-for="c in filteredCreatives"
              :key="c.creativeId"
              class="vg-list__item vg-list__item--button"
              type="button"
              :disabled="busy !== ''"
              @click="link(c.creativeId)"
            >
              <span class="vg-pill vg-pill--solid" :class="gradeClass(c.grade)">{{ c.grade }}</span>
              <span class="vg-list__main">
                <span class="vg-list__title vg-ellipsis">{{ c.name }}</span>
                <span class="vg-list__sub vg-num">
                  {{ c.creativeId }}<template v-if="c.durationSeconds"> · {{ c.durationSeconds.toFixed(1) }}s</template>
                  <template v-if="c.linkedTo"> · {{ t('production.mixInsights.alreadyLinked') }}</template>
                </span>
              </span>
            </button>
          </div>
          <div v-else class="vg-empty"><p>{{ t('production.mixInsights.noCreatives') }}</p></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mi { width: min(1408px, 100%); margin: 0 auto; }
.mi__product { min-width: 200px; }
.mi__stats { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.mi__how { margin: 0; font-size: 12px; }
.mi__boards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
.mi__name { max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mi__score { min-width: 90px; }
.mi__up { color: var(--vg-green); font-weight: 600; }
.mi__down { color: var(--vg-red); }
.mi__hooks { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 10px; }
.mi-hook { margin: 0; }
.mi-hook img { width: 100%; aspect-ratio: 9 / 16; object-fit: cover; border-radius: 8px; border: 1px solid var(--theme-border); display: block; }
.mi-hook figcaption { display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px; }
.mi-video { display: flex; align-items: center; gap: 10px; min-width: 0; max-width: 440px; }
.mi-video__thumb { width: 36px; height: 64px; object-fit: cover; border-radius: 6px; border: 1px solid var(--theme-border); flex-shrink: 0; }
.mi-video__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mi-video__text strong { font-size: 13px; }
.mi-video__text small { font-size: 11px; }
.mi__actions { justify-content: flex-end; flex-wrap: nowrap; gap: 4px; }
.mi__dialog { display: flex; flex-direction: column; gap: 10px; }
.mi__creatives { max-height: 52vh; overflow: auto; }
@media (max-width: 1100px) {
  .mi__boards { grid-template-columns: 1fr; }
  .mi__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
