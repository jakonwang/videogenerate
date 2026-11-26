/**
 * 设置 → AI 平台 / 模型能力 / 七牛云 的数据和逻辑（电脑端设置页与网页版设置共用）。
 * 读写走 window.api.clone.get/setModelCredentials：电脑端是 IPC，网页版经「电脑代办」实时转交给电脑。
 */
import { computed, ref, type Ref } from 'vue'
import { Clapperboard, Image as ImageIcon, MessagesSquare, Server } from 'lucide-vue-next'
import {
  type CapabilityStoredProviderKey,
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
export type PlatformKey = 'grsai' | 'ai666' | 'xibapi' | 'gaorui'
type CapabilityPlatformKey = 'grsai' | 'ai666' | 'xibapi' | 'gaorui'
type ChatPlatformKey = 'grsai' | 'ai666' | 'xibapi' | 'gaorui'
type ApifoxProfileKey = PlatformProfile
type ApifoxImageProfileKey = ImagePlatformProfile
export type SecretKey =
  | 'klingApiKey'
  | 'grsaiApiKey'
  | 'tikhubApiKey'
  | 'ai666ApiKey'
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
    imageModel: String(input?.imageModel || 'gpt-image-2').trim() === 'gpt-image-1' ? 'gpt-image-2' : String(input?.imageModel || 'gpt-image-2'),
    imageEditModel: String(input?.imageEditModel ?? '').trim() === 'gpt-image-1' ? 'gpt-image-2' : String(input?.imageEditModel ?? ''),
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
    apifoxHubProfile: 'ai666',
    videoApifoxHubProfile: 'ai666',
    imageApifoxHubProfile: 'ai666',
    chatApifoxHubProfile: 'ai666',
    klingImageModel: '',
    grsaiImageModel: '',
    grsaiAnalysisModel: '',
    ai666Hub: createHubDefaults(),
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


export function useModelSettings(options: { t: (key: string, values?: Record<string, unknown>) => string; message: Ref<string> }) {
  const { t } = options
  const settingsMessage = options.message
  const modelSettingsBusy = ref(false)
  const modelVisibleSecrets = ref<Record<SecretKey, boolean>>({
    klingApiKey: false,
    grsaiApiKey: false,
    tikhubApiKey: false,
    ai666ApiKey: false,
    xibapiApiKey: false,
    gaoruiApiKey: false,
    replicateApiToken: false,
    qiniuAccessKey: false,
    qiniuSecretKey: false,
  })
  const modelCredentials = ref<ModelCredentialsView>(createDefaultCredentials())

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
    xibapi: {
      label: '小扳手',
      hostLabel: 'Base URL',
      hostPlaceholder: 'https://5208.ai',
      keyName: 'xibapiApiKey',
    },
    gaorui: {
      label: '高瑞',
      hostLabel: 'Base URL',
      hostPlaceholder: 'https://gaorui.cc',
      keyName: 'gaoruiApiKey',
    },
  }

  function capabilityProviderLabel(
    capability: CapabilityKey,
    provider: ProviderKey | 'grsai',
    profile?: ApifoxProfileKey,
  ) {
    return resolveCapabilityProviderLabel(provider as CapabilityStoredProviderKey, profile, capability)
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
    return resolveCapabilityPlatform(provider as CapabilityStoredProviderKey, profile, capability) as CapabilityPlatformKey
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
          ? normalizeIncomingPlatformProfile('image', platform)
          : normalizeIncomingPlatformProfile('chat', platform)
    const stored = mapPlatformToStoredProvider(normalizedPlatform)
    ;(modelCredentials.value[target] as ProviderKey | 'grsai') = stored.provider as ProviderKey | 'grsai'
    if (stored.profile) {
      if (stored.profile === 'ai666') modelCredentials.value.ai666Hub.enabled = true
      if (stored.profile === 'xibapi') modelCredentials.value.xibapiHub.enabled = true
      if (stored.profile === 'gaorui') modelCredentials.value.gaoruiHub.enabled = true
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
    return modelCredentials.value.ai666Hub
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
      provider: 'xibapi' as PlatformKey,
      title: '小扳手',
      desc: t('settings.platforms.cards.xibapi.desc'),
      icon: Server,
    },
    {
      provider: 'gaorui' as PlatformKey,
      title: '高瑞',
      desc: '视频（Veo、Kling、Seedance 等）',
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
    return ''
  }

  function providerHost(provider: PlatformKey) {
    if (provider === 'grsai') return modelCredentials.value.grsaiHost
    if (provider === 'ai666') return modelCredentials.value.ai666Hub.baseUrl
    if (provider === 'xibapi') return modelCredentials.value.xibapiHub.baseUrl
    if (provider === 'gaorui') return modelCredentials.value.gaoruiHub.baseUrl
    return ''
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
    }
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
    }
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
      delete payload.vectorEngineHub
      payload.videoProviderFallback = payload.videoProviderPrimary
      payload.videoModelFallback = payload.videoModelPrimary
      payload.apifoxHubProfile =
        payload.videoApifoxHubProfile === 'ai666'
          ? 'ai666'
          : payload.videoApifoxHubProfile === 'xibapi'
            ? 'xibapi'
            : payload.videoApifoxHubProfile === 'gaorui'
              ? 'gaorui'
              : 'ai666'
      payload.apifoxHub =
        payload.apifoxHubProfile === 'ai666'
          ? { ...payload.ai666Hub }
          : payload.apifoxHubProfile === 'xibapi'
            ? { ...payload.xibapiHub, videoProvider: 'xibapi' }
            : payload.apifoxHubProfile === 'gaorui'
              ? { ...payload.gaoruiHub, videoProvider: 'gaorui' }
              : { ...payload.ai666Hub }
      if (payload.videoApifoxHubProfile === 'ai666') payload.ai666Hub.enabled = true
      if (payload.videoApifoxHubProfile === 'xibapi') payload.xibapiHub.enabled = true
      if (payload.videoApifoxHubProfile === 'gaorui') payload.gaoruiHub.enabled = true
      if (payload.imageApifoxHubProfile === 'ai666') payload.ai666Hub.enabled = true
      if (payload.chatApifoxHubProfile === 'ai666') payload.ai666Hub.enabled = true
      await window.api.clone.setModelCredentials(payload as Parameters<typeof window.api.clone.setModelCredentials>[0])
      const confirmed = await window.api.clone.getModelCredentials() as Partial<ModelCredentialsView>
      modelCredentials.value = normalizeIncomingCredentials(confirmed)
      settingsMessage.value = t('settings.messages.savedAndReloaded')
    } catch (e: any) {
      settingsMessage.value = `${t('settings.messages.saveFailed')}: ${e?.message ?? String(e)}`
    } finally {
      modelSettingsBusy.value = false
    }
  }


  return {
    modelSettingsBusy,
    modelVisibleSecrets,
    modelCredentials,
    providerMeta,
    capabilityProviderLabel,
    videoPrimaryPlatformBinding,
    imagePrimaryPlatformBinding,
    chatPrimaryPlatformBinding,
    videoPlatformOptions,
    imagePlatformOptions,
    chatPlatformOptions,
    videoPrimaryModelBinding,
    imagePrimaryModelBinding,
    chatPrimaryModelBinding,
    imageQualityLabel,
    summaryToneClass,
    summaryCards,
    platformCards,
    toggleModelSecret,
    modelSecretType,
    providerApiKey,
    providerHost,
    assignProviderApiKey,
    assignProviderHost,
    refreshModelSettings,
    saveModelSettings,
  }
}

export type ModelSettings = ReturnType<typeof useModelSettings>
