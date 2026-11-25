<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, LoaderCircle, Plus, Trash2 } from 'lucide-vue-next'
import { MODEL_BODIES, MODEL_GENDERS, MODEL_SKINS, type SwapModel } from '../../../../../shared/sceneSwap'
import SwapImage from './SwapImage.vue'

/** 选模特：右侧面板里只按来源筛；模特库页面（manage）多性别、肤色、身材 */
const props = defineProps<{ models: SwapModel[]; selected: string; uploading: boolean; manage?: boolean }>()
const emit = defineEmits<{ pick: [id: string]; upload: []; remove: [model: SwapModel] }>()
const { t } = useI18n()
const k = (key: string) => t(`ai.sceneSwap.${key}`)

type Filter = 'source' | 'gender' | 'skin' | 'body'
const filters = ref<Record<Filter, string>>({ source: '', gender: '', skin: '', body: '' })
const rows: Array<{ key: Filter; options: readonly string[] }> = [
  { key: 'source', options: ['system', 'own'] },
  { key: 'gender', options: MODEL_GENDERS },
  { key: 'skin', options: MODEL_SKINS },
  { key: 'body', options: MODEL_BODIES },
]
const shown = computed(() =>
  props.models.filter((model) => {
    const { source, gender, skin, body } = filters.value
    if (source && (source === 'system') !== (model.source === 'system')) return false
    return (!gender || model.gender === gender) && (!skin || model.skin === skin) && (!body || model.body === body)
  }),
)
</script>

<template>
  <div class="models">
    <div v-for="row in manage ? rows : rows.slice(0, 2)" :key="row.key" class="models__tabs" role="group" :aria-label="k(`modelFilter.${row.key}`)">
      <button v-for="option in ['', ...row.options]" :key="option" type="button" :class="{ 'is-on': filters[row.key] === option }" :aria-pressed="filters[row.key] === option" @click="filters[row.key] = option">{{ option ? k(`modelOption.${option}`) : k(`modelFilter.${row.key}`) }}</button>
    </div>
    <div class="models__grid" :class="{ 'is-manage': manage }">
      <button type="button" class="model__add" :disabled="uploading" @click="emit('upload')">
        <LoaderCircle v-if="uploading" :size="18" class="vg-spin" /><Plus v-else :size="18" />
        <span>{{ k('uploadModel') }}</span><small>{{ k('modelRights') }}</small>
      </button>
      <div v-for="model in shown" :key="model.id" class="model" :class="{ 'is-on': selected === model.id }">
        <button type="button" class="model__pick" :aria-pressed="selected === model.id" @click="emit('pick', model.id)">
          <span class="model__img"><SwapImage :file-id="model.fileId" :alt="model.name" :width="manage ? 260 : 140" /><i v-if="selected === model.id" class="model__check"><Check :size="12" :stroke-width="3" /></i></span>
          <span class="model__name">{{ model.name }}</span>
        </button>
        <button v-if="manage && model.source === 'mine'" type="button" class="model__remove" :aria-label="k('removeModel')" @click="emit('remove', model)"><Trash2 :size="14" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.models { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.models__tabs { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.models__tabs button { padding: 2px 0; border: 0; border-bottom: 1px solid transparent; background: none; color: var(--theme-text-muted); font-size: 12.5px; cursor: pointer; }
.models__tabs button:hover { color: var(--theme-text); }
.models__tabs button.is-on { border-color: var(--vg-accent); color: var(--theme-text); }
.models__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 10px; max-height: 330px; overflow: auto; }
.models__grid.is-manage { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 22px 16px; max-height: none; overflow: visible; }
.model { position: relative; min-width: 0; }
.model__pick { display: block; width: 100%; padding: 0; border: 0; background: none; color: var(--theme-text); text-align: left; cursor: pointer; }
.model__img { position: relative; display: block; overflow: hidden; border-radius: 6px; }
.model__img::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px var(--gs-line); pointer-events: none; transition: box-shadow .15s; }
.model__pick:hover .model__img::after { box-shadow: inset 0 0 0 1px var(--theme-text-muted); }
.model.is-on .model__img::after { box-shadow: inset 0 0 0 2px var(--vg-accent); }
.model__check { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--vg-accent); color: var(--theme-on-accent); }
.model__name { display: block; margin-top: 6px; overflow: hidden; color: var(--theme-text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.model.is-on .model__name { color: var(--theme-text); }
.model__add { display: flex; flex-direction: column; gap: 6px; align-items: center; justify-content: center; align-self: start; width: 100%; aspect-ratio: 3 / 4; padding: 6px; border: 0; border-radius: 6px; background: var(--gs-well); color: var(--theme-text-secondary); font-size: 12px; cursor: pointer; }
.model__add small { color: var(--theme-text-muted); font-size: 11px; line-height: 1.4; }
.model__add:hover { background: var(--gs-hover); color: var(--theme-text); }
.model__remove { position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 6px; background: rgba(0, 0, 0, .6); color: #fff; cursor: pointer; opacity: 0; }
.model:hover .model__remove, .model__remove:focus-visible { opacity: 1; }
button:focus-visible { outline: 2px solid var(--vg-accent); outline-offset: 2px; }
</style>
