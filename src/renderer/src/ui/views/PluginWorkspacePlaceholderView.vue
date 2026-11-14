<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, ChevronLeft, Wrench } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { webApiClient, type PluginDetail } from '@/lib/webApiClient'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const plugin = ref<PluginDetail | null>(null)
const errorText = ref('')

const pluginId = computed(() => String(route.path.split('/').pop() || '').trim())

onMounted(async () => {
  try {
    plugin.value = await webApiClient.getPlugin(pluginId.value)
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
})
</script>

<template>
  <div class="vg-scope vg-page placeholder">
    <header class="vg-page-head">
      <button class="vg-icon-btn" type="button" :title="t('pluginPlaceholder.back')" @click="router.push('/plugins?tab=installed')">
        <ChevronLeft :size="18" />
      </button>
      <span class="vg-page-head__icon"><Wrench :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>{{ plugin?.name || t('pluginPlaceholder.title') }}</h1>
        <p>{{ plugin?.description || t('pluginPlaceholder.description') }}</p>
      </div>
      <div class="vg-page-head__actions">
        <button class="vg-btn" type="button" @click="router.push('/plugins?tab=installed')">{{ t('pluginPlaceholder.back') }}</button>
      </div>
    </header>

    <section class="vg-card">
      <dl class="vg-kv placeholder__kv">
        <dt>{{ t('pluginPlaceholder.status') }}</dt>
        <dd>
          <span class="vg-pill vg-pill--dot" :class="plugin ? (plugin.enabled ? 'vg-pill--green' : 'vg-pill--amber') : ''">
            {{ plugin ? (plugin.enabled ? t('pluginPlaceholder.enabled') : t('pluginPlaceholder.disabled')) : t('pluginPlaceholder.unknown') }}
          </span>
        </dd>
        <dt>{{ t('pluginPlaceholder.route') }}</dt>
        <dd class="vg-num">{{ plugin?.workspacePath || route.path }}</dd>
        <dt>{{ t('pluginPlaceholder.notes') }}</dt>
        <dd class="vg-secondary">{{ plugin?.usageHint || t('pluginPlaceholder.notesFallback') }}</dd>
      </dl>
    </section>

    <div v-if="errorText" class="vg-notice vg-notice--danger"><AlertTriangle :size="16" /><span>{{ errorText }}</span></div>
  </div>
</template>

<style scoped>
.placeholder { width: min(960px, 100%); margin: 0 auto; }
.placeholder__kv { gap: 12px 24px; }
</style>
