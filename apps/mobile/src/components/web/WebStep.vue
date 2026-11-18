<script setup lang="ts">
/** Numbered step card of the desktop plugin pages (① title · subtitle, meta on the right). */
defineProps<{ index?: number | string; title: string; subtitle?: string; meta?: string }>()
</script>

<template>
  <section class="ws-step">
    <header class="ws-step__head">
      <span v-if="index !== undefined" class="ws-step__num">{{ index }}</span>
      <div class="ws-step__title">
        <strong>{{ title }}</strong>
        <small v-if="subtitle">{{ subtitle }}</small>
      </div>
      <span v-if="meta" class="ws-step__meta">{{ meta }}</span>
      <slot name="head" />
    </header>
    <div class="ws-step__body"><slot /></div>
    <footer v-if="$slots.foot" class="ws-step__foot"><slot name="foot" /></footer>
  </section>
</template>

<style scoped>
.ws-step { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-lg, 14px); background: var(--theme-panel); }
.ws-step__head { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px 10px; }
.ws-step__num { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; flex-shrink: 0; margin-top: 1px; border-radius: 50%; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); font-size: 12px; font-weight: 800; }
.ws-step__title { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.ws-step__title strong { font-size: 14px; font-weight: 700; }
.ws-step__title small { font-size: 11.5px; color: var(--theme-text-muted); }
.ws-step__meta { flex-shrink: 0; font-size: 11.5px; color: var(--theme-text-muted); }
.ws-step__body { display: flex; flex-direction: column; gap: 12px; padding: 4px 16px 16px; flex: 1; min-width: 0; }
.ws-step__foot { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--theme-divider); }
</style>
