<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Clapperboard, ImagePlus, Store, Trash2 } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncProduct } from '@shared/cloud/sync'
import { productCategoryLabel } from '@shared/productCategories'
import CategoryChips from '@/components/CategoryChips.vue'
import ImageGrid from '@/components/ImageGrid.vue'
import PageHeader from '@/components/PageHeader.vue'
import { deleteRecord, getRecord, newId, saveRecord } from '@/lib/sync'
import { toast } from '@/lib/toast'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
import { Copy, FileText, LayoutGrid, Send, Sparkles, Wand2 } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import GenerationTile from '@/components/GenerationTile.vue'
import { useGenerations } from '@/lib/generate'
import { ArrowRight, Brain, GitBranch, Lightbulb, Link2, LoaderCircle, Megaphone, Save, TrendingUp, Upload, Users } from 'lucide-vue-next'
import { SYNC_COLLECTIONS as SC, type SyncProductMemory } from '@shared/cloud/sync'
import { uploadImage } from '@/lib/files'
import { relativeTime } from '@/lib/library'
import { useCreativeOrders } from '@/lib/creative'
import { errorMessage } from '@/lib/session'
import { watch } from 'vue'
import { useCloneProjects } from '@/lib/clone'
import { usePublishRecords } from '@/lib/publish'
const detailTab = ref<'space' | 'info'>('space')
const productContent = useGenerations((item) => item.productId === String(route.params.id) && item.status !== 'failed')
const productClones = computed(() => useCloneProjectsList.value.filter((p) => p.productId === String(route.params.id)))
const useCloneProjectsList = useCloneProjects()
const publishRecords = usePublishRecords()
const creativeOrders = useCreativeOrders()
const productOrders = computed(() => creativeOrders.value.filter((o) => o.productId === String(route.params.id)))
const productFileIds = computed(() => new Set(productContent.value.map((item) => item.outputFileId).filter(Boolean)))
const productPublish = computed(() => publishRecords.value.filter((r) => productFileIds.value.has(r.fileId)))
/* 同电脑端：复刻 / tk创意室 / 图生视频 / 发布，各自「生成中 · 已通过」 */
const contentLines = computed(() => {
  const by = (purpose: string) => productContent.value.filter((item) => item.purpose === purpose)
  const runningOf = (list: { status: string }[]) => list.filter((item) => item.status === 'queued' || item.status === 'running').length
  const approvedOf = (list: { review: string }[]) => list.filter((item) => item.review === 'approved').length
  const creative = by('creative')
  const video = by('image-to-video')
  return [
    { key: 'clone', label: '复刻', icon: Copy, count: productClones.value.length, sub: `生成中 ${productClones.value.filter((p) => !p.finalFileId && p.analyzeStatus !== 'failed').length} · 已出片 ${productClones.value.filter((p) => p.finalFileId).length}` },
    { key: 'creative', label: 'tk创意室', icon: Megaphone, count: productOrders.value.length + creative.length, sub: `生成中 ${productOrders.value.filter((o) => o.state === 'running' || o.state === 'pending').length} · 已通过 ${approvedOf(creative)}` },
    { key: 'video', label: '图生视频', icon: Sparkles, count: video.length, sub: `生成中 ${runningOf(video)} · 已通过 ${approvedOf(video)}` },
    { key: 'publish', label: '发布', icon: Send, count: productPublish.value.length, sub: `TikTok ${productPublish.value.filter((r) => r.target === 'tiktok').length} 条` },
  ]
})

