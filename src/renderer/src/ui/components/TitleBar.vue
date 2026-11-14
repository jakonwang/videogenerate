<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Copy, FolderOpen, ListChecks, Minus, RefreshCcw, Square, X } from 'lucide-vue-next'
import brandIconAsset from '../../../../../resources/icon-brand-green.png'

const { t, locale: i18nLocale } = useI18n()
const router = useRouter()
const maximized = ref(false)
const refreshing = ref(false)
const refreshedAt = ref('')

async function sync() {
  const res = await window.api.window.isMaximized()
  maximized.value = Boolean(res?.maximized)
}

function updateRefreshTime() {
  refreshedAt.value = new Intl.DateTimeFormat(String(i18nLocale.value), {
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
  <header class="vg-scope vg-titlebar" @dblclick.self="toggleMax">
    <div class="vg-titlebar__brand">
      <img :src="brandIconAsset" alt="" class="vg-titlebar__logo" />
      <strong class="vg-titlebar__name">VideoGenerate</strong>
      <span class="vg-titlebar__divider" aria-hidden="true"></span>
      <span class="vg-titlebar__subtitle">{{ t('titleBar.productSubtitle') }}</span>
    </div>

    <div class="vg-titlebar__drag" @dblclick="toggleMax"></div>

    <div class="vg-titlebar__actions">
      <span class="vg-pill vg-pill--green vg-pill--dot vg-titlebar__status">{{ t('titleBar.localWorkspace') }} · {{ t('titleBar.ready') }}</span>
      <button
        class="vg-btn vg-btn--ghost vg-btn--sm"
        type="button"
        :disabled="refreshing"
        :title="`${t('titleBar.lastRefresh')}: ${refreshedAt}`"
        @click="refreshStatus"
      >
        <RefreshCcw :class="['vg-titlebar__icon', { 'vg-spin': refreshing }]" />
        <span>{{ t('titleBar.refreshStatus') }}</span>
      </button>
      <button class="vg-btn vg-btn--ghost vg-btn--sm" type="button" @click="openTasks">
        <ListChecks class="vg-titlebar__icon" />
        <span>{{ t('titleBar.taskCenter') }}</span>
      </button>
      <button class="vg-btn vg-btn--ghost vg-btn--sm" type="button" @click="openDataDirectory">
        <FolderOpen class="vg-titlebar__icon" />
        <span>{{ t('titleBar.openDataDirectory') }}</span>
      </button>
    </div>

    <div class="vg-titlebar__window">
      <button type="button" :title="t('titleBar.minimize')" :aria-label="t('titleBar.minimize')" @click="minimize"><Minus /></button>
      <button type="button" :title="t('titleBar.maximize')" :aria-label="t('titleBar.maximize')" @click="toggleMax">
        <Copy v-if="maximized" class="vg-titlebar__restore" />
        <Square v-else />
      </button>
      <button class="is-close" type="button" :title="t('titleBar.close')" :aria-label="t('titleBar.close')" @click="close"><X /></button>
    </div>
  </header>
</template>

<style scoped>
.vg-titlebar {
  position: relative;
  z-index: 100;
  display: flex;
  align-items: center;
  height: 48px;
  flex-shrink: 0;
  padding-left: 16px;
  background: var(--theme-sidebar);
  border-bottom: 1px solid var(--theme-border);
  color: var(--theme-text);
  -webkit-app-region: drag;
  user-select: none;
}

.vg-titlebar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.vg-titlebar__logo {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  flex-shrink: 0;
}
.vg-titlebar__name {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -.01em;
  white-space: nowrap;
}
.vg-titlebar__divider {
  width: 1px;
  height: 14px;
  background: var(--theme-border-control);
}
.vg-titlebar__subtitle {
  font-size: 12px;
  color: var(--theme-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vg-titlebar__drag {
  flex: 1;
  align-self: stretch;
}

.vg-titlebar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 10px;
  -webkit-app-region: no-drag;
}
.vg-titlebar__status { margin-right: 6px; }
.vg-titlebar__icon { width: 15px; height: 15px; }

.vg-titlebar__window {
  display: flex;
  align-self: stretch;
  border-left: 1px solid var(--theme-divider);
  -webkit-app-region: no-drag;
}
.vg-titlebar__window button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  border: 0;
  background: transparent;
  color: var(--theme-text-secondary);
  cursor: pointer;
  transition: background .12s, color .12s;
}
.vg-titlebar__window button :deep(svg) { width: 15px; height: 15px; }
.vg-titlebar__window button .vg-titlebar__restore { width: 13px; height: 13px; transform: scaleX(-1); }
.vg-titlebar__window button:hover { background: var(--theme-control-hover); color: var(--theme-text); }
.vg-titlebar__window button.is-close:hover { background: #e81123; color: #fff; }

@media (max-width: 1180px) {
  .vg-titlebar__subtitle,
  .vg-titlebar__divider,
  .vg-titlebar__actions .vg-btn span { display: none; }
}
</style>
