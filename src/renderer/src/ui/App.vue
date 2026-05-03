<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import { i18n } from '@/i18n'
import UpdateReadyModal from './components/UpdateReadyModal.vue'
import { useAppSettingsStore } from '@/stores/appSettings'

const appSettings = useAppSettingsStore()
const updateModalOpen = ref(false)
const updateVersion = ref('')

let offUpdaterDownloaded: (() => void) | null = null

onMounted(async () => {
  await window.api.getPaths()
  i18n.global.locale.value = appSettings.locale
  await appSettings.syncLocaleToMain()

  offUpdaterDownloaded = window.api.updater.onUpdateDownloaded((p) => {
    updateVersion.value = p?.version ?? ''
    updateModalOpen.value = true
  })
})

onUnmounted(() => {
  offUpdaterDownloaded?.()
})
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-[#0E0E11]">
    <RouterView />
    <UpdateReadyModal
      :open="updateModalOpen"
      :version="updateVersion"
      @dismiss="updateModalOpen = false"
      @restart="updateModalOpen = false"
    />
  </div>
</template>
