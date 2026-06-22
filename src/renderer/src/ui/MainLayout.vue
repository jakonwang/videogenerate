<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  House,
  Sparkles,
  CopyPlus,
  Rocket,
  FolderOpen,
  ScissorsLineDashed,
  Puzzle,
  Settings,
} from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import TitleBar from './components/TitleBar.vue'
import UiLocaleSelect from './components/UiLocaleSelect.vue'
import DsMainLayout from '../design-system/layout/MainLayout.vue'
import { useCloneTopbarStore } from '@/stores/cloneTopbar'
import { useDesignInspectorStore } from '@/stores/designInspector'
import { useWebSessionStore } from '@/stores/webSession'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const helpOpen = ref(false)
const moreOpen = ref(false)
const cloneTopbar = useCloneTopbarStore()
const designInspector = useDesignInspectorStore()
const webSession = useWebSessionStore()
const { visible: cloneTopbarVisible, items: cloneTopbarItems } = storeToRefs(cloneTopbar)
const { enabled: designInspectorEnabled } = storeToRefs(designInspector)
const showDesignInspectorToggle = computed(() => import.meta.env.DEV)
const showCloneWorkflowTopbar = computed(() => route.path.includes('/clone/') && cloneTopbarVisible.value && cloneTopbarItems.value.length > 0)
const topUserName = computed(() => 'Creator')
const topUserPlan = computed(() => 'Desktop')
const topWalletBalance = computed(() => 0)
const sidebarPlanLabel = computed(() => 'Desktop Workspace')
const sidebarPlanDesc = computed(() => 'No login required')
const topStatusText = computed(() => 'Local workspace mode')
const topGpuStatusText = computed(() => 'Standby')
const topApiStatusText = computed(() => 'Disconnected')
const topAccountStatusText = computed(() => `${topUserName.value} / ${topUserPlan.value}`)

const navItems = computed(() => [
  { to: '/home', icon: House, label: '首页', active: route.path.includes('/home') },
  { to: '/models', icon: Sparkles, label: '模特', active: route.path.includes('/models') },
  { to: '/products', icon: FolderOpen, label: '商品', active: route.path.includes('/products') },
  { to: '/clone', icon: CopyPlus, label: '复刻', active: route.path.includes('/clone') },
  {
    to: '/production',
    icon: Rocket,
    label: '生产',
    active: route.path.includes('/production') || route.path.includes('/tasks') || route.path.includes('/templates'),
  },
  { to: '/live-slicer', icon: ScissorsLineDashed, label: '切片', active: route.path.includes('/live-slicer') },
])

const helpItems = [
  { to: '/models', title: '模特', desc: '管理统一复用的模特身份与参考素材。' },
  { to: '/products', title: '商品', desc: '先管理商品列表，再进入详情维护图片和标准源。' },
  { to: '/clone', title: '复刻', desc: '绑定模特和商品，生成脚本、分镜图与分镜视频。' },
  { to: '/production', title: '生产', desc: '进入任务执行中心，发起任务并查看结果。' },
  { to: '/live-slicer', title: '切片', desc: '处理直播长视频切片与二次素材拆分。' },
]

const sidebarSections = computed(() => [
  {
    title: '插件',
    items: [
      { to: '/plugins', icon: Puzzle, label: '插件市场', active: route.path.includes('/plugins') && !route.query.tab },
      { to: '/plugins?tab=installed', icon: Puzzle, label: '我的插件', active: route.path.includes('/plugins') && route.query.tab === 'installed' },
    ],
  },
])

function go(path: string, query?: Record<string, string>) {
  void router.push({ path, query })
}

function openCloudWorkspace() {
  go('/production')
}

function quickExport() {
  go('/production/tasks', { ws: 'media', quickStart: String(Date.now()) })
}

function openHelpModal() {
  helpOpen.value = true
}

function onTopMenuClick(key: string) {
  moreOpen.value = false
  if (key === 'project') {
    go('/products')
    return
  }
  if (key === 'edit') {
    go('/production')
    return
  }
  if (key === 'view') {
    go('/production')
    return
  }
  if (key === 'export') quickExport()
}

function requestCloneStage(key: string) {
  cloneTopbar.requestStage(key)
}
</script>

