<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { AlertTriangle, Boxes, Building2, ChevronRight, Cookie, ExternalLink, Loader2, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-vue-next'
import type { CreatorHubShop } from '../../../../../shared/creatorHub'
import type { SiShop } from '../../../../../shared/sellerInventory'
import ChCookieDialog from '../creator-hub/ChCookieDialog.vue'
import ChActionDialog from '../creator-hub/ChActionDialog.vue'
import { creatorHubError } from '../creator-hub/creatorHubFormat'

/**
 * 店铺 → 账号: one place for every TikTok Shop login. The same stored login is used by 达人管理 (affiliate
 * center) and 销售与库存 (seller center).
 */
const { t, locale } = useI18n()
const router = useRouter()
const shops = ref<CreatorHubShop[]>([])
const salesState = ref<Record<string, SiShop['state']>>({})
const loading = ref(false)
const busyId = ref('')
const notice = ref('')
const errorText = ref('')
const cookieDialog = ref<{ open: boolean; shop: CreatorHubShop | null }>({ open: false, shop: null })
const action = ref<{ kind: 'rename' | 'remove'; shop: CreatorHubShop } | null>(null)
const actionBusy = ref(false)

const expiredCount = computed(() => shops.value.filter((shop) => shop.loginState === 'expired').length)

function fmtTime(ms?: number) {
  if (!ms) return '—'
  return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
}

function loginTone(state: CreatorHubShop['loginState']) {
  return state === 'valid' ? 'vg-pill--green' : state === 'expired' ? 'vg-pill--red' : ''
}

function flash(text: string) {
  notice.value = text
  setTimeout(() => { if (notice.value === text) notice.value = '' }, 3000)
}

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const [list, sales] = await Promise.all([
      window.api.tiktokCreatorHub.listShops(),
      window.api.sellerInventory.listShops().catch(() => [] as SiShop[]),
    ])
    shops.value = list
    salesState.value = Object.fromEntries(sales.map((shop) => [shop.shopKey, shop.state]))
  } catch (error) {
    errorText.value = creatorHubError(error, t)
  } finally {
    loading.value = false
  }
}

async function run(shop: CreatorHubShop, task: () => Promise<unknown>) {
  busyId.value = shop.id
  errorText.value = ''
  try {
    await task()
  } catch (error) {
    errorText.value = creatorHubError(error, t)
  } finally {
    busyId.value = ''
  }
}

function verify(shop: CreatorHubShop) {
  return run(shop, async () => {
    const result = await window.api.tiktokCreatorHub.verifyShop(shop.id)
    flash(result.loginState === 'valid' ? t('shops.verifyOk', { name: shop.name }) : t('shops.verifyExpired', { name: shop.name }))
    await load()
  })
}

function openSeller(shop: CreatorHubShop) {
  return run(shop, () => window.api.sellerInventory.openSellerCenter(shop.id))
}

function openAffiliate(shop: CreatorHubShop) {
  return run(shop, () => window.api.tiktokCreatorHub.openBackend({ id: shop.id }))
}

async function onImported(payload: { shop: CreatorHubShop; merged: boolean }) {
  const updating = Boolean(cookieDialog.value.shop)
  cookieDialog.value = { open: false, shop: null }
  flash(updating || payload.merged ? t('shops.updated', { name: payload.shop.name }) : t('shops.added', { name: payload.shop.name }))
  await load()
}

