<script setup lang="ts">
/**
 * 复刻项目页顶部的步骤条（网页版）：和电脑端主窗口顶栏里的「任务列表 · 1 参考分析 … 6 成片合成」相同，
 * 读同一个 cloneTopbar store，点步骤由电脑端复刻页面切换。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Check } from 'lucide-vue-next'
import { useCloneTopbarStore } from '@desktop-src/stores/cloneTopbar'

const router = useRouter()
const cloneTopbar = useCloneTopbarStore()
const visible = computed<boolean>(() => cloneTopbar.visible)
const items = computed<Array<{ key: string; title: string; desc: string; done: boolean; active: boolean }>>(() => cloneTopbar.items)
</script>

<template>
  <div v-if="visible && items.length" class="cwf-shell">
    <nav class="vg-scope cwf" aria-label="clone workflow">
      <button type="button" class="cwf-back" title="任务列表" @click="router.push('/clone')">
        <ArrowLeft class="cwf-back__icon" />
        <span>任务列表</span>
      </button>
      <span class="cwf-divider" />
      <ol class="cwf-steps">
        <li v-for="(item, index) in items" :key="item.key" class="cwf-steps__item">
          <button class="cwf-step" :class="{ 'is-done': item.done, 'is-active': item.active }" type="button" :title="item.desc || item.title" :aria-current="item.active ? 'step' : undefined" @click="cloneTopbar.requestStage(item.key)">
            <span class="cwf-step__index">
              <Check v-if="item.done && !item.active" class="cwf-step__check" />
              <template v-else>{{ index + 1 }}</template>
            </span>
            <span class="cwf-step__label">{{ item.title }}</span>
          </button>
          <span v-if="index < items.length - 1" class="cwf-line" :class="{ 'is-done': item.done }" />
        </li>
      </ol>
    </nav>
  </div>
</template>

<style scoped>
/* Same as the desktop MainLayout clone workflow top bar. */
.cwf-shell { padding: 8px 16px 0; }
.cwf { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 6px 14px 6px 8px; border: 1px solid var(--theme-border); border-radius: var(--vg-radius-lg, 14px); background: var(--theme-panel); }
.cwf-back { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px 0 8px; border: 0; border-radius: 9px; background: transparent; color: var(--theme-text-secondary); font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s, color .15s; }
.cwf-back:hover { background: var(--theme-panel-soft); color: var(--theme-text); }
.cwf-back__icon { width: 16px; height: 16px; }
.cwf-divider { width: 1px; height: 22px; background: var(--theme-divider); flex-shrink: 0; }
.cwf-steps { display: flex; align-items: center; flex: 1; min-width: 0; margin: 0; padding: 0; list-style: none; }
.cwf-steps__item { display: flex; align-items: center; flex: 1 1 0; min-width: 0; }
.cwf-steps__item:last-child { flex: 0 0 auto; }
.cwf-step { display: inline-flex; align-items: center; gap: 8px; min-width: 0; height: 36px; padding: 0 12px 0 6px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--theme-text-muted); cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
.cwf-step:hover { background: var(--theme-panel-soft); color: var(--theme-text); }
.cwf-step__index { display: grid; place-items: center; width: 24px; height: 24px; flex-shrink: 0; border: 1.5px solid var(--theme-border-control); border-radius: 50%; font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; transition: all .15s; }
.cwf-step__check { width: 13px; height: 13px; stroke-width: 3; }
.cwf-step__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
.cwf-step.is-done { color: var(--theme-text-secondary); }
.cwf-step.is-done .cwf-step__index { border-color: transparent; background: var(--vg-accent-soft); color: var(--vg-accent); }
.cwf-step.is-active { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); color: var(--theme-text); }
.cwf-step.is-active .cwf-step__index { border-color: var(--vg-accent); background: var(--vg-accent); color: var(--theme-on-accent); box-shadow: 0 0 0 4px var(--vg-accent-soft); }
.cwf-step.is-active .cwf-step__label { font-weight: 700; }
.cwf-line { flex: 1; min-width: 12px; height: 2px; margin: 0 6px; border-radius: 2px; background: var(--theme-divider); }
.cwf-line.is-done { background: color-mix(in srgb, var(--vg-accent) 55%, transparent); }
@media (max-width: 1280px) {
  .cwf-back span { display: none; }
  .cwf-step:not(.is-active) .cwf-step__label { display: none; }
  .cwf-step { padding-right: 6px; }
}
</style>
