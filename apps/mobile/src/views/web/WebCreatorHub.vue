<script setup lang="ts">
/** 达人中心（网页版）：电脑在线时就是电脑端的达人中心页面，操作实时交给电脑执行（店铺登录在电脑上）。 */
import { useRouter } from 'vue-router'
import { PackageSearch } from 'lucide-vue-next'
import WebDesktopModule from './WebDesktopModule.vue'

const router = useRouter()
const load = () => import('@desktop-views/TiktokCreatorHubView.vue')
</script>

<template>
  <WebDesktopModule title="达人中心" :load="load">
    <template #fallback>
      <div class="vg-scope wch">
        <div class="vg-empty">
          <span class="vg-empty__icon"><PackageSearch :size="22" /></span>
          <h3>达人中心需要电脑端在线</h3>
          <p>样品履约待办和达人摘要可以先在「经营数据 → 达人」里查看。</p>
          <button type="button" class="vg-btn vg-btn--primary" @click="router.push('/business?tab=creators')">查看达人摘要</button>
        </div>
      </div>
    </template>
  </WebDesktopModule>
</template>

<style scoped>
.wch { padding: 24px; }
</style>
