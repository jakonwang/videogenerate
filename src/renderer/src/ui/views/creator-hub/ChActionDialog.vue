<script setup lang="ts">
import { ref, watch } from 'vue'
import { AlertTriangle, Pencil, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

/** Confirmation dialog with an optional single text input (rename). */
const props = withDefaults(defineProps<{ open: boolean; title: string; message?: string; confirmText: string; danger?: boolean; input?: string | null; busy?: boolean }>(), {
  message: '', danger: false, input: null, busy: false,
})
const emit = defineEmits<{ close: []; confirm: [value: string] }>()
const { t } = useI18n()
const value = ref('')

watch(() => props.open, (open) => { if (open) value.value = props.input ?? '' })

function confirm() {
  if (props.input != null && !value.value.trim()) return
  emit('confirm', value.value.trim())
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="vg-scope vg-backdrop" @click.self="!busy && emit('close')">
      <div class="vg-dialog" role="alertdialog" aria-modal="true">
        <div class="vg-dialog__head">
          <div class="vg-dialog__title">
            <span class="vg-dialog__title-icon"><AlertTriangle v-if="danger" :size="19" /><Pencil v-else :size="19" /></span>
            <div>
              <h2>{{ title }}</h2>
              <p v-if="message">{{ message }}</p>
            </div>
          </div>
          <button class="vg-icon-btn" :disabled="busy" :aria-label="t('creatorHub.actions.close')" @click="emit('close')"><X :size="16" /></button>
        </div>
        <div v-if="input != null" class="vg-dialog__body">
          <input v-model="value" class="vg-input" maxlength="80" autofocus @keyup.enter="confirm" />
        </div>
        <div class="vg-dialog__foot">
          <div class="vg-dialog__foot-actions">
            <button class="vg-btn vg-btn--outline" :disabled="busy" @click="emit('close')">{{ t('creatorHub.actions.cancel') }}</button>
            <button class="vg-btn" :class="danger ? 'vg-btn--danger' : 'vg-btn--primary'" :disabled="busy || (input != null && !value.trim())" @click="confirm">{{ confirmText }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
