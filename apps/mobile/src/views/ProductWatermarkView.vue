<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Boxes, Check, Droplets, ImagePlus, Inbox, LoaderCircle, X } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import GenerationTile from '@/components/GenerationTile.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import { uploadImage } from '@/lib/files'
import { saveLocalResult, useGenerations } from '@/lib/generate'
import type { ProductItem } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import { applyWatermark, savedTemplate, uploadTemplate } from '@/lib/watermark'

/** 商品图水印：选一个透明 PNG 模板，批量盖到商品图上（手机本地处理，不消耗 AI 额度） */

const MAX_IMAGES = 20
const router = useRouter()
const templateId = ref(savedTemplate())
const product = ref<ProductItem | null>(null)
const selected = ref<string[]>([])
const uploads = ref<string[]>([])
const picking = ref(false)
const busy = ref('')
const progress = ref({ done: 0, total: 0 })
const templateInput = ref<HTMLInputElement>()
const imageInput = ref<HTMLInputElement>()
const results = useGenerations((item) => item.purpose === 'product-watermark')
const pendingReview = computed(() => results.value.filter((item) => item.review === 'pending').length)
const sources = computed(() => [...selected.value, ...uploads.value])

async function onTemplate(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  busy.value = 'template'
  try {
    templateId.value = await uploadTemplate(file)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = ''
  }
}

function pickProduct(item: ProductItem) {
  picking.value = false
  if (!item.images.length) return toast('这个商品还没有图片')
  product.value = item
  selected.value = item.images.slice(0, MAX_IMAGES).map((image) => image.fileId)
}

function toggle(fileId: string) {
  selected.value = selected.value.includes(fileId) ? selected.value.filter((id) => id !== fileId) : [...selected.value, fileId]
}

async function onImages(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? []).slice(0, MAX_IMAGES - sources.value.length)
  ;(event.target as HTMLInputElement).value = ''
  busy.value = 'upload'
  try {
    for (const file of files) uploads.value = [...uploads.value, (await uploadImage(file)).fileId]
  } catch (error) {
    toast(`上传失败：${errorMessage(error)}`)
  } finally {
    busy.value = ''
  }
}

async function start() {
  if (!templateId.value) return toast('先选水印模板')
  if (!sources.value.length) return toast('先选要加水印的图')
  busy.value = 'run'
  progress.value = { done: 0, total: sources.value.length }
  let failed = 0
  for (const [index, fileId] of sources.value.entries()) {
    try {
      const output = await applyWatermark(fileId, templateId.value)
      const fromProduct = selected.value.includes(fileId)
      await saveLocalResult({
        kind: 'image',
        purpose: 'product-watermark',
        productId: fromProduct ? product.value?.id : undefined,
        productName: fromProduct ? product.value?.name : undefined,
        sourceFileId: fileId,
        outputFileId: output,
        outputMime: 'image/jpeg',
        label: `水印 ${index + 1}`,
      })
    } catch {
      failed += 1
    }
    progress.value = { ...progress.value, done: progress.value.done + 1 }
  }
  busy.value = ''
  uploads.value = []
  toast(failed ? `完成，${failed} 张失败` : '全部完成，去审核后会加进商品')
}
</script>

