<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Clapperboard, Cloud, Image as ImageIcon, KeyRound, MessagesSquare, Server } from 'lucide-vue-next'

type ProviderKey = 'kling' | 'grsai' | 'apifox_hub'
type PlatformKey = 'kling' | 'grsai' | 'ai666' | 'vectorengine'
type CapabilityPlatformKey = 'kling' | 'grsai' | 'ai666' | 'vectorengine'
type SecretKey =
  | 'klingApiKey'
  | 'grsaiApiKey'
  | 'ai666ApiKey'
  | 'vectorEngineApiKey'
  | 'replicateApiToken'
  | 'qiniuAccessKey'
  | 'qiniuSecretKey'

const settingsBusy = ref(false)
const settingsMessage = ref('')
const modelSettingsBusy = ref(false)
const modelSettingsSection = ref<'platforms' | 'capabilities' | 'qiniu'>('platforms')
const modelVisibleSecrets = ref<Record<SecretKey, boolean>>({
  klingApiKey: false,
  grsaiApiKey: false,
  ai666ApiKey: false,
  vectorEngineApiKey: false,
  replicateApiToken: false,
  qiniuAccessKey: false,
  qiniuSecretKey: false,
})

const modelCredentials = ref({
  klingApiKey: '',
  klingHost: '',
  grsaiApiKey: '',
  grsaiHost: '',
  replicateApiToken: '',
  qiniuAccessKey: '',
  qiniuSecretKey: '',
  qiniuBucket: '',
  qiniuDomain: '',
  qiniuUploadHost: '',
  qiniuPrefix: '',
  allowMockWhenNoKey: false,
  keyframeModel: '',
  videoProviderPrimary: 'kling' as ProviderKey,
  videoModelPrimary: 'veo_3_1-lite',
  videoProviderFallback: 'kling' as ProviderKey,
  videoModelFallback: 'google/veo3.1-lite/image-to-video',
  grsaiVideoModel: 'grok-video-3',
  imageProviderPrimary: 'apifox_hub' as ProviderKey,
  chatProviderPrimary: 'apifox_hub' as 'apifox_hub' | 'grsai',
  apifoxHubProfile: 'vectorengine' as 'ai666' | 'vectorengine',
  videoApifoxHubProfile: 'vectorengine' as 'ai666' | 'vectorengine',
  imageApifoxHubProfile: 'vectorengine' as 'ai666' | 'vectorengine',
  chatApifoxHubProfile: 'vectorengine' as 'ai666' | 'vectorengine',
  klingImageModel: '',
  grsaiImageModel: '',
  grsaiAnalysisModel: '',
  ai666Hub: {
    enabled: true,
    baseUrl: '',
    apiKey: '',
    chatProvider: 'openai',
    chatModel: 'gpt-4.1-mini',
    chatEndpointStyle: 'openai_chat',
    imageProvider: 'openai',
    imageModel: 'gpt-image-1',
    imageEditModel: '',
    imageEndpointStyle: 'openai_images',
    videoProvider: 'veo',
    textToVideoModel: 'veo_3_1-lite',
    imageToVideoModel: 'veo_3_1-lite',
    startEndVideoModel: 'veo_3_1-lite',
    referenceVideoModel: 'veo_3_1-lite',
    videoEndpointStyle: 'official_rest',
    defaultPollIntervalMs: 2000,
    defaultTimeoutMs: 600000,
  },
  vectorEngineHub: {
    enabled: true,
    baseUrl: '',
    apiKey: '',
    chatProvider: 'openai',
    chatModel: 'gpt-4.1-mini',
    chatEndpointStyle: 'openai_chat',
    imageProvider: 'openai',
    imageModel: 'gpt-image-1',
    imageEditModel: '',
    imageEndpointStyle: 'openai_images',
    videoProvider: 'veo',
    textToVideoModel: 'veo_3_1-lite',
    imageToVideoModel: 'veo_3_1-lite',
    startEndVideoModel: 'veo_3_1-lite',
    referenceVideoModel: 'veo_3_1-lite',
    videoEndpointStyle: 'official_rest',
    defaultPollIntervalMs: 2000,
    defaultTimeoutMs: 600000,
  },
  apifoxHub: {
    enabled: false,
    baseUrl: '',
    apiKey: '',
    chatProvider: 'openai',
    chatModel: 'gpt-4.1-mini',
    chatEndpointStyle: 'openai_chat',
    imageProvider: 'openai',
    imageModel: 'gpt-image-1',
    imageEditModel: '',
    imageEndpointStyle: 'openai_images',
    videoProvider: 'veo',
    textToVideoModel: 'veo_3_1-lite',
    imageToVideoModel: 'veo_3_1-lite',
    startEndVideoModel: 'veo_3_1-lite',
    referenceVideoModel: 'veo_3_1-lite',
    videoEndpointStyle: 'official_rest',
    defaultPollIntervalMs: 2000,
    defaultTimeoutMs: 600000,
  },
})

