<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, Download, ImagePlus, LoaderCircle, Send, Share2, X } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncProduct } from '@shared/cloud/sync'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import { approve, reject, useGenerations, type GenerationItem } from '@/lib/generate'
import { relativeTime, type ProductItem } from '@/lib/library'
import { publishAvailable, publishLabels, saveToGallery, shareTo } from '@/lib/publish'
import { isWeb } from '@/lib/platform'
import { errorMessage } from '@/lib/session'
import { getRecord, saveRecord } from '@/lib/sync'
import { toast } from '@/lib/toast'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
import { Inbox } from 'lucide-vue-next'
const inWebShell = useInWebShell()

/** 作品库：所有生成成功的图片和视频，可以存相册、分享、去发布、加到商品 */

const router = useRouter()
const filter = ref<'all' | 'image' | 'video' | 'approved'>('all')
const works = useGenerations((item) => item.status === 'succeeded' && Boolean(item.outputFileId) && item.review !== 'rejected')
const shown = computed(() =>
  works.value.filter((item) => (filter.value === 'all' ? true : filter.value === 'approved' ? item.review === 'approved' : item.kind === filter.value)),
)
const counts = computed(() => ({
  all: works.value.length,
  image: works.value.filter((item) => item.kind === 'image').length,
  video: works.value.filter((item) => item.kind === 'video').length,
  approved: works.value.filter((item) => item.review === 'approved').length,
}))
const FILTERS = [
  ['all', '全部'],
  ['image', '图片'],
  ['video', '视频'],
  ['approved', '已通过'],
] as const
const PURPOSE: Record<string, string> = {
  'product-image': '商品图',
  'image-to-video': '图生视频',
  clone: '复刻',
  watermark: '加水印',
  subtitle: '加字幕',
  slice: '切片',
  mix: '混剪',
  'parse-link': '链接下载',
  'product-replace': '商品替换',
  'product-watermark': '商品图水印', creative: 'tk创意室',
  model: 'AI 模特',
}

const selected = ref<GenerationItem | null>(null)
const busy = ref('')
const picking = ref(false)

const labelOf = (item: GenerationItem) => (item.productName ? `${item.productName} · ${item.label}` : item.label)

async function run(kind: string, task: () => Promise<unknown>) {
  busy.value = kind
  try {
    await task()
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = ''
  }
}

function needNative() {
  if (publishAvailable) return false
  toast('请在手机 App 里操作')
  return true
}

function toGallery() {
  const item = selected.value
  if (!item?.outputFileId || needNative()) return
  void run('gallery', async () => {
    await saveToGallery({ fileId: item.outputFileId!, label: labelOf(item), generationId: item.id, mime: item.outputMime })
    toast(isWeb ? publishLabels.galleryDone : item.kind === 'image' ? '已保存到相册「Pictures/TiktokCut」' : '已保存到相册「Movies/TiktokCut」')
  })
}

function share() {
  const item = selected.value
  if (!item?.outputFileId || needNative()) return
  void run('share', () => shareTo('any', { fileId: item.outputFileId!, label: labelOf(item), generationId: item.id, mime: item.outputMime }))
}

async function addTo(product: ProductItem) {
  picking.value = false
  const item = selected.value
  if (!item?.outputFileId) return
  await run('product', async () => {
    const record = await getRecord<SyncProduct>(SYNC_COLLECTIONS.products, product.id)
    if (!record?.data) throw new Error('商品不存在')
    if (record.data.images.some((image) => image.fileId === item.outputFileId)) return toast('这张图已经在商品里了')
    await saveRecord<SyncProduct>(SYNC_COLLECTIONS.products, product.id, {
      ...record.data,
      images: [...record.data.images, { fileId: item.outputFileId!, mime: item.outputMime || 'image/png' }],
    })
    toast(`已加到「${product.name}」`)
  })
}

function review(ok: boolean) {
  const item = selected.value
  if (!item) return
  void run(ok ? 'approve' : 'reject', async () => {
    await (ok ? approve(item) : reject(item))
    toast(ok ? '已通过，同步后电脑素材库也能看到' : '已移出作品库')
    selected.value = ok ? { ...item, review: 'approved' } : null
  })
}
</script>

