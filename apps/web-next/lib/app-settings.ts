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
      provider: 'ai666',
      host: '',
      apiKey: '',
      model: 'gpt-image-1',
    },
    chat: {
      provider: 'ai666',
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
    return {
      ...DEFAULT_APP_SETTINGS,
      ...JSON.parse(raw),
    }
  } catch {
    return DEFAULT_APP_SETTINGS
  }
}

export function saveAppSettings(settings: AppSettings) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings))
}
