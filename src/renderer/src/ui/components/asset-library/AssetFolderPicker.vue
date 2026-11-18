<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronRight, Folder, FolderInput, FolderOpen, X } from 'lucide-vue-next'
import type { AssetFolder } from '../../../../../shared/assetLibrary'

const props = defineProps<{
  title: string
  subtitle?: string
  confirmText: string
  folders: AssetFolder[]
  /** Folders that cannot be chosen (e.g. the folder being moved and its descendants). */
  disabledIds?: Set<string>
  initialId?: string | null
}>()
const emit = defineEmits<{ close: []; pick: [folderId: string | null] }>()

const selected = ref<string | null>(props.initialId ?? null)
const collapsed = ref(new Set<string>())

const rows = computed(() => {
  const children = new Map<string | null, AssetFolder[]>()
  for (const folder of props.folders) {
    const list = children.get(folder.parentId) || []
    list.push(folder)
    children.set(folder.parentId, list)
  }
  const out: Array<{ folder: AssetFolder; depth: number; hasChildren: boolean }> = []
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of (children.get(parentId) || []).sort((a, b) => a.name.localeCompare(b.name))) {
      const hasChildren = Boolean(children.get(folder.id)?.length)
      out.push({ folder, depth, hasChildren })
      if (hasChildren && !collapsed.value.has(folder.id)) walk(folder.id, depth + 1)
    }
  }
  walk(null, 1)
  return out
})

function toggle(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  collapsed.value = next
}
</script>

<template>
  <div class="vg-backdrop" @click.self="emit('close')">
    <section class="vg-dialog picker" role="dialog" aria-modal="true" :aria-label="title">
      <header class="vg-dialog__head">
        <div class="vg-dialog__title">
          <span class="vg-dialog__title-icon"><FolderInput :size="20" /></span>
          <div><h2>{{ title }}</h2><p v-if="subtitle">{{ subtitle }}</p></div>
        </div>
        <button type="button" class="vg-icon-btn" aria-label="关闭" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="picker__list">
        <button type="button" class="picker__row" :class="{ 'is-active': selected === null }" @click="selected = null" @dblclick="emit('pick', null)">
          <span class="picker__twisty" /><FolderOpen :size="16" class="picker__root-icon" /><span class="picker__name">素材库（根目录）</span><Check v-if="selected === null" :size="15" class="picker__check" />
        </button>
        <button
          v-for="row in rows"
          :key="row.folder.id"
          type="button"
          class="picker__row"
          :class="{ 'is-active': selected === row.folder.id }"
          :disabled="disabledIds?.has(row.folder.id)"
          :style="{ paddingLeft: `${8 + row.depth * 16}px` }"
          @click="selected = row.folder.id"
          @dblclick="emit('pick', row.folder.id)"
        >
          <span class="picker__twisty" :class="{ 'is-open': !collapsed.has(row.folder.id) }" @click.stop="row.hasChildren && toggle(row.folder.id)"><ChevronRight v-if="row.hasChildren" :size="13" /></span>
          <Folder :size="16" class="picker__folder-icon" /><span class="picker__name">{{ row.folder.name }}</span><Check v-if="selected === row.folder.id" :size="15" class="picker__check" />
        </button>
        <p v-if="!rows.length" class="picker__hint">还没有文件夹，素材会放在根目录。</p>
      </div>
      <footer class="vg-dialog__foot">
        <div class="vg-dialog__foot-actions">
          <button type="button" class="vg-btn" @click="emit('close')">取消</button>
          <button type="button" class="vg-btn vg-btn--primary" @click="emit('pick', selected)">{{ confirmText }}</button>
        </div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.picker { max-width: 460px; }
.picker__list { display: flex; flex-direction: column; gap: 1px; height: 340px; padding: 8px; overflow-y: auto; }
.picker__row { display: flex; align-items: center; gap: 6px; width: 100%; height: 32px; padding: 0 10px 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--theme-text); font-size: 13px; text-align: left; cursor: pointer; }
.picker__row:hover:not(:disabled) { background: var(--theme-panel-soft); }
.picker__row.is-active { background: var(--vg-accent-soft); color: var(--vg-accent); font-weight: 600; }
.picker__row:disabled { opacity: .38; cursor: not-allowed; }
.picker__twisty { display: grid; place-items: center; width: 16px; height: 16px; flex-shrink: 0; color: var(--theme-text-muted); transition: transform .15s; }
.picker__twisty.is-open { transform: rotate(90deg); }
.picker__folder-icon { color: var(--vg-amber); flex-shrink: 0; }
.picker__root-icon { color: var(--vg-accent); flex-shrink: 0; }
.picker__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picker__check { color: var(--vg-accent); flex-shrink: 0; }
.picker__hint { padding: 16px 8px; font-size: 12px; color: var(--theme-text-muted); text-align: center; }
</style>
