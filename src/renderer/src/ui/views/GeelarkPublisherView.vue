<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { CheckCircle2, LoaderCircle, RefreshCw, Settings2, Smartphone, Sparkles } from 'lucide-vue-next'
import {
  webApiClient,
  type GeelarkCloudPhoneSummary,
  type GeelarkPluginConfigSummary,
  type GeelarkPublishAccount,
} from '@/lib/webApiClient'

const router = useRouter()
const { t } = useI18n()

const LOCAL_GEELARK_CONFIG_KEY = 'videogen-geelark-config'
const LOCAL_GEELARK_ACCOUNTS_KEY = 'videogen-geelark-accounts'

const loading = ref(false)
const savingConfig = ref(false)
const savingAccount = ref(false)
const reloadingPhones = ref(false)
const plugin = ref<PluginDetail | null>(null)
const config = ref<GeelarkPluginConfigSummary | null>(null)
const accounts = ref<GeelarkPublishAccount[]>([])
const cloudPhones = ref<GeelarkCloudPhoneSummary[]>([])
const notice = ref('')
const errorText = ref('')
const editingAccountId = ref('')

const configForm = reactive({
  baseUrl: 'https://openapi.geelark.com',
  appId: '',
  appSecret: '',
  accessToken: '',
  requestTimeoutMs: 30000,
})

const accountForm = reactive({
  name: '',
  geelarkAccountId: '',
  cloudPhoneId: '',
  remark: '',
  status: 'active' as 'active' | 'disabled',
})

function isApiNotFoundError(error: unknown) {
  const message = String((error as { message?: string } | undefined)?.message ?? error ?? '').trim()
  return message.includes('接口不存在')
}

function readLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)?.trim()
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeLocalJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

function readLocalGeelarkConfig(): GeelarkPluginConfigSummary {
  return readLocalJson<GeelarkPluginConfigSummary>(LOCAL_GEELARK_CONFIG_KEY, {
    baseUrl: 'https://openapi.geelark.com',
    appId: '',
    requestTimeoutMs: 30000,
    hasAppSecret: false,
    hasAccessToken: false,
    updatedAt: 0,
  })
}

function writeLocalGeelarkConfig(input: {
  baseUrl: string
  appId: string
  appSecret?: string
  accessToken?: string
  requestTimeoutMs: number
}) {
  const next: GeelarkPluginConfigSummary = {
    baseUrl: String(input.baseUrl || 'https://openapi.geelark.com').trim() || 'https://openapi.geelark.com',
    appId: String(input.appId || '').trim(),
    requestTimeoutMs: Number(input.requestTimeoutMs || 30000) || 30000,
    hasAppSecret: Boolean(String(input.appSecret || '').trim()),
    hasAccessToken: Boolean(String(input.accessToken || '').trim()),
    updatedAt: Date.now(),
  }
  writeLocalJson(LOCAL_GEELARK_CONFIG_KEY, next)
  return next
}

function readLocalGeelarkAccounts() {
  return readLocalJson<GeelarkPublishAccount[]>(LOCAL_GEELARK_ACCOUNTS_KEY, [])
}

function writeLocalGeelarkAccounts(items: GeelarkPublishAccount[]) {
  writeLocalJson(LOCAL_GEELARK_ACCOUNTS_KEY, items)
}

function fillConfigForm(item: GeelarkPluginConfigSummary | null) {
  if (!item) return
  configForm.baseUrl = item.baseUrl || 'https://openapi.geelark.com'
  configForm.appId = item.appId || ''
  configForm.appSecret = ''
  configForm.accessToken = ''
  configForm.requestTimeoutMs = item.requestTimeoutMs || 30000
}

function resetAccountForm() {
  editingAccountId.value = ''
  accountForm.name = ''
  accountForm.geelarkAccountId = ''
  accountForm.cloudPhoneId = ''
  accountForm.remark = ''
  accountForm.status = 'active'
}

