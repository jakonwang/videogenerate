<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Check, Download, Power, Search, Trash2, Wrench } from 'lucide-vue-next'
import { webApiClient, type PluginDetail, type PluginSummary } from '@/lib/webApiClient'

type WorkspaceMode = 'market' | 'installed'
type LocalPluginState = Record<string, { status: PluginSummary['status']; enabled: boolean }>

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const actionBusy = ref(false)
const notice = ref('')
const errorText = ref('')
const searchKeyword = ref('')
const workspace = ref<WorkspaceMode>('market')
const plugins = ref<PluginSummary[]>([])
const selectedPluginId = ref('')
const LOCAL_PLUGIN_STATE_KEY = 'videogen-desktop-plugin-state'

const fallbackPlugins: PluginSummary[] = [
  {
    id: 'video-parser-download',
    name: '视频解析下载',
    category: 'video_download',
    description: '用于短视频链接解析与下载的入口插件。',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/video-parser-download',
    status: 'uninstalled',
    enabled: false,
  },
  {
    id: 'video-batch-watermark',
    name: '视频批量加水印',
    category: 'video_processing',
    description: '用于批量处理视频水印参数与模板的入口插件。',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/video-batch-watermark',
    status: 'uninstalled',
    enabled: false,
  },
  {
    id: 'video-batch-subtitle',
    name: '视频批量加字幕',
    category: 'video_processing',
    description: '用于字幕样式、烧录开关与导出规则的入口插件。',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/video-batch-subtitle',
    status: 'uninstalled',
    enabled: false,
  },
  {
    id: 'geelark-publisher',
    name: 'Geelark 发布插件',
    category: 'video_processing',
    description: '用于把复刻成片发布到 Geelark 云手机，并创建 TikTok 发布挂车任务。',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/geelark-publisher',
    status: 'uninstalled',
    enabled: false,
  },
]

function readLocalPluginState(): LocalPluginState {
  try {
    const raw = localStorage.getItem(LOCAL_PLUGIN_STATE_KEY)?.trim()
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LocalPluginState
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLocalPluginState(state: LocalPluginState) {
  localStorage.setItem(LOCAL_PLUGIN_STATE_KEY, JSON.stringify(state))
}

function mergeLocalPluginState(source: PluginSummary[]) {
  const state = readLocalPluginState()
  return source.map((item) => {
    const local = state[item.id]
    if (!local) return item
    return {
      ...item,
      status: local.status,
      enabled: local.status === 'installed' ? Boolean(local.enabled) : false,
    }
  })
}

function mergePluginCatalogWithFallback(source: PluginSummary[]) {
  const merged = new Map<string, PluginSummary>()
  for (const item of fallbackPlugins) {
    merged.set(item.id, item)
  }
  for (const item of source) {
    merged.set(item.id, {
      ...(merged.get(item.id) || item),
      ...item,
    })
  }
  return [...merged.values()]
}

function saveLocalPluginItem(pluginId: string, patch: { status?: PluginSummary['status']; enabled?: boolean }) {
  const current = readLocalPluginState()
  const prev = current[pluginId] || { status: 'uninstalled' as const, enabled: false }
  current[pluginId] = {
    status: patch.status ?? prev.status,
    enabled: patch.status === 'uninstalled' ? false : (patch.enabled ?? prev.enabled),
  }
  writeLocalPluginState(current)
}

const filteredPlugins = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const source = workspace.value === 'installed' ? plugins.value.filter((item) => item.status === 'installed') : plugins.value
  if (!keyword) return source
  return source.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(keyword))
})

const selectedPlugin = computed(() => {
  return plugins.value.find((item) => item.id === selectedPluginId.value) ?? filteredPlugins.value[0] ?? null
})

function syncRoute() {
  void router.replace({
    path: '/plugins',
    query: {
      ...(workspace.value === 'installed' ? { tab: 'installed' } : {}),
      ...(selectedPluginId.value ? { plugin: selectedPluginId.value } : {}),
    },
  })
}

