<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { House, Boxes, MoreHorizontal, Settings, HelpCircle, Sparkles, Radio, Bell, UserCircle, Users, Search, Clapperboard, Image as ImageIcon, MessagesSquare } from 'lucide-vue-next'
import TitleBar from './components/TitleBar.vue'
import UiLocaleSelect from './components/UiLocaleSelect.vue'
import DsMainLayout from '../design-system/layout/MainLayout.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const helpOpen = ref(false)
const settingsOpen = ref(false)
const moreOpen = ref(false)
const settingsBusy = ref(false)
const settingsMessage = ref('')
const modelSettingsBusy = ref(false)
const modelSettingsSection = ref<'video' | 'image' | 'chat' | 'qiniu'>('video')
const settingsMode = ref<'simple' | 'pro'>('simple')
const videoAdvancedOpen = ref(false)
const imageAdvancedOpen = ref(false)
const chatAdvancedOpen = ref(false)
const modelVisibleSecrets = ref<Record<string, boolean>>({
  seedanceApiKey: false,
  klingApiKey: false,
  grsaiApiKey: false,
  openaiApiKey: false,
  apifoxApiKey: false,
  qiniuAccessKey: false,
  qiniuSecretKey: false,
})
const modelCredentials = ref({
  seedanceApiKey: '',
  seedanceHost: '',
  klingApiKey: '',
  klingHost: '',
  grsaiApiKey: '',
  grsaiHost: '',
  openaiApiKey: '',
  qiniuAccessKey: '',
  qiniuSecretKey: '',
  qiniuBucket: '',
  qiniuDomain: '',
  qiniuUploadHost: '',
  qiniuPrefix: '',
  allowMockWhenNoKey: false,
  keyframeModel: '',
  videoProviderPrimary: 'seedance',
  videoModelPrimary: 'veo_3_1-lite',
  videoProviderFallback: 'kling',
  videoModelFallback: 'kling-3.0-omni-720p-ref-audio',
  grsaiVideoModel: 'grok-video-3',
  imageProviderPrimary: 'apifox_hub',
  openaiImageModel: 'gpt-image-2',
  openaiImageQuality: 'high' as 'low' | 'medium' | 'high',
  klingImageModel: '',
  grsaiImageModel: '',
  grsaiAnalysisModel: '',
  apifoxHub: {
    enabled: false,
    baseUrl: '',
    apiKey: '',
    chatProvider: 'openai',
    chatModel: '',
    chatEndpointStyle: 'openai_chat',
    imageProvider: 'openai',
    imageModel: '',
    imageEditModel: '',
    imageEndpointStyle: 'openai_images',
    videoProvider: 'openai_video',
    textToVideoModel: '',
    imageToVideoModel: '',
    startEndVideoModel: '',
    referenceVideoModel: 'veo_3_1-lite',
    videoEndpointStyle: 'official_rest',
    defaultPollIntervalMs: 2000,
    defaultTimeoutMs: 600000,
  },
})
const shellSearch = ref('')

function normalizeVisibleProviders() {
  if (modelCredentials.value.videoProviderPrimary === 'seedance') {
    modelCredentials.value.videoProviderPrimary = 'kling'
  }
  if (modelCredentials.value.videoProviderFallback === 'seedance') {
    modelCredentials.value.videoProviderFallback = 'kling'
  }
}

function syncAi666Enablement() {
  const creds = modelCredentials.value
  const usesAi666 =
    creds.videoProviderPrimary === 'apifox_hub' ||
    creds.imageProviderPrimary === 'apifox_hub' ||
    creds.apifoxHub.enabled
  creds.apifoxHub.enabled = Boolean(usesAi666)
  if (creds.apifoxHub.enabled) {
    const fallbackVideo =
      creds.apifoxHub.referenceVideoModel ||
      creds.apifoxHub.imageToVideoModel ||
      creds.apifoxHub.textToVideoModel ||
      ai666RecommendedModels.referenceVideo
    creds.apifoxHub.referenceVideoModel = creds.apifoxHub.referenceVideoModel || fallbackVideo
    creds.apifoxHub.imageToVideoModel = creds.apifoxHub.imageToVideoModel || fallbackVideo
    creds.apifoxHub.startEndVideoModel = creds.apifoxHub.startEndVideoModel || fallbackVideo
    creds.apifoxHub.textToVideoModel = creds.apifoxHub.textToVideoModel || fallbackVideo
  }
}

const navItems = computed(() => [
  { to: '/home', icon: House, label: '主页', active: route.path.includes('/home') },
  {
    to: '/products',
    icon: Boxes,
    label: '生产',
    active: ['/products', '/templates', '/tasks', '/production'].some((path) => route.path.includes(path)),
  },
  { to: '/models', icon: Users, label: '模特', active: route.path.includes('/models') },
  { to: '/clone', icon: Sparkles, label: '复刻', active: route.path.includes('/clone') },
  { to: '/live-slicer', icon: Radio, label: '切片', active: route.path.includes('/live-slicer') },
])

const settingsMessageTone = computed(() => {
  const text = String(settingsMessage.value || '').trim()
  if (!text) return 'neutral'
  if (
    text.includes('已保存') ||
    text.includes('已读取') ||
    text.includes('已打开') ||
    text.includes('已开始')
  ) {
    return 'success'
  }
  return 'error'
})

function go(path: string, query?: Record<string, string>) {
  void router.push({ path, query })
}

function openCloudWorkspace() {
  go('/products', { ws: 'cloud' })
}

function quickExport() {
  go('/tasks', { ws: 'media', quickStart: String(Date.now()) })
}

function openHelpModal() {
  helpOpen.value = true
}

function openSettingsModal() {
  settingsMessage.value = ''
  modelSettingsSection.value = 'video'
  settingsMode.value = 'simple'
  videoAdvancedOpen.value = false
  imageAdvancedOpen.value = false
  chatAdvancedOpen.value = false
  settingsOpen.value = true
  void refreshModelSettings()
}

function openLicenseCenter() {
  settingsOpen.value = false
  void router.push('/auth')
}

async function refreshModelSettings() {
  modelSettingsBusy.value = true
  try {
    const next = (await window.api.clone.getModelCredentials()) as typeof modelCredentials.value
    modelCredentials.value = { ...modelCredentials.value, ...next }
    normalizeVisibleProviders()
    syncAi666Enablement()
    settingsMessage.value = '已读取当前配置'
  } catch (e: any) {
    settingsMessage.value = `读取配置失败：${e?.message ?? String(e)}`
  } finally {
    modelSettingsBusy.value = false
  }
}