const sectionMeta = [
  { key: 'platforms', label: '开放平台', desc: '先配置平台 Key 与 Base URL', icon: KeyRound },
  { key: 'capabilities', label: '能力模型', desc: '再选择视频、图片、对话模型', icon: Server },
  { key: 'qiniu', label: '云存储', desc: '七牛上传、外链与资源前缀', icon: Cloud },
] as const

const providerMeta: Record<PlatformKey, { label: string; hostLabel: string; hostPlaceholder: string; keyName: SecretKey }> = {
  kling: {
    label: 'AtlasCloud',
    hostLabel: 'Base URL / Host',
    hostPlaceholder: 'https://api.atlascloud.ai',
    keyName: 'klingApiKey',
  },
  grsai: {
    label: 'GRS.AI',
    hostLabel: 'Base URL / Host',
    hostPlaceholder: 'https://grsaiapi.com',
    keyName: 'grsaiApiKey',
  },
  ai666: {
    label: 'AI666',
    hostLabel: 'Base URL',
    hostPlaceholder: 'https://your-ai666-host',
    keyName: 'ai666ApiKey',
  },
  vectorengine: {
    label: 'VectorEngine',
    hostLabel: 'Base URL',
    hostPlaceholder: 'https://your-vector-engine-host',
    keyName: 'vectorEngineApiKey',
  },
}

const settingsMessageTone = computed(() => {
  const text = String(settingsMessage.value || '').trim()
  if (!text) return 'neutral'
  return /已|成功|完成|打开|开始/.test(text) ? 'success' : 'error'
})

const providerLabel = (provider: string) =>
  provider === 'apifox_hub' ? 'VectorEngine' : provider === 'grsai' ? 'GRS.AI' : 'AtlasCloud'

function capabilityProviderLabel(provider: ProviderKey | 'grsai', profile?: 'ai666' | 'vectorengine') {
  if (provider === 'apifox_hub') return profile === 'ai666' ? 'AI666' : 'VectorEngine'
  return provider === 'grsai' ? 'GRS.AI' : 'AtlasCloud'
}

function capabilityProfileKey(target: 'videoProviderPrimary' | 'videoProviderFallback' | 'imageProviderPrimary' | 'chatProviderPrimary') {
  if (target === 'imageProviderPrimary') return 'imageApifoxHubProfile'
  if (target === 'chatProviderPrimary') return 'chatApifoxHubProfile'
  return 'videoApifoxHubProfile'
}

function toCapabilityPlatform(provider: ProviderKey | 'grsai', profile?: 'ai666' | 'vectorengine'): CapabilityPlatformKey {
  if (provider === 'apifox_hub') return profile === 'ai666' ? 'ai666' : 'vectorengine'
  return provider === 'grsai' ? 'grsai' : 'kling'
}

function applyCapabilityPlatform(
  target: 'videoProviderPrimary' | 'videoProviderFallback' | 'imageProviderPrimary' | 'chatProviderPrimary',
  platform: CapabilityPlatformKey,
) {
  const profileKey = capabilityProfileKey(target)
  if (platform === 'ai666' || platform === 'vectorengine') {
    ;(modelCredentials.value[target] as ProviderKey | 'grsai') = 'apifox_hub'
    modelCredentials.value[profileKey] = platform
    return
  }
  ;(modelCredentials.value[target] as ProviderKey | 'grsai') = platform
}