function pluginStatusText(plugin: PluginSummary | PluginDetail) {
  if (plugin.status !== 'installed') return '未安装'
  return plugin.enabled ? '已启用' : '已停用'
}

function pluginCategoryText(plugin: PluginSummary | PluginDetail) {
  if (plugin.id === 'geelark-publisher') return '发布插件'
  if (plugin.category === 'video_download') return '下载工具'
  return '视频处理'
}

function pluginIconText(plugin: PluginSummary | PluginDetail) {
  if (plugin.id === 'geelark-publisher') return 'GK'
  if (plugin.id === 'video-parser-download') return 'DL'
  if (plugin.id === 'video-batch-watermark') return 'WM'
  if (plugin.id === 'video-batch-subtitle') return 'CC'
  return 'VG'
}

function pluginCardTone(plugin: PluginSummary | PluginDetail) {
  if (plugin.id === 'geelark-publisher') return 'tone-cyan'
  if (plugin.id === 'video-parser-download') return 'tone-violet'
  if (plugin.id === 'video-batch-watermark') return 'tone-blue'
  return 'tone-green'
}

function isDirectWorkspacePlugin(plugin: PluginSummary | PluginDetail) {
  return plugin.id === 'geelark-publisher'
}

function primaryActionText(plugin: PluginSummary) {
  if (isDirectWorkspacePlugin(plugin)) return '打开工作台'
  if (plugin.status !== 'installed') return '安装'
  if (!plugin.enabled) return '启用'
  return '使用'
}

async function loadPlugins() {
  loading.value = true
  errorText.value = ''
  try {
    plugins.value = mergeLocalPluginState(mergePluginCatalogWithFallback(await webApiClient.listPlugins()))
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
    plugins.value = mergeLocalPluginState(fallbackPlugins)
  } finally {
    loading.value = false
    if (!selectedPlugin.value && filteredPlugins.value.length) {
      selectedPluginId.value = filteredPlugins.value[0].id
    }
  }
}

async function runPluginAction(action: () => Promise<{ plugin: PluginDetail }>, successMessage: string) {
  actionBusy.value = true
  errorText.value = ''
  notice.value = ''
  try {
    const result = await action()
    notice.value = successMessage
    selectedPluginId.value = result.plugin.id
    await loadPlugins()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    actionBusy.value = false
  }
}

async function installPlugin(pluginId: string) {
  try {
    await runPluginAction(() => webApiClient.installPlugin(pluginId), '插件已安装。')
  } catch {
    // unreachable
  }
  if (!plugins.value.find((item) => item.id === pluginId)?.status || errorText.value) {
    saveLocalPluginItem(pluginId, { status: 'installed', enabled: false })
    notice.value = '插件已在桌面端本地安装。'
    errorText.value = ''
    await loadPlugins()
    selectedPluginId.value = pluginId
  }
}

async function enablePlugin(pluginId: string) {
  await runPluginAction(() => webApiClient.enablePlugin(pluginId), '插件已启用。')
  if (errorText.value) {
    saveLocalPluginItem(pluginId, { status: 'installed', enabled: true })
    notice.value = '插件已在桌面端本地启用。'
    errorText.value = ''
    await loadPlugins()
  }
}

async function disablePlugin(pluginId: string) {
  await runPluginAction(() => webApiClient.disablePlugin(pluginId), '插件已停用。')
  if (errorText.value) {
    saveLocalPluginItem(pluginId, { status: 'installed', enabled: false })
    notice.value = '插件已在桌面端本地停用。'
    errorText.value = ''
    await loadPlugins()
  }
}

async function uninstallPlugin(pluginId: string) {
  await runPluginAction(() => webApiClient.uninstallPlugin(pluginId), '插件已卸载。')
  if (errorText.value) {
    saveLocalPluginItem(pluginId, { status: 'uninstalled', enabled: false })
    notice.value = '插件已从桌面端本地卸载。'
    errorText.value = ''
    await loadPlugins()
  }
}

