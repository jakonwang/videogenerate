<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, X } from 'lucide-vue-next'
import CloudImage from './CloudImage.vue'
import { coverOf, useProducts, type ProductItem } from '@/lib/library'

/** 从商品库选一个商品（底部弹出） */
const emit = defineEmits<{ close: []; pick: [product: ProductItem] }>()
const { items } = useProducts()
const keyword = ref('')
const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return items.value.filter((item) => !k || item.name.toLowerCase().includes(k))
})
</script>

<template>
  <Teleport to="body">
    <div class="sheet-backdrop" @click.self="emit('close')">
      <section class="sheet" role="dialog" aria-modal="true" aria-label="选择商品">
        <header class="sheet__head">
          <h2>从商品库选择</h2>
          <button type="button" class="m-icon-btn" aria-label="关闭" @click="emit('close')"><X :size="20" /></button>
        </header>
        <label class="m-search">
          <Search :size="18" />
          <input v-model="keyword" type="search" placeholder="搜索商品名称" />
        </label>
        <div class="sheet__list">
          <button v-for="item in filtered" :key="item.id" type="button" class="m-row" @click="emit('pick', item)">
            <span class="thumb"><CloudImage :file-id="coverOf(item)" :alt="item.name" /></span>
            <span class="m-row__main">
              <span class="m-row__title">{{ item.name }}</span>
              <span class="m-row__sub">{{ item.images.length }} 张图</span>
            </span>
          </button>
          <p v-if="!filtered.length" class="m-muted empty">没有找到商品</p>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-backdrop { position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-end; background: var(--theme-overlay); animation: fade .2s; }
.sheet { width: 100%; max-height: 78vh; display: flex; flex-direction: column; gap: 12px; padding: 8px var(--m-gutter) calc(16px + var(--m-safe-bottom)); border-radius: 22px 22px 0 0; background: var(--theme-panel); border-top: 1px solid var(--theme-border); animation: up .24s ease-out; }
.sheet__head { display: flex; align-items: center; justify-content: space-between; }
.sheet__head h2 { margin: 0; font-size: 17px; }
.sheet__list { overflow-y: auto; margin: 0 calc(var(--m-gutter) * -1); }
.thumb { flex: none; width: 48px; height: 48px; border-radius: 10px; overflow: hidden; }
.empty { padding: 24px; text-align: center; font-size: 13px; }
@keyframes fade { from { opacity: 0; } }
@keyframes up { from { transform: translateY(40px); opacity: .6; } }
</style>