const videoPrimaryPlatformBinding = computed({
  get: () => toCapabilityPlatform(modelCredentials.value.videoProviderPrimary, modelCredentials.value.videoApifoxHubProfile),
  set: (value: CapabilityPlatformKey) => applyCapabilityPlatform('videoProviderPrimary', value),
})

const videoFallbackPlatformBinding = computed({
  get: () => toCapabilityPlatform(modelCredentials.value.videoProviderFallback, modelCredentials.value.videoApifoxHubProfile),
  set: (value: CapabilityPlatformKey) => applyCapabilityPlatform('videoProviderFallback', value),
})

const imagePrimaryPlatformBinding = computed({
  get: () => toCapabilityPlatform(modelCredentials.value.imageProviderPrimary, modelCredentials.value.imageApifoxHubProfile),
  set: (value: CapabilityPlatformKey) => applyCapabilityPlatform('imageProviderPrimary', value),
})

const chatPrimaryPlatformBinding = computed({
  get: () => toCapabilityPlatform(modelCredentials.value.chatProviderPrimary, modelCredentials.value.chatApifoxHubProfile),
  set: (value: CapabilityPlatformKey) => applyCapabilityPlatform('chatProviderPrimary', value),
})

function activeApifoxHub(capability: 'video' | 'image' | 'chat') {
  const profile =
    capability === 'video'
      ? modelCredentials.value.videoApifoxHubProfile
      : capability === 'image'
        ? modelCredentials.value.imageApifoxHubProfile
        : modelCredentials.value.chatApifoxHubProfile
  return profile === 'ai666' ? modelCredentials.value.ai666Hub : modelCredentials.value.vectorEngineHub
}

const videoPrimaryModelBinding = computed({
  get: () => {
    const creds = modelCredentials.value
    if (creds.videoProviderPrimary === 'apifox_hub') {
      const hub = activeApifoxHub('video')
      return hub.startEndVideoModel || hub.referenceVideoModel || hub.imageToVideoModel || hub.textToVideoModel || ''
    }
    if (creds.videoProviderPrimary === 'grsai') return creds.grsaiVideoModel || ''
    return creds.videoModelFallback || creds.videoModelPrimary || ''
  },
  set: (value: string) => {
    const creds = modelCredentials.value
    if (creds.videoProviderPrimary === 'apifox_hub') {
      const hub = activeApifoxHub('video')
      hub.startEndVideoModel = value
      hub.referenceVideoModel = value
      hub.imageToVideoModel = value
      hub.textToVideoModel = value
      return
    }
    if (creds.videoProviderPrimary === 'grsai') {
      creds.grsaiVideoModel = value
      return
    }
    creds.videoModelFallback = value
    creds.videoModelPrimary = value
  },
})

const imagePrimaryModelBinding = computed({
  get: () => {
    const creds = modelCredentials.value
    if (creds.imageProviderPrimary === 'apifox_hub') return activeApifoxHub('image').imageModel || ''
    if (creds.imageProviderPrimary === 'grsai') return creds.grsaiImageModel || ''
    return creds.klingImageModel || ''
  },
  set: (value: string) => {
    const creds = modelCredentials.value
    if (creds.imageProviderPrimary === 'apifox_hub') {
      activeApifoxHub('image').imageModel = value
      return
    }
    if (creds.imageProviderPrimary === 'grsai') {
      creds.grsaiImageModel = value
      return
    }
    creds.klingImageModel = value
  },
})

const chatPrimaryModelBinding = computed({
  get: () => (modelCredentials.value.chatProviderPrimary === 'apifox_hub' ? activeApifoxHub('chat').chatModel || '' : modelCredentials.value.grsaiAnalysisModel || ''),
  set: (value: string) => {
    if (modelCredentials.value.chatProviderPrimary === 'apifox_hub') {
      activeApifoxHub('chat').chatModel = value
      return
    }
    modelCredentials.value.grsaiAnalysisModel = value
  },
})