function openMarket() {
  workspace.value = 'market'
}

function openInstalled() {
  workspace.value = 'installed'
}

function selectPlugin(pluginId: string) {
  selectedPluginId.value = pluginId
}

function usePlugin(plugin: PluginSummary | PluginDetail) {
  if (isDirectWorkspacePlugin(plugin)) {
    void router.push('/plugins/geelark-publisher/publish-center')
    return
  }
  if (plugin.status !== 'installed') {
    errorText.value = '请先安装插件。'
    return
  }
  if (!plugin.enabled) {
    errorText.value = '请先启用插件。'
    return
  }
  void router.push(plugin.workspacePath)
}

function onPrimaryAction(plugin: PluginSummary) {
  if (isDirectWorkspacePlugin(plugin)) {
    void usePlugin(plugin)
    return
  }
  if (plugin.status !== 'installed') {
    void installPlugin(plugin.id)
    return
  }
  if (!plugin.enabled) {
    void enablePlugin(plugin.id)
    return
  }
  usePlugin(plugin)
}

watch(
  () => route.query,
  () => {
    workspace.value = String(route.query.tab || '').trim() === 'installed' ? 'installed' : 'market'
    const pluginId = String(route.query.plugin || '').trim()
    if (pluginId) selectedPluginId.value = pluginId
  },
  { immediate: true },
)

watch([workspace, selectedPluginId], () => {
  syncRoute()
})

watch(filteredPlugins, (list) => {
  if (!list.length) return
  if (!list.some((item) => item.id === selectedPluginId.value)) {
    selectedPluginId.value = list[0].id
  }
})

onMounted(async () => {
  await loadPlugins()
  const pluginId = String(route.query.plugin || '').trim()
  if (pluginId) selectedPluginId.value = pluginId
  else if (filteredPlugins.value.length) selectedPluginId.value = filteredPlugins.value[0].id
})
</script>

