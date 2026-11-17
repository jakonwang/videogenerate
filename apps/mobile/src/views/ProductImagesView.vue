<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Inbox, LoaderCircle, Sparkles } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncProduct } from '@shared/cloud/sync'
import { TIKTOK_LISTING_CATEGORY_LABELS, type TiktokListingCategory } from '@shared/tiktokListingPrompts'
import GenerationTile from '@/components/GenerationTile.vue'
import PageHeader from '@/components/PageHeader.vue'
import SourcePicker, { type Source } from '@/components/SourcePicker.vue'
import { categoryForProduct, generateProductImages, PRODUCT_IMAGE_SHOTS, startPolling, useGenerations } from '@/lib/generate'
import { errorMessage } from '@/lib/session'
import { getRecord } from '@/lib/sync'
import { toast } from '@/lib/toast'

const route = useRoute()
const router = useRouter()
const source = ref<Source | null>(null)
const shots = ref<number[]>([0, 1, 3])
const submitting = ref(false)
const results = useGenerations((item) => item.purpose === 'product-image')
const pendingReview = computed(() => results.value.filter((item) => item.status === 'succeeded' && item.review === 'pending').length)
const category = ref<TiktokListingCategory | 'general'>('general')
const categories = [...(Object.entries(TIKTOK_LISTING_CATEGORY_LABELS) as [TiktokListingCategory, string][]), ['general', '其他'] as ['general', string]]
// Default to the product's own category; the user can still correct it (products from 选品 start as 通用).
watch(source, (value) => {
  category.value = categoryForProduct(value?.product?.type) ?? 'general'
})

onMounted(async () => {
  startPolling()
  const productId = route.query.product ? String(route.query.product) : ''
  if (!productId) return
  const record = await getRecord<SyncProduct>(SYNC_COLLECTIONS.products, productId)
  const first = record?.data && (record.data.coverFileId || record.data.images[0]?.fileId)
  if (record?.data && first) source.value = { fileId: first, product: { ...record.data, id: productId } }
})

function toggle(index: number) {
  shots.value = shots.value.includes(index) ? shots.value.filter((item) => item !== index) : [...shots.value, index].sort()
}

async function start() {
  if (!source.value) {
    toast('请先选择一张商品图')
    return
  }
  if (!shots.value.length) {
    toast('至少选一种镜头')
    return
  }
  submitting.value = true
  try {
    await generateProductImages({
      productId: source.value.product?.id,
      productName: source.value.product?.name,
      category: category.value === 'general' ? null : category.value,
      sourceFileId: source.value.fileId,
      shots: shots.value,
    })
    toast(`已提交 ${shots.value.length} 张，约 1–2 分钟生成好，可以先离开`)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <PageHeader title="商品图素材" back="/create">
    <template #actions>
      <button type="button" class="m-icon-btn inbox" aria-label="审核收件箱" @click="router.push('/review')">
        <Inbox :size="20" /><span v-if="pendingReview" class="dot">{{ pendingReview }}</span>
      </button>
    </template>
  </PageHeader>
  <main class="m-page m-page--no-tabs">
    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">1. 选商品图</h2></div>
      <SourcePicker v-model="source" />
    </section>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">2. 选镜头</h2><span class="m-muted small">每种生成 1 张</span></div>
      <div class="shots">
        <button v-for="shot in PRODUCT_IMAGE_SHOTS" :key="shot.index" type="button" class="shot" :class="{ 'is-active': shots.includes(shot.index) }" @click="toggle(shot.index)">
          <strong>{{ shot.label }}</strong><span>{{ shot.hint }}</span>
        </button>
      </div>
    </section>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">商品品类</h2><span class="m-muted small">决定上身方式</span></div>
      <div class="chips">
        <button v-for="[value, label] in categories" :key="value" type="button" class="m-chip" :class="{ 'is-active': category === value }" @click="category = value">{{ label }}</button>
      </div>
    </section>

    <section class="m-section">
      <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="submitting || !source || !shots.length" @click="start">
        <LoaderCircle v-if="submitting" :size="18" class="m-spin" /><Sparkles v-else :size="18" /> 生成 {{ shots.length }} 张商品图
      </button>
      <p class="m-muted small note">生成在云端进行，关掉 App 也会继续；完成后在下方和「审核收件箱」里查看。</p>
    </section>

    <section v-if="results.length" class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">最近生成</h2><button type="button" class="m-section__link" @click="router.push('/review')">去审核</button></div>
      <div class="grid">
        <GenerationTile v-for="item in results.slice(0, 12)" :key="item.id" :item="item" @click="router.push(`/review?focus=${item.id}`)" />
      </div>
    </section>
  </main>
</template>

<style scoped>
.small { font-size: 12px; }
.note { margin: 10px 2px 0; line-height: 1.6; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.shots { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.shot { display: flex; flex-direction: column; gap: 2px; padding: 12px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); text-align: left; }
.shot strong { font-size: 14px; }
.shot span { color: var(--theme-text-muted); font-size: 11px; }
.shot.is-active { border-color: var(--m-accent-line); background: var(--m-accent-soft); }
.shot.is-active strong { color: var(--m-accent-2); }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.inbox { position: relative; }
.dot { position: absolute; top: 4px; right: 2px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: var(--m-red); color: #fff; font-size: 10px; font-weight: 800; line-height: 16px; }
</style>
