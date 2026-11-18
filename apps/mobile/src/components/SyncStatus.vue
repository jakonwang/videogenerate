<script setup lang="ts">
import { computed } from 'vue'
import { CloudCheck, CloudOff, RefreshCw } from 'lucide-vue-next'
import { relativeTime } from '@/lib/library'
import { requestSync, syncState } from '@/lib/sync'

const label = computed(() => {
  if (syncState.running) return '正在同步…'
  if (syncState.error) return syncState.error
  if (syncState.lastSyncedAt) return `已与电脑端同步 · ${relativeTime(syncState.lastSyncedAt)}`
  return '尚未同步'
})
</script>

<template>
  <button type="button" class="sync" :class="{ 'is-error': syncState.error && !syncState.running }" @click="requestSync()">
    <RefreshCw v-if="syncState.running" :size="14" class="m-spin" />
    <CloudOff v-else-if="syncState.error" :size="14" />
    <CloudCheck v-else :size="14" />
    <span>{{ label }}</span>
  </button>
</template>

<style scoped>
.sync { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 0; border: 0; background: none; color: var(--theme-text-muted); font-size: 12px; text-align: left; }
.sync span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sync svg { flex: none; color: var(--m-green); }
.sync.is-error svg { color: var(--m-amber); }
</style>