const summaryCards = computed(() => [
  {
    title: '视频模型',
    value: capabilityProviderLabel(modelCredentials.value.videoProviderPrimary, modelCredentials.value.videoApifoxHubProfile),
    meta: videoPrimaryModelBinding.value || '未设置模型',
    tone: 'violet',
    icon: Clapperboard,
  },
  {
    title: '图片模型',
    value: capabilityProviderLabel(modelCredentials.value.imageProviderPrimary, modelCredentials.value.imageApifoxHubProfile),
    meta: imagePrimaryModelBinding.value || '未设置模型',
    tone: 'cyan',
    icon: ImageIcon,
  },
  {
    title: '对话模型',
    value: capabilityProviderLabel(modelCredentials.value.chatProviderPrimary, modelCredentials.value.chatApifoxHubProfile),
    meta: chatPrimaryModelBinding.value || '未设置模型',
    tone: 'green',
    icon: MessagesSquare,
  },
  {
    title: '当前状态',
    value: settingsMessage.value || '等待保存',
    meta: modelSettingsBusy.value ? '处理中' : '可保存',
    tone: 'slate',
    icon: Server,
  },
])

const platformCards = computed(() => [
  {
    provider: 'kling' as ProviderKey,
    title: 'AtlasCloud',
    desc: '用于 AtlasCloud / Kling 链路的通用凭证。',
    icon: Clapperboard,
  },
  {
    provider: 'grsai' as ProviderKey,
    title: 'GRS.AI',
    desc: '用于 GRS.AI 的视频、图片和对话能力。',
    icon: MessagesSquare,
  },
  {
    provider: 'ai666' as PlatformKey,
    title: 'AI666',
    desc: '用于 AI666 开放平台独立凭证。',
    icon: Server,
  },
  {
    provider: 'vectorengine' as PlatformKey,
    title: 'VectorEngine',
    desc: '用于 VectorEngine 开放平台独立凭证。',
    icon: Server,
  },
])

function toggleModelSecret(key: SecretKey) {
  modelVisibleSecrets.value[key] = !modelVisibleSecrets.value[key]
}

function modelSecretType(key: SecretKey) {
  return modelVisibleSecrets.value[key] ? 'text' : 'password'
}

function providerApiKey(provider: PlatformKey) {
  if (provider === 'kling') return modelCredentials.value.klingApiKey
  if (provider === 'grsai') return modelCredentials.value.grsaiApiKey
  if (provider === 'ai666') return modelCredentials.value.ai666Hub.apiKey
  return modelCredentials.value.vectorEngineHub.apiKey
}

function providerHost(provider: PlatformKey) {
  if (provider === 'kling') return modelCredentials.value.klingHost
  if (provider === 'grsai') return modelCredentials.value.grsaiHost
  if (provider === 'ai666') return modelCredentials.value.ai666Hub.baseUrl
  return modelCredentials.value.vectorEngineHub.baseUrl
}

async function refreshModelSettings() {
  modelSettingsBusy.value = true
  try {
    const next = (await window.api.clone.getModelCredentials()) as typeof modelCredentials.value
    modelCredentials.value = { ...modelCredentials.value, ...next }
    settingsMessage.value = '模型配置已读取'
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
    const payload = JSON.parse(JSON.stringify(modelCredentials.value))
    payload.apifoxHubProfile = payload.videoApifoxHubProfile === 'ai666' ? 'ai666' : 'vectorengine'
    payload.apifoxHub = payload.apifoxHubProfile === 'ai666' ? { ...payload.ai666Hub } : { ...payload.vectorEngineHub }
    await window.api.clone.setModelCredentials(payload)
    const confirmed = (await window.api.clone.getModelCredentials()) as typeof modelCredentials.value
    modelCredentials.value = { ...modelCredentials.value, ...confirmed }
    settingsMessage.value = '模型配置已保存并重新加载'
  } catch (e: any) {
    settingsMessage.value = `保存失败：${e?.message ?? String(e)}`
  } finally {
    modelSettingsBusy.value = false
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
    const res = (await window.api.updater.checkForUpdates()) as { ok: true } | { ok: false; reason?: string; message?: string }
    settingsMessage.value = res?.ok ? '已开始检查更新' : `检查更新失败：${res?.message ?? res?.reason ?? 'unknown'}`
  } catch (e: any) {
    settingsMessage.value = `检查更新失败：${e?.message ?? String(e)}`
  } finally {
    settingsBusy.value = false
  }
}