async function saveModelSettings() {
  modelSettingsBusy.value = true
  settingsMessage.value = ''
  try {
    normalizeVisibleProviders()
    syncAi666Enablement()
    const payload = JSON.parse(JSON.stringify(modelCredentials.value))
    await window.api.clone.setModelCredentials(payload)
    const confirmed = (await window.api.clone.getModelCredentials()) as typeof modelCredentials.value
    modelCredentials.value = { ...modelCredentials.value, ...confirmed }
    const savedVideoProvider = modelCredentials.value.videoProviderPrimary
    const savedVideoModel = String(videoPrimaryModelBinding.value || '').trim()
    const savedImageModel = String(imagePrimaryModelBinding.value || '').trim()
    const savedChatModel = String(chatPrimaryModelBinding.value || '').trim()
    if (!savedVideoProvider || !savedVideoModel || !savedImageModel || !savedChatModel) {
      throw new Error('保存后回显不完整，请检查设置项是否已正确填写')
    }
    settingsMessage.value = '模型配置已保存并重新加载'
  } catch (e: any) {
    settingsMessage.value = `保存失败：${e?.message ?? String(e)}`
  } finally {
    modelSettingsBusy.value = false
  }
}

function toggleModelSecret(key: string) {
  modelVisibleSecrets.value[key] = !modelVisibleSecrets.value[key]
}

function modelSecretType(key: string) {
  return modelVisibleSecrets.value[key] ? 'text' : 'password'
}

function applyAi666VideoModel(field: 'textToVideoModel' | 'imageToVideoModel' | 'startEndVideoModel' | 'referenceVideoModel', value: string) {
  modelCredentials.value.apifoxHub[field] = value
}

function applyAi666ImageModel(field: 'imageModel' | 'imageEditModel', value: string) {
  modelCredentials.value.apifoxHub[field] = value
}

function applyAi666ChatModel(value: string) {
  modelCredentials.value.apifoxHub.chatModel = value
}

const activeVideoProviderLabel = computed(() => {
  if (modelCredentials.value.videoProviderPrimary === 'apifox_hub') return 'ai666'
  if (modelCredentials.value.videoProviderPrimary === 'kling') return 'AtlasCloud'
  if (modelCredentials.value.videoProviderPrimary === 'grsai') return 'GRS.AI'
  return 'AtlasCloud'
})

const activeImageProviderLabel = computed(() => {
  if (modelCredentials.value.imageProviderPrimary === 'apifox_hub') return 'ai666'
  if (modelCredentials.value.imageProviderPrimary === 'kling') return 'AtlasCloud'
  if (modelCredentials.value.imageProviderPrimary === 'grsai') return 'GRS.AI'
  return 'ai666'
})

const activeChatProviderLabel = computed(() => (modelCredentials.value.apifoxHub.enabled ? 'ai666' : 'GRS.AI'))

const activeVideoModelSummary = computed(() => String(videoPrimaryModelBinding.value || '未设置').trim() || '未设置')
const activeImageModelSummary = computed(() => String(imagePrimaryModelBinding.value || '未设置').trim() || '未设置')
const activeChatModelSummary = computed(() => String(chatPrimaryModelBinding.value || '未设置').trim() || '未设置')

const videoPrimaryModelBinding = computed({
  get: () => {
    const creds = modelCredentials.value
    if (creds.videoProviderPrimary === 'apifox_hub') {
      return creds.apifoxHub.referenceVideoModel || creds.apifoxHub.imageToVideoModel || creds.apifoxHub.textToVideoModel || ''
    }
    if (creds.videoProviderPrimary === 'kling') return creds.videoModelFallback || ''
    if (creds.videoProviderPrimary === 'grsai') return creds.grsaiVideoModel || ''
    return creds.videoModelPrimary || ''
  },
  set: (value: string) => {
    const creds = modelCredentials.value
    if (creds.videoProviderPrimary === 'apifox_hub') {
      creds.apifoxHub.referenceVideoModel = value
      if (!creds.apifoxHub.imageToVideoModel) creds.apifoxHub.imageToVideoModel = value
      if (!creds.apifoxHub.textToVideoModel) creds.apifoxHub.textToVideoModel = value
      return
    }
    if (creds.videoProviderPrimary === 'kling') {
      creds.videoModelFallback = value
      return
    }
    if (creds.videoProviderPrimary === 'grsai') {
      creds.grsaiVideoModel = value
      return
    }
    creds.videoModelPrimary = value
  },
})

const imagePrimaryModelBinding = computed({
  get: () => {
    const creds = modelCredentials.value
    if (creds.imageProviderPrimary === 'apifox_hub') return creds.apifoxHub.imageModel || ''
    if (creds.imageProviderPrimary === 'kling') return creds.klingImageModel || ''
    if (creds.imageProviderPrimary === 'grsai') return creds.grsaiImageModel || ''
    return creds.apifoxHub.imageModel || creds.openaiImageModel || ''
  },
  set: (value: string) => {
    const creds = modelCredentials.value
    if (creds.imageProviderPrimary === 'apifox_hub') {
      creds.apifoxHub.imageModel = value
      return
    }
    if (creds.imageProviderPrimary === 'kling') {
      creds.klingImageModel = value
      return
    }
    if (creds.imageProviderPrimary === 'grsai') {
      creds.grsaiImageModel = value
      return
    }
    creds.apifoxHub.imageModel = value
    creds.openaiImageModel = value
  },
})

const chatPrimaryModelBinding = computed({
  get: () => {
    const creds = modelCredentials.value
    if (creds.apifoxHub.enabled || String(creds.apifoxHub.chatModel || '').trim()) {
      return creds.apifoxHub.chatModel || ''
    }
    return creds.grsaiAnalysisModel || ''
  },
  set: (value: string) => {
    const creds = modelCredentials.value
    if (creds.apifoxHub.baseUrl || creds.apifoxHub.apiKey || creds.apifoxHub.chatModel) {
      creds.apifoxHub.chatModel = value
      return
    }
    creds.grsaiAnalysisModel = value
  },
})

const isSimpleMode = computed(() => settingsMode.value === 'simple')

