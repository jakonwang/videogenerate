<script setup lang="ts">
/**
 * tk创意室（网页版，按电脑端 TiktokCreativeStudioView 布局）：从参考图创建 / 库·导出 两个分区，
 * 右栏是电脑上的账号调度、执行规则和提示词版本（经电脑代办只读）。订单由用户电脑用 TikTok 创意账号执行。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, Boxes, Check, ChevronDown, Circle, Download, FolderOpen, ImagePlus, Inbox, KeyRound, LayoutGrid, LoaderCircle, Monitor, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import { useAssets } from '@/lib/assets'
import { CREATIVE_REQUEST_MAX_IMAGES, CREATIVE_STATE_LABEL, submitCreativeOrder, useCreativeOrders } from '@/lib/creative'
import { desktopRelayOnline, refreshDesktopRelayStatus } from '@/lib/desktopRelay'
import { fileBlob, uploadImage } from '@/lib/files'
import { useGenerations } from '@/lib/generate'
import { relativeTime, type ProductItem } from '@/lib/library'
import { downloadBlob } from '@/lib/platform'
import { errorMessage } from '@/lib/session'
import { requestSync } from '@/lib/sync'
import { toast } from '@/lib/toast'

const router = useRouter()
const tab = ref<'create' | 'library'>('create')
const orders = useCreativeOrders()
const { items: libraryImages } = useAssets((item) => item.kind === 'image')
const derived = useGenerations((item) => item.kind === 'image' && item.status === 'succeeded' && Boolean(item.outputFileId))

/* ---------------------------------------------------------------- 参考图 / 设置 */
const scenes = ref<string[]>([])
const product = ref<ProductItem | null>(null)
const mode = ref<'reference_to_video' | 'image_to_video'>('reference_to_video')
const picking = ref<'' | 'product' | 'assets' | 'derived'>('')
const uploading = ref(0)
const submitting = ref(false)
const input = ref<HTMLInputElement>()
const dragging = ref(false)
const full = computed(() => scenes.value.length >= CREATIVE_REQUEST_MAX_IMAGES)

