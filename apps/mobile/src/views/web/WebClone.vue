<script setup lang="ts">
/**
 * 复刻（网页版）：就是电脑端的复刻任务列表，在服务器复刻引擎上执行（不需要电脑开着）；
 * 项目和电脑端双向同步。以前在网页上用旧版云端复刻做的任务另有入口。
 */
import '@desktop-src/design-system/clone-workspace.css'
import '@desktop-src/design-system/clone-studio.css'
import { computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Cloud } from 'lucide-vue-next'
import DesktopPage from '@/components/web/DesktopPage.vue'
import DesktopPickerHost from '@/components/web/DesktopPickerHost.vue'
import { useCloneProjects } from '@/lib/clone'
import { useServerTargetFor } from '@/lib/desktopRelay'

const router = useRouter()
const cloudProjects = useCloneProjects()
const cloudCount = computed(() => cloudProjects.value.length)
const load = () => import('@desktop-views/CloneTaskListView.vue')
useServerTargetFor('products', true)
onBeforeUnmount(() => useServerTargetFor('products', false))
</script>

<template>
  <div v-if="cloudCount" class="wc-cloud vg-notice">
    <Cloud :size="15" />
    <span>以前用旧版网页复刻做的任务有 {{ cloudCount }} 个，在单独的列表里。</span>
    <button type="button" class="vg-btn vg-btn--sm" @click="router.push('/clone/cloud')">查看旧版复刻</button>
  </div>
  <DesktopPage :load="load" />
  <DesktopPickerHost />
</template>

<style scoped>
.wc-cloud { display: flex; align-items: center; gap: 10px; margin: 12px 16px 0; }
.wc-cloud span { flex: 1; }
</style>
