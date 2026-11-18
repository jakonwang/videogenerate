<script setup lang="ts">
/**
 * 复刻项目页（网页版）：电脑端同一个复刻页面（简洁模式 + 参考分析 / 脚本生成 / 身份定妆图 / 分镜设计 / 分镜视频 / 成片合成），
 * 在服务器复刻引擎上执行。以前用旧版网页复刻做的项目仍打开旧版页面。
 */
import '@desktop-src/design-system/clone-workspace.css'
import '@desktop-src/design-system/clone-studio.css'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { LoaderCircle } from 'lucide-vue-next'
import { SYNC_COLLECTIONS } from '@shared/cloud/sync'
import CloneStepBar from '@/components/web/CloneStepBar.vue'
import DesktopPage from '@/components/web/DesktopPage.vue'
import DesktopPickerHost from '@/components/web/DesktopPickerHost.vue'
import { useServerTargetFor } from '@/lib/desktopRelay'
import { getRecord } from '@/lib/sync'
import CloneProjectView from '@/views/CloneProjectView.vue'

const route = useRoute()
const kind = ref<'' | 'legacy' | 'engine'>('')
const load = () => import('@desktop-views/CloneView.vue')
useServerTargetFor('products', true)
onBeforeUnmount(() => useServerTargetFor('products', false))

onMounted(async () => {
  const id = String(route.params.projectId || '')
  kind.value = (await getRecord(SYNC_COLLECTIONS.cloneProjects, id))?.data ? 'legacy' : 'engine'
})
</script>

<template>
  <div v-if="!kind" class="vg-empty"><LoaderCircle :size="20" class="vg-spin" /></div>
  <CloneProjectView v-else-if="kind === 'legacy'" />
  <template v-else>
    <CloneStepBar />
    <DesktopPage :load="load" />
    <DesktopPickerHost />
  </template>
</template>
