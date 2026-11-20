<script setup lang="ts">
/**
 * 网页上复用电脑端的整页功能（GMV Max、达人中心）：电脑在线时直接显示电脑端页面，所有操作实时交给电脑执行；
 * 电脑不在线时说明原因，并给出电脑上次同步的摘要（fallback 插槽）。
 */
import { defineAsyncComponent, getCurrentInstance, onBeforeUnmount, onMounted, ref, shallowRef, type Component } from 'vue'
import { LoaderCircle, Monitor, RefreshCw } from 'lucide-vue-next'
import { desktopRelayOnline, refreshDesktopRelayStatus } from '@/lib/desktopRelay'
import { ensureDesktopI18n } from '@/lib/desktopI18n'

const props = defineProps<{ title: string; load: () => Promise<{ default: Component }>; /** 电脑不在线时，横幅最后一句说明下面显示的是什么 */ offlineNote?: string; /** 为什么要电脑执行（默认：要用电脑上登录的 TikTok 账号） */ reason?: string }>()
const app = getCurrentInstance()!.appContext.app
const page = shallowRef<Component>()
const checking = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

async function check() {
  checking.value = true
  try {
    const online = await refreshDesktopRelayStatus()
    if (online && !page.value) {
      await ensureDesktopI18n(app)
      page.value = defineAsyncComponent(props.load)
    }
  } finally {
    checking.value = false
  }
}

onMounted(() => {
  void check()
  // Notice when the computer comes online (or goes away) without a reload.
  timer = setInterval(() => void check(), 30_000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="dm">
    <div v-if="page && desktopRelayOnline === false" class="vg-scope dm-bar">
      <div class="vg-notice vg-notice--warning"><Monitor :size="15" /> 电脑端刚刚断开：{{ title }}的操作要等电脑重新上线才能执行。</div>
    </div>
    <component :is="page" v-if="page" />
    <div v-else-if="desktopRelayOnline === null || (checking && !desktopRelayOnline)" class="vg-scope dm-wait">
      <LoaderCircle :size="22" class="vg-spin" /> 正在连接电脑端…
    </div>
    <template v-else>
      <div class="vg-scope dm-bar">
        <div class="vg-notice vg-notice--warning dm-offline">
          <Monitor :size="16" />
          <span><strong>电脑端不在线。</strong>{{ reason ?? `${title}要用电脑上登录的 TikTok 账号执行` }}，打开电脑上的 Vidloom（登录同一账号）后，这里会显示和电脑上完全一样的页面，所有操作实时交给电脑执行。{{ offlineNote ?? '下面是电脑上次同步的摘要。' }}</span>
          <button type="button" class="vg-btn vg-btn--sm" :disabled="checking" @click="check"><RefreshCw :size="14" :class="{ 'vg-spin': checking }" /> 重新检测</button>
        </div>
      </div>
      <slot name="fallback" />
    </template>
  </div>
</template>

<style scoped>
.dm { min-height: 100%; }
.dm-bar { padding: 16px 24px 0; }
.dm-offline { display: flex; align-items: center; gap: 10px; }
.dm-offline span { flex: 1; line-height: 1.6; }
.dm-wait { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 60vh; color: var(--theme-text-muted); }
</style>
