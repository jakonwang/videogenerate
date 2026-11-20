<script setup lang="ts">
/**
 * 网页设置 → AI 平台 / 模型能力 / 七牛云：和电脑端设置页同一套组件与逻辑（useModelSettings），
 * 读写的是电脑上的模型配置，经「电脑代办」实时转交给电脑（托管字段电脑端只返回掩码，并以后台为准）。
 */
import { getCurrentInstance, onMounted, ref, shallowRef } from 'vue'
import { LoaderCircle, Monitor, RefreshCw, Save } from 'lucide-vue-next'
import { ensureDesktopI18n } from '@/lib/desktopI18n'
import { desktopRelayOnline, refreshDesktopRelayStatus } from '@/lib/desktopRelay'

defineProps<{ section: 'platforms' | 'capabilities' | 'qiniu' }>()
const app = getCurrentInstance()!.appContext.app
const message = ref('')
const ms = shallowRef<any>(null)
const parts = shallowRef<{ Section: any; Summary: any } | null>(null)
const loading = ref(true)

async function init() {
  loading.value = true
  try {
    if (!(await refreshDesktopRelayStatus())) return
    await ensureDesktopI18n(app)
    const [{ i18n }, { useModelSettings }, Section, Summary] = await Promise.all([
      import('@desktop-src/i18n'),
      import('@desktop-src/ui/composables/useModelSettings'),
      import('@desktop-src/ui/components/settings/ModelSettingsSection.vue'),
      import('@desktop-src/ui/components/settings/ModelSettingsSummary.vue'),
    ])
    const t = (i18n as any).global.t as (key: string, values?: Record<string, unknown>) => string
    ms.value = useModelSettings({ t, message })
    parts.value = { Section: Section.default, Summary: Summary.default }
    await ms.value.refreshModelSettings()
  } finally {
    loading.value = false
  }
}
onMounted(() => void init())
</script>

<template>
  <div v-if="loading" class="wms-wait"><LoaderCircle :size="18" class="vg-spin" /> 正在读取电脑端的模型配置…</div>
  <div v-else-if="!desktopRelayOnline || !ms || !parts" class="vg-notice vg-notice--warning wms-offline">
    <Monitor :size="15" />
    <span>这里查看和修改的是你在电脑上自己填写的平台 Key 和模型。打开电脑上的 Klipmill（登录同一账号）后才能读取。网页上的生成功能用的是平台统一配置，不受影响。</span>
    <button type="button" class="vg-btn vg-btn--sm" @click="init"><RefreshCw :size="14" /> 重新检测</button>
  </div>
  <div v-else class="wms">
    <div class="wms-bar">
      <span class="vg-muted wms-msg">{{ message || '修改的是电脑上的配置，保存后电脑端立即生效。' }}</span>
      <button type="button" class="vg-btn vg-btn--sm" :disabled="ms.modelSettingsBusy.value" @click="ms.refreshModelSettings()"><RefreshCw :size="14" /> 重新加载</button>
      <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="ms.modelSettingsBusy.value" data-testid="web-model-save" @click="ms.saveModelSettings()">
        <Save :size="14" /> {{ ms.modelSettingsBusy.value ? '保存中…' : '保存设置' }}
      </button>
    </div>
    <div class="wms-layout">
      <component :is="parts.Section" :ms="ms" :section="section" />
      <aside v-if="section !== 'qiniu'" class="wms-side"><component :is="parts.Summary" :ms="ms" /></aside>
    </div>
  </div>
</template>

<style scoped>
.wms { display: flex; flex-direction: column; gap: 14px; }
.wms-bar { display: flex; align-items: center; gap: 8px; }
.wms-msg { flex: 1; font-size: 12px; }
.wms-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; align-items: start; }
@media (max-width: 1280px) { .wms-layout { grid-template-columns: minmax(0, 1fr); } }
.wms-wait { display: flex; align-items: center; gap: 8px; padding: 24px 4px; color: var(--theme-text-muted); }
.wms-offline { display: flex; align-items: center; gap: 10px; }
.wms-offline span { flex: 1; line-height: 1.6; }
</style>
