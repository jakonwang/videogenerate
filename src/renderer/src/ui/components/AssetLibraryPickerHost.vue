<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Images, Search, X } from 'lucide-vue-next'
import type { AssetPickerOptions, AssetPickerResult } from '@/lib/assetLibraryPicker'

type Item = AssetPickerResult[number]
const { locale, t } = useI18n()
const open = ref(false)
const loading = ref(false)
const items = ref<Item[]>([])
const thumbnails = ref<Record<string, string>>({})
const selected = ref<string[]>([])
const query = ref('')
const type = ref<AssetPickerOptions['type']>('all')
const requestedType = ref<AssetPickerOptions['type']>('all')
const multiple = ref(true)
const usagePlugin = ref('')
const usageFilter = ref<'all' | 'used' | 'unused'>('all')
const usageBusyId = ref('')
const errorText = ref('')
let resolveRequest: ((items: AssetPickerResult | null) => void) | null = null

const copy = computed(() => {
  if (locale.value === 'zh-CN') return {
    title: '\u4ece\u7d20\u6750\u5e93\u9009\u62e9', close: '\u5173\u95ed', search: '\u641c\u7d22\u7d20\u6750\u540d\u79f0', all: '\u5168\u90e8', image: '\u56fe\u7247', video: '\u89c6\u9891',
    used: '\u5df2\u4f7f\u7528', unused: '\u672a\u4f7f\u7528', selected: '\u9879\u5df2\u9009\u62e9', empty: '\u7d20\u6750\u5e93\u4e2d\u6ca1\u6709\u7b26\u5408\u6761\u4ef6\u7684\u9879\u76ee', dialog: '\u9009\u62e9\u7d20\u6750',
  }
  if (locale.value === 'vi-VN') return {
    title: 'Chon tu thu vien', close: 'Dong', search: 'Tim theo ten', all: 'Tat ca', image: 'Hinh anh', video: 'Video',
    used: 'Da dung', unused: 'Chua dung', selected: 'muc da chon', empty: 'Khong co muc phu hop', dialog: 'Chon tai lieu',
  }
  return {
    title: 'Choose from Asset Library', close: 'Close', search: 'Search asset names', all: 'All', image: 'Images', video: 'Videos',
    used: 'Used', unused: 'Unused', selected: 'selected', empty: 'No matching assets found', dialog: 'Choose assets',
  }
})

const displayedItems = computed(() => items.value.filter((item) => {
  if (!usagePlugin.value || usageFilter.value === 'all') return true
  return (item.pluginUsage?.[usagePlugin.value] || 'unused') === usageFilter.value
}))

async function load() {
  loading.value = true
  try {
    items.value = await window.api.assetLibrary.list({ query: query.value, type: type.value || 'all' }) as Item[]
    await Promise.all(items.value.filter((item) => !thumbnails.value[item.id]).map(async (item) => {
      try { thumbnails.value[item.id] = await window.api.assetLibrary.thumbnail(item.id) as string }
      catch { /* Keep the media placeholder when thumbnail generation fails. */ }
    }))
  } finally { loading.value = false }
}

function handleRequest(event: Event) {
  const detail = (event as CustomEvent<{ options: AssetPickerOptions; resolve: (items: AssetPickerResult | null) => void }>).detail
  resolveRequest?.(null)
  resolveRequest = detail.resolve
  requestedType.value = detail.options.type || 'all'
  type.value = requestedType.value
  multiple.value = detail.options.multiple !== false
  usagePlugin.value = String(detail.options.usagePlugin || '')
  usageFilter.value = 'all'
  errorText.value = ''
  query.value = ''
  selected.value = []
  open.value = true
  void load()
}

function toggle(item: Item) {
  if (!multiple.value) { selected.value = [item.id]; return }
  selected.value = selected.value.includes(item.id) ? selected.value.filter((id) => id !== item.id) : [...selected.value, item.id]
}

