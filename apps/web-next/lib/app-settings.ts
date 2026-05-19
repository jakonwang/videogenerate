'use client'

export type AppSettings = {
  apiBaseUrl: string
  locale: string
  autoRefresh: boolean
  defaultVariantCount: string
  defaultOutputDir: string
  modelConfig: ModelConfig
}

export type ModelSection = {
  provider: string
  host: string
  apiKey: string
  model: string
}

export type CloudStorageConfig = {
  provider: string
  bucket: string
  domain: string
  accessKey: string
  secretKey: string
  uploadHost: string
  prefix: string
}

export type ModelConfig = {
  video: ModelSection
  image: ModelSection
  chat: ModelSection
  cloud: CloudStorageConfig
}

export const APP_SETTINGS_KEY = 'web-next-settings'

function normalizeProviderLabel(value: unknown) {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'ai666') return 'ai666'
  if (raw === 'vectorengine' || raw === 'apifox_hub') return 'VectorEngine'
  return String(value || '').trim()
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  apiBaseUrl: '',
  locale: 'zh-CN',
  autoRefresh: true,
  defaultVariantCount: '3',
  defaultOutputDir: '',
  modelConfig: {
    video: {
      provider: 'AtlasCloud',
      host: '',
      apiKey: '',
      model: 'google/veo3.1-lite/image-to-video',
    },
    image: {
      provider: 'VectorEngine',
      host: '',
      apiKey: '',
      model: 'gpt-image-1',
    },
    chat: {
      provider: 'VectorEngine',
      host: '',
      apiKey: '',
      model: 'gpt-4.1-mini',
    },
    cloud: {
      provider: 'Qiniu',
      bucket: '',
      domain: '',
      accessKey: '',
      secretKey: '',
      uploadHost: '',
      prefix: '',
    },
  },
}

export function readAppSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_APP_SETTINGS
  const raw = window.localStorage.getItem(APP_SETTINGS_KEY)
  if (!raw) return DEFAULT_APP_SETTINGS
  try {
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
      modelConfig: {
        ...DEFAULT_APP_SETTINGS.modelConfig,
        ...parsed.modelConfig,
        video: {
          ...DEFAULT_APP_SETTINGS.modelConfig.video,
          ...parsed.modelConfig?.video,
          provider: normalizeProviderLabel(parsed.modelConfig?.video?.provider) || DEFAULT_APP_SETTINGS.modelConfig.video.provider,
        },
        image: {
          ...DEFAULT_APP_SETTINGS.modelConfig.image,
          ...parsed.modelConfig?.image,
          provider: normalizeProviderLabel(parsed.modelConfig?.image?.provider) || DEFAULT_APP_SETTINGS.modelConfig.image.provider,
        },
        chat: {
          ...DEFAULT_APP_SETTINGS.modelConfig.chat,
          ...parsed.modelConfig?.chat,
          provider: normalizeProviderLabel(parsed.modelConfig?.chat?.provider) || DEFAULT_APP_SETTINGS.modelConfig.chat.provider,
        },
        cloud: {
          ...DEFAULT_APP_SETTINGS.modelConfig.cloud,
          ...parsed.modelConfig?.cloud,
        },
      },
    }
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

export function saveAppSettings(settings: AppSettings) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings))
}
