<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SwapImage from './SwapImage.vue'

/** 同一画面的前后对比：拖动分割线；左右方向键也能移动（原生滑块，键盘可用） */
const props = defineProps<{ before: string; after: string }>()
const { t } = useI18n()
const position = ref(50)
watch(() => props.after, () => (position.value = 50))
</script>

<template>
  <div class="compare" :style="{ '--split': `${position}%` }">
    <SwapImage :file-id="after" fill :alt="t('ai.sceneSwap.result')" />
    <div class="compare__before"><SwapImage :file-id="before" fill :alt="t('ai.sceneSwap.original')" /></div>
    <span class="compare__line" aria-hidden="true"><i /></span>
    <span class="compare__tag is-left">{{ t('ai.sceneSwap.original') }}</span>
    <span class="compare__tag is-right">{{ t('ai.sceneSwap.result') }}</span>
    <input v-model.number="position" type="range" min="0" max="100" :aria-label="t('ai.sceneSwap.compare')" @keydown.stop />
  </div>
</template>

<style scoped>
.compare { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: inherit; background: var(--gs-well); }
.compare > :deep(.swap-img), .compare__before { position: absolute; inset: 0; }
.compare__before { clip-path: inset(0 calc(100% - var(--split)) 0 0); }
.compare__line { position: absolute; inset: 0 auto 0 var(--split); width: 1px; background: #fff; box-shadow: 0 0 0 .5px rgba(0, 0, 0, .35); pointer-events: none; }
.compare__line i { position: absolute; top: 50%; left: 50%; width: 28px; height: 28px; transform: translate(-50%, -50%); border-radius: 50%; background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, .35); }
.compare__line i::before { content: ''; position: absolute; inset: 10px 8px; border: solid #222; border-width: 0 1.5px; }
.compare__tag { position: absolute; bottom: 12px; padding: 3px 9px; border-radius: 5px; background: rgba(0, 0, 0, .62); color: #fff; font-size: 12px; pointer-events: none; }
.compare__tag.is-left { left: 12px; }
.compare__tag.is-right { right: 12px; }
.compare input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: ew-resize; }
.compare:focus-within { outline: 2px solid var(--vg-accent); outline-offset: 2px; }
</style>