async function setUsageStatus(item: Item, usageStatus: 'used' | 'unused') {
  if (!usagePlugin.value || usageBusyId.value) return
  usageBusyId.value = item.id
  errorText.value = ''
  try {
    const updated = await window.api.assetLibrary.updateUsageStatus({ id: item.id, pluginId: usagePlugin.value, usageStatus }) as Item
    items.value = items.value.map((candidate) => candidate.id === item.id ? updated : candidate)
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    usageBusyId.value = ''
  }
}

async function finish(accept: boolean) {
  const result = accept ? items.value.filter((item) => selected.value.includes(item.id)) : null
  if (result && usagePlugin.value) {
    usageBusyId.value = 'confirm'
    errorText.value = ''
    try {
      const updatedItems: Item[] = []
      for (const item of result) {
        updatedItems.push(await window.api.assetLibrary.updateUsageStatus({ id: item.id, pluginId: usagePlugin.value, usageStatus: 'used' }) as Item)
      }
      resolveRequest?.(updatedItems)
    } catch (error: any) {
      errorText.value = error?.message ?? String(error)
      usageBusyId.value = ''
      return
    }
    usageBusyId.value = ''
  } else {
    resolveRequest?.(result)
  }
  resolveRequest = null
  open.value = false
}

onMounted(() => window.addEventListener('asset-library:pick', handleRequest))
onUnmounted(() => {
  window.removeEventListener('asset-library:pick', handleRequest)
  resolveRequest?.(null)
})
</script>

<template>
  <div v-if="open" class="asset-picker-backdrop" @click.self="finish(false)">
    <section class="asset-picker" data-testid="asset-library-picker" role="dialog" aria-modal="true" :aria-label="copy.dialog">
      <header><div><Images :size="18" /><strong>{{ copy.title }}</strong></div><button type="button" :aria-label="copy.close" @click="finish(false)"><X :size="18" /></button></header>
      <label class="asset-picker-search"><Search :size="16" /><input v-model="query" :placeholder="copy.search" @input="load"></label>
      <div class="asset-picker-filter-groups">
        <div v-if="requestedType === 'all'" class="asset-picker-filters"><button v-for="option in ([['all',copy.all],['image',copy.image],['video',copy.video]] as const)" :key="option[0]" type="button" :class="{ active: type === option[0] }" @click="type = option[0]; load()">{{ option[1] }}</button></div>
        <div v-if="usagePlugin" class="asset-picker-filters asset-picker-filters--usage"><button v-for="option in ([['all',copy.all],['unused',copy.unused],['used',copy.used]] as const)" :key="option[0]" type="button" :data-testid="`asset-picker-usage-filter-${option[0]}`" :class="{ active: usageFilter === option[0] }" @click="usageFilter = option[0]">{{ option[1] }}</button></div>
      </div>
      <div class="asset-picker-grid">
        <article v-for="item in displayedItems" :key="item.id" class="asset-picker-item" :class="{ selected: selected.includes(item.id) }">
          <button class="asset-picker-select" :data-testid="`asset-picker-select-${item.id}`" type="button" @click="toggle(item)">
            <img v-if="thumbnails[item.id]" :src="thumbnails[item.id]" :alt="item.name" />
            <span v-else class="asset-picker-placeholder">{{ item.type === 'image' ? copy.image : copy.video }}</span>
            <span class="asset-picker-name">{{ item.name }}</span><Check v-if="selected.includes(item.id)" class="asset-picker-check" :size="17" />
          </button>
          <button v-if="usagePlugin" class="asset-picker-usage" :data-testid="`asset-picker-usage-${item.id}`" :class="{ used: item.pluginUsage?.[usagePlugin] === 'used' }" type="button" :disabled="Boolean(usageBusyId)" @click="setUsageStatus(item, item.pluginUsage?.[usagePlugin] === 'used' ? 'unused' : 'used')">
            {{ item.pluginUsage?.[usagePlugin] === 'used' ? copy.used : copy.unused }}
          </button>
        </article>
        <p v-if="!loading && !displayedItems.length" class="asset-picker-empty">{{ copy.empty }}</p>
      </div>
      <p v-if="errorText" class="asset-picker-error">{{ errorText }}</p>
      <footer><span>{{ selected.length }} {{ copy.selected }}</span><button type="button" :disabled="Boolean(usageBusyId)" @click="finish(false)">{{ t('common.cancel') }}</button><button data-testid="asset-picker-confirm" type="button" class="confirm" :disabled="!selected.length || Boolean(usageBusyId)" @click="finish(true)">{{ t('common.confirm') }}</button></footer>
    </section>
  </div>
