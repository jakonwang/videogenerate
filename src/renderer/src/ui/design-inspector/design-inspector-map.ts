export type DesignInspectorNode = {
  designId: string
  label: string
  routeScope: string
  component: string
  file: string
  classes: string[]
  notes?: string
  suggestedEdits?: string[]
  tokens?: string[]
}

export const DESIGN_INSPECTOR_MAP: DesignInspectorNode[] = [
  {
    designId: 'main-topbar',
    label: '顶部工作栏',
    routeScope: '*',
    component: 'MainLayout',
    file: '/D:/phpstudy_pro/WWW/videogenerate/src/renderer/src/ui/MainLayout.vue',
    classes: ['app-shell :deep(.ds-topbar)', 'app-topbar-panel', 'app-top-search'],
    notes: '控制软件最顶部的工作栏高度、搜索框密度、状态 chip 与用户区布局。',
    suggestedEdits: [
      '调整 MainLayout.vue 中 .app-shell :deep(.ds-topbar) 的高度和 padding',
      '调整 .app-topbar-panel 的 gap 和分区比例',
      '调整 .app-top-search、.app-top-icon、.app-top-user 的尺寸',
    ],
    tokens: ['高度', 'padding', '圆角', '字体', '信息密度'],
  },
  {
    designId: 'clone-analyze-topbar',
    label: '爆款分析顶部头部',
    routeScope: '/clone',
    component: 'CloneView',
    file: '/D:/phpstudy_pro/WWW/videogenerate/src/renderer/src/ui/views/CloneView.vue',
    classes: ['clone-analyze-topline', 'clone-analyze-tophead', 'clone-analyze-steprail'],
    notes: '控制分析页标题、面包屑、主按钮和步骤轨道，是首屏视觉基准。',
    suggestedEdits: [
      '优先改 clone-analyze-topline 的内边距、边框和圆角',
      '再改 clone-analyze-titleblock、clone-analyze-hero-metrics 的字重与密度',
      '步骤轨道主要改 clone-analyze-steprail 和 clone-analyze-stepnode',
    ],
    tokens: ['首屏高度', '标题字号', '步骤条密度'],
  },
  {
    designId: 'clone-analyze-left-video',
    label: '左侧参考视频区',
    routeScope: '/clone',
    component: 'CloneView',
    file: '/D:/phpstudy_pro/WWW/videogenerate/src/renderer/src/ui/views/CloneView.vue',
    classes: ['clone-analyze-panel', 'clone-analyze-video-card', 'clone-analyze-video-frame'],
    notes: '控制左侧视频预览卡、视频比例和更换视频按钮位置。',
    suggestedEdits: [
      '主要改 clone-analyze-video-frame 的 aspect-ratio、圆角和边框',
      '次要改 clone-analyze-video-change 的位置和按钮样式',
      '左侧整体比例由 clone-analyze-core 的第一列控制',
    ],
    tokens: ['9:16 比例', '按钮位置', '投影强度'],
  },
  {
    designId: 'clone-analyze-video-info',
    label: '左侧视频信息卡',
    routeScope: '/clone',
    component: 'CloneView',
    file: '/D:/phpstudy_pro/WWW/videogenerate/src/renderer/src/ui/views/CloneView.vue',
    classes: ['clone-analyze-info-card', 'clone-analyze-info-grid', 'clone-analyze-status-chip'],
    notes: '控制视频元信息、识别地区和分析状态标签。',
    suggestedEdits: [
      '改 clone-analyze-info-card 的内边距和信息行间距',
      '改 clone-analyze-status-chip 的状态色和尺寸',
    ],
    tokens: ['信息密度', '状态标签', '文本层级'],
  },
  {
    designId: 'clone-analyze-structure',
    label: '中部内容结构卡',
    routeScope: '/clone',
    component: 'CloneView',
    file: '/D:/phpstudy_pro/WWW/videogenerate/src/renderer/src/ui/views/CloneView.vue',
    classes: ['clone-analyze-result-shell', 'clone-analyze-result-card', 'clone-analyze-beat-row', 'clone-analyze-beat-card'],
    notes: '控制分析结果标签页、结构卡和片段条带，是最需要对齐设计稿的核心区域。',
    suggestedEdits: [
      '先改 clone-analyze-result-tabs 的高度和激活态',
      '再改 clone-analyze-result-card 和 clone-analyze-beat-row 的密度',
      '单个片段样式由 clone-analyze-beat-card 控制',
    ],
    tokens: ['标签页', '卡片比例', '条带层级'],
  },
  {
    designId: 'clone-analyze-script-preview',
    label: '脚本预览卡',
    routeScope: '/clone',
    component: 'CloneView',
    file: '/D:/phpstudy_pro/WWW/videogenerate/src/renderer/src/ui/views/CloneView.vue',
    classes: ['clone-analyze-script-card', 'clone-analyze-script-list', 'clone-analyze-script-line'],
    notes: '控制中下区域脚本识别结果的展示密度。',
    suggestedEdits: [
      '改脚本行高、间距和时间标签宽度',
      '和评分卡的宽度比例由 clone-analyze-bottom-grid 控制',
    ],
    tokens: ['正文行高', '信息分栏', '卡片比例'],
  },
  {
    designId: 'clone-analyze-score',
    label: '爆款潜力评分卡',
    routeScope: '/clone',
    component: 'CloneView',
    file: '/D:/phpstudy_pro/WWW/videogenerate/src/renderer/src/ui/views/CloneView.vue',
    classes: ['clone-analyze-score-card', 'clone-analyze-score-ring'],
    notes: '控制评分环和状态标签的视觉强调。',
    suggestedEdits: [
      '改评分环尺寸和外圈阴影',
      '改卡片尺寸，避免相对脚本预览过大',
    ],
    tokens: ['评分环尺寸', '强调色', '视觉重心'],
  },
  {
    designId: 'clone-analyze-project-info',
    label: '右侧项目信息区',
    routeScope: '/clone',
    component: 'CloneView',
    file: '/D:/phpstudy_pro/WWW/videogenerate/src/renderer/src/ui/views/CloneView.vue',
    classes: ['clone-analyze-side-card', 'clone-analyze-input', 'clone-analyze-mode', 'clone-analyze-linked'],
    notes: '控制右侧项目信息、复刻模式、模特和产品素材卡。',
    suggestedEdits: [
      '改 clone-analyze-side-card 的整体密度',
      '表单观感主要改 clone-analyze-input 和 clone-analyze-tags',
      '模式块和关联素材卡分别改 clone-analyze-mode、clone-analyze-linked',
    ],
    tokens: ['表单密度', '列表节奏', '右栏宽度'],
  },
  {
    designId: 'clone-analyze-queue',
    label: '底部任务队列',
    routeScope: '/clone',
    component: 'CloneView',
    file: '/D:/phpstudy_pro/WWW/videogenerate/src/renderer/src/ui/views/CloneView.vue',
    classes: ['clone-analyze-queue', 'clone-analyze-queue-grid', 'clone-analyze-queue-card'],
    notes: '控制历史任务卡片的数量、比例和视觉层次。',
    suggestedEdits: [
      '队列整体改 clone-analyze-queue',
      '单卡片比例和高度改 clone-analyze-queue-card',
    ],
    tokens: ['卡片高度', '列间距', '历史信息层级'],
  },
  {
    designId: 'clone-analyze-engine',
    label: 'AI 引擎状态区',
    routeScope: '/clone',
    component: 'CloneView',
    file: '/D:/phpstudy_pro/WWW/videogenerate/src/renderer/src/ui/views/CloneView.vue',
    classes: ['clone-analyze-engine-card', 'clone-analyze-engine-row'],
    notes: '控制 provider、model、endpointStyle、requestCapability 等运行态信息。',
    suggestedEdits: [
      '改 clone-analyze-engine-card 的边框和内边距',
      '行高和省略逻辑改 clone-analyze-engine-row',
    ],
    tokens: ['日志密度', '状态对齐', '技术信息展示'],
  },
]

export function getDesignInspectorNode(designId: string | null | undefined, routePath: string) {
  if (!designId) return null
  return (
    DESIGN_INSPECTOR_MAP.find((item) => item.designId === designId && (item.routeScope === '*' || routePath.startsWith(item.routeScope))) ||
    DESIGN_INSPECTOR_MAP.find((item) => item.designId === designId && item.routeScope === '*') ||
    null
  )
}
