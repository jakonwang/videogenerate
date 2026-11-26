<script setup lang="ts">
/**
 * 模型选择器：按平台分组、可搜索、显示平台色块，和管理后台的 ModelSelect（apps/web-next/components/admin/model-select.tsx）同一套样子。
 * 也可以当普通下拉用（不传 groups 只传 items，关掉搜索），例如时长、清晰度。
 * 键盘：↑↓ 移动、Enter 选中、Esc 关闭；点外面关闭。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Check, ChevronDown, Search } from 'lucide-vue-next'

export type UiModelSelectItem = { value: string; label: string; meta?: string }
export type UiModelSelectGroup = { key: string; title: string; ready?: boolean; items: UiModelSelectItem[] }

const props = withDefaults(
  defineProps<{
    modelValue: string
    groups?: UiModelSelectGroup[]
    /** 不分组时直接给选项 */
    items?: UiModelSelectItem[]
    placeholder?: string
    searchable?: boolean
    disabled?: boolean
    /** 收起时的副标题（不分组时用） */
    caption?: string
  }>(),
  { groups: () => [], items: () => [], placeholder: '请选择', searchable: false, disabled: false, caption: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string] }>()

const TONES: Record<string, string> = { grsai: 'tone-a', gaorui: 'tone-b', xibapi: 'tone-c', ai666: 'tone-d' }
const toneOf = (key: string) => TONES[key] ?? 'tone-d'

const open = ref(false)
const query = ref('')
const active = ref(0)
const root = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const list = ref<HTMLElement | null>(null)

const allGroups = computed<UiModelSelectGroup[]>(() => (props.groups.length ? props.groups : [{ key: '', title: '', items: props.items }]))
const selected = computed(() => {
  for (const group of allGroups.value) {
    const item = group.items.find((entry) => entry.value === props.modelValue)
    if (item) return { item, group }
  }
  return undefined
})
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return allGroups.value
    .map((group) => ({ ...group, items: group.items.filter((item) => !q || [item.label, item.meta, group.title].some((text) => String(text || '').toLowerCase().includes(q))) }))
    .filter((group) => group.items.length)
})
const flat = computed(() => filtered.value.flatMap((group) => group.items))
const indexOf = (item: UiModelSelectItem) => flat.value.indexOf(item)

function toggle() {
  if (props.disabled) return
  open.value = !open.value
}
function choose(item: UiModelSelectItem) {
  emit('update:modelValue', item.value)
  emit('change', item.value)
  open.value = false
}
function onKeydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'Escape') open.value = false
  else if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = Math.min(flat.value.length - 1, active.value + 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = Math.max(0, active.value - 1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = flat.value[active.value]
    if (item) choose(item)
  }
}
function onDocDown(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false
}

watch(open, async (value) => {
  if (value) {
    query.value = ''
    const index = flat.value.findIndex((item) => item.value === props.modelValue)
    active.value = index >= 0 ? index : 0
    document.addEventListener('mousedown', onDocDown)
    await nextTick()
    searchInput.value?.focus()
    list.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' })
  } else {
    document.removeEventListener('mousedown', onDocDown)
  }
})
watch(active, async (value) => {
  await nextTick()
  list.value?.querySelector<HTMLElement>(`[data-index="${value}"]`)?.scrollIntoView({ block: 'nearest' })
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocDown))
</script>

<template>
  <div ref="root" class="ums" :class="{ 'is-open': open, 'is-disabled': disabled }" @keydown="onKeydown">
    <button type="button" class="ums-trigger" :disabled="disabled" aria-haspopup="listbox" :aria-expanded="open" @click="toggle">
      <span v-if="selected?.group.key" class="ums-mark" :class="toneOf(selected.group.key)">{{ selected.group.title.slice(0, 1) }}</span>
      <span class="ums-trigger__text">
        <b>{{ selected ? selected.item.label : placeholder }}</b>
        <small v-if="selected?.group.title">{{ selected.group.title }}</small>
        <small v-else-if="caption">{{ caption }}</small>
      </span>
      <ChevronDown :size="15" class="ums-trigger__chev" />
    </button>
    <div v-if="open" class="ums-panel" role="listbox">
      <label v-if="searchable" class="ums-search">
        <Search :size="14" />
        <input ref="searchInput" v-model="query" placeholder="搜索模型或平台" @input="active = 0" />
      </label>
      <div ref="list" class="ums-list">
        <div v-for="group in filtered" :key="group.key || 'all'" class="ums-group">
          <div v-if="group.title" class="ums-group__head">
            <span class="ums-mark ums-mark--sm" :class="toneOf(group.key)">{{ group.title.slice(0, 1) }}</span>
            <span>{{ group.title }}</span>
            <em v-if="group.ready === false">未接入</em>
          </div>
          <button
            v-for="item in group.items"
            :key="item.value"
            type="button"
            role="option"
            class="ums-item"
            :class="{ 'is-active': indexOf(item) === active, 'is-selected': item.value === modelValue, 'is-flat': !group.title }"
            :data-index="indexOf(item)"
            :aria-selected="item.value === modelValue"
            @mouseenter="active = indexOf(item)"
            @click="choose(item)"
          >
            <span class="ums-item__label">{{ item.label }}</span>
            <span v-if="item.meta" class="ums-item__meta">{{ item.meta }}</span>
            <span class="ums-item__check"><Check v-if="item.value === modelValue" :size="14" /></span>
          </button>
        </div>
        <div v-if="!flat.length" class="ums-none">没有匹配的选项</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ums { position: relative; min-width: 0; }
