<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AlertCircle, CheckCircle2, ChevronLeft, Clapperboard, Info, LayoutDashboard, Package, Percent, Receipt, RefreshCw, Store, UserCog, Users, Wallet } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type {
  CreatorHubCrmRow,
  CreatorHubFulfillmentReport,
  CreatorHubOrder,
  CreatorHubOverview,
  CreatorHubProductCost,
  CreatorHubSample,
  CreatorHubSettings,
  CreatorHubShop,
  CreatorHubSyncProgress,
  CreatorHubVideo,
} from '@/../../shared/creatorHub'
import { CREATOR_HUB_DEFAULT_SETTINGS } from '@/../../shared/creatorHub'
import ChActionDialog from './creator-hub/ChActionDialog.vue'
import ChCookieDialog from './creator-hub/ChCookieDialog.vue'
import ChCostsPanel from './creator-hub/ChCostsPanel.vue'
import ChCrmPanel from './creator-hub/ChCrmPanel.vue'
import ChFulfillmentPanel from './creator-hub/ChFulfillmentPanel.vue'
import ChOrdersPanel from './creator-hub/ChOrdersPanel.vue'
import ChOverviewPanel from './creator-hub/ChOverviewPanel.vue'
import ChProfileDialog from './creator-hub/ChProfileDialog.vue'
import ChSamplesPanel from './creator-hub/ChSamplesPanel.vue'
import ChShopsPanel from './creator-hub/ChShopsPanel.vue'
import ChVideosPanel from './creator-hub/ChVideosPanel.vue'
import { creatorHubError } from './creator-hub/creatorHubFormat'
import './creator-hub/creator-hub.css'

type Tab = 'overview' | 'fulfillment' | 'samples' | 'videos' | 'creators' | 'orders' | 'costs' | 'shops'
type SamplePreset = { stage?: string; fulfillment?: string; token: number } | null
const TABS: Tab[] = ['overview', 'fulfillment', 'samples', 'videos', 'creators', 'orders', 'costs', 'shops']
const ALL = 'all'
const SHOP_KEY = 'creatorHub.currentShop'
const TAB_KEY = 'creatorHub.tab'

const router = useRouter()
const { t } = useI18n()
const api = window.api.tiktokCreatorHub

