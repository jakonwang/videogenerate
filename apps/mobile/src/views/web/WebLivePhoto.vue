<script setup lang="ts">
/**
 * 图生视频（网页版，按电脑端 LivePhotoGeneratorView）：参考图 + 商品 → 商品替换图 → 视频。
 * 两个分区：从参考图创建 / 库·导出。云端执行，关掉网页也会继续。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Boxes, Check, Download, FolderOpen, ImagePlus, Inbox, LayoutGrid, LoaderCircle, RefreshCw, RotateCcw, Sparkles, Trash2, X } from 'lucide-vue-next'
import { PRODUCT_REPLACEMENT_PROMPT } from '@shared/productReplacementPrompt'
import { SYNC_COLLECTIONS, type SyncProduct } from '@shared/cloud/sync'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import { useAssets } from '@/lib/assets'
import { fileBlob, uploadImage } from '@/lib/files'
import { startPolling, useGenerations, VIDEO_BASE_PROMPT, VIDEO_MOTIONS } from '@/lib/generate'
import { relativeTime, type ProductItem } from '@/lib/library'
import { LIVE_PHOTO_STAGE, createLivePhotoItems, retryLivePhotoItem, useLivePhotoItems, type LivePhotoItem } from '@/lib/livePhoto'
import { downloadBlob } from '@/lib/platform'
import { errorMessage } from '@/lib/session'
import { deleteRecord, getRecord, requestSync } from '@/lib/sync'
import { toast } from '@/lib/toast'
import { useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const tab = ref<'create' | 'library'>('create')
const items = useLivePhotoItems()
const { items: libraryImages } = useAssets((item) => item.kind === 'image')
const derived = useGenerations((item) => item.kind === 'image' && item.status === 'succeeded' && Boolean(item.outputFileId))

/* ---------------------------------------------------------------- 创建 */
type Ref = { fileId: string; width?: number; height?: number }
const refs = ref<Ref[]>([])
const product = ref<ProductItem | null>(null)
const picking = ref<'' | 'product' | 'assets' | 'derived'>('')
const motion = ref<(typeof VIDEO_MOTIONS)[number]['key']>('subtle')
const duration = ref(6)
const uploading = ref(0)
const submitting = ref(false)
const input = ref<HTMLInputElement>()
const dragging = ref(false)
const productImage = computed(() => product.value?.coverFileId || product.value?.images[0]?.fileId)

onMounted(async () => {
  startPolling()
  const productId = route.query.product ? String(route.query.product) : ''
  if (!productId) return
  const record = await getRecord<SyncProduct>(SYNC_COLLECTIONS.products, productId)
  if (record?.data) product.value = { ...record.data, id: productId, updatedAt: record.updatedAt, pending: false }
})

async function addFiles(files: File[]) {
  for (const file of files.filter((f) => f.type.startsWith('image/'))) {
    uploading.value += 1
    try {
      const ref = await uploadImage(file)
      refs.value = [...refs.value, { fileId: ref.fileId, width: ref.width, height: ref.height }]
    } catch (error) {
      toast(`上传失败：${errorMessage(error)}`)
    } finally {
      uploading.value -= 1
    }
  }
}
function onFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || [])
  ;(event.target as HTMLInputElement).value = ''
  void addFiles(files)
}
function onDrop(event: DragEvent) {
  dragging.value = false
  void addFiles(Array.from(event.dataTransfer?.files || []))
}
function toggleRef(ref: Ref) {
  refs.value = refs.value.some((r) => r.fileId === ref.fileId) ? refs.value.filter((r) => r.fileId !== ref.fileId) : [...refs.value, ref]
}
const isPicked = (fileId?: string) => Boolean(fileId && refs.value.some((r) => r.fileId === fileId))

