<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Contact, ExternalLink, MessageCircle, Package, RefreshCw, Star, UserSearch, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { CreatorHubContactStatus, CreatorHubCreatorDetail } from '../../../../../shared/creatorHub'
import { CREATOR_HUB_CONTACT_STATUSES } from '../../../../../shared/creatorHub'
import { normalizeVnPhone } from '../../../../../shared/creatorHubContacts'
import { POOL_WEIGHTS } from '../../../../../shared/creatorHubDiscovery'
import { formatCount, formatDate, formatDateTime, formatMoney, formatPercent, rateTone, stageTone, type CreatorDetailTarget, type DetailSavePayload } from './creatorHubFormat'

const props = defineProps<{ target: CreatorDetailTarget | null; detail: CreatorHubCreatorDetail | null; loading: boolean; busy: boolean; knownTags: string[]; shopName?: string }>()
const emit = defineEmits<{ close: []; save: [payload: DetailSavePayload]; star: [id: string, starred: boolean]; zalo: []; openBackend: [] }>()
const { t } = useI18n()

const tagsText = ref('')
const note = ref('')
const blocked = ref(false)
const contactForm = ref({ zalo: '', phone: '', email: '', status: 'none' as CreatorHubContactStatus })
const contact = computed(() => props.detail?.contact)

const pool = computed(() => props.detail?.pool)
const crm = computed(() => props.detail?.crm)
const tier = computed(() => pool.value?.tier || crm.value?.tier)
const score = computed(() => pool.value?.score ?? crm.value?.score)

watch(() => props.detail, (detail) => {
  if (!detail) return
  tagsText.value = (detail.pool?.tags || detail.crm?.tags || []).join(', ')
  note.value = detail.pool?.note ?? detail.crm?.note ?? ''
  blocked.value = detail.pool?.blocked ?? detail.crm?.blocked ?? false
  contactForm.value = { zalo: detail.contact?.zalo || '', phone: detail.contact?.phone || '', email: detail.contact?.email || '', status: detail.contact?.status || 'none' }
}, { immediate: true })

const platformStats = computed(() => {
  const row = pool.value
  if (!row) return []
  return [
    { key: 'followers', label: t('creatorHub.discover.colFollowers'), value: formatCount(row.followers) },
    { key: 'gmv', label: 'GMV', value: row.gmv != null ? formatMoney(row.gmv) : row.gmvRange || '-' },
    { key: 'units', label: t('creatorHub.discover.colUnits'), value: formatCount(row.unitsSold) },
    { key: 'views', label: t('creatorHub.discover.colViews'), value: `${formatCount(row.avgViews)} / ${formatCount(row.medianViews)}` },
    { key: 'engagement', label: t('creatorHub.discover.colEngagement'), value: formatPercent(row.engagementRate, 2) },
    { key: 'split', label: t('creatorHub.detail.videoLiveGmv'), value: `${row.videoGmv != null ? formatMoney(row.videoGmv) : '-'} / ${row.liveGmv != null ? formatMoney(row.liveGmv) : '-'}` },
    { key: 'gpm', label: t('creatorHub.detail.videoGpm'), value: row.videoGpmMax ? `${formatMoney(row.videoGpmMin || 0)} - ${formatMoney(row.videoGpmMax)}` : '-' },
    { key: 'live', label: t('creatorHub.detail.liveViewers'), value: formatCount(row.liveAvgViewers) },
  ]
})
const parts = computed(() => {
  const row = pool.value
  if (!row) return []
  return (['sales', 'content', 'account', 'history'] as const).map((key) => ({ key, label: t(`creatorHub.detail.part.${key}`), value: row.parts[key], max: POOL_WEIGHTS[key] }))
})
const historyStats = computed(() => {
  const detail = props.detail
  if (!detail) return []
  const row = crm.value
  return [
    { key: 'samples', label: t('creatorHub.fulfillment.colShipped'), value: String(row?.samplesShipped ?? pool.value?.ourSamples ?? 0) },
    { key: 'rate', label: t('creatorHub.fulfillment.colRate'), value: formatPercent(row?.fulfillmentRate ?? pool.value?.ourFulfillmentRate), tone: rateTone(row?.fulfillmentRate ?? pool.value?.ourFulfillmentRate) },
    { key: 'gmv', label: t('creatorHub.overview.gmv'), value: formatMoney(row?.gmv || 0) },
    { key: 'orders', label: t('creatorHub.detail.orders'), value: `${detail.orders.count} / ${formatMoney(detail.orders.amount)}` },
    { key: 'commission', label: t('creatorHub.overview.commission'), value: formatMoney(detail.orders.commission) },
    { key: 'roi', label: t('creatorHub.crm.colRoi'), value: row?.sampleRoi != null ? `${row.sampleRoi.toFixed(1)}x` : '-' },
  ]
})

