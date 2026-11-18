<script setup lang="ts">
/** 店小秘库存（网页版）：电脑在线时就是电脑端的店小秘库存页面，操作实时交给电脑执行（店小秘登录在电脑上）。 */
import { useRouter } from 'vue-router'
import { Warehouse } from 'lucide-vue-next'
import WebDesktopModule from './WebDesktopModule.vue'

const router = useRouter()
const load = () => import('@desktop-views/DianxiaomiInventoryView.vue')
</script>

<template>
  <WebDesktopModule title="店小秘库存" :load="load">
    <template #fallback>
      <div class="vg-scope wdm">
        <div class="vg-empty">
          <span class="vg-empty__icon"><Warehouse :size="22" /></span>
          <h3>店小秘库存需要电脑端在线</h3>
          <p>缺货和需补货的 SKU 提醒可以先在「经营数据 → 库存」里查看。</p>
          <button type="button" class="vg-btn vg-btn--primary" @click="router.push('/business?tab=inventory')">查看库存提醒</button>
        </div>
      </div>
    </template>
  </WebDesktopModule>
</template>

<style scoped>
.wdm { padding: 24px; }
</style>
