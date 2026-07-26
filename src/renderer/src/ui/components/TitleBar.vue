<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { CheckCircle2, FolderOpen, ListChecks, Minus, RefreshCcw, Square, X } from 'lucide-vue-next'
import brandIconAsset from '../../../../../resources/icon-brand-ui-v2.png'

const { t } = useI18n()
const router = useRouter()
const maximized = ref(false)
const refreshing = ref(false)
const refreshedAt = ref('')

async function sync() {
  const res = await window.api.window.isMaximized()
  maximized.value = Boolean(res?.maximized)
}

function updateRefreshTime() {
  refreshedAt.value = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date())
}

onMounted(() => {
  void sync()
  updateRefreshTime()
})

async function refreshStatus() {
  if (refreshing.value) return
  refreshing.value = true
  await new Promise((resolve) => window.setTimeout(resolve, 320))
  updateRefreshTime()
  refreshing.value = false
}

function openTasks() {
  void router.push('/production/tasks')
}

async function openDataDirectory() {
  const paths = (await window.api.getPaths()) as { dataDir?: string }
  if (paths.dataDir) await window.api.shell.openPath(paths.dataDir)
}

async function minimize() {
  await window.api.window.minimize()
}

async function toggleMax() {
  const res = await window.api.window.maximizeToggle()
  if (typeof res?.maximized === 'boolean') maximized.value = res.maximized
  else await sync()
}

async function close() {
  await window.api.window.close()
}
</script>

<template>
  <header class="app-titlebar">
    <div class="app-titlebar__brand" style="-webkit-app-region: drag">
      <img :src="brandIconAsset" alt="CreateCut" class="app-titlebar__logo" />
      <div class="app-titlebar__brand-copy">
        <div class="app-titlebar__brand-line">
          <strong>CreateCut</strong>
          <span class="app-titlebar__ready-dot"></span>
          <span>{{ t('titleBar.ready') }}</span>
        </div>
        <small>AI Editing Suite</small>
      </div>
    </div>

    <div class="app-titlebar__actions" style="-webkit-app-region: no-drag">
      <button class="app-titlebar__action" type="button" :disabled="refreshing" @click="refreshStatus">
        <RefreshCcw :class="['app-titlebar__action-icon', { 'is-spinning': refreshing }]" />
        <span class="app-titlebar__action-copy">
          <strong>{{ t('titleBar.refreshStatus') }}</strong>
          <small>{{ t('titleBar.lastRefresh') }}: {{ refreshedAt }}</small>
        </span>
      </button>
      <div class="app-titlebar__status">
        <CheckCircle2 class="app-titlebar__status-icon" />
        <span>{{ t('titleBar.localWorkspace') }}</span>
      </div>
      <button class="app-titlebar__action app-titlebar__action--compact" type="button" @click="openTasks">
        <ListChecks class="app-titlebar__action-icon" />
        <span>{{ t('titleBar.taskCenter') }}</span>
      </button>
      <button class="app-titlebar__action app-titlebar__action--compact" type="button" @click="openDataDirectory">
        <FolderOpen class="app-titlebar__action-icon" />
        <span>{{ t('titleBar.openDataDirectory') }}</span>
      </button>
    </div>

    <div class="app-titlebar__window-controls" style="-webkit-app-region: no-drag">
      <button type="button" @click="minimize" :title="t('titleBar.minimize')"><Minus /></button>
      <button type="button" @click="toggleMax" :title="t('titleBar.maximize')"><Square /></button>
      <button class="app-titlebar__close" type="button" @click="close" :title="t('titleBar.close')"><X /></button>
    </div>
  </header>
</template>

<style scoped>
.app-titlebar {
  position: relative;
  z-index: 100;
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr) 132px;
  align-items: stretch;
  min-height: 62px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  background: linear-gradient(180deg, #070c16 0%, #080e19 100%);
  color: #f8fafc;
}

.app-titlebar__brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 20px;
}

.app-titlebar__logo {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 12px;
}

.app-titlebar__brand-copy { min-width: 0; }

.app-titlebar__brand-line {
  display: flex;
  align-items: center;
  gap: 7px;
  line-height: 1.1;
  white-space: nowrap;
}

.app-titlebar__brand-line strong { font-size: 15px; font-weight: 800; letter-spacing: 0.01em; }
.app-titlebar__brand-line span:last-child { color: rgba(203, 213, 225, 0.7); font-size: 10px; }

.app-titlebar__ready-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #20cbb7;
  box-shadow: 0 0 10px rgba(32, 203, 183, 0.5);
}

.app-titlebar__brand-copy small {
  display: block;
  margin-top: 4px;
  color: rgba(148, 163, 184, 0.72);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.app-titlebar__actions {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 8px;
  overflow: hidden;
}

.app-titlebar__action,
.app-titlebar__status {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  border: 1px solid rgba(148, 163, 184, 0.08);
  border-radius: 10px;
  background: rgba(18, 25, 40, 0.82);
  color: rgba(226, 232, 240, 0.8);
  font-size: 11px;
  font-weight: 700;
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.app-titlebar__action:hover {
  border-color: rgba(139, 92, 246, 0.24);
  background: rgba(27, 35, 54, 0.96);
  color: #ffffff;
}

.app-titlebar__action:disabled { cursor: default; opacity: 0.7; }
.app-titlebar__action-icon,
.app-titlebar__status-icon { width: 14px; height: 14px; flex: 0 0 auto; }
.app-titlebar__action-copy { display: grid; gap: 1px; text-align: left; }
.app-titlebar__action-copy strong { font-size: 11px; line-height: 1.1; }

.app-titlebar__action-copy small {
  color: rgba(148, 163, 184, 0.62);
  font-size: 8px;
  font-weight: 500;
  line-height: 1.1;
  white-space: nowrap;
}

.app-titlebar__status-icon { color: #20cbb7; }
.app-titlebar__action--compact { white-space: nowrap; }

.app-titlebar__window-controls {
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
}

.app-titlebar__window-controls button {
  display: grid;
  width: 44px;
  place-items: center;
  border: 0;
  background: transparent;
  color: rgba(226, 232, 240, 0.66);
  transition: background 150ms ease, color 150ms ease;
}

.app-titlebar__window-controls button:hover { background: rgba(255, 255, 255, 0.06); color: #ffffff; }
.app-titlebar__window-controls .app-titlebar__close:hover { background: rgba(239, 68, 68, 0.2); color: #fecaca; }
.app-titlebar__window-controls svg { width: 15px; height: 15px; }
.is-spinning { animation: titlebar-spin 700ms linear infinite; }

@keyframes titlebar-spin { to { transform: rotate(360deg); } }

@media (max-width: 2200px) {
  .app-titlebar { grid-template-columns: 208px minmax(0, 1fr) 112px; }
  .app-titlebar__actions { min-width: 0; justify-content: flex-end; }
  .app-titlebar__status,
  .app-titlebar__action--compact span { display: none; }
  .app-titlebar__action--compact { width: 42px; justify-content: center; padding: 0; }
  .app-titlebar__window-controls button { width: 36px; }
}

@media (max-width: 820px) {
  .app-titlebar__action-copy,
  .app-titlebar__brand-copy small { display: none; }
  .app-titlebar__action { width: 36px; justify-content: center; padding: 0; }
}
</style>
