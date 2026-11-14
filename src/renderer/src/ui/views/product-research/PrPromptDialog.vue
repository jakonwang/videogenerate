<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

/** Small reusable dialog for single-value bulk edits (text input, textarea or select). */
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  label?: string
  placeholder?: string
  initialValue?: string
  kind?: 'input' | 'textarea' | 'select'
  options?: { value: string; label: string }[]
  confirmText?: string
  required?: boolean
}>(), { kind: 'input', options: () => [], confirmText: '确定', required: true, initialValue: '' })

const emit = defineEmits<{ close: []; confirm: [value: string] }>()
const value = ref('')
const field = ref<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null)

watch(() => props.open, async (open) => {
  if (!open) return
  value.value = props.initialValue || (props.kind === 'select' ? props.options[0]?.value || '' : '')
  await nextTick()
  field.value?.focus()
})

function submit() {
  if (props.required && !value.value.trim()) return
  emit('confirm', value.value.trim())
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="vg-scope prd-backdrop" @click.self="emit('close')" @keydown.esc="emit('close')">
      <div class="prd-dialog" role="dialog" aria-modal="true">
        <div class="prd-dialog__head">
          <div>
            <h2>{{ title }}</h2>
            <p v-if="description">{{ description }}</p>
          </div>
          <button class="prd-icon-btn" aria-label="关闭" @click="emit('close')"><X :size="16" /></button>
        </div>
        <div class="prd-dialog__body">
          <div class="prd-field">
            <label v-if="label">{{ label }}</label>
            <select v-if="kind === 'select'" ref="field" v-model="value" class="prd-select">
              <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <textarea v-else-if="kind === 'textarea'" ref="field" v-model="value" class="prd-textarea" rows="4" :placeholder="placeholder" />
            <input v-else ref="field" v-model="value" class="prd-input" :placeholder="placeholder" @keyup.enter="submit" />
          </div>
        </div>
        <div class="prd-dialog__foot">
          <div class="prd-dialog__foot-actions">
            <button class="prd-btn prd-btn--outline" @click="emit('close')">取消</button>
            <button class="prd-btn prd-btn--primary" :disabled="required && !value.trim()" @click="submit">{{ confirmText }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
