<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Languages } from 'lucide-vue-next'
import { useAppSettingsStore } from '@/stores/appSettings'
import type { AppLocale } from '../../../../shared/locale'

const { t } = useI18n()
const settings = useAppSettingsStore()

const model = computed({
  get: () => settings.locale,
  set: (v: AppLocale) => {
    void settings.setLocale(v)
  },
})
</script>

<template>
  <label class="locale-select" :title="t('common.language')">
    <Languages class="locale-select__icon" />
    <select v-model="model" class="vg-select vg-select--sm locale-select__control" data-testid="app-locale-select" :aria-label="t('common.language')">
      <option v-for="o in settings.localeOptions" :key="o.value" :value="o.value">
        {{ o.label }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.locale-select {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}
.locale-select__icon {
  position: absolute;
  left: 10px;
  width: 15px;
  height: 15px;
  color: var(--theme-text-muted);
  pointer-events: none;
}
.locale-select__control {
  width: 100%;
  height: 32px;
  padding-left: 32px;
  background: var(--theme-panel-soft);
}
</style>