async function addFiles(files: File[]) {
  for (const file of files.filter((f) => f.type.startsWith('image/')).slice(0, CREATIVE_REQUEST_MAX_IMAGES - scenes.value.length)) {
    uploading.value += 1
    try {
      scenes.value = [...scenes.value, (await uploadImage(file)).fileId]
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
function toggleScene(fileId?: string) {
  if (!fileId) return
  if (scenes.value.includes(fileId)) scenes.value = scenes.value.filter((id) => id !== fileId)
  else if (!full.value) scenes.value = [...scenes.value, fileId]
}

async function submit() {
  if (!product.value || !scenes.value.length) return
  submitting.value = true
  try {
    await submitCreativeOrder({ productId: product.value.id, productName: product.value.name, referenceFileIds: scenes.value, mode: mode.value })
    scenes.value = []
    toast(desktopRelayOnline.value ? '已创建任务，电脑会在下一次同步时开始' : '已创建任务，电脑打开后开始执行')
    tab.value = 'library'
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

/* ---------------------------------------------------------------- 右栏：电脑上的账号与提示词（只读） */
type Account = { id: string; name: string; enabled: boolean; state: string; credit?: number; lastError?: string }
type PromptVersion = { id: string; version: number; name: string; content: string; active?: boolean; isActive?: boolean }
const accounts = ref<Account[]>([])
const accountsOpen = ref(false)
const rulesOpen = ref(false)
const promptKind = ref<'image' | 'video'>('video')
const versions = ref<PromptVersion[]>([])
const versionId = ref('')
const version = computed(() => versions.value.find((v) => v.id === versionId.value) ?? null)
const running = computed(() => orders.value.filter((o) => o.state === 'running').length)
const attention = computed(() => orders.value.filter((o) => o.state === 'failed' || o.state === 'skipped').length)

async function loadDesktop() {
  if (!(await refreshDesktopRelayStatus())) return
  try {
    accounts.value = ((await window.api.tiktokCreative.listAccounts()) as Account[]) ?? []
  } catch { /* computer busy */ }
  await loadVersions()
}
async function loadVersions() {
  try {
    const list = ((await window.api.tiktokCreative.listPromptVersions(promptKind.value)) as PromptVersion[]) ?? []
    versions.value = list
    versionId.value = (list.find((v) => v.active || v.isActive) ?? list[0])?.id ?? ''
  } catch {
    versions.value = []
  }
}
watch(promptKind, () => { if (desktopRelayOnline.value) void loadVersions() })
onMounted(() => void loadDesktop())

const RULES = ['每张参考图生成一条视频，商品换成所选商品。', '优先使用积分最多、状态正常的创意账号，失败自动换号重试。', '图片替换和质量校验沿用图生视频，TikTok 任务数据完全独立。', '完成的视频进作品库和审核收件箱，可在发布中心发布。']

/* ---------------------------------------------------------------- 库 / 导出 */
const filter = ref<'all' | 'pending' | 'running' | 'completed' | 'failed'>('all')
const shown = computed(() => orders.value.filter((o) => filter.value === 'all' || (filter.value === 'failed' ? o.state === 'failed' || o.state === 'skipped' : o.state === filter.value)))
const doneVideos = computed(() => orders.value.flatMap((o) => (o.shots ?? []).map((s, i) => ({ order: o, index: i, fileId: s.outputFileId })).filter((x) => x.fileId)))
const exporting = ref(false)
async function exportAll(list = doneVideos.value) {
  if (!list.length) return void toast('还没有生成好的视频')
  exporting.value = true
  try {
    for (const item of list) downloadBlob(await fileBlob(item.fileId!), `${item.order.productName || 'tk创意室'}-${item.index + 1}.mp4`)
    toast(`已导出 ${list.length} 个视频`)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    exporting.value = false
  }
}
const pillOf = (state: string) => (state === 'completed' ? 'vg-pill--green' : state === 'failed' || state === 'skipped' ? 'vg-pill--red' : state === 'running' ? 'vg-pill--blue' : 'vg-pill--amber')
</script>

<template>
  <PageHeader title="tk创意室" :icon="Sparkles" description="把场景图换上你的商品，用 TikTok 创意账号批量生成短视频。">
    <template #actions>
      <button type="button" class="vg-btn" @click="requestSync(); loadDesktop()"><RefreshCw :size="15" /> 刷新</button>
    </template>
  </PageHeader>
  <main class="vg-page tc" data-testid="web-creative">
    <div class="tc-tabsrow">
      <nav class="tc-tabs">
        <button type="button" class="tc-tab" :class="{ 'is-active': tab === 'create' }" @click="tab = 'create'"><ImagePlus :size="15" /> 从参考图创建</button>
        <button type="button" class="tc-tab" :class="{ 'is-active': tab === 'library' }" @click="tab = 'library'"><FolderOpen :size="15" /> 库 / 导出 <span class="vg-count">{{ orders.length }}</span></button>
      </nav>
      <span class="vg-toolbar__spacer" />
      <button type="button" class="vg-btn vg-btn--sm" @click="accountsOpen = true"><KeyRound :size="14" /> 账号管理 <span class="vg-count">{{ accounts.length }}</span></button>
      <button type="button" class="vg-btn vg-btn--sm" @click="router.push('/review')"><Inbox :size="14" /> 审核收件箱</button>
    </div>

    <div v-if="tab === 'create'" class="tc-create">
      <div class="tc-main">
        <section class="vg-card tc-card">
          <header class="tc-card__head">
            <div><h2>参考图片</h2><p>支持 JPG、PNG、WEBP，可多选（最多 {{ CREATIVE_REQUEST_MAX_IMAGES }} 张）</p></div>
            <div class="tc-card__actions">
              <button type="button" class="vg-btn vg-btn--sm" :disabled="full" @click="input?.click()"><ImagePlus :size="13" /> 上传参考图</button>
              <button type="button" class="vg-btn vg-btn--sm" :disabled="full" @click="picking = 'assets'"><FolderOpen :size="13" /> 从素材库选图</button>
              <button type="button" class="vg-btn vg-btn--sm" :disabled="full" @click="picking = 'derived'"><LayoutGrid :size="13" /> 从衍生图选图 <span class="vg-count">{{ derived.length }}</span></button>
            </div>
          </header>
          <input ref="input" type="file" accept="image/*" multiple hidden @change="onFiles" />
          <label v-if="!scenes.length" class="tc-drop" :class="{ 'is-drag': dragging }" @click.prevent="input?.click()" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="dragging = false; addFiles(Array.from($event.dataTransfer?.files || []))">
            <span class="tc-drop__icon"><LoaderCircle v-if="uploading" :size="20" class="vg-spin" /><ImagePlus v-else :size="20" /></span>
            <span><strong>上传参考图</strong><small>支持 JPG、PNG、WEBP，可多选 · 也可以从素材库或衍生图中选择</small></span>
          </label>
          <div v-else class="tc-scenes">
            <div v-for="fileId in scenes" :key="fileId" class="tc-scene"><CloudImage :file-id="fileId" /><button type="button" class="tc-scene__x" aria-label="移除" @click="toggleScene(fileId)"><X :size="12" /></button></div>
            <button v-if="!full" type="button" class="tc-scene tc-scene--add" @click="input?.click()"><LoaderCircle v-if="uploading" :size="18" class="vg-spin" /><ImagePlus v-else :size="18" /></button>
          </div>
        </section>

        <section class="vg-card tc-card">
          <header class="tc-card__head"><div><h2>生成设置</h2><p>批量创建 TikTok 图生视频任务</p></div></header>
          <div class="tc-row"><span class="tc-row__label">生成模式</span>
            <div class="vg-seg vg-seg--sm">
              <button type="button" class="vg-seg__btn" :class="{ 'is-active': mode === 'reference_to_video' }" @click="mode = 'reference_to_video'">参考图生视频</button>
              <button type="button" class="vg-seg__btn" :class="{ 'is-active': mode === 'image_to_video' }" @click="mode = 'image_to_video'">首帧生视频</button>
            </div>
          </div>
          <div class="tc-row"><span class="tc-row__label">商品</span>
            <button type="button" class="tc-product" @click="picking = 'product'">
              <span class="tc-product__img"><CloudImage v-if="product" :file-id="product.coverFileId || product.images[0]?.fileId" /><Boxes v-else :size="16" /></span>
              <strong>{{ product?.name || '选择商品（需已同步到电脑端）' }}</strong><ChevronDown :size="15" />
            </button>
          </div>
        </section>

        <section class="vg-card tc-summary">
          <div class="tc-summary__text">
            <span class="tc-checks">
              <span :class="{ 'is-ok': scenes.length }"><Check v-if="scenes.length" :size="13" /><Circle v-else :size="12" /> 参考图片 {{ scenes.length }}</span>
              <span :class="{ 'is-ok': product }"><Check v-if="product" :size="13" /><Circle v-else :size="12" /> {{ product?.name || '商品' }}</span>
            </span>
            <small class="vg-muted"><ShieldCheck :size="13" /> 由你的电脑用 TikTok 创意账号执行；电脑关着时会等它打开再执行。</small>
          </div>
          <button type="button" class="vg-btn vg-btn--primary vg-btn--lg" data-testid="creative-submit" :disabled="submitting || !product || !scenes.length" @click="submit">
            <LoaderCircle v-if="submitting" :size="16" class="vg-spin" /><Sparkles v-else :size="16" /> 创建任务 ({{ scenes.length }})
          </button>
        </section>
      </div>

      <aside class="tc-side">
        <section class="vg-card tc-card">
          <header class="tc-card__head"><div><h2>账号调度</h2><p>{{ desktopRelayOnline ? '电脑在线 · 官方接口自动流程' : '电脑端不在线，任务会等电脑打开再执行' }}</p></div><button type="button" class="vg-btn vg-btn--sm" @click="accountsOpen = true"><KeyRound :size="13" /> 账号管理</button></header>
          <div class="tc-stats">
            <div><strong>{{ accounts.filter((a) => a.enabled).length }}<small>/{{ accounts.length }}</small></strong><span>账号管理</span></div>
            <div><strong>{{ running }}</strong><span>处理中</span></div>
            <div><strong>{{ attention }}</strong><span>需处理</span></div>
          </div>
          <button type="button" class="tc-collapse" @click="rulesOpen = !rulesOpen">执行规则 <ChevronDown :size="14" :class="{ 'is-open': rulesOpen }" /></button>
          <ol v-if="rulesOpen" class="tc-rules"><li v-for="(r, i) in RULES" :key="i"><b>{{ i + 1 }}</b>{{ r }}</li></ol>
        </section>
        <section class="vg-card tc-card">
          <header class="tc-card__head"><div><h2>质量门禁与提示词版本</h2><p>TikTok 使用独立版本库，不读取或写入图生视频提示词数据。</p></div></header>
          <div class="vg-seg tc-kind">
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': promptKind === 'image' }" @click="promptKind = 'image'">图片</button>
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': promptKind === 'video' }" @click="promptKind = 'video'">视频</button>
          </div>
          <template v-if="desktopRelayOnline && versions.length">
            <label class="vg-field"><span class="vg-field__label">提示词版本</span><select v-model="versionId" class="vg-select"><option v-for="v in versions" :key="v.id" :value="v.id">V{{ v.version }} · {{ v.name }}{{ v.active || v.isActive ? ' · 当前启用' : '' }}</option></select></label>
            <label class="vg-field"><span class="vg-field__label">版本名称</span><input class="vg-input" readonly :value="version?.name" /></label>
            <label class="vg-field"><span class="vg-field__label">{{ promptKind === 'image' ? '商品替换 Prompt' : '视频 Prompt' }}</span><textarea class="vg-textarea tc-prompt" readonly rows="8" :value="version?.content"></textarea></label>
            <p class="vg-muted tc-tiny">提示词版本在电脑上管理；网页只读查看。</p>
          </template>
          <p v-else class="vg-muted tc-tiny">{{ desktopRelayOnline ? '读取中…' : '电脑端在线时显示当前启用的提示词版本。' }}</p>
        </section>
      </aside>
    </div>

    <section v-else class="vg-card vg-card--flush tc-lib">
      <div class="vg-card__head tc-lib__bar">
        <div class="vg-seg vg-seg--sm">
          <button v-for="f in (['all', 'pending', 'running', 'completed', 'failed'] as const)" :key="f" type="button" class="vg-seg__btn" :class="{ 'is-active': filter === f }" @click="filter = f">{{ { all: '全部', pending: '等电脑接单', running: '出片中', completed: '已完成', failed: '失败' }[f] }}</button>
        </div>
        <span class="vg-toolbar__spacer" />
        <button type="button" class="vg-btn vg-btn--sm" :disabled="!doneVideos.length || exporting" @click="exportAll()"><Download :size="14" /> 导出全部视频 ({{ doneVideos.length }})</button>
      </div>
      <div v-if="shown.length" class="tc-orders">
        <article v-for="order in shown" :key="order.id" class="tc-order">
          <div class="tc-order__head">
            <strong>{{ order.productName || '商品' }} · {{ order.referenceFileIds.length }} 张</strong>
            <span class="vg-pill vg-pill--dot" :class="pillOf(order.state)">{{ CREATIVE_STATE_LABEL[order.state] }}</span>
            <span class="vg-muted tc-tiny">{{ relativeTime(order.createdAt) }}<template v-if="order.reportedAt"> · 电脑 {{ relativeTime(order.reportedAt) }}更新</template></span>
          </div>
          <p v-if="order.error" class="tc-err"><AlertTriangle :size="12" /> {{ order.error }}</p>
          <div class="tc-order__media">
            <div v-for="(fileId, i) in order.referenceFileIds" :key="fileId" class="tc-cell">
              <div class="tc-cell__ref"><CloudImage :file-id="fileId" /></div>
              <div class="tc-cell__out">
                <CloudVideo v-if="order.shots?.[i]?.outputFileId" :file-id="order.shots[i].outputFileId" controls />
                <span v-else class="tc-cell__state" :title="order.shots?.[i]?.error">
                  <LoaderCircle v-if="order.shots?.[i]?.status === 'running'" :size="14" class="vg-spin" /><AlertTriangle v-else-if="order.shots?.[i]?.status === 'failed'" :size="14" /><Monitor v-else :size="14" />
                </span>
              </div>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="vg-empty"><span class="vg-empty__icon"><FolderOpen :size="22" /></span><h3>还没有任务</h3><p>在「从参考图创建」上传参考图、选商品后创建。</p></div>
    </section>

    <ProductPicker v-if="picking === 'product'" @close="picking = ''" @pick="(item: ProductItem) => { product = item; picking = '' }" />
    <div v-else-if="picking" class="vg-backdrop" @click.self="picking = ''">
      <div class="vg-dialog tc-dialog" role="dialog" aria-modal="true">
        <div class="vg-dialog__head"><span class="vg-dialog__title">{{ picking === 'assets' ? '从素材库选图' : '从衍生图选图' }}</span><button type="button" class="vg-icon-btn" aria-label="关闭" @click="picking = ''"><X :size="16" /></button></div>
        <div class="vg-dialog__body">
          <div class="tc-pick-grid">
            <template v-if="picking === 'assets'"><button v-for="a in libraryImages" :key="a.id" type="button" class="tc-pick" :class="{ 'is-active': scenes.includes(a.fileId) }" @click="toggleScene(a.fileId)"><CloudImage :file-id="a.fileId" /></button></template>
            <template v-else><button v-for="g in derived" :key="g.id" type="button" class="tc-pick" :class="{ 'is-active': scenes.includes(g.outputFileId!) }" @click="toggleScene(g.outputFileId)"><CloudImage :file-id="g.outputFileId" /></button></template>
          </div>
        </div>
        <div class="vg-dialog__foot tc-dialog__foot"><span class="vg-muted tc-tiny">已选 {{ scenes.length }}/{{ CREATIVE_REQUEST_MAX_IMAGES }} 张</span><button type="button" class="vg-btn vg-btn--primary" @click="picking = ''">完成</button></div>
      </div>
    </div>

    <div v-if="accountsOpen" class="vg-backdrop" @click.self="accountsOpen = false">
      <div class="vg-dialog tc-dialog" role="dialog" aria-modal="true">
        <div class="vg-dialog__head"><span class="vg-dialog__title"><KeyRound :size="15" /> 账号管理</span><button type="button" class="vg-icon-btn" aria-label="关闭" @click="accountsOpen = false"><X :size="16" /></button></div>
        <div class="vg-dialog__body">
          <div v-if="accounts.length" class="vg-list">
            <div v-for="a in accounts" :key="a.id" class="vg-list__item">
              <span class="vg-list__main"><span class="vg-list__title">{{ a.name }}</span><span class="vg-list__sub">{{ a.enabled ? '启用' : '停用' }} · {{ a.state }}<template v-if="a.credit !== undefined"> · 积分 {{ a.credit }}</template><template v-if="a.lastError"> · {{ a.lastError }}</template></span></span>
            </div>
          </div>
          <p v-else class="vg-muted">{{ desktopRelayOnline ? '电脑上还没有 TikTok 创意账号。' : '电脑端在线时显示账号。' }}</p>
          <p class="vg-muted tc-tiny">导入、测试和编辑账号要在电脑上操作（账号 Cookie 只保存在电脑上）。</p>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.tc { display: flex; flex-direction: column; gap: 14px; width: min(1408px, 100%); margin: 0 auto; }
.tc-tabsrow { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--theme-border); }
.tc-tabs { display: flex; gap: 6px; }
.tc-tab { display: inline-flex; align-items: center; gap: 6px; padding: 10px 14px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--theme-text-secondary); font-weight: 600; cursor: pointer; }
.tc-tab.is-active { border-bottom-color: var(--vg-accent); color: var(--theme-text); }
.tc-create { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
@media (max-width: 1200px) { .tc-create { grid-template-columns: minmax(0, 1fr); } }
.tc-main, .tc-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.tc-card { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; }
.tc-card__head { display: flex; align-items: flex-start; gap: 10px; }
.tc-card__head > div:first-child { flex: 1; min-width: 0; }
.tc-card__head h2 { font-size: 16px; font-weight: 800; }
.tc-card__head p { margin-top: 2px; font-size: 12px; color: var(--theme-text-muted); }
.tc-card__actions { display: flex; flex-wrap: wrap; gap: 6px; }
.tc-drop { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 34px 16px; border: 1px dashed var(--theme-border-strong, var(--theme-border)); border-radius: 12px; cursor: pointer; }
.tc-drop.is-drag { border-color: var(--vg-accent); background: var(--vg-accent-soft); }
.tc-drop > span:last-child { display: flex; flex-direction: column; gap: 4px; }
.tc-drop small { font-size: 12px; color: var(--theme-text-muted); }
.tc-drop__icon { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 12px; background: var(--vg-accent-soft); color: var(--vg-accent); }
.tc-scenes { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
.tc-scene { position: relative; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 10px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.tc-scene :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.tc-scene__x { position: absolute; top: 4px; right: 4px; display: grid; place-items: center; width: 20px; height: 20px; border: 0; border-radius: 50%; background: rgb(0 0 0 / .6); color: #fff; cursor: pointer; }
.tc-scene--add { display: grid; place-items: center; border-style: dashed; color: var(--theme-text-muted); cursor: pointer; }
.tc-row { display: grid; grid-template-columns: 110px minmax(0, 1fr); align-items: center; gap: 12px; padding-top: 12px; border-top: 1px solid var(--theme-border); }
.tc-row:first-of-type { border-top: 0; padding-top: 0; }
.tc-row__label { font-size: 13px; font-weight: 700; }
.tc-product { display: flex; align-items: center; gap: 10px; max-width: 520px; padding: 8px 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); cursor: pointer; text-align: left; }
.tc-product strong { flex: 1; overflow: hidden; font-size: 13.5px; text-overflow: ellipsis; white-space: nowrap; }
.tc-product__img { display: grid; place-items: center; width: 30px; height: 30px; overflow: hidden; border-radius: 7px; background: var(--theme-panel); color: var(--theme-text-muted); }
.tc-product__img :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.tc-summary { display: flex; align-items: center; gap: 16px; padding: 14px 18px; }
.tc-summary__text { display: flex; flex: 1; flex-direction: column; gap: 6px; }
.tc-checks { display: flex; gap: 16px; font-size: 13px; font-weight: 700; color: var(--theme-text-muted); }
.tc-checks span { display: inline-flex; align-items: center; gap: 4px; }
.tc-checks .is-ok { color: var(--theme-text); }
.tc-checks .is-ok svg { color: var(--vg-accent); }
.tc-summary small { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; }
.tc-stats { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--theme-border); border-radius: 10px; }
.tc-stats > div { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-left: 1px solid var(--theme-border); }
.tc-stats > div:first-child { border-left: 0; }
.tc-stats strong { font-size: 20px; font-weight: 800; }
.tc-stats strong small { font-size: 12px; color: var(--theme-text-muted); }
.tc-stats span { font-size: 11.5px; color: var(--theme-text-muted); }
.tc-collapse { display: flex; align-items: center; justify-content: space-between; padding: 8px 0 0; border: 0; border-top: 1px solid var(--theme-border); background: none; color: var(--theme-text); font-weight: 700; font-size: 13px; cursor: pointer; }
.tc-collapse svg.is-open { transform: rotate(180deg); }
.tc-rules { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; font-size: 12.5px; }
.tc-rules li { display: flex; gap: 8px; line-height: 1.6; }
.tc-rules b { color: var(--theme-text-muted); }
.tc-kind { width: 100%; }
.tc-kind .vg-seg__btn { flex: 1; justify-content: center; }
.tc-prompt { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.6; }
.tc-tiny { font-size: 12px; }
.tc-lib__bar { gap: 8px; }
.tc-orders { display: flex; flex-direction: column; }
.tc-order { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-top: 1px solid var(--theme-border); }
.tc-order:first-child { border-top: 0; }
.tc-order__head { display: flex; align-items: center; gap: 10px; }
.tc-order__head strong { font-size: 13.5px; }
.tc-err { display: flex; align-items: center; gap: 4px; margin: 0; font-size: 12px; color: var(--vg-red); }
.tc-order__media { display: flex; flex-wrap: wrap; gap: 12px; }
.tc-cell { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--theme-border); border-radius: 10px; }
.tc-cell__ref, .tc-cell__out { width: 72px; aspect-ratio: 9 / 16; overflow: hidden; border-radius: 7px; background: var(--theme-panel-soft); }
.tc-cell__ref :deep(img), .tc-cell__out :deep(video) { width: 100%; height: 100%; object-fit: cover; }
.tc-cell__state { display: grid; place-items: center; height: 100%; color: var(--theme-text-muted); }
.tc-dialog { width: min(720px, calc(100vw - 32px)); }
.tc-dialog__foot { display: flex; align-items: center; justify-content: space-between; }
.tc-pick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; max-height: 60vh; overflow: auto; }
.tc-pick { aspect-ratio: 1; overflow: hidden; padding: 0; border: 2px solid transparent; border-radius: 10px; background: var(--theme-panel-soft); cursor: pointer; }
.tc-pick.is-active { border-color: var(--vg-accent); }
.tc-pick :deep(img) { width: 100%; height: 100%; object-fit: cover; }
</style>
