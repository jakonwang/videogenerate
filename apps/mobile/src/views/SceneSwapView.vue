<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, Download, ImagePlus, LoaderCircle, Pause, Play, RefreshCw, Trash2, X } from 'lucide-vue-next'
import { MODEL_GENDERS, PRODUCT_VIEWS, SCENE_SWAP_MAX_IMAGES, SCENE_SWAP_MAX_SCENES, SWAP_MAX_PRODUCT_IMAGES, TRYON_DEFAULT_SHOTS, TRYON_MAX_PRODUCT_IMAGES, TRYON_SHOTS, TRYON_SHOT_LABEL, productViewOf, redoReasonsOf, styleGroupOf, tryonShotsFor, type ProductView, type SceneSwapBatch, type SceneSwapInfo, type SceneSwapItem, type SceneSwapMode, type SceneSwapTask, type TryonShot } from '@shared/sceneSwap'
import CloudImage from '@/components/CloudImage.vue'
import PageHeader from '@/components/PageHeader.vue'
import { saveToGallery, shareTo } from '@/lib/publish'
import { uploadSceneImage } from '@/lib/sceneSwap'
import { cloud, errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

/** AI 修图（手机）：选功能和照片 → 选模特、场景 → 试图 → 跑整批。云端在跑，退出 App 也会继续 */
type Photo = { key: number; name: string; group: string; view: ProductView; url: string; file: File; fileId?: string; failed?: boolean }

const route = useRoute()
const router = useRouter()
const info = ref<SceneSwapInfo | null>(null)
const batches = ref<SceneSwapBatch[]>([])
const photos = ref<Photo[]>([])
const picked = ref<string[]>([])
const mode = ref<SceneSwapMode>('keep')
const step = ref<1 | 2>(1)
const TASKS: Array<{ name: SceneSwapTask; title: string; hint: string }> = [
  { name: 'tryon', title: '生成模特图', hint: '传产品图，AI 模特穿上' },
  { name: 'model', title: '换模特', hint: '衣服姿势不变，只换人' },
  { name: 'scene', title: '换场景', hint: '人和衣服不变，只换背景' },
  { name: 'product', title: '换商品', hint: '传产品图替换，其他不变' },
]
const VIEW_LABEL: Record<ProductView, string> = { front: '正面', back: '背面', detail: '细节' }
const task = ref<SceneSwapTask>('tryon')
const modelId = ref('')
const gender = ref('')
const shots = ref<TryonShot[]>([...TRYON_DEFAULT_SHOTS])
const alsoScene = ref(false)
const modelInput = ref<HTMLInputElement>()
const models = computed(() => (info.value?.models ?? []).filter((item) => !gender.value || item.gender === gender.value))
const needModel = computed(() => task.value === 'tryon' || task.value === 'model')
const needScene = computed(() => task.value === 'tryon' || task.value === 'scene' || (task.value === 'model' && alsoScene.value))
const product = ref<{ fileIds: string[]; name: string }>({ fileIds: [], name: '' })
const productInput = ref<HTMLInputElement>()
async function addProduct(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? []).slice(0, SWAP_MAX_PRODUCT_IMAGES - product.value.fileIds.length)
  input.value = ''
  await guard(async () => {
    for (const file of files) {
      const { fileId } = await uploadSceneImage(file)
      product.value = { fileIds: [...new Set([...product.value.fileIds, fileId])], name: product.value.name || file.name.replace(/\.[^.]+$/, '') }
    }
  })
}
const removeProduct = (id: string) => (product.value = { ...product.value, fileIds: product.value.fileIds.filter((item) => item !== id) })
const maxScenes = computed(() => (task.value === 'tryon' ? 1 : SCENE_SWAP_MAX_SCENES))
const busy = ref(false)
const saving = ref(0)
const photoInput = ref<HTMLInputElement>()
const sceneInput = ref<HTMLInputElement>()
const batch = computed(() => batches.value.find((item) => item.id === route.query.batch))
const ready = computed(() => photos.value.filter((photo) => photo.fileId))
const uploading = computed(() => photos.value.filter((photo) => !photo.fileId && !photo.failed).length)
const groups = computed(() => [...new Set(photos.value.map((photo) => photo.group))].map((name) => ({ name, items: photos.value.filter((photo) => photo.group === name) })))
const styles = computed(() => groups.value.map((group) => ({ name: group.name, count: tryonShotsFor(group.items, shots.value).length })))
const blocked = computed(() => (task.value === 'tryon' ? styles.value.find((style) => !style.count)?.name : undefined))
const total = computed(() => {
  if (task.value === 'tryon') return styles.value.reduce((sum, style) => sum + style.count, 0)
  return ready.value.length * (needScene.value ? picked.value.length : 1)
})
const problem = computed(() => {
  if (task.value === 'product' && !product.value.fileIds.length) return '请先上传要换上的产品图'
  if (needModel.value && !info.value?.models.some((item) => item.id === modelId.value)) return '请先选一个模特'
  if (blocked.value) return `「${blocked.value}」选的镜头出不了，请换镜头或补图`
  if (task.value === 'tryon' && total.value > SCENE_SWAP_MAX_IMAGES) return `一批最多出 ${SCENE_SWAP_MAX_IMAGES} 张，请减少款数或镜头`
  return ''
})
const trialCount = computed(() => Math.min(2, task.value === 'tryon' ? groups.value.length : total.value) || 2)