<template>
  <div class="ui-app app-shell h-screen w-screen overflow-hidden">
    <TitleBar />
    <div class="app-shell__body">
      <DsMainLayout
        :nav-items="navItems"
        :sections="sidebarSections"
        title=""
        subtitle=""
        :topbar-enabled="showCloneWorkflowTopbar"
        :class="[{ 'models-route-shell': route.path.includes('/models') }, 'app-shell__layout']"
      >
        <template #sidebar-footer>
          <div class="app-shell__sidebar-footer">
            <div class="app-sidebar-locale">
              <UiLocaleSelect />
            </div>
            <button class="app-sidebar-footer-action" type="button" @click="go('/settings')">
              <Settings class="h-4 w-4" />
              <span>设置</span>
            </button>
            <button class="app-sidebar-user" type="button">
              <div class="app-avatar">{{ topUserName.slice(0, 1).toUpperCase() }}</div>
              <div class="min-w-0">
                <div class="app-sidebar-user__name">{{ topUserName }}</div>
                <div class="app-sidebar-user__meta">{{ topUserPlan }}</div>
              </div>
            </button>
          </div>
        </template>

        <template v-if="showCloneWorkflowTopbar" #topbar>
          <div class="app-topbar-shell has-clone-workflow">
            <div class="app-topbar-clone">
              <div class="app-topbar-clone__nav">
                <template v-for="(item, index) in cloneTopbarItems" :key="item.key">
                  <button
                    class="app-topbar-clone__step"
                    :class="{ 'is-done': item.done, 'is-active': item.active }"
                    type="button"
                    @click="requestCloneStage(item.key)"
                  >
                    <span class="app-topbar-clone__index">{{ item.done ? '✓' : index + 1 }}</span>
                    <span class="app-topbar-clone__label">{{ item.title }}</span>
                  </button>
                  <span v-if="index < cloneTopbarItems.length - 1" class="app-topbar-clone__arrow"></span>
                </template>
              </div>
              <div class="app-topbar-clone__spacer"></div>
              <div class="app-topbar-clone__status">
                <span class="app-topbar-clone__metric">
                  <strong>GPU</strong>
                  <small>{{ topGpuStatusText }}</small>
                </span>
                <span class="app-topbar-clone__metric">
                  <strong>API</strong>
                  <small>{{ topApiStatusText }}</small>
                </span>
                <span class="app-topbar-clone__metric app-topbar-clone__metric--account">
                  <strong>账号状态</strong>
                  <small>{{ topAccountStatusText }}</small>
                </span>
              </div>
            </div>
          </div>
        </template>

        <RouterView />
      </DsMainLayout>
    </div>

    <div v-if="helpOpen" class="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" @click.self="helpOpen = false">
      <div class="w-full max-w-md rounded-xl border border-white/10 bg-[#18181B] p-4 shadow-2xl shadow-black/50" @click.stop>
        <div class="text-sm font-semibold text-white/90">{{ t('shell.helpTitle') }}</div>
        <div class="mt-1 text-[11px] leading-relaxed text-white/50">{{ t('shell.helpDesc') }}</div>
        <div class="mt-4 grid gap-2">
          <button
            v-for="item in helpItems"
            :key="item.to"
            class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]"
            @click="helpOpen = false; go(item.to)"
          >
            <strong class="block text-sm text-white/88">{{ item.title }}</strong>
            <span class="mt-1 block text-[11px] leading-relaxed text-white/50">{{ item.desc }}</span>
          </button>
        </div>
        <div class="mt-4 flex justify-end">
          <button class="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/75 transition hover:bg-white/[0.06]" @click="helpOpen = false">
            {{ t('common.cancel') }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at 20% 0, rgba(111, 88, 255, 0.12), transparent 24%),
    linear-gradient(180deg, #070d18 0%, #09111c 100%);
  color: #f8fafc;
}

.app-shell__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.app-shell :deep(.ds-shell) {
  grid-template-columns: 248px minmax(0, 1fr) !important;
  background: transparent;
}

.app-shell :deep(.ds-shell__main) {
  min-width: 0 !important;
  min-height: 0 !important;
  background: transparent;
}

.app-shell :deep(.ds-sidebar) {
  position: relative !important;
  z-index: 30 !important;
  pointer-events: auto !important;
  height: 100% !important;
  width: 248px !important;
  min-width: 248px !important;
  min-height: 0 !important;
  padding: 10px 12px !important;
  gap: 10px !important;
  align-items: stretch !important;
  overflow: hidden !important;
  border-right: 1px solid rgba(148, 163, 184, 0.08) !important;
  background:
    linear-gradient(180deg, rgba(8, 12, 22, 0.98), rgba(6, 11, 20, 0.98)) !important;
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.018) !important;
}