<template>
  <template v-if="inWebShell">
    <PageHeader title="作品库" description="所有生成的图片和视频：预览、通过、下载、去发布或加到商品。">
      <template #actions>
        <button type="button" class="vg-btn" @click="router.push('/review')"><Inbox :size="14" /> 审核收件箱</button>
        <button type="button" class="vg-btn vg-btn--primary" @click="router.push('/publish')"><Send :size="14" /> 发布中心</button>
      </template>
    </PageHeader>
    <main class="vg-page wk" data-testid="web-works">
      <div class="tk-bar">
        <nav class="rv-tabs">
          <button v-for="[key, label] in FILTERS" :key="key" type="button" class="rv-tab" :class="{ 'is-active': filter === key }" @click="filter = key">{{ label }} <span class="rv-tab__count">{{ counts[key] }}</span></button>
        </nav>
      </div>
      <div v-if="shown.length" class="wk-grid">
        <button v-for="item in shown" :key="item.id" type="button" class="wk-tile" @click="selected = item">
          <span class="wk-tile__media">
            <CloudImage v-if="item.kind === 'image'" :file-id="item.outputFileId" :alt="item.label" />
            <CloudVideo v-else :file-id="item.outputFileId" />
            <span class="wk-tile__kind">{{ item.kind === 'video' ? '视频' : '图片' }}</span>
            <span v-if="item.review === 'approved'" class="wk-tile__ok"><Check :size="12" /></span>
          </span>
          <span class="wk-tile__meta"><strong>{{ labelOf(item) }}</strong><small>{{ PURPOSE[item.purpose] || '作品' }} · {{ relativeTime(item.createdAt) }}</small></span>
        </button>
      </div>
      <div v-else class="vg-empty tk-empty">
        <span class="vg-empty__icon"><ImagePlus :size="20" /></span>
        <h3>还没有作品</h3>
        <p>商品图、图生视频、复刻、视频工具生成的结果都会放在这里</p>
        <button type="button" class="vg-btn vg-btn--primary" @click="router.push('/toolbox')">去工具箱</button>
      </div>

      <div v-if="selected" class="vg-backdrop" @click.self="selected = null">
        <section class="vg-dialog vg-dialog--wide wk-dialog">
          <header class="vg-dialog__head">
            <span class="vg-dialog__title">{{ labelOf(selected) }}</span>
            <button type="button" class="vg-icon-btn" aria-label="关闭" @click="selected = null"><X :size="16" /></button>
          </header>
          <div class="vg-dialog__body wk-dialog__body">
            <div class="wk-dialog__media" :class="{ 'is-video': selected.kind === 'video' }">
              <CloudImage v-if="selected.kind === 'image'" :file-id="selected.outputFileId" :alt="selected.label" />
              <CloudVideo v-else :file-id="selected.outputFileId" controls autoplay />
            </div>
            <div class="wk-dialog__side">
              <dl class="vg-kv">
                <dt>来源</dt><dd>{{ PURPOSE[selected.purpose] || '作品' }}</dd>
                <dt>商品</dt><dd>{{ selected.productName || '—' }}</dd>
                <dt>时间</dt><dd>{{ new Date(selected.createdAt).toLocaleString() }}</dd>
                <dt>审核</dt><dd>{{ selected.review === 'approved' ? '已通过' : selected.review === 'rejected' ? '未通过' : '待审核' }}</dd>
              </dl>
              <div v-if="selected.review !== 'approved'" class="wk-dialog__row">
                <button type="button" class="vg-btn vg-btn--primary" :disabled="!!busy" @click="review(true)"><Check :size="14" /> 通过</button>
                <button type="button" class="vg-btn" :disabled="!!busy" @click="review(false)"><X :size="14" /> 不要了</button>
              </div>
              <div class="wk-dialog__col">
                <button v-if="selected.kind === 'video'" type="button" class="vg-btn vg-btn--block" @click="router.push('/publish')"><Send :size="14" /> 去发布</button>
                <button v-else type="button" class="vg-btn vg-btn--block" :disabled="!!busy" @click="picking = true"><ImagePlus :size="14" /> 加到商品</button>
                <button type="button" class="vg-btn vg-btn--block" :disabled="!!busy" @click="toGallery"><LoaderCircle v-if="busy === 'gallery'" :size="14" class="vg-spin" /><Download v-else :size="14" /> 下载</button>
                <button type="button" class="vg-btn vg-btn--block" :disabled="!!busy" @click="share"><Share2 :size="14" /> 分享</button>
              </div>
            </div>
          </div>
        </section>
      </div>
      <ProductPicker v-if="picking" @close="picking = false" @pick="addTo" />
    </main>
  </template>
  <template v-else>
  <PageHeader title="作品库" back />
  <main class="m-page m-page--no-tabs">
    <div class="m-chips filters">
      <button v-for="[key, label] in FILTERS" :key="key" type="button" class="m-chip" :class="{ 'is-active': filter === key }" @click="filter = key">
        {{ label }} {{ counts[key] }}
      </button>
    </div>

    <div v-if="shown.length" class="grid">
      <button v-for="item in shown" :key="item.id" type="button" class="tile" :class="{ 'tile--video': item.kind === 'video' }" @click="selected = item">
        <CloudImage v-if="item.kind === 'image'" :file-id="item.outputFileId" :alt="item.label" />
        <CloudVideo v-else :file-id="item.outputFileId" />
        <span class="tile__label">{{ item.label }}</span>
        <span v-if="item.review === 'approved'" class="tile__ok"><Check :size="12" /></span>
      </button>
    </div>
    <div v-else class="m-card m-empty">
      <span class="m-empty__title">还没有作品</span>
      <span class="m-empty__text">商品图、图生视频、复刻、视频工具生成的结果都会放在这里</span>
      <button type="button" class="m-btn m-btn--sm" @click="router.push('/create')">去创作</button>
    </div>
  </main>

  <Teleport to="body">
    <div v-if="selected" class="sheet-backdrop" @click.self="selected = null">
      <section class="sheet">
        <header class="sheet__head">
          <h2>{{ labelOf(selected) }}</h2>
          <button type="button" class="m-icon-btn" aria-label="关闭" @click="selected = null"><X :size="20" /></button>
        </header>
        <p class="meta">
          {{ PURPOSE[selected.purpose] || '作品' }} · {{ relativeTime(selected.createdAt) }} ·
          <span :class="selected.review === 'approved' ? 'ok' : 'pending'">{{ selected.review === 'approved' ? '已通过' : '待审核' }}</span>
        </p>
        <div class="preview" :class="{ 'preview--video': selected.kind === 'video' }">
          <CloudImage v-if="selected.kind === 'image'" :file-id="selected.outputFileId" :alt="selected.label" />
          <CloudVideo v-else :file-id="selected.outputFileId" controls autoplay />
        </div>
        <div v-if="selected.review !== 'approved'" class="actions">
          <button type="button" class="m-btn m-btn--primary" :disabled="!!busy" @click="review(true)"><Check :size="16" /> 通过</button>
          <button type="button" class="m-btn" :disabled="!!busy" @click="review(false)"><X :size="16" /> 不要了</button>
        </div>
        <div class="actions">
          <button v-if="selected.kind === 'video'" type="button" class="m-btn m-btn--primary" @click="router.push('/publish')"><Send :size="16" /> 去发布</button>
          <button v-else type="button" class="m-btn" :disabled="!!busy" @click="picking = true">
            <LoaderCircle v-if="busy === 'product'" :size="16" class="m-spin" /><ImagePlus v-else :size="16" /> 加到商品
          </button>
          <button type="button" class="m-btn" :disabled="!!busy" @click="toGallery">
            <LoaderCircle v-if="busy === 'gallery'" :size="16" class="m-spin" /><Download v-else :size="16" /> {{ publishLabels.gallery }}
          </button>
          <button type="button" class="m-btn" :disabled="!!busy" @click="share">
            <LoaderCircle v-if="busy === 'share'" :size="16" class="m-spin" /><Share2 v-else :size="16" /> 分享
          </button>
        </div>
      </section>
    </div>
  </Teleport>
  <ProductPicker v-if="picking" @close="picking = false" @pick="addTo" />
  </template>
