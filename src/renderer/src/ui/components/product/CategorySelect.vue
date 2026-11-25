<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { MAX_PRODUCT_CATEGORY_LENGTH, normalizeProductCategory, productCategoryLabel, productCategoryOptions } from '../../../../../shared/productCategories'

/** 商品分类下拉：常用分类 + 用过的自定义分类，也可以直接填新的 */
defineOptions({ inheritAttrs: false })
const props = defineProps<{ modelValue: string; used?: string[]; small?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { t, locale } = useI18n()
const ADD = '__add__'
const adding = ref(false)
const text = ref('')
const input = ref<HTMLInputElement | null>(null)
const options = computed(() => productCategoryOptions([...(props.used ?? []), props.modelValue]))

async function change(event: Event) {
  const select = event.target as HTMLSelectElement
  if (select.value !== ADD) return emit('update:modelValue', select.value)
  select.value = props.modelValue
  text.value = ''
  adding.value = true
  await nextTick()
  input.value?.focus()
}
/** 回车或点到别处就算填好；没填就当没改 */
function commit() {
  if (!adding.value) return
  adding.value = false
  const value = normalizeProductCategory(text.value)
  if (value) emit('update:modelValue', value)
}
</script>

<template>
  <input v-if="adding" ref="input" v-model="text" v-bind="$attrs" class="vg-input category-select" :class="{ 'vg-input--sm': small }" type="text" :maxlength="MAX_PRODUCT_CATEGORY_LENGTH" :placeholder="t('ai.category.placeholder')" @keydown.enter.prevent="commit" @keydown.esc.stop.prevent="adding = false" @blur="commit" />
  <select v-else v-bind="$attrs" class="vg-select category-select" :class="{ 'vg-select--sm': small }" :value="modelValue" @change="change">
    <option v-for="item in options" :key="item" :value="item">{{ productCategoryLabel(item, locale) }}</option>
    <option :value="ADD">{{ t('ai.category.add') }}</option>
  </select>
</template>
