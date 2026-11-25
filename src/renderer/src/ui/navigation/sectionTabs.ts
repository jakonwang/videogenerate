import type { Component } from 'vue'
import { Clapperboard, Film, Layers, LayoutDashboard, CopyPlus, Images, LayoutTemplate, ListVideo, PlaySquare, Scissors, Sparkles, Wand2 } from 'lucide-vue-next'

/**
 * 侧边栏的合并入口：一个入口下的几个页面在页面上方用标签切换（菜单更短，功能都还在、地址不变）。
 * 电脑端（MainLayout）和网页（apps/mobile WebShell）共用这一份。
 *
 * `paths` 同时列出电脑端和网页的地址（网页上有几个页面地址不同），用来判断当前在哪个标签。
 */
export type SectionTab = {
  key: string
  /** 电脑端地址（网页上会跳到对应的网页地址） */
  to: string
  labelKey: string
  /** 网页外壳没有电脑端文案包时用 */
  zh: string
  icon: Component
  match: (path: string) => boolean
  /** 要用电脑上的账号：网页不显示标签（网页在 tk创意室里，电脑有账号时另给入口） */
  desktopOnly?: boolean
}

export type SectionGroup = {
  key: 'aiVideo' | 'production' | 'library'
  /** 侧边栏上这个入口的名字（标签条左侧也显示） */
  labelKey: string
  zh: string
  icon: Component
  tabs: SectionTab[]
}

const exact = (...paths: string[]) => (path: string) => paths.includes(path)
const under = (...prefixes: string[]) => (path: string) => prefixes.some((p) => path === p || path.startsWith(`${p}/`))

export const SECTION_GROUPS: SectionGroup[] = [
  {
    // AI 出片：复刻 / tk创意室 / 图生视频（复刻项目里面有自己的步骤条，不显示这些标签）
    key: 'aiVideo',
    labelKey: 'ai.nav.aiVideo',
    zh: 'AI 出片',
    icon: Clapperboard,
    tabs: [
      { key: 'clone', to: '/clone', labelKey: 'ai.nav.tabs.clone', zh: '爆款复刻', icon: CopyPlus, match: exact('/clone', '/clone/cloud') },
      { key: 'creative', to: '/plugins/tiktok-creative-studio', labelKey: 'ai.nav.tabs.creative', zh: 'tk创意室', icon: Wand2, match: under('/plugins/tiktok-creative-studio', '/creative') },
      { key: 'muse', to: '/plugins/muse-creative-studio', labelKey: 'ai.nav.tabs.muse', zh: 'Muse创意室', icon: Sparkles, match: under('/plugins/muse-creative-studio'), desktopOnly: true },
      { key: 'livePhoto', to: '/plugins/live-photo-generator', labelKey: 'ai.nav.tabs.livePhoto', zh: '图生视频', icon: PlaySquare, match: under('/plugins/live-photo-generator', '/image-to-video') },
    ],
  },
  {
    // 批量混剪：总览 / 混剪工作台 / 素材池 / 模板库 / 任务
    key: 'production',
    labelKey: 'ai.nav.production',
    zh: '批量混剪',
    icon: Scissors,
    tabs: [
      { key: 'overview', to: '/production', labelKey: 'ai.nav.tabs.overview', zh: '总览', icon: LayoutDashboard, match: exact('/production') },
      { key: 'mix', to: '/production/mix', labelKey: 'ai.nav.tabs.mix', zh: '混剪工作台', icon: Film, match: under('/production/mix', '/production/create') },
      { key: 'pool', to: '/production/pool', labelKey: 'ai.nav.tabs.pool', zh: '素材池', icon: Layers, match: under('/production/pool') },
      { key: 'templates', to: '/templates', labelKey: 'ai.nav.tabs.templates', zh: '模板库', icon: LayoutTemplate, match: under('/templates') },
      { key: 'tasks', to: '/production/tasks', labelKey: 'ai.nav.tabs.tasks', zh: '任务', icon: ListVideo, match: under('/production/tasks') },
    ],
  },
  {
    // 素材库：素材 / 模特
    key: 'library',
    labelKey: 'ai.nav.assets',
    zh: '素材库',
    icon: Images,
    tabs: [
      { key: 'assets', to: '/asset-library', labelKey: 'ai.nav.tabs.assets', zh: '素材', icon: Images, match: under('/asset-library', '/assets') },
      { key: 'models', to: '/models', labelKey: 'ai.nav.tabs.models', zh: '模特', icon: Sparkles, match: under('/models') },
    ],
  },
]

export function sectionForPath(path: string): { group: SectionGroup; tab: SectionTab } | null {
  for (const group of SECTION_GROUPS) {
    const tab = group.tabs.find((item) => item.match(path))
    if (tab) return { group, tab }
  }
  return null
}

export const sectionGroup = (key: SectionGroup['key']) => SECTION_GROUPS.find((group) => group.key === key)!

/** 侧边栏点合并入口时，回到上次用的那个标签 */
const LAST_TAB_KEY = 'vg-nav-last-tab'
export function rememberSectionTab(path: string) {
  const hit = sectionForPath(path)
  if (!hit) return
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_TAB_KEY) || '{}') as Record<string, string>
    if (saved[hit.group.key] === hit.tab.key) return
    localStorage.setItem(LAST_TAB_KEY, JSON.stringify({ ...saved, [hit.group.key]: hit.tab.key }))
  } catch {
    // storage unavailable: always open the first tab
  }
}
export function lastSectionTab(key: SectionGroup['key']): SectionTab {
  const group = sectionGroup(key)
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_TAB_KEY) || '{}') as Record<string, string>
    return group.tabs.find((tab) => tab.key === saved[key]) ?? group.tabs[0]!
  } catch {
    return group.tabs[0]!
  }
}

/** 侧边栏入口是否高亮：当前在这个入口下的任一标签（复刻项目里面也算复刻） */
export function sectionActive(key: SectionGroup['key'], path: string) {
  if (key === 'aiVideo' && under('/clone')(path)) return true
  return sectionGroup(key).tabs.some((tab) => tab.match(path))
}
