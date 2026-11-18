<script setup lang="ts">
import { AlertTriangle, X } from 'lucide-vue-next'

withDefaults(defineProps<{
  open: boolean
  title: string
  message: string
  confirmText?: string
  danger?: boolean
  busy?: boolean
}>(), { confirmText: '确定', danger: true, busy: false })

const emit = defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="vg-scope prd-backdrop" @click.self="!busy && emit('close')">
      <div class="prd-dialog" role="alertdialog" aria-modal="true">
        <div class="prd-dialog__head">
          <div class="prd-dialog__title">
            <span class="prd-dialog__title-icon" :class="{ 'confirm-icon--danger': danger }"><AlertTriangle :size="19" /></span>
            <div>
              <h2>{{ title }}</h2>
              <p>{{ message }}</p>
            </div>
          </div>
          <button class="prd-icon-btn" :disabled="busy" aria-label="关闭" @click="emit('close')"><X :size="16" /></button>
        </div>
        <div class="prd-dialog__foot">
          <div class="prd-dialog__foot-actions">
            <button class="prd-btn prd-btn--outline" :disabled="busy" @click="emit('close')">取消</button>
            <button class="prd-btn" :class="danger ? 'prd-btn--danger' : 'prd-btn--primary'" :disabled="busy" @click="emit('confirm')">{{ busy ? '处理中…' : confirmText }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-icon--danger { background: color-mix(in srgb, var(--theme-tone-red) 14%, transparent); border-color: color-mix(in srgb, var(--theme-tone-red) 40%, transparent); color: var(--theme-tone-red); }
</style>