</template>

<style scoped>
.filters { margin-top: 0; margin-bottom: 14px; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tile { position: relative; aspect-ratio: 1; overflow: hidden; padding: 0; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-control-hover); }
.tile--video { background: #000; }
.tile :deep(img), .tile :deep(video) { width: 100%; height: 100%; object-fit: cover; }
.tile__label { position: absolute; left: 6px; right: 6px; bottom: 6px; overflow: hidden; padding: 2px 6px; border-radius: 6px; background: rgba(0, 0, 0, 0.6); color: #fff; font-size: 10px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.tile__ok { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 18px; height: 18px; border-radius: 999px; background: var(--m-accent); color: #04201c; }
.sheet-backdrop { position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-end; background: var(--theme-overlay); }
.sheet { width: 100%; max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 12px var(--m-gutter) calc(16px + var(--m-safe-bottom)); border-radius: 22px 22px 0 0; background: var(--theme-panel); }
.sheet__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sheet__head h2 { margin: 0; overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.meta { margin: -6px 0 0; color: var(--theme-text-muted); font-size: 12px; }
.meta .ok { color: var(--m-green); }
.meta .pending { color: var(--m-amber); }
.preview { align-self: center; width: 70%; aspect-ratio: 1; overflow: hidden; border-radius: 12px; background: var(--theme-control-hover); }
.preview--video { width: 46%; aspect-ratio: 9 / 16; background: #000; }
.preview :deep(img), .preview :deep(video) { width: 100%; height: 100%; object-fit: contain; }
.actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 8px; }
.actions .m-btn { height: 46px; padding: 0 8px; font-size: 14px; }
</style>