.app-shell :deep(.ds-sidebar__nav) {
  flex: 1 1 0 !important;
  min-height: 0 !important;
  width: 100% !important;
  gap: 6px !important;
  justify-content: stretch !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding-bottom: 6px !important;
}

.app-shell :deep(.ds-sidebar__section) {
  display: grid !important;
  gap: 6px !important;
  margin-top: 6px !important;
  padding-top: 8px !important;
  border-top: 1px solid rgba(148, 163, 184, 0.08) !important;
}

.app-shell :deep(.ds-sidebar__section-title) {
  display: block !important;
  padding: 0 6px !important;
  color: rgba(241, 245, 249, 0.94) !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
}

.app-shell :deep(.ds-sidebar__section-items) {
  display: grid !important;
  gap: 6px !important;
}

.app-shell :deep(.ds-sidebar__item) {
  position: relative !important;
  z-index: 1 !important;
  pointer-events: auto !important;
  display: flex !important;
  width: 100% !important;
  min-height: 40px !important;
  justify-content: flex-start !important;
  gap: 10px !important;
  padding: 0 12px !important;
  border-radius: 12px !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  color: #e1e7f4 !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  transition: all 180ms ease;
}

.app-shell :deep(.ds-sidebar__item--sub) {
  min-height: 36px !important;
  padding: 0 12px !important;
  border-radius: 10px !important;
  background: rgba(255, 255, 255, 0.02) !important;
}

.app-shell :deep(.ds-sidebar__item span) {
  display: inline !important;
  overflow: visible !important;
  white-space: nowrap !important;
}

.app-shell :deep(.ds-sidebar__item:hover) {
  background: rgba(17, 28, 49, 0.42) !important;
  border-color: rgba(148, 163, 184, 0.1) !important;
  color: #f8fafc !important;
}

.app-shell :deep(.ds-sidebar__item.is-active) {
  background:
    linear-gradient(135deg, rgba(108, 85, 255, 0.96), rgba(92, 70, 238, 0.92)) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: #ffffff !important;
  box-shadow: 0 10px 20px rgba(109, 93, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
}

.app-shell :deep(.ds-sidebar__item svg) {
  width: 16px !important;
  height: 16px !important;
}

.app-shell__sidebar-footer {
  margin-top: auto;
  flex: 0 0 auto;
  display: grid;
  gap: 8px;
  padding-top: 8px;
  padding-bottom: 2px;
  border-top: 1px solid rgba(148, 163, 184, 0.08);
}

.app-sidebar-footer-action,
.app-shell :deep(.ds-sidebar select),
.app-shell :deep(.ds-sidebar .ui-select) {
  width: 100%;
}

.app-sidebar-locale {
  width: 100%;
}

.app-sidebar-footer-action {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(13, 23, 41, 0.28);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 600;
  box-shadow: none;
}

.app-sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(13, 23, 41, 0.28);
  box-shadow: none;
  text-align: left;
}

.app-avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: linear-gradient(135deg, #6d5dff, #8b5cf6);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.app-sidebar-user__name {
  color: #f8fafc;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.15;
}

.app-sidebar-user__meta {
  margin-top: 2px;
  color: rgba(203, 213, 225, 0.62);
  font-size: 10px;
  line-height: 1.1;
}

.app-shell :deep(.ds-topbar) {
  min-height: 0 !important;
  height: auto !important;
  padding: 0 !important;
  border-bottom: 0 !important;
  background: transparent !important;
}

.app-topbar-shell {
  display: grid;
  width: 100%;
  gap: 0;
  padding: 0;
}

.app-topbar-shell.has-clone-workflow {
  padding: 4px 0 0;
}

.app-topbar-clone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  min-height: 56px;
  padding: 8px 12px;
  border: 1px solid rgba(90, 107, 146, 0.2);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(11, 18, 31, 0.98), rgba(7, 13, 24, 0.98)),
    radial-gradient(circle at top left, rgba(109, 93, 255, 0.1), transparent 34%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 14px 28px rgba(0, 0, 0, 0.22);
}

.app-topbar-clone__nav {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 0 1 auto;
}

.app-topbar-clone__step {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 38px;
  padding: 0 6px 0 0;
  text-align: left;
  color: rgba(208, 219, 241, 0.72);
  border: 0;
  background: transparent;
  transition: color 160ms ease;
}

.app-topbar-clone__step:hover {
  color: #f8fbff;
}

