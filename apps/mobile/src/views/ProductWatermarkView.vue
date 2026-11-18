<script setup lang="ts">
import { isWeb } from '@/lib/platform'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Boxes, Check, Droplets, FolderOpen, ImagePlus, Inbox, Layers, LoaderCircle, Play, Save, Trash2, Upload, X } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import GenerationTile from '@/components/GenerationTile.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import { uploadImage } from '@/lib/files'
import { saveLocalResult, useGenerations } from '@/lib/generate'
import type { ProductItem } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import { applyWatermark, rememberTemplate, removeWatermarkTemplate, saveWatermarkTemplate, savedTemplate, uploadTemplate, useWatermarkTemplates } from '@/lib/watermark'
import { useAssets } from '@/lib/assets'
import { fileBlob } from '@/lib/files'
import { downloadBlob } from '@/lib/platform'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
const inWebShell = useInWebShell()

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

/* 保存的模板 / 素材库 / 处理后下载（网页版按电脑端的三栏） */
const savedTemplates = useWatermarkTemplates()
const templateName = ref('')
const { items: libraryImages } = useAssets((item) => item.kind === 'image')
const pickingLibrary = ref(false)
const downloadAfter = ref(true)
const dragging = ref(false)
function chooseSaved(id: string) {
  const row = savedTemplates.value.find((t) => t.id === id)
  if (!row) return
  templateId.value = row.fileId
  rememberTemplate(row.fileId)
}
const currentSavedId = computed(() => savedTemplates.value.find((t) => t.fileId === templateId.value)?.id ?? '')
async function saveCurrentTemplate() {
  if (!templateId.value || !templateName.value.trim()) return
  await saveWatermarkTemplate(templateName.value, templateId.value)
  templateName.value = ''
  toast('模板已保存')
}
async function deleteSavedTemplate() {
  const row = savedTemplates.value.find((t) => t.id === currentSavedId.value)
  if (!row || !window.confirm(`删除模板「${row.name}」？`)) return
  await removeWatermarkTemplate(row.id)
}
function toggleLibrary(fileId: string) {
  uploads.value = uploads.value.includes(fileId) ? uploads.value.filter((id) => id !== fileId) : uploads.value.length + selected.value.length >= MAX_IMAGES ? uploads.value : [...uploads.value, fileId]
}
async function onDropImages(event: DragEvent) {
  dragging.value = false
  const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/')).slice(0, MAX_IMAGES - sources.value.length)
  busy.value = 'upload'
  try {
    for (const file of files) uploads.value = [...uploads.value, (await uploadImage(file)).fileId]
  } catch (error) {
    toast(`上传失败：${errorMessage(error)}`)
  } finally {
    busy.value = ''
  }
}

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
      if (inWebShell.value && downloadAfter.value) downloadBlob(await fileBlob(output), `watermark_${String(index + 1).padStart(2, '0')}.jpg`)
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
  <template v-if="inWebShell">
    <PageHeader title="商品品牌水印" description="把店铺 Logo、边框等透明 PNG 模板批量盖到商品图上，在浏览器里处理，不消耗 AI 额度。">
      <template #actions>
        <button type="button" class="vg-btn" @click="router.push('/review')"><Inbox :size="15" /> 审核收件箱 <span v-if="pendingReview" class="vg-count">{{ pendingReview }}</span></button>
      </template>
    </PageHeader>
    <main class="vg-page wt-page" data-testid="web-product-watermark">
      <div class="wt-grid">
        <WebStep :index="1" title="水印模板" subtitle="正方形、带透明的 PNG" :meta="`已保存 ${savedTemplates.length} 个`">
          <label class="vg-field">
            <span class="vg-field__label">选择已保存模板</span>
            <span class="pw-saved">
              <select class="vg-select" :value="currentSavedId" data-testid="wm-saved-select" @change="chooseSaved(($event.target as HTMLSelectElement).value)">
                <option value="" disabled>选择模板</option>
                <option v-for="t in savedTemplates" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <button v-if="currentSavedId" type="button" class="vg-icon-btn" title="删除这个模板" @click="deleteSavedTemplate"><Trash2 :size="14" /></button>
            </span>
          </label>
          <span class="vg-field__label">添加模板</span>
          <button type="button" class="pw-template" :disabled="busy === 'template'" @click="templateInput?.click()">
            <span class="pw-template__img checker"><CloudImage v-if="templateId" :file-id="templateId" /><Upload v-else :size="18" /></span>
            <span class="pw-template__text">
              <strong>{{ templateId ? '更换模板' : '拖放 1:1 透明模板到这里' }}</strong>
              <small>支持 PNG / WebP，必须为正方形并包含透明通道</small>
            </span>
            <LoaderCircle v-if="busy === 'template'" :size="16" class="vg-spin" />
          </button>
          <input ref="templateInput" type="file" accept="image/png,image/webp" hidden @change="onTemplate" />
          <div class="pw-save">
            <input v-model="templateName" class="vg-input" maxlength="40" placeholder="输入模板名称" data-testid="wm-template-name" />
            <button type="button" class="vg-btn vg-btn--primary" :disabled="!templateId || !templateName.trim() || !!currentSavedId" data-testid="wm-template-save" @click="saveCurrentTemplate"><Save :size="14" /> 保存模板</button>
          </div>
        </WebStep>
        <WebStep :index="2" title="商品图片" subtitle="从商品库勾选，或上传图片" :meta="`已选择 ${sources.length} / ${MAX_IMAGES}`">
          <div class="pw-drop" :class="{ 'is-drag': dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDropImages">
            <ImagePlus :size="20" class="pw-drop__icon" />
            <strong>拖放商品图片到这里</strong>
            <small>支持 JPG、PNG、WebP；将按中心位置裁剪为正方形</small>
            <div class="wt-row">
              <button type="button" class="vg-btn vg-btn--sm" :disabled="busy === 'upload'" @click="imageInput?.click()">
                <LoaderCircle v-if="busy === 'upload'" :size="14" class="vg-spin" /><Layers v-else :size="14" /> 批量选择图片
              </button>
              <button type="button" class="vg-btn vg-btn--sm" @click="pickingLibrary = true"><FolderOpen :size="14" /> 从素材库选择</button>
              <button type="button" class="vg-btn vg-btn--sm" @click="picking = true"><Boxes :size="14" /> {{ product ? product.name : '从商品库选择' }}</button>
            </div>
          </div>
          <input ref="imageInput" type="file" accept="image/*" multiple hidden @change="onImages" />
          <div v-if="product || uploads.length" class="pr-refs">
            <button v-for="image in product?.images ?? []" :key="image.fileId" type="button" class="pr-ref" :class="{ 'is-active': selected.includes(image.fileId) }" @click="toggle(image.fileId)">
              <CloudImage :file-id="image.fileId" />
              <span v-if="selected.includes(image.fileId)" class="pr-ref__check"><Check :size="12" /></span>
            </button>
            <div v-for="(fileId, index) in uploads" :key="fileId" class="pr-scene">
              <CloudImage :file-id="fileId" />
              <button type="button" class="pr-scene__remove" aria-label="移除" @click="uploads.splice(index, 1)"><X :size="12" /></button>
            </div>
          </div>
          <div v-else class="vg-empty pw-empty"><p>尚未添加商品图片</p></div>
        </WebStep>
        <WebStep :index="3" title="处理与导出" subtitle="裁成正方形并合成水印">
          <dl class="vg-kv">
            <dt>输出格式</dt><dd>JPEG</dd>
            <dt>图片裁剪</dt><dd>居中正方形</dd>
            <dt>透明区域</dt><dd>白色填充</dd>
          </dl>
          <label class="vg-switch" :class="{ 'is-on': downloadAfter }"><input v-model="downloadAfter" type="checkbox" hidden /><span class="vg-switch__track"></span> 处理后下载到电脑（同时进审核收件箱）</label>
          <button type="button" class="vg-btn vg-btn--primary vg-btn--block" :disabled="!!busy || !templateId || !sources.length" @click="start">
            <template v-if="busy === 'run'"><LoaderCircle :size="15" class="vg-spin" /> 处理中 {{ progress.done }}/{{ progress.total }}</template>
            <template v-else><Play :size="15" /> 处理并导出 JPEG{{ sources.length ? `（${sources.length} 张）` : '' }}</template>
          </button>
          <div v-if="results.length" class="wr-mini">
            <span class="vg-field__label">最近结果</span>
            <div class="pr-refs">
              <GenerationTile v-for="item in results.slice(0, 8)" :key="item.id" :item="item" @click="router.push(`/review?focus=${item.id}`)" />
            </div>
          </div>
        </WebStep>
      </div>
      <ProductPicker v-if="picking" @close="picking = false" @pick="pickProduct" />
      <div v-if="pickingLibrary" class="vg-backdrop" @click.self="pickingLibrary = false">
        <section class="vg-dialog vg-dialog--wide">
          <header class="vg-dialog__head"><span class="vg-dialog__title">从素材库选择</span><button type="button" class="vg-icon-btn" aria-label="关闭" @click="pickingLibrary = false"><X :size="16" /></button></header>
          <div class="vg-dialog__body">
            <div v-if="libraryImages.length" class="pw-lib">
              <button v-for="a in libraryImages" :key="a.id" type="button" class="pr-ref" :class="{ 'is-active': uploads.includes(a.fileId) }" :title="a.name" @click="toggleLibrary(a.fileId)">
                <CloudImage :file-id="a.fileId" /><span v-if="uploads.includes(a.fileId)" class="pr-ref__check"><Check :size="12" /></span>
              </button>
            </div>
            <p v-else class="vg-muted">素材库里还没有图片。</p>
          </div>
          <footer class="vg-dialog__foot"><span class="vg-muted">已选择 {{ sources.length }} / {{ MAX_IMAGES }}</span><button type="button" class="vg-btn vg-btn--primary" @click="pickingLibrary = false">完成</button></footer>
        </section>
      </div>
    </main>
  </template>
  <template v-else>
  <PageHeader title="商品图水印" back="/create">
    <template #actions>
      <button type="button" class="m-icon-btn inbox" aria-label="审核收件箱" @click="router.push('/review')">
        <Inbox :size="20" /><span v-if="pendingReview" class="dot">{{ pendingReview }}</span>
      </button>
    </template>
  </PageHeader>
  <main class="m-page m-page--no-tabs wb">
    <p class="intro">把店铺 Logo、边框等透明 PNG 模板批量盖到商品图上。图片会裁成正方形，在{{ isWeb ? '浏览器里' : '手机上' }}处理，不消耗 AI 额度。</p>

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

    <section v-if="results.length" class="m-section wb-results">
      <div class="m-section__head"><h2 class="m-section__title">最近结果</h2><button type="button" class="m-section__link" @click="router.push('/review')">去审核</button></div>
      <div class="grid">
        <GenerationTile v-for="item in results.slice(0, 12)" :key="item.id" :item="item" @click="router.push(`/review?focus=${item.id}`)" />
      </div>
    </section>
    <section v-else class="m-section wb-results wb-results--empty"><div class="m-card m-empty"><span class="m-empty__title">生成结果会出现在这里</span><span class="m-empty__text">在云端生成，完成后也会进入「审核收件箱」</span></div></section>
  </main>
  <ProductPicker v-if="picking" @close="picking = false" @pick="pickProduct" />
  </template>
</template>

<style scoped>
.pw-saved { display: flex; gap: 6px; }
.pw-saved .vg-select { flex: 1; }
.pw-save { display: flex; gap: 8px; }
.pw-save .vg-input { flex: 1; }
.pw-drop { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 18px 12px; border: 1px dashed var(--theme-border-control, var(--theme-border)); border-radius: 10px; background: var(--theme-panel-soft); text-align: center; }
.pw-drop.is-drag { border-color: var(--vg-accent); }
.pw-drop__icon { color: var(--vg-accent); }
.pw-drop strong { font-size: 13px; }
.pw-drop small { color: var(--theme-text-muted); font-size: 12px; }
.pw-lib { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; max-height: 60vh; overflow: auto; }
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