.ums-trigger { display: flex; align-items: center; gap: 10px; width: 100%; height: 44px; padding: 0 12px 0 8px; border: 1px solid var(--theme-border-control); border-radius: 10px; background: var(--theme-input); color: var(--theme-text); text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.ums-trigger:hover:not(:disabled) { border-color: color-mix(in srgb, var(--vg-accent) 55%, var(--theme-border-control)); }
.ums.is-open .ums-trigger { border-color: var(--vg-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--vg-accent) 18%, transparent); }
.ums-trigger:disabled { cursor: default; opacity: .7; }
.ums-trigger__text { display: grid; flex: 1; min-width: 0; padding-left: 4px; line-height: 1.2; }
.ums-trigger__text b { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ums-trigger__text small { font-size: 11px; color: var(--theme-text-muted); }
.ums-trigger__chev { flex: none; color: var(--theme-text-muted); transition: transform .15s; }
.ums.is-open .ums-trigger__chev { transform: rotate(180deg); color: var(--vg-accent); }
.ums-mark { flex: none; display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 7px; font-size: 12px; font-weight: 700; color: var(--ums-tone); background: color-mix(in srgb, var(--ums-tone) 16%, transparent); border: 1px solid color-mix(in srgb, var(--ums-tone) 35%, transparent); }
.ums-mark--sm { width: 20px; height: 20px; border-radius: 5px; font-size: 10px; }
.tone-a { --ums-tone: var(--vg-accent); }
.tone-b { --ums-tone: var(--vg-blue); }
.tone-c { --ums-tone: var(--vg-amber); }
.tone-d { --ums-tone: var(--vg-violet); }
.ums-panel { position: absolute; z-index: 60; top: calc(100% + 6px); left: 0; width: max(100%, 340px); border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); box-shadow: var(--theme-shadow-float); overflow: hidden; animation: ums-in .12s ease-out; }
@keyframes ums-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.ums-search { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-bottom: 1px solid var(--theme-divider); color: var(--theme-text-muted); }
.ums-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--theme-text); font-size: 13px; }
.ums-list { max-height: 320px; overflow-y: auto; padding: 6px; }
.ums-group + .ums-group { margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--theme-divider); }
.ums-group__head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 6px; font-size: 12px; font-weight: 600; color: var(--theme-text-secondary); }
.ums-group__head em { margin-left: auto; font-style: normal; font-size: 11px; font-weight: 500; padding: 1px 7px; border-radius: 999px; background: var(--theme-control); color: var(--theme-text-muted); }
.ums-item { display: grid; grid-template-columns: minmax(0, 1fr) auto 18px; align-items: center; gap: 10px; width: 100%; min-height: 34px; padding: 0 10px 0 36px; border: 0; border-radius: 8px; background: transparent; color: var(--theme-text); font-size: 13px; text-align: left; cursor: pointer; }
.ums-item.is-flat { padding-left: 10px; }
.ums-item.is-active { background: var(--theme-control-hover); }
.ums-item.is-selected { color: var(--vg-accent); font-weight: 600; }
.ums-item__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ums-item__meta { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; color: var(--theme-text-muted); white-space: nowrap; }
.ums-item__check { display: inline-grid; place-items: center; color: var(--vg-accent); }
.ums-none { padding: 18px; text-align: center; font-size: 13px; color: var(--theme-text-muted); }
</style>
