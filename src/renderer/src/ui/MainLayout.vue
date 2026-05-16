<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { House, Boxes, MoreHorizontal, Settings, HelpCircle, Sparkles, Radio, Bell, UserCircle, Users, Search } from 'lucide-vue-next'
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
  { to: '/home', icon: House, label: '主页', active: route.path.includes('/home') },
  {
    to: '/products',
    icon: Boxes,
    label: '生产',
    active: ['/products', '/templates', '/tasks', '/production'].some((path) => route.path.includes(path)),
  },
  { to: '/models', icon: Users, label: '模特', active: route.path.includes('/models') },
  { to: '/clone', icon: Sparkles, label: '复刻', active: route.path.includes('/clone') },
  { to: '/live-slicer', icon: Radio, label: '切片', active: route.path.includes('/live-slicer') },
])

function go(path: string, query?: Record<string, string>) {
  void router.push({ path, query })
}

function openCloudWorkspace() {
  go('/products', { ws: 'cloud' })
}

function quickExport() {
  go('/tasks', { ws: 'media', quickStart: String(Date.now()) })
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
    go('/products', { ws: 'media_library' })
    return
  }
  if (key === 'edit') {
    go('/templates', { ws: 'studio' })
    return
  }
  if (key === 'view') {
    go('/tasks', { ws: 'text_scripts' })
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
        title=""
        subtitle=""
        :class="[{ 'models-route-shell': route.path.includes('/models') }, 'app-shell__layout']"
      >
        <template #sidebar-footer>
          <div class="app-shell__sidebar-footer">
            <div class="app-shell__sidebar-plan">
              <div class="app-shell__sidebar-plan-copy">
                <strong>{{ sidebarPlanLabel }}</strong>
                <span>{{ sidebarPlanDesc }}</span>
              </div>
              <button class="app-shell__sidebar-plan-action" @click="openLicenseCenter">
                升级套餐
              </button>
            </div>
            <button class="app-sidebar-footer-action" @click="go('/settings')">
              <Settings class="h-4 w-4" />
              <span>设置</span>
            </button>
            <UiLocaleSelect />
            <div class="app-sidebar-user">
              <div class="app-avatar">C</div>
              <div class="min-w-0">
                <div class="truncate text-xs font-bold text-white/90">Creator</div>
                <div class="truncate text-[10px] text-white/35">专业版 v2.2.0</div>
              </div>
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
                    <input v-model="shellSearch" type="text" placeholder="搜索模板、任务、素材、功能..." />
                    <span class="app-top-search-shortcut">⌘K</span>
                  </div>
                </div>
                <div class="app-topbar-meta">
                  <div class="app-topbar-chip">
                    <span class="app-topbar-chip-dot is-green"></span>
                    <div>
                      <strong>工作台状态</strong>
                      <small>{{ topStatusText }}</small>
                    </div>
                  </div>
                  <div class="app-topbar-chip">
                    <span class="app-topbar-chip-dot is-violet"></span>
                    <div>
                      <strong>算力余额</strong>
                      <small>{{ topWalletBalance }}</small>
                    </div>
                  </div>
                </div>
                <div class="app-topbar-actions">
                  <button
                    v-if="showDesignInspectorToggle"
                    class="app-top-toggle"
                    :class="{ 'is-active': designInspectorEnabled }"
                    type="button"
                    @click="designInspector.toggleDesignInspector(!designInspectorEnabled)"
                  >
                    设计联调
                  </button>
                  <button class="app-top-icon" :title="t('shell.help')" @click="openHelpModal">
                    <HelpCircle class="h-4 w-4" />
                    <span>帮助</span>
                  </button>
                  <button class="app-top-icon app-top-icon--badge" title="通知">
                    <Bell class="h-4 w-4" />
                    <em>12</em>
                  </button>
                  <button class="app-top-user">
                    <div class="app-top-user__avatar">C</div>
                    <div class="app-top-user__copy">
                      <span>{{ topUserName }}</span>
                      <small>{{ topUserPlan }}</small>
                    </div>
                  </button>
                  <button class="app-top-icon" title="会员与钱包" @click="openBillingCenter">
                    <UserCircle class="h-4 w-4" />
                    <span>钱包</span>
                  </button>
                  <div class="relative">
                    <button
                      class="app-top-more"
                      @click="moreOpen = !moreOpen"
                    >
                      <MoreHorizontal class="h-4 w-4" />
                      更多
                    </button>
                    <div
                      v-if="moreOpen"
                      class="absolute right-0 top-12 z-50 w-44 rounded-xl border border-white/10 bg-[#111827] p-2 shadow-2xl shadow-black/40"
                    >
                      <button class="shell-more-item" @click="onTopMenuClick('project')">{{ t('shell.project') }}</button>
                      <button class="shell-more-item" @click="onTopMenuClick('edit')">{{ t('shell.edit') }}</button>
                      <button class="shell-more-item" @click="onTopMenuClick('view')">{{ t('shell.view') }}</button>
                      <button class="shell-more-item" @click="onTopMenuClick('export')">{{ t('shell.export') }}</button>
                      <button class="shell-more-item" @click="moreOpen = false; openCloudWorkspace()">{{ t('shell.openCloud') }}</button>
                      <button class="shell-more-item" @click="moreOpen = false; quickExport()">{{ t('shell.quickExport') }}</button>
                    </div>
                  </div>
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
          <button class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/[0.06]" @click="helpOpen = false; go('/clone')">
            爆款复刻
          </button>
          <button class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/[0.06]" @click="helpOpen = false; go('/products', { ws: 'media_library' })">
            生产模块
          </button>
          <button class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/[0.06]" @click="helpOpen = false; go('/models')">
            模特库
          </button>
          <button class="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/[0.06]" @click="helpOpen = false; go('/live-slicer')">
            直播切片
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
    radial-gradient(circle at 18% 0, rgba(109, 93, 255, 0.12), transparent 24%),
    linear-gradient(180deg, #08111f 0%, #091321 100%);
  color: #f8fafc;
}

.app-shell__body {
  height: calc(100vh - 2.5rem);
  min-height: 0;
  overflow: hidden;
  margin-top: -1px;
}

.app-shell :deep(.ds-shell) {
  grid-template-columns: 248px minmax(0, 1fr);
  background: transparent;
}

.app-shell :deep(.ds-shell__main) {
  min-width: 0;
  min-height: 0;
  background: transparent;
}

.app-shell :deep(.ds-sidebar) {
  width: 248px;
  min-width: 248px;
  padding: 12px 14px 16px;
  gap: 14px;
  align-items: stretch;
  border-right: 1px solid rgba(148, 163, 184, 0.1);
  background:
    linear-gradient(180deg, rgba(7, 14, 26, 0.98), rgba(6, 12, 22, 0.98));
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.02);
}

