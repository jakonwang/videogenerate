<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { i18n } from '@/i18n'
import UpdateReadyModal from './components/UpdateReadyModal.vue'
import { useAppSettingsStore } from '@/stores/appSettings'
import DesignInspectorOverlay from './components/DesignInspectorOverlay.vue'

const appSettings = useAppSettingsStore()
const route = useRoute()
const updateModalOpen = ref(false)
const updateVersion = ref('')
const showDesignInspectorOverlay = computed(() => import.meta.env.DEV && !route.path.includes('/clone'))

let offUpdaterDownloaded: (() => void) | null = null

onMounted(async () => {
  appSettings.applyTheme()
  i18n.global.locale.value = appSettings.locale
  await window.api.getPaths()
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
    <DesignInspectorOverlay v-if="showDesignInspectorOverlay" />
    <UpdateReadyModal
      :open="updateModalOpen"
      :version="updateVersion"
      @dismiss="updateModalOpen = false"
      @restart="updateModalOpen = false"
    />
  </div>
</template>
