<script setup lang="ts">
/** 销售与库存（网页版）：电脑在线时就是电脑端的页面，操作实时交给电脑执行。 */
import { useRouter } from 'vue-router'
import { Boxes } from 'lucide-vue-next'
import WebDesktopModule from './WebDesktopModule.vue'

const router = useRouter()
const load = () => import('@desktop-views/SellerInventoryView.vue')
</script>

<template>
  <WebDesktopModule title="销售与库存" :load="load" reason="销量和库存从电脑上登录的商家后台同步">
    <template #fallback>
      <div class="vg-scope wdm">
        <div class="vg-empty">
          <span class="vg-empty__icon"><Boxes :size="22" /></span>
          <h3>销售与库存需要电脑端在线</h3>
          <p>各店铺的经营摘要可以先在「经营数据 → 店铺」里查看。</p>
          <button type="button" class="vg-btn vg-btn--primary" @click="router.push('/business?tab=shops')">查看店铺摘要</button>
        </div>
      </div>
    </template>
  </WebDesktopModule>
</template>

<style scoped>
.wdm { padding: 24px; }
</style>
