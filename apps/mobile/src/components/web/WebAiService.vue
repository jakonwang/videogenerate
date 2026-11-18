<script setup lang="ts">
/**
 * 网页设置 →「AI 服务」：后台统一配置 AI 平台时显示（Key 只在服务器），和电脑端设置页用同一个组件。
 */
import { getCurrentInstance, onMounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { LoaderCircle } from 'lucide-vue-next'
import { ensureDesktopI18n } from '@/lib/desktopI18n'

const app = getCurrentInstance()!.appContext.app
const router = useRouter()
const Panel = shallowRef<any>(null)

onMounted(async () => {
  await ensureDesktopI18n(app)
  Panel.value = (await import('@desktop-src/ui/components/settings/ManagedAiServicePanel.vue')).default
})
</script>

<template>
  <component :is="Panel" v-if="Panel" @open-billing="router.push('/membership')" />
  <div v-else class="was-wait"><LoaderCircle :size="18" class="vg-spin" /> 正在加载…</div>
</template>

<style scoped>
.was-wait { display: flex; align-items: center; gap: 8px; padding: 24px 4px; color: var(--theme-text-muted); }
</style>
