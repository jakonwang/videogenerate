<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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
  <label class="flex flex-col gap-1">
    <span class="text-[10px] font-medium tracking-wide text-white/40">{{ t('common.language') }}</span>
    <select
      v-model="model"
      class="ui-select w-full cursor-pointer rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs text-white/90 outline-none transition hover:border-white/15 focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30"
    >
      <option v-for="o in settings.localeOptions" :key="o.value" :value="o.value" class="bg-[#18181B] text-white">
        {{ o.label }}
      </option>
    </select>
  </label>
</template>
