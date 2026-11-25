<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ChevronDown, ImagePlus, Images, Layers, LoaderCircle, Plus, Shirt, UserRound, X } from 'lucide-vue-next'
import { PRODUCT_VIEWS, SCENE_SWAP_MAX_IMAGES, SCENE_SWAP_MAX_SCENES, SCENE_SWAP_TASKS, TRYON_DEFAULT_SHOTS, TRYON_MAX_PRODUCT_IMAGES, TRYON_SHOTS, productViewOf, styleGroupOf, tryonShotsFor, type ProductView, type SceneSwapBatch, type SceneSwapInfo, type SceneSwapItem, type SceneSwapMode, type SceneSwapScene, type SceneSwapSize, type SceneSwapTask, type SwapModel, type TryonShot } from '../../../../shared/sceneSwap'
import { openAssetLibraryPicker } from '@/lib/assetLibraryPicker'
import BatchPanel from './garment-studio/BatchPanel.vue'
import ProductPanel from './garment-studio/ProductPanel.vue'
import ModelGallery from './garment-studio/ModelGallery.vue'
import SceneGallery from './garment-studio/SceneGallery.vue'
import SwapImage from './garment-studio/SwapImage.vue'
import TaskCards from './garment-studio/TaskCards.vue'

/** AI 修图（生成模特图 / 换模特 / 换场景 / 换商品）：传图 → 选模特、场景 → 免费试图 → 跑整批。批次在云端，网页和电脑是同一个页面 */
type Source = { key: string; path: string; name: string; group: string; view: ProductView; fileId?: string; error?: string }

const { t } = useI18n()
const k = (key: string, params: Record<string, unknown> = {}) => t(`ai.sceneSwap.${key}`, params)
const route = useRoute()
const router = useRouter()
const api = window.api.sceneSwap

const info = ref<SceneSwapInfo | null>(null)
const batches = ref<SceneSwapBatch[]>([])
const sources = ref<Source[]>([])
const picked = ref<string[]>([])
const task = ref<SceneSwapTask>('tryon')
const modelId = ref('')
const product = ref<{ fileIds: string[]; name: string }>({ fileIds: [], name: '' })
const needModel = computed(() => task.value === 'tryon' || task.value === 'model')
const shots = ref<TryonShot[]>([...TRYON_DEFAULT_SHOTS])
const tryonSize = ref<SceneSwapSize>('3:4')
/** 换模特默认不动背景 */
const alsoScene = ref(false)
const uploadingModel = ref(false)
const mode = ref<SceneSwapMode>('keep')
const size = ref<SceneSwapSize>('original')
const matchLight = ref(true)
const more = ref(false)
const busy = ref(false)
const uploadingScene = ref(false)
const error = ref('')
const notice = ref('')
/** 电脑端没登录云端账号（主进程 scene-swap 的提示）：直接给登录入口 */
const needLogin = computed(() => error.value.includes('请先登录账号'))
const dragging = ref(false)
const pane = computed(() => String(route.query.pane || ''))
const batch = computed(() => batches.value.find((item) => item.id === route.query.batch))

const groups = computed(() => {
  const map = new Map<string, Source[]>()
  for (const source of sources.value) map.set(source.group, [...(map.get(source.group) ?? []), source])
  return [...map].map(([name, items]) => ({ name, items }))
})
const uploading = computed(() => sources.value.filter((source) => !source.fileId && !source.error).length)
const ready = computed(() => sources.value.filter((source) => source.fileId))
const model = computed(() => info.value?.models.find((item) => item.id === modelId.value))
/** 每款按实际能出的镜头算：没有背面图就不出背面 */
const styleShots = computed(() => groups.value.map((group) => ({ name: group.name, shots: tryonShotsFor(group.items, shots.value) })))
const blocked = computed(() => (task.value === 'tryon' ? styleShots.value.find((style) => !style.shots.length)?.name : undefined))
const total = computed(() => {
  if (task.value === 'tryon') return styleShots.value.reduce((sum, style) => sum + style.shots.length, 0)
  if (task.value === 'model') return ready.value.length * (alsoScene.value ? picked.value.length : 1)
  if (task.value === 'product') return ready.value.length
  return ready.value.length * picked.value.length
})
const trialCount = computed(() => Math.min(2, task.value === 'tryon' ? groups.value.length : total.value))
const pointsPerImage = computed(() => info.value?.pointsPerImage ?? 0)
const go = (name: string) => router.push({ query: name ? { pane: name } : {} })
const PANES = [{ name: '', icon: Plus }, { name: 'batches', icon: Layers }, { name: 'models', icon: UserRound }, { name: 'scenes', icon: Images }]
const SIZES: SceneSwapSize[] = ['original', '3:4', '1:1', '9:16']
const canStart = computed(() => total.value > 0 && !uploading.value && !busy.value && (!needModel.value || Boolean(model.value)) && (task.value !== 'product' || product.value.fileIds.length > 0) && !blocked.value && !(task.value === 'tryon' && total.value > SCENE_SWAP_MAX_IMAGES))