/* 商品链路：素材 → 发布 → 投放 → 达人 */
const chain = computed(() => {
  const videos = productContent.value.filter((item) => item.kind === 'video')
  const bound = Boolean(form.tiktokProductIds?.length)
  return [
    { label: '素材', icon: Clapperboard, value: String(videos.filter((v) => v.status === 'succeeded').length + productClones.value.filter((p) => p.finalFileId).length), sub: `可用成片 · 生成中 ${videos.filter((v) => v.status === 'queued' || v.status === 'running').length}` },
    { label: '发布', icon: Send, value: String(productPublish.value.length), sub: '已发布视频' },
    { label: '投放', icon: Megaphone, value: bound ? '查看' : '—', sub: bound ? '在 GMV Max 查看投放数据' : '绑定店铺商品后可见' },
    { label: '达人', icon: Users, value: bound ? '查看' : '—', sub: bound ? '在达人中心查看带货达人' : '绑定店铺商品后可见' },
  ]
})
const nextSteps = computed(() => {
  const tips: Array<{ text: string; to?: string }> = []
  const pending = productContent.value.filter((item) => item.status === 'succeeded' && item.review === 'pending').length
  const approvedVideos = productContent.value.filter((item) => item.kind === 'video' && item.review === 'approved').length
  if (!form.images.length) tips.push({ text: '先在「商品资料」里上传商品图' })
  if (!productContent.value.length && !productClones.value.length) tips.push({ text: '还没有任何内容，先做第一套内容', to: `/producer?prompt=${encodeURIComponent(`为商品「${form.name}」做一套内容`)}` })
  if (pending) tips.push({ text: `${pending} 条内容等你审核`, to: '/review' })
  if (approvedVideos && !productPublish.value.length) tips.push({ text: `${approvedVideos} 条视频已通过，可以去发布`, to: '/publish' })
  if (!form.tiktokProductIds?.length) tips.push({ text: '绑定店铺商品，就能看到投放和达人数据' })
  if (!tips.length) tips.push({ text: '内容在稳步产出，可以试试复刻一条爆款', to: '/clone' })
  return tips.slice(0, 4)
})