function editAccount(item: GeelarkPublishAccount) {
  editingAccountId.value = item.id
  accountForm.name = item.name
  accountForm.geelarkAccountId = item.geelarkAccountId || ''
  accountForm.cloudPhoneId = item.cloudPhoneId
  accountForm.remark = item.remark || ''
  accountForm.status = item.status
}

function formatTime(value?: number) {
  if (!value) return '--'
  const d = new Date(value)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(
    d.getHours(),
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const selectedCloudPhone = computed(() => cloudPhones.value.find((item) => item.id === accountForm.cloudPhoneId) || null)
const isPluginReady = computed(() => plugin.value?.status === 'installed' && plugin.value?.runtimeState === 'enabled')
const activeAccountCount = computed(() => accounts.value.filter((item) => item.status === 'active').length)

async function loadAll() {
  loading.value = true
  errorText.value = ''
  try {
    try {
      plugin.value = await webApiClient.getPlugin('geelark-publisher')
    } catch (error: any) {
      plugin.value = null
      errorText.value = error?.message ?? String(error)
    }

    try {
      config.value = await webApiClient.getGeelarkPluginConfig()
    } catch (error: any) {
      if (isApiNotFoundError(error)) config.value = readLocalGeelarkConfig()
      else if (!errorText.value) errorText.value = error?.message ?? String(error)
    }
    fillConfigForm(config.value)

    try {
      accounts.value = await webApiClient.listGeelarkPublisherAccounts()
      writeLocalGeelarkAccounts(accounts.value)
    } catch (error: any) {
      if (isApiNotFoundError(error)) accounts.value = readLocalGeelarkAccounts()
      else if (!errorText.value) errorText.value = error?.message ?? String(error)
    }

    if (config.value?.hasAppSecret || config.value?.hasAccessToken) {
      try {
        cloudPhones.value = await webApiClient.listGeelarkCloudPhones()
      } catch (error: any) {
        if (isApiNotFoundError(error)) cloudPhones.value = []
        else if (!errorText.value) errorText.value = error?.message ?? String(error)
      }
    } else {
      cloudPhones.value = []
    }
  } finally {
    loading.value = false
  }
}

async function installAndEnable() {
  errorText.value = ''
  notice.value = ''
  try {
    if (plugin.value?.status !== 'installed') {
      await webApiClient.installPlugin('geelark-publisher')
    }
    await webApiClient.enablePlugin('geelark-publisher')
    notice.value = t('geelarkPublisher.messages.pluginEnabled')
    await loadAll()
  } catch (error: any) {
    plugin.value = null
    errorText.value = error?.message ?? String(error)
  }
}

async function saveConfig() {
  savingConfig.value = true
  errorText.value = ''
  notice.value = ''
  try {
    config.value = await webApiClient.saveGeelarkPluginConfig({
      baseUrl: configForm.baseUrl,
      appId: configForm.appId,
      appSecret: configForm.appSecret || undefined,
      accessToken: configForm.accessToken || undefined,
      requestTimeoutMs: Number(configForm.requestTimeoutMs || 30000),
    })
    fillConfigForm(config.value)
    notice.value = t('geelarkPublisher.messages.configSaved')
  } catch (error: any) {
    if (isApiNotFoundError(error)) {
      config.value = writeLocalGeelarkConfig({
        baseUrl: configForm.baseUrl,
        appId: configForm.appId,
        appSecret: configForm.appSecret || undefined,
        accessToken: configForm.accessToken || undefined,
        requestTimeoutMs: Number(configForm.requestTimeoutMs || 30000),
      })
      fillConfigForm(config.value)
      notice.value = t('geelarkPublisher.messages.configSavedLocal')
      errorText.value = ''
    } else {
      errorText.value = error?.message ?? String(error)
    }
  } finally {
    savingConfig.value = false
  }
}

async function reloadCloudPhones() {
  reloadingPhones.value = true
  errorText.value = ''
  notice.value = ''
  try {
    cloudPhones.value = await webApiClient.listGeelarkCloudPhones()
    notice.value = t('geelarkPublisher.messages.phonesRefreshed')
  } catch (error: any) {
    if (isApiNotFoundError(error)) {
      cloudPhones.value = []
      notice.value = t('geelarkPublisher.messages.phonesUnavailable')
      errorText.value = ''
    } else {
      errorText.value = error?.message ?? String(error)
    }
  } finally {
    reloadingPhones.value = false
  }
}

async function saveAccount() {
  savingAccount.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const payload = {
      name: accountForm.name,
      geelarkAccountId: accountForm.geelarkAccountId || undefined,
      cloudPhoneId: accountForm.cloudPhoneId,
      cloudPhoneName: selectedCloudPhone.value?.serialName || '',
      remark: accountForm.remark || undefined,
      status: accountForm.status,
      platform: 'tiktok' as const,
    }
    if (editingAccountId.value) {
      await webApiClient.updateGeelarkPublisherAccount(editingAccountId.value, payload)
      notice.value = t('geelarkPublisher.messages.accountUpdated')
    } else {
      await webApiClient.createGeelarkPublisherAccount(payload)
      notice.value = t('geelarkPublisher.messages.accountCreated')
    }
    accounts.value = await webApiClient.listGeelarkPublisherAccounts()
    writeLocalGeelarkAccounts(accounts.value)
    resetAccountForm()
  } catch (error: any) {
    if (isApiNotFoundError(error)) {
      const now = Date.now()
      const nextItems = [...readLocalGeelarkAccounts()]
      const id = editingAccountId.value || `local-account-${now}`
      const index = nextItems.findIndex((item) => item.id === id)
      const nextItem: GeelarkPublishAccount = {
        id,
        name: accountForm.name,
        platform: 'tiktok',
        geelarkAccountId: accountForm.geelarkAccountId || undefined,
        cloudPhoneId: accountForm.cloudPhoneId,
        cloudPhoneName: selectedCloudPhone.value?.serialName || '',
        remark: accountForm.remark || undefined,
        status: accountForm.status,
        createdAt: index >= 0 ? nextItems[index].createdAt : now,
        updatedAt: now,
      }
      if (index >= 0) nextItems[index] = nextItem
      else nextItems.unshift(nextItem)
      writeLocalGeelarkAccounts(nextItems)
      accounts.value = nextItems
      resetAccountForm()
      notice.value = t('geelarkPublisher.messages.accountSavedLocal')
      errorText.value = ''
    } else {
      errorText.value = error?.message ?? String(error)
    }
  } finally {
    savingAccount.value = false
  }
}

async function removeAccount(id: string) {
  errorText.value = ''
  notice.value = ''
  try {
    await webApiClient.deleteGeelarkPublisherAccount(id)
    accounts.value = await webApiClient.listGeelarkPublisherAccounts()
    writeLocalGeelarkAccounts(accounts.value)
    if (editingAccountId.value === id) resetAccountForm()
    notice.value = t('geelarkPublisher.messages.accountDeleted')
  } catch (error: any) {
    if (isApiNotFoundError(error)) {
      const nextItems = readLocalGeelarkAccounts().filter((item) => item.id !== id)
      writeLocalGeelarkAccounts(nextItems)
      accounts.value = nextItems
      if (editingAccountId.value === id) resetAccountForm()
      notice.value = t('geelarkPublisher.messages.accountDeletedLocal')
      errorText.value = ''
    } else {
      errorText.value = error?.message ?? String(error)
    }
  }
}

function openPublishCenter() {
  if (!isPluginReady.value) {
    errorText.value = t('geelarkPublisher.setup.desc')
    return
  }
  void router.push('/plugins/geelark-publisher/publish-center')
}

onMounted(() => {
  void loadAll()
})
</script>

<template>
  <div class="geelark-settings-page">
    <section class="hero-card">
      <div class="hero-copy">
        <span class="eyebrow">{{ t('geelarkPublisher.hero.eyebrow') }}</span>
        <h1>{{ t('geelarkPublisher.hero.title') }}</h1>
        <p>{{ t('geelarkPublisher.hero.desc') }}</p>
      </div>

      <div class="hero-actions">
        <button class="primary-button" type="button" @click="openPublishCenter">
          <Sparkles class="h-4 w-4" />
          {{ t('geelarkPublisher.actions.openCenter') }}
        </button>
        <button class="ghost-button" type="button" @click="loadAll">
          <RefreshCw class="h-4 w-4" />
          {{ t('common.refresh') }}
        </button>
      </div>
    </section>

    <div v-if="notice" class="banner banner--success">{{ notice }}</div>
    <div v-if="errorText" class="banner banner--error">{{ errorText }}</div>

    <section v-if="loading" class="loading-card">
      <LoaderCircle class="h-5 w-5 spin" />
      <span>{{ t('geelarkPublisher.loading') }}</span>
    </section>

    <template v-else>
      <section class="overview-grid">
        <article class="stat-card">
          <span>{{ t('geelarkPublisher.stats.pluginStatus') }}</span>
          <strong>{{ isPluginReady ? t('geelarkPublisher.status.enabled') : t('geelarkPublisher.status.disabled') }}</strong>
          <small>{{ plugin?.status === 'installed' ? t('geelarkPublisher.status.installed') : t('geelarkPublisher.status.notInstalled') }}</small>
        </article>
        <article class="stat-card">
          <span>{{ t('geelarkPublisher.stats.accounts') }}</span>
          <strong>{{ activeAccountCount }}</strong>
          <small>{{ t('geelarkPublisher.stats.accountsDesc') }}</small>
        </article>
        <article class="stat-card">
          <span>{{ t('geelarkPublisher.stats.cloudPhones') }}</span>
          <strong>{{ cloudPhones.length }}</strong>
          <small>{{ t('geelarkPublisher.stats.cloudPhonesDesc') }}</small>
        </article>
      </section>

      <section v-if="!isPluginReady" class="panel-card blocked-card">
        <div class="blocked-card__copy">
          <span class="eyebrow">{{ t('geelarkPublisher.setup.eyebrow') }}</span>
          <h2>{{ t('geelarkPublisher.setup.title') }}</h2>
          <p>{{ t('geelarkPublisher.setup.desc') }}</p>
        </div>
        <button class="primary-button" type="button" @click="installAndEnable">
          <CheckCircle2 class="h-4 w-4" />
          {{ t('geelarkPublisher.actions.installEnable') }}
        </button>
      </section>

      <section class="panel-grid">
        <article class="panel-card">
          <div class="panel-head">
            <div>
              <span class="eyebrow">{{ t('geelarkPublisher.config.eyebrow') }}</span>
              <h2>GeeLark API</h2>
            </div>
            <Settings2 class="h-5 w-5 panel-icon" />
          </div>

          <div class="field-grid">
            <label class="field field--full">
              <span>Base URL</span>
              <input v-model="configForm.baseUrl" type="text" placeholder="https://openapi.geelark.com" />
            </label>
            <label class="field">
              <span>App ID</span>
              <input v-model="configForm.appId" type="text" :placeholder="t('geelarkPublisher.config.appIdPlaceholder')" />
            </label>
            <label class="field">
              <span>{{ t('geelarkPublisher.config.timeout') }}</span>
              <input v-model.number="configForm.requestTimeoutMs" type="number" min="5000" step="1000" />
            </label>
            <label class="field field--full">
              <span>App Secret</span>
              <input v-model="configForm.appSecret" type="password" :placeholder="t('geelarkPublisher.config.keepSecret')" />
            </label>
            <label class="field field--full">
              <span>Access Token</span>
              <input v-model="configForm.accessToken" type="password" :placeholder="t('geelarkPublisher.config.keepToken')" />
            </label>
          </div>

          <div class="inline-actions">
            <button class="primary-button" type="button" :disabled="savingConfig" @click="saveConfig">{{ t('geelarkPublisher.actions.saveConfig') }}</button>
            <span class="hint-text">
              {{ t('geelarkPublisher.config.currentStatus') }}: Secret {{ config?.hasAppSecret ? t('geelarkPublisher.status.saved') : t('geelarkPublisher.status.notSaved') }}, Token {{ config?.hasAccessToken ? t('geelarkPublisher.status.saved') : t('geelarkPublisher.status.notSaved') }}
            </span>
          </div>
        </article>

        <article class="panel-card">
          <div class="panel-head">
            <div>
              <span class="eyebrow">{{ t('geelarkPublisher.center.eyebrow') }}</span>
              <h2>{{ t('geelarkPublisher.center.title') }}</h2>
            </div>
            <Smartphone class="h-5 w-5 panel-icon" />
          </div>

          <div class="workspace-card">
            <strong>{{ t('geelarkPublisher.center.cardTitle') }}</strong>
            <p>{{ t('geelarkPublisher.center.desc') }}</p>
            <div class="workspace-card__actions">
              <button class="primary-button" type="button" @click="openPublishCenter">{{ t('geelarkPublisher.actions.enterCenter') }}</button>
            </div>
          </div>
        </article>
      </section>

      <section class="panel-card">
        <div class="panel-head">
          <div>
            <span class="eyebrow">{{ t('geelarkPublisher.accounts.eyebrow') }}</span>
            <h2>{{ t('geelarkPublisher.accounts.title') }}</h2>
          </div>
          <button class="ghost-button" type="button" :disabled="reloadingPhones" @click="reloadCloudPhones">
            <RefreshCw class="h-4 w-4" />
            {{ reloadingPhones ? t('geelarkPublisher.actions.refreshing') : t('geelarkPublisher.actions.refreshPhones') }}
          </button>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>{{ t('geelarkPublisher.accounts.name') }}</span>
            <input v-model="accountForm.name" type="text" :placeholder="t('geelarkPublisher.accounts.namePlaceholder')" />
          </label>
          <label class="field">
            <span>{{ t('geelarkPublisher.accounts.accountId') }}</span>
            <input v-model="accountForm.geelarkAccountId" type="text" :placeholder="t('geelarkPublisher.accounts.accountIdPlaceholder')" />
          </label>
          <label class="field">
            <span>{{ t('geelarkPublisher.accounts.bindPhone') }}</span>
            <select v-model="accountForm.cloudPhoneId">
              <option value="">{{ t('geelarkPublisher.accounts.selectPhone') }}</option>
              <option v-for="item in cloudPhones" :key="item.id" :value="item.id">{{ item.serialName }} / {{ item.id }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('geelarkPublisher.accounts.status') }}</span>
            <select v-model="accountForm.status">
              <option value="active">{{ t('geelarkPublisher.status.enabled') }}</option>
              <option value="disabled">{{ t('geelarkPublisher.status.disabled') }}</option>
            </select>
          </label>
          <label class="field field--full">
            <span>{{ t('geelarkPublisher.accounts.remark') }}</span>
            <input v-model="accountForm.remark" type="text" :placeholder="t('geelarkPublisher.accounts.remarkPlaceholder')" />
          </label>
        </div>

        <div class="inline-actions">
          <button class="primary-button" type="button" :disabled="savingAccount || !accountForm.name || !accountForm.cloudPhoneId" @click="saveAccount">
            {{ editingAccountId ? t('geelarkPublisher.actions.updateAccount') : t('geelarkPublisher.actions.addAccount') }}
          </button>
          <button v-if="editingAccountId" class="ghost-button" type="button" @click="resetAccountForm">{{ t('geelarkPublisher.actions.cancelEdit') }}</button>
          <span class="hint-text">{{ t('geelarkPublisher.accounts.currentDevice') }}: {{ selectedCloudPhone?.serialName || t('geelarkPublisher.status.notSelected') }}</span>
        </div>

        <div v-if="accounts.length" class="account-list">
          <div v-for="item in accounts" :key="item.id" class="account-item">
            <div class="account-item__copy">
              <strong>{{ item.name }}</strong>
              <p>{{ item.cloudPhoneName || item.cloudPhoneId }}</p>
              <small>{{ t('geelarkPublisher.accounts.status') }}: {{ item.status === 'active' ? t('geelarkPublisher.status.enabled') : t('geelarkPublisher.status.disabled') }}, {{ t('geelarkPublisher.accounts.updatedAt') }}: {{ formatTime(item.updatedAt) }}</small>
            </div>
            <div class="account-item__actions">
              <button class="ghost-button" type="button" @click="editAccount(item)">{{ t('geelarkPublisher.actions.edit') }}</button>
              <button class="danger-button" type="button" @click="removeAccount(item.id)">{{ t('geelarkPublisher.actions.delete') }}</button>
            </div>
          </div>
        </div>
        <div v-else class="empty-card">{{ t('geelarkPublisher.accounts.empty') }}</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.geelark-settings-page {
  display: grid;
  gap: 18px;
  padding: 12px;
}