const messageOf = (cause: unknown) => String((cause as Error)?.message || cause).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')

async function guard(work: () => Promise<unknown>) {
  error.value = ''
  notice.value = ''
  busy.value = true
  try {
    await work()
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    busy.value = false
  }
}

async function loadInfo() {
  info.value = (await api.info()) as SceneSwapInfo
  if (!info.value.keepAvailable && mode.value === 'keep') mode.value = 'blend'
  if (!info.value.models.some((item) => item.id === modelId.value)) modelId.value = ''
  picked.value = picked.value.filter((id) => info.value!.scenes.some((scene) => scene.id === id))
}
async function loadBatches() {
  batches.value = (await api.list()) as SceneSwapBatch[]
}

/* ------------------------------------------------------------------ 传图 */

let seq = 0
let uploadChain: Promise<void> | null = null
function add(list: Array<{ path: string; name: string }>) {
  error.value = ''
  const room = SCENE_SWAP_MAX_IMAGES - sources.value.length
  if (list.length > room) error.value = k('tooMany', { max: SCENE_SWAP_MAX_IMAGES })
  sources.value.push(...list.slice(0, Math.max(0, room)).map((file) => ({ key: `s${(seq += 1)}`, path: file.path, name: file.name, group: styleGroupOf(file.name), view: productViewOf(file.name) })))
  startUploads()
}
function startUploads() {
  uploadChain ??= uploadAll().finally(() => {
    uploadChain = null
    if (sources.value.some((source) => !source.fileId && !source.error)) startUploads()
  })
}
/** 同时传 3 张 */
async function uploadAll() {
  const taken = new Set<string>()
  const worker = async () => {
    for (;;) {
      const next = sources.value.find((source) => !source.fileId && !source.error && !taken.has(source.key))
      if (!next) return
      taken.add(next.key)
      try {
        next.fileId = ((await api.upload(next.path)) as { fileId: string }).fileId
      } catch (cause) {
        next.error = messageOf(cause)
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])
}
function nextView(source: Source) {
  source.view = PRODUCT_VIEWS[(PRODUCT_VIEWS.indexOf(source.view) + 1) % PRODUCT_VIEWS.length]!
}
function removeSource(key: string) {
  sources.value = sources.value.filter((source) => source.key !== key)
}
function retryUploads() {
  for (const source of sources.value) source.error = undefined
  startUploads()
}
async function pick(kind: 'files' | 'folder') {
  await guard(async () => add((await api.pick(kind)) as Array<{ path: string; name: string }>))
}
async function pickFromLibrary() {
  const items = await openAssetLibraryPicker({ type: 'image', multiple: true, usagePlugin: 'scene-swap' })
  if (!items?.length) return
  // 网页上素材库里的图已经在云端，不用再传
  const cloudId = (path: string) => /^cloudfile:([a-f0-9]{64})\//.exec(path)?.[1]
  add(items.map((item) => ({ path: item.filePath, name: item.name })))
  for (const item of items) {
    const id = cloudId(item.filePath)
    const source = id ? sources.value.find((row) => row.path === item.filePath) : undefined
    if (source && id) {
      source.fileId = id
      source.error = undefined
    }
  }
}
function drop(event: DragEvent) {
  dragging.value = false
  const paths = Array.from(event.dataTransfer?.files ?? []).map((file) => window.api.getPathForFile(file)).filter(Boolean)
  if (paths.length) void guard(async () => add((await api.expandPaths(paths)) as Array<{ path: string; name: string }>))
}
function renameGroup(from: string, event: Event) {
  const name = (event.target as HTMLInputElement).value.trim().slice(0, 40) || from
  for (const source of sources.value) if (source.group === from) source.group = name
}
function moveToGroup(key: string, event: DragEvent | null, group: string) {
  const id = event?.dataTransfer?.getData('text/scene-source') || key
  const source = sources.value.find((item) => item.key === id)
  if (source) source.group = group
}

/* ------------------------------------------------------------------ 场景 */

function toggleScene(id: string) {
  if (task.value === 'tryon') {
    picked.value = picked.value.includes(id) ? [] : [id]
    return
  }
  if (picked.value.includes(id)) picked.value = picked.value.filter((item) => item !== id)
  else if (picked.value.length >= SCENE_SWAP_MAX_SCENES) error.value = k('tooManyScenes', { max: SCENE_SWAP_MAX_SCENES })
  else picked.value = [...picked.value, id]
}
async function uploadScene() {
  const files = (await api.pick('files')) as Array<{ path: string; name: string }>
  if (!files.length) return
  uploadingScene.value = true
  error.value = ''
  try {
    for (const file of files) {
      const { fileId } = (await api.upload(file.path)) as { fileId: string }
      const scene = (await api.addScene({ fileId, name: file.name.replace(/\.[^.]+$/, '') })) as SceneSwapScene
      if (task.value === 'tryon') picked.value = [scene.id]
      else if (picked.value.length < SCENE_SWAP_MAX_SCENES) picked.value = [...picked.value, scene.id]
    }
    await loadInfo()
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    uploadingScene.value = false
  }
}
function setTask(next: SceneSwapTask) {
  task.value = next
  if (next === 'tryon') picked.value = picked.value.slice(0, 1)
}
function toggleShot(shot: TryonShot) {
  if (!shots.value.includes(shot)) shots.value = [...shots.value, shot]
  else if (shots.value.length > 1) shots.value = shots.value.filter((item) => item !== shot)
}
async function uploadModel() {
  const files = (await api.pick('files')) as Array<{ path: string; name: string }>
  if (!files.length) return
  uploadingModel.value = true
  error.value = ''
  try {
    let last = ''
    for (const file of files) {
      const { fileId } = (await api.upload(file.path)) as { fileId: string }
      last = ((await api.addModel({ fileId, name: file.name.replace(/\.[^.]+$/, '') })) as SwapModel).id
    }
    await loadInfo()
    modelId.value = last
  } catch (cause) {
    error.value = messageOf(cause)
  } finally {
    uploadingModel.value = false
  }
}
async function removeModel(item: SwapModel) {
  if (!window.confirm(k('confirmRemoveModel', { name: item.name }))) return
  await guard(async () => {
    await api.removeModel(item.id)
    await loadInfo()
  })
}
async function removeScene(scene: SceneSwapScene) {
  if (!window.confirm(k('confirmRemoveScene', { name: scene.name }))) return
  await guard(async () => {
    await api.removeScene(scene.id)
    await loadInfo()
  })
}

/* ------------------------------------------------------------------ 批次 */

function replaceBatch(next: SceneSwapBatch) {
  batches.value = [next, ...batches.value.filter((item) => item.id !== next.id)].sort((a, b) => b.createdAt - a.createdAt)
}
async function start() {
  await guard(async () => {
    const created = (await api.create({
      task: task.value,
      mode: task.value === 'scene' ? mode.value : 'blend',
      size: task.value === 'tryon' ? tryonSize.value : task.value === 'scene' ? size.value : 'original',
      matchLight: matchLight.value,
      images: ready.value.map((source) => ({ fileId: source.fileId!, name: source.name, group: source.group, view: source.view })),
      sceneIds: task.value === 'product' || (task.value === 'model' && !alsoScene.value) ? [] : [...picked.value],
      ...(needModel.value ? { modelId: modelId.value } : {}),
      ...(task.value === 'product' ? { productFileIds: [...product.value.fileIds], productName: product.value.name } : {}),
      ...(task.value === 'tryon' ? { shots: [...shots.value] } : {}),
    })) as SceneSwapBatch
    replaceBatch(created)
    sources.value = []
    await router.push({ query: { batch: created.id } })
    await loadInfo()
  })
}
const act = (action: 'run' | 'pause' | 'resume' | 'retrial') => guard(async () => replaceBatch((await api.action(batch.value!.id, action)) as SceneSwapBatch))
const actItem = (itemId: string, action: 'redo' | 'accept' | 'reject', reasons: string[]) => guard(async () => replaceBatch((await api.item(batch.value!.id, itemId, action, [...reasons])) as SceneSwapBatch))
async function removeBatch() {
  if (!window.confirm(k('confirmRemoveBatch'))) return
  await guard(async () => {
    await api.remove(batch.value!.id)
    await router.push({ query: {} })
    await loadBatches()
  })
}
function again() {
  const old = batch.value!
  const list = old.images ?? [...new Map(old.items.map((item) => [item.sourceFileId, { fileId: item.sourceFileId, name: item.sourceName, group: item.group }])).values()]
  sources.value = list.map((image) => ({ key: `s${(seq += 1)}`, path: '', name: image.name, group: image.group || styleGroupOf(image.name), view: ('view' in image && image.view) || productViewOf(image.name), fileId: image.fileId }))
  task.value = old.task
  product.value = { fileIds: [...(old.productFileIds ?? [])], name: old.productName ?? '' }
  if (old.shots?.length) shots.value = [...old.shots]
  modelId.value = info.value?.models.some((item) => item.id === old.modelId) ? old.modelId! : ''
  picked.value = []
  void router.push({ query: {} })
}
async function download(items: SceneSwapItem[]) {
  await guard(async () => {
    const result = (await api.exportResults(items.filter((item) => item.outputFileId).map((item) => ({ fileId: item.outputFileId!, name: `${item.sourceName.replace(/\.[^.]+$/, '')}_${item.sceneName}` })))) as { canceled: boolean; count: number }
    if (!result.canceled) notice.value = k('exported', { count: result.count })
  })
}

let timer: ReturnType<typeof setInterval> | undefined
const active = (item: SceneSwapBatch) => item.status !== 'paused' && item.items.some((row) => row.status === 'queued' || row.status === 'running')
onMounted(() => {
  void Promise.all([loadInfo(), loadBatches()]).catch((cause) => (error.value = messageOf(cause)))
  timer = setInterval(() => {
    if (!document.hidden && !busy.value && batches.value.some(active)) void loadBatches().catch(() => undefined)
  }, 3000)
})
onUnmounted(() => clearInterval(timer))
watch(() => route.query.batch, () => { error.value = ''; notice.value = '' })
</script>

<template>
  <div class="vg-scope garment" :class="{ 'is-batch': batch }" data-testid="garment-studio">
    <div v-if="error" class="garment__alert is-error" role="alert"><span>{{ error }}</span><button v-if="needLogin" type="button" class="vg-btn vg-btn--sm" @click="router.push({ path: '/login', query: { next: '/garment-studio' } })">{{ t('cloud.login.submitLogin') }}</button><button v-else type="button" class="vg-icon-btn vg-icon-btn--sm" :aria-label="k('close')" @click="error = ''"><X :size="14" /></button></div>
    <div v-if="notice" class="garment__alert" role="status"><span>{{ notice }}</span><button type="button" class="vg-icon-btn vg-icon-btn--sm" :aria-label="k('close')" @click="notice = ''"><X :size="14" /></button></div>

    <BatchPanel v-if="batch" :batch="batch" :busy="busy" :points-per-image="pointsPerImage" @back="go('batches')" @action="act" @item="actItem" @remove="removeBatch" @again="again" @download="download" />

    <template v-else>
      <header class="vg-page-head">
        <span class="vg-page-head__icon"><Shirt :size="20" /></span>
        <div class="vg-page-head__text">
          <h1>{{ k('title') }}</h1>
          <p>{{ k('subtitle') }}</p>
        </div>
      </header>

      <nav class="gs-tabs" :aria-label="k('title')">
        <button v-for="item in PANES" :key="item.name" type="button" class="gs-tab" :class="{ 'is-active': pane === item.name }" :aria-current="pane === item.name ? 'page' : undefined" @click="go(item.name)"><component :is="item.icon" :size="15" />{{ k(`pane.${item.name || 'new'}`) }}<span v-if="item.name === 'batches' && batches.length" class="vg-count">{{ batches.length }}</span></button>
      </nav>

      <div v-if="pane === 'scenes'" class="garment__scroll">
        <p class="garment__lead">{{ k('sceneLibraryHint') }}</p>
        <SceneGallery :scenes="info?.scenes ?? []" :selected="picked" :uploading="uploadingScene" manage @toggle="toggleScene" @upload="uploadScene" @remove="removeScene" />
        <div v-if="picked.length" class="garment__use"><span>{{ k('pickedScenes', { count: picked.length }) }}</span><button type="button" class="vg-btn vg-btn--primary" @click="go('')">{{ k('useScenes') }}</button></div>
      </div>

      <div v-else-if="pane === 'models'" class="garment__scroll">
        <p class="garment__lead">{{ k('modelLibraryHint') }}</p>
        <ModelGallery :models="info?.models ?? []" :selected="modelId" :uploading="uploadingModel" manage @pick="modelId = modelId === $event ? '' : $event" @upload="uploadModel" @remove="removeModel" />
        <div v-if="model" class="garment__use"><span>{{ k('pickedModel', { name: model.name }) }}</span><button type="button" class="vg-btn" @click="setTask('model'); go('')">{{ k('useForModel') }}</button><button type="button" class="vg-btn vg-btn--primary" @click="setTask('tryon'); go('')">{{ k('useForTryon') }}</button></div>
      </div>

      <div v-else-if="pane === 'batches'" class="garment__scroll">
        <div v-if="batches.length" class="garment__batches">
          <button v-for="item in batches" :key="item.id" type="button" class="tile" @click="router.push({ query: { batch: item.id } })">
            <span class="tile__cover"><SwapImage v-for="row in [...item.items].sort((a, b) => Number(Boolean(b.outputFileId)) - Number(Boolean(a.outputFileId))).slice(0, 3)" :key="row.id" :file-id="row.outputFileId || row.sourceFileId" :width="140" /></span>
            <strong>{{ item.title }}</strong>
            <small>{{ k(`batchStatus.${item.status}`) }} · {{ k('done', { done: item.items.filter((row) => ['passed', 'review', 'failed', 'rejected'].includes(row.status)).length, total: item.items.length }) }}</small>
          </button>
        </div>
        <p v-else class="garment__none">{{ k('noBatches') }}</p>
      </div>

      <template v-else>
      <TaskCards :task="task" :tasks="SCENE_SWAP_TASKS" @pick="setTask" />
      <div class="garment__work">
        <section class="stage" :class="{ 'is-drop': dragging }" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="drop">
          <div v-if="!sources.length" class="stage__empty">
            <span class="stage__art"><ImagePlus :size="38" :stroke-width="1.4" /></span>
            <h2>{{ k(`task.${task}.emptyTitle`) }}</h2>
            <p>{{ k(`task.${task}.emptyHint`, { max: SCENE_SWAP_MAX_IMAGES }) }}</p>
            <div class="stage__pick">
              <button type="button" class="vg-btn vg-btn--lg vg-btn--primary" @click="pick('files')">{{ k('pickFiles') }}</button>
              <button type="button" class="vg-btn vg-btn--lg" @click="pick('folder')">{{ k('pickFolder') }}</button>
              <button type="button" class="vg-btn vg-btn--lg vg-btn--ghost" @click="pickFromLibrary">{{ k('pickLibrary') }}</button>
            </div>
          </div>
          <template v-else>
            <div class="stage__bar">
              <strong>{{ k('imageCount', { count: sources.length }) }}</strong>
              <span v-if="uploading" class="stage__note"><LoaderCircle :size="13" class="vg-spin" /> {{ k('uploading', { count: uploading }) }}</span>
              <span v-else-if="groups.length > 1" class="stage__note">{{ k('groupHint') }}</span>
              <span class="stage__gap" />
              <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" @click="pick('files')">{{ k('pickFiles') }}</button>
              <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" @click="pick('folder')">{{ k('pickFolder') }}</button>
              <button type="button" class="vg-btn vg-btn--sm vg-btn--ghost" @click="pickFromLibrary">{{ k('pickLibrary') }}</button>
            </div>
            <p v-if="sources.some((source) => source.error)" class="stage__failed">{{ k('uploadFailed', { count: sources.filter((source) => source.error).length }) }} <button type="button" class="vg-link" @click="retryUploads">{{ k('retry') }}</button></p>
            <p v-if="task === 'tryon'" class="stage__tip">{{ k('viewHint', { max: TRYON_MAX_PRODUCT_IMAGES }) }}</p>
            <div v-for="group in groups" :key="group.name" class="stage__group" @dragover.prevent @drop.prevent.stop="(event) => event.dataTransfer?.types.includes('text/scene-source') ? moveToGroup('', event, group.name) : drop(event)">
              <div class="stage__group-head"><input :value="group.name" :aria-label="k('groupName')" @change="renameGroup(group.name, $event)" /><span>{{ group.items.length }}</span><em v-if="task === 'tryon' && shots.includes('back') && !group.items.some((item) => item.view === 'back')">{{ k('noBack') }}</em><em v-if="task === 'tryon' && group.items.length > TRYON_MAX_PRODUCT_IMAGES">{{ k('tooManyProducts', { max: TRYON_MAX_PRODUCT_IMAGES }) }}</em></div>
              <div class="stage__photos">
                <div v-for="source in group.items" :key="source.key" class="photo" :class="{ 'is-bad': source.error }" :title="source.error || source.name" draggable="true" @dragstart="$event.dataTransfer?.setData('text/scene-source', source.key)">
                  <SwapImage :file-id="source.fileId" :alt="source.name" :width="150" />
                  <LoaderCircle v-if="!source.fileId && !source.error" :size="16" class="vg-spin photo__spin" />
                  <button v-if="task === 'tryon'" type="button" class="photo__view" :title="k('changeView')" @click="nextView(source)">{{ k(`view.${source.view}`) }}</button>
                  <button type="button" class="photo__remove" :aria-label="k('remove')" @click="removeSource(source.key)"><X :size="13" /></button>
                </div>
              </div>
            </div>
          </template>
        </section>

        <aside class="panel">
          <div class="panel__scroll">
            <section v-if="task === 'product'">
              <h2>{{ k('stepProduct') }}<span class="panel__name">{{ product.name }}</span></h2>
              <ProductPanel :file-ids="product.fileIds" :name="product.name" @change="product = $event" @error="error = $event" />
            </section>
            <section v-if="task === 'product'">
              <h2>{{ k('keepTitle') }}</h2>
              <p class="panel__hint panel__hint--first">{{ k('keepProduct') }}</p>
            </section>
            <section v-if="needModel">
              <h2>{{ k('stepModel') }}<span>{{ model?.name }}</span></h2>
              <ModelGallery :models="info?.models ?? []" :selected="modelId" :uploading="uploadingModel" @pick="modelId = $event" @upload="uploadModel" />
            </section>
            <section v-if="task === 'model'">
              <h2>{{ k('keepTitle') }}</h2>
              <p class="panel__hint panel__hint--first">{{ k(alsoScene ? 'keepNoScene' : 'keepAll') }}</p>
              <label class="panel__check">{{ k('alsoScene') }}<input v-model="alsoScene" type="checkbox" /></label>
            </section>
            <section v-if="task === 'tryon' || task === 'scene' || (task === 'model' && alsoScene)">
              <h2>{{ k('stepScenes') }}<span>{{ picked.length }} / {{ task === 'tryon' ? 1 : SCENE_SWAP_MAX_SCENES }}</span></h2>
              <SceneGallery :scenes="info?.scenes ?? []" :selected="picked" :uploading="uploadingScene" @toggle="toggleScene" @upload="uploadScene" />
              <p v-if="task === 'tryon' && !picked.length" class="panel__hint">{{ k('studioHint') }}</p>
              <p v-if="picked.length > 1" class="panel__hint">{{ k('sceneHint') }}</p>
            </section>
            <section v-if="task === 'tryon'">
              <h2>{{ k('stepShots') }}<span>{{ shots.length }}</span></h2>
              <div class="shots"><button v-for="shot in TRYON_SHOTS" :key="shot" type="button" class="shot-chip" :class="{ 'is-on': shots.includes(shot) }" :aria-pressed="shots.includes(shot)" @click="toggleShot(shot)">{{ k(`shot.${shot}`) }}</button></div>
            </section>
            <section v-if="task === 'scene'">
              <h2>{{ k('method') }}</h2>
              <div class="seg">
                <button type="button" :class="{ 'is-on': mode === 'keep' }" :aria-pressed="mode === 'keep'" :disabled="info ? !info.keepAvailable : false" @click="mode = 'keep'">{{ k('modeShort.keep') }}</button>
                <button type="button" :class="{ 'is-on': mode === 'blend' }" :aria-pressed="mode === 'blend'" @click="mode = 'blend'">{{ k('modeShort.blend') }}</button>
              </div>
              <p class="panel__hint">{{ info && !info.keepAvailable ? k('keepUnavailable') : mode === 'keep' ? k('keepHint') : k('blendHint') }}</p>
            </section>
            <section v-if="task === 'tryon' || task === 'scene'">
              <button type="button" class="panel__more" :aria-expanded="more" @click="more = !more">{{ k('more') }}<ChevronDown :size="15" :class="{ 'is-open': more }" /></button>
              <div v-if="more" class="panel__options">
                <template v-if="task === 'tryon'">
                  <span class="panel__label">{{ k('size') }}</span>
                  <div class="seg"><button v-for="name in SIZES.slice(1)" :key="name" type="button" :class="{ 'is-on': tryonSize === name }" :aria-pressed="tryonSize === name" @click="tryonSize = name">{{ name }}</button></div>
                </template>
                <template v-else-if="mode === 'keep'">
                  <span class="panel__label">{{ k('size') }}</span>
                  <div class="seg"><button v-for="name in SIZES" :key="name" type="button" :class="{ 'is-on': size === name }" :aria-pressed="size === name" @click="size = name">{{ name === 'original' ? k('sizeShort') : name }}</button></div>
                  <label class="panel__check">{{ k('matchLight') }}<input v-model="matchLight" type="checkbox" /></label>
                </template>
                <p v-else class="panel__hint">{{ k('blendSize') }}</p>
              </div>
            </section>
          </div>
          <footer class="panel__foot">
            <div class="panel__sum"><span>{{ task === 'tryon' ? k('sumTryon', { styles: groups.length }) : task === 'model' ? k('sumModel', { images: ready.length }) : task === 'product' ? k('sumProduct', { images: ready.length }) : k('sum', { images: ready.length, scenes: picked.length }) }}</span><strong>{{ k('imageCount', { count: total }) }}</strong></div>
            <div v-if="pointsPerImage" class="panel__sum"><span>{{ k('estimate') }}</span><strong>{{ k('points', { points: total * pointsPerImage }) }}</strong></div>
            <button type="button" class="vg-btn vg-btn--primary panel__go" :disabled="!canStart" data-testid="scene-start" @click="start"><LoaderCircle v-if="busy" :size="15" class="vg-spin" /> {{ k(info && !info.trialsLeft ? 'startPaidTrial' : 'startTrial', { count: trialCount || 2 }) }}</button>
            <small v-if="blocked">{{ k('blocked', { name: blocked }) }}</small>
            <small v-else-if="task === 'tryon' && total > SCENE_SWAP_MAX_IMAGES">{{ k('tooManyOutputs', { max: SCENE_SWAP_MAX_IMAGES }) }}</small>
            <small v-else-if="needModel && !model">{{ k('needModel') }}</small>
            <small v-else-if="task === 'product' && !product.fileIds.length">{{ k('needProduct') }}</small>
            <small v-else>{{ info && !info.trialsLeft ? k('noTrials') : k(task === 'tryon' ? 'trialNoteTryon' : 'trialNote') }}</small>
          </footer>
        </aside>
      </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.garment {
  --gs-bg: var(--theme-shell);
  --gs-panel: var(--theme-panel);
  --gs-well: var(--theme-panel-soft);
  --gs-hover: var(--theme-control-hover);
  --gs-line: var(--theme-border);
  display: flex; flex-direction: column; height: 100%; gap: 14px; min-height: 0; padding: 16px 20px 20px; overflow: auto; background: radial-gradient(1100px 380px at 40% -140px, color-mix(in srgb, var(--theme-accent) 8%, transparent), transparent 72%), var(--gs-bg); font-size: 13px; scrollbar-width: thin; scrollbar-color: var(--gs-hover) transparent;
}
.garment.is-batch { gap: 0; padding: 0; }
.garment :deep(*) { scrollbar-width: thin; scrollbar-color: var(--gs-hover) transparent; }
.garment :deep(.vg-btn--primary:disabled) { border-color: transparent; background: var(--gs-hover); color: var(--theme-text-muted); opacity: 1; }
.garment :deep(.vg-btn:not(.vg-btn--primary):hover:not(:disabled)) { border-color: var(--theme-text-muted); background: var(--gs-hover); color: var(--theme-text); }
.garment :deep(.vg-btn--ghost:hover:not(:disabled)) { border-color: transparent; }
.garment__alert { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 9px 14px; border: 1px solid var(--gs-line); border-radius: 10px; background: var(--gs-well); }
.garment.is-batch .garment__alert { margin: 12px 20px 0; }
.garment__alert.is-error { background: var(--theme-danger-soft); color: var(--theme-danger-text); }
.garment__scroll { flex: 1; min-height: 0; overflow: auto; padding: 18px; border: 1px solid var(--gs-line); border-radius: 12px; background: var(--gs-panel); }
.garment__lead { margin-bottom: 18px; color: var(--theme-text-muted); }
.garment__none { padding: 90px 0; color: var(--theme-text-muted); text-align: center; }
.garment__use { position: sticky; bottom: -18px; display: flex; gap: 16px; align-items: center; justify-content: flex-end; margin: 24px -18px -18px; padding: 14px 18px; border-top: 1px solid var(--gs-line); background: var(--gs-panel); }
.garment__batches { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 28px 20px; }
.tile { min-width: 0; padding: 0; border: 0; background: none; color: var(--theme-text); text-align: left; cursor: pointer; }
.tile__cover { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; overflow: hidden; border-radius: 8px; background: var(--gs-well); transition: opacity .15s; }
.tile:hover .tile__cover { opacity: .85; }
.tile strong { display: block; margin-top: 10px; overflow: hidden; font-size: 13.5px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.tile small { color: var(--theme-text-muted); font-size: 12px; }

.garment__work { display: grid; flex: 1; grid-template-columns: minmax(0, 1fr) 360px; gap: 14px; min-height: 0; }
.stage { display: flex; flex-direction: column; min-height: 0; overflow: auto; padding: 0 18px 18px; border: 1px solid var(--gs-line); border-radius: 12px; background: var(--gs-panel); transition: border-color .15s; }
.stage.is-drop { border-color: var(--vg-accent); }
.stage__empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; margin-top: 18px; padding: 36px 16px; border: 1px dashed color-mix(in srgb, var(--theme-accent) 30%, var(--theme-border)); border-radius: 12px; color: var(--theme-text-muted); text-align: center; transition: background .15s; }
.stage.is-drop .stage__empty { border-color: var(--vg-accent); background: color-mix(in srgb, var(--theme-accent) 7%, transparent); }
.stage__art { display: grid; place-items: center; width: 84px; height: 84px; border-radius: 22px; background: radial-gradient(circle, color-mix(in srgb, var(--theme-accent) 22%, transparent), transparent 72%); color: var(--theme-accent); }
.stage__empty h2 { margin: 16px 0 6px; color: var(--theme-text); font-size: 17px; font-weight: 600; letter-spacing: -.01em; }
.stage__empty p { max-width: 420px; font-size: 13.5px; line-height: 1.7; }
.stage__pick { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 26px; }
.stage__pick .vg-btn { height: 34px; padding: 0 16px; font-size: 13px; border-radius: 8px; }

.stage__bar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 12px 0; background: var(--gs-panel); }
.stage__bar strong { font-weight: 600; }
.stage__note { display: inline-flex; gap: 6px; align-items: center; color: var(--theme-text-muted); font-size: 12px; }
.stage__gap { flex: 1; }
.stage__failed { margin-bottom: 8px; color: var(--vg-red); }
.stage__group { padding: 14px 0 18px; border-top: 1px solid var(--gs-line); }
.stage__group-head { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.stage__group-head input { width: auto; min-width: 60px; max-width: 320px; field-sizing: content; margin-left: -8px; padding: 4px 8px; border: 1px solid transparent; border-radius: 5px; background: none; color: var(--theme-text); font-size: 13px; font-weight: 500; }
.stage__group-head input:hover { background: var(--gs-well); }
.stage__group-head input:focus { border-color: var(--theme-text-muted); outline: none; background: var(--gs-well); }
.stage__group-head span { color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.stage__photos { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 10px; }
.photo { position: relative; overflow: hidden; border-radius: 6px; cursor: grab; }
.photo.is-bad { box-shadow: 0 0 0 2px var(--vg-red); }
.photo__spin { position: absolute; inset: 0; margin: auto; color: var(--theme-text-muted); }
.photo__remove { position: absolute; top: 6px; right: 6px; display: grid; width: 24px; height: 24px; padding: 0; place-items: center; border: 0; border-radius: 5px; background: rgba(0, 0, 0, .6); color: #fff; cursor: pointer; opacity: 0; }
.photo:hover .photo__remove, .photo__remove:focus-visible { opacity: 1; }
.photo__view { position: absolute; top: 6px; left: 6px; padding: 2px 8px; border: 0; border-radius: 5px; background: rgba(0, 0, 0, .66); color: #fff; font-size: 11px; cursor: pointer; }
.photo__view:hover { background: rgba(0, 0, 0, .85); }
.stage__tip { color: var(--theme-text-muted); font-size: 12px; margin-bottom: 10px; }
.stage__group-head em { color: var(--vg-amber); font-size: 12px; font-style: normal; }
.shots { display: flex; flex-wrap: wrap; gap: 7px; }
.shot-chip { padding: 4px 12px; border: 1px solid var(--gs-line); border-radius: 7px; background: var(--gs-well); color: var(--theme-text-secondary); font-size: 12.5px; cursor: pointer; }
.shot-chip:hover { color: var(--theme-text); }
.shot-chip.is-on { border-color: var(--vg-accent); background: color-mix(in srgb, var(--vg-accent) 28%, var(--theme-panel)); color: var(--theme-text); font-weight: 600; }
.panel__name { max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.panel__hint--first { margin: 0 0 10px; }

.panel { display: flex; flex-direction: column; min-height: 0; overflow: hidden; border: 1px solid var(--gs-line); border-radius: 12px; background: var(--gs-panel); }
.panel__scroll { flex: 1; min-height: 0; overflow: auto; }
.panel section { padding: 16px 18px; border-bottom: 1px solid var(--gs-line); }
.panel section:last-child { border-bottom: 0; }
.panel h2 { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 13px; font-weight: 600; }
.panel h2 span { color: var(--theme-text-muted); font-weight: 400; font-variant-numeric: tabular-nums; }
.panel__hint { margin-top: 10px; color: var(--theme-text-muted); font-size: 12px; line-height: 1.6; }
.panel__label { font-size: 12.5px; color: var(--theme-text-secondary); }
.seg { display: flex; padding: 3px; border-radius: 8px; background: var(--gs-well); }
.seg button { flex: 1; height: 30px; padding: 0 6px; border: 0; border-radius: 6px; background: none; color: var(--theme-text-secondary); font-size: 12.5px; white-space: nowrap; cursor: pointer; }
.seg button:hover:not(:disabled):not(.is-on) { color: var(--theme-text); }
.seg button.is-on { background: color-mix(in srgb, var(--vg-accent) 28%, var(--theme-panel)); color: var(--theme-text); font-weight: 600; box-shadow: 0 0 0 1px var(--vg-accent-line); }
.seg button:disabled { opacity: .4; cursor: not-allowed; }
.panel__more { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 0; border: 0; background: none; color: var(--theme-text); font-size: 13px; font-weight: 600; cursor: pointer; }
.panel__more svg { color: var(--theme-text-muted); transition: transform .15s; }
.panel__more svg.is-open { transform: rotate(180deg); }
.panel__options { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.panel__check { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 12.5px; cursor: pointer; color: var(--theme-text-secondary); }
.panel__foot { display: flex; flex-direction: column; gap: 8px; padding: 14px 18px 16px; border-top: 1px solid var(--gs-line); }
.panel__sum { display: flex; justify-content: space-between; color: var(--theme-text-muted); font-variant-numeric: tabular-nums; }
.panel__sum strong { color: var(--theme-text); font-weight: 600; }
.panel__go { width: 100%; height: 36px; margin-top: 4px; font-size: 13px; }
.panel__foot small { color: var(--theme-text-muted); font-size: 12px; line-height: 1.6; }
button:focus-visible { outline: 2px solid var(--vg-accent); outline-offset: 2px; }
@media (max-width: 900px) { .garment__work { display: block; } .stage { overflow: visible; min-height: 320px; } .panel { margin-top: 14px; } .panel__scroll { overflow: visible; } }
</style>
