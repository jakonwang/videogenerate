<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clapperboard, Cloud, Image as ImageIcon, KeyRound, MessagesSquare, Server } from 'lucide-vue-next'
import {
  listCapabilityPlatforms,
  mapPlatformToStoredProvider,
  normalizeIncomingPlatformProfile,
  resolveCapabilityPlatform,
  resolveCapabilityProviderLabel,
  type CapabilityKey,
  type ImagePlatformProfile,
  type PlatformProfile,
} from '../../../../shared/platformSettings'

type ProviderKey = 'kling' | 'grsai' | 'apifox_hub'
type PlatformKey = 'grsai' | 'ai666' | 'vectorengine' | 'xibapi' | 'gaorui'
type CapabilityPlatformKey = 'grsai' | 'ai666' | 'vectorengine' | 'xibapi' | 'gaorui'
type ChatPlatformKey = 'grsai' | 'ai666' | 'vectorengine'
type ApifoxProfileKey = PlatformProfile
type ApifoxImageProfileKey = ImagePlatformProfile
type SecretKey =
  | 'klingApiKey'
  | 'grsaiApiKey'
  | 'tikhubApiKey'
  | 'ai666ApiKey'
  | 'vectorEngineApiKey'
  | 'xibapiApiKey'
  | 'gaoruiApiKey'
  | 'replicateApiToken'
  | 'qiniuAccessKey'
  | 'qiniuSecretKey'
  | 'hermesFeishuAppSecret'
  | 'hermesFeishuTenantAccessToken'
  | 'hermesWecomCorpSecret'
  | 'hermesWecomAccessToken'

type HubCredentials = {
  enabled: boolean
  baseUrl: string
  apiKey: string
  chatProvider: 'openai' | 'anthropic' | 'gemini'
  chatModel: string
  chatEndpointStyle: 'openai_chat' | 'anthropic_native' | 'gemini_native'
  imageProvider: 'openai' | 'gemini' | 'jimeng' | 'midjourney'
  imageModel: string
  imageEditModel: string
  imageEndpointStyle: 'openai_images' | 'official_rest' | 'midjourney_task'
  videoProvider: 'openai_video' | 'sora' | 'veo' | 'grok' | 'jimeng' | 'vidu' | 'kling' | 'seedance2' | 'xibapi' | 'gaorui'
  textToVideoModel: string
  imageToVideoModel: string
  startEndVideoModel: string
  referenceVideoModel: string
  videoEndpointStyle: 'openai_video' | 'official_rest'
  defaultPollIntervalMs: number
  defaultTimeoutMs: number
}

type ModelCredentialsView = {
  klingApiKey: string
  klingHost: string
  grsaiApiKey: string
  grsaiHost: string
  tikhubApiKey: string
  replicateApiToken: string
  qiniuAccessKey: string
  qiniuSecretKey: string
  qiniuBucket: string
  qiniuDomain: string
  qiniuUploadHost: string
  qiniuPrefix: string
  allowMockWhenNoKey: boolean
  keyframeModel: string
  videoProviderPrimary: ProviderKey
  videoModelPrimary: string
  videoModelFallback: string
  grsaiVideoModel: string
  imageProviderPrimary: ProviderKey
  openaiImageQuality: 'low' | 'medium' | 'high'
  chatProviderPrimary: 'apifox_hub' | 'grsai'
  apifoxHubProfile: ApifoxProfileKey
  videoApifoxHubProfile: ApifoxProfileKey
  imageApifoxHubProfile: ApifoxImageProfileKey
  chatApifoxHubProfile: Exclude<ApifoxProfileKey, 'xibapi' | 'gaorui'>
  klingImageModel: string
  grsaiImageModel: string
  grsaiAnalysisModel: string
  ai666Hub: HubCredentials
  vectorEngineHub: HubCredentials
  xibapiHub: HubCredentials
  gaoruiHub: HubCredentials
  apifoxHub: HubCredentials
}

type HermesIntegrationView = {
  enabled: boolean
  callbackBaseUrl: string
  feishu: {
    enabled: boolean
    appId: string
    appSecret: string
    tenantAccessToken: string
    receiveIdType: 'open_id' | 'user_id' | 'union_id' | 'chat_id' | 'email'
    defaultReceiveId: string
  }
  wecom: {
    enabled: boolean
    corpId: string
    corpSecret: string
    accessToken: string
    agentId: string
    defaultToUser: string
  }
}

