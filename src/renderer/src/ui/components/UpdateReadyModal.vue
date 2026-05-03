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
      <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('dismiss')"></div>
      <div
        class="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#18181B] p-6 shadow-2xl shadow-black/60"
        @click.stop
      >
        <h2 class="text-center text-base font-semibold text-white/95">{{ t('update.title') }}</h2>
        <p class="mt-3 text-center text-sm text-white/65">{{ t('update.body') }}</p>
        <p v-if="version" class="mt-2 text-center font-mono text-xs text-teal-400/90">v{{ version }}</p>
        <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
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