const ai666RecommendedModels = {
  chat: 'gpt-4.1-mini',
  image: 'gpt-image-1',
  referenceVideo: 'google/veo3.1-lite/image-to-video',
  textVideo: 'google/veo3.1-lite/image-to-video',
}

const ai666VideoModelOptions = [
  'google/veo3.1-lite/image-to-video',
  'google/veo3.1-fast/image-to-video',
  'bytedance/seedance-2.0/reference-to-video',
  'bytedance/seedance-1.0-pro',
  'kling/v1.6-image-to-video',
  'vidu/q1-image-to-video',
]

const ai666ImageModelOptions = [
  'gpt-image-1',
  'gemini-2.5-flash-image-preview',
  'jimeng-3.0',
  'midjourney-v6.1',
]

const ai666ChatModelOptions = [
  'gpt-4.1-mini',
  'gpt-4.1',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'claude-3.7-sonnet',
]

function applyRecommendedPreset(kind: 'starter_hub' | 'starter_atlas') {
  if (kind === 'starter_hub') {
    modelCredentials.value.videoProviderPrimary = 'apifox_hub'
    modelCredentials.value.imageProviderPrimary = 'apifox_hub'
    modelCredentials.value.apifoxHub.enabled = true
    modelCredentials.value.apifoxHub.videoProvider = 'veo'
    modelCredentials.value.apifoxHub.videoEndpointStyle = 'official_rest'
    modelCredentials.value.apifoxHub.referenceVideoModel = modelCredentials.value.apifoxHub.referenceVideoModel || ai666RecommendedModels.referenceVideo
    modelCredentials.value.apifoxHub.imageToVideoModel = modelCredentials.value.apifoxHub.imageToVideoModel || modelCredentials.value.apifoxHub.referenceVideoModel
    modelCredentials.value.apifoxHub.textToVideoModel = modelCredentials.value.apifoxHub.textToVideoModel || modelCredentials.value.apifoxHub.referenceVideoModel
    modelCredentials.value.apifoxHub.imageProvider = 'openai'
    modelCredentials.value.apifoxHub.imageEndpointStyle = 'openai_images'
    modelCredentials.value.apifoxHub.imageModel = modelCredentials.value.apifoxHub.imageModel || ai666RecommendedModels.image
    modelCredentials.value.apifoxHub.chatProvider = 'openai'
    modelCredentials.value.apifoxHub.chatEndpointStyle = 'openai_chat'
    modelCredentials.value.apifoxHub.chatModel = modelCredentials.value.apifoxHub.chatModel || ai666RecommendedModels.chat
    settingsMessage.value = '已填入推荐配置：ai666 优先'
    return
  }
  if (kind === 'starter_atlas') {
    modelCredentials.value.videoProviderPrimary = 'kling'
    modelCredentials.value.videoModelFallback = 'google/veo3.1-lite/image-to-video'
    modelCredentials.value.imageProviderPrimary = 'apifox_hub'
    modelCredentials.value.apifoxHub.enabled = true
    modelCredentials.value.apifoxHub.imageProvider = 'openai'
    modelCredentials.value.apifoxHub.imageEndpointStyle = 'openai_images'
    modelCredentials.value.apifoxHub.imageModel = modelCredentials.value.apifoxHub.imageModel || ai666RecommendedModels.image
    modelCredentials.value.apifoxHub.chatProvider = 'openai'
    modelCredentials.value.apifoxHub.chatEndpointStyle = 'openai_chat'
    modelCredentials.value.apifoxHub.chatModel = modelCredentials.value.apifoxHub.chatModel || ai666RecommendedModels.chat
    modelCredentials.value.grsaiAnalysisModel = modelCredentials.value.grsaiAnalysisModel || 'gpt-4.1-mini'
    settingsMessage.value = '已填入推荐配置：AtlasCloud 视频 + ai666 图片 / 对话'
    return
  }
}

async function openDataDir() {
  try {
    const paths = (await window.api.getPaths()) as { dataDir?: string }
    const dir = String(paths?.dataDir ?? '').trim()
    if (!dir) {
      settingsMessage.value = '未找到本地数据目录'
      return
    }
    await window.api.shell.openPath(dir)
    settingsMessage.value = '已打开本地数据目录'
  } catch (e: any) {
    settingsMessage.value = `打开数据目录失败：${e?.message ?? String(e)}`
  }
}

async function checkUpdatesNow() {
  if (settingsBusy.value) return
  settingsBusy.value = true
  settingsMessage.value = ''
  try {
    const res = (await window.api.updater.checkForUpdates()) as
      | { ok: true }
      | { ok: false; reason?: 'not_packaged' | 'url_not_configured' | 'check_failed'; message?: string }
    if (res?.ok) {
      settingsMessage.value = '已开始检查更新'
      return
    }
    if (res?.reason === 'not_packaged') {
      settingsMessage.value = '当前开发环境不支持在线更新'
      return
    }
    if (res?.reason === 'url_not_configured') {
      settingsMessage.value = '未配置更新地址'
      return
    }
    settingsMessage.value = `检查更新失败：${res?.message ?? res?.reason ?? 'unknown'}`
  } catch (e: any) {
    settingsMessage.value = `检查更新失败：${e?.message ?? String(e)}`
  } finally {
    settingsBusy.value = false
  }
}

function onTopMenuClick(key: string) {
  moreOpen.value = false
  if (key === 'project') {
    go('/products', { ws: 'media_library' })
    return
  }
  if (key === 'edit') {
    go('/templates', { ws: 'studio' })
    return
  }
  if (key === 'view') {
    go('/tasks', { ws: 'text_scripts' })
    return
  }
  if (key === 'export') quickExport()
}
</script>