onMounted(() => {
  void refreshModelSettings()
})
</script>

<template>
  <div class="settings-console">
    <section class="settings-shell">
      <div class="settings-shell__hero">
        <div>
          <div class="settings-kicker">Settings / Control Center</div>
          <h1>模型平台与能力配置</h1>
          <p>先配置开放平台的 API Key 和 Base URL，再为视频、图片、对话选择对应平台与模型，降低理解成本。</p>
        </div>
        <div class="settings-shell__actions">
          <button class="ghost-button small" :disabled="settingsBusy" @click="checkUpdatesNow">检查更新</button>
          <button class="ghost-button small" @click="openDataDir">打开数据目录</button>
          <button class="ghost-button small" @click="refreshModelSettings">刷新</button>
          <button class="primary-button small" :disabled="modelSettingsBusy" @click="saveModelSettings">
            {{ modelSettingsBusy ? '保存中' : '保存配置' }}
          </button>
        </div>
      </div>

      <div class="settings-summary-grid">
        <article v-for="item in summaryCards" :key="item.title" class="summary-card" :class="`tone-${item.tone}`">
          <div class="summary-card__icon">
            <component :is="item.icon" :size="16" />
          </div>
          <div>
            <span>{{ item.title }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.meta }}</small>
          </div>
        </article>
      </div>
    </section>

    <section class="settings-layout">
      <aside class="settings-nav-panel">
        <button
          v-for="item in sectionMeta"
          :key="item.key"
          class="nav-item"
          :class="{ active: modelSettingsSection === item.key }"
          @click="modelSettingsSection = item.key"
        >
          <span class="nav-item__icon"><component :is="item.icon" :size="16" /></span>
          <div>
            <strong>{{ item.label }}</strong>
            <small>{{ item.desc }}</small>
          </div>
        </button>
      </aside>

      <main class="settings-form-panel">
        <div v-if="settingsMessage" class="settings-message" :class="settingsMessageTone">{{ settingsMessage }}</div>

        <section v-if="modelSettingsSection === 'platforms'" class="form-section">
          <div class="section-head">
            <div>
              <h2>开放平台凭证</h2>
              <p>平台凭证单独维护，避免用户在视频、图片、对话三个区域反复看到同一套 Key / Base URL。</p>
            </div>
          </div>

          <div class="platform-grid">
            <article v-for="card in platformCards" :key="card.provider" class="platform-card">
              <div class="platform-card__head">
                <div class="platform-card__icon">
                  <component :is="card.icon" :size="16" />
                </div>
                <div>
                  <h3>{{ card.title }}</h3>
                  <p>{{ card.desc }}</p>
                </div>
              </div>

              <div class="form-grid single-column">
                <label>
                  <span>API Key</span>
                  <div class="field-inline">
                    <input
                      :value="providerApiKey(card.provider)"
                      :type="modelSecretType(providerMeta[card.provider].keyName)"
                      @input="
                        card.provider === 'kling'
                          ? (modelCredentials.klingApiKey = ($event.target as HTMLInputElement).value)
                          : card.provider === 'grsai'
                            ? (modelCredentials.grsaiApiKey = ($event.target as HTMLInputElement).value)
                            : card.provider === 'ai666'
                              ? (modelCredentials.ai666Hub.apiKey = ($event.target as HTMLInputElement).value)
                              : (modelCredentials.vectorEngineHub.apiKey = ($event.target as HTMLInputElement).value)
                      "
                    />
                    <button class="ghost-button tiny" type="button" @click="toggleModelSecret(providerMeta[card.provider].keyName)">
                      {{ modelVisibleSecrets[providerMeta[card.provider].keyName] ? '隐藏' : '显示' }}
                    </button>
                  </div>
                </label>

                <label>
                  <span>{{ providerMeta[card.provider].hostLabel }}</span>
                  <input
                    :value="providerHost(card.provider)"
                    :placeholder="providerMeta[card.provider].hostPlaceholder"
                    @input="
                      card.provider === 'kling'
                        ? (modelCredentials.klingHost = ($event.target as HTMLInputElement).value)
                        : card.provider === 'grsai'
                          ? (modelCredentials.grsaiHost = ($event.target as HTMLInputElement).value)
                          : card.provider === 'ai666'
                            ? (modelCredentials.ai666Hub.baseUrl = ($event.target as HTMLInputElement).value)
                            : (modelCredentials.vectorEngineHub.baseUrl = ($event.target as HTMLInputElement).value)
                    "
                  />
                </label>
              </div>
            </article>

            <article class="platform-card">
              <div class="platform-card__head">
                <div class="platform-card__icon">
                  <ImageIcon :size="16" />
                </div>
                <div>
                  <h3>Replicate</h3>
                  <p>用于 /clone 商品图白底处理，Token 仅保存在桌面端配置。</p>
                </div>
              </div>

              <div class="form-grid single-column">
                <label>
                  <span>API Token</span>
                  <div class="field-inline">
                    <input v-model="modelCredentials.replicateApiToken" :type="modelSecretType('replicateApiToken')" />
                    <button class="ghost-button tiny" type="button" @click="toggleModelSecret('replicateApiToken')">
                      {{ modelVisibleSecrets.replicateApiToken ? '隐藏' : '显示' }}
                    </button>
                  </div>
                </label>
              </div>
            </article>
          </div>
        </section>

        <section v-else-if="modelSettingsSection === 'capabilities'" class="form-section">
          <div class="section-head">
            <div>
              <h2>能力模型</h2>
              <p>这里仅负责“这项能力使用哪个平台、哪个模型”，平台的凭证请在“开放平台”区域统一配置。</p>
            </div>
          </div>

          <div class="capability-stack">
            <article class="capability-card">
              <div class="capability-card__head">
                <div class="capability-card__icon is-violet"><Clapperboard :size="16" /></div>
                <div>
                  <h3>视频能力</h3>
                  <p>主视频生成链路。</p>
                </div>
              </div>
              <div class="form-grid">
                <label>
                  <span>视频平台</span>
                  <select v-model="videoPrimaryPlatformBinding">
                    <option value="kling">AtlasCloud</option>
                    <option value="grsai">GRS.AI</option>
                    <option value="ai666">AI666</option>
                    <option value="vectorengine">VectorEngine</option>
                  </select>
                </label>
                <label>
                  <span>视频模型</span>
                  <input v-model="videoPrimaryModelBinding" placeholder="例如 veo_3_1-lite" />
                </label>
                <label>
                  <span>回退平台</span>
                  <select v-model="videoFallbackPlatformBinding">
                    <option value="kling">AtlasCloud</option>
                    <option value="grsai">GRS.AI</option>
                    <option value="ai666">AI666</option>
                    <option value="vectorengine">VectorEngine</option>
                  </select>
                </label>
                <label>
                  <span>回退模型</span>
                  <input v-model="modelCredentials.videoModelFallback" placeholder="当主模型失败时使用" />
                </label>
              </div>
            </article>

            <article class="capability-card">
              <div class="capability-card__head">
                <div class="capability-card__icon is-cyan"><ImageIcon :size="16" /></div>
                <div>
                  <h3>图片能力</h3>
                  <p>文生图、图像编辑、分镜图生成。</p>
                </div>
              </div>
              <div class="form-grid">
                <label>
                  <span>图片平台</span>
                  <select v-model="imagePrimaryPlatformBinding">
                    <option value="kling">AtlasCloud</option>
                    <option value="grsai">GRS.AI</option>
                    <option value="ai666">AI666</option>
                    <option value="vectorengine">VectorEngine</option>
                  </select>
                </label>
                <label>
                  <span>图片模型</span>
                  <input v-model="imagePrimaryModelBinding" placeholder="例如 gpt-image-1" />
                </label>
              </div>
            </article>

            <article class="capability-card">
              <div class="capability-card__head">
                <div class="capability-card__icon is-green"><MessagesSquare :size="16" /></div>
                <div>
                  <h3>对话能力</h3>
                  <p>脚本分析、流程辅助与通用问答。</p>
                </div>
              </div>
              <div class="form-grid">
                <label>
                  <span>对话平台</span>
                  <select v-model="chatPrimaryPlatformBinding">
                    <option value="ai666">AI666</option>
                    <option value="vectorengine">VectorEngine</option>
                    <option value="grsai">GRS.AI</option>
                  </select>
                </label>
                <label>
                  <span>对话模型</span>
                  <input v-model="chatPrimaryModelBinding" placeholder="例如 gemini-3.1-pro" />
                </label>
              </div>
            </article>
          </div>
        </section>

        <section v-else class="form-section">
          <div class="section-head">
            <div>
              <h2>七牛云配置</h2>
              <p>统一管理上传、外链与资源前缀。</p>
            </div>
          </div>
          <div class="form-grid">
            <label>
              <span>Access Key</span>
              <div class="field-inline">
                <input v-model="modelCredentials.qiniuAccessKey" :type="modelSecretType('qiniuAccessKey')" />
                <button class="ghost-button tiny" type="button" @click="toggleModelSecret('qiniuAccessKey')">
                  {{ modelVisibleSecrets.qiniuAccessKey ? '隐藏' : '显示' }}
                </button>
              </div>
            </label>
            <label>
              <span>Secret Key</span>
              <div class="field-inline">
                <input v-model="modelCredentials.qiniuSecretKey" :type="modelSecretType('qiniuSecretKey')" />
                <button class="ghost-button tiny" type="button" @click="toggleModelSecret('qiniuSecretKey')">
                  {{ modelVisibleSecrets.qiniuSecretKey ? '隐藏' : '显示' }}
                </button>
              </div>
            </label>
            <label><span>Bucket</span><input v-model="modelCredentials.qiniuBucket" /></label>
            <label><span>Domain</span><input v-model="modelCredentials.qiniuDomain" /></label>
            <label><span>Upload Host</span><input v-model="modelCredentials.qiniuUploadHost" /></label>
            <label><span>Prefix</span><input v-model="modelCredentials.qiniuPrefix" /></label>
          </div>
        </section>
      </main>

      <aside class="settings-side-panel">
        <section class="side-card">
          <div class="side-card__head">
            <h3>当前生效摘要</h3>
          </div>
          <div class="side-list">
            <div class="side-row"><span>视频</span><strong>{{ capabilityProviderLabel(modelCredentials.videoProviderPrimary, modelCredentials.videoApifoxHubProfile) }} / {{ videoPrimaryModelBinding || '未设置' }}</strong></div>
            <div class="side-row"><span>图片</span><strong>{{ capabilityProviderLabel(modelCredentials.imageProviderPrimary, modelCredentials.imageApifoxHubProfile) }} / {{ imagePrimaryModelBinding || '未设置' }}</strong></div>
            <div class="side-row"><span>对话</span><strong>{{ capabilityProviderLabel(modelCredentials.chatProviderPrimary, modelCredentials.chatApifoxHubProfile) }} / {{ chatPrimaryModelBinding || '未设置' }}</strong></div>
          </div>
        </section>

        <section class="side-card">
          <div class="side-card__head">
            <h3>使用说明</h3>
          </div>
          <div class="bullet-list">
            <div class="bullet-item">先在“开放平台”填写 API Key 和 Base URL，再到“能力模型”选择平台与模型。</div>
            <div class="bullet-item">同一平台的凭证只维护一份，视频、图片、对话会复用，用户更容易理解。</div>
            <div class="bullet-item">保存后会立刻重新读取配置，避免前端展示与实际生效配置不一致。</div>
          </div>
        </section>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.settings-console {
  display: grid;
  gap: 12px;
  min-height: 100%;
  padding: 16px;
  background:
    radial-gradient(circle at 16% 0, rgba(109, 93, 255, 0.12), transparent 24%),
    radial-gradient(circle at 84% 10%, rgba(34, 211, 238, 0.08), transparent 18%),
    linear-gradient(180deg, #060b16 0%, #08111f 100%);
  color: #f8fafc;
}

.settings-shell,
.settings-nav-panel,
.settings-form-panel,
.settings-side-panel,
.side-card,
.summary-card,
.nav-item,
.settings-message,
.bullet-item,
.platform-card,
.capability-card {
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: linear-gradient(180deg, rgba(17, 28, 49, 0.92), rgba(8, 17, 31, 0.94));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.settings-shell {
  padding: 18px;
  display: grid;
  gap: 14px;
}

.settings-shell__hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.settings-kicker {
  color: #8ea0c7;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.settings-shell__hero h1 {
  margin: 6px 0 8px;
  font-size: 28px;
}

.settings-shell__hero p,
.section-head p,
.nav-item small,
.summary-card small,
.side-row span,
.platform-card__head p,
.capability-card__head p {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
}

.settings-shell__actions,
.field-inline,
.side-row,
.side-card__head,
.platform-card__head,
.capability-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-shell__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.settings-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.summary-card {
  padding: 12px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
}

.summary-card__icon,
.platform-card__icon,
.capability-card__icon,
.nav-item__icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
}

.platform-card__icon,
.capability-card__icon {
  width: 36px;
  height: 36px;
}

.capability-card__icon.is-violet,
.nav-item__icon {
  background: rgba(109, 93, 255, 0.16);
  color: #d8deff;
}

.capability-card__icon.is-cyan {
  background: rgba(34, 211, 238, 0.16);
  color: #c7f9ff;
}

.capability-card__icon.is-green {
  background: rgba(34, 197, 94, 0.16);
  color: #d1fae5;
}

.summary-card span {
  color: #94a3b8;
  font-size: 11px;
}

.summary-card strong {
  display: block;
  margin-top: 4px;
}

.settings-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 320px;
  gap: 12px;
  min-height: 0;
}

