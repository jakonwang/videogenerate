<script setup lang="ts">
/** 混剪数据洞察（网页版）：电脑端的成片台账与投放效果分析页面，数据和操作都在电脑上（经电脑代办实时执行）。 */
import { useRouter } from 'vue-router'
import { BarChart3 } from 'lucide-vue-next'
import WebDesktopModule from '@/views/web/WebDesktopModule.vue'

const router = useRouter()
const load = () => import('@desktop-views/ProductionMixInsightsView.vue')
</script>

<template>
  <WebDesktopModule title="混剪数据洞察" :load="load">
    <template #fallback>
      <div class="vg-scope wmi">
        <div class="vg-empty">
          <span class="vg-empty__icon"><BarChart3 :size="22" /></span>
          <h3>混剪数据洞察需要电脑端在线</h3>
          <p>成片台账和 GMV Max 投放效果保存在电脑上；电脑打开后这里会显示完整的分析。</p>
          <button type="button" class="vg-btn" @click="router.push('/production')">返回批量混剪</button>
        </div>
      </div>
    </template>
  </WebDesktopModule>
</template>

<style scoped>
.wmi { padding: 24px; }
</style>