function openProfile() {
  const handle = props.target?.handle
  if (handle) void window.api.shell.openExternal(`https://www.tiktok.com/@${encodeURIComponent(handle)}`)
}
function openVideo(itemId: string) {
  const handle = props.target?.handle
  if (handle && itemId) void window.api.shell.openExternal(`https://www.tiktok.com/@${encodeURIComponent(handle)}/video/${encodeURIComponent(itemId)}`)
}
function addTag(tag: string) {
  const tags = tagsText.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean)
  if (!tags.includes(tag)) tags.push(tag)
  tagsText.value = tags.join(', ')
}
function save() {
  emit('save', { tags: tagsText.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean), note: note.value, blocked: blocked.value, contact: { ...contactForm.value } })
}
const hasMarketId = computed(() => /^\d+$/.test(props.target?.creatorId || ''))
const zaloReady = computed(() => Boolean(normalizeVnPhone(contactForm.value.zalo) || normalizeVnPhone(contactForm.value.phone)))
</script>

<template>
  <Teleport to="body">
    <div v-if="target" class="vg-scope vg-backdrop" @click.self="!busy && emit('close')">
      <div class="vg-dialog vg-dialog--xl ch-detail" role="dialog" aria-modal="true" data-testid="creator-hub-detail-dialog">
        <div class="vg-dialog__head">
          <div class="vg-dialog__title">
            <img v-if="target.avatar" class="vg-avatar ch-detail__avatar" :src="target.avatar" alt="" referrerpolicy="no-referrer" />
            <span v-else class="vg-avatar ch-detail__avatar">{{ (target.nickname || target.handle || '?').slice(0, 1) }}</span>
            <div>
              <h2>{{ target.nickname || target.handle }}</h2>
              <p>
                @{{ target.handle }}<template v-if="pool?.level"> · Lv.{{ pool.level }}</template><template v-if="shopName"> · {{ shopName }}</template>
              </p>
              <div class="vg-row ch-detail__badges">
                <span v-if="tier" class="vg-pill" :class="tier === 'A' ? 'vg-pill--green' : tier === 'B' ? 'vg-pill--blue' : tier === 'C' ? 'vg-pill--amber' : 'vg-pill--red'">{{ tier }} · {{ score }}</span>
                <span v-for="name in pool?.categories || []" :key="name" class="vg-chip">{{ name }}</span>
                <span v-if="pool?.invitedIn90d" class="vg-pill vg-pill--amber">{{ t('creatorHub.discover.invited') }}</span>
                <span v-if="pool?.collaborated" class="vg-pill vg-pill--blue">{{ t('creatorHub.discover.collaborated') }}</span>
              </div>
            </div>
          </div>
          <div class="vg-row">
            <button v-if="pool" class="vg-btn vg-btn--sm" :class="pool.starred ? 'vg-btn--soft' : 'vg-btn--outline'" @click="emit('star', pool.id, !pool.starred)"><Star :size="13" />{{ pool.starred ? t('creatorHub.discover.unstar') : t('creatorHub.discover.star') }}</button>
            <button class="vg-btn vg-btn--sm vg-btn--outline" @click="openProfile"><ExternalLink :size="13" />{{ t('creatorHub.detail.openProfile') }}</button>
            <button class="vg-icon-btn" :disabled="busy" :aria-label="t('creatorHub.actions.close')" @click="emit('close')"><X :size="16" /></button>
          </div>
        </div>

        <div class="vg-dialog__body">
          <div v-if="loading && !detail" class="vg-empty"><RefreshCw :size="20" class="vg-spin" /></div>
          <template v-else-if="detail">
            <section v-if="pool" class="ch-detail__section">
              <h3 class="ch-detail__title"><UserSearch :size="15" />{{ t('creatorHub.detail.platformTitle') }}<small class="vg-muted">{{ t('creatorHub.detail.seenAt', { time: formatDate(pool.lastSeenAt) }) }}</small></h3>
              <div class="vg-stats ch-detail__stats">
                <div v-for="item in platformStats" :key="item.key" class="vg-stat"><div class="vg-stat__body"><span class="vg-stat__label">{{ item.label }}</span><span class="vg-stat__value ch-detail__value">{{ item.value }}</span></div></div>
              </div>
              <div class="ch-detail__grid">
                <div>
                  <h4 class="ch-detail__subtitle">{{ t('creatorHub.detail.scoreTitle') }}</h4>
                  <div class="ch-funnel">
                    <div v-for="item in parts" :key="item.key" class="ch-funnel__row">
                      <span class="ch-funnel__label">{{ item.label }}</span>
                      <div class="ch-funnel__track"><div class="ch-funnel__bar" :style="{ width: `${Math.max(3, (item.value / item.max) * 100)}%` }" /></div>
                      <span class="ch-funnel__value vg-num">{{ item.value }}</span>
                      <span class="ch-funnel__rate vg-muted vg-num">/ {{ item.max }}</span>
                    </div>
                  </div>
                  <dl class="vg-kv ch-detail__kv">
                    <dt>{{ t('creatorHub.detail.audience') }}</dt>
                    <dd>{{ pool.topGender ? `${pool.topGender.key} ${pool.topGender.share != null ? formatPercent(pool.topGender.share, 0) : ''}` : '-' }}<template v-if="pool.topAges.length"> · {{ pool.topAges.join(', ') }}</template></dd>
                    <dt>{{ t('creatorHub.detail.platformRate') }}</dt>
                    <dd>{{ formatPercent(pool.platformFulfillmentRate) }}</dd>
                    <dt>{{ t('creatorHub.detail.sources') }}</dt>
                    <dd><span v-for="source in pool.sources" :key="source" class="vg-chip ch-detail__source">{{ source }}</span></dd>
                  </dl>
                </div>
                <div>
                  <h4 class="ch-detail__subtitle">{{ t('creatorHub.detail.topVideos') }}</h4>
                  <div v-if="pool.topVideos.length" class="vg-list">
                    <button v-for="video in pool.topVideos" :key="video.itemId" class="vg-list__item vg-list__item--button" @click="openVideo(video.itemId)">
                      <div class="vg-list__main">
                        <span class="vg-list__title">{{ video.title || video.itemId }}</span>
                        <span class="vg-list__sub">{{ t('creatorHub.detail.videoStats', { plays: formatCount(video.plays), likes: formatCount(video.likes) }) }}<template v-if="video.products.length"> · {{ video.products.join(', ') }}</template></span>
                      </div>
                      <ExternalLink :size="13" class="vg-muted" />
                    </button>
                  </div>
                  <p v-else class="vg-muted ch-small">{{ t('creatorHub.detail.noVideos') }}</p>
                </div>
              </div>
            </section>

            <section class="ch-detail__section">
              <h3 class="ch-detail__title"><Package :size="15" />{{ t('creatorHub.detail.historyTitle') }}</h3>
              <div class="vg-stats ch-detail__stats">
                <div v-for="item in historyStats" :key="item.key" class="vg-stat"><div class="vg-stat__body"><span class="vg-stat__label">{{ item.label }}</span><span class="vg-stat__value ch-detail__value" :class="item.tone && `ch-tone-${item.tone}`">{{ item.value }}</span></div></div>
              </div>
              <p v-if="!detail.samples.length && !detail.videos.length && !detail.orders.count" class="vg-muted ch-small">{{ t('creatorHub.detail.noHistory') }}</p>
              <div v-else class="ch-detail__grid">
                <div class="vg-table-wrap ch-detail__table">
                  <table class="vg-table vg-table--compact">
                    <thead><tr><th>{{ t('creatorHub.samples.colProduct') }}</th><th>{{ t('creatorHub.samples.colStage') }}</th><th>{{ t('creatorHub.samples.colApplied') }}</th></tr></thead>
                    <tbody>
                      <tr v-for="sample in detail.samples.slice(0, 20)" :key="sample.id">
                        <td><span class="vg-ellipsis ch-detail__cell" :title="sample.productTitle">{{ sample.productTitle || sample.productId }}</span></td>
                        <td><span class="vg-pill" :class="stageTone(sample.stage) && `vg-pill--${stageTone(sample.stage)}`">{{ t(`creatorHub.stage.${sample.stage}`) }}</span></td>
                        <td class="vg-muted ch-nowrap">{{ formatDate(sample.createdAt) }}</td>
                      </tr>
                      <tr v-if="!detail.samples.length"><td colspan="3" class="vg-table__empty">{{ t('creatorHub.detail.noSamples') }}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div class="vg-table-wrap ch-detail__table">
                  <table class="vg-table vg-table--compact">
                    <thead><tr><th>{{ t('creatorHub.videos.colVideo') }}</th><th class="num">GMV</th><th class="num">{{ t('creatorHub.videos.colViews') }}</th></tr></thead>
                    <tbody>
                      <tr v-for="video in detail.videos.slice(0, 20)" :key="video.id">
                        <td><button class="vg-link ch-detail__cell vg-ellipsis" :title="video.title" @click="openVideo(video.itemId)">{{ video.title || video.itemId }}</button></td>
                        <td class="num">{{ formatMoney(video.gmv) }}</td>
                        <td class="num">{{ formatCount(video.views) }}</td>
                      </tr>
                      <tr v-if="!detail.videos.length"><td colspan="3" class="vg-table__empty">{{ t('creatorHub.detail.noShopVideos') }}</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section class="ch-detail__section ch-detail__section--contact" data-testid="creator-hub-detail-contact">
              <h3 class="ch-detail__title"><Contact :size="15" />{{ t('creatorHub.contact.title') }}</h3>
              <div class="vg-row">
                <button class="vg-btn vg-btn--sm vg-btn--primary" :disabled="!zaloReady" data-testid="creator-hub-detail-zalo" @click="emit('zalo')"><MessageCircle :size="13" />{{ t('creatorHub.contact.zaloAction') }}</button>
                <button class="vg-btn vg-btn--sm vg-btn--outline" :disabled="!hasMarketId" @click="emit('openBackend')"><ExternalLink :size="13" />{{ t('creatorHub.contact.openBackend') }}</button>
                <span v-if="contact?.contactInfoAvailable" class="vg-pill vg-pill--blue">{{ t('creatorHub.contact.onBackend') }}</span>
              </div>
              <div class="vg-form-grid ch-contact-grid">
                <div class="vg-field">
                  <label for="ch-contact-zalo">Zalo</label>
                  <input id="ch-contact-zalo" v-model="contactForm.zalo" class="vg-input" inputmode="tel" :placeholder="t('creatorHub.zalo.numberPlaceholder')" />
                </div>
                <div class="vg-field">
                  <label for="ch-contact-phone">{{ t('creatorHub.contact.phone') }}</label>
                  <input id="ch-contact-phone" v-model="contactForm.phone" class="vg-input" inputmode="tel" />
                </div>
                <div class="vg-field">
                  <label for="ch-contact-email">Email</label>
                  <input id="ch-contact-email" v-model="contactForm.email" class="vg-input" type="email" />
                </div>
                <div class="vg-field">
                  <label for="ch-contact-status">{{ t('creatorHub.contact.statusLabel') }}</label>
                  <select id="ch-contact-status" v-model="contactForm.status" class="vg-select">
                    <option v-for="status in CREATOR_HUB_CONTACT_STATUSES" :key="status" :value="status">{{ t(`creatorHub.contact.status.${status}`) }}</option>
                  </select>
                </div>
              </div>
              <p class="vg-muted ch-small">{{ contact?.bioFetchedAt ? t('creatorHub.contact.bio', { bio: contact.bio || '-' }) : t('creatorHub.contact.bioNotFetched') }}</p>
              <div v-if="contact?.log.length" class="vg-list ch-contact-log">
                <div v-for="(entry, index) in contact.log.slice(0, 5)" :key="index" class="vg-list__item">
                  <span class="vg-chip">{{ entry.channel }}</span>
                  <span class="vg-list__main"><span class="vg-list__sub">{{ formatDateTime(entry.at) }}<template v-if="entry.note"> · {{ entry.note }}</template></span></span>
                </div>
              </div>
            </section>

            <section class="ch-detail__section">
              <h3 class="ch-detail__title">{{ t('creatorHub.detail.profileTitle') }}</h3>
              <div class="vg-form-grid">
                <div class="vg-field">
                  <label for="ch-detail-tags">{{ t('creatorHub.crm.tags') }}</label>
                  <input id="ch-detail-tags" v-model="tagsText" class="vg-input" :placeholder="t('creatorHub.crm.tagsPlaceholder')" />
                  <div v-if="knownTags.length" class="vg-row">
                    <button v-for="tag in knownTags" :key="tag" class="vg-chip ch-chip-btn" type="button" @click="addTag(tag)">+ {{ tag }}</button>
                  </div>
                </div>
                <div class="vg-field">
                  <label for="ch-detail-note">{{ t('creatorHub.crm.note') }}</label>
                  <textarea id="ch-detail-note" v-model="note" class="vg-textarea" rows="3" maxlength="500" :placeholder="t('creatorHub.crm.notePlaceholder')" />
                </div>
              </div>
              <label class="vg-switch" :class="{ 'is-on': blocked }" @click.prevent="blocked = !blocked">
                <span class="vg-switch__track" />{{ t('creatorHub.crm.blocked') }}<small>{{ t('creatorHub.crm.blockedHint') }}</small>
              </label>
            </section>
          </template>
        </div>

        <div class="vg-dialog__foot">
          <div class="vg-dialog__foot-actions">
            <button class="vg-btn vg-btn--outline" :disabled="busy" @click="emit('close')">{{ t('creatorHub.actions.close') }}</button>
            <button class="vg-btn vg-btn--primary" :disabled="busy || !detail" data-testid="creator-hub-detail-save" @click="save">{{ t('creatorHub.actions.save') }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