function readStored(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function store(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

const storedTab = readStored(TAB_KEY, 'overview') as Tab
const tab = ref<Tab>(TABS.includes(storedTab) ? storedTab : 'overview')
const currentShop = ref(readStored(SHOP_KEY, ALL))
const shops = ref<CreatorHubShop[]>([])
const samples = ref<CreatorHubSample[]>([])
const costs = ref<CreatorHubProductCost[]>([])
const report = ref<CreatorHubFulfillmentReport | null>(null)
const overview = ref<CreatorHubOverview | null>(null)
const videos = ref<Array<CreatorHubVideo & { sampleId?: string }>>([])
const crmRows = ref<CreatorHubCrmRow[]>([])
const orders = ref<CreatorHubOrder[]>([])
const settings = ref<CreatorHubSettings>({ ...CREATOR_HUB_DEFAULT_SETTINGS })
const progress = ref<Record<string, CreatorHubSyncProgress | null>>({})
const busy = ref<Record<string, string>>({})
const loading = ref(true)
const savingSettings = ref(false)
const savingCost = ref('')
const samplePreset = ref<SamplePreset>(null)
const cookieDialog = ref<{ open: boolean; shop: CreatorHubShop | null }>({ open: false, shop: null })
const action = ref<{ kind: 'rename' | 'remove'; shop: CreatorHubShop } | null>(null)
const actionBusy = ref(false)
const profileRow = ref<CreatorHubCrmRow | null>(null)
const profileBusy = ref(false)
const toast = ref<{ id: number; text: string; tone: 'info' | 'success' | 'error' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const tabs = computed(() => [
  { key: 'overview' as Tab, icon: LayoutDashboard, label: t('creatorHub.tabs.overview') },
  { key: 'fulfillment' as Tab, icon: Percent, label: t('creatorHub.tabs.fulfillment') },
  { key: 'samples' as Tab, icon: Package, label: t('creatorHub.tabs.samples'), count: samples.value.length },
  { key: 'videos' as Tab, icon: Clapperboard, label: t('creatorHub.tabs.videos') },
  { key: 'creators' as Tab, icon: UserCog, label: t('creatorHub.tabs.creators') },
  { key: 'orders' as Tab, icon: Receipt, label: t('creatorHub.tabs.orders') },
  { key: 'costs' as Tab, icon: Wallet, label: t('creatorHub.tabs.costs') },
  { key: 'shops' as Tab, icon: Store, label: t('creatorHub.tabs.shops'), count: shops.value.length },
])
const shopFilter = computed(() => (currentShop.value === ALL ? undefined : currentShop.value))
const selectedShop = computed(() => shops.value.find((item) => item.id === currentShop.value) || null)
const showShopColumn = computed(() => currentShop.value === ALL && shops.value.length > 1)
const anyRunning = computed(() => Object.values(progress.value).some((item) => item?.status === 'running'))
const knownTags = computed(() => [...new Set(crmRows.value.flatMap((row) => row.tags))].sort())

function notify(text: string, tone: 'info' | 'success' | 'error' = 'info') {
  toast.value = { id: Date.now(), text, tone }
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3600)
}
function fail(error: unknown) {
  notify(creatorHubError(error, t), 'error')
}

async function loadShops() {
  shops.value = await api.listShops()
  if (currentShop.value !== ALL && !shops.value.some((item) => item.id === currentShop.value)) currentShop.value = ALL
}
/** Sample-based data is small and shared by several tabs; the heavier lists load with their tab. */
async function loadData() {
  const shopId = shopFilter.value
  const [sampleRows, costRows, fulfillment] = await Promise.all([api.listSamples(shopId), api.listCosts(shopId), api.getFulfillment(shopId)])
  samples.value = sampleRows
  costs.value = costRows
  report.value = fulfillment
  settings.value = fulfillment.settings
  await loadTab(tab.value)
}
async function loadTab(value: Tab) {
  const shopId = shopFilter.value
  if (value === 'overview') overview.value = await api.getOverview(shopId)
  else if (value === 'videos') videos.value = await api.listVideos(shopId)
  else if (value === 'creators') crmRows.value = await api.listCrm(shopId)
  else if (value === 'orders') orders.value = await api.listOrders(shopId)
}
async function refreshAll() {
  try {
    await loadShops()
    await loadData()
  } catch (error) {
    fail(error)
  } finally {
    loading.value = false
  }
}

watch(currentShop, (value) => { store(SHOP_KEY, value); void loadData().catch(fail) })
watch(tab, (value) => { store(TAB_KEY, value); void loadTab(value).catch(fail) })

async function pollProgress() {
  const ids = shops.value.map((item) => item.id)
  const entries = await Promise.all(ids.map(async (id) => [id, await api.getSyncProgress(id)] as const))
  const wasRunning = anyRunning.value
  progress.value = Object.fromEntries(entries)
  if (wasRunning && !anyRunning.value) await refreshAll()
}

async function withBusy(shop: CreatorHubShop, kind: string, task: () => Promise<void>) {
  busy.value = { ...busy.value, [shop.id]: kind }
  try { await task() } catch (error) { fail(error) } finally {
    const next = { ...busy.value }
    delete next[shop.id]
    busy.value = next
  }
}

function syncShop(shop: CreatorHubShop) {
  progress.value = { ...progress.value, [shop.id]: { shopId: shop.id, pages: 0, rows: 0, status: 'running' } }
  void withBusy(shop, 'sync', async () => {
    try {
      const job = await api.syncShop({ id: shop.id })
      const rows = job.stageRows || {}
      const failed = Object.keys(job.stageErrors || {})
      notify(
        failed.length
          ? t('creatorHub.messages.syncedPartly', { name: shop.name, stages: failed.map((stage) => t(`creatorHub.sync.stage.${stage}`)).join(', ') })
          : t('creatorHub.messages.syncedAll', { name: shop.name, samples: rows.samples || 0, creators: rows.creators || 0, videos: rows.videos || 0, orders: rows.orders || 0 }),
        failed.length ? 'error' : 'success',
      )
    } finally {
      await pollProgress()
      await refreshAll()
    }
  })
}
function verifyShop(shop: CreatorHubShop) {
  void withBusy(shop, 'verify', async () => {
    const result = await api.verifyShop(shop.id)
    notify(result.loginState === 'valid' ? t('creatorHub.messages.loginValid', { name: result.name }) : t('creatorHub.messages.loginExpired', { name: result.name }), result.loginState === 'valid' ? 'success' : 'error')
    await loadShops()
  })
}
async function openBackend(shopId: string) {
  try {
    const result = await api.openBackend({ id: shopId })
    if (!result.loggedIn) {
      notify(t('creatorHub.messages.loginExpired', { name: shops.value.find((item) => item.id === shopId)?.name || '' }), 'error')
      await loadShops()
    }
  } catch (error) { fail(error) }
}
async function confirmAction(value: string) {
  const current = action.value
  if (!current) return
  actionBusy.value = true
  try {
    if (current.kind === 'rename') {
      if (value && value !== current.shop.name) await api.renameShop({ id: current.shop.id, name: value })
      await loadShops()
    } else {
      await api.removeShop(current.shop.id)
      notify(t('creatorHub.messages.removed', { name: current.shop.name }), 'success')
      await refreshAll()
    }
    action.value = null
  } catch (error) { fail(error) } finally { actionBusy.value = false }
}
async function onImported(payload: { shop: CreatorHubShop; merged: boolean }) {
  cookieDialog.value = { open: false, shop: null }
  notify(payload.merged ? t('creatorHub.messages.cookieMerged', { name: payload.shop.name }) : t('creatorHub.messages.cookieImported', { name: payload.shop.name }), 'success')
  await loadShops()
  if (!payload.shop.lastSyncAt) syncShop(payload.shop)
}

async function saveSampleCost(payload: { id: string; costOverride: number | null }) {
  try { await api.updateSample(payload); await loadData() } catch (error) { fail(error) }
}
async function saveCost(payload: { shopId: string; productId: string; productTitle?: string; unitCost: number; shippingCost: number }) {
  savingCost.value = payload.productId
  try {
    await api.saveCost(payload)
    notify(t('creatorHub.messages.costSaved'), 'success')
    await loadData()
  } catch (error) { fail(error) } finally { savingCost.value = '' }
}
async function removeCost(id: string) {
  try { await api.removeCost(id); await loadData() } catch (error) { fail(error) }
}
async function saveSettings(value: Partial<CreatorHubSettings>) {
  savingSettings.value = true
  try {
    await api.saveSettings({ ...settings.value, ...value })
    notify(t('creatorHub.messages.settingsSaved'), 'success')
    await loadData()
  } catch (error) { fail(error) } finally { savingSettings.value = false }
}
async function saveProfile(payload: { tags: string[]; note: string; blocked: boolean }) {
  const row = profileRow.value
  if (!row) return
  profileBusy.value = true
  try {
    await api.saveProfile({ shopId: row.shopId, creatorId: row.creatorId || row.creatorHandle, ...payload })
    profileRow.value = null
    notify(t('creatorHub.messages.profileSaved'), 'success')
    crmRows.value = await api.listCrm(shopFilter.value)
  } catch (error) { fail(error) } finally { profileBusy.value = false }
}

function goFromOverview(target: 'samples-review' | 'samples-overdue' | 'costs' | 'shops' | 'fulfillment') {
  if (target === 'samples-review') { samplePreset.value = { stage: 'pending_review', fulfillment: 'all', token: Date.now() }; tab.value = 'samples' }
  else if (target === 'samples-overdue') { samplePreset.value = { stage: 'all', fulfillment: 'overdue', token: Date.now() }; tab.value = 'samples' }
  else if (target === 'costs' && !selectedShop.value && shops.value.length === 1) { currentShop.value = shops.value[0].id; tab.value = 'costs' }
  else tab.value = target
}

onMounted(() => {
  void refreshAll().then(pollProgress)
  pollTimer = setInterval(() => { if (anyRunning.value) void pollProgress().catch(() => undefined) }, 1500)
})
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <div class="vg-scope vg-page ch-page" data-testid="creator-hub-page">
    <header class="vg-page-head">
      <button class="vg-icon-btn" type="button" :title="t('creatorHub.actions.back')" @click="router.push('/plugins?tab=installed')"><ChevronLeft :size="18" /></button>
      <span class="vg-page-head__icon"><Users :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('creatorHub.title') }}</h1>
        <p>{{ t('creatorHub.subtitle') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <label class="ch-shop-switch">
          <Store :size="15" class="vg-muted" />
          <select v-model="currentShop" class="vg-select" :aria-label="t('creatorHub.shopSwitch')" data-testid="creator-hub-shop-switch">
            <option :value="ALL">{{ t('creatorHub.allShops', { count: shops.length }) }}</option>
            <option v-for="shop in shops" :key="shop.id" :value="shop.id">{{ shop.name }}{{ shop.loginState === 'expired' ? ` · ${t('creatorHub.login.expired')}` : '' }}</option>
          </select>
        </label>
        <button v-if="selectedShop" class="vg-btn vg-btn--sm vg-btn--soft" :disabled="Boolean(busy[selectedShop.id]) || progress[selectedShop.id]?.status === 'running'" @click="syncShop(selectedShop)">
          <RefreshCw :size="13" :class="{ 'vg-spin': progress[selectedShop.id]?.status === 'running' }" />
          <template v-if="progress[selectedShop.id]?.status === 'running' && progress[selectedShop.id]?.stage">{{ t(`creatorHub.sync.stage.${progress[selectedShop.id]?.stage}`) }} {{ progress[selectedShop.id]?.rows || 0 }}</template>
          <template v-else>{{ t('creatorHub.shops.sync') }}</template>
        </button>
        <button class="vg-btn vg-btn--sm vg-btn--outline" :title="t('creatorHub.actions.refresh')" @click="refreshAll"><RefreshCw :size="13" />{{ t('creatorHub.actions.refresh') }}</button>
      </div>
    </header>

    <nav class="vg-tabs" role="tablist">
      <button v-for="item in tabs" :key="item.key" class="vg-tabs__btn" :class="{ 'is-active': tab === item.key }" role="tab" :aria-selected="tab === item.key" :data-testid="`creator-hub-tab-${item.key}`" @click="tab = item.key">
        <component :is="item.icon" :size="15" />{{ item.label }}<span v-if="item.count" class="vg-count">{{ item.count }}</span>
      </button>
    </nav>

    <div v-if="!loading && !shops.length && tab !== 'shops' && tab !== 'overview'" class="vg-notice vg-notice--accent">
      <Info :size="16" /><span>{{ t('creatorHub.noShopNotice') }}</span>
      <button class="vg-link" @click="tab = 'shops'">{{ t('creatorHub.shops.add') }}</button>
    </div>

    <ChOverviewPanel v-if="tab === 'overview'" :overview="overview" :shops="currentShop === ALL ? shops : shops.filter((item) => item.id === currentShop)" :show-shops="showShopColumn" @go="goFromOverview" />
    <ChFulfillmentPanel v-else-if="tab === 'fulfillment'" :report="report" :shops="shops" :show-shop="showShopColumn" :saving-settings="savingSettings" @save-settings="saveSettings" />
    <ChSamplesPanel v-else-if="tab === 'samples'" :samples="samples" :costs="costs" :settings="settings" :shops="shops" :show-shop="showShopColumn" :preset="samplePreset" @save-cost="saveSampleCost" @open="openBackend" />
    <ChVideosPanel v-else-if="tab === 'videos'" :videos="videos" :shops="shops" :show-shop="showShopColumn" />
    <ChCrmPanel v-else-if="tab === 'creators'" :rows="crmRows" :shops="shops" :show-shop="showShopColumn" @edit="(row) => (profileRow = row)" />
    <ChOrdersPanel v-else-if="tab === 'orders'" :orders="orders" :shops="shops" :show-shop="showShopColumn" :window-days="settings.orderWindowDays" />
    <template v-else-if="tab === 'costs'">
      <ChCostsPanel v-if="selectedShop" :shop-id="selectedShop.id" :samples="samples" :costs="costs" :saving="savingCost" @save="saveCost" @remove="removeCost" />
      <div v-else class="vg-card vg-empty">
        <span class="vg-empty__icon"><Store :size="26" /></span>
        <h3>{{ t('creatorHub.costs.pickShopTitle') }}</h3>
        <p>{{ t('creatorHub.costs.pickShopDesc') }}</p>
      </div>
    </template>
    <ChShopsPanel
      v-else
      :shops="shops"
      :progress="progress"
      :busy="busy"
      :settings="settings"
      :saving-settings="savingSettings"
      @add="cookieDialog = { open: true, shop: null }"
      @sync="syncShop"
      @verify="verifyShop"
      @open="(shop) => openBackend(shop.id)"
      @update-cookie="(shop) => (cookieDialog = { open: true, shop })"
      @rename="(shop) => (action = { kind: 'rename', shop })"
      @remove="(shop) => (action = { kind: 'remove', shop })"
      @save-settings="saveSettings"
    />

    <ChActionDialog
      :open="Boolean(action)"
      :title="action?.kind === 'remove' ? t('creatorHub.shops.removeTitle') : t('creatorHub.shops.rename')"
      :message="action?.kind === 'remove' ? t('creatorHub.shops.removeConfirm', { name: action?.shop.name }) : ''"
      :confirm-text="action?.kind === 'remove' ? t('creatorHub.shops.remove') : t('creatorHub.actions.save')"
      :danger="action?.kind === 'remove'"
      :input="action?.kind === 'rename' ? action.shop.name : null"
      :busy="actionBusy"
      @close="action = null"
      @confirm="confirmAction"
    />
    <ChCookieDialog :open="cookieDialog.open" :shop="cookieDialog.shop" @close="cookieDialog = { open: false, shop: null }" @imported="onImported" />
    <ChProfileDialog :row="profileRow" :busy="profileBusy" :known-tags="knownTags" @close="profileRow = null" @save="saveProfile" />

    <Teleport to="body">
      <Transition name="vg-toast">
        <div v-if="toast" :key="toast.id" class="vg-scope vg-toast" :class="toast.tone !== 'info' && `vg-toast--${toast.tone}`" role="status">
          <CheckCircle2 v-if="toast.tone === 'success'" :size="16" />
          <AlertCircle v-else-if="toast.tone === 'error'" :size="16" />
          <Info v-else :size="16" />
          <span>{{ toast.text }}</span>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