const trialMode = computed(() => Boolean(batch.value && ['trial', 'trial_ready'].includes(batch.value.status) && batch.value.items.some((item) => item.status === 'waiting')))
const visible = computed(() => batch.value?.items.filter((item) => !trialMode.value || item.status !== 'waiting') ?? [])
const passed = computed(() => batch.value?.items.filter((item) => item.status === 'passed' && item.outputFileId) ?? [])
const review = computed(() => batch.value?.items.filter((item) => item.status === 'review') ?? [])
const waiting = computed(() => batch.value?.items.filter((item) => item.status === 'waiting').length ?? 0)
const finished = computed(() => batch.value?.items.filter((item) => ['passed', 'review', 'failed', 'rejected'].includes(item.status)).length ?? 0)
const openId = ref('')
const opened = computed(() => batch.value?.items.find((item) => item.id === openId.value))
const showOriginal = ref(false)
const reasons = ref<string[]>([])
const STATUS: Record<SceneSwapItem['status'], string> = { waiting: '等待', queued: '排队中', running: '生成中', passed: '合格', review: '要看一下', failed: '失败', rejected: '不要了' }

async function guard(work: () => Promise<unknown>) {
  busy.value = true
  try {
    await work()
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = false
  }
}
const loadBatches = async () => (batches.value = await cloud.sceneSwap.list())
async function loadInfo() {
  info.value = await cloud.sceneSwap.info()
  if (!info.value.keepAvailable) mode.value = 'blend'
}

let seq = 0
let chain: Promise<void> | null = null
function addPhotos(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  const room = SCENE_SWAP_MAX_IMAGES - photos.value.length
  if (files.length > room) toast(`一次最多 ${SCENE_SWAP_MAX_IMAGES} 张`)
  photos.value.push(...files.slice(0, room).map((file) => ({ key: (seq += 1), name: file.name, group: styleGroupOf(file.name), view: productViewOf(file.name), url: URL.createObjectURL(file), file })))
  chain ??= uploadAll().finally(() => (chain = null))
}
async function uploadAll() {
  for (;;) {
    const next = photos.value.find((photo) => !photo.fileId && !photo.failed)
    if (!next) return
    try {
      next.fileId = (await uploadSceneImage(next.file)).fileId
    } catch {
      next.failed = true
    }
  }
}
function tapPhoto(photo: Photo) {
  if (photo.failed) {
    photo.failed = false
    chain ??= uploadAll().finally(() => (chain = null))
    return
  }
  URL.revokeObjectURL(photo.url)
  photos.value = photos.value.filter((item) => item.key !== photo.key)
}
function nextView(photo: Photo) {
  photo.view = PRODUCT_VIEWS[(PRODUCT_VIEWS.indexOf(photo.view) + 1) % PRODUCT_VIEWS.length]!
}
function setTask(next: SceneSwapTask) {
  task.value = next
  if (next === 'tryon') picked.value = picked.value.slice(0, 1)
}
function toggleShot(shot: TryonShot) {
  if (!shots.value.includes(shot)) shots.value = [...shots.value, shot]
  else if (shots.value.length > 1) shots.value = shots.value.filter((item) => item !== shot)
}
async function addModel(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await guard(async () => {
    const { fileId } = await uploadSceneImage(file)
    const added = await cloud.sceneSwap.addModel({ fileId, name: file.name.replace(/\.[^.]+$/, '') })
    await loadInfo()
    gender.value = ''
    modelId.value = added.id
  })
}
function toggleScene(id: string) {
  if (picked.value.includes(id)) picked.value = picked.value.filter((item) => item !== id)
  else if (task.value === 'tryon') picked.value = [id]
  else if (picked.value.length >= SCENE_SWAP_MAX_SCENES) toast(`最多选 ${SCENE_SWAP_MAX_SCENES} 个场景`)
  else picked.value = [...picked.value, id]
}
async function addScene(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await guard(async () => {
    const { fileId } = await uploadSceneImage(file)
    const scene = await cloud.sceneSwap.addScene({ fileId, name: file.name.replace(/\.[^.]+$/, '') })
    await loadInfo()
    if (task.value === 'tryon') picked.value = [scene.id]
    else if (picked.value.length < SCENE_SWAP_MAX_SCENES) picked.value = [...picked.value, scene.id]
  })
}

