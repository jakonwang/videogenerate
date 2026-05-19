<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2, LoaderCircle, RefreshCw, Settings2, Smartphone, Sparkles } from 'lucide-vue-next'
import {
  webApiClient,
  type GeelarkCloudPhoneSummary,
  type GeelarkPluginConfigSummary,
  type GeelarkPublishAccount,
  type PluginDetail,
} from '@/lib/webApiClient'

const router = useRouter()

const LOCAL_PLUGIN_STATE_KEY = 'videogen-desktop-plugin-state'
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

function isPluginMissingError(error: unknown) {
  const message = String((error as { message?: string } | undefined)?.message ?? error ?? '').trim()
  return message.includes('插件不存在')
}

function readLocalPluginState() {
  try {
    const raw = localStorage.getItem(LOCAL_PLUGIN_STATE_KEY)?.trim()
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, { status?: string; enabled?: boolean }>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalPluginState(state: Record<string, { status?: string; enabled?: boolean }>) {
  localStorage.setItem(LOCAL_PLUGIN_STATE_KEY, JSON.stringify(state))
}

function saveLocalPluginState(patch: { status?: 'installed' | 'uninstalled'; enabled?: boolean }) {
  const state = readLocalPluginState()
  const prev = state['geelark-publisher'] || { status: 'uninstalled', enabled: false }
  state['geelark-publisher'] = {
    status: patch.status ?? prev.status,
    enabled: patch.status === 'uninstalled' ? false : (patch.enabled ?? Boolean(prev.enabled)),
  }
  writeLocalPluginState(state)
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

function localPluginDetailFallback(): PluginDetail {
  const local = readLocalPluginState()['geelark-publisher']
  return {
    id: 'geelark-publisher',
    name: 'GeeLark 发布插件',
    category: 'video_processing',
    description: '管理 GeeLark API、发布账号与云手机绑定，并进入独立发布中心完成 TikTok 发布。',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/geelark-publisher',
    status: local?.status === 'installed' ? 'installed' : 'uninstalled',
    enabled: local?.status === 'installed' ? Boolean(local.enabled) : false,
    runtimeState: local?.status === 'installed' && local.enabled ? 'enabled' : 'disabled',
    usageHint: '先配置 GeeLark API 与发布账号，再进入发布中心处理待发布成片。',
    configSchema: [],
    config: {},
  }
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
      plugin.value = localPluginDetailFallback()
      if (!isPluginMissingError(error) && !isApiNotFoundError(error)) {
        errorText.value = error?.message ?? String(error)
      }
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
    notice.value = 'GeeLark 插件已安装并启用。'
    await loadAll()
  } catch {
    saveLocalPluginState({ status: 'installed', enabled: true })
    plugin.value = localPluginDetailFallback()
    notice.value = 'GeeLark 插件已切换到本地启用状态。'
    errorText.value = ''
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
    notice.value = 'GeeLark 配置已保存。'
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
      notice.value = 'GeeLark 配置已保存到本地。'
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
    notice.value = '云手机列表已刷新。'
  } catch (error: any) {
    if (isApiNotFoundError(error)) {
      cloudPhones.value = []
      notice.value = '当前运行实例未提供云手机接口。'
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
      notice.value = '发布账号已更新。'
    } else {
      await webApiClient.createGeelarkPublisherAccount(payload)
      notice.value = '发布账号已创建。'
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
      notice.value = '发布账号已保存到本地。'
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
    notice.value = '发布账号已删除。'
  } catch (error: any) {
    if (isApiNotFoundError(error)) {
      const nextItems = readLocalGeelarkAccounts().filter((item) => item.id !== id)
      writeLocalGeelarkAccounts(nextItems)
      accounts.value = nextItems
      if (editingAccountId.value === id) resetAccountForm()
      notice.value = '发布账号已从本地删除。'
      errorText.value = ''
    } else {
      errorText.value = error?.message ?? String(error)
    }
  }
}

function openPublishCenter() {
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
        <span class="eyebrow">GeeLark 发布设置</span>
        <h1>先配置插件与账号，再进入独立发布中心</h1>
        <p>这个页面只负责 GeeLark 插件启用、接口配置和发布账号绑定。待发布复刻视频与发布任务已经拆到独立工作台，不再和设置混在一起。</p>
      </div>

      <div class="hero-actions">
        <button class="primary-button" type="button" @click="openPublishCenter">
          <Sparkles class="h-4 w-4" />
          打开发布中心
        </button>
        <button class="ghost-button" type="button" @click="loadAll">
          <RefreshCw class="h-4 w-4" />
          刷新状态
        </button>
      </div>
    </section>

    <div v-if="notice" class="banner banner--success">{{ notice }}</div>
    <div v-if="errorText" class="banner banner--error">{{ errorText }}</div>

    <section v-if="loading" class="loading-card">
      <LoaderCircle class="h-5 w-5 spin" />
      <span>正在加载 GeeLark 配置...</span>
    </section>

    <template v-else>
      <section class="overview-grid">
        <article class="stat-card">
          <span>插件状态</span>
          <strong>{{ isPluginReady ? '已启用' : '未启用' }}</strong>
          <small>{{ plugin?.status === 'installed' ? '插件已安装' : '插件未安装' }}</small>
        </article>
        <article class="stat-card">
          <span>发布账号</span>
          <strong>{{ activeAccountCount }}</strong>
          <small>当前可用于发布的账号数量</small>
        </article>
        <article class="stat-card">
          <span>云手机</span>
          <strong>{{ cloudPhones.length }}</strong>
          <small>已拉取的云手机设备数量</small>
        </article>
      </section>

      <section v-if="!isPluginReady" class="panel-card blocked-card">
        <div class="blocked-card__copy">
          <span class="eyebrow">插件准备</span>
          <h2>GeeLark 插件尚未启用</h2>
          <p>请先安装并启用插件，再继续配置 API、绑定账号和进入发布中心。</p>
        </div>
        <button class="primary-button" type="button" @click="installAndEnable">
          <CheckCircle2 class="h-4 w-4" />
          安装并启用插件
        </button>
      </section>

      <section class="panel-grid">
        <article class="panel-card">
          <div class="panel-head">
            <div>
              <span class="eyebrow">接口配置</span>
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
              <input v-model="configForm.appId" type="text" placeholder="填写 GeeLark App ID" />
            </label>
            <label class="field">
              <span>请求超时（毫秒）</span>
              <input v-model.number="configForm.requestTimeoutMs" type="number" min="5000" step="1000" />
            </label>
            <label class="field field--full">
              <span>App Secret</span>
              <input v-model="configForm.appSecret" type="password" placeholder="留空则保持已有密钥不变" />
            </label>
            <label class="field field--full">
              <span>Access Token</span>
              <input v-model="configForm.accessToken" type="password" placeholder="可选，留空则保持已有 Token 不变" />
            </label>
          </div>

          <div class="inline-actions">
            <button class="primary-button" type="button" :disabled="savingConfig" @click="saveConfig">保存配置</button>
            <span class="hint-text">
              当前状态：Secret {{ config?.hasAppSecret ? '已保存' : '未保存' }}，Token {{ config?.hasAccessToken ? '已保存' : '未保存' }}
            </span>
          </div>
        </article>

        <article class="panel-card">
          <div class="panel-head">
            <div>
              <span class="eyebrow">发布入口</span>
              <h2>独立发布中心</h2>
            </div>
            <Smartphone class="h-5 w-5 panel-icon" />
          </div>

          <div class="workspace-card">
            <strong>发布列表已拆为单独界面</strong>
            <p>待发布复刻视频、AI 标题生成、音乐候选池和最近发布任务都在独立页面处理。这样配置页更干净，发布操作也不会挤在同一个长页面里。</p>
            <div class="workspace-card__actions">
              <button class="primary-button" type="button" @click="openPublishCenter">进入发布中心</button>
            </div>
          </div>
        </article>
      </section>

      <section class="panel-card">
        <div class="panel-head">
          <div>
            <span class="eyebrow">账号绑定</span>
            <h2>发布账号与云手机</h2>
          </div>
          <button class="ghost-button" type="button" :disabled="reloadingPhones" @click="reloadCloudPhones">
            <RefreshCw class="h-4 w-4" />
            {{ reloadingPhones ? '刷新中...' : '刷新云手机' }}
          </button>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>账号名称</span>
            <input v-model="accountForm.name" type="text" placeholder="例如：TK 美区 01" />
          </label>
          <label class="field">
            <span>GeeLark 账号 ID</span>
            <input v-model="accountForm.geelarkAccountId" type="text" placeholder="可选，用于定位账号" />
          </label>
          <label class="field">
            <span>绑定云手机</span>
            <select v-model="accountForm.cloudPhoneId">
              <option value="">请选择云手机</option>
              <option v-for="item in cloudPhones" :key="item.id" :value="item.id">{{ item.serialName }} / {{ item.id }}</option>
            </select>
          </label>
          <label class="field">
            <span>状态</span>
            <select v-model="accountForm.status">
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>
          <label class="field field--full">
            <span>备注</span>
            <input v-model="accountForm.remark" type="text" placeholder="记录账号用途、地区或商品方向" />
          </label>
        </div>

        <div class="inline-actions">
          <button class="primary-button" type="button" :disabled="savingAccount || !accountForm.name || !accountForm.cloudPhoneId" @click="saveAccount">
            {{ editingAccountId ? '更新账号' : '新增账号' }}
          </button>
          <button v-if="editingAccountId" class="ghost-button" type="button" @click="resetAccountForm">取消编辑</button>
          <span class="hint-text">当前设备：{{ selectedCloudPhone?.serialName || '未选择' }}</span>
        </div>

        <div v-if="accounts.length" class="account-list">
          <div v-for="item in accounts" :key="item.id" class="account-item">
            <div class="account-item__copy">
              <strong>{{ item.name }}</strong>
              <p>{{ item.cloudPhoneName || item.cloudPhoneId }}</p>
              <small>状态：{{ item.status === 'active' ? '启用' : '停用' }}，更新时间：{{ formatTime(item.updatedAt) }}</small>
            </div>
            <div class="account-item__actions">
              <button class="ghost-button" type="button" @click="editAccount(item)">编辑</button>
              <button class="danger-button" type="button" @click="removeAccount(item.id)">删除</button>
            </div>
          </div>
        </div>
        <div v-else class="empty-card">还没有发布账号，先新增一个账号后再进入发布中心。</div>
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
