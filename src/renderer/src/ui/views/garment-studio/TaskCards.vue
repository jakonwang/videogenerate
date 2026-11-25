<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ChevronRight, Image, Mountain, Package, PackageCheck, Shirt, UserRound, UserRoundCheck } from 'lucide-vue-next'
import type { SceneSwapTask } from '../../../../../shared/sceneSwap'

/** 功能入口：图标画出「从什么变成什么」 */
defineProps<{ task: SceneSwapTask; tasks: readonly SceneSwapTask[] }>()
const emit = defineEmits<{ pick: [task: SceneSwapTask] }>()
const { t } = useI18n()
const ICONS = { tryon: [Shirt, UserRoundCheck], model: [UserRound, UserRoundCheck], scene: [Image, Mountain], product: [Package, PackageCheck] }
</script>

<template>
  <div class="tasks" role="group">
    <button v-for="name in tasks" :key="name" type="button" class="task" :class="{ 'is-on': task === name }" :aria-pressed="task === name" :data-testid="`task-${name}`" @click="emit('pick', name)">
      <span class="task__icons"><i><component :is="ICONS[name][0]" :size="20" /></i><ChevronRight :size="14" /><i class="is-after"><component :is="ICONS[name][1]" :size="20" /></i></span>
      <span class="task__text"><strong>{{ t(`ai.sceneSwap.task.${name}.name`) }}</strong><small>{{ t(`ai.sceneSwap.task.${name}.hint`) }}</small></span>
    </button>
  </div>
</template>

<style scoped>
.tasks { display: grid; flex-shrink: 0; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.task { display: flex; gap: 14px; align-items: center; min-width: 0; padding: 12px 14px; border: 1px solid var(--gs-line); border-radius: 12px; background: linear-gradient(135deg, var(--gs-well), var(--gs-panel)); color: var(--theme-text); text-align: left; cursor: pointer; transition: border-color .15s; }
.task:hover { border-color: var(--theme-text-muted); }
.task.is-on { border-color: var(--vg-accent); background: linear-gradient(135deg, color-mix(in srgb, var(--vg-accent) 18%, var(--gs-panel)), var(--gs-panel)); }
.task__icons { display: flex; flex-shrink: 0; gap: 4px; align-items: center; color: var(--theme-text-muted); }
.task__icons i { display: grid; place-items: center; width: 38px; height: 46px; border-radius: 8px; background: var(--gs-hover); color: var(--theme-text-secondary); }
.task__icons i.is-after { background: color-mix(in srgb, var(--vg-accent) 20%, transparent); color: var(--vg-accent); }
.task__text { min-width: 0; }
.task strong { display: block; font-size: 15px; font-weight: 600; }
.task small { color: var(--theme-text-muted); font-size: 12px; line-height: 1.5; }
.task:focus-visible { outline: 2px solid var(--vg-accent); outline-offset: 2px; }
@media (max-width: 1280px) { .tasks { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .tasks { grid-template-columns: 1fr; } }
</style>