<template>
  <div class="ui-app h-screen w-screen overflow-hidden">
    <TitleBar />
    <div class="h-[calc(100vh-2.5rem)] min-h-0 overflow-hidden">
      <DsMainLayout
        :nav-items="navItems"
        title=""
        subtitle=""
        :class="{ 'models-shell': route.path.includes('/models') }"
      >
        <template #sidebar-footer>
          <div class="mt-auto grid gap-3">
            <button class="app-sidebar-footer-action" @click="openSettingsModal">
              <Settings class="h-4 w-4" />
              <span>设置</span>
            </button>
            <UiLocaleSelect />
            <div class="app-sidebar-user">
              <div class="app-avatar">C</div>
              <div class="min-w-0">
                <div class="truncate text-xs font-bold text-white/90">Creator</div>
                <div class="truncate text-[10px] text-white/35">专业版 v2.2.0</div>
              </div>
            </div>
          </div>
        </template>

        <template #topbar>
          <div class="app-top-search">
            <Search class="h-4 w-4" />
            <input v-model="shellSearch" type="text" placeholder="搜索页面、项目、模特" />
          </div>
          <button class="app-top-icon" :title="t('shell.help')" @click="openHelpModal">
            <HelpCircle class="h-4 w-4" />
            <span>帮助</span>
          </button>
          <button class="app-top-icon" title="通知">
            <Bell class="h-4 w-4" />
          </button>
          <button class="app-top-user">
            <UserCircle class="h-5 w-5" />
            <span>Creator</span>
          </button>
          <div class="relative">
            <button
              class="app-top-more"
              @click="moreOpen = !moreOpen"
            >
              <MoreHorizontal class="h-4 w-4" />
              更多
            </button>
            <div
              v-if="moreOpen"
              class="absolute right-0 top-11 z-50 w-44 rounded-xl border border-white/10 bg-[#111827] p-2 shadow-2xl shadow-black/40"
            >
              <button class="shell-more-item" @click="onTopMenuClick('project')">{{ t('shell.project') }}</button>
              <button class="shell-more-item" @click="onTopMenuClick('edit')">{{ t('shell.edit') }}</button>
              <button class="shell-more-item" @click="onTopMenuClick('view')">{{ t('shell.view') }}</button>
              <button class="shell-more-item" @click="onTopMenuClick('export')">{{ t('shell.export') }}</button>
              <button class="shell-more-item" @click="moreOpen = false; openCloudWorkspace()">{{ t('shell.openCloud') }}</button>
              <button class="shell-more-item" @click="moreOpen = false; quickExport()">{{ t('shell.quickExport') }}</button>
            </div>
          </div>
        </template>

        <RouterView />
      </DsMainLayout>
    </div>

    <div v-if="helpOpen" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" @click.self="helpOpen = false">
      <div class="w-full max-w-md rounded-xl border border-white/10 bg-[#18181B] p-4 shadow-2xl shadow-black/50" @click.stop>
        <div class="text-sm font-semibold text-white/90">{{ t('shell.helpTitle') }}</div>
        <div class="mt-1 text-[11px] leading-relaxed text-white/50">{{ t('shell.helpDesc') }}</div>
        <div class="mt-4 grid gap-2">
          <button class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/[0.06]" @click="helpOpen = false; go('/clone')">
            爆款复刻
          </button>
          <button class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/[0.06]" @click="helpOpen = false; go('/products', { ws: 'media_library' })">
            生产模块
          </button>
          <button class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/[0.06]" @click="helpOpen = false; go('/models')">
            模特库
          </button>
          <button class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/[0.06]" @click="helpOpen = false; go('/live-slicer')">
            直播切片
          </button>
        </div>
        <div class="mt-4 flex justify-end">
          <button class="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-white/[0.06]" @click="helpOpen = false">
            {{ t('common.cancel') }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="settingsOpen" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/72 p-4" @click.self="settingsOpen = false">
      <div class="flex h-[820px] w-[1280px] max-h-[calc(100vh-32px)] max-w-[calc(100vw-32px)] flex-col rounded-[24px] border border-white/10 bg-[#1f1f25] px-6 py-5 shadow-2xl shadow-black/60" @click.stop>
        <div class="flex shrink-0 flex-wrap items-start justify-between gap-4">
          <div>
            <div class="text-[1.28rem] font-semibold tracking-[-0.03em] text-white/94">高级配置中心</div>
            <div class="mt-1 text-[12px] leading-relaxed text-white/38">基础模式只保留当前供应商需要填写的字段，专业模式再展开完整链路。`ai666` 为新的聚合模型入口。</div>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-1.5 rounded-[16px] border border-white/6 bg-white/[0.02] p-1.5">
            <div class="flex items-center gap-1 rounded-[14px] border border-white/8 bg-[#0f1728] p-1">
              <button class="rounded-[12px] px-3 py-2 text-[12px] font-semibold transition" :class="settingsMode === 'simple' ? 'bg-white text-black' : 'text-white/68 hover:bg-white/[0.05]'" type="button" @click="settingsMode = 'simple'">
                新手模式
              </button>
              <button class="rounded-[12px] px-3 py-2 text-[12px] font-semibold transition" :class="settingsMode === 'pro' ? 'bg-white text-black' : 'text-white/68 hover:bg-white/[0.05]'" type="button" @click="settingsMode = 'pro'">
                专业模式
              </button>
            </div>
            <button
              class="rounded-[12px] border border-white/8 bg-transparent px-3 py-1.5 text-[12px] font-semibold text-white/78 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="settingsBusy"
              @click="checkUpdatesNow"
            >
              {{ settingsBusy ? '检查中...' : '检查更新' }}
            </button>
            <button class="rounded-[12px] border border-white/8 bg-transparent px-3 py-1.5 text-[12px] font-semibold text-white/78 transition hover:bg-white/[0.05]" @click="openDataDir">
              打开数据目录
            </button>
            <button class="rounded-[12px] border border-white/8 bg-transparent px-3 py-1.5 text-[12px] font-semibold text-white/78 transition hover:bg-white/[0.05]" @click="openLicenseCenter">
              授权中心
            </button>
            <button class="rounded-[12px] border border-white/8 bg-transparent px-3 py-1.5 text-[12px] font-semibold text-white/78 transition hover:bg-white/[0.05]" @click="refreshModelSettings">
              刷新
            </button>
            <button class="rounded-[12px] border border-white/8 bg-transparent px-3 py-1.5 text-[12px] font-semibold text-white/78 transition hover:bg-white/[0.05]" @click="settingsOpen = false">
              关闭
            </button>
          </div>
        </div>
        <div class="mt-5 grid min-h-0 flex-1 gap-4 xl:grid-cols-[232px_minmax(0,1fr)]">
          <div class="grid h-full auto-rows-fr gap-2 rounded-[20px] border border-white/8 bg-[#232329] p-3">
            <button
              v-for="item in [
                { key: 'video', label: '图生视频模型', desc: '视频供应商、模型与接口' },
                { key: 'image', label: '文生图模型', desc: '图片供应商与模型配置' },
                { key: 'chat', label: '对话模型', desc: '脚本分析与对话模型' },
                { key: 'qiniu', label: '七牛云配置', desc: '上传、外链与前缀' },
              ]"
              :key="item.key"
              class="min-h-[74px] rounded-[16px] border px-3.5 py-3 text-left transition"
              :class="modelSettingsSection === item.key ? 'border-white/14 bg-[#35353d] shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_0_1px_rgba(255,255,255,0.04)]' : 'border-transparent bg-transparent hover:border-white/6 hover:bg-white/[0.025]'"
              type="button"
              @click="modelSettingsSection = item.key as any"
            >
              <div class="text-[0.92rem] font-semibold tracking-[-0.01em] text-white/90">{{ item.label }}</div>
              <div class="mt-1 text-[11px] leading-5 text-white/34">{{ item.desc }}</div>
              <div v-if="modelSettingsSection === item.key" class="mt-2 h-1 w-10 rounded-full bg-white"></div>
            </button>
          </div>
          <div class="flex min-h-0 flex-col rounded-[18px] border border-white/8 bg-[#26262d] p-3.5">
            <div class="shrink-0 rounded-[16px] border border-white/6 bg-[#101a2b] px-4 py-2.5">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[14px] font-semibold text-white/90">当前说明</div>
                  <div class="mt-1 text-[11px] text-white/46">
                    所有模型与七牛云配置统一保存在这里，`/clone` 只读取这里的结果。
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <button class="rounded-[12px] border border-white/8 bg-[#111b2d] px-3 py-1.5 text-[11px] font-semibold text-white/88 transition hover:border-white/16 hover:bg-[#15233a]" type="button" @click="applyRecommendedPreset('starter_hub')">
                    ai666 推荐
                  </button>
                  <button class="rounded-[12px] border border-white/8 bg-[#111b2d] px-3 py-1.5 text-[11px] font-semibold text-white/88 transition hover:border-white/16 hover:bg-[#15233a]" type="button" @click="applyRecommendedPreset('starter_atlas')">
                    AtlasCloud 推荐
                  </button>
                  <div class="rounded-[12px] border border-dashed border-white/8 bg-[#0e1522] px-3 py-1.5 text-[11px] text-white/52">
                    仅保留 AtlasCloud / GRS.AI / ai666
                  </div>
                </div>
              </div>
              <div class="mt-3 grid gap-2 md:grid-cols-3">
                <div class="rounded-[14px] border border-cyan-400/16 bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(8,47,73,0.24))] px-3 py-2">
                  <div class="flex items-center gap-2">
                    <div class="rounded-[10px] border border-cyan-300/18 bg-cyan-400/10 p-2 text-cyan-100">
                      <Clapperboard class="h-4 w-4" />
                    </div>
                    <div class="min-w-0">
                      <div class="text-[10px] uppercase tracking-[0.2em] text-cyan-200/58">视频平台</div>
                      <div class="mt-1 text-[13px] font-semibold text-cyan-100">{{ activeVideoProviderLabel }}</div>
                    </div>
                  </div>
                  <div class="mt-2 truncate text-[11px] text-cyan-50/72">{{ activeVideoModelSummary }}</div>
                </div>
                <div class="rounded-[14px] border border-emerald-400/16 bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(6,78,59,0.24))] px-3 py-2">
                  <div class="flex items-center gap-2">
                    <div class="rounded-[10px] border border-emerald-300/18 bg-emerald-400/10 p-2 text-emerald-100">
                      <ImageIcon class="h-4 w-4" />
                    </div>
                    <div class="min-w-0">
                      <div class="text-[10px] uppercase tracking-[0.2em] text-emerald-200/58">图片平台</div>
                      <div class="mt-1 text-[13px] font-semibold text-emerald-100">{{ activeImageProviderLabel }}</div>
                    </div>
                  </div>
                  <div class="mt-2 truncate text-[11px] text-emerald-50/72">{{ activeImageModelSummary }}</div>
                </div>
                <div class="rounded-[14px] border border-violet-400/16 bg-[linear-gradient(135deg,rgba(139,92,246,0.16),rgba(76,29,149,0.24))] px-3 py-2">
                  <div class="flex items-center gap-2">
                    <div class="rounded-[10px] border border-violet-300/18 bg-violet-400/10 p-2 text-violet-100">
                      <MessagesSquare class="h-4 w-4" />
                    </div>
                    <div class="min-w-0">
                      <div class="text-[10px] uppercase tracking-[0.2em] text-violet-200/58">脚本平台</div>
                      <div class="mt-1 text-[13px] font-semibold text-violet-100">{{ activeChatProviderLabel }}</div>
                    </div>
                  </div>
                  <div class="mt-2 truncate text-[11px] text-violet-50/72">{{ activeChatModelSummary }}</div>
                </div>
              </div>
            </div>
            <div
              v-if="settingsMessage"
              class="mt-3 shrink-0 rounded-[14px] border px-4 py-2 text-[11px] leading-5"
              :class="settingsMessageTone === 'success' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : settingsMessageTone === 'error' ? 'border-rose-400/30 bg-rose-500/10 text-rose-100' : 'border-white/10 bg-white/[0.03] text-white/72'"
            >
              {{ settingsMessage }}
            </div>
            <div v-if="isSimpleMode" class="mt-3 flex shrink-0 flex-wrap items-center gap-2 text-[11px] text-white/46">
              <span class="rounded-full border border-emerald-400/16 bg-emerald-500/8 px-3 py-1 text-emerald-100/88">新手建议：先填一个主视频模型、一个图片模型、一个脚本模型</span>
              <span class="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1">高级项按需展开</span>
            </div>
            <div class="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            <div v-if="modelSettingsSection === 'video'" class="grid gap-3">
              <div class="text-[15px] font-semibold text-white/88">图生视频模型</div>
              <div class="rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-3 text-[12px] leading-6 text-white/50">
                默认只需要填写当前使用的视频供应商、模型和对应 Key / Host。回退链路和聚合接口多能力模型请按需展开高级设置。
              </div>
              <div class="grid gap-x-4 gap-y-3 md:grid-cols-2">
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>视频供应商</span>
                  <select v-model="modelCredentials.videoProviderPrimary" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18">
                    <option value="kling">AtlasCloud</option>
                    <option value="grsai">GRS.AI</option>
                    <option value="apifox_hub">ai666</option>
                  </select>
                </label>
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>视频模型</span>
                  <input v-model="videoPrimaryModelBinding" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                </label>
                <template v-if="modelCredentials.videoProviderPrimary === 'kling'">
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>AtlasCloud API Key</span>
                    <div class="flex gap-2">
                      <input v-model="modelCredentials.klingApiKey" :type="modelSecretType('klingApiKey')" class="h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                      <button class="h-11 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-[12px] font-semibold text-white/68 transition hover:bg-white/[0.05]" type="button" @click="toggleModelSecret('klingApiKey')">{{ modelVisibleSecrets.klingApiKey ? '隐藏' : '显示' }}</button>
                    </div>
                  </label>
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>AtlasCloud Host</span>
                    <input v-model="modelCredentials.klingHost" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                  </label>
                </template>
                <template v-else-if="modelCredentials.videoProviderPrimary === 'grsai'">
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>GRS.AI API Key</span>
                    <div class="flex gap-2">
                      <input v-model="modelCredentials.grsaiApiKey" :type="modelSecretType('grsaiApiKey')" class="h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                      <button class="h-11 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-[12px] font-semibold text-white/68 transition hover:bg-white/[0.05]" type="button" @click="toggleModelSecret('grsaiApiKey')">{{ modelVisibleSecrets.grsaiApiKey ? '隐藏' : '显示' }}</button>
                    </div>
                  </label>
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>GRS.AI Host</span>
                    <input v-model="modelCredentials.grsaiHost" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                  </label>
                </template>
                <template v-else>
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>ai666 Base URL</span>
                    <input v-model="modelCredentials.apifoxHub.baseUrl" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                  </label>
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>ai666 API Key</span>
                    <div class="flex gap-2">
                      <input v-model="modelCredentials.apifoxHub.apiKey" :type="modelSecretType('apifoxApiKey')" class="h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                      <button class="h-11 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-[12px] font-semibold text-white/68 transition hover:bg-white/[0.05]" type="button" @click="toggleModelSecret('apifoxApiKey')">{{ modelVisibleSecrets.apifoxApiKey ? '隐藏' : '显示' }}</button>
                    </div>
                  </label>
                </template>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <div class="rounded-[16px] border border-white/8 bg-white/[0.02] p-3">
                  <button class="flex w-full items-center justify-between text-left" type="button" @click="videoAdvancedOpen = !videoAdvancedOpen">
                    <div>
                      <div class="text-[13px] font-semibold text-white/86">回退与兼容</div>
                      <div class="mt-1 text-[11px] text-white/42">只在需要备用链路时展开</div>
                    </div>
                    <span class="text-[12px] text-white/58">{{ videoAdvancedOpen || settingsMode === 'pro' ? '收起' : '展开' }}</span>
                  </button>
                  <div v-if="settingsMode === 'pro' || videoAdvancedOpen" class="mt-3 grid gap-3">
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>回退供应商</span>
                      <select v-model="modelCredentials.videoProviderFallback" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18">
                        <option value="kling">AtlasCloud</option>
                        <option value="grsai">GRS.AI</option>
                        <option value="apifox_hub">ai666</option>
                      </select>
                    </label>
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>回退视频模型</span>
                      <input v-model="modelCredentials.videoModelFallback" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                    </label>
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>GRS.AI 视频模型</span>
                      <input v-model="modelCredentials.grsaiVideoModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                    </label>
                  </div>
                </div>
                <div class="rounded-[16px] border border-white/8 bg-white/[0.02] p-3">
                  <div>
                    <div class="text-[13px] font-semibold text-white/86">{{ activeVideoProviderLabel }} 高级选项</div>
                    <div class="mt-1 text-[11px] text-white/42">只展示当前视频平台真正会用到的高级配置</div>
                  </div>
                  <div v-if="modelCredentials.videoProviderPrimary === 'apifox_hub'" class="mt-3 grid gap-3">
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>视频厂商</span>
                      <select v-model="modelCredentials.apifoxHub.videoProvider" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18">
                        <option value="openai_video">标准视频接口</option>
                        <option value="sora">Sora</option>
                        <option value="veo">Veo</option>
                        <option value="grok">Grok</option>
                        <option value="jimeng">即梦</option>
                        <option value="vidu">Vidu</option>
                        <option value="kling">Kling</option>
                        <option value="seedance2">Seedance 2.0</option>
                      </select>
                    </label>
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>视频请求格式</span>
                      <select v-model="modelCredentials.apifoxHub.videoEndpointStyle" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18">
                        <option value="openai_video">标准视频接口</option>
                        <option value="official_rest">任务轮询接口</option>
                      </select>
                    </label>
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>文生视频模型</span>
                      <input v-model="modelCredentials.apifoxHub.textToVideoModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" :placeholder="ai666RecommendedModels.textVideo" />
                    </label>
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>图生视频模型</span>
                      <input v-model="modelCredentials.apifoxHub.imageToVideoModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" :placeholder="ai666RecommendedModels.referenceVideo" />
                    </label>
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>首尾帧视频模型</span>
                      <input v-model="modelCredentials.apifoxHub.startEndVideoModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" :placeholder="ai666RecommendedModels.referenceVideo" />
                    </label>
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>参考视频模型</span>
                      <input v-model="modelCredentials.apifoxHub.referenceVideoModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" :placeholder="ai666RecommendedModels.referenceVideo" />
                    </label>
                    <div class="md:col-span-2">
                      <div class="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/34">常用视频模型</div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          v-for="item in ai666VideoModelOptions"
                          :key="item"
                          class="rounded-full border border-white/8 bg-[#0f1728] px-3 py-1.5 text-[11px] text-white/78 transition hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-cyan-100"
                          type="button"
                          @click="applyAi666VideoModel('referenceVideoModel', item); applyAi666VideoModel('imageToVideoModel', item)"
                        >
                          {{ item }}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div v-else-if="modelCredentials.videoProviderPrimary === 'kling'" class="mt-3 grid gap-3">
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>AtlasCloud Host</span>
                      <input v-model="modelCredentials.klingHost" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                    </label>
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>AtlasCloud 默认视频模型</span>
                      <input v-model="modelCredentials.videoModelFallback" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                    </label>
                  </div>
                  <div v-else class="mt-3 grid gap-3">
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>GRS.AI Host</span>
                      <input v-model="modelCredentials.grsaiHost" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                    </label>
                    <label class="grid gap-1.5 text-[12px] text-white/72">
                      <span>GRS.AI 视频模型</span>
                      <input v-model="modelCredentials.grsaiVideoModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div v-else-if="modelSettingsSection === 'image'" class="grid gap-3">
              <div class="text-[15px] font-semibold text-white/88">文生图模型</div>
              <div class="rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-3 text-[12px] leading-6 text-white/50">
                图片配置只保留三家平台入口。默认直接用平台聚合能力，不再暴露官方直连入口。
              </div>
              <div class="grid gap-x-4 gap-y-3 md:grid-cols-2">
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>图片供应商</span>
                  <select v-model="modelCredentials.imageProviderPrimary" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18">
                    <option value="kling">AtlasCloud</option>
                    <option value="grsai">GRS.AI</option>
                    <option value="apifox_hub">ai666</option>
                  </select>
                </label>
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>当前图片模型</span>
                  <input v-model="imagePrimaryModelBinding" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                </label>
                <template v-if="modelCredentials.imageProviderPrimary === 'kling'">
                  <label class="grid gap-1.5 text-[12px] text-white/72 md:col-span-2">
                    <span>AtlasCloud API Key</span>
                    <div class="flex gap-2">
                      <input v-model="modelCredentials.klingApiKey" :type="modelSecretType('klingApiKey')" class="h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                      <button class="h-11 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-[12px] font-semibold text-white/68 transition hover:bg-white/[0.05]" type="button" @click="toggleModelSecret('klingApiKey')">{{ modelVisibleSecrets.klingApiKey ? '隐藏' : '显示' }}</button>
                    </div>
                  </label>
                </template>
                <template v-if="modelCredentials.imageProviderPrimary === 'grsai'">
                  <label class="grid gap-1.5 text-[12px] text-white/72 md:col-span-2">
                    <span>GRS.AI API Key</span>
                    <div class="flex gap-2">
                      <input v-model="modelCredentials.grsaiApiKey" :type="modelSecretType('grsaiApiKey')" class="h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                      <button class="h-11 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-[12px] font-semibold text-white/68 transition hover:bg-white/[0.05]" type="button" @click="toggleModelSecret('grsaiApiKey')">{{ modelVisibleSecrets.grsaiApiKey ? '隐藏' : '显示' }}</button>
                    </div>
                  </label>
                </template>
                <template v-if="modelCredentials.imageProviderPrimary === 'apifox_hub'">
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>ai666 Base URL</span>
                    <input v-model="modelCredentials.apifoxHub.baseUrl" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                  </label>
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>ai666 API Key</span>
                    <div class="flex gap-2">
                      <input v-model="modelCredentials.apifoxHub.apiKey" :type="modelSecretType('apifoxApiKey')" class="h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                      <button class="h-11 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-[12px] font-semibold text-white/68 transition hover:bg-white/[0.05]" type="button" @click="toggleModelSecret('apifoxApiKey')">{{ modelVisibleSecrets.apifoxApiKey ? '隐藏' : '显示' }}</button>
                    </div>
                  </label>
                </template>
              </div>
              <button class="rounded-[14px] border border-white/8 bg-white/[0.03] px-4 py-2.5 text-left text-[13px] font-semibold text-white/80 transition hover:bg-white/[0.05]" type="button" @click="imageAdvancedOpen = !imageAdvancedOpen">
                {{ imageAdvancedOpen || settingsMode === 'pro' ? '收起图片高级设置' : '展开图片高级设置' }}
              </button>
              <div v-if="settingsMode === 'pro' || imageAdvancedOpen" class="grid gap-x-4 gap-y-3 rounded-[18px] border border-white/8 bg-white/[0.02] p-4 md:grid-cols-2">
                <template v-if="modelCredentials.imageProviderPrimary === 'apifox_hub'">
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>图片厂商</span>
                    <select v-model="modelCredentials.apifoxHub.imageProvider" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18">
                      <option value="openai">通用图像接口</option>
                      <option value="gemini">Gemini</option>
                      <option value="jimeng">即梦</option>
                      <option value="midjourney">Midjourney</option>
                    </select>
                  </label>
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>图片请求格式</span>
                    <select v-model="modelCredentials.apifoxHub.imageEndpointStyle" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18">
                      <option value="openai_images">标准图像接口</option>
                      <option value="official_rest">任务轮询接口</option>
                      <option value="midjourney_task">Midjourney Task</option>
                    </select>
                  </label>
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>生图模型</span>
                    <input v-model="modelCredentials.apifoxHub.imageModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                  </label>
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>编辑模型</span>
                    <input v-model="modelCredentials.apifoxHub.imageEditModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                  </label>
                  <div class="md:col-span-2">
                    <div class="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/34">常用图像模型</div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="item in ai666ImageModelOptions"
                        :key="item"
                        class="rounded-full border border-white/8 bg-[#0f1728] px-3 py-1.5 text-[11px] text-white/78 transition hover:border-emerald-400/30 hover:bg-emerald-500/10 hover:text-emerald-100"
                        type="button"
                        @click="applyAi666ImageModel('imageModel', item)"
                      >
                        {{ item }}
                      </button>
                    </div>
                  </div>
                </template>
                <template v-else-if="modelCredentials.imageProviderPrimary === 'kling'">
                  <label class="grid gap-1.5 text-[12px] text-white/72 md:col-span-2">
                    <span>AtlasCloud 图片模型</span>
                    <input v-model="modelCredentials.klingImageModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                  </label>
                </template>
                <template v-else>
                  <label class="grid gap-1.5 text-[12px] text-white/72 md:col-span-2">
                    <span>GRS.AI 图片模型</span>
                    <input v-model="modelCredentials.grsaiImageModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                  </label>
                </template>
              </div>
            </div>
            <div v-else-if="modelSettingsSection === 'chat'" class="grid gap-3">
              <div class="text-[15px] font-semibold text-white/88">对话模型</div>
              <div class="rounded-[16px] border border-white/8 bg-white/[0.03] px-4 py-3 text-[12px] leading-6 text-white/50">
                脚本分析只保留三家平台使用方式。普通用户只需要填一个当前正在用的主模型。
              </div>
              <div class="grid gap-x-4 gap-y-3 md:grid-cols-2">
                <label class="grid gap-1.5 text-[12px] text-white/72 md:col-span-2">
                  <span>当前对话模型</span>
                  <input v-model="chatPrimaryModelBinding" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                </label>
                <div class="md:col-span-2">
                  <div class="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/34">常用对话模型</div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="item in ai666ChatModelOptions"
                      :key="item"
                      class="rounded-full border border-white/8 bg-[#0f1728] px-3 py-1.5 text-[11px] text-white/78 transition hover:border-violet-400/30 hover:bg-violet-500/10 hover:text-violet-100"
                      type="button"
                      @click="applyAi666ChatModel(item)"
                    >
                      {{ item }}
                    </button>
                  </div>
                </div>
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>对话供应商</span>
                  <select v-model="modelCredentials.apifoxHub.enabled" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18">
                    <option :value="true">ai666</option>
                    <option :value="false">GRS.AI</option>
                  </select>
                </label>
                <template v-if="!modelCredentials.apifoxHub.enabled">
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>GRS.AI API Key</span>
                    <div class="flex gap-2">
                      <input v-model="modelCredentials.grsaiApiKey" :type="modelSecretType('grsaiApiKey')" class="h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                      <button class="h-11 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-[12px] font-semibold text-white/68 transition hover:bg-white/[0.05]" type="button" @click="toggleModelSecret('grsaiApiKey')">{{ modelVisibleSecrets.grsaiApiKey ? '隐藏' : '显示' }}</button>
                    </div>
                  </label>
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>GRS.AI Host</span>
                    <input v-model="modelCredentials.grsaiHost" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                  </label>
                </template>
                <template v-if="modelCredentials.apifoxHub.enabled">
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>ai666 Base URL</span>
                    <input v-model="modelCredentials.apifoxHub.baseUrl" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                  </label>
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>ai666 API Key</span>
                    <div class="flex gap-2">
                      <input v-model="modelCredentials.apifoxHub.apiKey" :type="modelSecretType('apifoxApiKey')" class="h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                      <button class="h-11 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-[12px] font-semibold text-white/68 transition hover:bg-white/[0.05]" type="button" @click="toggleModelSecret('apifoxApiKey')">{{ modelVisibleSecrets.apifoxApiKey ? '隐藏' : '显示' }}</button>
                    </div>
                  </label>
                </template>
              </div>
              <button class="rounded-[14px] border border-white/8 bg-white/[0.03] px-4 py-2.5 text-left text-[13px] font-semibold text-white/80 transition hover:bg-white/[0.05]" type="button" @click="chatAdvancedOpen = !chatAdvancedOpen">
                {{ chatAdvancedOpen || settingsMode === 'pro' ? '收起对话高级设置' : '展开对话高级设置' }}
              </button>
              <div v-if="settingsMode === 'pro' || chatAdvancedOpen" class="grid gap-x-4 gap-y-3 rounded-[18px] border border-white/8 bg-white/[0.02] p-4 md:grid-cols-2">
                <template v-if="modelCredentials.apifoxHub.enabled">
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>ai666 对话厂商</span>
                    <select v-model="modelCredentials.apifoxHub.chatProvider" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18">
                      <option value="openai">通用对话接口</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="gemini">Gemini</option>
                    </select>
                  </label>
                  <label class="grid gap-1.5 text-[12px] text-white/72">
                    <span>ai666 对话格式</span>
                    <select v-model="modelCredentials.apifoxHub.chatEndpointStyle" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18">
                      <option value="openai_chat">标准对话接口</option>
                      <option value="anthropic_native">Anthropic 原生接口</option>
                      <option value="gemini_native">Gemini 原生接口</option>
                    </select>
                  </label>
                </template>
                <template v-else>
                  <label class="grid gap-1.5 text-[12px] text-white/72 md:col-span-2">
                    <span>GRS.AI 分析模型</span>
                    <input v-model="modelCredentials.grsaiAnalysisModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                  </label>
                </template>
              </div>
            </div>
            <div v-else class="grid gap-3">
              <div class="text-[15px] font-semibold text-white/88">七牛云配置</div>
              <div class="grid gap-x-4 gap-y-3 md:grid-cols-2">
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>七牛 Access Key</span>
                  <div class="flex gap-2">
                    <input v-model="modelCredentials.qiniuAccessKey" :type="modelSecretType('qiniuAccessKey')" class="h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                    <button class="h-11 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-[12px] font-semibold text-white/68 transition hover:bg-white/[0.05]" type="button" @click="toggleModelSecret('qiniuAccessKey')">{{ modelVisibleSecrets.qiniuAccessKey ? '隐藏' : '显示' }}</button>
                  </div>
                </label>
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>七牛 Secret Key</span>
                  <div class="flex gap-2">
                    <input v-model="modelCredentials.qiniuSecretKey" :type="modelSecretType('qiniuSecretKey')" class="h-11 min-w-0 flex-1 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                    <button class="h-11 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-[12px] font-semibold text-white/68 transition hover:bg-white/[0.05]" type="button" @click="toggleModelSecret('qiniuSecretKey')">{{ modelVisibleSecrets.qiniuSecretKey ? '隐藏' : '显示' }}</button>
                  </div>
                </label>
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>七牛 Bucket</span>
                  <input v-model="modelCredentials.qiniuBucket" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                </label>
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>七牛外链域名</span>
                  <input v-model="modelCredentials.qiniuDomain" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                </label>
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>七牛上传 Host</span>
                  <input v-model="modelCredentials.qiniuUploadHost" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                </label>
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>七牛前缀</span>
                  <input v-model="modelCredentials.qiniuPrefix" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                </label>
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>允许无 Key 本地 Mock</span>
                  <select v-model="modelCredentials.allowMockWhenNoKey" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18">
                    <option :value="false">否</option>
                    <option :value="true">是</option>
                  </select>
                </label>
                <label class="grid gap-1.5 text-[12px] text-white/72">
                  <span>关键帧模型标识</span>
                  <input v-model="modelCredentials.keyframeModel" class="h-11 rounded-xl border border-white/8 bg-[#101827] px-3 py-2 text-[14px] text-white outline-none transition focus:border-white/18" />
                </label>
              </div>
            </div>
            </div>
            <div class="mt-4 flex shrink-0 justify-end gap-3 border-t border-white/8 pt-4">
              <button class="h-11 rounded-[14px] border border-white/8 bg-white/[0.03] px-5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.05]" type="button" @click="settingsOpen = false">取消</button>
              <button class="h-11 rounded-[14px] bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60" type="button" :disabled="modelSettingsBusy" @click="saveModelSettings">
                {{ modelSettingsBusy ? '保存中...' : '保存配置' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

