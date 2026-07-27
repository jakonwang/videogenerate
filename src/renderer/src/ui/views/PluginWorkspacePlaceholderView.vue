<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ChevronLeft, Wrench } from 'lucide-vue-next'
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
  <div class="placeholder-page">
    <section class="placeholder-card">
      <button class="ghost-button" type="button" @click="router.push('/plugins?tab=installed')">
        <ChevronLeft class="h-4 w-4" />
        {{ t('pluginPlaceholder.back') }}
      </button>

      <div class="placeholder-hero">
        <div class="placeholder-icon">
          <Wrench class="h-6 w-6" />
        </div>
        <div>
          <h1>{{ plugin?.name || t('pluginPlaceholder.title') }}</h1>
          <p>{{ plugin?.description || t('pluginPlaceholder.description') }}</p>
        </div>
      </div>

      <div class="placeholder-grid">
        <div class="placeholder-item">
          <span>{{ t('pluginPlaceholder.status') }}</span>
          <strong>{{ plugin ? (plugin.enabled ? t('pluginPlaceholder.enabled') : t('pluginPlaceholder.disabled')) : t('pluginPlaceholder.unknown') }}</strong>
        </div>
        <div class="placeholder-item">
          <span>{{ t('pluginPlaceholder.route') }}</span>
          <strong>{{ plugin?.workspacePath || route.path }}</strong>
        </div>
        <div class="placeholder-item">
          <span>{{ t('pluginPlaceholder.notes') }}</span>
          <strong>{{ plugin?.usageHint || t('pluginPlaceholder.notesFallback') }}</strong>
        </div>
      </div>

      <div v-if="errorText" class="error-box">{{ errorText }}</div>
    </section>
  </div>
</template>

<style scoped>
.placeholder-page {
  padding: 12px;
}

.placeholder-card {
  display: grid;
  gap: 18px;
  padding: 24px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 22px;
  background: rgba(8, 13, 21, 0.78);
}

.ghost-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  color: #eef5ff;
}

.placeholder-hero {
  display: flex;
  align-items: center;
  gap: 14px;
}

.placeholder-icon {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #3b82f6, #14b8a6);
  color: #fff;
}

.placeholder-hero h1 {
  margin: 0;
  color: #fff;
  font-size: 30px;
  font-weight: 800;
}

.placeholder-hero p {
  margin: 8px 0 0;
  color: rgba(205, 218, 236, 0.76);
}

.placeholder-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.placeholder-item {
  display: grid;
  gap: 8px;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.03);
}

.placeholder-item span {
  color: rgba(205, 218, 236, 0.72);
  font-size: 12px;
}

.placeholder-item strong {
  color: #fff;
  font-size: 14px;
  line-height: 1.6;
}

.error-box {
  padding: 12px 14px;
  border: 1px solid rgba(248, 113, 113, 0.18);
  border-radius: 14px;
  background: rgba(239, 68, 68, 0.12);
  color: #ffd8d8;
}

@media (max-width: 960px) {
  .placeholder-grid {
    grid-template-columns: 1fr;
  }
}
</style>
