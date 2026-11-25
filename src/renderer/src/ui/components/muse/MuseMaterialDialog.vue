<script setup lang="ts">
/** Pick derived product pictures (衍生图) as references, like tk创意室. */
import { m } from './museText'
import { computed, ref, watch } from 'vue'
import { LayoutGrid, X } from 'lucide-vue-next'
import { museError } from './museLabels'

type Material = { id: string; localImagePath: string; usageStatus?: string; materialOrigin?: string }
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; pick: [paths: string[]] }>()

const rows = ref<Material[]>([])
const selected = ref<string[]>([])
const filter = ref<'all' | 'unused' | 'used'>('unused')
const error = ref('')
const loading = ref(false)

const visible = computed(() => rows.value.filter((item) => filter.value === 'all' || (filter.value === 'used') === (item.usageStatus === 'used')))

watch(() => props.open, async (open) => {
  if (!open) return
  selected.value = []
  filter.value = 'unused'
  error.value = ''
  loading.value = true
  try {
    const list: any = await window.api.productImageMaterials.listMaterials({ userId: 'desktop-local', filters: { category: 'all', usageStatus: 'all' } })
    rows.value = (Array.isArray(list) ? list : []).filter((item: any) => item.materialOrigin === 'derived' && String(item.localImagePath || '').trim())
  } catch (e) {
    error.value = museError(e)
  } finally {
    loading.value = false
  }
})

function toggle(id: string) {
  selected.value = selected.value.includes(id) ? selected.value.filter((item) => item !== id) : [...selected.value, id]
}

async function confirm() {
  const picked = rows.value.filter((item) => selected.value.includes(item.id))
  await Promise.all(picked.map((item) => window.api.productImageMaterials.updateUsageStatus({ userId: 'desktop-local', materialId: item.id, usageStatus: 'used' }).catch(() => null)))
  emit('pick', picked.map((item) => item.localImagePath))
  emit('close')
}
</script>

<template>
  <div v-if="open" class="vg-scope vg-backdrop" data-testid="muse-materials" @click.self="emit('close')">
    <section class="vg-dialog vg-dialog--xl" role="dialog" aria-modal="true" aria-labelledby="mm-title">
      <header class="vg-dialog__head">
        <div class="vg-dialog__title"><span class="vg-dialog__title-icon"><LayoutGrid :size="20" /></span><div><h2 id="mm-title">{{ m('从衍生图选图') }}</h2><p>{{ m('选中的衍生图会标记为已使用') }}</p></div></div>
        <button class="vg-icon-btn" type="button" :aria-label="m('关闭')" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="vg-dialog__body mm__body">
        <div class="ts-seg"><button type="button" :class="{ 'is-on': filter === 'all' }" @click="filter = 'all'">{{ m('全部') }}</button><button type="button" :class="{ 'is-on': filter === 'unused' }" @click="filter = 'unused'">{{ m('未使用') }}</button><button type="button" :class="{ 'is-on': filter === 'used' }" @click="filter = 'used'">{{ m('已使用') }}</button></div>
        <p v-if="error" class="vg-notice vg-notice--danger" role="alert">{{ m(error) }}</p>
        <p v-else-if="loading" class="vg-muted">{{ m('正在读取…') }}</p>
        <p v-else-if="!visible.length" class="vg-muted">{{ m('没有衍生图') }}</p>
        <div class="ts-refs">
          <button v-for="item in visible" :key="item.id" type="button" class="ts-ref mm__item" :class="{ 'is-on': selected.includes(item.id) }" :aria-pressed="selected.includes(item.id)" @click="toggle(item.id)"><img :src="`vg://file?path=${encodeURIComponent(item.localImagePath)}&w=240`" alt="" loading="lazy" /></button>
        </div>
      </div>
      <footer class="vg-dialog__foot"><span class="vg-muted">{{ m('已选') }} {{ selected.length }}</span>
        <div class="vg-dialog__foot-actions"><button class="vg-btn" type="button" @click="emit('close')">{{ m('取消') }}</button><button class="vg-btn vg-btn--primary" type="button" :disabled="!selected.length" @click="confirm">{{ m('添加') }}</button></div>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.mm__body { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
.mm__body .ts-refs { width: 100%; }
.mm__item { padding: 3px; border: 2px solid transparent; border-radius: 12px; background: none; cursor: pointer; }
.mm__item.is-on { border-color: var(--vg-accent); }
</style>
