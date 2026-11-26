<script setup lang="ts">
/**
 * Desktop-style shell for the web version: the desktop app's own sidebar layout (design-system
 * MainLayout + Sidebar) under a matching title bar. Pages render inside its scrolling workspace.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Clapperboard, FolderOpen, House, PanelLeftClose, PanelLeftOpen, Scissors, Settings, Wrench, Zap } from 'lucide-vue-next'
import type { Component } from 'vue'
import { lastSectionTab, sectionActive } from '@desktop-src/ui/navigation/sectionTabs'
import DsMainLayout from '@design/layout/MainLayout.vue'
import WebTitleBar from './WebTitleBar.vue'
import { MODULES, type MobileModule } from '@/lib/modules'
import { provideWebShell } from '@/lib/layout'
import { session } from '@/lib/session'
import { isWeb } from '@/lib/platform'

const route = useRoute()
const router = useRouter()
provideWebShell(ref(true))

const COLLAPSE_KEY = 'tiktokcut:web-sidebar-collapsed'
const collapsed = ref(false)
try {
  collapsed.value = localStorage.getItem(COLLAPSE_KEY) === '1'
} catch {
  // storage unavailable (private mode): start expanded
}
function toggleCollapsed() {
  collapsed.value = !collapsed.value
  try {
    localStorage.setItem(COLLAPSE_KEY, collapsed.value ? '1' : '0')
  } catch {
    // ignore
  }
}


function isActive(to: string) {
  const [path, query] = to.split('?')
  if (path === '/') return route.path === '/'
  if (route.path !== path && !route.path.startsWith(`${path}/`)) return false
  if (!query) return !(path === '/business' && route.query.tab)
  const [key, value] = query.split('=')
  return String(route.query[key] || '') === value
}

// Same structure as the desktop sidebar (src/renderer/src/ui/MainLayout.vue): 创作 / 资产 / 工具箱.
const navItems = computed(() => [
  { to: '/', label: '工作总览', icon: House, active: isActive('/') },
])

// Same structure as the desktop sidebar, in business order: 找商品 / 做内容 / 卖出去, every label four characters.
// 复刻 / tk创意室 / 图生视频 are one entry (智能出片), 模特库 sits under 素材管理 and 模板库 under 批量混剪 —
// the pages switch with tabs on top (SectionTabs).
const SECTIONS: Array<{ title: string; keys: string[] }> = [
  { title: '找商品', keys: ['research', 'products'] },
  { title: '做内容', keys: ['launch', 'assets', 'garment-studio', 'ai-video', 'production', 'works'] },
  { title: '卖出去', keys: ['publish', 'shops', 'insights'] },
]
/** Sidebar-only labels (the phone grid keeps the module names in lib/modules.ts). */
const NAV_LABELS: Record<string, string> = {
  research: '数据选品',
  products: '商品管理',
  'garment-studio': '智能修图',
  works: '作品管理',
  shops: '店铺管理',
  insights: '数据复盘',
}
/** 合并入口：侧边栏一项，进入后在页面上方切换 */
const MERGED: Record<string, { name: string; icon: Component; group: 'aiVideo' | 'library' | 'production' }> = {
  'ai-video': { name: '智能出片', icon: Clapperboard, group: 'aiVideo' },
  assets: { name: '素材管理', icon: FolderOpen, group: 'library' },
  production: { name: '批量混剪', icon: Scissors, group: 'production' },
}
/** 一键上新：只在网页（电脑端同一个页面，跑在服务器引擎上），手机 App 的模块宫格里没有 */
const LAUNCH_MODULE = { key: 'launch', name: '一键上新', icon: Zap, route: '/launch', group: 'create', phase: 1, description: '' } as MobileModule
const TOOL_ROUTES = ['/toolbox', '/tools/', '/product-images', '/product-replace', '/product-watermark', '/listings', '/gmv', '/creators', '/inventory', '/sales', '/business?tab=creators', '/business?tab=inventory']
const byKey = new Map(MODULES.map((item) => [item.key, item]))
const sections = computed(() =>
  SECTIONS.map((section) => ({
    title: section.title,
    items: section.keys
      .map((key) => {
        if (key === 'launch') return isWeb ? LAUNCH_MODULE : undefined
        const merged = MERGED[key]
        if (!merged) return byKey.get(key)
        // Route of the tab used last (desktop paths redirect to the web pages).
        const target = merged.group === 'production' ? '/production' : lastSectionTab(merged.group).to
        return { key, name: merged.name, icon: merged.icon, route: target, group: 'create', phase: 1, description: '' } as MobileModule
      })
      .filter((item): item is MobileModule & { route: string } => Boolean(item?.route))
      .map((item) => {
        const merged = MERGED[item.key]
        if (merged) return { to: item.route, label: item.name, icon: item.icon, active: sectionActive(merged.group, route.path) }
        // Web 选品 = the desktop's 选品方案 (schemes + SOP); the phone capture page stays in the App.
        const to = isWeb && item.key === 'research' ? '/product-research' : item.route
        return { to, label: NAV_LABELS[item.key] || item.name, icon: item.icon, active: isActive(to) }
      }),
  }))
    .filter((section) => section.items.length)
    .concat([{ title: '', items: [{ to: '/toolbox', label: '更多工具', icon: Wrench, active: TOOL_ROUTES.some((to) => (to.includes('?') ? isActive(to) : route.path.startsWith(to))) }] }]),
)