<template>
  <div class="plugins-page">
    <section class="hero-card">
      <div>
        <div class="hero-card__eyebrow">插件中心</div>
        <h1>{{ workspace === 'installed' ? '我的插件' : '插件市场' }}</h1>
        <p>
          {{
            workspace === 'installed'
              ? '管理已安装插件，并进入对应工作台继续使用。'
              : '发现并安装插件，扩展复刻、生产与发布能力。'
          }}
        </p>
      </div>

      <div class="hero-card__actions">
        <label class="search-box">
          <Search class="h-4 w-4" />
          <input v-model="searchKeyword" type="text" placeholder="搜索插件名称或说明" />
        </label>
        <button class="ghost-button" :class="{ active: workspace === 'market' }" type="button" @click="openMarket">插件市场</button>
        <button class="primary-button ghost-like" :class="{ active: workspace === 'installed' }" type="button" @click="openInstalled">
          <Download class="h-4 w-4" />
          我的插件
        </button>
      </div>
    </section>

    <div v-if="notice" class="banner banner--success">
      <Check class="h-4 w-4" />
      <span>{{ notice }}</span>
    </div>
    <div v-if="errorText" class="banner banner--error">
      <span>{{ errorText }}</span>
    </div>

    <section v-if="workspace === 'installed' && !filteredPlugins.length && !loading" class="empty-state">
      <strong>还没有已安装插件</strong>
      <p>先去插件市场安装一个插件，再回到这里继续使用。</p>
      <button class="primary-button" type="button" @click="openMarket">返回插件市场</button>
    </section>

    <template v-else>
      <section class="market-grid" :class="{ 'is-loading': loading }">
        <article
          v-for="plugin in filteredPlugins"
          :key="plugin.id"
          class="plugin-card"
          :class="{ selected: selectedPluginId === plugin.id }"
          @click="isDirectWorkspacePlugin(plugin) ? usePlugin(plugin) : selectPlugin(plugin.id)"
        >
          <div class="plugin-card__top">
            <div class="plugin-card__icon" :class="pluginCardTone(plugin)">{{ pluginIconText(plugin) }}</div>
            <span class="plugin-card__state" :class="{ installed: plugin.status === 'installed' }">{{ pluginStatusText(plugin) }}</span>
          </div>
          <div class="plugin-card__body">
            <h3>{{ plugin.name }}</h3>
            <p>{{ plugin.description }}</p>
          </div>
          <div class="plugin-card__meta">
            <span>{{ pluginCategoryText(plugin) }}</span>
            <span>{{ plugin.workspacePath }}</span>
          </div>
          <button class="plugin-card__action" type="button" :disabled="actionBusy" @click.stop="onPrimaryAction(plugin)">
            <span>{{ primaryActionText(plugin) }}</span>
            <ArrowRight v-if="plugin.status === 'installed' && plugin.enabled" class="h-4 w-4" />
          </button>
        </article>
      </section>

      <section v-if="selectedPlugin" class="detail-card">
        <div class="detail-card__hero">
          <div class="detail-card__icon" :class="pluginCardTone(selectedPlugin)">{{ pluginIconText(selectedPlugin) }}</div>
          <div class="detail-card__copy">
            <div class="detail-card__eyebrow">插件详情</div>
            <h2>{{ selectedPlugin.name }}</h2>
            <p>{{ selectedPlugin.description }}</p>
          </div>
        </div>

        <div class="detail-card__chips">
          <span>{{ pluginStatusText(selectedPlugin) }}</span>
          <span>{{ pluginCategoryText(selectedPlugin) }}</span>
          <span>{{ selectedPlugin.workspacePath }}</span>
        </div>

        <div class="detail-card__actions">
          <button
            v-if="!isDirectWorkspacePlugin(selectedPlugin) && selectedPlugin.status !== 'installed'"
            class="primary-button"
            type="button"
            :disabled="actionBusy"
            @click="installPlugin(selectedPlugin.id)"
          >
            安装插件
          </button>
          <button
            v-else-if="!isDirectWorkspacePlugin(selectedPlugin) && !selectedPlugin.enabled"
            class="primary-button"
            type="button"
            :disabled="actionBusy"
            @click="enablePlugin(selectedPlugin.id)"
          >
            <Power class="h-4 w-4" />
            启用插件
          </button>
          <button
            v-else
            class="primary-button"
            type="button"
            :disabled="actionBusy"
            @click="usePlugin(selectedPlugin)"
          >
            <Wrench class="h-4 w-4" />
            进入工作台
          </button>

          <button
            v-if="selectedPlugin.status === 'installed' && selectedPlugin.enabled"
            class="ghost-button"
            type="button"
            :disabled="actionBusy"
            @click="disablePlugin(selectedPlugin.id)"
          >
            停用
          </button>

          <button
            v-if="selectedPlugin.status === 'installed' && !selectedPlugin.enabled"
            class="ghost-button"
            type="button"
            :disabled="actionBusy"
            @click="enablePlugin(selectedPlugin.id)"
          >
            启用
          </button>

          <button
            v-if="selectedPlugin.status === 'installed'"
            class="danger-button"
            type="button"
            :disabled="actionBusy"
            @click="uninstallPlugin(selectedPlugin.id)"
          >
            <Trash2 class="h-4 w-4" />
            卸载
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.plugins-page {
  display: grid;
  gap: 18px;
  padding: 10px 12px 18px;
}

.hero-card,
.detail-card,
.empty-state,
.plugin-card {
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 20px;
  background: rgba(8, 13, 21, 0.78);
}

.hero-card,
.detail-card,
.empty-state {
  padding: 20px;
}

