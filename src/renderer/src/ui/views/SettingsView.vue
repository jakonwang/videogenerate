<script setup lang="ts">
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  Check,
  Clapperboard,
  Cloud,
  Eye,
  EyeOff,
  HardDrive,
  Image as ImageIcon,
  KeyRound,
  MessagesSquare,
  Palette,
  Server,
  ClipboardList,
  DownloadCloud,
  FolderOpen,
  Info,
  Layers,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  Brain,
  AlarmClock,
} from 'lucide-vue-next'
import { useAppSettingsStore, type AppTheme } from '@/stores/appSettings'
import StorageManagementPanel from '../components/StorageManagementPanel.vue'
import BrandMemorySettings from '../components/ai/BrandMemorySettings.vue'
import AiAutomationSettings from '../components/ai/AiAutomationSettings.vue'
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

const settingsBusy = ref(false)
const settingsMessage = ref('')
const modelSettingsBusy = ref(false)
type SettingsSection =
  | 'appearance'
  | 'platforms'
  | 'capabilities'
  | 'storage-management'
  | 'qiniu'
  | 'brand'
  | 'automation'

const settingsSection = ref<SettingsSection>('appearance')
const settingsNavPanel = ref<HTMLElement | null>(null)
const { t } = useI18n()
const route = useRoute()
const appSettings = useAppSettingsStore()

watch(() => route.query.section, (value) => {
  const section = String(Array.isArray(value) ? value[0] : value || '') as SettingsSection
  if (['appearance', 'platforms', 'capabilities', 'storage-management', 'qiniu', 'brand', 'automation'].includes(section)) settingsSection.value = section
}, { immediate: true })

function revealActiveSettingsSection() {
  void nextTick(() => {
    settingsNavPanel.value?.querySelector<HTMLElement>('.settings-nav__item.is-active')?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
    })
  })
}

watch(settingsSection, revealActiveSettingsSection)
const accessKeyInput = ref(appSettings.accessKey)
const accessKeyVisible = ref(false)
const accessKeyMessage = ref('')
const themeOptions: Array<{ value: AppTheme; labelKey: string }> = [
  { value: 'dark-teal', labelKey: 'settings.appearance.themes.darkTeal' },
  { value: 'light-teal', labelKey: 'settings.appearance.themes.lightTeal' },
  { value: 'mono', labelKey: 'settings.appearance.themes.mono' },
]
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
})
const modelCredentials = ref<ModelCredentialsView>(createDefaultCredentials())
const sectionGroups = [
  {
    key: 'general',
    labelKey: 'settings.navigation.groups.general',
    items: [
      { key: 'appearance', labelKey: 'settings.sections.appearance.label', descKey: 'settings.sections.appearance.desc', icon: Palette },
    ],
  },
  {
    key: 'ai',
    labelKey: 'settings.navigation.groups.ai',
    items: [
      { key: 'platforms', labelKey: 'settings.sections.platforms.label', descKey: 'settings.sections.platforms.desc', icon: KeyRound },
      { key: 'capabilities', labelKey: 'settings.sections.capabilities.label', descKey: 'settings.sections.capabilities.desc', icon: Server },
    ],
  },
  {
    key: 'producer',
    labelKey: 'ai.settingsGroup',
    items: [
      { key: 'brand', labelKey: 'ai.brand.title', descKey: 'ai.brand.navDesc', icon: Brain },
      { key: 'automation', labelKey: 'ai.automation.navTitle', descKey: 'ai.automation.navDesc', icon: AlarmClock },
    ],
  },
  {
    key: 'storage',
    labelKey: 'settings.navigation.groups.storage',
    items: [
      { key: 'storage-management', labelKey: 'settings.sections.storageManagement.label', descKey: 'settings.sections.storageManagement.desc', icon: HardDrive },
      { key: 'qiniu', labelKey: 'settings.sections.qiniu.label', descKey: 'settings.sections.qiniu.desc', icon: Cloud },
    ],
  },
] as const

