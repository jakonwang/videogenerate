<script setup lang="ts">
import { CalendarRange, Cookie, ExternalLink, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Save, ShieldCheck, Store, Trash2 } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CreatorHubSettings, CreatorHubShop, CreatorHubSyncProgress } from '../../../../../shared/creatorHub'
import { formatDateTime } from './creatorHubFormat'

const props = defineProps<{ shops: CreatorHubShop[]; progress: Record<string, CreatorHubSyncProgress | null>; busy: Record<string, string>; settings: CreatorHubSettings; savingSettings: boolean }>()
const emit = defineEmits<{
  add: []
  sync: [shop: CreatorHubShop]
  verify: [shop: CreatorHubShop]
  open: [shop: CreatorHubShop]
  updateCookie: [shop: CreatorHubShop]
  rename: [shop: CreatorHubShop]
  remove: [shop: CreatorHubShop]
  saveSettings: [settings: Partial<CreatorHubSettings>]
}>()
const { t } = useI18n()
const menuFor = ref('')
const range = reactive({ analyticsWindowDays: 28, orderWindowDays: 30 })
watch(() => props.settings, (value) => { range.analyticsWindowDays = value.analyticsWindowDays; range.orderWindowDays = value.orderWindowDays }, { immediate: true })
const rangeDirty = computed(() => range.analyticsWindowDays !== props.settings.analyticsWindowDays || range.orderWindowDays !== props.settings.orderWindowDays)

function loginTone(state: CreatorHubShop['loginState']) {
  return state === 'valid' ? 'vg-pill--green' : state === 'expired' ? 'vg-pill--red' : 'vg-pill--amber'
}
function act(kind: 'rename' | 'remove' | 'updateCookie', shop: CreatorHubShop) {
  menuFor.value = ''
  if (kind === 'rename') emit('rename', shop)
  else if (kind === 'remove') emit('remove', shop)
  else emit('updateCookie', shop)
}
</script>