.hero-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.hero-card__eyebrow,
.detail-card__eyebrow {
  color: #86b7ff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.hero-card h1,
.detail-card h2 {
  margin: 8px 0 0;
  color: #f8fbff;
  font-size: 30px;
  font-weight: 800;
}

.hero-card p,
.detail-card p,
.empty-state p,
.plugin-card__body p {
  margin: 8px 0 0;
  color: rgba(205, 218, 236, 0.76);
  line-height: 1.65;
}

.hero-card__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 320px;
  height: 50px;
  padding: 0 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  color: #dbe7f7;
}

.search-box input {
  width: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  color: #f8fbff;
}

.banner {
  display: flex;
  align-items: center;
  gap: 8px;
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

.market-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.plugin-card {
  display: grid;
  gap: 12px;
  min-height: 228px;
  padding: 14px;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.plugin-card:hover,
.plugin-card.selected {
  border-color: rgba(96, 165, 250, 0.28);
  transform: translateY(-1px);
  box-shadow: 0 18px 30px rgba(0, 0, 0, 0.18);
}

.plugin-card__top,
.plugin-card__meta,
.detail-card__hero,
.detail-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.plugin-card__icon,
.detail-card__icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 16px;
  font-weight: 800;
}

.tone-cyan {
  background: linear-gradient(135deg, #17b7d8, #0ea5e9);
}

.tone-violet {
  background: linear-gradient(135deg, #7160ff, #8b5cf6);
}

.tone-blue {
  background: linear-gradient(135deg, #3b82f6, #38bdf8);
}

.tone-green {
  background: linear-gradient(135deg, #10b981, #22c55e);
}

.plugin-card__state,
.detail-card__chips span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: #dbe7f7;
  font-size: 11px;
  font-weight: 700;
}

.plugin-card__state.installed {
  border-color: rgba(34, 197, 94, 0.22);
  background: rgba(34, 197, 94, 0.12);
  color: #dcffe9;
}

.plugin-card__body h3 {
  margin: 0;
  color: #fff;
  font-size: 15px;
  font-weight: 800;
}

.plugin-card__body p {
  font-size: 12px;
  min-height: 40px;
}

.plugin-card__meta {
  flex-direction: column;
  align-items: flex-start;
  color: rgba(205, 218, 236, 0.7);
  font-size: 11px;
}

.plugin-card__action,
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

.plugin-card__action,
.primary-button {
  border: 1px solid rgba(96, 165, 250, 0.32);
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
}

.ghost-button {
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: rgba(255, 255, 255, 0.04);
  color: #eef5ff;
}

.ghost-like.active,
.ghost-button.active {
  border-color: rgba(96, 165, 250, 0.3);
  background: rgba(59, 130, 246, 0.16);
}

.danger-button {
  border: 1px solid rgba(248, 113, 113, 0.22);
  background: rgba(239, 68, 68, 0.12);
  color: #ffd5d5;
}

.plugin-card__action:disabled,
.primary-button:disabled,
.ghost-button:disabled,
.danger-button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.detail-card {
  display: grid;
  gap: 18px;
}

.detail-card__hero {
  justify-content: flex-start;
  align-items: flex-start;
}

.detail-card__copy {
  display: grid;
  gap: 6px;
}

.detail-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-card__actions {
  flex-wrap: wrap;
  justify-content: flex-start;
}

.empty-state {
  display: grid;
  gap: 10px;
  justify-items: center;
  text-align: center;
  padding-block: 48px;
}

.empty-state strong {
  color: #fff;
  font-size: 18px;
}

@media (max-width: 1400px) {
  .market-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 1080px) {
  .hero-card {
    flex-direction: column;
    align-items: stretch;
  }

  .hero-card__actions {
    justify-content: flex-start;
  }

  .search-box {
    min-width: 0;
    width: 100%;
  }

  .market-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .market-grid {
    grid-template-columns: 1fr;
  }
}
</style>