function createHubDefaults(input?: Partial<HubCredentials>): HubCredentials {
  return {
    enabled: input?.enabled ?? true,
    baseUrl: String(input?.baseUrl ?? ''),
    apiKey: String(input?.apiKey ?? ''),
    chatProvider: input?.chatProvider ?? 'openai',
    chatModel: String(input?.chatModel ?? 'gpt-4.1-mini'),
    chatEndpointStyle: input?.chatEndpointStyle ?? 'openai_chat',
    imageProvider: input?.imageProvider ?? 'openai',
    imageModel: String(input?.imageModel ?? 'gpt-image-1'),
    imageEditModel: String(input?.imageEditModel ?? ''),
    imageEndpointStyle: input?.imageEndpointStyle ?? 'openai_images',
    videoProvider: input?.videoProvider ?? 'veo',
    textToVideoModel: String(input?.textToVideoModel ?? 'veo_3_1-lite'),
    imageToVideoModel: String(input?.imageToVideoModel ?? 'veo_3_1-lite'),
    startEndVideoModel: String(input?.startEndVideoModel ?? 'veo_3_1-lite'),
    referenceVideoModel: String(input?.referenceVideoModel ?? 'veo_3_1-lite'),
    videoEndpointStyle: input?.videoEndpointStyle ?? 'official_rest',
    defaultPollIntervalMs: Number(input?.defaultPollIntervalMs ?? 2000) || 2000,
    defaultTimeoutMs: Number(input?.defaultTimeoutMs ?? 600000) || 600000,
  }
}

function createDefaultCredentials(): ModelCredentialsView {
  return {
    klingApiKey: '',
    klingHost: '',
    grsaiApiKey: '',
    grsaiHost: '',
    tikhubApiKey: '',
    replicateApiToken: '',
    qiniuAccessKey: '',
    qiniuSecretKey: '',
    qiniuBucket: '',
    qiniuDomain: '',
    qiniuUploadHost: '',
    qiniuPrefix: '',
    allowMockWhenNoKey: false,
    keyframeModel: '',
    videoProviderPrimary: 'grsai',
    videoModelPrimary: 'veo_3_1-lite',
    videoModelFallback: 'google/veo3.1-lite/image-to-video',
    grsaiVideoModel: 'grok-video-3',
    imageProviderPrimary: 'apifox_hub',
    openaiImageQuality: 'high',
    chatProviderPrimary: 'apifox_hub',
    apifoxHubProfile: 'vectorengine',
    videoApifoxHubProfile: 'vectorengine',
    imageApifoxHubProfile: 'vectorengine',
    chatApifoxHubProfile: 'vectorengine',
    klingImageModel: '',
    grsaiImageModel: '',
    grsaiAnalysisModel: '',
    ai666Hub: createHubDefaults(),
    vectorEngineHub: createHubDefaults(),
    xibapiHub: createHubDefaults({
      videoProvider: 'xibapi',
      textToVideoModel: 'veo_3_1-fast',
      imageToVideoModel: 'veo_3_1-fast',
      startEndVideoModel: 'veo_3_1-fast',
      referenceVideoModel: 'veo_3_1-fast',
    }),
    gaoruiHub: createHubDefaults({
      videoProvider: 'gaorui',
      textToVideoModel: 'veo_3_1',
      imageToVideoModel: 'veo_3_1-fl',
      startEndVideoModel: 'veo_3_1-fl',
      referenceVideoModel: 'veo_3_1-components',
    }),
    apifoxHub: createHubDefaults(),
  }
}

function createDefaultHermesIntegration(): HermesIntegrationView {
  return {
    enabled: false,
    callbackBaseUrl: '',
    feishu: {
      enabled: false,
      appId: '',
      appSecret: '',
      tenantAccessToken: '',
      receiveIdType: 'open_id',
      defaultReceiveId: '',
    },
    wecom: {
      enabled: false,
      corpId: '',
      corpSecret: '',
      accessToken: '',
      agentId: '',
      defaultToUser: '',
    },
  }
}

const settingsBusy = ref(false)
const settingsMessage = ref('')
const modelSettingsBusy = ref(false)
const modelSettingsSection = ref<'platforms' | 'capabilities' | 'qiniu'>('platforms')
const { t } = useI18n()
const modelVisibleSecrets = ref<Record<SecretKey, boolean>>({
  klingApiKey: false,
  grsaiApiKey: false,
  tikhubApiKey: false,
  ai666ApiKey: false,
  vectorEngineApiKey: false,
  xibapiApiKey: false,
  gaoruiApiKey: false,
  replicateApiToken: false,
  qiniuAccessKey: false,
  qiniuSecretKey: false,
  hermesFeishuAppSecret: false,
  hermesFeishuTenantAccessToken: false,
  hermesWecomCorpSecret: false,
  hermesWecomAccessToken: false,
})
const modelCredentials = ref<ModelCredentialsView>(createDefaultCredentials())
const hermesIntegration = ref<HermesIntegrationView>(createDefaultHermesIntegration())

const sectionMeta = [
  { key: 'platforms', labelKey: 'settings.sections.platforms.label', descKey: 'settings.sections.platforms.desc', icon: KeyRound },
  { key: 'capabilities', labelKey: 'settings.sections.capabilities.label', descKey: 'settings.sections.capabilities.desc', icon: Server },
  { key: 'qiniu', labelKey: 'settings.sections.qiniu.label', descKey: 'settings.sections.qiniu.desc', icon: Cloud },
] as const

