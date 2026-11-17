import type { Component } from 'vue'
import {
  BarChart3,
  Boxes,
  Captions,
  Copy,
  Droplets,
  Film,
  ImagePlus,
  Inbox,
  Megaphone,
  PackageSearch,
  Rocket,
  ScanSearch,
  Scissors,
  Send,
  Sparkles,
  Store,
  Users,
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
  { key: 'models', name: '模特库', description: '模特形象资料，与电脑端同步', icon: Users, group: 'library', phase: 1, route: '/library?tab=models' },

  { key: 'clone', name: '复刻', description: '对标视频拆解，AI 生成同款', icon: Copy, group: 'create', phase: 2 },
  { key: 'producer', name: 'AI 制片人', description: '一句话安排整条生产线', icon: Wand2, group: 'create', phase: 2 },
  { key: 'product-images', name: '商品图素材', description: 'AI 生成商品主图、场景图', icon: ImagePlus, group: 'create', phase: 2 },
  { key: 'live-photo', name: '图生视频', description: '商品图生成视频', icon: Sparkles, group: 'create', phase: 2 },
  { key: 'review', name: '审核收件箱', description: '审核 AI 生成的素材', icon: Inbox, group: 'create', phase: 2 },
  { key: 'listing', name: '上架助手', description: 'AI 看商品图写标题和描述', icon: Store, group: 'sell', phase: 2, route: '/listings' },

  { key: 'mix', name: '批量混剪', description: '素材池随机组合成片', icon: Film, group: 'create', phase: 3 },
  { key: 'subtitle', name: '批量字幕', description: '自动识别并压制字幕', icon: Captions, group: 'create', phase: 3 },
  { key: 'watermark', name: '批量水印', description: '视频批量加水印', icon: Droplets, group: 'create', phase: 3 },
  { key: 'live-slicer', name: '直播切片', description: '直播录像自动切成短视频', icon: Scissors, group: 'create', phase: 3 },

  { key: 'publish', name: '发布中心', description: '一键发到 TikTok', icon: Send, group: 'sell', phase: 4 },
  { key: 'insights', name: '数据复盘', description: '视频和商品数据分析', icon: BarChart3, group: 'sell', phase: 4 },
  { key: 'gmv-max', name: 'GMV Max', description: '广告投放优化', icon: Rocket, group: 'sell', phase: 4 },
  { key: 'creative-studio', name: 'tk创意室', description: '官方创意工具', icon: Megaphone, group: 'sell', phase: 4 },
  { key: 'creator-hub', name: '达人中心', description: '达人建联与履约', icon: PackageSearch, group: 'sell', phase: 4 },
]

export const PHASE_LABEL: Record<MobileModule['phase'], string> = {
  1: '第一阶段',
  2: '第二阶段',
  3: '第三阶段',
  4: '第四阶段',
}