const isModelSettingsSection = computed(() => ['platforms', 'capabilities', 'qiniu'].includes(settingsSection.value))
const cloudAuth = useCloudAuthStore()
void cloudAuth.ensureLoaded()
/** 平台 Key / 模型 / 七牛由后台统一下发时，这几个分区只读 */
const managedLocked = computed(() => Boolean(cloudAuth.status?.managedSettings) && isModelSettingsSection.value)

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
  // Messages are localized, so match both English and Chinese wording.
  if (/fail|error|invalid|失败|错误|无效/.test(text)) return 'error'
  return /saved|loaded|opened|started|success|已保存|已加载|已打开|已开始|成功/.test(text) ? 'success' : 'neutral'
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

function summaryToneClass(tone: string) {
  if (tone === 'violet') return 'vg-stat__icon--violet'
  if (tone === 'cyan') return 'vg-stat__icon--blue'
  if (tone === 'slate') return 'vg-stat__icon--gray'
  return ''
}

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

async function refreshModelSettings() {
  modelSettingsBusy.value = true
  try {
    const next = await window.api.clone.getModelCredentials() as Partial<ModelCredentialsView>
    modelCredentials.value = normalizeIncomingCredentials(next)
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
    const confirmed = await window.api.clone.getModelCredentials() as Partial<ModelCredentialsView>
    modelCredentials.value = normalizeIncomingCredentials(confirmed)
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

function selectTheme(theme: AppTheme) {
  appSettings.setTheme(theme)
}

function saveAccessKey() {
  appSettings.saveAccessKey(accessKeyInput.value)
  accessKeyInput.value = appSettings.accessKey
  accessKeyMessage.value = appSettings.accessKey
    ? t('settings.access.savedLocally')
    : t('settings.access.cleared')
}

onMounted(() => {
  void refreshModelSettings()
  window.addEventListener('resize', revealActiveSettingsSection)
  revealActiveSettingsSection()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', revealActiveSettingsSection)
})
</script>

<template>
  <div class="vg-scope vg-page settings" data-testid="settings-page" :class="{ 'is-storage-section': settingsSection === 'storage-management' }">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><SettingsIcon :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ t('settings.hero.title') }}</h1>
        <p>{{ t('settings.hero.subtitle') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button class="vg-btn vg-btn--sm" type="button" :disabled="settingsBusy" @click="checkUpdatesNow">
          <DownloadCloud :size="14" /> {{ t('settings.actions.checkUpdates') }}
        </button>
        <button class="vg-btn vg-btn--sm" type="button" @click="openDataDir">
          <FolderOpen :size="14" /> {{ t('settings.actions.openDataDir') }}
        </button>
        <button class="vg-btn vg-btn--sm" type="button" @click="refreshModelSettings">
          <RefreshCw :size="14" /> {{ t('settings.actions.refresh') }}
        </button>
        <button v-if="isModelSettingsSection" class="vg-btn vg-btn--primary vg-btn--sm" type="button" :disabled="modelSettingsBusy || managedLocked" @click="saveModelSettings">
          <Save :size="14" /> {{ modelSettingsBusy ? t('settings.actions.saving') : t('settings.actions.saveSettings') }}
        </button>
      </div>
    </header>

    <section class="vg-stats">
      <div v-for="item in summaryCards" :key="item.title" class="vg-stat">
        <span class="vg-stat__icon" :class="summaryToneClass(item.tone)"><component :is="item.icon" :size="17" /></span>
        <span class="vg-stat__body">
          <span class="vg-stat__label">{{ item.title }}</span>
          <span class="settings__stat-value" :title="item.value">{{ item.value }}</span>
          <span class="settings__stat-meta" :title="item.meta">{{ item.meta }}</span>
        </span>
      </div>
    </section>

    <div v-if="settingsMessage" class="vg-notice" :class="settingsMessageTone === 'success' ? 'vg-notice--accent' : settingsMessageTone === 'error' ? 'vg-notice--danger' : ''">
      <Info :size="16" /><span>{{ settingsMessage }}</span>
    </div>

    <section class="settings__layout" :class="{ 'has-side-panel': isModelSettingsSection }">
      <aside ref="settingsNavPanel" class="vg-card settings-nav">
        <div v-for="group in sectionGroups" :key="group.key" class="settings-nav__group">
          <div class="settings-nav__label">{{ t(group.labelKey) }}</div>
          <button
            v-for="item in group.items"
            :key="item.key"
            type="button"
            class="vg-list__item vg-list__item--button settings-nav__item"
            :class="{ 'is-active': settingsSection === item.key }"
            :data-settings-section="item.key"
            @click="settingsSection = item.key"
          >
            <span class="settings-nav__icon"><component :is="item.icon" :size="16" /></span>
            <span class="vg-list__main">
              <span class="vg-list__title">{{ t(item.labelKey) }}</span>
              <span class="vg-list__sub">{{ t(item.descKey) }}</span>
            </span>
          </button>
        </div>
      </aside>

      <main class="settings__main" :class="{ 'is-managed-locked': managedLocked }" :inert="managedLocked || undefined">
        <div v-if="managedLocked" class="vg-notice vg-notice--accent settings__managed-notice" data-testid="settings-managed-notice">
          <Info :size="16" /><span>{{ t('cloud.settings.managedNotice') }}</span>
        </div>
        <!-- Appearance -->
        <template v-if="settingsSection === 'appearance'">
          <section class="vg-card">
            <div class="vg-card__head">
              <span class="vg-card__title"><Palette :size="16" /> {{ t('settings.appearance.title') }} <small>{{ t('settings.appearance.subtitle') }}</small></span>
            </div>
            <div class="theme-grid">
              <button
                v-for="theme in themeOptions"
                :key="theme.value"
                type="button"
                class="theme-option"
                :class="[`theme-option--${theme.value}`, { 'is-active': appSettings.theme === theme.value }]"
                @click="selectTheme(theme.value)"
              >
                <span class="theme-option__preview">
                  <i class="theme-option__line"></i>
                  <i class="theme-option__dot"></i>
                  <i class="theme-option__field"></i>
                </span>
                <span class="theme-option__label">
                  {{ t(theme.labelKey) }}
                  <Check v-if="appSettings.theme === theme.value" :size="14" />
                </span>
              </button>
            </div>
          </section>

          
        </template>

        <!-- Platforms -->
        <section v-else-if="settingsSection === 'platforms'" class="vg-stack">
          <div class="vg-card__head settings__section-head">
            <span class="vg-card__title"><Server :size="16" /> {{ t('settings.platforms.title') }} <small>{{ t('settings.platforms.subtitle') }}</small></span>
          </div>
          <div class="vg-grid settings__platforms">
            <article class="vg-card">
              <div class="settings__card-head">
                <span class="settings__card-icon"><KeyRound :size="16" /></span>
                <div>
                  <h3>TikHub</h3>
                  <p>TikTok share-link parsing and download access token.</p>
                </div>
              </div>
              <div class="vg-field">
                <label>API Key</label>
                <div class="vg-row settings__inline">
                  <input v-model="modelCredentials.tikhubApiKey" class="vg-input" :type="modelSecretType('tikhubApiKey')" placeholder="TikHub bearer token" />
                  <button class="vg-btn vg-btn--sm" type="button" @click="toggleModelSecret('tikhubApiKey')">
                    {{ modelVisibleSecrets.tikhubApiKey ? t('settings.common.hide') : t('settings.common.show') }}
                  </button>
                </div>
              </div>
            </article>

            <article v-for="card in platformCards" :key="card.provider" class="vg-card">
              <div class="settings__card-head">
                <span class="settings__card-icon"><component :is="card.icon" :size="16" /></span>
                <div>
                  <h3>{{ card.title }}</h3>
                  <p>{{ card.desc }}</p>
                </div>
              </div>
              <div class="vg-stack settings__fields">
                <div class="vg-field">
                  <label>{{ t('settings.platforms.fields.apiKey') }}</label>
                  <div class="vg-row settings__inline">
                    <input
                      class="vg-input"
                      :value="providerApiKey(card.provider)"
                      :type="modelSecretType(providerMeta[card.provider].keyName)"
                      @input="assignProviderApiKey(card.provider, ($event.target as HTMLInputElement).value)"
                    />
                    <button class="vg-btn vg-btn--sm" type="button" @click="toggleModelSecret(providerMeta[card.provider].keyName)">
                      {{ modelVisibleSecrets[providerMeta[card.provider].keyName] ? t('settings.common.hide') : t('settings.common.show') }}
                    </button>
                  </div>
                </div>
                <div class="vg-field">
                  <label>{{ providerMeta[card.provider].hostLabel }}</label>
                  <input
                    class="vg-input"
                    :value="providerHost(card.provider)"
                    :placeholder="providerMeta[card.provider].hostPlaceholder"
                    @input="assignProviderHost(card.provider, ($event.target as HTMLInputElement).value)"
                  />
                </div>
              </div>
            </article>
          </div>
        </section>

        <!-- Capabilities -->
        <section v-else-if="settingsSection === 'capabilities'" class="vg-stack">
          <div class="vg-card__head settings__section-head">
            <span class="vg-card__title"><Layers :size="16" /> {{ t('settings.capabilities.title') }} <small>{{ t('settings.capabilities.subtitle') }}</small></span>
          </div>

          <article class="vg-card">
            <div class="settings__card-head">
              <span class="settings__card-icon settings__card-icon--violet"><Clapperboard :size="16" /></span>
              <div>
                <h3>{{ t('settings.capabilities.video.title') }}</h3>
                <p>{{ t('settings.capabilities.video.desc') }}</p>
              </div>
            </div>
            <div class="vg-form-grid">
              <div class="vg-field">
                <label>{{ t('settings.capabilities.fields.primaryPlatform') }}</label>
                <select v-model="videoPrimaryPlatformBinding" class="vg-select">
                  <option v-for="option in videoPlatformOptions" :key="`video-${option.id}`" :value="option.id">{{ option.label }}</option>
                </select>
              </div>
              <div class="vg-field">
                <label>{{ t('settings.capabilities.fields.primaryModel') }}</label>
                <input v-model="videoPrimaryModelBinding" class="vg-input" :placeholder="t('settings.capabilities.placeholders.videoPrimaryModel')" />
              </div>
            </div>
          </article>

          <article class="vg-card">
            <div class="settings__card-head">
              <span class="settings__card-icon settings__card-icon--blue"><ImageIcon :size="16" /></span>
              <div>
                <h3>{{ t('settings.capabilities.image.title') }}</h3>
                <p>{{ t('settings.capabilities.image.desc') }}</p>
              </div>
            </div>
            <div class="vg-form-grid vg-form-grid--3">
              <div class="vg-field">
                <label>{{ t('settings.capabilities.fields.primaryPlatform') }}</label>
                <select v-model="imagePrimaryPlatformBinding" class="vg-select">
                  <option v-for="option in imagePlatformOptions" :key="`image-${option.id}`" :value="option.id">{{ option.label }}</option>
                </select>
              </div>
              <div class="vg-field">
                <label>{{ t('settings.capabilities.fields.primaryModel') }}</label>
                <input v-model="imagePrimaryModelBinding" class="vg-input" :placeholder="t('settings.capabilities.placeholders.imagePrimaryModel')" />
              </div>
              <div class="vg-field">
                <label>{{ t('settings.capabilities.fields.imageQuality') }}</label>
                <select v-model="modelCredentials.openaiImageQuality" class="vg-select">
                  <option value="low">{{ t('settings.capabilities.quality.low') }}</option>
                  <option value="medium">{{ t('settings.capabilities.quality.medium') }}</option>
                  <option value="high">{{ t('settings.capabilities.quality.high') }}</option>
                </select>
              </div>
            </div>
          </article>

          <article class="vg-card">
            <div class="settings__card-head">
              <span class="settings__card-icon"><MessagesSquare :size="16" /></span>
              <div>
                <h3>{{ t('settings.capabilities.chat.title') }}</h3>
                <p>{{ t('settings.capabilities.chat.desc') }}</p>
              </div>
            </div>
            <div class="vg-form-grid">
              <div class="vg-field">
                <label>{{ t('settings.capabilities.fields.primaryPlatform') }}</label>
                <select v-model="chatPrimaryPlatformBinding" class="vg-select">
                  <option v-for="option in chatPlatformOptions" :key="`chat-${option.id}`" :value="option.id">{{ option.label }}</option>
                </select>
              </div>
              <div class="vg-field">
                <label>{{ t('settings.capabilities.fields.primaryModel') }}</label>
                <input v-model="chatPrimaryModelBinding" class="vg-input" :placeholder="t('settings.capabilities.placeholders.chatPrimaryModel')" />
              </div>
            </div>
          </article>
        </section>

        <!-- Storage -->
        <StorageManagementPanel v-else-if="settingsSection === 'storage-management'" />

        <BrandMemorySettings v-else-if="settingsSection === 'brand'" />

        <AiAutomationSettings v-else-if="settingsSection === 'automation'" />

        <!-- Qiniu -->
        <section v-else-if="settingsSection === 'qiniu'" class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title"><Cloud :size="16" /> {{ t('settings.qiniu.title') }} <small>{{ t('settings.qiniu.subtitle') }}</small></span>
          </div>
          <div class="vg-form-grid">
            <div class="vg-field">
              <label>{{ t('settings.qiniu.fields.accessKey') }}</label>
              <div class="vg-row settings__inline">
                <input v-model="modelCredentials.qiniuAccessKey" class="vg-input" :type="modelSecretType('qiniuAccessKey')" />
                <button class="vg-btn vg-btn--sm" type="button" @click="toggleModelSecret('qiniuAccessKey')">
                  {{ modelVisibleSecrets.qiniuAccessKey ? t('settings.common.hide') : t('settings.common.show') }}
                </button>
              </div>
            </div>
            <div class="vg-field">
              <label>{{ t('settings.qiniu.fields.secretKey') }}</label>
              <div class="vg-row settings__inline">
                <input v-model="modelCredentials.qiniuSecretKey" class="vg-input" :type="modelSecretType('qiniuSecretKey')" />
                <button class="vg-btn vg-btn--sm" type="button" @click="toggleModelSecret('qiniuSecretKey')">
                  {{ modelVisibleSecrets.qiniuSecretKey ? t('settings.common.hide') : t('settings.common.show') }}
                </button>
              </div>
            </div>
            <div class="vg-field"><label>{{ t('settings.qiniu.fields.bucket') }}</label><input v-model="modelCredentials.qiniuBucket" class="vg-input" /></div>
            <div class="vg-field"><label>{{ t('settings.qiniu.fields.domain') }}</label><input v-model="modelCredentials.qiniuDomain" class="vg-input" /></div>
            <div class="vg-field"><label>{{ t('settings.qiniu.fields.uploadHost') }}</label><input v-model="modelCredentials.qiniuUploadHost" class="vg-input" /></div>
            <div class="vg-field"><label>{{ t('settings.qiniu.fields.prefix') }}</label><input v-model="modelCredentials.qiniuPrefix" class="vg-input" /></div>
          </div>
        </section>
      </main>

      <aside v-if="isModelSettingsSection" class="vg-stack settings__side">
        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title"><ClipboardList :size="16" /> {{ t('settings.summary.title') }}</span></div>
          <dl class="vg-kv settings__summary">
            <dt>{{ t('settings.summary.rows.video') }}</dt>
            <dd>{{ capabilityProviderLabel('video', modelCredentials.videoProviderPrimary, modelCredentials.videoApifoxHubProfile) }} / {{ videoPrimaryModelBinding || t('settings.common.notSet') }}</dd>
            <dt>{{ t('settings.summary.rows.image') }}</dt>
            <dd>{{ capabilityProviderLabel('image', modelCredentials.imageProviderPrimary, modelCredentials.imageApifoxHubProfile) }} / {{ imagePrimaryModelBinding || t('settings.common.notSet') }} / {{ imageQualityLabel }}</dd>
            <dt>{{ t('settings.summary.rows.chat') }}</dt>
            <dd>{{ capabilityProviderLabel('chat', modelCredentials.chatProviderPrimary, modelCredentials.chatApifoxHubProfile) }} / {{ chatPrimaryModelBinding || t('settings.common.notSet') }}</dd>
          </dl>
        </section>
        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title"><Info :size="16" /> {{ t('settings.notes.title') }}</span></div>
          <ul class="settings__notes">
            <li>{{ t('settings.notes.items.credentialsReuse') }}</li>
            <li>{{ t('settings.notes.items.xibapiIndependent') }}</li>
            <li>{{ t('settings.notes.items.reloadAfterSave') }}</li>
            <li>{{ t('settings.notes.items.imageQualityForwarded') }}</li>
          </ul>
        </section>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.settings { width: min(1408px, 100%); margin: 0 auto; }
.settings__stat-value { display: block; font-size: 14px; font-weight: 700; color: var(--theme-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings__stat-meta { display: block; font-size: 11px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings .vg-stat__icon--gray { background: color-mix(in srgb, var(--vg-gray) 14%, transparent); color: var(--vg-gray); }

.settings__layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 14px; align-items: start; }
.settings__layout.has-side-panel { grid-template-columns: 260px minmax(0, 1fr) 300px; }
.settings__main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.settings__side { position: sticky; top: 0; }

/* Section navigation */
.settings-nav { position: sticky; top: 0; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
.settings-nav__group { display: flex; flex-direction: column; gap: 2px; }
.settings-nav__label { padding: 4px 10px; font-size: 11px; font-weight: 600; letter-spacing: .04em; color: var(--theme-text-muted); }
.settings-nav__item { border-top: 0 !important; padding: 9px 10px; }
.settings-nav__item.is-active .vg-list__title { color: var(--vg-accent); }
.settings-nav__icon { width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--theme-panel-soft); color: var(--theme-text-secondary); }
.settings-nav__item.is-active .settings-nav__icon { background: var(--vg-accent); color: var(--theme-on-accent); }

/* Cards */
.settings__section-head { margin-bottom: 0; }
.settings__platforms { --vg-grid-min: 300px; }
.settings__card-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
.settings__card-head h3 { font-size: 14px; font-weight: 700; }
.settings__card-head p { font-size: 12px; color: var(--theme-text-muted); margin-top: 2px; }
.settings__card-icon { width: 34px; height: 34px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--vg-accent-soft); color: var(--vg-accent); }
.settings__card-icon--violet { background: color-mix(in srgb, var(--vg-violet) 14%, transparent); color: var(--vg-violet); }
.settings__card-icon--blue { background: color-mix(in srgb, var(--vg-blue) 14%, transparent); color: var(--vg-blue); }
.settings__fields { gap: 10px; }
.settings__inline { flex-wrap: nowrap; }
.settings__inline .vg-input { flex: 1; }
.settings__hint { font-size: 12px; }
.settings__summary { grid-template-columns: 1fr; gap: 2px 0; }
.settings__summary dd { margin-bottom: 8px; font-size: 12px; }
.settings__notes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: var(--theme-text-secondary); line-height: 1.55; }

/* Theme picker: previews deliberately use each theme's real colours. */
.theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.theme-option { display: flex; flex-direction: column; padding: 0; overflow: hidden; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); color: var(--theme-text); cursor: pointer; text-align: left; transition: border-color .15s, box-shadow .15s; }
.theme-option:hover { border-color: var(--vg-accent-line); }
.theme-option.is-active { border-color: var(--vg-accent); box-shadow: 0 0 0 3px var(--vg-accent-soft); }
.theme-option__preview { position: relative; display: block; width: 100%; height: 92px; background: #090e18; border-bottom: 1px solid var(--theme-border); }
.theme-option__preview i { position: absolute; display: block; }
.theme-option__line { left: 10px; top: 12px; width: 48%; height: 8px; border-radius: 99px; background: #14b8a6; }
.theme-option__dot { left: 10px; bottom: 10px; width: 14px; height: 14px; border-radius: 999px; background: #14b8a6; }
.theme-option__field { left: 30px; right: 10px; bottom: 10px; height: 22px; border-radius: 8px; background: #151827; }
.theme-option--mono .theme-option__preview { background: #ffffff; }
.theme-option--mono .theme-option__line { background: #171717; }
.theme-option--mono .theme-option__dot { background: #171717; }
.theme-option--mono .theme-option__field { background: #f7f7f8; }
.theme-option--light-teal .theme-option__preview { background: #f7f9f8; }
.theme-option--light-teal .theme-option__line { background: #066b4d; }
.theme-option--light-teal .theme-option__dot { background: #087f5b; }
.theme-option--light-teal .theme-option__field { background: #e8f5ef; }
.theme-option__label { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 6px; padding: 10px 12px; font-size: 13px; font-weight: 600; }
.theme-option__label svg { color: var(--vg-accent); }

@media (max-width: 1280px) {
  .settings__layout.has-side-panel { grid-template-columns: 240px minmax(0, 1fr); }
  .settings__side { grid-column: 2; position: static; }
}
@media (max-width: 900px) {
  .settings__layout, .settings__layout.has-side-panel { grid-template-columns: 1fr; }
  .settings-nav, .settings__side { position: static; grid-column: auto; }
}
.settings__main.is-managed-locked > :not(.settings__managed-notice) { opacity: .55; }
.settings__managed-notice { margin-bottom: 12px; }
</style>
