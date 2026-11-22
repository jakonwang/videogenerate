<script setup lang="ts">
/** 店铺（网页版）：电脑在线时就是电脑端的「店铺」页面（经营、利润、早报、账号），操作实时交给电脑执行。 */
import { useRouter } from 'vue-router'
import { Building2 } from 'lucide-vue-next'
import WebDesktopModule from './WebDesktopModule.vue'

const props = defineProps<{ detail?: boolean }>()
const router = useRouter()
const load = () => (props.detail ? import('@desktop-views/ShopDetailView.vue') : import('@desktop-views/ShopsView.vue'))
</script>

<template>
  <WebDesktopModule title="店铺" :load="load" reason="店铺数据从电脑上登录的商家后台同步">
    <template #fallback>
      <div class="vg-scope wdm">
        <div class="vg-empty">
          <span class="vg-empty__icon"><Building2 :size="22" /></span>
          <h3>店铺需要电脑端在线</h3>
          <p>电脑上次同步的经营摘要可以先在「经营数据 → 店铺」里查看。</p>
          <button type="button" class="vg-btn vg-btn--primary" @click="router.push('/business?tab=shops')">查看店铺摘要</button>
        </div>
      </div>
    </template>
  </WebDesktopModule>
</template>

<style scoped>
.wdm { padding: 24px; }
</style>