/* 内容来历：这个商品产出过什么、从哪来 */
const PURPOSE_LABEL: Record<string, string> = { 'product-image': '商品图素材', 'image-to-video': '图生视频', 'product-replace': '商品替换', 'product-watermark': '商品图水印', creative: 'tk创意室', clone: '复刻', mix: '混剪' }
const history = computed(() =>
  [
    ...productContent.value.map((item) => ({ key: item.id, at: item.createdAt, title: `${PURPOSE_LABEL[item.purpose] || item.purpose} · ${item.label}`, sub: item.review === 'approved' ? '已通过' : item.review === 'rejected' ? '已拒绝' : item.status === 'succeeded' ? '待审核' : '生成中' })),
    ...productClones.value.map((p) => ({ key: p.id, at: p.createdAt, title: `复刻 · ${p.name}`, sub: p.finalFileId ? '已出成片' : '进行中' })),
    ...productOrders.value.map((o) => ({ key: o.id, at: o.createdAt, title: o.styleVideoFileId ? 'tk创意室 · 同款视频' : `tk创意室 · ${o.referenceFileIds.length} 张场景图`, sub: o.state === 'completed' ? '已完成' : '电脑执行中' })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 8),
)

/* 商品记忆（和电脑端同步） */
const memory = reactive<SyncProductMemory>({ sellingPoints: '', audience: '', avoid: '', notes: '' })
const memoryLoaded = ref('')
const memoryDirty = computed(() => JSON.stringify(memory) !== memoryLoaded.value)
async function loadMemory() {
  const record = await getRecord<SyncProductMemory>(SC.productMemory, String(route.params.id))
  Object.assign(memory, { sellingPoints: '', audience: '', avoid: '', notes: '', ...(record?.data ?? {}) })
  memoryLoaded.value = JSON.stringify(memory)
}
async function saveMemory() {
  await saveRecord<SyncProductMemory>(SC.productMemory, String(route.params.id), { ...memory })
  memoryLoaded.value = JSON.stringify(memory)
  toast('商品记忆已保存，电脑端会同步')
}

/* 绑定店铺商品（TikTok 商品 ID） */
async function bindShop() {
  const value = window.prompt('TikTok 店铺商品 ID（多个用逗号或空格分隔）', (form.tiktokProductIds ?? []).join(', '))
  if (value === null) return
  form.tiktokProductIds = value.split(/[\s,，]+/).map((v) => v.trim()).filter(Boolean)
  tiktokIds.value = form.tiktokProductIds.join('\n')
  await saveRecord(SYNC_COLLECTIONS.products, id, { ...form })
  toast(form.tiktokProductIds.length ? '已绑定店铺商品' : '已解除绑定')
}

/* 上传标准原图：加进商品图并设为封面 */
const stdInput = ref<HTMLInputElement>()
const uploadingStd = ref(false)
async function uploadStandard(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  uploadingStd.value = true
  try {
    const ref = await uploadImage(file)
    form.images = [ref, ...form.images.filter((img) => img.fileId !== ref.fileId)]
    form.coverFileId = ref.fileId
    await saveRecord(SYNC_COLLECTIONS.products, id, { ...form })
    toast('标准原图已上传并设为封面')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    uploadingStd.value = false
  }
}
const makeEntries = computed(() => [
  { label: '商品图素材', desc: '主图、上身图、细节特写', icon: ImagePlus, tone: 'blue', to: '/product-images/angles', query: { product: id }, needsImage: true },
  { label: '图生视频', desc: '商品图生成竖屏短视频', icon: Sparkles, tone: 'violet', to: '/image-to-video', query: { product: id }, needsImage: true },
  { label: '复刻爆款', desc: '照着爆款视频做成片', icon: Copy, tone: 'accent', to: '/clone', query: {}, needsImage: false },
  { label: '上架文案', desc: 'AI 写标题和描述', icon: Store, tone: 'amber', to: '/listings/new', query: { product: id }, needsImage: true },
])
const inWebShell = useInWebShell()

const route = useRoute()
const router = useRouter()
const isNew = route.params.id === 'new'
const id = isNew ? newId('prod') : String(route.params.id)

const form = reactive<SyncProduct>({ name: '', type: 'general', remark: '', tiktokProductIds: [], images: [], coverFileId: undefined, createdAt: Date.now() })
const tiktokIds = ref('')
const loaded = ref(isNew)
const missing = ref(false)
const canSave = computed(() => form.name.trim().length > 0)

onMounted(async () => {
  if (isNew) return
  const record = await getRecord<SyncProduct>(SYNC_COLLECTIONS.products, id)
  if (!record?.data || record.deleted) {
    missing.value = true
  } else {
    Object.assign(form, { remark: '', tiktokProductIds: [], ...record.data, images: record.data.images || [] })
    tiktokIds.value = (record.data.tiktokProductIds || []).join('\n')
  }
  loaded.value = true
  if (!isNew) void loadMemory()
})

async function save() {
  if (!canSave.value) {
    toast('请填写商品名称')
    return
  }
  const data: SyncProduct = {
    ...form,
    name: form.name.trim(),
    remark: form.remark?.trim() || '',
    tiktokProductIds: tiktokIds.value.split(/[\s,，]+/).map((value) => value.trim()).filter(Boolean),
    coverFileId: form.coverFileId || form.images[0]?.fileId,
  }
  await saveRecord(SYNC_COLLECTIONS.products, id, data)
  toast(isNew ? '商品已创建' : '已保存')
  router.back()
}

async function remove() {
  if (!window.confirm(`删除商品「${form.name}」？电脑端也会同步删除。`)) return
  await deleteRecord(SYNC_COLLECTIONS.products, id)
  toast('已删除')
  router.back()
}
</script>

<template>
  <template v-if="inWebShell">
    <PageHeader :title="isNew ? '新建商品' : form.name || '商品'" back="/library?tab=products" :description="isNew ? '填写商品名称并上传几张商品图，所有内容都会挂在商品下面' : `${productCategoryLabel(form.type)} · ${form.images.length} 张图${form.remark ? ` · ${form.remark}` : ''}`">
      <template #actions>
        <template v-if="!isNew && !missing">
          <button type="button" class="vg-btn vg-btn--primary" @click="router.push({ path: '/producer', query: { prompt: `为商品「${form.name}」做一套内容：主图、图生视频和一条复刻成片` } })"><Wand2 :size="14" /> AI 做一套内容</button>
          <button type="button" class="vg-btn" :disabled="uploadingStd" @click="stdInput?.click()"><LoaderCircle v-if="uploadingStd" :size="14" class="vg-spin" /><Upload v-else :size="14" /> 上传标准原图</button>
          <button type="button" class="vg-btn" :disabled="!form.images.length" @click="router.push({ path: '/product-images/angles', query: { product: id } })"><Sparkles :size="14" /> 生成深层多角度图</button>
          <button type="button" class="vg-btn vg-btn--danger" @click="remove"><Trash2 :size="14" /> 删除商品</button>
          <input ref="stdInput" type="file" accept="image/*" hidden @change="uploadStandard" />
        </template>
      </template>
    </PageHeader>
    <main v-if="loaded" class="vg-page pd" data-testid="web-product-detail">
      <div v-if="missing" class="vg-empty"><h3>商品不存在</h3><p>可能已在其他设备上删除</p></div>
      <template v-else>
        <nav v-if="!isNew" class="vg-tabs pd-tabs">
          <button type="button" class="vg-tabs__btn" :class="{ 'is-active': detailTab === 'space' }" @click="detailTab = 'space'">商品空间</button>
          <button type="button" class="vg-tabs__btn" :class="{ 'is-active': detailTab === 'info' }" @click="detailTab = 'info'">商品资料</button>
        </nav>

        <template v-if="!isNew && detailTab === 'space'">
          <div class="pd-top">
            <section class="pd-card pd-make">
              <h2 class="vg-section-title"><Wand2 :size="16" /> 为这个商品做内容</h2>
              <p class="vg-muted pd-make__desc">选一个配方，AI 生成计划并在你审批后执行；产出会回到这里和审核收件箱。</p>
              <div class="pd-make__btns">
                <button type="button" class="vg-btn vg-btn--primary" @click="router.push({ path: '/producer', query: { prompt: `为商品「${form.name}」做一套内容：主图、图生视频和一条复刻成片` } })"><Clapperboard :size="14" /> 一个商品，一套内容</button>
                <button type="button" class="vg-btn" :disabled="!form.images.length" @click="router.push({ path: '/image-to-video', query: { product: id } })"><ImagePlus :size="14" /> 场景图批量出片</button>
                <button type="button" class="vg-btn vg-btn--ghost" @click="router.push({ path: '/producer', query: { prompt: `关于商品「${form.name}」：` } })"><Wand2 :size="14" /> 问 AI</button>
              </div>
              <div class="pd-make__grid">
                <button v-for="entry in makeEntries" :key="entry.to" type="button" class="pd-make__item" :disabled="!form.images.length && entry.needsImage" @click="router.push({ path: entry.to, query: entry.query })">
                  <span class="pd-make__icon" :class="`is-${entry.tone}`"><component :is="entry.icon" :size="17" /></span>
                  <span><strong>{{ entry.label }}</strong><small>{{ entry.desc }}</small></span>
                </button>
              </div>
            </section>
            <section class="pd-card pd-next">
              <h2 class="vg-section-title"><Lightbulb :size="16" /> 下一步建议</h2>
              <button v-for="tip in nextSteps" :key="tip.text" type="button" class="pd-next__item" @click="tip.to && router.push(tip.to)">{{ tip.text }}</button>
            </section>
          </div>

          <section class="pd-card">
            <div class="pd-card__head">
              <h2 class="vg-section-title"><TrendingUp :size="16" /> 商品链路</h2>
              <button type="button" class="vg-btn vg-btn--sm" @click="bindShop"><Link2 :size="13" /> {{ form.tiktokProductIds?.length ? `已绑定 ${form.tiktokProductIds.length} 个店铺商品` : '绑定店铺商品' }}</button>
            </div>
            <div class="pd-chain">
              <template v-for="(node, i) in chain" :key="node.label">
                <div class="pd-chain__node">
                  <span class="pd-chain__icon"><component :is="node.icon" :size="15" /></span>
                  <span><small>{{ node.label }}</small><strong>{{ node.value }}</strong><em>{{ node.sub }}</em></span>
                </div>
                <ArrowRight v-if="i < chain.length - 1" :size="15" class="pd-chain__arrow" />
              </template>
            </div>
          </section>

          <div class="pd-lines">
            <div v-for="line in contentLines" :key="line.key" class="pd-line">
              <span class="pd-line__icon"><component :is="line.icon" :size="16" /></span>
              <span><small>{{ line.label }}</small><strong>{{ line.count }}</strong><em>{{ line.sub }}</em></span>
            </div>
          </div>

          <section class="pd-card">
            <h2 class="vg-section-title"><LayoutGrid :size="16" /> 全部内容 <small>{{ productContent.length }}</small></h2>
            <div v-if="productContent.length" class="pd-content">
              <GenerationTile v-for="item in productContent.slice(0, 24)" :key="item.id" :item="item" :tall="item.kind === 'video'" @click="router.push(`/review?focus=${item.id}`)" />
            </div>
            <div v-else class="vg-empty"><span class="vg-empty__icon"><Clapperboard :size="20" /></span><p>这个商品还没有内容</p></div>
          </section>

          <div class="pd-bottom">
            <section class="pd-card">
              <div class="pd-card__head">
                <h2 class="vg-section-title"><Brain :size="16" /> 商品记忆</h2>
                <span class="vg-muted pd-tiny">AI 规划这个商品的内容时会参考</span>
              </div>
              <div class="vg-form-grid">
                <label class="vg-field"><span class="vg-field__label">卖点</span><textarea v-model="memory.sellingPoints" class="vg-textarea" rows="3" placeholder="例：925 银不过敏，淡水珍珠"></textarea></label>
                <label class="vg-field"><span class="vg-field__label">目标人群</span><textarea v-model="memory.audience" class="vg-textarea" rows="3" placeholder="例：通勤女生、送女朋友"></textarea></label>
                <label class="vg-field"><span class="vg-field__label">需要避免</span><textarea v-model="memory.avoid" class="vg-textarea" rows="2" placeholder="例：不要出现价格、不说最便宜"></textarea></label>
                <label class="vg-field"><span class="vg-field__label">其他备注</span><textarea v-model="memory.notes" class="vg-textarea" rows="2"></textarea></label>
              </div>
              <div class="pd-memory__foot">
                <span class="vg-muted pd-tiny">和电脑端「商品记忆」同步</span>
                <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="!memoryDirty" data-testid="product-memory-save" @click="saveMemory"><Save :size="13" /> 保存</button>
              </div>
            </section>
            <section class="pd-card">
              <h2 class="vg-section-title"><GitBranch :size="16" /> 内容来历</h2>
              <ol v-if="history.length" class="pd-history">
                <li v-for="h in history" :key="h.key"><span class="pd-history__dot"></span><span><strong>{{ h.title }}</strong><small>{{ h.sub }} · {{ relativeTime(h.at) }}</small></span></li>
              </ol>
              <p v-else class="vg-muted pd-tiny">还没有来历记录，AI 串联的内容会记录在这里</p>
            </section>
          </div>
        </template>

        <template v-else>
          <div class="pd-form">
            <section class="pd-card">
              <h2 class="vg-section-title"><ImagePlus :size="16" /> 商品图片 <small>建议白底正面图、细节图和佩戴图；点星号设为封面</small></h2>
              <ImageGrid v-model:images="form.images" v-model:cover="form.coverFileId" />
            </section>
            <section class="pd-card">
              <h2 class="vg-section-title"><FileText :size="16" /> 商品资料</h2>
              <label class="vg-field"><span class="vg-field__label">商品名称 <span class="vg-req">*</span></span><input v-model="form.name" class="vg-input" type="text" maxlength="80" placeholder="例如：法式珍珠耳环" /></label>
              <div class="vg-field">
                <span class="vg-field__label">品类</span>
                <CategoryChips v-model="form.type" web />
              </div>
              <label class="vg-field"><span class="vg-field__label">备注（卖点、材质、尺寸）</span><textarea v-model="form.remark" class="vg-textarea" rows="4" maxlength="500" placeholder="材质、尺寸、卖点等，AI 写文案和脚本时会参考" /></label>
              <label class="vg-field"><span class="vg-field__label">TikTok 商品 ID</span><textarea v-model="tiktokIds" class="vg-textarea" rows="3" placeholder="每行一个，用于关联广告和达人数据" /></label>
              <div class="pd-form__actions">
                <button type="button" class="vg-btn" @click="router.back()">取消</button>
                <button type="button" class="vg-btn vg-btn--primary" :disabled="!canSave" @click="save">{{ isNew ? '创建商品' : '保存' }}</button>
              </div>
            </section>
          </div>
        </template>
      </template>
    </main>
  </template>
  <template v-else>
  <PageHeader :title="isNew ? '新建商品' : '编辑商品'" back="/library?tab=products">
    <template v-if="!isNew && !missing" #actions>
      <button type="button" class="m-icon-btn" aria-label="删除商品" @click="remove"><Trash2 :size="20" /></button>
    </template>
  </PageHeader>

  <main v-if="loaded" class="m-page m-page--no-tabs">
    <div v-if="missing" class="m-empty">
      <span class="m-empty__title">商品不存在</span>
      <span class="m-empty__text">可能已在其他设备上删除</span>
    </div>
    <template v-else>
      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">商品图片</h2><span class="m-muted hint">{{ form.images.length }} 张</span></div>
        <ImageGrid v-model:images="form.images" v-model:cover="form.coverFileId" />
        <p class="m-muted hint tip">建议拍白底正面图、细节图和佩戴图，复刻和生成图片时会用到</p>
        <button v-if="!isNew && form.images.length" type="button" class="m-btn m-btn--block listing-btn" @click="router.push({ path: '/listings/new', query: { product: id } })">
          <Store :size="18" /> 用这个商品写上架文案
        </button>
        <div v-if="!isNew && form.images.length" class="ai-row">
          <button type="button" class="m-btn" @click="router.push({ path: '/product-images', query: { product: id } })"><ImagePlus :size="18" /> 生成商品图</button>
          <button type="button" class="m-btn" @click="router.push({ path: '/image-to-video', query: { product: id } })"><Clapperboard :size="18" /> 图生视频</button>
        </div>
      </section>

      <section class="m-section">
        <label class="m-field">
          <span class="m-field__label">商品名称</span>
          <input v-model="form.name" class="m-input" type="text" maxlength="80" placeholder="例如：法式珍珠耳环" />
        </label>

        <div class="m-field">
          <span class="m-field__label">品类</span>
          <CategoryChips v-model="form.type" />
        </div>

        <label class="m-field">
          <span class="m-field__label">备注</span>
          <textarea v-model="form.remark" class="m-textarea" maxlength="500" placeholder="材质、尺寸、卖点等，选填" />
        </label>

        <label class="m-field">
          <span class="m-field__label">TikTok 商品 ID</span>
          <textarea v-model="tiktokIds" class="m-textarea ids" placeholder="每行一个，用于关联广告和达人数据，选填" />
        </label>
      </section>
    </template>
  </main>

  <div v-if="loaded && !missing" class="m-footer-bar">
    <button type="button" class="m-btn" @click="router.back()">取消</button>
    <button type="button" class="m-btn m-btn--primary" :disabled="!canSave" @click="save">{{ isNew ? '创建商品' : '保存' }}</button>
  </div>
  </template>
</template>

<style scoped>
.pd-card__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pd-make__desc { margin: 0 0 10px; font-size: 12.5px; }
.pd-make__btns { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.pd-next { display: flex; flex-direction: column; gap: 8px; }
.pd-next__item { padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); font-size: 13px; font-weight: 600; text-align: left; cursor: pointer; }
.pd-chain { display: flex; align-items: stretch; gap: 8px; }
.pd-chain__node { display: flex; flex: 1; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); min-width: 0; }
.pd-chain__node > span:last-child { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pd-chain__node small { font-size: 12px; color: var(--theme-text-muted); }
.pd-chain__node strong { font-size: 18px; font-weight: 800; }
.pd-chain__node em { font-style: normal; font-size: 11.5px; color: var(--theme-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pd-chain__icon { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border-radius: 9px; background: var(--vg-accent-soft); color: var(--vg-accent); }
.pd-chain__arrow { align-self: center; flex-shrink: 0; color: var(--theme-text-muted); }
.pd-bottom { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.pd-memory__foot { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
.pd-tiny { font-size: 12px; }
.pd-history { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
.pd-history li { display: flex; gap: 10px; }
.pd-history li > span:last-child { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; }
.pd-history small { color: var(--theme-text-muted); }
.pd-history__dot { width: 8px; height: 8px; margin-top: 5px; flex-shrink: 0; border-radius: 50%; background: var(--vg-accent); }
@media (max-width: 1100px) { .pd-bottom { grid-template-columns: minmax(0, 1fr); } .pd-chain { flex-wrap: wrap; } }

.hint { font-size: 12px; }
.tip { margin: 10px 2px 0; }
.listing-btn { margin-top: 14px; }
.ai-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.ai-row .m-btn { height: 44px; font-size: 14px; }
.ids { min-height: 72px; font-family: ui-monospace, monospace; font-size: 13px; }
</style>
