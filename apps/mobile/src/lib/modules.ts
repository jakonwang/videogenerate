import type { Component } from 'vue'
import {
  BarChart3,
  Boxes,
  Captions,
  Download,
  Copy,
  Droplets,
  Film,
  ImagePlus,
  Inbox,
  LayoutGrid,
  ListChecks,
  Megaphone,
  PackageSearch,
  Replace,
  Rocket,
  Stamp,
  ScanSearch,
  Scissors,
  Send,
  Sparkles,
  Store,
  Users,
  Warehouse,
  Wand2,
} from 'lucide-vue-next'

/**
 * 手机端模块清单（与桌面端一一对应）。phase 表示计划在第几阶段上线；
 * route 有值的模块已经可以用。
 */
export type MobileModule = {
  key: string
  name: string
  description: string
  icon: Component
  group: 'research' | 'create' | 'library' | 'sell'
  phase: 1 | 2 | 3 | 4
  route?: string
}

export const MODULES: MobileModule[] = [
  { key: 'research', name: '选品', description: '在手机上直接搜索抖音商品，按销量采集', icon: ScanSearch, group: 'research', phase: 1, route: '/research' },
  { key: 'products', name: '商品库', description: '商品图片和资料，与电脑端同步', icon: Boxes, group: 'library', phase: 1, route: '/library?tab=products' },
  { key: 'works', name: '作品库', description: '所有生成的图片和视频，存相册、分享、加到商品', icon: LayoutGrid, group: 'library', phase: 2, route: '/works' },
  { key: 'tasks', name: '任务中心', description: '正在跑和失败的任务汇总', icon: ListChecks, group: 'library', phase: 2, route: '/tasks' },
  { key: 'models', name: '模特库', description: '模特形象资料，与电脑端同步', icon: Users, group: 'library', phase: 1, route: '/library?tab=models' },

  { key: 'clone', name: '复刻', description: '对标视频拆解，AI 生成同款', icon: Copy, group: 'create', phase: 2, route: '/clone' },
  { key: 'producer', name: 'AI 制片人', description: '一句话安排整条生产线', icon: Wand2, group: 'create', phase: 2, route: '/producer' },
  { key: 'product-images', name: '商品图素材', description: 'AI 生成商品主图、上身图、特写', icon: ImagePlus, group: 'create', phase: 2, route: '/product-images' },
  { key: 'product-replace', name: '商品替换', description: '把场景图里的商品换成我的商品', icon: Replace, group: 'create', phase: 2, route: '/product-replace' },
  { key: 'product-watermark', name: '商品图水印', description: '透明 PNG 模板批量盖到商品图上', icon: Stamp, group: 'create', phase: 2, route: '/product-watermark' },
  { key: 'live-photo', name: '图生视频', description: '商品图生成视频', icon: Sparkles, group: 'create', phase: 2, route: '/image-to-video' },
  { key: 'review', name: '审核收件箱', description: '审核 AI 生成的素材', icon: Inbox, group: 'create', phase: 2, route: '/review' },
  { key: 'listing', name: '上架助手', description: 'AI 看商品图写标题和描述', icon: Store, group: 'sell', phase: 2, route: '/listings' },

  { key: 'mix', name: '批量混剪', description: '素材池随机组合成片，自动去重', icon: Film, group: 'create', phase: 3, route: '/tools/mix' },
  { key: 'subtitle', name: '批量字幕', description: '自动识别并压制字幕', icon: Captions, group: 'create', phase: 3, route: '/tools/subtitle' },
  { key: 'watermark', name: '批量水印', description: '视频批量加文字 / Logo 水印', icon: Droplets, group: 'create', phase: 3, route: '/tools/watermark' },
  { key: 'live-slicer', name: '直播切片', description: '直播录像按时长切成短视频', icon: Scissors, group: 'create', phase: 3, route: '/tools/slice' },
  { key: 'download', name: '链接下载', description: '粘贴分享链接，下载无水印视频', icon: Download, group: 'create', phase: 3, route: '/tools/download' },

  { key: 'publish', name: '发布中心', description: '直接打开 TikTok / 抖音发布，或存到相册', icon: Send, group: 'sell', phase: 4, route: '/publish' },
  { key: 'insights', name: '数据复盘', description: '生产线产出、通过率和发布复盘', icon: BarChart3, group: 'sell', phase: 4, route: '/business?tab=insights' },
  { key: 'gmv-max', name: 'GMV Max', description: '看投放数据，批准 AI 调整建议（电脑端执行）', icon: Rocket, group: 'sell', phase: 4, route: '/gmv' },
  { key: 'creative-studio', name: 'tk创意室', description: '创意视频任务进度（电脑端生成）', icon: Megaphone, group: 'sell', phase: 4, route: '/business?tab=creative' },
  { key: 'creator-hub', name: '达人中心', description: '达人带货、样品履约待办', icon: PackageSearch, group: 'sell', phase: 4, route: '/business?tab=creators' },
  { key: 'inventory', name: '店小秘库存', description: '缺货和需补货的 SKU 提醒', icon: Warehouse, group: 'sell', phase: 4, route: '/business?tab=inventory' },
]

export const PHASE_LABEL: Record<MobileModule['phase'], string> = {
  1: '第一阶段',
  2: '第二阶段',
  3: '第三阶段',
  4: '第四阶段',
}
