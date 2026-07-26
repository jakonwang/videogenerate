<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import {
  Activity,
  Bot,
  Boxes,
  CircleStop,
  CloudDownload,
  DatabaseBackup,
  Play,
  Puzzle,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Wrench,
} from 'lucide-vue-next'

type PanelTab = 'runtime' | 'models' | 'skills' | 'channels' | 'memory' | 'backups' | 'diagnostics'

const props = withDefaults(defineProps<{
  initialTab?: PanelTab
  visibleTabs?: readonly PanelTab[]
  embedded?: boolean
}>(), {
  initialTab: 'runtime',
  visibleTabs: () => ['runtime', 'models', 'skills', 'channels', 'memory', 'backups', 'diagnostics'],
  embedded: false,
})
type ChannelField = {
  key: string
  prompt: string
  description: string
  required: boolean
  password: boolean
  advanced: boolean
  configured: boolean
  redactedValue: string
}
type Channel = {
  id: string
  name: string
  description: string
  enabled: boolean
  configured: boolean
  connected: boolean
  state: string
  gatewayRunning: boolean
  fields: ChannelField[]
}

const { t } = useI18n()
const hermesApi = window.api.hermes
const confirmAction = window.confirm.bind(window)
const activeTab = ref<PanelTab>(props.initialTab)
const busy = ref('')
const message = ref('')
const installation = ref<any>({ state: 'missing', logs: [] })
const runtime = ref<any>({ state: 'stopped', logs: [] })
const gateway = ref<any>({ running: false, state: 'stopped' })
const modelOptions = ref<any>({ provider: '', model: '', providers: [], custom: {} })
const modelProvider = ref('')
const modelName = ref('')
const modelApiKey = ref('')
const skills = ref<any[]>([])
const skillQuery = ref('')
const skillResults = ref<any[]>([])
const channels = ref<Channel[]>([])
const selectedChannelId = ref('feishu')
const channelValues = ref<Record<string, string>>({})
const pairing = ref<any>(null)
const pairingQr = ref('')
const backups = ref<any[]>([])
const memory = ref<any>(null)
const diagnostics = ref<any>(null)
let unsubscribeManagement: (() => void) | undefined
let pairingTimer: ReturnType<typeof setTimeout> | undefined

const allTabs = computed(() => [
  { id: 'runtime' as const, label: t('settings.hermesManagement.tabs.runtime'), icon: Activity },
  { id: 'models' as const, label: t('settings.hermesManagement.tabs.models'), icon: Bot },
  { id: 'skills' as const, label: t('settings.hermesManagement.tabs.skills'), icon: Puzzle },
  { id: 'channels' as const, label: t('settings.hermesManagement.tabs.channels'), icon: Radio },
  { id: 'memory' as const, label: t('settings.hermesManagement.tabs.memory'), icon: Boxes },
  { id: 'backups' as const, label: t('settings.hermesManagement.tabs.backups'), icon: DatabaseBackup },
  { id: 'diagnostics' as const, label: t('settings.hermesManagement.tabs.diagnostics'), icon: ShieldCheck },
])
const tabs = computed(() => allTabs.value.filter((tab) => props.visibleTabs.includes(tab.id)))
const selectedChannel = computed(() => channels.value.find((item) => item.id === selectedChannelId.value))
const runtimeReady = computed(() => runtime.value.state === 'ready')
const canUpdate = computed(() => installation.value.state === 'update_available')
const statusTone = computed(() => {
  if (runtimeReady.value) return 'ready'
  if (['installing', 'updating', 'starting', 'repairing'].includes(String(installation.value.state)) || runtime.value.state === 'starting') return 'busy'
  return 'attention'
})