const providerMeta: Record<PlatformKey, { label: string; hostLabel: string; hostPlaceholder: string; keyName: SecretKey }> = {
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
  xibapi: {
    label: 'XIBAPI',
    hostLabel: 'Base URL',
    hostPlaceholder: 'https://xibapi.com',
    keyName: 'xibapiApiKey',
  },
  gaorui: {
    label: 'GaoruiAPI',
    hostLabel: 'Base URL',
    hostPlaceholder: 'https://gaorui.cc',
    keyName: 'gaoruiApiKey',
  },
}

const settingsMessageTone = computed(() => {
  const text = String(settingsMessage.value || '').trim().toLowerCase()
  if (!text) return 'neutral'
  return /saved|loaded|opened|started|success/.test(text) ? 'success' : 'error'
})

function capabilityProviderLabel(
  capability: CapabilityKey,
  provider: ProviderKey | 'grsai',
  profile?: ApifoxProfileKey,
) {
  return resolveCapabilityProviderLabel(provider, profile, capability)
}

function capabilityProfileKey(target: 'videoProviderPrimary' | 'imageProviderPrimary' | 'chatProviderPrimary') {
  if (target === 'imageProviderPrimary') return 'imageApifoxHubProfile'
  if (target === 'chatProviderPrimary') return 'chatApifoxHubProfile'
  return 'videoApifoxHubProfile'
}

function toCapabilityPlatform(
  capability: CapabilityKey,
  provider: ProviderKey | 'grsai',
  profile?: ApifoxProfileKey,
): CapabilityPlatformKey {
  return resolveCapabilityPlatform(provider, profile, capability) as CapabilityPlatformKey
}

function applyCapabilityPlatform(
  target: 'videoProviderPrimary' | 'imageProviderPrimary' | 'chatProviderPrimary',
  platform: CapabilityPlatformKey | ChatPlatformKey,
) {
  const profileKey = capabilityProfileKey(target)
  if (platform === 'grsai') {
    ;(modelCredentials.value[target] as ProviderKey | 'grsai') = 'grsai'
    return
  }
  const normalizedPlatform =
    target === 'videoProviderPrimary'
      ? normalizeIncomingPlatformProfile('video', platform)
      : target === 'imageProviderPrimary'
        ? normalizeIncomingPlatformProfile('image', platform, 'vectorengine')
        : normalizeIncomingPlatformProfile('chat', platform, 'vectorengine')
  const stored = mapPlatformToStoredProvider(normalizedPlatform)
  ;(modelCredentials.value[target] as ProviderKey | 'grsai') = stored.provider as ProviderKey | 'grsai'
  if (stored.profile) {
    if (stored.profile === 'ai666') modelCredentials.value.ai666Hub.enabled = true
    if (stored.profile === 'vectorengine') modelCredentials.value.vectorEngineHub.enabled = true
    if (stored.profile === 'xibapi') modelCredentials.value.xibapiHub.enabled = true
    if (stored.profile === 'gaorui') modelCredentials.value.gaoruiHub.enabled = true
    if (profileKey === 'chatApifoxHubProfile' && (stored.profile === 'xibapi' || stored.profile === 'gaorui')) {
      modelCredentials.value.chatApifoxHubProfile = 'vectorengine'
      return
    }
    ;(modelCredentials.value[profileKey] as ApifoxProfileKey | ApifoxImageProfileKey) = stored.profile as ApifoxProfileKey
  }
}

const videoPrimaryPlatformBinding = computed({
  get: () => toCapabilityPlatform('video', modelCredentials.value.videoProviderPrimary, modelCredentials.value.videoApifoxHubProfile),
  set: (value: CapabilityPlatformKey) => applyCapabilityPlatform('videoProviderPrimary', value),
})

const imagePrimaryPlatformBinding = computed({
  get: () => toCapabilityPlatform('image', modelCredentials.value.imageProviderPrimary, modelCredentials.value.imageApifoxHubProfile),
  set: (value: CapabilityPlatformKey) => applyCapabilityPlatform('imageProviderPrimary', value),
})

const chatPrimaryPlatformBinding = computed({
  get: () => toCapabilityPlatform('chat', modelCredentials.value.chatProviderPrimary, modelCredentials.value.chatApifoxHubProfile),
  set: (value: ChatPlatformKey) => applyCapabilityPlatform('chatProviderPrimary', value),
})

const videoPlatformOptions = computed(() => listCapabilityPlatforms('video'))
const imagePlatformOptions = computed(() => listCapabilityPlatforms('image'))
const chatPlatformOptions = computed(() => listCapabilityPlatforms('chat'))

function activeApifoxHub(capability: 'video' | 'image' | 'chat') {
  const profile =
    capability === 'video'
      ? modelCredentials.value.videoApifoxHubProfile
      : capability === 'image'
        ? modelCredentials.value.imageApifoxHubProfile
        : modelCredentials.value.chatApifoxHubProfile
  if (profile === 'ai666') return modelCredentials.value.ai666Hub
  if (profile === 'xibapi') return modelCredentials.value.xibapiHub
  if (profile === 'gaorui') return modelCredentials.value.gaoruiHub
  return modelCredentials.value.vectorEngineHub
}