.hero-card,
.panel-card,
.stat-card,
.loading-card {
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 22px;
  background: rgba(8, 13, 21, 0.78);
}

.hero-card,
.panel-card,
.loading-card {
  padding: 22px;
}

.hero-card {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
}

.hero-copy {
  display: grid;
  gap: 10px;
  max-width: 760px;
}

.eyebrow {
  color: #7dd3fc;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1,
h2,
strong {
  color: #fff;
}

h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 800;
}

h2 {
  margin: 6px 0 0;
  font-size: 22px;
  font-weight: 800;
}

p,
small,
.hint-text {
  color: rgba(205, 218, 236, 0.76);
  line-height: 1.65;
}

.hero-actions,
.inline-actions,
.workspace-card__actions,
.account-item__actions,
.panel-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.panel-head {
  justify-content: space-between;
}

.overview-grid,
.panel-grid,
.field-grid {
  display: grid;
  gap: 14px;
}

.overview-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.panel-grid {
  grid-template-columns: 1.35fr 1fr;
}

.stat-card {
  padding: 18px;
  display: grid;
  gap: 8px;
}

.stat-card span {
  color: #8fb5df;
  font-size: 12px;
  font-weight: 700;
}

.stat-card strong {
  font-size: 30px;
  font-weight: 800;
}