function errorMessage(error: unknown) {
  const detail = String((error as Error)?.message || error || '')
  if (/No handler registered for ['"]hermes:/i.test(detail)) {
    return t('settings.hermesManagement.restartRequired')
  }
  return detail || t('settings.hermesManagement.unknownError')
}

async function runAction(name: string, action: () => Promise<unknown>, refresh = true) {
  if (busy.value) return
  busy.value = name
  message.value = ''
  try {
    await action()
    message.value = t('settings.hermesManagement.actionComplete')
    if (refresh) await refreshOverview()
  } catch (error) {
    message.value = errorMessage(error)
  } finally {
    busy.value = ''
  }
}

async function refreshOverview() {
  const [nextInstallation, nextRuntime] = await Promise.all([
    hermesApi.getInstallationStatus(),
    hermesApi.getRuntimeStatus(),
  ])
  installation.value = nextInstallation
  runtime.value = nextRuntime
  if (nextRuntime?.state === 'ready') {
    gateway.value = await hermesApi.getGatewayStatus().catch(() => ({ running: false, state: 'stopped' }))
  }
}

async function refreshModels() {
  modelOptions.value = await hermesApi.getModelOptions()
  modelProvider.value = String(modelOptions.value.provider || '')
  modelName.value = String(modelOptions.value.model || '')
}

async function saveModel() {
  await runAction('model', async () => {
    if (modelApiKey.value.trim()) {
      await hermesApi.saveProviderKey({ provider: modelProvider.value, apiKey: modelApiKey.value.trim() })
      modelApiKey.value = ''
    }
    if (modelProvider.value && modelName.value) {
      await hermesApi.selectModel({ provider: modelProvider.value, model: modelName.value })
    }
    await refreshModels()
  }, false)
}

async function refreshSkills() {
  skills.value = await hermesApi.listSkills()
}

async function searchSkills() {
  await runAction('skill-search', async () => {
    const result = await hermesApi.searchSkills({ query: skillQuery.value, limit: 24 })
    skillResults.value = Array.isArray(result?.results) ? result.results : []
  }, false)
}

async function installSkill(identifier: string) {
  await runAction(`skill-install-${identifier}`, async () => {
    const [preview, audit] = await Promise.all([
      hermesApi.inspectSkill(identifier),
      hermesApi.auditSkill(identifier),
    ])
    const source = String(preview?.source || preview?.repo || identifier)
    const verdict = String(audit?.verdict || audit?.status || t('settings.hermesManagement.skills.auditUnknown'))
    if (!confirmAction(t('settings.hermesManagement.skills.confirmInstall', { source, verdict }))) return
    await hermesApi.installSkill(identifier)
    await refreshSkills()
  }, false)
}

async function refreshChannels() {
  channels.value = await hermesApi.listChannels()
  if (!channels.value.some((item) => item.id === selectedChannelId.value)) {
    selectedChannelId.value = channels.value[0]?.id || ''
  }
  resetChannelValues()
}

function resetChannelValues() {
  channelValues.value = Object.fromEntries((selectedChannel.value?.fields || []).map((field) => [field.key, '']))
}

function currentChannelValues() {
  return Object.fromEntries(Object.entries(channelValues.value).filter(([, value]) => String(value).trim()))
}

async function persistSelectedChannel(enabled?: boolean) {
  const channel = selectedChannel.value
  if (!channel) return
  await hermesApi.saveChannel({
    id: channel.id,
    enabled: enabled ?? channel.enabled,
    values: currentChannelValues(),
  })
}

async function saveChannel() {
  await runAction('channel-save', async () => {
    await persistSelectedChannel()
    await refreshChannels()
  }, false)
}

async function testSelectedChannel() {
  const channelId = selectedChannel.value?.id
  if (!channelId) return
  await runAction('channel-test', async () => {
    await persistSelectedChannel()
    await hermesApi.testChannel(channelId)
    await refreshChannels()
  }, false)
}

async function connectSelectedChannel() {
  const channelId = selectedChannel.value?.id
  if (!channelId) return
  await runAction('channel-connect', async () => {
    await persistSelectedChannel(true)
    await hermesApi.connectChannel(channelId)
    await refreshChannels()
  }, false)
}

async function startPairing() {
  const channel = selectedChannel.value
  if (!channel) return
  await runAction('pairing', async () => {
    pairing.value = await hermesApi.startChannelPairing(channel.id)
    pairingQr.value = pairing.value?.qrContent
      ? await QRCode.toDataURL(String(pairing.value.qrContent), { width: 240, margin: 1 })
      : ''
    schedulePairingPoll()
  }, false)
}

function schedulePairingPoll() {
  if (pairingTimer) clearTimeout(pairingTimer)
  if (!pairing.value || !['waiting', 'scanned'].includes(pairing.value.state)) return
  pairingTimer = setTimeout(async () => {
    try {
      pairing.value = await hermesApi.pollChannelPairing(pairing.value.pairingId)
      if (pairing.value.state === 'connected') await refreshChannels()
    } catch (error) {
      message.value = errorMessage(error)
    }
    schedulePairingPoll()
  }, 2000)
}

async function cancelPairing() {
  if (pairingTimer) clearTimeout(pairingTimer)
  if (pairing.value?.pairingId) await hermesApi.cancelChannelPairing(pairing.value.pairingId)
  pairing.value = null
  pairingQr.value = ''
}

async function refreshBackups() {
  backups.value = await hermesApi.listBackups()
}

async function refreshMemory() {
  memory.value = await hermesApi.getMemoryStatus()
}

async function refreshDiagnostics() {
  diagnostics.value = await hermesApi.getDiagnostics()
}

async function selectTab(tab: PanelTab) {
  activeTab.value = tab
  message.value = ''
  try {
    if (tab === 'models') await refreshModels()
    if (tab === 'skills') await refreshSkills()
    if (tab === 'channels') await refreshChannels()
    if (tab === 'memory') await refreshMemory()
    if (tab === 'backups') await refreshBackups()
    if (tab === 'diagnostics') await refreshDiagnostics()
  } catch (error) {
    message.value = errorMessage(error)
  }
}

onMounted(async () => {
  unsubscribeManagement = hermesApi.subscribeManagementEvents((status: any) => {
    installation.value = status
  })
  try {
    await refreshOverview()
    await selectTab(activeTab.value)
  } catch (error) {
    message.value = errorMessage(error)
  }
})

onBeforeUnmount(() => {
  unsubscribeManagement?.()
  if (pairingTimer) clearTimeout(pairingTimer)
})
</script>

<template>
  <section class="hermes-center" :class="{ 'is-embedded': embedded }">
    <header class="hermes-center__header">
      <div>
        <span class="hermes-center__kicker">Hermes</span>
        <h2>{{ t('settings.hermesManagement.title') }}</h2>
        <p>{{ t('settings.hermesManagement.subtitle') }}</p>
      </div>
      <div class="hermes-status" :class="`is-${statusTone}`">
        <i></i>
        <span>{{ t(`settings.hermesManagement.states.${runtime.state || installation.state || 'missing'}`) }}</span>
      </div>
    </header>

    <nav v-if="tabs.length > 1" class="hermes-tabs" :aria-label="t('settings.hermesManagement.title')">
      <button v-for="tab in tabs" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" @click="selectTab(tab.id)">
        <component :is="tab.icon" :size="15" />
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <div v-if="message" class="hermes-message">{{ message }}</div>

    <div v-if="activeTab === 'runtime'" class="hermes-content">
      <div class="runtime-metrics">
        <div><span>{{ t('settings.hermesManagement.runtime.installed') }}</span><strong>{{ installation.installedVersion || '-' }}</strong></div>
        <div><span>{{ t('settings.hermesManagement.runtime.target') }}</span><strong>{{ installation.targetVersion || '-' }}</strong></div>
        <div><span>{{ t('settings.hermesManagement.runtime.dashboard') }}</span><strong>{{ runtime.state }}</strong></div>
        <div><span>{{ t('settings.hermesManagement.runtime.gateway') }}</span><strong>{{ gateway.running ? t('settings.hermesManagement.running') : t('settings.hermesManagement.stopped') }}</strong></div>
      </div>
      <div class="hermes-actions">
        <button v-if="installation.state === 'missing'" class="primary-button" type="button" :disabled="!!busy" @click="runAction('install', () => hermesApi.installRuntime())"><CloudDownload :size="15" />{{ t('settings.hermesManagement.runtime.install') }}</button>
        <button v-if="canUpdate" class="primary-button" type="button" :disabled="!!busy" @click="runAction('update', () => hermesApi.updateRuntime())"><CloudDownload :size="15" />{{ t('settings.hermesManagement.runtime.update') }}</button>
        <button class="ghost-button" type="button" :disabled="!!busy" @click="runAction('repair', () => hermesApi.repairRuntime())"><Wrench :size="15" />{{ t('settings.hermesManagement.runtime.repair') }}</button>
        <button v-if="!runtimeReady" class="ghost-button" type="button" :disabled="!!busy" @click="runAction('start', () => hermesApi.startRuntime())"><Play :size="15" />{{ t('settings.hermesManagement.runtime.start') }}</button>
        <button v-else class="ghost-button" type="button" :disabled="!!busy" @click="runAction('stop', () => hermesApi.stopRuntime())"><CircleStop :size="15" />{{ t('settings.hermesManagement.runtime.stop') }}</button>
        <button class="ghost-button" type="button" :disabled="!!busy" @click="runAction('restart', () => hermesApi.restartRuntime())"><RotateCcw :size="15" />{{ t('settings.hermesManagement.runtime.restart') }}</button>
        <button class="ghost-button" type="button" :disabled="!!busy || !runtimeReady" @click="runAction('gateway', () => gateway.running ? hermesApi.stopGateway() : hermesApi.startGateway())"><Radio :size="15" />{{ gateway.running ? t('settings.hermesManagement.runtime.stopGateway') : t('settings.hermesManagement.runtime.startGateway') }}</button>
      </div>
      <div class="path-list"><span>{{ installation.root }}</span><span>{{ installation.profileDir }}</span></div>
      <pre v-if="installation.logs?.length || runtime.logs?.length" class="hermes-log">{{ [...(installation.logs || []), ...(runtime.logs || [])].slice(-80).join('\n') }}</pre>
    </div>

    <div v-else-if="activeTab === 'models'" class="hermes-content form-content">
      <div class="form-grid compact">
        <label><span>{{ t('settings.hermesManagement.models.provider') }}</span><select v-model="modelProvider"><option v-for="provider in modelOptions.providers" :key="provider.slug" :value="provider.slug">{{ provider.name }}{{ provider.authenticated ? ' - connected' : '' }}</option></select></label>
        <label><span>{{ t('settings.hermesManagement.models.model') }}</span><select v-model="modelName"><option v-for="model in modelOptions.providers?.find((item: any) => item.slug === modelProvider)?.models || []" :key="model" :value="model">{{ model }}</option></select></label>
        <label class="wide"><span>{{ t('settings.hermesManagement.models.apiKey') }}</span><input v-model="modelApiKey" type="password" autocomplete="new-password" :placeholder="t('settings.hermesManagement.models.keepKey')" /></label>
      </div>
      <div class="hermes-actions"><button class="primary-button" type="button" :disabled="!!busy" @click="saveModel">{{ t('settings.hermesManagement.save') }}</button><button class="ghost-button" type="button" :disabled="!!busy" @click="runAction('app-model', () => hermesApi.useApplicationModel().then(refreshModels), false)">{{ t('settings.hermesManagement.models.useApp') }}</button><button class="ghost-button" type="button" :disabled="!!busy" @click="runAction('test-model', () => hermesApi.testModelConnection(), false)">{{ t('settings.hermesManagement.test') }}</button></div>
    </div>

    <div v-else-if="activeTab === 'skills'" class="hermes-content">
      <div class="search-row"><Search :size="16" /><input v-model="skillQuery" :placeholder="t('settings.hermesManagement.skills.search')" @keyup.enter="searchSkills" /><button class="primary-button" type="button" :disabled="!!busy" @click="searchSkills">{{ t('settings.hermesManagement.search') }}</button><button class="ghost-button" type="button" :disabled="!!busy" @click="runAction('skills-update', () => hermesApi.updateSkills().then(refreshSkills), false)">{{ t('settings.hermesManagement.skills.updateAll') }}</button></div>
      <div v-if="skillResults.length" class="management-list"><article v-for="item in skillResults" :key="item.identifier"><div><strong>{{ item.name }}</strong><p>{{ item.description }}</p><small>{{ item.source || item.repo }}</small></div><button class="primary-button" type="button" :disabled="!!busy" @click="installSkill(item.identifier)">{{ t('settings.hermesManagement.skills.install') }}</button></article></div>
      <div class="management-list"><article v-for="skill in skills" :key="skill.name"><div><strong>{{ skill.name }}</strong><p>{{ skill.description }}</p><small>{{ skill.path || skill.category }}</small></div><div class="row-actions"><button class="ghost-button" type="button" :disabled="!!busy" @click="runAction(`toggle-${skill.name}`, () => hermesApi.setSkillEnabled({ name: skill.name, enabled: !skill.enabled }).then(refreshSkills), false)">{{ skill.enabled ? t('settings.hermesManagement.disable') : t('settings.hermesManagement.enable') }}</button><button class="danger-button" type="button" :disabled="!!busy" @click="confirmAction(t('settings.hermesManagement.skills.confirmUninstall', { name: skill.name })) && runAction(`remove-${skill.name}`, () => hermesApi.uninstallSkill(skill.name).then(refreshSkills), false)">{{ t('settings.hermesManagement.uninstall') }}</button></div></article></div>
    </div>

    <div v-else-if="activeTab === 'channels'" class="hermes-channel-layout">
      <aside class="channel-list"><button v-for="channel in channels" :key="channel.id" type="button" :class="{ active: selectedChannelId === channel.id }" @click="selectedChannelId = channel.id; resetChannelValues()"><span>{{ channel.name }}</span><i :class="{ connected: channel.connected }"></i></button></aside>
      <div v-if="selectedChannel" class="hermes-content form-content">
        <div class="channel-heading"><div><h3>{{ selectedChannel.name }}</h3><p>{{ selectedChannel.description }}</p></div><label class="switch-row"><input v-model="selectedChannel.enabled" type="checkbox" />{{ t('settings.hermesManagement.channels.enabled') }}</label></div>
        <div class="form-grid compact"><label v-for="field in selectedChannel.fields" :key="field.key" :class="{ wide: field.description?.length > 60 }"><span>{{ field.prompt }}{{ field.required ? ' *' : '' }}</span><input v-model="channelValues[field.key]" :type="field.password ? 'password' : 'text'" :placeholder="field.configured ? field.redactedValue || t('settings.hermesManagement.channels.configured') : ''" /><small>{{ field.description }}</small></label></div>
        <div class="hermes-actions"><button class="primary-button" type="button" :disabled="!!busy" @click="saveChannel">{{ t('settings.hermesManagement.save') }}</button><button class="ghost-button" type="button" :disabled="!!busy" @click="testSelectedChannel">{{ t('settings.hermesManagement.test') }}</button><button class="ghost-button" type="button" :disabled="!!busy" @click="connectSelectedChannel">{{ t('settings.hermesManagement.connect') }}</button><button v-if="['wecom', 'weixin'].includes(selectedChannel.id)" class="ghost-button" type="button" :disabled="!!busy" @click="startPairing">{{ t('settings.hermesManagement.channels.scan') }}</button><button class="danger-button" type="button" :disabled="!!busy" @click="runAction('channel-disconnect', () => hermesApi.disconnectChannel(selectedChannel!.id).then(refreshChannels), false)">{{ t('settings.hermesManagement.disconnect') }}</button></div>
        <div v-if="pairing" class="pairing-box"><img v-if="pairingQr" :src="pairingQr" :alt="t('settings.hermesManagement.channels.qr')" /><div><strong>{{ t(`settings.hermesManagement.channels.pairing.${pairing.state}`) }}</strong><p>{{ t('settings.hermesManagement.channels.pairingHint') }}</p><button class="ghost-button" type="button" @click="cancelPairing">{{ t('settings.hermesManagement.cancel') }}</button></div></div>
      </div>
    </div>

    <div v-else-if="activeTab === 'memory'" class="hermes-content"><div class="section-toolbar"><p>{{ t('settings.hermesManagement.memory.description') }}</p><button class="ghost-button" type="button" @click="refreshMemory"><RefreshCw :size="15" />{{ t('settings.hermesManagement.refresh') }}</button></div><pre class="hermes-log">{{ JSON.stringify(memory, null, 2) }}</pre></div>

    <div v-else-if="activeTab === 'backups'" class="hermes-content"><div class="section-toolbar"><p>{{ t('settings.hermesManagement.backups.description') }}</p><button class="primary-button" type="button" :disabled="!!busy" @click="runAction('backup', () => hermesApi.createBackup().then(refreshBackups), false)"><DatabaseBackup :size="15" />{{ t('settings.hermesManagement.backups.create') }}</button></div><div class="management-list"><article v-for="backup in backups" :key="backup.path"><div><strong>{{ backup.name }}</strong><p>{{ new Date(backup.modifiedAt).toLocaleString() }}</p><small>{{ Math.round(backup.size / 1024 / 1024 * 10) / 10 }} MB</small></div></article><p v-if="!backups.length" class="empty-state">{{ t('settings.hermesManagement.backups.empty') }}</p></div></div>

    <div v-else class="hermes-content"><div class="section-toolbar"><p>{{ t('settings.hermesManagement.diagnostics.description') }}</p><button class="ghost-button" type="button" @click="refreshDiagnostics"><RefreshCw :size="15" />{{ t('settings.hermesManagement.refresh') }}</button></div><pre class="hermes-log">{{ JSON.stringify(diagnostics, null, 2) }}</pre></div>
  </section>
</template>

<style scoped>
.hermes-center { display: grid; gap: 14px; padding: 16px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel); color: var(--theme-text); }
.hermes-center.is-embedded { padding: 0; border: 0; background: transparent; }
.hermes-center__header, .channel-heading, .section-toolbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.hermes-center__kicker { color: var(--theme-accent); font-size: 10px; font-weight: 800; text-transform: uppercase; }
h2, h3, p { margin: 0; }
h2 { margin-top: 3px; font-size: 18px; }
h3 { font-size: 15px; }
.hermes-center__header p, .channel-heading p, .section-toolbar p, article p, label small { margin-top: 4px; color: var(--theme-text-muted); font-size: 11px; }
.hermes-status { display: flex; align-items: center; gap: 7px; padding: 6px 9px; border: 1px solid var(--theme-border); border-radius: 7px; font-size: 11px; font-weight: 700; }
.hermes-status i, .channel-list i { width: 7px; height: 7px; border-radius: 50%; background: #ef4444; }
.hermes-status.is-ready i, .channel-list i.connected { background: #22c55e; }
.hermes-status.is-busy i { background: #f59e0b; }
.hermes-tabs { display: flex; overflow-x: auto; gap: 3px; border-bottom: 1px solid var(--theme-border); }
.hermes-tabs button { display: flex; align-items: center; flex: 0 0 auto; gap: 6px; padding: 9px 10px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--theme-text-muted); font-size: 11px; }
.hermes-tabs button.active { border-bottom-color: var(--theme-accent); color: var(--theme-text); }
.hermes-message { padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--theme-accent) 35%, var(--theme-border)); border-radius: 6px; background: color-mix(in srgb, var(--theme-accent) 8%, transparent); font-size: 11px; }
.hermes-content { display: grid; min-width: 0; gap: 12px; }
.runtime-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.runtime-metrics div { display: grid; gap: 5px; padding: 10px; border-left: 2px solid var(--theme-accent); background: var(--theme-panel-soft); }
.runtime-metrics span, .path-list { color: var(--theme-text-muted); font-size: 10px; }
.runtime-metrics strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; }
.hermes-actions, .row-actions, .search-row { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.hermes-actions button, .row-actions button, .search-row button, .section-toolbar button { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px; border-radius: 6px; }
.path-list { display: grid; gap: 3px; overflow-wrap: anywhere; }
.hermes-log { overflow: auto; max-height: 280px; margin: 0; padding: 11px; border: 1px solid var(--theme-border); border-radius: 6px; background: var(--theme-input); color: var(--theme-text-muted); font: 10px/1.55 Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.form-grid.compact { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.form-grid label { display: grid; min-width: 0; gap: 5px; color: var(--theme-text); font-size: 11px; font-weight: 650; }
.form-grid label.wide { grid-column: 1 / -1; }
.form-grid input, .form-grid select, .search-row input { min-width: 0; height: 34px; padding: 0 9px; border: 1px solid var(--theme-border); border-radius: 6px; background: var(--theme-input); color: var(--theme-text); outline: none; }
.search-row input { flex: 1 1 220px; }
.management-list { display: grid; gap: 1px; border: 1px solid var(--theme-border); }
.management-list article { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 10px; background: var(--theme-panel-soft); }
.management-list article + article { border-top: 1px solid var(--theme-border); }
.management-list article > div:first-child { min-width: 0; }
.management-list strong, .management-list p, .management-list small { display: block; overflow: hidden; text-overflow: ellipsis; }
.management-list small { margin-top: 3px; color: var(--theme-text-muted); font-size: 9px; }
.danger-button { border: 1px solid color-mix(in srgb, #ef4444 45%, var(--theme-border)); background: transparent; color: #ef4444; }
.hermes-channel-layout { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 12px; }
.channel-list { display: grid; align-content: start; gap: 3px; }
.channel-list button { display: flex; align-items: center; justify-content: space-between; min-height: 36px; padding: 0 10px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--theme-text-muted); text-align: left; }
.channel-list button.active { border-color: var(--theme-border); background: var(--theme-panel-soft); color: var(--theme-text); }
.switch-row { display: flex; align-items: center; gap: 7px; font-size: 11px; }
.pairing-box { display: flex; align-items: center; gap: 16px; padding: 12px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.pairing-box img { width: 180px; height: 180px; object-fit: contain; background: #fff; }
.empty-state { padding: 16px; color: var(--theme-text-muted); text-align: center; font-size: 11px; }
@media (max-width: 900px) { .runtime-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .hermes-channel-layout { grid-template-columns: 1fr; } .channel-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .hermes-center__header, .channel-heading, .section-toolbar { align-items: stretch; flex-direction: column; } .runtime-metrics, .form-grid.compact { grid-template-columns: 1fr; } .pairing-box { align-items: flex-start; flex-direction: column; } .management-list article { align-items: flex-start; flex-direction: column; } }
</style>
