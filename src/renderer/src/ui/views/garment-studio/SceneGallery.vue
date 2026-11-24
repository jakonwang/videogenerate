<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, LoaderCircle, Plus, Trash2 } from 'lucide-vue-next'
import { SCENE_CATEGORIES, type SceneSwapScene } from '../../../../../shared/sceneSwap'
import SwapImage from './SwapImage.vue'

const props = defineProps<{ scenes: SceneSwapScene[]; selected: string[]; uploading: boolean; manage?: boolean }>()
const emit = defineEmits<{ toggle: [id: string]; upload: []; remove: [scene: SceneSwapScene] }>()
const { t } = useI18n()
const ALL = '全部'
const MINE = '我的场景'
const tab = ref<string>(ALL)
const tabs = [ALL, ...SCENE_CATEGORIES, MINE]
const shown = computed(() => props.scenes.filter((scene) => tab.value === ALL || (tab.value === MINE ? scene.source === 'mine' : scene.source === 'system' && scene.category === tab.value)))
</script>

<template>
  <div class="scenes">
    <div class="scenes__tabs" role="group" :aria-label="t('ai.sceneSwap.stepScenes')">
      <button v-for="name in tabs" :key="name" type="button" :class="{ 'is-on': tab === name }" :aria-pressed="tab === name" @click="tab = name">{{ t(`ai.sceneSwap.category.${name}`) }}</button>
    </div>
    <div class="scenes__grid" :class="{ 'is-manage': manage }">
      <button type="button" class="scene__add" :disabled="uploading" @click="emit('upload')">
        <LoaderCircle v-if="uploading" :size="18" class="vg-spin" /><Plus v-else :size="18" />
        <span>{{ t('ai.sceneSwap.uploadScene') }}</span>
      </button>
      <div v-for="scene in shown" :key="scene.id" class="scene" :class="{ 'is-on': selected.includes(scene.id) }">
        <button type="button" class="scene__pick" :aria-pressed="selected.includes(scene.id)" @click="emit('toggle', scene.id)">
          <span class="scene__img"><SwapImage :file-id="scene.fileId" :alt="scene.name" :width="manage ? 260 : 140" /><i v-if="selected.includes(scene.id)" class="scene__check"><Check :size="12" :stroke-width="3" /></i></span>
          <span class="scene__name">{{ scene.name }}</span>
        </button>
        <button v-if="manage && scene.source === 'mine'" type="button" class="scene__remove" :aria-label="t('ai.sceneSwap.removeScene')" @click="emit('remove', scene)"><Trash2 :size="14" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scenes { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.scenes__tabs { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.scenes__tabs button { padding: 2px 0; border: 0; border-bottom: 1px solid transparent; background: none; color: var(--theme-text-muted); font-size: 12.5px; cursor: pointer; }
.scenes__tabs button:hover { color: var(--theme-text); }
.scenes__tabs button.is-on { border-color: var(--vg-accent); color: var(--theme-text); }
.scenes__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 10px; }
.scenes__grid.is-manage { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 22px 16px; }
.scene { position: relative; min-width: 0; }
.scene__pick { display: block; width: 100%; padding: 0; border: 0; background: none; color: var(--theme-text); text-align: left; cursor: pointer; }
.scene__img { position: relative; display: block; overflow: hidden; border-radius: 6px; }
.scene__img::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px var(--gs-line); pointer-events: none; transition: box-shadow .15s; }
.scene__pick:hover .scene__img::after { box-shadow: inset 0 0 0 1px var(--theme-text-muted); }
.scene.is-on .scene__img::after { box-shadow: inset 0 0 0 2px var(--vg-accent); }
.scene__check { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--vg-accent); color: var(--theme-on-accent); }
.scene__name { display: block; margin-top: 6px; overflow: hidden; color: var(--theme-text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.scene.is-on .scene__name { color: var(--theme-text); }
.scene__add { display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center; align-self: start; width: 100%; aspect-ratio: 3 / 4; padding: 6px; border: 0; border-radius: 6px; background: var(--gs-well); color: var(--theme-text-secondary); font-size: 12px; cursor: pointer; }
.scene__add:hover { background: var(--gs-hover); color: var(--theme-text); }
.scene__remove { position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: rgba(0, 0, 0, .6); color: #fff; cursor: pointer; opacity: 0; }
.scene:hover .scene__remove, .scene__remove:focus-visible { opacity: 1; }
button:focus-visible { outline: 2px solid var(--vg-accent); outline-offset: 2px; }
</style>
