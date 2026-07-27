<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Package, Search, X } from 'lucide-vue-next'

type ProductOption = {
  id: string
  name: string
  coverImagePath?: string
  livePhotoReferenceImagePath?: string
  analysisBoardPath?: string
}

const props = defineProps<{
  open: boolean
  products: ProductOption[]
  selectedId?: string
}>()

const emit = defineEmits<{
  close: []
  select: [id: string]
}>()

const query = ref('')
const labels = {
  title: '\u9009\u62e9\u5546\u54c1',
  description: '\u901a\u8fc7\u5c01\u9762\u548c\u540d\u79f0\u5feb\u901f\u9009\u62e9\u672c\u6b21\u4efb\u52a1\u4f7f\u7528\u7684\u5546\u54c1\u3002',
  search: '\u641c\u7d22\u5546\u54c1\u540d\u79f0\u6216 ID',
  selected: '\u5f53\u524d\u9009\u4e2d',
  empty: '\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u5546\u54c1',
  count: '\u4e2a\u5546\u54c1',
} as const

const filteredProducts = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return props.products
  return props.products.filter((product) => `${product.name} ${product.id}`.toLowerCase().includes(keyword))
})

watch(() => props.open, (open) => {
  if (open) query.value = ''
})

function previewSrc(path?: string) {
  const value = String(path || '').trim()
  return value ? `vg://file?path=${encodeURIComponent(value)}` : ''
}

function selectProduct(id: string) {
  emit('select', id)
  emit('close')
}
</script>

<template>
  <div v-if="open" class="product-dialog" @click.self="emit('close')">
    <section class="product-dialog__panel">
      <header class="product-dialog__header">
        <div>
          <strong>{{ labels.title }}</strong>
          <p>{{ labels.description }}</p>
        </div>
        <button type="button" class="product-dialog__close" @click="emit('close')"><X class="h-4 w-4" /></button>
      </header>
      <div class="product-dialog__toolbar">
        <label class="product-dialog__search">
          <Search class="h-4 w-4" />
          <input v-model="query" type="text" :placeholder="labels.search" autofocus />
        </label>
        <span>{{ filteredProducts.length }} {{ labels.count }}</span>
      </div>
      <div v-if="filteredProducts.length" class="product-dialog__grid">
        <button
          v-for="product in filteredProducts"
          :key="product.id"
          type="button"
          class="product-dialog__card"
          :class="{ selected: selectedId === product.id }"
          @click="selectProduct(product.id)"
        >
          <div class="product-dialog__cover">
            <img v-if="product.coverImagePath" :src="previewSrc(product.coverImagePath)" alt="product cover" />
            <Package v-else class="h-6 w-6" />
            <span v-if="selectedId === product.id" class="product-dialog__selected"><Check class="h-3 w-3" />{{ labels.selected }}</span>
          </div>
          <div class="product-dialog__copy">
            <strong>{{ product.name }}</strong>
            <small>ID: {{ product.id }}</small>
          </div>
        </button>
      </div>
      <div v-else class="product-dialog__empty"><Package class="h-7 w-7" /><span>{{ labels.empty }}</span></div>
    </section>
  </div>
</template>

<style scoped>
.product-dialog{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:18px;background:rgba(5,8,16,.76);backdrop-filter:blur(9px)}
.product-dialog__panel{width:min(980px,100%);max-height:calc(100vh - 36px);display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:14px;padding:18px;border:1px solid rgba(111,123,170,.26);border-radius:18px;background:linear-gradient(180deg,rgba(15,19,31,.99),rgba(10,14,25,.99));box-shadow:0 30px 80px rgba(0,0,0,.45);color:#f8fbff;overflow:hidden}
.product-dialog__header,.product-dialog__toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px}.product-dialog__header strong{font-size:20px}.product-dialog__header p{margin:5px 0 0;color:#9fb1d8;font-size:12px}.product-dialog__close{width:38px;height:38px;display:grid;place-items:center;border:1px solid rgba(111,123,170,.24);border-radius:11px;background:rgba(19,24,38,.92);color:#fff}
.product-dialog__search{min-width:260px;max-width:520px;flex:1;display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;align-items:center;padding:0 12px;border:1px solid rgba(111,123,170,.24);border-radius:12px;background:rgba(19,24,38,.92);color:#9fb1d8}.product-dialog__search input{min-height:42px;border:0;outline:0;background:transparent;color:#fff;font-size:13px}.product-dialog__toolbar>span{color:#9fb1d8;font-size:11px}
.product-dialog__grid{min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:2px}.product-dialog__card{min-width:0;display:grid;gap:9px;padding:9px;border:1px solid rgba(111,123,170,.18);border-radius:15px;background:rgba(18,23,38,.78);color:#fff;text-align:left}.product-dialog__card:hover{border-color:rgba(85,223,202,.48);transform:translateY(-1px)}.product-dialog__card.selected{border-color:#55dfca;box-shadow:inset 0 0 0 1px rgba(85,223,202,.22)}
.product-dialog__cover{position:relative;aspect-ratio:1;border-radius:11px;overflow:hidden;display:grid;place-items:center;background:rgba(255,255,255,.05);color:#71809f}.product-dialog__cover img{width:100%;height:100%;object-fit:cover}.product-dialog__selected{position:absolute;right:7px;top:7px;display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:999px;background:rgba(13,148,136,.9);color:#fff;font-size:10px}
.product-dialog__copy{display:grid;gap:4px;min-width:0}.product-dialog__copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.product-dialog__copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8fa1c4;font-size:9px}.product-dialog__empty{min-height:280px;display:grid;place-items:center;align-content:center;gap:10px;color:#8fa1c4;font-size:12px}
@media(max-width:900px){.product-dialog__grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:640px){.product-dialog__toolbar{align-items:stretch;flex-direction:column}.product-dialog__search{min-width:0;max-width:none}.product-dialog__grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
