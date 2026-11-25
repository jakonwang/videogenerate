<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { MAX_PRODUCT_CATEGORY_LENGTH, normalizeProductCategory, productCategoryLabel, productCategoryOptions } from '@shared/productCategories'
import { useProducts } from '@/lib/library'

/** 商品分类：常用分类 + 商品库里用过的自定义分类，也可以直接填新的 */
const props = defineProps<{ modelValue: string; web?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { items: products } = useProducts()
const options = computed(() => productCategoryOptions([...products.value.map((item) => item.type), props.modelValue]))
const adding = ref(false)
const text = ref('')
const input = ref<HTMLInputElement | null>(null)

async function open() {
  text.value = ''
  adding.value = true
  await nextTick()
  input.value?.focus()
}
function commit() {
  if (!adding.value) return
  adding.value = false
  const value = normalizeProductCategory(text.value)
  if (value) emit('update:modelValue', value)
}
</script>

<template>
  <div class="category-chips">
    <button v-for="item in options" :key="item" type="button" :class="[web ? 'vg-btn vg-btn--sm' : 'm-chip', { 'is-active': modelValue === item, 'vg-btn--primary': web && modelValue === item }]" :aria-pressed="modelValue === item" @click="emit('update:modelValue', item)">{{ productCategoryLabel(item) }}</button>
    <input v-if="adding" ref="input" v-model="text" :class="web ? 'vg-input vg-input--sm' : 'm-input'" class="category-chips__input" type="text" :maxlength="MAX_PRODUCT_CATEGORY_LENGTH" placeholder="输入分类，回车确定" @keydown.enter.prevent="commit" @keydown.esc.stop.prevent="adding = false" @blur="commit" />
    <button v-else type="button" :class="web ? 'vg-btn vg-btn--sm' : 'm-chip'" @click="open">＋ 自定义</button>
  </div>
</template>

<style scoped>
.category-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.category-chips__input { width: 180px; }
</style>