const userName = computed(() => session.user?.displayName || session.user?.account || '我的账号')
const planText = computed(() => {
  const e = session.entitlement
  if (!e?.active) return '未开通会员'
  if (e.unlimited) return '不受限账号'
  const name = e.planName || '会员'
  if (!e.expiresAt) return name
  const days = Math.max(0, Math.ceil((e.expiresAt - Date.now()) / 86_400_000))
  return days > 3650 ? `${name} · 永久` : `${name} · 剩 ${days} 天`
})

// The workspace (not the window) scrolls inside the shell.
onMounted(() => document.body.classList.add('is-web-shell'))
onBeforeUnmount(() => document.body.classList.remove('is-web-shell'))
</script>

<template>
  <div class="web-shell" data-testid="web-shell">
    <WebTitleBar />
    <div class="web-shell__body">
      <DsMainLayout :nav-items="navItems" :sections="sections" :collapsed="collapsed">
        <template #sidebar-footer>
          <button type="button" class="shell-foot__btn" :class="{ 'is-active': route.path === '/me' || route.path === '/password' }" :title="collapsed ? '设置' : undefined" @click="router.push('/me')">
            <span class="shell-foot__tile"><Settings class="shell-foot__icon" /></span>
            <span class="shell-foot__label">设置</span>
          </button>
          <div class="shell-foot__user" :class="{ 'is-active': route.path.startsWith('/membership') }" role="button" tabindex="0" :title="collapsed ? `${userName} · ${planText}` : '账号与会员'" @click="router.push('/membership')" @keydown.enter="router.push('/membership')">
            <span class="vg-avatar shell-foot__avatar">{{ userName.slice(0, 1).toUpperCase() }}</span>
            <span class="shell-foot__user-copy">
              <strong>{{ userName }}</strong>
              <small>{{ planText }}</small>
            </span>
            <button type="button" class="vg-icon-btn vg-icon-btn--sm shell-foot__collapse" :title="collapsed ? '展开侧栏' : '收起侧栏'" :aria-expanded="!collapsed" @click.stop="toggleCollapsed">
              <component :is="collapsed ? PanelLeftOpen : PanelLeftClose" class="shell-foot__icon" />
            </button>
          </div>
        </template>
        <div class="vg-scope web-workspace">
          <slot />
        </div>
      </DsMainLayout>
    </div>
  </div>
</template>