async function confirmAction(value: string) {
  const current = action.value
  if (!current) return
  actionBusy.value = true
  try {
    if (current.kind === 'rename') await window.api.tiktokCreatorHub.renameShop({ id: current.shop.id, name: value })
    else await window.api.tiktokCreatorHub.removeShop(current.shop.id)
    action.value = null
    await load()
  } catch (error) {
    errorText.value = creatorHubError(error, t)
  } finally {
    actionBusy.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="shops-page" data-testid="shops-accounts">
    <div class="shops-acc-head">
      <p class="vg-muted shops-foot">{{ t('shops.subtitle') }}</p>
      <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" data-testid="shops-add" @click="cookieDialog = { open: true, shop: null }"><Plus :size="14" />{{ t('shops.add') }}</button>
    </div>

    <div v-if="expiredCount" class="vg-notice vg-notice--warning"><AlertTriangle :size="16" /><span>{{ t('shops.expiredNotice', { n: expiredCount }) }}</span></div>
    <div v-if="errorText" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ errorText }}</span></div>
    <div v-if="notice" class="vg-notice vg-notice--accent"><ShieldCheck :size="16" /><span>{{ notice }}</span></div>

    <section v-if="loading && !shops.length" class="vg-empty"><Loader2 :size="22" class="vg-spin" /></section>
    <section v-else-if="!shops.length" class="vg-card vg-empty shops-empty">
      <span class="vg-empty__icon"><Building2 :size="26" /></span>
      <h3>{{ t('shops.emptyTitle') }}</h3>
      <p>{{ t('shops.emptyDesc') }}</p>
      <button type="button" class="vg-btn vg-btn--primary" @click="cookieDialog = { open: true, shop: null }"><Plus :size="15" />{{ t('shops.add') }}</button>
    </section>

    <section v-else class="shops-grid">
      <article v-for="shop in shops" :key="shop.id" class="vg-card shops-card" :data-testid="`shop-card-${shop.id}`">
        <header class="shops-card__head">
          <span class="shops-card__avatar">{{ (shop.name || '?').slice(0, 1).toUpperCase() }}</span>
          <div class="shops-card__title">
            <strong class="vg-ellipsis" :title="shop.name">{{ shop.name }}</strong>
            <small class="shops-card__meta"><span class="shops-card__region">{{ shop.region }}</span><template v-if="shop.shopCode">{{ shop.shopCode }}</template></small>
          </div>
          <span class="vg-pill vg-pill--dot" :class="loginTone(shop.loginState)">{{ t(`creatorHub.login.${shop.loginState}`) }}</span>
        </header>

        <dl class="shops-card__facts">
          <div><dt>{{ t('shops.cookieImported') }}</dt><dd>{{ fmtTime(shop.cookieImportedAt) }}</dd></div>
          <div><dt>{{ t('shops.cookieExpires') }}</dt><dd>{{ fmtTime(shop.cookieExpiresAt) }}</dd></div>
          <div><dt>{{ t('shops.lastVerified') }}</dt><dd>{{ fmtTime(shop.lastVerifiedAt) }}</dd></div>
        </dl>

        <div class="shops-card__uses">
          <button type="button" class="shops-use" @click="router.push('/plugins/tiktok-creator-hub')">
            <Users :size="14" /><span>{{ t('shops.useCreatorHub') }}</span><ChevronRight :size="14" class="shops-use__go" />
            <small>{{ shop.lastSyncError ? t('shops.syncFailed') : t('shops.lastSync', { time: fmtTime(shop.lastSyncAt) }) }}</small>
          </button>
          <button type="button" class="shops-use" @click="router.push('/plugins/seller-inventory')">
            <Boxes :size="14" /><span>{{ t('shops.useSales') }}</span><ChevronRight :size="14" class="shops-use__go" />
            <small>{{ salesState[shop.id]?.lastSyncError ? t('shops.syncFailed') : t('shops.lastSync', { time: fmtTime(salesState[shop.id]?.lastSyncAt) }) }}</small>
          </button>
        </div>

        <footer class="shops-card__actions">
          <button type="button" class="vg-btn vg-btn--sm" :class="shop.loginState === 'expired' ? 'vg-btn--primary' : ''" :data-testid="`shop-cookie-${shop.id}`" @click="cookieDialog = { open: true, shop }"><Cookie :size="13" />{{ t('shops.updateCookie') }}</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" :disabled="busyId === shop.id" @click="verify(shop)"><Loader2 v-if="busyId === shop.id" :size="13" class="vg-spin" /><ShieldCheck v-else :size="13" />{{ t('shops.verify') }}</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" @click="openSeller(shop)"><ExternalLink :size="13" />{{ t('shops.openSeller') }}</button>
          <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" @click="openAffiliate(shop)"><ExternalLink :size="13" />{{ t('shops.openAffiliate') }}</button>
          <span class="vg-toolbar__spacer"></span>
          <button type="button" class="vg-icon-btn vg-icon-btn--sm" :title="t('shops.rename')" @click="action = { kind: 'rename', shop }"><Pencil :size="13" /></button>
          <button type="button" class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" :title="t('shops.remove')" @click="action = { kind: 'remove', shop }"><Trash2 :size="13" /></button>
        </footer>
      </article>
    </section>

    <p class="vg-muted shops-foot">{{ t('shops.sharedHint') }}</p>

    <ChCookieDialog :open="cookieDialog.open" :shop="cookieDialog.shop" @close="cookieDialog = { open: false, shop: null }" @imported="onImported" />
    <ChActionDialog
      :open="Boolean(action)"
      :title="action?.kind === 'remove' ? t('shops.removeTitle') : t('shops.rename')"
      :message="action?.kind === 'remove' ? t('shops.removeConfirm', { name: action?.shop.name }) : ''"
      :confirm-text="action?.kind === 'remove' ? t('shops.remove') : t('shops.save')"
      :danger="action?.kind === 'remove'"
      :input="action?.kind === 'rename' ? action.shop.name : null"
      :busy="actionBusy"
      @close="action = null"
      @confirm="confirmAction"
    />
  </section>