</template>

<style scoped>
.asset-picker-backdrop{position:fixed;z-index:1200;inset:0;display:grid;place-items:center;padding:18px;background:#0009}.asset-picker{display:grid;grid-template-rows:auto auto auto minmax(200px,1fr) auto auto;gap:13px;width:min(820px,96vw);max-height:88vh;padding:18px;border:1px solid var(--theme-border,rgba(255,255,255,.14));border-radius:8px;background:var(--theme-surface,#141d23);color:var(--theme-text,#eef2f4)}.asset-picker header,.asset-picker header div,.asset-picker footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.asset-picker header div{justify-content:flex-start}.asset-picker header button,.asset-picker footer button{display:flex;align-items:center;justify-content:center;min-height:34px;padding:0 12px;border:1px solid var(--theme-border,rgba(255,255,255,.12));border-radius:5px;background:transparent;color:inherit;cursor:pointer}.asset-picker footer button:disabled{opacity:.45;cursor:not-allowed}.asset-picker footer .confirm{background:var(--theme-accent,#23aa91);color:#08211d}.asset-picker footer span{margin-right:auto;color:var(--theme-text-secondary,#9eabb2);font-size:12px}.asset-picker-search{display:flex;align-items:center;gap:8px;padding:0 10px;border:1px solid var(--theme-border,rgba(255,255,255,.12));border-radius:5px}.asset-picker-search input{height:36px;flex:1;border:0;outline:0;background:transparent;color:inherit}.asset-picker-filter-groups{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:30px}.asset-picker-filters{display:flex;gap:5px}.asset-picker-filters--usage{margin-left:auto}.asset-picker-filters button{padding:6px 12px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer}.asset-picker-filters button.active{background:var(--theme-control-selected,rgba(35,170,145,.2))}.asset-picker-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));align-content:start;gap:9px;overflow:auto}.asset-picker-item{position:relative;display:grid;gap:6px;min-width:0;padding:6px;border:1px solid var(--theme-border,rgba(255,255,255,.1));border-radius:5px;background:transparent;color:inherit;text-align:left}.asset-picker-item.selected{border-color:var(--theme-accent,#23aa91)}.asset-picker-select{position:relative;display:grid;gap:6px;min-width:0;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.asset-picker-item img,.asset-picker-placeholder{width:100%;aspect-ratio:4/3;object-fit:cover;background:#0b1115}.asset-picker-placeholder{display:grid;place-items:center;color:var(--theme-text-secondary,#9eabb2)}.asset-picker-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.asset-picker-check{position:absolute;top:4px;right:4px;padding:2px;border-radius:50%;background:var(--theme-accent,#23aa91);color:#062019}.asset-picker-usage{min-height:26px;border:1px solid rgba(91,220,199,.22);border-radius:4px;background:rgba(91,220,199,.08);color:var(--theme-text-secondary,#9eabb2);font-size:11px;cursor:pointer}.asset-picker-usage.used{background:rgba(91,220,199,.18);color:var(--theme-accent,#68dfcb)}.asset-picker-usage:disabled{cursor:wait;opacity:.6}.asset-picker-empty{grid-column:1/-1;text-align:center;color:var(--theme-text-secondary,#9eabb2)}.asset-picker-error{margin:0;color:#ff9e9e;font-size:12px}
</style>