.settings-nav-panel,
.settings-form-panel,
.settings-side-panel {
  padding: 14px;
  min-height: 0;
}

.settings-nav-panel,
.settings-side-panel,
.settings-form-panel,
.side-card,
.form-section,
.capability-stack {
  display: grid;
  gap: 12px;
  align-content: start;
}

.nav-item {
  padding: 12px;
  text-align: left;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 10px;
  background: rgba(10, 19, 36, 0.78);
}

.nav-item.active {
  border-color: rgba(109, 93, 255, 0.42);
  box-shadow: 0 0 0 1px rgba(109, 93, 255, 0.12);
}

.settings-message {
  padding: 12px;
  font-size: 12px;
}

.settings-message.success {
  border-color: rgba(34, 197, 94, 0.24);
  background: rgba(34, 197, 94, 0.12);
  color: #d1fae5;
}

.settings-message.error {
  border-color: rgba(239, 68, 68, 0.24);
  background: rgba(239, 68, 68, 0.12);
  color: #fee2e2;
}

.section-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.section-head h2,
.side-card__head h3,
.platform-card__head h3,
.capability-card__head h3 {
  margin: 0;
}

.platform-grid,
.capability-stack {
  display: grid;
  gap: 12px;
}

.platform-card,
.capability-card,
.side-card {
  padding: 14px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.form-grid.single-column {
  grid-template-columns: 1fr;
}

.form-grid label,
.side-list {
  display: grid;
  gap: 6px;
}

.form-grid label span {
  color: #94a3b8;
  font-size: 11px;
}

.form-grid input,
.form-grid select {
  height: 42px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  background: #0a1324;
  padding: 0 12px;
  color: #f8fafc;
}

.field-inline input {
  flex: 1;
}

.side-row {
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.side-row:last-child {
  border-bottom: 0;
}

.bullet-list {
  display: grid;
  gap: 10px;
}

.bullet-item {
  padding: 12px;
  background: rgba(10, 19, 36, 0.78);
  font-size: 12px;
  color: #cbd5e1;
}

.primary-button,
.ghost-button {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.primary-button {
  background: linear-gradient(135deg, #6d5dff, #8b5cf6);
  border: 1px solid rgba(109, 93, 255, 0.42);
  color: #fff;
  box-shadow: 0 12px 32px rgba(109, 93, 255, 0.24);
}

.ghost-button {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.18);
  color: #cbd5e1;
}

.tiny {
  min-height: 30px;
  padding: 0 10px;
}

@media (max-width: 1440px) {
  .settings-layout,
  .settings-summary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 960px) {
  .settings-shell__hero,
  .form-grid {
    grid-template-columns: 1fr;
    display: grid;
  }
}
</style>