function put(next: SceneSwapBatch) {
  batches.value = [next, ...batches.value.filter((item) => item.id !== next.id)].sort((a, b) => b.createdAt - a.createdAt)
}
const start = () =>
  guard(async () => {
    const created = await cloud.sceneSwap.create({ task: task.value, mode: task.value === 'scene' ? mode.value : 'blend', size: task.value === 'tryon' ? '3:4' : 'original', matchLight: true, ...(needModel.value ? { modelId: modelId.value } : {}), ...(task.value === 'product' ? { productFileIds: product.value.fileIds, productName: product.value.name } : {}), ...(task.value === 'tryon' ? { shots: shots.value } : {}), images: ready.value.map((photo) => ({ fileId: photo.fileId!, name: photo.name, group: photo.group, view: photo.view })), sceneIds: needScene.value ? picked.value : [] })
    put(created)
    photos.value.forEach((photo) => URL.revokeObjectURL(photo.url))
    photos.value = []
    step.value = 1
    await router.push({ query: { batch: created.id } })
    await loadInfo()
  })
const act = (action: 'run' | 'pause' | 'resume' | 'retrial') => guard(async () => put(await cloud.sceneSwap.action(batch.value!.id, action)))
const actItem = (action: 'redo' | 'accept' | 'reject') =>
  guard(async () => {
    put(await cloud.sceneSwap.item(batch.value!.id, openId.value, action, reasons.value))
    close()
  })
function removeBatch() {
  if (!window.confirm('删除这一批？已经存进素材库的图不受影响。')) return
  void guard(async () => {
    const id = batch.value!.id
    await cloud.sceneSwap.remove(id)
    batches.value = batches.value.filter((item) => item.id !== id)
    await router.replace({ query: {} })
  })
}
function open(item: SceneSwapItem) {
  if (!item.outputFileId && item.status !== 'failed') return
  openId.value = item.id
  reasons.value = []
  showOriginal.value = false
}
function close() {
  openId.value = ''
}
const labelOf = (item: SceneSwapItem) => `${item.sourceName.replace(/\.[^.]+$/, '')}_${item.sceneName}`
async function save(items: SceneSwapItem[]) {
  saving.value = items.length
  let ok = 0
  for (const item of items) {
    try {
      await saveToGallery({ fileId: item.outputFileId!, label: labelOf(item), mime: 'image/jpeg', skipRecord: true })
      ok += 1
    } catch (error) {
      toast(errorMessage(error))
      break
    }
    saving.value -= 1
  }
  saving.value = 0
  if (ok) toast(`已保存 ${ok} 张`)
}
const share = (item: SceneSwapItem) => guard(() => shareTo('any', { fileId: item.outputFileId!, label: labelOf(item), mime: 'image/jpeg' }))

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void guard(() => Promise.all([loadInfo(), loadBatches()]))
  timer = setInterval(() => {
    const running = batches.value.some((item) => item.status !== 'paused' && item.items.some((row) => row.status === 'queued' || row.status === 'running'))
    if (running && !busy.value && document.visibilityState === 'visible') void loadBatches().catch(() => undefined)
  }, 4000)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  photos.value.forEach((photo) => URL.revokeObjectURL(photo.url))
})
</script>

