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
  Bell,
  Search,
  Plus,
  ChevronDown,
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
const shellSearch = ref('')
const cloneTopbar = useCloneTopbarStore()
const designInspector = useDesignInspectorStore()
const webSession = useWebSessionStore()
const { visible: cloneTopbarVisible, items: cloneTopbarItems } = storeToRefs(cloneTopbar)
const { enabled: designInspectorEnabled } = storeToRefs(designInspector)
const showDesignInspectorToggle = computed(() => import.meta.env.DEV)
const showCloneWorkflowTopbar = computed(() => route.path.includes('/clone/') && cloneTopbarVisible.value && cloneTopbarItems.value.length > 0)
const topUserName = computed(() => webSession.user?.displayName || 'Creator')
const topUserPlan = computed(() => webSession.subscription?.planName || '桌面版')
const topWalletBalance = computed(() => webSession.wallet?.balanceCredits ?? 0)
const sidebarPlanLabel = computed(() => webSession.subscription?.planName || '桌面授权版')
const sidebarPlanDesc = computed(() =>
  webSession.wallet ? `算力余额 ${topWalletBalance.value}` : '本地工作台模式',
)
const topStatusText = computed(() => (webSession.wallet ? '已连接本地工作台' : '桌面端离线模式'))
const topGpuStatusText = computed(() => (webSession.wallet ? `可用 ${topWalletBalance.value}` : '本地待机'))
const topApiStatusText = computed(() => (webSession.wallet ? '接口已连接' : '接口未连接'))
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

function openLicenseCenter() {
  void router.push('/auth')
}

function openBillingCenter() {
  void router.push('/billing')
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
        :class="[{ 'models-route-shell': route.path.includes('/models') }, 'app-shell__layout']"
      >
        <template #sidebar-footer>
          <div class="app-shell__sidebar-footer">
            <div class="app-shell__sidebar-plan">
              <div class="app-shell__sidebar-plan-copy">
                <strong>升级专业版</strong>
                <span>解锁全部高级功能</span>
              </div>
              <button class="app-shell__sidebar-plan-action" @click="openLicenseCenter">
                立即升级
              </button>
            </div>
          </div>
        </template>

        <template #topbar>
          <div class="app-topbar-shell" :class="{ 'has-clone-workflow': showCloneWorkflowTopbar }">
            <template v-if="showCloneWorkflowTopbar">
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
            </template>
            <template v-else>
              <div class="app-topbar-panel">
                <div class="app-topbar-search-wrap" data-design-id="main-topbar">
                  <div class="app-top-search">
                    <Search class="h-4 w-4" />
                    <input v-model="shellSearch" type="text" placeholder="搜索商品、模板、任务、功能..." />
                    <span class="app-top-search-shortcut">⌘K</span>
                  </div>
                </div>
                <div class="app-topbar-actions">
                  <div class="app-topbar-actions__utility">
                    <button class="app-top-icon" title="通知">
                      <Bell class="h-4 w-4" />
                    </button>
                    <button class="app-top-icon" title="设置" @click="go('/settings')">
                      <Settings class="h-4 w-4" />
                    </button>
                  </div>
                  <button class="app-top-create" @click="go('/clone')">
                    <Plus class="h-4 w-4" />
                    <span>新建项目</span>
                  </button>
                  <button class="app-top-user">
                    <div class="app-top-user__avatar">C</div>
                    <div class="app-top-user__copy">
                      <span>{{ topUserName }}</span>
                    </div>
                    <ChevronDown class="h-4 w-4 text-white/45" />
                  </button>
                </div>
              </div>
            </template>
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
  background:
    radial-gradient(circle at 20% 0, rgba(111, 88, 255, 0.12), transparent 24%),
    linear-gradient(180deg, #070d18 0%, #09111c 100%);
  color: #f8fafc;
}

.app-shell__body {
  height: calc(100vh - 2.5rem);
  min-height: 0;
  overflow: hidden;
  margin-top: -1px;
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
  width: 248px !important;
  min-width: 248px !important;
  padding: 12px 14px !important;
  gap: 14px !important;
  align-items: stretch !important;
  border-right: 1px solid rgba(148, 163, 184, 0.08) !important;
  background:
    linear-gradient(180deg, rgba(8, 12, 22, 0.98), rgba(6, 11, 20, 0.98)) !important;
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.018) !important;
}

