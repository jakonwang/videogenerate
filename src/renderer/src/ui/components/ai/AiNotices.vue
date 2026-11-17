<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAiProducerStore } from '@/stores/aiProducer'

const { t, te } = useI18n()
const router = useRouter()
const ai = useAiProducerStore()
const { notices } = storeToRefs(ai)

function label(text: string) {
  return te(text) ? t(text) : text
}

function activate(route?: string) {
  if (route) void router.push(route)
}
</script>

<template>
  <div class="vg-scope ai-notices" aria-live="polite">
    <TransitionGroup name="vg-toast">
      <button
        v-for="notice in notices"
        :key="notice.id"
        type="button"
        class="vg-toast ai-notices__item"
        :class="{ 'vg-toast--success': notice.tone === 'success', 'vg-toast--error': notice.tone === 'error' }"
        @click="activate(notice.route)"
      >{{ label(notice.text) }}</button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.ai-notices { position: fixed; right: 20px; bottom: 20px; z-index: 130; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
.ai-notices__item { position: static; transform: none; pointer-events: auto; cursor: pointer; text-align: left; }
</style>