const videoPrimaryModelBinding = computed({
  get: () => {
    const creds = modelCredentials.value
    if (creds.videoProviderPrimary === 'apifox_hub') {
      const hub = activeApifoxHub('video')
      return hub.startEndVideoModel || hub.referenceVideoModel || hub.imageToVideoModel || hub.textToVideoModel || ''
    }
    if (creds.videoProviderPrimary === 'grsai') return creds.grsaiVideoModel || ''
    return creds.videoModelPrimary || creds.videoModelFallback || ''
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
    creds.videoModelPrimary = value
    creds.videoModelFallback = value
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

const imageQualityLabel = computed(() => String(modelCredentials.value.openaiImageQuality || 'high').toUpperCase())

const summaryCards = computed(() => [
  {
    title: t('settings.summary.cards.video.title'),
    value: capabilityProviderLabel('video', modelCredentials.value.videoProviderPrimary, modelCredentials.value.videoApifoxHubProfile),
    meta: videoPrimaryModelBinding.value || t('settings.common.notSet'),
    tone: 'violet',
    icon: Clapperboard,
  },
  {
    title: t('settings.summary.cards.image.title'),
    value: capabilityProviderLabel('image', modelCredentials.value.imageProviderPrimary, modelCredentials.value.imageApifoxHubProfile),
    meta: `${imagePrimaryModelBinding.value || t('settings.common.notSet')} / ${imageQualityLabel.value}`,
    tone: 'cyan',
    icon: ImageIcon,
  },
  {
    title: t('settings.summary.cards.chat.title'),
    value: capabilityProviderLabel('chat', modelCredentials.value.chatProviderPrimary, modelCredentials.value.chatApifoxHubProfile),
    meta: chatPrimaryModelBinding.value || t('settings.common.notSet'),
    tone: 'green',
    icon: MessagesSquare,
  },
  {
    title: t('settings.summary.cards.status.title'),
    value: settingsMessage.value || t('settings.summary.cards.status.waiting'),
    meta: modelSettingsBusy.value ? t('settings.summary.cards.status.processing') : t('settings.summary.cards.status.ready'),
    tone: 'slate',
    icon: Server,
  },
])

const platformCards = computed(() => [
  {
    provider: 'grsai' as PlatformKey,
    title: 'GRS.AI',
    desc: t('settings.platforms.cards.grsai.desc'),
    icon: MessagesSquare,
  },
  {
    provider: 'ai666' as PlatformKey,
    title: 'AI666',
    desc: t('settings.platforms.cards.ai666.desc'),
    icon: Server,
  },
  {
    provider: 'vectorengine' as PlatformKey,
    title: 'VectorEngine',
    desc: t('settings.platforms.cards.vectorengine.desc'),
    icon: Server,
  },
  {
    provider: 'xibapi' as PlatformKey,
    title: 'XIBAPI',
    desc: t('settings.platforms.cards.xibapi.desc'),
    icon: Server,
  },
  {
    provider: 'gaorui' as PlatformKey,
    title: 'GaoruiAPI',
    desc: 'OpenAI-compatible async Veo video platform',
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
  if (provider === 'grsai') return modelCredentials.value.grsaiApiKey
  if (provider === 'ai666') return modelCredentials.value.ai666Hub.apiKey
  if (provider === 'xibapi') return modelCredentials.value.xibapiHub.apiKey
  if (provider === 'gaorui') return modelCredentials.value.gaoruiHub.apiKey
  return modelCredentials.value.vectorEngineHub.apiKey
}

function providerHost(provider: PlatformKey) {
  if (provider === 'grsai') return modelCredentials.value.grsaiHost
  if (provider === 'ai666') return modelCredentials.value.ai666Hub.baseUrl
  if (provider === 'xibapi') return modelCredentials.value.xibapiHub.baseUrl
  if (provider === 'gaorui') return modelCredentials.value.gaoruiHub.baseUrl
  return modelCredentials.value.vectorEngineHub.baseUrl
}

function assignProviderApiKey(provider: PlatformKey, value: string) {
  if (provider === 'grsai') {
    modelCredentials.value.grsaiApiKey = value
    return
  }
  if (provider === 'ai666') {
    modelCredentials.value.ai666Hub.apiKey = value
    return
  }
  if (provider === 'xibapi') {
    modelCredentials.value.xibapiHub.apiKey = value
    return
  }
  if (provider === 'gaorui') {
    modelCredentials.value.gaoruiHub.apiKey = value
    return
  }
  modelCredentials.value.vectorEngineHub.apiKey = value
}

function assignProviderHost(provider: PlatformKey, value: string) {
  if (provider === 'grsai') {
    modelCredentials.value.grsaiHost = value
    return
  }
  if (provider === 'ai666') {
    modelCredentials.value.ai666Hub.baseUrl = value
    return
  }
  if (provider === 'xibapi') {
    modelCredentials.value.xibapiHub.baseUrl = value
    modelCredentials.value.xibapiHub.videoProvider = 'xibapi'
    return
  }
  if (provider === 'gaorui') {
    modelCredentials.value.gaoruiHub.baseUrl = value
    modelCredentials.value.gaoruiHub.videoProvider = 'gaorui'
    return
  }
  modelCredentials.value.vectorEngineHub.baseUrl = value
}

function normalizeIncomingCredentials(next: any): ModelCredentialsView {
  const defaults = createDefaultCredentials()
  const normalizedVideoProviderPrimary = next?.videoProviderPrimary === 'kling' ? 'grsai' : next?.videoProviderPrimary
  const normalizedImageProviderPrimary = next?.imageProviderPrimary === 'kling' ? 'grsai' : next?.imageProviderPrimary
  return {
    ...defaults,
    ...next,
    videoProviderPrimary: normalizedVideoProviderPrimary ?? defaults.videoProviderPrimary,
    imageProviderPrimary: normalizedImageProviderPrimary ?? defaults.imageProviderPrimary,
    ai666Hub: createHubDefaults(next?.ai666Hub),
    vectorEngineHub: createHubDefaults(next?.vectorEngineHub),
    xibapiHub: createHubDefaults({
      ...next?.xibapiHub,
      videoProvider: next?.xibapiHub?.videoProvider || 'xibapi',
      textToVideoModel: next?.xibapiHub?.textToVideoModel || 'veo_3_1-fast',
      imageToVideoModel: next?.xibapiHub?.imageToVideoModel || 'veo_3_1-fast',
      startEndVideoModel: next?.xibapiHub?.startEndVideoModel || 'veo_3_1-fast',
      referenceVideoModel: next?.xibapiHub?.referenceVideoModel || 'veo_3_1-fast',
    }),
    gaoruiHub: createHubDefaults({
      ...next?.gaoruiHub,
      videoProvider: next?.gaoruiHub?.videoProvider || 'gaorui',
      textToVideoModel: next?.gaoruiHub?.textToVideoModel || 'veo_3_1',
      imageToVideoModel: next?.gaoruiHub?.imageToVideoModel || 'veo_3_1-fl',
      startEndVideoModel: next?.gaoruiHub?.startEndVideoModel || 'veo_3_1-fl',
      referenceVideoModel: next?.gaoruiHub?.referenceVideoModel || 'veo_3_1-components',
    }),
    apifoxHub: createHubDefaults(next?.apifoxHub),
    tikhubApiKey: String(next?.tikhubApiKey ?? defaults.tikhubApiKey),
  }
}

function normalizeIncomingHermesIntegration(next: any): HermesIntegrationView {
  const defaults = createDefaultHermesIntegration()
  return {
    ...defaults,
    ...next,
    callbackBaseUrl: String(next?.callbackBaseUrl ?? defaults.callbackBaseUrl),
    feishu: {
      ...defaults.feishu,
      ...next?.feishu,
    },
    wecom: {
      ...defaults.wecom,
      ...next?.wecom,
    },
  }
}

async function refreshModelSettings() {
  modelSettingsBusy.value = true
  try {
    const [next, hermesNext] = await Promise.all([
      window.api.clone.getModelCredentials() as Promise<Partial<ModelCredentialsView>>,
      window.api.clone.getHermesIntegrationSettings() as Promise<Partial<HermesIntegrationView>>,
    ])
    modelCredentials.value = normalizeIncomingCredentials(next)
    hermesIntegration.value = normalizeIncomingHermesIntegration(hermesNext)
    settingsMessage.value = t('settings.messages.loaded')
  } catch (e: any) {
    settingsMessage.value = `${t('settings.messages.loadFailed')}: ${e?.message ?? String(e)}`
  } finally {
    modelSettingsBusy.value = false
  }
}

async function saveModelSettings() {
  modelSettingsBusy.value = true
  settingsMessage.value = ''
  try {
    const payload = JSON.parse(JSON.stringify(modelCredentials.value)) as ModelCredentialsView & Record<string, any>
    payload.videoProviderFallback = payload.videoProviderPrimary
    payload.videoModelFallback = payload.videoModelPrimary
    payload.apifoxHubProfile =
      payload.videoApifoxHubProfile === 'ai666'
        ? 'ai666'
        : payload.videoApifoxHubProfile === 'xibapi'
          ? 'xibapi'
          : payload.videoApifoxHubProfile === 'gaorui'
            ? 'gaorui'
          : 'vectorengine'
    payload.apifoxHub =
      payload.apifoxHubProfile === 'ai666'
        ? { ...payload.ai666Hub }
        : payload.apifoxHubProfile === 'xibapi'
          ? { ...payload.xibapiHub, videoProvider: 'xibapi' }
          : payload.apifoxHubProfile === 'gaorui'
            ? { ...payload.gaoruiHub, videoProvider: 'gaorui' }
          : { ...payload.vectorEngineHub }
    if (payload.videoApifoxHubProfile === 'ai666') payload.ai666Hub.enabled = true
    if (payload.videoApifoxHubProfile === 'vectorengine') payload.vectorEngineHub.enabled = true
    if (payload.videoApifoxHubProfile === 'xibapi') payload.xibapiHub.enabled = true
    if (payload.videoApifoxHubProfile === 'gaorui') payload.gaoruiHub.enabled = true
    if (payload.imageApifoxHubProfile === 'ai666') payload.ai666Hub.enabled = true
    if (payload.imageApifoxHubProfile === 'vectorengine') payload.vectorEngineHub.enabled = true
    if (payload.chatApifoxHubProfile === 'ai666') payload.ai666Hub.enabled = true
    if (payload.chatApifoxHubProfile === 'vectorengine') payload.vectorEngineHub.enabled = true
    await window.api.clone.setModelCredentials(payload)
    await window.api.clone.setHermesIntegrationSettings(JSON.parse(JSON.stringify(hermesIntegration.value)))
    const [confirmed, confirmedHermes] = await Promise.all([
      window.api.clone.getModelCredentials() as Promise<Partial<ModelCredentialsView>>,
      window.api.clone.getHermesIntegrationSettings() as Promise<Partial<HermesIntegrationView>>,
    ])
    modelCredentials.value = normalizeIncomingCredentials(confirmed)
    hermesIntegration.value = normalizeIncomingHermesIntegration(confirmedHermes)
    settingsMessage.value = t('settings.messages.savedAndReloaded')
  } catch (e: any) {
    settingsMessage.value = `${t('settings.messages.saveFailed')}: ${e?.message ?? String(e)}`
  } finally {
    modelSettingsBusy.value = false
  }
}

async function openDataDir() {
  try {
    const paths = (await window.api.getPaths()) as { dataDir?: string }
    const dir = String(paths?.dataDir ?? '').trim()
    if (!dir) {
      settingsMessage.value = t('settings.messages.dataDirNotFound')
      return
    }
    await window.api.shell.openPath(dir)
    settingsMessage.value = t('settings.messages.dataDirOpened')
  } catch (e: any) {
    settingsMessage.value = `${t('settings.messages.openDataDirFailed')}: ${e?.message ?? String(e)}`
  }
}

async function checkUpdatesNow() {
  if (settingsBusy.value) return
  settingsBusy.value = true
  settingsMessage.value = ''
  try {
    const res = (await window.api.updater.checkForUpdates()) as { ok: true } | { ok: false; reason?: string; message?: string }
    settingsMessage.value = res?.ok ? t('settings.messages.updateCheckStarted') : `${t('settings.messages.updateCheckFailed')}: ${res?.message ?? res?.reason ?? 'unknown'}`
  } catch (e: any) {
    settingsMessage.value = `${t('settings.messages.updateCheckFailed')}: ${e?.message ?? String(e)}`
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
          <div class="settings-kicker">{{ t('settings.hero.kicker') }}</div>
          <h1>{{ t('settings.hero.title') }}</h1>
          <p>{{ t('settings.hero.subtitle') }}</p>
        </div>
        <div class="settings-shell__actions">
          <button class="ghost-button small" :disabled="settingsBusy" @click="checkUpdatesNow">{{ t('settings.actions.checkUpdates') }}</button>
          <button class="ghost-button small" @click="openDataDir">{{ t('settings.actions.openDataDir') }}</button>
          <button class="ghost-button small" @click="refreshModelSettings">{{ t('settings.actions.refresh') }}</button>
          <button class="primary-button small" :disabled="modelSettingsBusy" @click="saveModelSettings">
            {{ modelSettingsBusy ? t('settings.actions.saving') : t('settings.actions.saveSettings') }}
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
            <strong>{{ t(item.labelKey) }}</strong>
            <small>{{ t(item.descKey) }}</small>
          </div>
        </button>
      </aside>

      <main class="settings-form-panel">
        <div v-if="settingsMessage" class="settings-message" :class="settingsMessageTone">{{ settingsMessage }}</div>

        <section v-if="modelSettingsSection === 'platforms'" class="form-section">
          <div class="section-head">
            <div>
              <h2>{{ t('settings.platforms.title') }}</h2>
              <p>{{ t('settings.platforms.subtitle') }}</p>
            </div>
          </div>

          <div class="platform-grid">
            <article class="platform-card">
              <div class="platform-card__head">
                <div class="platform-card__icon">
                  <KeyRound :size="16" />
                </div>
                <div>
                  <h3>TikHub</h3>
                  <p>TikTok share-link parsing and download access token.</p>
                </div>
              </div>

              <div class="form-grid single-column">
                <label>
                  <span>API Key</span>
                  <div class="field-inline">
                    <input v-model="modelCredentials.tikhubApiKey" :type="modelSecretType('tikhubApiKey')" placeholder="TikHub bearer token" />
                    <button class="ghost-button tiny" type="button" @click="toggleModelSecret('tikhubApiKey')">
                      {{ modelVisibleSecrets.tikhubApiKey ? t('settings.common.hide') : t('settings.common.show') }}
                    </button>
                  </div>
                </label>
              </div>
            </article>

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
                  <span>{{ t('settings.platforms.fields.apiKey') }}</span>
                  <div class="field-inline">
                    <input
                      :value="providerApiKey(card.provider)"
                      :type="modelSecretType(providerMeta[card.provider].keyName)"
                      @input="assignProviderApiKey(card.provider, ($event.target as HTMLInputElement).value)"
                    />
                    <button class="ghost-button tiny" type="button" @click="toggleModelSecret(providerMeta[card.provider].keyName)">
                      {{ modelVisibleSecrets[providerMeta[card.provider].keyName] ? t('settings.common.hide') : t('settings.common.show') }}
                    </button>
                  </div>
                </label>

                <label>
                  <span>{{ providerMeta[card.provider].hostLabel }}</span>
                  <input
                    :value="providerHost(card.provider)"
                    :placeholder="providerMeta[card.provider].hostPlaceholder"
                    @input="assignProviderHost(card.provider, ($event.target as HTMLInputElement).value)"
                  />
                </label>
              </div>
            </article>

          </div>
        </section>

        <section v-else-if="modelSettingsSection === 'capabilities'" class="form-section">
          <div class="section-head">
            <div>
              <h2>{{ t('settings.capabilities.title') }}</h2>
              <p>{{ t('settings.capabilities.subtitle') }}</p>
            </div>
          </div>

          <div class="capability-stack">
            <article class="capability-card">
              <div class="capability-card__head">
                <div class="capability-card__icon is-violet"><Clapperboard :size="16" /></div>
                <div>
                  <h3>{{ t('settings.capabilities.video.title') }}</h3>
                  <p>{{ t('settings.capabilities.video.desc') }}</p>
                </div>
              </div>
              <div class="form-grid">
                <label>
                  <span>{{ t('settings.capabilities.fields.primaryPlatform') }}</span>
                  <select v-model="videoPrimaryPlatformBinding">
                    <option v-for="option in videoPlatformOptions" :key="`video-${option.id}`" :value="option.id">{{ option.label }}</option>
                  </select>
                </label>
                <label>
                  <span>{{ t('settings.capabilities.fields.primaryModel') }}</span>
                  <input v-model="videoPrimaryModelBinding" :placeholder="t('settings.capabilities.placeholders.videoPrimaryModel')" />
                </label>
              </div>
            </article>

            <article class="capability-card">
              <div class="capability-card__head">
                <div class="capability-card__icon is-cyan"><ImageIcon :size="16" /></div>
                <div>
                  <h3>{{ t('settings.capabilities.image.title') }}</h3>
                  <p>{{ t('settings.capabilities.image.desc') }}</p>
                </div>
              </div>
              <div class="form-grid">
                <label>
                  <span>{{ t('settings.capabilities.fields.primaryPlatform') }}</span>
                  <select v-model="imagePrimaryPlatformBinding">
                    <option v-for="option in imagePlatformOptions" :key="`image-${option.id}`" :value="option.id">{{ option.label }}</option>
                  </select>
                </label>
                <label>
                  <span>{{ t('settings.capabilities.fields.primaryModel') }}</span>
                  <input v-model="imagePrimaryModelBinding" :placeholder="t('settings.capabilities.placeholders.imagePrimaryModel')" />
                </label>
                <label>
                  <span>{{ t('settings.capabilities.fields.imageQuality') }}</span>
                  <select v-model="modelCredentials.openaiImageQuality">
                    <option value="low">{{ t('settings.capabilities.quality.low') }}</option>
                    <option value="medium">{{ t('settings.capabilities.quality.medium') }}</option>
                    <option value="high">{{ t('settings.capabilities.quality.high') }}</option>
                  </select>
                </label>
              </div>
            </article>

            <article class="capability-card">
              <div class="capability-card__head">
                <div class="capability-card__icon is-green"><MessagesSquare :size="16" /></div>
                <div>
                  <h3>{{ t('settings.capabilities.chat.title') }}</h3>
                  <p>{{ t('settings.capabilities.chat.desc') }}</p>
                </div>
              </div>
              <div class="form-grid">
                <label>
                  <span>{{ t('settings.capabilities.fields.primaryPlatform') }}</span>
                  <select v-model="chatPrimaryPlatformBinding">
                    <option v-for="option in chatPlatformOptions" :key="`chat-${option.id}`" :value="option.id">{{ option.label }}</option>
                  </select>
                </label>
                <label>
                  <span>{{ t('settings.capabilities.fields.primaryModel') }}</span>
                  <input v-model="chatPrimaryModelBinding" :placeholder="t('settings.capabilities.placeholders.chatPrimaryModel')" />
                </label>
              </div>
            </article>
          </div>
        </section>

        <section v-else class="form-section">
          <div class="section-head">
            <div>
              <h2>{{ t('settings.qiniu.title') }}</h2>
              <p>{{ t('settings.qiniu.subtitle') }}</p>
            </div>
          </div>
          <div class="form-grid">
            <label>
              <span>{{ t('settings.qiniu.fields.accessKey') }}</span>
              <div class="field-inline">
                <input v-model="modelCredentials.qiniuAccessKey" :type="modelSecretType('qiniuAccessKey')" />
                <button class="ghost-button tiny" type="button" @click="toggleModelSecret('qiniuAccessKey')">
                  {{ modelVisibleSecrets.qiniuAccessKey ? t('settings.common.hide') : t('settings.common.show') }}
                </button>
              </div>
            </label>
            <label>
              <span>{{ t('settings.qiniu.fields.secretKey') }}</span>
              <div class="field-inline">
                <input v-model="modelCredentials.qiniuSecretKey" :type="modelSecretType('qiniuSecretKey')" />
                <button class="ghost-button tiny" type="button" @click="toggleModelSecret('qiniuSecretKey')">
                  {{ modelVisibleSecrets.qiniuSecretKey ? t('settings.common.hide') : t('settings.common.show') }}
                </button>
              </div>
            </label>
            <label><span>{{ t('settings.qiniu.fields.bucket') }}</span><input v-model="modelCredentials.qiniuBucket" /></label>
            <label><span>{{ t('settings.qiniu.fields.domain') }}</span><input v-model="modelCredentials.qiniuDomain" /></label>
            <label><span>{{ t('settings.qiniu.fields.uploadHost') }}</span><input v-model="modelCredentials.qiniuUploadHost" /></label>
            <label><span>{{ t('settings.qiniu.fields.prefix') }}</span><input v-model="modelCredentials.qiniuPrefix" /></label>
          </div>
        </section>
      </main>

      <aside class="settings-side-panel">
        <section class="side-card">
          <div class="side-card__head">
            <h3>{{ t('settings.summary.title') }}</h3>
          </div>
          <div class="side-list">
            <div class="side-row"><span>{{ t('settings.summary.rows.video') }}</span><strong>{{ capabilityProviderLabel('video', modelCredentials.videoProviderPrimary, modelCredentials.videoApifoxHubProfile) }} / {{ videoPrimaryModelBinding || t('settings.common.notSet') }}</strong></div>
            <div class="side-row"><span>{{ t('settings.summary.rows.image') }}</span><strong>{{ capabilityProviderLabel('image', modelCredentials.imageProviderPrimary, modelCredentials.imageApifoxHubProfile) }} / {{ imagePrimaryModelBinding || t('settings.common.notSet') }} / {{ imageQualityLabel }}</strong></div>
            <div class="side-row"><span>{{ t('settings.summary.rows.chat') }}</span><strong>{{ capabilityProviderLabel('chat', modelCredentials.chatProviderPrimary, modelCredentials.chatApifoxHubProfile) }} / {{ chatPrimaryModelBinding || t('settings.common.notSet') }}</strong></div>
          </div>
        </section>

        <section class="side-card">
          <div class="side-card__head">
            <h3>{{ t('settings.notes.title') }}</h3>
          </div>
          <div class="bullet-list">
            <div class="bullet-item">{{ t('settings.notes.items.credentialsReuse') }}</div>
            <div class="bullet-item">{{ t('settings.notes.items.xibapiIndependent') }}</div>
            <div class="bullet-item">{{ t('settings.notes.items.reloadAfterSave') }}</div>
            <div class="bullet-item">{{ t('settings.notes.items.imageQualityForwarded') }}</div>
          </div>
        </section>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.settings-console {
  display: grid;
  gap: 10px;
  min-height: 100%;
  padding: 12px;
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
  padding: 14px 16px;
  display: grid;
  gap: 10px;
}

.settings-shell__hero {
  display: flex;
  justify-content: space-between;
  gap: 12px;
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
  margin: 4px 0 6px;
  font-size: 24px;
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

.checkbox-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.checkbox-field input[type='checkbox'] {
  width: 16px;
  height: 16px;
}

.settings-shell__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.settings-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.summary-card {
  padding: 10px 12px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 8px;
}

.summary-card__icon,
.platform-card__icon,
.capability-card__icon,
.nav-item__icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
}

.platform-card__icon,
.capability-card__icon {
  width: 34px;
  height: 34px;
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
  margin-top: 2px;
  line-height: 1.2;
}

.settings-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 320px;
  gap: 10px;
  min-height: 0;
}

.settings-nav-panel,
.settings-form-panel,
.settings-side-panel {
  padding: 12px;
  min-height: 0;
}

.settings-nav-panel,
.settings-side-panel,
.settings-form-panel,
.side-card,
.form-section,
.capability-stack {
  display: grid;
  gap: 10px;
  align-content: start;
}

.nav-item {
  padding: 10px;
  text-align: left;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 8px;
  background: rgba(10, 19, 36, 0.78);
}

.nav-item.active {
  border-color: rgba(109, 93, 255, 0.42);
  box-shadow: 0 0 0 1px rgba(109, 93, 255, 0.12);
}

.settings-message {
  padding: 10px 12px;
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
  gap: 10px;
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
  gap: 10px;
}

.platform-card,
.capability-card,
.side-card {
  padding: 12px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
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
  height: 38px;
  border-radius: 10px;
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
  padding: 8px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}

.side-row:last-child {
  border-bottom: 0;
}

.bullet-list {
  display: grid;
  gap: 8px;
}

.bullet-item {
  padding: 10px 12px;
  background: rgba(10, 19, 36, 0.78);
  font-size: 12px;
  color: #cbd5e1;
}

.primary-button,
.ghost-button {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 10px;
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