.app-shell :deep(.ds-sidebar__brand) {
  display: flex !important;
  justify-content: flex-start !important;
  gap: 12px !important;
  padding: 8px 10px 14px !important;
  border-bottom: 1px solid rgba(148, 163, 184, 0.06) !important;
  min-height: 74px !important;
}

.app-shell :deep(.ds-sidebar__mark) {
  width: 46px !important;
  height: 46px !important;
  border-radius: 16px !important;
  background:
    radial-gradient(circle at 34% 30%, rgba(255, 255, 255, 0.28), transparent 24%),
    linear-gradient(135deg, #6d5dff, #8b5cf6) !important;
  box-shadow: 0 18px 34px rgba(109, 93, 255, 0.26) !important;
}

.app-shell :deep(.ds-sidebar__title) {
  display: block !important;
  max-width: none !important;
  color: #f8fafc !important;
  font-size: 19px !important;
  font-weight: 800 !important;
  line-height: 1.05 !important;
}

.app-shell :deep(.ds-sidebar__subtitle) {
  display: block !important;
  margin-top: 4px !important;
  color: #9aa9c8 !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
}

.app-shell :deep(.ds-sidebar__nav) {
  width: 100% !important;
  gap: 8px !important;
  justify-content: stretch !important;
}

.app-shell :deep(.ds-sidebar__section) {
  display: grid !important;
  gap: 8px !important;
  margin-top: 8px !important;
  padding-top: 12px !important;
  border-top: 1px solid rgba(148, 163, 184, 0.08) !important;
}

.app-shell :deep(.ds-sidebar__section-title) {
  display: block !important;
  padding: 0 8px !important;
  color: rgba(241, 245, 249, 0.94) !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  line-height: 1.2 !important;
}

.app-shell :deep(.ds-sidebar__section-items) {
  display: grid !important;
  gap: 8px !important;
}

.app-shell :deep(.ds-sidebar__item) {
  position: relative !important;
  z-index: 1 !important;
  pointer-events: auto !important;
  display: flex !important;
  width: 100% !important;
  min-height: 46px !important;
  justify-content: flex-start !important;
  gap: 12px !important;
  padding: 0 14px !important;
  border-radius: 14px !important;
  border: 1px solid transparent !important;
  background: transparent !important;
  color: #e1e7f4 !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  transition: all 180ms ease;
}

.app-shell :deep(.ds-sidebar__item--sub) {
  min-height: 40px !important;
  padding: 0 14px !important;
  border-radius: 12px !important;
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
  box-shadow: 0 14px 26px rgba(109, 93, 255, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
}

.app-shell :deep(.ds-sidebar__item svg) {
  width: 18px !important;
  height: 18px !important;
}

.app-shell__sidebar-footer {
  margin-top: auto;
  display: grid;
  gap: 12px;
  padding-top: 8px;
}

.app-shell__sidebar-plan {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 20px;
  border: 1px solid rgba(109, 93, 255, 0.16);
  background:
    radial-gradient(circle at 100% 0, rgba(109, 93, 255, 0.16), transparent 40%),
    linear-gradient(180deg, rgba(14, 22, 40, 0.88), rgba(10, 17, 31, 0.94));
}

.app-shell__sidebar-plan-copy {
  display: grid;
  gap: 6px;
}

.app-shell__sidebar-plan-copy strong {
  color: #f8fafc;
  font-size: 14px;
  font-weight: 700;
}

.app-shell__sidebar-plan-copy span {
  color: rgba(203, 213, 225, 0.72);
  font-size: 12px;
}

.app-shell__sidebar-plan-action {
  min-height: 42px;
  border-radius: 14px;
  border: 1px solid rgba(109, 93, 255, 0.28);
  background: rgba(109, 93, 255, 0.1);
  color: #ddd6fe;
  font-size: 14px;
  font-weight: 700;
}

.app-sidebar-footer-action,
.app-shell :deep(.ds-sidebar select),
.app-shell :deep(.ds-sidebar .ui-select) {
  width: 100%;
}

.app-sidebar-footer-action {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background: rgba(13, 23, 41, 0.28);
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 600;
  box-shadow: none;
}

.app-sidebar-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    radial-gradient(circle at 100% 0, rgba(109, 93, 255, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(17, 28, 49, 0.84), rgba(11, 20, 36, 0.9));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.app-avatar {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: linear-gradient(135deg, #6d5dff, #8b5cf6);
  color: #fff;
  font-size: 16px;
  font-weight: 800;
}

.app-shell :deep(.ds-topbar) {
  min-height: 72px !important;
  height: auto !important;
  padding: 0 16px 0 18px !important;
  border-bottom: 1px solid rgba(148, 163, 184, 0.05) !important;
  background:
    radial-gradient(circle at 50% -80%, rgba(109, 93, 255, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(8, 13, 24, 0.995), rgba(8, 13, 24, 0.985)) !important;
}

.app-topbar-shell {
  display: grid;
  width: 100%;
  gap: 0;
  padding: 3px 0 0;
}

.app-topbar-shell.has-clone-workflow {
  padding: 4px 0 0;
}

.app-shell :deep(.ds-topbar__actions) {
  width: auto;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 10px;
}

.app-topbar-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  width: 100%;
  padding: 0;
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

.app-topbar-search-wrap {
  flex: 1 1 auto;
  min-width: 0;
}

.app-topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.app-topbar-actions__utility {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  background: rgba(10, 17, 30, 0.62);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.app-top-search {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: min(450px, 100%);
  height: 46px;
  padding: 0 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.1);
  background:
    linear-gradient(180deg, rgba(12, 19, 34, 0.94), rgba(9, 15, 27, 0.94));
  color: #cbd5e1;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.02),
    0 10px 24px rgba(0, 0, 0, 0.14);
}

.app-top-search-shortcut {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 24px;
  padding: 0 7px;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.07);
  color: rgba(203, 213, 225, 0.42);
  font-size: 10px;
  font-weight: 700;
}

.app-top-search input {
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #f8fafc;
  box-shadow: none;
}

.app-top-search input::placeholder {
  color: #7b8798;
}

.app-top-icon,
.app-top-user {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  background: rgba(12, 20, 34, 0.74);
  color: #e2e8f0;
  font-size: 13px;
  font-weight: 600;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.02),
    0 8px 20px rgba(0, 0, 0, 0.12);
}

.app-top-icon {
  width: 38px;
  min-width: 38px;
  min-height: 38px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.app-top-user {
  min-width: 172px;
  justify-content: flex-start;
}

.app-top-create {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 46px;
  padding: 0 20px;
  border-radius: 16px;
  background: linear-gradient(135deg, #6f58ff, #7f5dff);
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  box-shadow: 0 14px 28px rgba(96, 69, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.app-topbar-text {
  white-space: nowrap;
}

.app-top-user__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: linear-gradient(135deg, #6d5dff, #8b5cf6);
  color: #fff;
  font-size: 15px;
  font-weight: 800;
}

.app-top-user__copy {
  display: grid;
  gap: 0;
  text-align: left;
}

.app-top-user__copy span {
  color: #f8fafc;
  font-size: 14px;
  font-weight: 700;
}

.app-top-icon:hover,
.app-top-user:hover,
.app-sidebar-footer-action:hover {
  background: rgba(19, 31, 52, 0.82);
  border-color: rgba(148, 163, 184, 0.24);
  color: #fff;
}

.app-top-create:hover {
  filter: brightness(1.04);
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

  .app-top-search {
    width: 100%;
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
  .app-top-user__copy {
    display: none;
  }

  .app-top-user {
    min-width: 52px;
    justify-content: center;
    padding: 0;
  }
}
</style>