.field-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field {
  display: grid;
  gap: 6px;
}

.field--full {
  grid-column: 1 / -1;
}

.field span {
  color: #dbe7f7;
  font-size: 12px;
  font-weight: 700;
}

.field input,
.field select {
  min-height: 44px;
  padding: 12px 14px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: #f8fbff;
  outline: none;
}

.workspace-card,
.account-item,
.empty-card,
.blocked-card {
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
}

.workspace-card,
.empty-card,
.blocked-card {
  padding: 18px;
}

.workspace-card {
  display: grid;
  gap: 12px;
}

.blocked-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.blocked-card__copy {
  display: grid;
  gap: 8px;
}

.account-list {
  display: grid;
  gap: 12px;
}

.account-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
}

.account-item__copy {
  display: grid;
  gap: 4px;
}

.primary-button,
.ghost-button,
.danger-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
}

.primary-button {
  border: 1px solid rgba(14, 165, 233, 0.34);
  background: linear-gradient(135deg, #0ea5e9, #2563eb);
  color: #fff;
}

.ghost-button {
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.04);
  color: #eef5ff;
}

.danger-button {
  border: 1px solid rgba(248, 113, 113, 0.22);
  background: rgba(239, 68, 68, 0.12);
  color: #ffd5d5;
}

.banner {
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 600;
}

.banner--success {
  border: 1px solid rgba(74, 222, 128, 0.18);
  background: rgba(34, 197, 94, 0.12);
  color: #ddffe7;
}

.banner--error {
  border: 1px solid rgba(248, 113, 113, 0.18);
  background: rgba(239, 68, 68, 0.12);
  color: #ffd8d8;
}

.loading-card {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #e7f0ff;
}

.panel-icon {
  color: rgba(205, 218, 236, 0.56);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .hero-card,
  .blocked-card,
  .account-item {
    flex-direction: column;
    align-items: stretch;
  }

  .overview-grid,
  .panel-grid,
  .field-grid {
    grid-template-columns: 1fr;
  }
}
</style>