async function create() {
  if (!product.value || !productImage.value || !refs.value.length) return
  submitting.value = true
  try {
    const fileIds = [productImage.value, ...product.value.images.map((i) => i.fileId).filter((id) => id !== productImage.value)]
    await createLivePhotoItems({ product: { id: product.value.id, name: product.value.name, fileIds }, refs: refs.value, motion: motion.value, durationSec: duration.value })
    toast(`已创建 ${refs.value.length} 个图生视频任务`)
    refs.value = []
    tab.value = 'library'
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

const RULES = [
  '保持相同的人物身份、姿态、构图、光线和场景布局。',
  '仅使用所选商品快照替换商品本身。',
  '先调用 AI 视频模型生成目标视频片段。',
  '将生成结果整理为图片、视频和清单文件，并输出到导出包中。',
]
const promptTab = ref<'image' | 'video'>('image')

/* ---------------------------------------------------------------- 库 / 导出 */
type Filter = 'all' | 'running' | 'done' | 'failed'
const filter = ref<Filter>('all')
const selected = ref<string[]>([])
const groupOf = (item: LivePhotoItem): Exclude<Filter, 'all'> => (item.stage === 'done' ? 'done' : item.stage.endsWith('failed') ? 'failed' : 'running')
const counts = computed(() => ({
  all: items.value.length,
  running: items.value.filter((i) => groupOf(i) === 'running').length,
  done: items.value.filter((i) => groupOf(i) === 'done').length,
  failed: items.value.filter((i) => groupOf(i) === 'failed').length,
}))
const shown = computed(() => items.value.filter((i) => filter.value === 'all' || groupOf(i) === filter.value))
const allChecked = computed(() => shown.value.length > 0 && shown.value.every((i) => selected.value.includes(i.id)))
function toggleAll() {
  selected.value = allChecked.value ? [] : shown.value.map((i) => i.id)
}
const exporting = ref(false)
async function exportSelected() {
  const chosen = items.value.filter((i) => selected.value.includes(i.id) && i.videoFileId)
  if (!chosen.length) return void toast('所选任务还没有生成好的视频')
  exporting.value = true
  try {
    for (const [index, item] of chosen.entries()) downloadBlob(await fileBlob(item.videoFileId!), `${item.productName || '图生视频'}-${index + 1}.mp4`)
    toast(`已导出 ${chosen.length} 个视频`)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    exporting.value = false
  }
}
async function retry(item: LivePhotoItem) {
  try {
    await retryLivePhotoItem(item)
    toast('已重新提交')
  } catch (error) {
    toast(errorMessage(error))
  }
}
async function remove(ids: string[]) {
  if (!ids.length || !window.confirm(`删除 ${ids.length} 个图生视频任务？生成的图片和视频仍在作品库里。`)) return
  for (const id of ids) await deleteRecord(SYNC_COLLECTIONS.livePhotoItems, id)
  selected.value = selected.value.filter((id) => !ids.includes(id))
}
</script>

<template>
  <PageHeader title="图生视频" :icon="Sparkles" description="在参考图任务与素材库之间快速切换">
    <template #actions>
      <button type="button" class="vg-btn" @click="router.push('/review')"><Inbox :size="15" /> 审核收件箱</button>
      <button type="button" class="vg-btn" @click="requestSync()"><RefreshCw :size="15" /> 刷新</button>
    </template>
  </PageHeader>
  <main class="vg-page lp" data-testid="web-live-photo">
    <nav class="lp-tabs">
      <button type="button" class="lp-tab" :class="{ 'is-active': tab === 'create' }" @click="tab = 'create'"><ImagePlus :size="15" /> 从参考图创建</button>
      <button type="button" class="lp-tab" :class="{ 'is-active': tab === 'library' }" @click="tab = 'library'"><FolderOpen :size="15" /> 库 / 导出 <span class="vg-count">{{ items.length }}</span></button>
    </nav>

    <div v-if="tab === 'create'" class="lp-create">
      <section class="vg-card lp-card">
        <header class="lp-card__head"><span class="lp-num">1</span><div><h2>参考图替换</h2><p>按当前比例批量创建任务</p></div></header>
        <span class="lp-label">参考图片</span>
        <label class="lp-drop" :class="{ 'is-drag': dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
          <input ref="input" type="file" accept="image/*" multiple hidden @change="onFiles" />
          <span class="lp-drop__icon"><LoaderCircle v-if="uploading" :size="22" class="vg-spin" /><ImagePlus v-else :size="22" /></span>
          <strong>{{ uploading ? '上传中…' : '点击上传或拖拽图片到此处' }}</strong>
          <small>支持 JPG、PNG、WEBP，建议宽度 2000 像素以上，可连续追加多张图片。</small>
        </label>
        <div v-if="refs.length" class="lp-refs">
          <div v-for="ref in refs" :key="ref.fileId" class="lp-ref"><CloudImage :file-id="ref.fileId" /><button type="button" class="lp-ref__x" aria-label="移除" @click="toggleRef(ref)"><X :size="12" /></button></div>
        </div>
        <div class="lp-pickers">
          <button type="button" class="vg-btn" @click="picking = 'assets'"><FolderOpen :size="14" /> 从素材库选择</button>
          <button type="button" class="vg-btn" @click="picking = 'derived'"><LayoutGrid :size="14" /> 从衍生图选图 <span class="vg-count">{{ derived.length }}</span></button>
        </div>

        <span class="lp-label">商品</span>
        <div class="lp-product">
          <button type="button" class="lp-product__pick" @click="picking = 'product'">
            <span class="lp-product__img"><CloudImage v-if="productImage" :file-id="productImage" /><Boxes v-else :size="18" /></span>
            <span class="lp-product__text"><strong>{{ product?.name || '选择商品' }}</strong><small>{{ product ? product.type : '从商品库选择' }}</small></span>
          </button>
          <div class="lp-product__main">
            <span class="lp-product__img"><CloudImage v-if="productImage" :file-id="productImage" /></span>
            <span class="lp-product__text"><small>图生视频主图</small><strong>{{ productImage ? '商品封面图' : '—' }}</strong></span>
          </div>
        </div>

        <span class="lp-label">视频参数</span>
        <div class="lp-params">
          <div class="vg-seg vg-seg--sm"><button v-for="m in VIDEO_MOTIONS" :key="m.key" type="button" class="vg-seg__btn" :class="{ 'is-active': motion === m.key }" @click="motion = m.key">{{ m.label }}</button></div>
          <div class="vg-seg vg-seg--sm"><button v-for="d in [5, 6, 8]" :key="d" type="button" class="vg-seg__btn" :class="{ 'is-active': duration === d }" @click="duration = d">{{ d }} 秒</button></div>
        </div>

        <footer class="lp-foot">
          <span class="vg-muted"><Check :size="14" /> 系统会读取商品参考数据，生成替换图后继续生成视频与图生视频素材。</span>
          <button type="button" class="vg-btn vg-btn--primary vg-btn--lg" data-testid="live-photo-create" :disabled="submitting || !product || !refs.length" @click="create">
            <LoaderCircle v-if="submitting" :size="16" class="vg-spin" /><Sparkles v-else :size="16" /> 创建图生视频任务 ({{ refs.length }})
          </button>
        </footer>
      </section>

      <aside class="lp-side">
        <section class="vg-card lp-card">
          <header class="lp-card__head"><span class="lp-num">2</span><div><h2>执行规则</h2><p>参考图任务会生成替换图、动态预览视频与图生视频结果，完成后可在素材库统一导出。</p></div><span class="vg-pill">V1 默认</span></header>
          <ol class="lp-rules"><li v-for="(rule, i) in RULES" :key="i"><b>{{ i + 1 }}</b>{{ rule }}</li></ol>
        </section>
        <section class="vg-card lp-card">
          <header class="lp-card__head">
            <span class="lp-num">3</span><div><h2>提示词版本</h2></div>
            <div class="vg-seg vg-seg--sm"><button type="button" class="vg-seg__btn" :class="{ 'is-active': promptTab === 'image' }" @click="promptTab = 'image'">图片</button><button type="button" class="vg-seg__btn" :class="{ 'is-active': promptTab === 'video' }" @click="promptTab = 'video'">视频</button></div>
          </header>
          <div class="vg-form-grid">
            <label class="vg-field"><span class="vg-field__label">提示词版本</span><select class="vg-select"><option>V1 · 云端默认</option></select></label>
            <label class="vg-field"><span class="vg-field__label">版本名称</span><input class="vg-input" readonly :value="promptTab === 'image' ? 'Live Photo Product Replacement' : 'Live Photo Image To Video'" /></label>
          </div>
          <label class="vg-field"><span class="vg-field__label">Prompt 内容</span><textarea class="vg-textarea lp-prompt" readonly rows="10" :value="promptTab === 'image' ? PRODUCT_REPLACEMENT_PROMPT : VIDEO_BASE_PROMPT"></textarea></label>
          <p class="vg-muted lp-tiny">网页版使用云端统一的提示词；自定义提示词版本请在电脑端管理。</p>
        </section>
      </aside>
    </div>

    <section v-else class="vg-card vg-card--flush lp-lib">
      <div class="vg-card__head lp-lib__bar">
        <div class="vg-seg vg-seg--sm">
          <button v-for="f in (['all', 'running', 'done', 'failed'] as const)" :key="f" type="button" class="vg-seg__btn" :class="{ 'is-active': filter === f }" @click="filter = f">
            {{ { all: '全部', running: '进行中', done: '已完成', failed: '失败' }[f] }} <span class="vg-count">{{ counts[f] }}</span>
          </button>
        </div>
        <span class="vg-toolbar__spacer" />
        <span v-if="selected.length" class="vg-muted lp-tiny">已选 {{ selected.length }} 个</span>
        <button type="button" class="vg-btn vg-btn--sm" :disabled="!selected.length || exporting" @click="exportSelected"><Download :size="14" /> 导出所选</button>
        <button type="button" class="vg-btn vg-btn--sm vg-btn--danger" :disabled="!selected.length" @click="remove(selected)"><Trash2 :size="14" /> 删除</button>
      </div>
      <div v-if="shown.length" class="vg-table-wrap">
        <table class="vg-table">
          <thead><tr><th style="width: 40px"><input type="checkbox" :checked="allChecked" aria-label="全选" @change="toggleAll" /></th><th>参考图</th><th>替换图</th><th>视频</th><th>商品</th><th>状态</th><th>创建时间</th><th style="width: 150px"></th></tr></thead>
          <tbody>
            <tr v-for="item in shown" :key="item.id">
              <td><input v-model="selected" type="checkbox" :value="item.id" /></td>
              <td><span class="lp-thumb"><CloudImage :file-id="item.refFileId" /></span></td>
              <td><span class="lp-thumb"><CloudImage v-if="item.replaceFileId" :file-id="item.replaceFileId" /><LoaderCircle v-else-if="item.stage === 'replacing'" :size="16" class="vg-spin" /></span></td>
              <td><span class="lp-thumb lp-thumb--video"><CloudVideo v-if="item.videoFileId" :file-id="item.videoFileId" controls /><LoaderCircle v-else-if="item.stage === 'video' || item.stage === 'replacing'" :size="16" class="vg-spin" /></span></td>
              <td>{{ item.productName }}</td>
              <td>
                <span class="vg-pill vg-pill--dot" :class="`vg-pill--${LIVE_PHOTO_STAGE[item.stage].tone}`">{{ LIVE_PHOTO_STAGE[item.stage].label }}</span>
                <p v-if="item.error" class="lp-err" :title="item.error">{{ item.error }}</p>
              </td>
              <td class="vg-muted">{{ relativeTime(item.createdAt) }}</td>
              <td class="lp-actions">
                <button v-if="item.stage.endsWith('failed')" type="button" class="vg-btn vg-btn--xs" @click="retry(item)"><RotateCcw :size="12" /> 重试</button>
                <button v-if="item.videoFileId" type="button" class="vg-btn vg-btn--xs" @click="selected = [item.id]; exportSelected()"><Download :size="12" /> 下载</button>
                <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="删除" @click="remove([item.id])"><Trash2 :size="13" /></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="vg-empty"><span class="vg-empty__icon"><FolderOpen :size="22" /></span><h3>还没有图生视频任务</h3><p>在「从参考图创建」上传参考图并选择商品后创建。</p></div>
    </section>

    <ProductPicker v-if="picking === 'product'" @close="picking = ''" @pick="(item: ProductItem) => { product = item; picking = '' }" />
    <div v-else-if="picking" class="vg-backdrop" @click.self="picking = ''">
      <div class="vg-dialog lp-dialog" role="dialog" aria-modal="true">
        <div class="vg-dialog__head"><span class="vg-dialog__title">{{ picking === 'assets' ? '从素材库选择' : '从衍生图选图' }}</span><button type="button" class="vg-icon-btn" aria-label="关闭" @click="picking = ''"><X :size="16" /></button></div>
        <div class="vg-dialog__body">
          <div v-if="picking === 'assets' ? libraryImages.length : derived.length" class="lp-pick-grid">
            <template v-if="picking === 'assets'">
              <button v-for="a in libraryImages" :key="a.id" type="button" class="lp-pick" :class="{ 'is-active': isPicked(a.fileId) }" :title="a.name" @click="toggleRef({ fileId: a.fileId, width: a.width, height: a.height })"><CloudImage :file-id="a.fileId" /><Check v-if="isPicked(a.fileId)" :size="14" class="lp-pick__check" /></button>
            </template>
            <template v-else>
              <button v-for="g in derived" :key="g.id" type="button" class="lp-pick" :class="{ 'is-active': isPicked(g.outputFileId) }" :title="g.label" @click="toggleRef({ fileId: g.outputFileId! })"><CloudImage :file-id="g.outputFileId" /><Check v-if="isPicked(g.outputFileId)" :size="14" class="lp-pick__check" /></button>
            </template>
          </div>
          <p v-else class="vg-muted">{{ picking === 'assets' ? '素材库里还没有图片。' : '还没有生成过的图片（商品图素材、商品替换的结果会出现在这里）。' }}</p>
        </div>
        <div class="vg-dialog__foot"><span class="vg-muted lp-tiny">已选 {{ refs.length }} 张</span><button type="button" class="vg-btn vg-btn--primary" @click="picking = ''">完成</button></div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.lp { display: flex; flex-direction: column; gap: 14px; width: min(1408px, 100%); margin: 0 auto; }
.lp-tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--theme-border); }
.lp-tab { display: inline-flex; align-items: center; gap: 6px; padding: 10px 14px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--theme-text-secondary); font-weight: 600; cursor: pointer; }
.lp-tab.is-active { border-bottom-color: var(--vg-accent); color: var(--theme-text); }
.lp-create { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1200px) { .lp-create { grid-template-columns: minmax(0, 1fr); } }
.lp-side { display: flex; flex-direction: column; gap: 16px; }
.lp-card { display: flex; flex-direction: column; gap: 12px; padding: 20px; }
.lp-card__head { display: flex; align-items: flex-start; gap: 12px; }
.lp-card__head > div { flex: 1; min-width: 0; }
.lp-card__head h2 { font-size: 17px; font-weight: 800; }
.lp-card__head p { margin-top: 2px; font-size: 12px; color: var(--theme-text-muted); line-height: 1.6; }
.lp-num { display: grid; place-items: center; width: 28px; height: 28px; flex-shrink: 0; border-radius: 8px; background: var(--vg-accent-soft); border: 1px solid var(--vg-accent-line); color: var(--vg-accent); font-weight: 800; font-size: 13px; }
.lp-label { font-size: 13px; font-weight: 700; }
.lp-drop { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 26px 16px; border: 1px dashed var(--theme-border-strong, var(--theme-border)); border-radius: 12px; background: var(--theme-panel-soft); text-align: center; cursor: pointer; }
.lp-drop.is-drag { border-color: var(--vg-accent); background: var(--vg-accent-soft); }
.lp-drop__icon { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 12px; background: var(--vg-accent-soft); color: var(--vg-accent); }
.lp-drop small { max-width: 420px; font-size: 12px; color: var(--theme-text-muted); line-height: 1.6; }
.lp-refs { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px; }
.lp-ref { position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 10px; border: 1px solid var(--theme-border); }
.lp-ref :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.lp-ref__x { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 20px; height: 20px; border: 0; border-radius: 50%; background: rgb(0 0 0 / .6); color: #fff; cursor: pointer; }
.lp-pickers { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.lp-pickers .vg-btn { justify-content: center; }
.lp-product { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.lp-product__pick, .lp-product__main { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); color: var(--theme-text); text-align: left; min-width: 0; }
.lp-product__pick { cursor: pointer; }
.lp-product__img { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; overflow: hidden; border-radius: 8px; background: var(--theme-panel); color: var(--theme-text-muted); }
.lp-product__img :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.lp-product__text { display: flex; flex-direction: column; min-width: 0; }
.lp-product__text strong { overflow: hidden; font-size: 13.5px; text-overflow: ellipsis; white-space: nowrap; }
.lp-product__text small { font-size: 11.5px; color: var(--theme-text-muted); }
.lp-params { display: flex; flex-wrap: wrap; gap: 10px; }
.lp-foot { display: flex; align-items: center; gap: 12px; padding-top: 12px; border-top: 1px solid var(--theme-border); }
.lp-foot > span { display: flex; align-items: center; gap: 6px; flex: 1; font-size: 12px; line-height: 1.6; }
.lp-rules { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; border: 1px solid var(--theme-border); border-radius: 10px; }
.lp-rules li { display: flex; gap: 12px; padding: 11px 14px; font-size: 13px; border-top: 1px solid var(--theme-border); }
.lp-rules li:first-child { border-top: 0; }
.lp-rules b { color: var(--theme-text-muted); font-size: 12px; }
.lp-prompt { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.6; }
.lp-tiny { font-size: 12px; }
.lp-lib__bar { gap: 8px; }
.lp-thumb { display: grid; place-items: center; width: 56px; height: 56px; overflow: hidden; border-radius: 8px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); color: var(--theme-text-muted); }
.lp-thumb--video { width: 48px; height: 84px; }
.lp-thumb :deep(img), .lp-thumb :deep(video) { width: 100%; height: 100%; object-fit: cover; }
.lp-err { max-width: 220px; margin: 4px 0 0; overflow: hidden; font-size: 11.5px; color: var(--vg-red); text-overflow: ellipsis; white-space: nowrap; }
.lp-actions { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.lp-dialog { width: min(760px, calc(100vw - 32px)); }
.lp-pick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; max-height: 60vh; overflow: auto; }
.lp-pick { position: relative; aspect-ratio: 1; overflow: hidden; padding: 0; border: 2px solid transparent; border-radius: 10px; background: var(--theme-panel-soft); cursor: pointer; }
.lp-pick.is-active { border-color: var(--vg-accent); }
.lp-pick :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.lp-pick__check { position: absolute; top: 6px; right: 6px; padding: 2px; border-radius: 50%; background: var(--vg-accent); color: #fff; }
.vg-dialog__foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
</style>
