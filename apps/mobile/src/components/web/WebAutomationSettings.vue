<script setup lang="ts">
/**
 * 设置 → 体检与自动化（网页版）：电脑端同一个组件（系统体检、每日简报 / 每周复盘定时、飞书推送），
 * 这些都在电脑上运行，读写经「电脑代办」交给电脑；电脑不在线时说明原因。
 */
import { defineAsyncComponent, getCurrentInstance, onMounted, ref, shallowRef, type Component } from 'vue'
import { LoaderCircle, Monitor, RefreshCw } from 'lucide-vue-next'
import { ensureDesktopI18n } from '@/lib/desktopI18n'
import { refreshDesktopRelayStatus } from '@/lib/desktopRelay'

const app = getCurrentInstance()!.appContext.app
const section = shallowRef<Component>()
const loading = ref(true)
const online = ref(false)

async function init() {
  loading.value = true
  try {
    online.value = await refreshDesktopRelayStatus()
    if (!online.value) return
    await ensureDesktopI18n(app)
    section.value = defineAsyncComponent(() => import('@desktop-src/ui/components/ai/AiAutomationSettings.vue'))
  } finally {
    loading.value = false
  }
}
onMounted(() => void init())
</script>

<template>
  <div v-if="loading" class="was-wait"><LoaderCircle :size="18" class="vg-spin" /> 正在连接电脑…</div>
  <div v-else-if="!online || !section" class="vg-notice vg-notice--warning was-offline">
    <Monitor :size="15" />
    <span>系统体检、每日简报和每周复盘的定时、飞书推送都在电脑上运行。打开电脑上的 TiktokCut（登录同一账号）后，这里可以直接查看和修改。网页的「AI 今日简报」和「数据复盘」不受影响。</span>
    <button type="button" class="vg-btn vg-btn--sm" @click="init"><RefreshCw :size="14" /> 重新检测</button>
  </div>
  <component :is="section" v-else data-testid="web-automation-settings" />
</template>

<style scoped>
.was-wait { display: flex; align-items: center; gap: 8px; padding: 16px; color: var(--theme-text-muted); font-size: 13px; }
.was-offline { display: flex; align-items: flex-start; gap: 10px; }
.was-offline span { flex: 1; line-height: 1.6; }
</style>