<template>
  <section class="vg-card vg-card--flush" data-testid="creator-hub-shops">
    <div class="vg-card__head">
      <span class="vg-card__title"><Store :size="16" />{{ t('creatorHub.shops.title') }}<small>{{ t('creatorHub.shops.count', { count: shops.length }) }}</small></span>
      <div class="vg-card__actions">
        <button class="vg-btn vg-btn--primary vg-btn--sm" data-testid="creator-hub-add-shop" @click="emit('add')"><Plus :size="14" />{{ t('creatorHub.shops.add') }}</button>
      </div>
    </div>
    <div v-if="!shops.length" class="vg-empty">
      <span class="vg-empty__icon"><Cookie :size="26" /></span>
      <h3>{{ t('creatorHub.shops.emptyTitle') }}</h3>
      <p>{{ t('creatorHub.shops.emptyDesc') }}</p>
      <button class="vg-btn vg-btn--primary" @click="emit('add')"><Plus :size="14" />{{ t('creatorHub.shops.add') }}</button>
    </div>
    <div v-else class="ch-table-scroll">
      <table class="vg-table">
        <thead>
          <tr>
            <th>{{ t('creatorHub.shops.colShop') }}</th>
            <th>{{ t('creatorHub.shops.colRegion') }}</th>
            <th>{{ t('creatorHub.shops.colLogin') }}</th>
            <th>{{ t('creatorHub.shops.colCookie') }}</th>
            <th>{{ t('creatorHub.shops.colSync') }}</th>
            <th>{{ t('creatorHub.shops.colActions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="shop in shops" :key="shop.id">
            <td>
              <div class="vg-list__main">
                <span class="vg-list__title">{{ shop.name }}</span>
                <span class="vg-list__sub vg-num">ID {{ shop.shopId || '-' }}<template v-if="shop.sellerName"> · {{ shop.sellerName }}</template></span>
              </div>
            </td>
            <td>{{ shop.region }}</td>
            <td><span class="vg-pill vg-pill--dot" :class="loginTone(shop.loginState)">{{ t(`creatorHub.login.${shop.loginState}`) }}</span></td>
            <td class="vg-muted">
              <div>{{ t('creatorHub.shops.importedAt', { time: formatDateTime(shop.cookieImportedAt) }) }}</div>
              <div v-if="shop.cookieExpiresAt">{{ t('creatorHub.shops.expiresAt', { time: formatDateTime(shop.cookieExpiresAt) }) }}</div>
            </td>
            <td>
              <div v-if="progress[shop.id]?.status === 'running'" class="ch-sync-cell">
                <span class="vg-muted">{{ progress[shop.id]?.stage ? t(`creatorHub.sync.stage.${progress[shop.id]?.stage}`) : t('creatorHub.shops.syncing') }}</span>
              <div class="vg-progress" :title="t('creatorHub.shops.syncing')">
                <div class="vg-progress__bar"><div class="vg-progress__fill" :style="{ width: `${progress[shop.id]?.total ? Math.min(100, Math.round(((progress[shop.id]?.rows || 0) / (progress[shop.id]?.total || 1)) * 100)) : 5}%` }" /></div>
                <span>{{ progress[shop.id]?.rows || 0 }}</span>
              </div>
              </div>
              <template v-else>
                <div class="vg-muted">{{ formatDateTime(shop.lastSyncAt) }}</div>
                <div v-if="shop.lastSyncError" class="ch-error-line" :title="shop.lastSyncError">{{ t('creatorHub.shops.syncFailed') }}</div>
              </template>
            </td>
            <td>
              <div class="vg-row ch-nowrap">
                <button class="vg-btn vg-btn--xs vg-btn--soft" :disabled="Boolean(busy[shop.id]) || progress[shop.id]?.status === 'running'" data-testid="creator-hub-sync" @click="emit('sync', shop)">
                  <Loader2 v-if="busy[shop.id] === 'sync' || progress[shop.id]?.status === 'running'" :size="12" class="vg-spin" /><RefreshCw v-else :size="12" />{{ t('creatorHub.shops.sync') }}
                </button>
                <button class="vg-icon-btn" :title="t('creatorHub.shops.verify')" :disabled="Boolean(busy[shop.id])" @click="emit('verify', shop)">
                  <Loader2 v-if="busy[shop.id] === 'verify'" :size="15" class="vg-spin" /><ShieldCheck v-else :size="15" />
                </button>
                <button class="vg-icon-btn" :title="t('creatorHub.shops.openBackend')" @click="emit('open', shop)"><ExternalLink :size="15" /></button>
                <div class="vg-menu-wrap" @click.stop>
                  <button class="vg-icon-btn" :title="t('creatorHub.actions.more')" @click="menuFor = menuFor === shop.id ? '' : shop.id"><MoreHorizontal :size="15" /></button>
                  <div v-if="menuFor === shop.id" class="vg-menu">
                    <button @click="act('updateCookie', shop)"><Cookie :size="13" />{{ t('creatorHub.shops.updateCookie') }}</button>
                    <button @click="act('rename', shop)"><Pencil :size="13" />{{ t('creatorHub.shops.rename') }}</button>
                    <button class="danger" @click="act('remove', shop)"><Trash2 :size="13" />{{ t('creatorHub.shops.remove') }}</button>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <section class="vg-card ch-range-card">
    <div class="vg-card__head"><span class="vg-card__title"><CalendarRange :size="16" />{{ t('creatorHub.sync.rangeTitle') }}</span></div>
    <div class="ch-rule">
      <p class="vg-muted ch-rule__text">{{ t('creatorHub.sync.rangeHint') }}</p>
      <div class="vg-row">
        <label class="vg-field ch-num-field"><span class="vg-field__label">{{ t('creatorHub.sync.analyticsDays') }}</span><input v-model.number="range.analyticsWindowDays" class="vg-input vg-input--sm" type="number" min="1" max="90" /></label>
        <label class="vg-field ch-num-field"><span class="vg-field__label">{{ t('creatorHub.sync.orderDays') }}</span><input v-model.number="range.orderWindowDays" class="vg-input vg-input--sm" type="number" min="1" max="90" /></label>
        <button class="vg-btn vg-btn--sm ch-rule__save" :disabled="!rangeDirty || savingSettings" @click="emit('saveSettings', { analyticsWindowDays: Number(range.analyticsWindowDays), orderWindowDays: Number(range.orderWindowDays) })"><Save :size="13" />{{ t('creatorHub.actions.save') }}</button>
      </div>
    </div>
  </section>
</template>