.app-shell :deep(.ds-sidebar__brand) {
  justify-content: flex-start;
  gap: 12px;
  padding: 8px 12px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
  min-height: 72px;
}

.app-shell :deep(.ds-sidebar__mark) {
  width: 44px;
  height: 44px;
  border-radius: 16px;
  background:
    radial-gradient(circle at 34% 30%, rgba(255, 255, 255, 0.28), transparent 24%),
    linear-gradient(135deg, #6d5dff, #8b5cf6);
  box-shadow: 0 16px 30px rgba(109, 93, 255, 0.24);
}

.app-shell :deep(.ds-sidebar__title) {
  color: #f8fafc;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.1;
}

.app-shell :deep(.ds-sidebar__subtitle) {
  margin-top: 4px;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.app-shell :deep(.ds-sidebar__nav) {
  gap: 10px;
}

.app-shell :deep(.ds-sidebar__item) {
  min-height: 54px;
  justify-content: flex-start;
  gap: 12px;
  padding: 0 14px;
  border-radius: 16px;
  border: 1px solid transparent;
  background: transparent;
  color: #d2d8e6;
  font-size: 14px;
  font-weight: 600;
  transition: all 180ms ease;
}

.app-shell :deep(.ds-sidebar__item:hover) {
  background: rgba(17, 28, 49, 0.62);
  border-color: rgba(148, 163, 184, 0.14);
  color: #f8fafc;
}

.app-shell :deep(.ds-sidebar__item.is-active) {
  background:
    linear-gradient(135deg, rgba(109, 93, 255, 0.96), rgba(127, 111, 255, 0.92));
  border-color: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(109, 93, 255, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.app-shell :deep(.ds-sidebar__item svg) {
  width: 20px;
  height: 20px;
}

.app-shell__sidebar-footer {
  margin-top: auto;
  display: grid;
  gap: 10px;
}

.app-shell__sidebar-plan {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
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
  font-size: 13px;
  font-weight: 700;
}

.app-shell__sidebar-plan-copy span {
  color: rgba(203, 213, 225, 0.72);
  font-size: 11px;
}

.app-shell__sidebar-plan-action {
  min-height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(109, 93, 255, 0.28);
  background: rgba(109, 93, 255, 0.1);
  color: #ddd6fe;
  font-size: 11px;
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
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background:
    radial-gradient(circle at 100% 0, rgba(109, 93, 255, 0.12), transparent 34%),
    linear-gradient(180deg, rgba(17, 28, 49, 0.84), rgba(11, 20, 36, 0.9));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.app-avatar {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 14px;
  background: linear-gradient(135deg, #8b5cf6, #f0abfc);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}

.app-shell :deep(.ds-topbar) {
  min-height: 64px;
  height: auto;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.06);
  background: linear-gradient(180deg, rgba(10, 17, 30, 0.995), rgba(8, 14, 26, 0.985));
}

.app-topbar-shell {
  display: grid;
  width: 100%;
  gap: 0;
  padding: 6px 0 2px;
}

.app-topbar-shell.has-clone-workflow {
  padding: 4px 0 0;
}

.app-shell :deep(.ds-topbar__actions) {
  width: auto;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 12px;
}

.app-topbar-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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

.app-topbar-meta,
.app-topbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.app-topbar-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 8px;
  border-left: 1px solid rgba(148, 163, 184, 0.12);
}

.app-topbar-chip > div {
  display: grid;
  gap: 2px;
}

.app-topbar-chip strong {
  color: #dbe5f2;
  font-size: 11px;
  font-weight: 700;
}

.app-topbar-chip small {
  color: #9fb0cf;
  font-size: 10px;
  font-weight: 600;
}

.app-topbar-chip-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #22d3ee;
  box-shadow: 0 0 0 4px rgba(34, 211, 238, 0.12);
}

.app-topbar-chip-dot.is-green {
  background: #4ade80;
  box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.12);
}

.app-topbar-chip-dot.is-violet {
  background: #8b5cf6;
  box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.12);
}

.app-top-search {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  width: min(440px, 100%);
  height: 42px;
  padding: 0 14px;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(10, 19, 36, 0.82);
  color: #cbd5e1;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.app-top-search-shortcut {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 20px;
  padding: 0 8px;
  border-radius: 8px;
  background: rgba(148, 163, 184, 0.08);
  color: rgba(203, 213, 225, 0.48);
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
.app-top-user,
.app-top-more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 11px;
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(13, 23, 41, 0.58);
  color: #e2e8f0;
  font-size: 12px;
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
}

.app-top-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid rgba(109, 93, 255, 0.22);
  background: rgba(109, 93, 255, 0.08);
  color: #d8d4fe;
  font-size: 12px;
  font-weight: 700;
  transition: all 180ms ease;
}

.app-top-toggle.is-active {
  background: linear-gradient(135deg, rgba(109, 93, 255, 0.24), rgba(139, 92, 246, 0.2));
  border-color: rgba(109, 93, 255, 0.48);
  color: #ffffff;
  box-shadow: 0 0 0 1px rgba(109, 93, 255, 0.18), 0 10px 24px rgba(109, 93, 255, 0.18);
}

.app-top-icon {
  min-width: 38px;
}

.app-top-user {
  min-width: 132px;
  justify-content: flex-start;
}

.app-top-more {
  min-width: 72px;
}

.app-top-icon--badge {
  position: relative;
}

.app-top-icon--badge em {
  position: absolute;
  right: 8px;
  top: 7px;
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(239, 68, 68, 0.92);
  color: #fff;
  font-size: 10px;
  font-style: normal;
  font-weight: 700;
}

.app-top-user__avatar {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: linear-gradient(135deg, #8b5cf6, #f59e0b);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.app-top-user__copy {
  display: grid;
  gap: 1px;
  text-align: left;
}

.app-top-user__copy span {
  color: #f8fafc;
  font-size: 11px;
  font-weight: 600;
}

.app-top-user__copy small {
  color: #b8a7ff;
  font-size: 9px;
  font-weight: 700;
}

.app-top-icon:hover,
.app-top-user:hover,
.app-top-more:hover,
.app-sidebar-footer-action:hover {
  background: rgba(23, 38, 66, 0.82);
  border-color: rgba(148, 163, 184, 0.24);
  color: #fff;
}

.app-shell :deep(.ds-topbar__spacer) {
  flex: 1 1 auto;
}

.app-shell :deep(.ds-workspace) {
  padding: 4px 10px 10px;
  overflow: auto;
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

  .app-topbar-meta {
    display: none;
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
}
</style>

