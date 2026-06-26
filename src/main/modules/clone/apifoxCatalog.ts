import type { ApifoxEndpointStyle, UnifiedCapability } from './types'

export type ApifoxCatalogItem = {
  provider: string
  capability: UnifiedCapability
  endpointStyle: ApifoxEndpointStyle
}

export const APIFOX_CHAT_CATALOG: ApifoxCatalogItem[] = [
  { provider: 'openai', capability: 'chat_completion', endpointStyle: 'openai_chat' },
  { provider: 'anthropic', capability: 'chat_completion', endpointStyle: 'anthropic_native' },
  { provider: 'gemini', capability: 'chat_completion', endpointStyle: 'gemini_native' },
]

export const APIFOX_IMAGE_CATALOG: ApifoxCatalogItem[] = [
  { provider: 'openai', capability: 'image_generate', endpointStyle: 'openai_images' },
  { provider: 'openai', capability: 'image_edit', endpointStyle: 'openai_images' },
  { provider: 'gemini', capability: 'image_generate', endpointStyle: 'official_rest' },
  { provider: 'jimeng', capability: 'image_generate', endpointStyle: 'official_rest' },
  { provider: 'midjourney', capability: 'image_generate', endpointStyle: 'midjourney_task' },
]

export const APIFOX_VIDEO_CATALOG: ApifoxCatalogItem[] = [
  { provider: 'openai_video', capability: 'video_text_to_video', endpointStyle: 'openai_video' },
  { provider: 'openai_video', capability: 'video_image_to_video', endpointStyle: 'openai_video' },
  { provider: 'sora', capability: 'video_text_to_video', endpointStyle: 'official_rest' },
  { provider: 'veo', capability: 'video_text_to_video', endpointStyle: 'official_rest' },
  { provider: 'veo', capability: 'video_image_to_video', endpointStyle: 'official_rest' },
  { provider: 'grok', capability: 'video_text_to_video', endpointStyle: 'official_rest' },
  { provider: 'jimeng', capability: 'video_image_to_video', endpointStyle: 'official_rest' },
  { provider: 'vidu', capability: 'video_image_to_video', endpointStyle: 'official_rest' },
  { provider: 'kling', capability: 'video_start_end_to_video', endpointStyle: 'official_rest' },
  { provider: 'seedance2', capability: 'video_reference_to_video', endpointStyle: 'official_rest' },
  { provider: 'xibapi', capability: 'video_text_to_video', endpointStyle: 'official_rest' },
  { provider: 'xibapi', capability: 'video_image_to_video', endpointStyle: 'official_rest' },
  { provider: 'gaorui', capability: 'video_text_to_video', endpointStyle: 'official_rest' },
  { provider: 'gaorui', capability: 'video_image_to_video', endpointStyle: 'official_rest' },
  { provider: 'gaorui', capability: 'video_reference_to_video', endpointStyle: 'official_rest' },
]