.app-topbar-clone__step.is-active {
  color: #ffffff;
}

.app-topbar-clone__arrow {
  position: relative;
  width: 18px;
  height: 1px;
  background: linear-gradient(90deg, rgba(89, 182, 255, 0.14), rgba(111, 88, 255, 0.58));
  flex: 0 0 auto;
}

.app-topbar-clone__arrow::after {
  content: '';
  position: absolute;
  right: 0;
  top: 50%;
  width: 6px;
  height: 6px;
  border-top: 1px solid rgba(111, 88, 255, 0.72);
  border-right: 1px solid rgba(111, 88, 255, 0.72);
  transform: translateY(-50%) rotate(45deg);
}

.app-topbar-clone__index {
  position: relative;
  z-index: 1;
  width: 26px;
  height: 26px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 17, 31, 0.72);
  color: rgba(147, 162, 193, 0.92);
  border: 1px solid rgba(77, 98, 135, 0.38);
  font-size: 11px;
  font-weight: 700;
  flex: 0 0 auto;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.app-topbar-clone__label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  line-height: 1.3;
  font-weight: 700;
  white-space: nowrap;
}

.app-topbar-clone__step.is-done .app-topbar-clone__index,
.app-topbar-clone__step.is-active .app-topbar-clone__index {
  color: #ffffff;
  border-color: rgba(109, 93, 255, 0.42);
  background: linear-gradient(135deg, rgba(111, 88, 255, 0.2), rgba(89, 182, 255, 0.14));
}

.app-topbar-clone__step.is-active .app-topbar-clone__index {
  background: linear-gradient(135deg, rgba(111, 88, 255, 0.96), rgba(89, 182, 255, 0.88));
  box-shadow: 0 0 0 3px rgba(111, 88, 255, 0.08), 0 0 18px rgba(111, 88, 255, 0.26);
}

.app-topbar-clone__step.is-done .app-topbar-clone__label {
  color: #eef3ff;
}

.app-topbar-clone__spacer {
  flex: 1 1 auto;
  min-width: 40px;
}

.app-topbar-clone__status {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0;
  flex: 0 0 auto;
  border-left: 1px solid rgba(82, 106, 136, 0.18);
}

.app-topbar-clone__metric {
  display: grid;
  gap: 2px;
  min-width: 0;
  min-height: 40px;
  padding: 0 16px;
  align-content: center;
  border-left: 1px solid rgba(255, 255, 255, 0.04);
}

.app-topbar-clone__metric:first-child {
  border-left: 0;
}

.app-topbar-clone__metric strong {
  color: #dbe5f2;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.app-topbar-clone__metric small {
  color: #a9b7d3;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.app-topbar-clone__metric--account {
  min-width: 168px;
}

.app-sidebar-user:hover,
.app-sidebar-footer-action:hover {
  background: rgba(19, 31, 52, 0.82);
  border-color: rgba(148, 163, 184, 0.24);
  color: #fff;
}

.app-shell :deep(.ds-topbar__spacer) {
  flex: 1 1 auto;
}

.app-shell :deep(.ds-workspace) {
  padding: 10px 14px 12px;
  overflow-x: hidden;
  overflow-y: auto;
  background: transparent;
}

@media (max-width: 1180px) {
  .app-shell :deep(.ds-shell) {
    grid-template-columns: 92px minmax(0, 1fr);
  }

  .app-shell :deep(.ds-sidebar) {
    width: 92px;
    min-width: 92px;
    align-items: center;
    padding: 16px 10px;
  }

  .app-shell :deep(.ds-sidebar__brand-copy),
  .app-shell :deep(.ds-sidebar__item span),
  .app-shell__sidebar-status,
  .app-sidebar-footer-action span,
  .app-sidebar-user .min-w-0 {
    display: none;
  }

  .app-shell :deep(.ds-sidebar__item),
  .app-sidebar-footer-action {
    width: 56px;
    min-width: 56px;
    justify-content: center;
    padding: 0;
  }

  .app-topbar-clone {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 10px;
  }

  .app-topbar-clone__nav,
  .app-topbar-clone__status {
    flex-wrap: wrap;
  }

  .app-topbar-clone__spacer {
    display: none;
  }

  .app-topbar-clone__status {
    justify-content: flex-start;
    border-left: 0;
  }

  .app-top-create span,
  .app-sidebar-user {
    width: 56px;
    min-width: 56px;
    justify-content: center;
    padding: 0;
  }
}
</style>
