<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiButton from './UiButton.vue'

const props = defineProps<{
  open: boolean
  version: string
}>()

const emit = defineEmits<{
  (e: 'restart'): void
  (e: 'dismiss'): void
}>()

const { t } = useI18n()

async function onRestart() {
  emit('restart')
  try {
    await window.api.updater.quitAndInstall()
  } catch {
    // 主进程将退出；忽略
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[100] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      :aria-label="t('update.title')"
    >
      <div class="update-ready-backdrop" @click="emit('dismiss')"></div>
      <div
        class="update-ready-panel"
        @click.stop
      >
        <h2 class="update-ready-title">{{ t('update.title') }}</h2>
        <p class="update-ready-body">{{ t('update.body') }}</p>
        <p v-if="version" class="update-ready-version">v{{ version }}</p>
        <div class="update-ready-actions">
          <UiButton class="w-full sm:w-auto sm:min-w-[140px]" variant="accent" @click="onRestart">
            {{ t('update.restartNow') }}
          </UiButton>
          <UiButton class="w-full sm:w-auto sm:min-w-[140px]" variant="ghost" @click="emit('dismiss')">
            {{ t('update.later') }}
          </UiButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.update-ready-backdrop { position: absolute; inset: 0; background: color-mix(in srgb, var(--theme-root, #070910) 74%, transparent); backdrop-filter: blur(8px); }
.update-ready-panel { position: relative; width: 100%; max-width: 28rem; border: 1px solid var(--theme-border, #e5e5e7); border-radius: 16px; background: var(--theme-panel, #fff); padding: 24px; box-shadow: 0 24px 64px color-mix(in srgb, var(--theme-text, #171717) 18%, transparent); }
.update-ready-title { margin: 0; text-align: center; color: var(--theme-text, #171717); font-size: 1rem; font-weight: 650; }
.update-ready-body { margin: 12px 0 0; text-align: center; color: var(--theme-text-secondary, #737780); font-size: .875rem; line-height: 1.5; }
.update-ready-version { margin: 8px 0 0; text-align: center; color: var(--theme-accent, #087f5b); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .75rem; }
.update-ready-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 24px; }
@media (min-width: 640px) { .update-ready-actions { flex-direction: row; justify-content: center; } .update-ready-actions > * { min-width: 140px; } }
</style>