</template>

<style scoped>
.shops-page { display: flex; flex-direction: column; gap: 16px; }
.shops-acc-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.shops-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 16px; }
.shops-card { display: flex; flex-direction: column; gap: 14px; padding: 18px 18px 0; overflow: hidden; }
.shops-card__head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.shops-card__avatar { width: 32px; height: 32px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 13px; font-weight: 700; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); color: var(--theme-text-secondary); }
.shops-card__title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.shops-card__title strong { font-size: 14px; font-weight: 600; }
.shops-card__meta { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--theme-text-muted); }
.shops-card__region { padding: 0 5px; border-radius: 4px; border: 1px solid var(--theme-border); font-size: 10px; font-weight: 600; line-height: 15px; color: var(--theme-text-secondary); }
.shops-card__facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; padding: 12px 0; border-top: 1px solid var(--theme-divider); border-bottom: 1px solid var(--theme-divider); }
.shops-card__facts div { min-width: 0; padding: 0 12px; border-left: 1px solid var(--theme-divider); }
.shops-card__facts div:first-child { padding-left: 0; border-left: 0; }
.shops-card__facts dt { font-size: 11px; color: var(--theme-text-muted); }
.shops-card__facts dd { margin: 3px 0 0; font-size: 12.5px; font-weight: 500; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.shops-card__uses { display: flex; flex-direction: column; gap: 2px; margin: -4px -8px 0; }
.shops-use { display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; column-gap: 8px; padding: 7px 8px; border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 13px; text-align: left; cursor: pointer; transition: background .15s; }
.shops-use > svg:first-child { color: var(--theme-text-muted); }
.shops-use small { grid-column: 3; grid-row: 1; justify-self: end; font-size: 11.5px; color: var(--theme-text-muted); }
.shops-use__go { grid-column: 4; color: var(--theme-text-muted); opacity: .5; transition: opacity .15s, transform .15s; }
.shops-use:hover { background: var(--theme-panel-soft); }
.shops-use:hover .shops-use__go { opacity: 1; color: var(--vg-accent); transform: translateX(2px); }
.shops-card__actions { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 0 -18px; padding: 10px 14px 10px 18px; border-top: 1px solid var(--theme-divider); background: color-mix(in srgb, var(--theme-panel-soft) 60%, transparent); }
.shops-empty { padding: 40px 20px; }
.shops-foot { font-size: 12px; line-height: 1.6; margin: 0; color: var(--theme-text-muted); }
</style>
