import type { PluginDefinition, PluginDetail, PluginRecord, PluginSummary } from './types'

export const pluginDefinitions: PluginDefinition[] = [
  {
    id: 'tiktok-gmv-max-optimizer',
    name: 'TikTok GMV MAX Optimizer',
    category: 'advertising_optimization',
    description: 'Synchronize GMV MAX campaigns and produce guarded budget and target ROI recommendations through TikTok for Business MCP.',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/tiktok-gmv-max-optimizer',
    usageHint: 'Connect with TikTok OAuth, review complete-day evidence, and approve low-risk changes from the dedicated workspace.',
    configSchema: [],
  },
  {
    id: 'product-image-materials',
    name: 'Product Image Materials',
    category: 'video_processing',
    description: 'Batch split uploaded videos into commercial material frames, upload them to Qiniu, and feed Hermes product-to-image selection flows.',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/product-image-materials',
    usageHint: 'Choose a fixed jewelry category, upload source videos, and maintain a reusable image-material library for Hermes Live Photo selection.',
    configSchema: [
      {
        key: 'segmentTimeSec',
        label: 'Segment Time (sec)',
        type: 'number',
        placeholder: '3',
        description: 'Default segment duration for frame extraction.',
      },
      {
        key: 'hermesCandidateLimit',
        label: 'Hermes Candidate Limit',
        type: 'number',
        placeholder: '8',
        description: 'Maximum number of candidate images returned to Hermes per product selection.',
      },
    ],
  },
  {
    id: 'live-photo-generator',
    name: 'Live Photo Generator',
    category: 'video_processing',
    description: 'Create Apple-compatible Live Photo outputs from product reference images or clone shot assets, with preview and export inside a dedicated plugin workspace.',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/live-photo-generator',
    usageHint: 'Use a reference image to keep pose and scene while swapping only the product, or package clone storyboard assets as Live Photo exports.',
    configSchema: [],
  },
  {
    id: 'tiktok-creative-studio',
    name: 'TikTok 创意视频助手',
    category: 'video_processing',
    description: '从复刻任务只读导入商品图和提示词，独立发起 TikTok Creative Studio 图生视频任务，不写回复刻主流程。',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/tiktok-creative-studio',
    usageHint: '适合把当前 clone 任务的商品图和提示词发送到 TikTok Creative Studio，生成和下载视频结果，同时与复刻主流程完全隔离。',
    configSchema: [],
  },
  {
    id: 'tiktok-listing-helper',
    name: 'TikTok 商品上架助手',
    category: 'ecommerce_listing',
    description: '上传商品实拍图后生成 TikTok 上架图片、标题、描述，并批量导出 Excel 模板。',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/tiktok-listing-helper',
    usageHint: '适合独立处理 TikTok 商品图生成与店小秘导入模板导出，不影响 /clone 主流程。',
    configSchema: [
      {
        key: 'defaultLanguage',
        label: '默认标题语言',
        type: 'select',
        options: [
          { label: '简体中文', value: 'zh-CN' },
          { label: 'English', value: 'en-US' },
          { label: 'Tiếng Việt', value: 'vi-VN' },
        ],
      },
    ],
  },
  {
    id: 'video-parser-download',
    name: '视频解析下载',
    category: 'video_download',
    description: '用于短视频链接解析与下载的入口插件。',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/video-parser-download',
    usageHint: '当前仅完成安装、启用、停用与配置闭环，暂不开放真实下载执行。',
    configSchema: [
      {
        key: 'defaultPlatform',
        label: '默认解析平台',
        type: 'select',
        options: [
          { label: '抖音 / TikTok', value: 'tiktok' },
          { label: '快手', value: 'kuaishou' },
          { label: '小红书', value: 'xiaohongshu' },
        ],
        description: '用于后续真实执行时的默认来源平台。',
      },
      {
        key: 'saveSubdir',
        label: '默认保存目录',
        type: 'text',
        placeholder: 'downloads/video-parser',
        description: '相对输出目录，保持 Windows 与 Linux 路径兼容。',
      },
    ],
  },
  {
    id: 'video-batch-watermark',
    name: '视频批量加水印',
    category: 'video_processing',
    description: '用于批量处理视频水印参数与模板的入口插件。',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/video-batch-watermark',
    usageHint: '当前仅保留状态与配置，不执行真实水印合成。',
    configSchema: [
      {
        key: 'watermarkText',
        label: '默认水印文案',
        type: 'text',
        placeholder: 'VideoGenerate',
      },
      {
        key: 'position',
        label: '默认位置',
        type: 'select',
        options: [
          { label: '左上', value: 'top_left' },
          { label: '右上', value: 'top_right' },
          { label: '左下', value: 'bottom_left' },
          { label: '右下', value: 'bottom_right' },
        ],
      },
      {
        key: 'opacity',
        label: '透明度',
        type: 'number',
        placeholder: '0.65',
      },
    ],
  },
  {
    id: 'video-batch-subtitle',
    name: '视频批量加字幕',
    category: 'video_processing',
    description: '用于批量字幕的 AI 识别、剪映草稿导出与回退渲染配置。',
    version: '0.2.0',
    entryType: 'tool',
    workspacePath: '/plugins/video-batch-subtitle',
    usageHint: '默认走 Whisper 兼容 ASR + capcut-mate，ASS 导出保留为回退链路。',
    configSchema: [
      {
        key: 'subtitleSource',
        label: '默认字幕来源',
        type: 'select',
        options: [
          { label: 'Whisper 兼容 ASR', value: 'whisper_compatible' },
          { label: '手工录入', value: 'manual' },
        ],
      },
      {
        key: 'exportEngine',
        label: '默认导出引擎',
        type: 'select',
        options: [
          { label: 'capcut-mate', value: 'capcut_mate' },
          { label: 'ASS 回退', value: 'ass_fallback' },
        ],
      },
      {
        key: 'whisperBaseUrl',
        label: 'Whisper Base URL',
        type: 'text',
        placeholder: 'http://127.0.0.1:8000/v1',
        description: '兼容 `/audio/transcriptions` 的 Whisper 服务地址。',
      },
      {
        key: 'whisperApiKey',
        label: 'Whisper API Key',
        type: 'text',
        placeholder: 'optional',
      },
      {
        key: 'whisperModel',
        label: 'Whisper Model',
        type: 'text',
        placeholder: 'whisper-1',
      },
      {
        key: 'capcutMateBaseUrl',
        label: 'capcut-mate Base URL',
        type: 'text',
        placeholder: 'http://127.0.0.1:30000',
        description: 'capcut-mate 本地服务地址。',
      },
      {
        key: 'capcutDraftRoot',
        label: 'capcut 草稿目录',
        type: 'text',
        placeholder: 'optional draft root',
      },
      {
        key: 'capcutExportMode',
        label: 'capcut 导出模式',
        type: 'select',
        options: [
          { label: '草稿+成片', value: 'draft_and_video' },
          { label: '仅草稿', value: 'draft_only' },
        ],
      },
      {
        key: 'requestTimeoutMs',
        label: '请求超时(ms)',
        type: 'number',
        placeholder: '120000',
      },
      {
        key: 'subtitleStyle',
        label: '字幕样式别名',
        type: 'text',
        placeholder: 'social-commerce-bold',
      },
      {
        key: 'burnIn',
        label: '保留 ASS 回退',
        type: 'boolean',
        description: '开启后，在 capcut-mate 失败时允许自动回退到 ASS 导出链路。',
      },
    ],
  },
  {
    id: 'geelark-publisher',
    name: 'Geelark 发布插件',
    category: 'video_processing',
    description: '用于把复刻成片发布到 Geelark 云手机，并创建 TikTok 发布任务。',
    version: '0.1.0',
    entryType: 'tool',
    workspacePath: '/plugins/geelark-publisher',
    usageHint: '首期支持 Geelark 云手机 TikTok 视频发布与商品挂车入口闭环。',
    configSchema: [
      {
        key: 'baseUrl',
        label: 'Geelark Base URL',
        type: 'text',
        placeholder: 'https://openapi.geelark.com',
      },
      {
        key: 'appId',
        label: 'App ID',
        type: 'text',
        placeholder: 'your-geelark-app-id',
      },
      {
        key: 'requestTimeoutMs',
        label: '请求超时(ms)',
        type: 'number',
        placeholder: '30000',
      },
    ],
  },
]

export function findPluginDefinition(pluginId: string) {
  return pluginDefinitions.find((item) => item.id === pluginId) ?? null
}

export function defaultPluginRecord(userId: string, pluginId: string): PluginRecord {
  return {
    pluginId,
    userId,
    status: 'uninstalled',
    runtimeState: 'disabled',
    config: {},
    updatedAt: Date.now(),
  }
}

export function buildPluginSummary(definition: PluginDefinition, record: PluginRecord): PluginSummary {
  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    description: definition.description,
    version: definition.version,
    entryType: definition.entryType,
    workspacePath: definition.workspacePath,
    status: record.status,
    enabled: record.status === 'installed' && record.runtimeState === 'enabled',
  }
}

export function buildPluginDetail(definition: PluginDefinition, record: PluginRecord): PluginDetail {
  return {
    ...buildPluginSummary(definition, record),
    runtimeState: record.runtimeState,
    usageHint: definition.usageHint,
    configSchema: definition.configSchema,
    config: record.config || {},
  }
}
