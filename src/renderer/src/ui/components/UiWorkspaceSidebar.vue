<script setup lang="ts">
type WorkspaceNavItem = {
  key: string
  label: string
}

const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    modelValue: string
    items: WorkspaceNavItem[]
    footerText?: string
  }>(),
  {
    subtitle: '',
    footerText: '',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function setActive(key: string) {
  if (key === props.modelValue) return
  emit('update:modelValue', key)
}
</script>

<template>
  <section class="ds-workspace-switcher">
    <div class="min-w-0">
      <div class="text-xs font-black text-slate-100">{{ title }}</div>
      <div v-if="subtitle" class="mt-1 truncate text-[11px] text-slate-500">{{ subtitle }}</div>
    </div>

    <div class="ds-workspace-switcher__tabs">
      <button
        v-for="item in items"
        :key="item.key"
        class="ds-workspace-switcher__tab"
        :class="{ 'is-active': modelValue === item.key }"
        @click="setActive(item.key)"
      >
        {{ item.label }}
      </button>
    </div>

    <div v-if="footerText" class="hidden max-w-[340px] truncate text-[11px] text-slate-500 2xl:block">
      {{ footerText }}
    </div>
  </section>
</template>
