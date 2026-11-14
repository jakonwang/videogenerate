<script setup lang="ts">
import { AlertCircle, CheckCircle2, Info } from 'lucide-vue-next'

defineProps<{ toast: { id: number; text: string; tone: 'info' | 'success' | 'error' } | null }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="prd-toast">
      <div v-if="toast" :key="toast.id" class="vg-scope prd-toast" :class="`prd-toast--${toast.tone}`" role="status">
        <CheckCircle2 v-if="toast.tone === 'success'" :size="16" />
        <AlertCircle v-else-if="toast.tone === 'error'" :size="16" />
        <Info v-else :size="16" />
        <span>{{ toast.text }}</span>
      </div>
    </Transition>
  </Teleport>
</template>