<template>
  <PageHeader :title="batch ? (trialMode ? '看看试图' : '做好的图') : 'AI 修图'" :back="batch ? '/scene-swap' : '/create'">
    <template v-if="batch" #actions><button type="button" class="m-icon-btn" aria-label="删除这一批" :disabled="busy" @click="removeBatch"><Trash2 :size="20" /></button></template>
  </PageHeader>

  <main v-if="batch" class="m-page m-page--no-tabs swap" data-testid="scene-swap-batch">
    <p v-if="batch.notice" class="m-card warn">{{ batch.notice }}</p>
    <section v-if="!trialMode" class="m-card progress">
      <strong>{{ finished }} / {{ batch.items.length }}</strong>
      <div class="bar" role="progressbar" :aria-valuenow="finished" aria-valuemin="0" :aria-valuemax="batch.items.length"><span :style="{ width: `${(finished / Math.max(1, batch.items.length)) * 100}%` }" /></div>
      <span class="m-muted small">{{ finished < batch.items.length ? '可以先离开，云端会继续生成' : `合格 ${passed.length} 张，已存进素材库` }}</span>
    </section>
    <p v-else class="m-muted small">{{ batch.task === 'tryon' ? '其余图片会照着主图来出，满意再出整组。' : '不满意可以换图再试，满意再跑整批。' }}</p>
    <button v-if="!trialMode && review.length" type="button" class="m-card warn" @click="open(review[0])"><strong>{{ review.length }} 张要看一下</strong><br />点开决定，不要的不扣点</button>
    <div class="grid" :class="{ 'grid--big': trialMode }">
      <button v-for="item in visible" :key="item.id" type="button" class="cell" :class="`is-${item.status}`" :aria-label="`${item.sourceName} ${STATUS[item.status]}`" @click="open(item)">
        <CloudImage :file-id="item.outputFileId || item.sourceFileId" :alt="item.sourceName" />
        <span v-if="item.status !== 'passed'" class="tag"><LoaderCircle v-if="item.status === 'running'" :size="12" class="m-spin" /> {{ STATUS[item.status] }}</span>
        <span v-else-if="item.shot" class="tag">{{ TRYON_SHOT_LABEL[item.shot] }}</span>
      </button>
    </div>
    <div class="foot">
      <template v-if="trialMode && batch.status === 'trial_ready'">
        <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="busy" @click="act('run')"><Play :size="18" /> 满意，跑剩下 {{ waiting }} 张<template v-if="info?.pointsPerImage">（最多 {{ waiting * info.pointsPerImage }} 点）</template></button>
        <button v-if="batch.items.some((item) => item.status === 'waiting' && item.master !== false)" type="button" class="m-btn m-btn--block" :disabled="busy" @click="act('retrial')"><RefreshCw :size="18" /> 换 2 张再试</button>
      </template>
      <button v-else-if="batch.status === 'paused'" type="button" class="m-btn m-btn--primary m-btn--block" :disabled="busy" @click="act('resume')"><Play :size="18" /> 继续</button>
      <button v-else-if="batch.status === 'running'" type="button" class="m-btn m-btn--block" :disabled="busy" @click="act('pause')"><Pause :size="18" /> 暂停</button>
      <button v-if="passed.length && !trialMode" type="button" class="m-btn m-btn--primary m-btn--block" :disabled="saving > 0" @click="save(passed)"><Download :size="18" /> {{ saving ? `正在保存，还剩 ${saving} 张` : `${passed.length} 张存到相册` }}</button>
    </div>

    <div v-if="opened" class="sheet" role="dialog" aria-modal="true" @click.self="close">
      <div class="sheet__box">
        <header><strong>{{ opened.sourceName }}</strong><button type="button" class="m-icon-btn" aria-label="关闭" @click="close"><X :size="20" /></button></header>
        <div class="sheet__img"><CloudImage :file-id="showOriginal || !opened.outputFileId ? opened.sourceFileId : opened.outputFileId" /></div>
        <button v-if="opened.outputFileId" type="button" class="m-btn m-btn--sm" @click="showOriginal = !showOriginal">{{ showOriginal ? '看做好的' : batch.task === 'tryon' ? '看产品图' : '看原图' }}</button>
        <p v-if="opened.error" class="warn small">{{ opened.error }}</p>
        <div class="chips"><button v-for="reason in redoReasonsOf(batch.task)" :key="reason" type="button" class="chip" :class="{ 'is-on': reasons.includes(reason) }" :aria-pressed="reasons.includes(reason)" @click="reasons = reasons.includes(reason) ? reasons.filter((r) => r !== reason) : [...reasons, reason]">{{ reason }}</button></div>
        <button type="button" class="m-btn m-btn--block" :disabled="busy || ['queued', 'running'].includes(opened.status)" @click="actItem('redo')"><RefreshCw :size="18" /> {{ ['passed', 'rejected'].includes(opened.status) ? '重做（再扣一次）' : '重做' }}</button>
        <template v-if="opened.status === 'review'">
          <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="busy" @click="actItem('accept')"><Check :size="18" /> {{ opened.trial ? '可以用（免费）' : '可以用（扣点）' }}</button>
          <button type="button" class="m-btn m-btn--block" :disabled="busy" @click="actItem('reject')">{{ opened.trial ? '不要这张' : '不要（不扣点）' }}</button>
        </template>
        <div v-if="opened.status === 'passed'" class="two"><button type="button" class="m-btn" @click="save([opened])">存到相册</button><button type="button" class="m-btn" :disabled="busy" @click="share(opened)">分享</button></div>
      </div>
    </div>
  </main>

  <main v-else class="m-page m-page--no-tabs swap" data-testid="scene-swap-new">
    <template v-if="step === 1">
      <div class="tasks" role="group" aria-label="选功能"><button v-for="item in TASKS" :key="item.name" type="button" class="task" :class="{ 'is-on': task === item.name }" :aria-pressed="task === item.name" @click="setTask(item.name)"><strong>{{ item.title }}</strong><span class="m-muted small">{{ item.hint }}</span></button></div>
      <p class="m-muted small">{{ task === 'tryon' ? `选产品实拍图，同一款放一起，每款最多参考 ${TRYON_MAX_PRODUCT_IMAGES} 张。` : task === 'model' ? '选已经穿好衣服的模特图。' : task === 'product' ? '选要改的图，里面的商品会换成你的。' : '选要换背景的照片。' }}</p>
      <button type="button" class="m-btn m-btn--block pick" @click="photoInput?.click()"><ImagePlus :size="20" /> 从相册多选（{{ photos.length }}/{{ SCENE_SWAP_MAX_IMAGES }}）</button>
      <input ref="photoInput" type="file" accept="image/*" multiple hidden @change="addPhotos" />
      <p v-if="uploading" class="m-muted small"><LoaderCircle :size="14" class="m-spin" /> 正在上传，还剩 {{ uploading }} 张</p>
      <section v-for="group in groups" :key="group.name" class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">{{ group.name }}</h2><span class="m-muted small">{{ group.items.length }} 张</span></div>
        <div class="grid"><div v-for="photo in group.items" :key="photo.key"><button type="button" class="cell" :class="{ 'is-failed': photo.failed }" :aria-label="photo.failed ? '重新上传' : '移除'" @click="tapPhoto(photo)"><img :src="photo.url" alt="" /><span class="tag">{{ photo.failed ? '点我重传' : '移除' }}</span></button><button v-if="task === 'tryon'" type="button" class="view" :aria-label="`现在是${VIEW_LABEL[photo.view]}，点一下切换`" @click="nextView(photo)">{{ VIEW_LABEL[photo.view] }} ⇄</button></div></div>
        <p v-if="task === 'tryon' && shots.includes('back') && !group.items.some((item) => item.view === 'back')" class="m-muted small">没有背面图，这款不出背面</p>
      </section>
      <section v-if="!photos.length && batches.length" class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">最近的批次</h2></div>
        <div class="m-card m-list"><button v-for="item in batches" :key="item.id" type="button" class="m-row" @click="router.push({ query: { batch: item.id } })"><span class="cover"><CloudImage :file-id="item.items.find((row) => row.outputFileId)?.outputFileId || item.items[0]?.sourceFileId" /></span><span class="m-row__main"><span class="m-row__title">{{ item.title }}</span><span class="m-row__sub">{{ item.status === 'trial_ready' ? '试图好了，等你确认' : item.status === 'paused' ? '已暂停' : item.status === 'done' ? '已完成' : '生成中' }}</span></span></button></div>
      </section>
      <div class="foot"><button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="!ready.length || uploading > 0" @click="step = 2">{{ task === 'scene' ? '下一步：选场景' : task === 'product' ? '下一步：传产品图' : '下一步：选模特' }}</button></div>
    </template>
    <template v-else>
      <template v-if="task === 'product'">
        <h2 class="m-section__title">上传要换上的产品图</h2>
        <div v-if="product.fileIds.length" class="grid"><button v-for="id in product.fileIds" :key="id" type="button" class="cell" aria-label="移除" @click="removeProduct(id)"><CloudImage :file-id="id" /><span class="tag">移除</span></button></div>
        <button v-if="product.fileIds.length < SWAP_MAX_PRODUCT_IMAGES" type="button" class="m-btn m-btn--block" :disabled="busy" @click="productInput?.click()"><ImagePlus :size="18" /> 上传产品图（{{ product.fileIds.length }}/{{ SWAP_MAX_PRODUCT_IMAGES }}）</button>
        <input ref="productInput" type="file" accept="image/*" multiple hidden @change="addProduct" />
        <p class="m-muted small">人物、姿势、背景和其他东西不变，只换商品。</p>
      </template>
      <template v-if="needModel">
        <h2 class="m-section__title">选模特</h2>
        <div class="chips"><button v-for="name in ['', ...MODEL_GENDERS]" :key="name" type="button" class="chip" :class="{ 'is-on': gender === name }" :aria-pressed="gender === name" @click="gender = name">{{ name || '全部' }}</button></div>
        <div class="grid grid--scene"><button v-for="item in models" :key="item.id" type="button" class="scene" :class="{ 'is-on': modelId === item.id }" :aria-pressed="modelId === item.id" @click="modelId = item.id"><span class="cell"><CloudImage :file-id="item.fileId" :alt="item.name" /></span><span class="small">{{ item.name }}</span></button></div>
        <button type="button" class="m-btn m-btn--block" :disabled="busy" @click="modelInput?.click()"><ImagePlus :size="18" /> 上传模特（须有肖像使用权）</button>
        <input ref="modelInput" type="file" accept="image/*" hidden @change="addModel" />
      </template>
      <template v-if="task === 'tryon'">
        <h2 class="m-section__title">每款出几张</h2>
        <div class="chips"><button v-for="shot in TRYON_SHOTS" :key="shot" type="button" class="chip" :class="{ 'is-on': shots.includes(shot) }" :aria-pressed="shots.includes(shot)" @click="toggleShot(shot)">{{ TRYON_SHOT_LABEL[shot] }}</button></div>
      </template>
      <button v-if="task === 'model'" type="button" class="chip" :class="{ 'is-on': alsoScene }" :aria-pressed="alsoScene" @click="alsoScene = !alsoScene">同时换场景</button>
      <template v-if="needScene">
      <h2 class="m-section__title">选场景（{{ picked.length }}/{{ maxScenes }}）</h2>
      <p class="m-muted small">{{ task === 'tryon' ? '不选就用纯色影棚背景。' : '选多个会每个场景各出一张。' }}</p>
      <div class="grid grid--scene">
        <button v-for="scene in info?.scenes ?? []" :key="scene.id" type="button" class="scene" :class="{ 'is-on': picked.includes(scene.id) }" :aria-pressed="picked.includes(scene.id)" @click="toggleScene(scene.id)"><span class="cell"><CloudImage :file-id="scene.fileId" :alt="scene.name" /></span><span class="small">{{ scene.name }}</span></button>
      </div>
      <button type="button" class="m-btn m-btn--block" :disabled="busy" @click="sceneInput?.click()"><ImagePlus :size="18" /> 拍一张或上传场景</button>
      <input ref="sceneInput" type="file" accept="image/*" hidden @change="addScene" />
      </template>
      <template v-if="task === 'scene'"><div class="two"><button type="button" class="chip" :class="{ 'is-on': mode === 'keep' }" :aria-pressed="mode === 'keep'" :disabled="!info?.keepAvailable" @click="mode = 'keep'">保真（推荐）</button><button type="button" class="chip" :class="{ 'is-on': mode === 'blend' }" :aria-pressed="mode === 'blend'" @click="mode = 'blend'">融合</button></div>
      <p class="m-muted small">{{ mode === 'keep' ? '保留原图人物和衣服' : '更自然，但衣服细节可能变化' }}</p></template>
      <p v-if="problem" class="m-muted small">{{ problem }}</p>
      <div class="m-card sum"><span>将生成 <strong>{{ total }}</strong> 张</span><span>最多 <strong>{{ total * (info?.pointsPerImage ?? 0) }}</strong> 点</span></div>
      <div class="foot">
        <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="busy || !total || Boolean(problem)" @click="start"><LoaderCircle v-if="busy" :size="18" class="m-spin" /> {{ info && !info.trialsLeft ? `先试 ${trialCount} 张（今天免费次数用完，按张扣点）` : `先免费试 ${trialCount} 张` }}</button>
        <button type="button" class="m-btn m-btn--block" @click="step = 1">上一步</button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.swap { display: flex; flex-direction: column; gap: 14px; }
