<script setup lang="ts">
/** 设置 → 模型配置摘要和说明（右侧栏；电脑端设置页和网页版设置共用）。 */
import { useI18n } from 'vue-i18n'
import { ClipboardList, Info } from 'lucide-vue-next'
import type { ModelSettings } from '../../composables/useModelSettings'

const props = defineProps<{ ms: ModelSettings }>()
const { t } = useI18n()
const { modelCredentials, capabilityProviderLabel, videoPrimaryModelBinding, imagePrimaryModelBinding, chatPrimaryModelBinding, imageQualityLabel } = props.ms
</script>

<template>
  <div class="vg-stack">
    <section class="vg-card">
      <div class="vg-card__head"><span class="vg-card__title"><ClipboardList :size="16" /> {{ t('settings.summary.title') }}</span></div>
      <dl class="vg-kv settings__summary">
        <dt>{{ t('settings.summary.rows.video') }}</dt>
        <dd>{{ capabilityProviderLabel('video', modelCredentials.videoProviderPrimary, modelCredentials.videoApifoxHubProfile) }} / {{ videoPrimaryModelBinding || t('settings.common.notSet') }}</dd>
        <dt>{{ t('settings.summary.rows.image') }}</dt>
        <dd>{{ capabilityProviderLabel('image', modelCredentials.imageProviderPrimary, modelCredentials.imageApifoxHubProfile) }} / {{ imagePrimaryModelBinding || t('settings.common.notSet') }} / {{ imageQualityLabel }}</dd>
        <dt>{{ t('settings.summary.rows.chat') }}</dt>
        <dd>{{ capabilityProviderLabel('chat', modelCredentials.chatProviderPrimary, modelCredentials.chatApifoxHubProfile) }} / {{ chatPrimaryModelBinding || t('settings.common.notSet') }}</dd>
      </dl>
    </section>
    <section class="vg-card">
      <div class="vg-card__head"><span class="vg-card__title"><Info :size="16" /> {{ t('settings.notes.title') }}</span></div>
      <ul class="settings__notes">
        <li>{{ t('settings.notes.items.credentialsReuse') }}</li>
        <li>{{ t('settings.notes.items.xibapiIndependent') }}</li>
        <li>{{ t('settings.notes.items.reloadAfterSave') }}</li>
        <li>{{ t('settings.notes.items.imageQualityForwarded') }}</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.settings__section-head { margin-bottom: 0; }
.settings__platforms { --vg-grid-min: 300px; }
.settings__card-head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
.settings__card-head h3 { font-size: 14px; font-weight: 700; }
.settings__card-head p { font-size: 12px; color: var(--theme-text-muted); margin-top: 2px; }
.settings__card-icon { width: 34px; height: 34px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; background: var(--vg-accent-soft); color: var(--vg-accent); }
.settings__card-icon--violet { background: color-mix(in srgb, var(--vg-violet) 14%, transparent); color: var(--vg-violet); }
.settings__card-icon--blue { background: color-mix(in srgb, var(--vg-blue) 14%, transparent); color: var(--vg-blue); }
.settings__fields { gap: 10px; }
.settings__inline { flex-wrap: nowrap; }
.settings__inline .vg-input { flex: 1; }
.settings__summary { grid-template-columns: 1fr; gap: 2px 0; }
.settings__summary dd { margin-bottom: 8px; font-size: 12px; }
.settings__notes { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: var(--theme-text-secondary); line-height: 1.55; }
</style>
