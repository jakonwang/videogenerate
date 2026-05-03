<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue?: string | number
    label?: string
    placeholder?: string
    type?: string
    multiline?: boolean
    rows?: number
    disabled?: boolean
  }>(),
  {
    type: 'text',
    rows: 4,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}
</script>

<template>
  <label class="ds-field">
    <span v-if="label" class="ds-field__label">{{ label }}</span>
    <textarea
      v-if="multiline"
      class="ds-input ds-input--textarea"
      :rows="rows"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
    />
    <input
      v-else
      class="ds-input"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="onInput"
    />
  </label>
</template>