<template>
  <PageHeader title="商品图水印" back="/create">
    <template #actions>
      <button type="button" class="m-icon-btn inbox" aria-label="审核收件箱" @click="router.push('/review')">
        <Inbox :size="20" /><span v-if="pendingReview" class="dot">{{ pendingReview }}</span>
      </button>
    </template>
  </PageHeader>
  <main class="m-page m-page--no-tabs">
    <p class="intro">把店铺 Logo、边框等透明 PNG 模板批量盖到商品图上。图片会裁成正方形，在手机上处理，不消耗 AI 额度。</p>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">1. 水印模板</h2><span class="m-muted small">正方形、带透明的 PNG</span></div>
      <div class="template">
        <span class="template__img checker"><CloudImage v-if="templateId" :file-id="templateId" /></span>
        <button type="button" class="m-btn" :disabled="busy === 'template'" @click="templateInput?.click()">
          <LoaderCircle v-if="busy === 'template'" :size="16" class="m-spin" /><ImagePlus v-else :size="16" /> {{ templateId ? '换模板' : '选模板' }}
        </button>
      </div>
      <input ref="templateInput" type="file" accept="image/png,image/webp" hidden @change="onTemplate" />
    </section>

    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">2. 要加水印的图</h2><span class="m-muted small">已选 {{ sources.length }} 张</span></div>
      <div class="pick">
        <button type="button" class="m-btn" @click="picking = true"><Boxes :size="16" /> {{ product ? product.name : '从商品库选' }}</button>
        <button type="button" class="m-btn" :disabled="busy === 'upload'" @click="imageInput?.click()">
          <LoaderCircle v-if="busy === 'upload'" :size="16" class="m-spin" /><ImagePlus v-else :size="16" /> 从相册选
        </button>
      </div>
      <input ref="imageInput" type="file" accept="image/*" multiple hidden @change="onImages" />
      <div v-if="product || uploads.length" class="grid">
        <button v-for="image in product?.images ?? []" :key="image.fileId" type="button" class="cell" :class="{ 'is-active': selected.includes(image.fileId) }" @click="toggle(image.fileId)">
          <CloudImage :file-id="image.fileId" />
          <span v-if="selected.includes(image.fileId)" class="cell__check"><Check :size="12" /></span>
        </button>
        <div v-for="(fileId, index) in uploads" :key="fileId" class="cell is-active">
          <CloudImage :file-id="fileId" />
          <button type="button" class="cell__remove" aria-label="移除" @click="uploads.splice(index, 1)"><X :size="12" /></button>
        </div>
      </div>
    </section>

    <section class="m-section">
      <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="!!busy || !templateId || !sources.length" @click="start">
        <template v-if="busy === 'run'"><LoaderCircle :size="18" class="m-spin" /> 处理中 {{ progress.done }}/{{ progress.total }}</template>
        <template v-else><Droplets :size="18" /> 加水印{{ sources.length ? ` ${sources.length} 张` : '' }}</template>
      </button>
    </section>

    <section v-if="results.length" class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">最近结果</h2><button type="button" class="m-section__link" @click="router.push('/review')">去审核</button></div>
      <div class="grid">
        <GenerationTile v-for="item in results.slice(0, 12)" :key="item.id" :item="item" @click="router.push(`/review?focus=${item.id}`)" />
      </div>
    </section>
  </main>
  <ProductPicker v-if="picking" @close="picking = false" @pick="pickProduct" />
</template>

<style scoped>
.intro { margin: 4px 2px 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.6; }
.small { font-size: 12px; }
.template { display: flex; align-items: center; gap: 12px; }
.template__img { width: 76px; height: 76px; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 12px; }
.template__img :deep(img) { width: 100%; height: 100%; object-fit: contain; }
.checker { background: repeating-conic-gradient(var(--theme-control-hover) 0 25%, transparent 0 50%) 0 0 / 14px 14px; }
.pick { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pick .m-btn { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
.cell { position: relative; aspect-ratio: 1; overflow: hidden; padding: 0; border: 2px solid transparent; border-radius: 12px; background: var(--theme-control-hover); opacity: 0.5; }
.cell.is-active { border-color: var(--m-accent); opacity: 1; }
.cell :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.cell__check, .cell__remove { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 999px; }
.cell__check { background: var(--m-accent); color: #04201c; }
.cell__remove { background: rgba(0, 0, 0, 0.6); color: #fff; }
.inbox { position: relative; }
.dot { position: absolute; top: 2px; right: 0; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px; background: var(--m-red); color: #fff; font-size: 10px; font-weight: 800; line-height: 16px; }
</style>