.small { font-size: 13px; }
.pick { min-height: 64px; border-style: dashed; }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.grid--big { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.grid--scene { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.cell { position: relative; display: block; width: 100%; aspect-ratio: 3 / 4; padding: 0; overflow: hidden; border: 2px solid transparent; border-radius: 10px; background: var(--theme-panel-soft); }
.cell img { width: 100%; height: 100%; object-fit: cover; }
.cell.is-review { border-color: var(--m-amber); }
.cell.is-failed { border-color: var(--m-red); }
.tag { position: absolute; inset: auto 0 0; padding: 4px; background: rgba(0, 0, 0, .62); color: #fff; font-size: 11px; text-align: center; }
.scene { padding: 3px; border: 2px solid var(--theme-border); border-radius: 13px; background: var(--theme-panel); color: var(--theme-text); }
.scene.is-on { border-color: var(--theme-accent); }
.tasks { display: flex; flex-direction: column; gap: 8px; }
.task { display: flex; justify-content: space-between; gap: 10px; align-items: center; min-height: 52px; padding: 10px 14px; border: 1px solid var(--theme-border-control); border-radius: 12px; background: var(--theme-panel); color: var(--theme-text); text-align: left; }
.task.is-on { border-color: var(--theme-accent); background: var(--theme-accent-soft); }
.view { width: 100%; min-height: 36px; border: 0; background: none; color: var(--theme-text); font-size: 12px; }
.progress { display: flex; flex-direction: column; gap: 8px; padding: 14px; }
.bar { height: 8px; overflow: hidden; border-radius: 9px; background: var(--theme-divider); }
.bar span { display: block; height: 100%; background: var(--theme-accent); }
.warn { padding: 12px; color: var(--theme-warning-text); background: var(--theme-warning-soft); text-align: left; }
.foot { display: flex; flex-direction: column; gap: 10px; margin-top: auto; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.sum { display: flex; justify-content: space-between; padding: 14px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { min-height: 44px; padding: 8px 14px; border: 1px solid var(--theme-border-control); border-radius: 12px; background: var(--theme-panel); color: var(--theme-text); }
.chip.is-on { border-color: var(--theme-accent); background: var(--theme-accent-soft); }
.chip:disabled { opacity: .5; }
.cover { width: 44px; height: 56px; overflow: hidden; border-radius: 8px; flex-shrink: 0; }
.sheet { position: fixed; inset: 0; z-index: 40; display: flex; align-items: flex-end; background: var(--theme-overlay); }
.sheet__box { width: 100%; max-height: 94vh; overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 12px 16px calc(var(--m-safe-bottom) + 16px); border-radius: 18px 18px 0 0; background: var(--theme-panel); color: var(--theme-text); }
.sheet__box header { display: flex; justify-content: space-between; align-items: center; }
.sheet__img { height: 48vh; }
.sheet__img :deep(img) { object-fit: contain; }
</style>