<style scoped>
.web-shell { display: flex; flex-direction: column; height: 100vh; background: var(--theme-shell); }
.web-shell__body { flex: 1; min-height: 0; }
.web-workspace { min-height: 100%; }
/* AI 修图自己分栏滚动，占满工作区 */
.web-workspace:has(> .garment) { height: 100%; padding: 0; }

/* Sidebar footer — same metrics as the desktop shell (src/renderer/src/ui/MainLayout.vue). */
.shell-foot__btn { display: flex; align-items: center; gap: 12px; width: 100%; height: 39px; padding: 0 9px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: color-mix(in srgb, var(--theme-text) 92%, transparent); font-size: 14.5px; text-align: left; cursor: pointer; transition: background .14s; }
.shell-foot__btn:hover { background: color-mix(in srgb, var(--theme-text) 5%, transparent); }
.shell-foot__btn.is-active { border-color: color-mix(in srgb, var(--theme-accent) 20%, transparent); background: linear-gradient(90deg, color-mix(in srgb, var(--theme-accent) 24%, transparent), color-mix(in srgb, var(--theme-accent) 7%, transparent)); color: var(--theme-text); font-weight: 600; }
.shell-foot__tile { display: grid; place-items: center; width: 28px; height: 28px; flex-shrink: 0; border: 1px solid color-mix(in srgb, var(--theme-text) 5%, transparent); border-radius: 7px; background: color-mix(in srgb, var(--theme-text) 7%, transparent); color: color-mix(in srgb, var(--theme-text) 88%, transparent); }
.shell-foot__tile .shell-foot__icon { width: 15px; height: 15px; stroke-width: 1.9; }
.shell-foot__btn.is-active .shell-foot__tile { border-color: transparent; background: linear-gradient(145deg, color-mix(in srgb, var(--theme-accent) 94%, #fff), color-mix(in srgb, var(--theme-accent) 78%, #003d31)); color: #fff; box-shadow: 0 0 12px color-mix(in srgb, var(--theme-accent) 40%, transparent); }
.shell-foot__icon { width: 15px; height: 15px; flex-shrink: 0; stroke-width: 1.8; }
.shell-foot__user { display: flex; align-items: center; gap: 9px; min-width: 0; margin-top: 8px; padding: 8px 6px 8px 9px; border: 1px solid var(--theme-border); border-radius: 10px; background: linear-gradient(160deg, color-mix(in srgb, var(--theme-text) 8%, transparent), color-mix(in srgb, var(--theme-text) 3%, transparent)); cursor: pointer; }
.shell-foot__user:hover { border-color: var(--theme-border-control); }
.shell-foot__avatar { width: 30px; height: 30px; flex-shrink: 0; border-radius: 8px; background: linear-gradient(145deg, var(--theme-accent), color-mix(in srgb, var(--theme-accent) 70%, #003d31)); color: #fff; font-size: 12px; font-weight: 700; }
.shell-foot__user-copy { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.shell-foot__user-copy strong { font-size: 12.5px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shell-foot__user-copy small { font-size: 11px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shell-foot__collapse { color: var(--theme-text-secondary); }
/* The design-system sidebar also collapses itself below 1180px (desktop app behaviour). */
@media (max-width: 1180px) {
  .shell-foot__btn { justify-content: center; padding: 0; }
  .shell-foot__label, .shell-foot__user-copy, .shell-foot__collapse { display: none; }
  .shell-foot__user { justify-content: center; padding: 6px; }
}
.web-shell :deep(.vg-shell.is-collapsed) .shell-foot__btn { justify-content: center; padding: 0; }
.web-shell :deep(.vg-shell.is-collapsed) .shell-foot__label,
.web-shell :deep(.vg-shell.is-collapsed) .shell-foot__user-copy { display: none; }
.web-shell :deep(.vg-shell.is-collapsed) .shell-foot__user { flex-direction: column; gap: 6px; padding: 6px 0; border-color: transparent; background: transparent; }
</style>
