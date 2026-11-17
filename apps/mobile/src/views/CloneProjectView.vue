<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, Boxes, Clapperboard, Film, Image as ImageIcon, LoaderCircle, RefreshCw, UserRound, X } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncCloneProject, type SyncJobState } from '@shared/cloud/sync'
import { CLONE_SHOT_ROLE_LABELS } from '@shared/cloud/clone'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import { analyze, compose, generateFrames, generateShotVideos, refreshProject, setSource, toggleSkip, usableShots } from '@/lib/clone'
import { coverOf, useModels, type ProductItem } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { getRecord, syncState } from '@/lib/sync'
import { toast } from '@/lib/toast'

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)
const project = ref<SyncCloneProject | null>(null)
const loaded = ref(false)
const busy = ref('')
const pickingProduct = ref(false)
const pickingModel = ref(false)
const { items: models } = useModels()
let timer: ReturnType<typeof setTimeout> | null = null

async function load() {
  project.value = (await getRecord<SyncCloneProject>(SYNC_COLLECTIONS.cloneProjects, id))?.data ?? null
  loaded.value = true
}
watch(() => syncState.version, load, { immediate: true })

function poll() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    timer = null
    const still = await refreshProject(id).catch(() => true)
    if (still) poll()
  }, 4000)
}
onMounted(() => {
  void refreshProject(id).then((still) => still && poll())
})
onBeforeUnmount(() => timer && clearTimeout(timer))

const shots = computed(() => (project.value ? usableShots(project.value) : []))
const skipped = computed(() => (project.value?.analysis?.shots.length ?? 0) - shots.value.length)
const framesDone = computed(() => shots.value.filter((shot) => project.value?.shots[shot.id]?.frameFileId).length)
const videosDone = computed(() => shots.value.filter((shot) => project.value?.shots[shot.id]?.videoFileId).length)
const step = computed(() => {
  const p = project.value
  if (!p || p.analyzeStatus !== 'succeeded') return 1
  if (!p.productImageFileId) return 2
  if (!framesDone.value) return 3
  if (!p.finalFileId) return 4
  return 5
})
const running = (status?: SyncJobState) => status === 'queued' || status === 'running'

async function act(name: string, run: (p: SyncCloneProject) => Promise<void>, message?: string) {
  if (!project.value) return
  busy.value = name
  try {
    await run(project.value)
    if (message) toast(message)
    poll()
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = ''
  }
}

function pickProduct(product: ProductItem) {
  pickingProduct.value = false
  const fileId = coverOf(product)
  if (!fileId) {
    toast('这个商品还没有图片')
    return
  }
  void act('source', (p) => setSource(id, p, { productId: product.id, productName: product.name, productImageFileId: fileId, modelId: p.modelId, modelImageFileId: p.modelImageFileId }))
}

function pickModel(modelId: string | null) {
  pickingModel.value = false
  const model = models.value.find((item) => item.id === modelId)
  void act('source', (p) =>
    setSource(id, p, { productId: p.productId, productName: p.productName, productImageFileId: p.productImageFileId, modelId: model?.id, modelImageFileId: model ? coverOf(model) || undefined : undefined }),
  )
}

const allFrameIds = () => shots.value.map((shot) => shot.id)
const framedIds = () => shots.value.filter((shot) => project.value?.shots[shot.id]?.frameFileId && !project.value?.shots[shot.id]?.skip).map((shot) => shot.id)
</script>

<template>
  <PageHeader :title="project?.name || '复刻'" back="/clone" />
  <main v-if="loaded && project" class="m-page m-page--no-tabs">
    <!-- 进度条 -->
    <ol class="steps">
      <li v-for="(label, index) in ['拆解', '选商品', '分镜图', '分镜视频', '成片']" :key="label" :class="{ 'is-done': step > index + 1, 'is-current': step === index + 1 }">
        <span>{{ index + 1 }}</span>{{ label }}
      </li>
    </ol>

    <!-- 1. 拆解 -->
    <section class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">1. 拆解对标视频</h2></div>
      <div v-if="running(project.analyzeStatus)" class="state m-card"><LoaderCircle :size="20" class="m-spin" /> AI 正在拆分镜、写脚本，约 1–3 分钟…</div>
      <div v-else-if="project.analyzeStatus === 'failed'" class="state state--error m-card">
        <AlertTriangle :size="18" /> {{ project.analyzeError || '拆解失败' }}
        <button type="button" class="m-btn m-btn--sm" :disabled="busy === 'analyze'" @click="act('analyze', (p) => analyze(id, p), '已重新开始拆解')"><RefreshCw :size="14" /> 重试</button>
      </div>
      <div v-else-if="project.analysis" class="m-card m-card--pad summary">
        <p v-if="project.analysis.summary">{{ project.analysis.summary }}</p>
        <p class="m-muted small">{{ project.analysis.totalDurationSec.toFixed(1) }} 秒 · {{ project.analysis.shots.length }} 个分镜<template v-if="skipped"> · {{ skipped }} 个录屏/教学镜头已跳过</template></p>
        <p v-if="project.analysis.scriptError" class="m-muted small">脚本分析没成功，分镜仍可使用</p>
      </div>
    </section>

    <template v-if="project.analysis">
      <!-- 2. 选商品 / 模特 -->
      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">2. 换成你的商品</h2></div>
        <div class="sources">
          <button type="button" class="source m-card" @click="pickingProduct = true">
            <span class="source__img"><CloudImage v-if="project.productImageFileId" :file-id="project.productImageFileId" /><Boxes v-else :size="22" /></span>
            <span class="source__text"><strong>{{ project.productName || '选择商品' }}</strong><small>必选</small></span>
          </button>
          <button type="button" class="source m-card" @click="pickingModel = true">
            <span class="source__img"><CloudImage v-if="project.modelImageFileId" :file-id="project.modelImageFileId" /><UserRound v-else :size="22" /></span>
            <span class="source__text"><strong>{{ models.find((m) => m.id === project?.modelId)?.name || '选择模特' }}</strong><small>可选，保持人物一致</small></span>
          </button>
        </div>
      </section>

      <!-- 3/4. 分镜 -->
      <section class="m-section">
        <div class="m-section__head">
          <h2 class="m-section__title">3. 分镜</h2>
          <span class="m-muted small">分镜图 {{ framesDone }}/{{ shots.length }} · 视频 {{ videosDone }}/{{ shots.length }}</span>
        </div>
        <div class="actions">
          <button type="button" class="m-btn m-btn--primary" :disabled="!project.productImageFileId || busy === 'frames'" @click="act('frames', (p) => generateFrames(id, p, allFrameIds()), '已提交分镜图，约 1–2 分钟')">
            <LoaderCircle v-if="busy === 'frames'" :size="16" class="m-spin" /><ImageIcon v-else :size="16" /> {{ framesDone ? '重新生成全部分镜图' : '生成分镜图' }}
          </button>
          <button type="button" class="m-btn" :disabled="!framesDone || busy === 'videos'" @click="act('videos', (p) => generateShotVideos(id, p, framedIds()), '已提交分镜视频，约 3–8 分钟')">
            <LoaderCircle v-if="busy === 'videos'" :size="16" class="m-spin" /><Clapperboard v-else :size="16" /> 生成分镜视频
          </button>
        </div>
        <p v-if="!project.productImageFileId" class="m-muted small note">先在上一步选商品，才能生成分镜图</p>

        <div class="shot-list">
          <div v-for="shot in shots" :key="shot.id" class="shot m-card" :class="{ 'is-skip': project.shots[shot.id]?.skip }">
            <div class="shot__media">
              <div class="shot__ref"><CloudImage :file-id="shot.frameFileId" /><small>原片</small></div>
              <div class="shot__out">
                <CloudVideo v-if="project.shots[shot.id]?.videoFileId" :file-id="project.shots[shot.id]?.videoFileId" autoplay />
                <CloudImage v-else-if="project.shots[shot.id]?.frameFileId" :file-id="project.shots[shot.id]?.frameFileId" />
                <span v-else class="shot__empty">
                  <LoaderCircle v-if="running(project.shots[shot.id]?.frameStatus)" :size="18" class="m-spin" />
                  <AlertTriangle v-else-if="project.shots[shot.id]?.frameStatus === 'failed'" :size="18" />
                  <ImageIcon v-else :size="18" />
                </span>
                <span v-if="running(project.shots[shot.id]?.videoStatus)" class="shot__badge"><LoaderCircle :size="12" class="m-spin" /> 视频生成中</span>
                <span v-else-if="project.shots[shot.id]?.videoFileId" class="shot__badge is-ok"><Film :size="12" /> 视频</span>
              </div>
            </div>
            <div class="shot__info">
              <div class="shot__head">
                <strong>镜头 {{ shot.index + 1 }}</strong>
                <span class="m-tag">{{ CLONE_SHOT_ROLE_LABELS[shot.role] || shot.role }}</span>
                <span class="m-muted small">{{ shot.durationSec.toFixed(1) }}s</span>
              </div>
              <p v-if="shot.scriptText" class="shot__script">{{ shot.scriptText }}</p>
              <p v-if="project.shots[shot.id]?.frameError || project.shots[shot.id]?.videoError" class="shot__error">{{ project.shots[shot.id]?.videoError || project.shots[shot.id]?.frameError }}</p>
              <div class="shot__actions">
                <button type="button" class="link" :disabled="!project.productImageFileId" @click="act('one', (p) => generateFrames(id, p, [shot.id]), '已重新生成这一镜')">重做分镜图</button>
                <button type="button" class="link" :disabled="!project.shots[shot.id]?.frameFileId" @click="act('one', (p) => generateShotVideos(id, p, [shot.id]), '已提交这一镜的视频')">生成视频</button>
                <button type="button" class="link" @click="act('one', (p) => toggleSkip(id, p, shot.id))">{{ project.shots[shot.id]?.skip ? '放回成片' : '不要这镜' }}</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 5. 成片 -->
      <section class="m-section">
        <div class="m-section__head"><h2 class="m-section__title">4. 合成成片</h2></div>
        <div v-if="project.finalFileId" class="final m-card"><CloudVideo :file-id="project.finalFileId" controls autoplay /></div>
        <div v-else-if="running(project.composeStatus)" class="state m-card"><LoaderCircle :size="20" class="m-spin" /> 正在按原片节奏拼接…</div>
        <div v-else-if="project.composeStatus === 'failed'" class="state state--error m-card"><AlertTriangle :size="18" /> {{ project.composeError || '合成失败' }}</div>
        <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="!framesDone || busy === 'compose' || running(project.composeStatus)" @click="act('compose', (p) => compose(id, p), '开始合成，约 1 分钟')">
          <LoaderCircle v-if="busy === 'compose'" :size="18" class="m-spin" /><Film v-else :size="18" /> {{ project.finalFileId ? '重新合成' : '合成成片' }}
        </button>
        <p class="m-muted small note">还没生成视频的镜头会用分镜图做静帧；成片不带声音，发布时再配乐。完成后也会出现在「审核收件箱」。</p>
      </section>
    </template>
  </main>
  <main v-else-if="loaded" class="m-page m-page--no-tabs"><div class="m-card m-empty"><span class="m-empty__title">项目不存在</span></div></main>

  <ProductPicker v-if="pickingProduct" @close="pickingProduct = false" @pick="pickProduct" />
  <Teleport to="body">
    <div v-if="pickingModel" class="sheet-backdrop" @click.self="pickingModel = false">
      <section class="sheet">
        <header class="sheet__head"><h2>选择模特</h2><button type="button" class="m-icon-btn" aria-label="关闭" @click="pickingModel = false"><X :size="20" /></button></header>
        <div class="model-grid">
          <button type="button" class="model" :class="{ 'is-active': !project?.modelId }" @click="pickModel(null)"><span class="model__img"><UserRound :size="22" /></span>不指定</button>
          <button v-for="model in models" :key="model.id" type="button" class="model" :class="{ 'is-active': project?.modelId === model.id }" @click="pickModel(model.id)">
            <span class="model__img"><CloudImage :file-id="coverOf(model)" /></span>{{ model.name }}
          </button>
        </div>
        <button v-if="!models.length" type="button" class="m-btn m-btn--block" @click="router.push('/library/models/new')">先去模特库添加模特</button>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.small { font-size: 12px; }
.note { margin: 10px 2px 0; line-height: 1.6; }
.steps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin: 4px 0 0; padding: 0; list-style: none; }
.steps li { display: flex; flex-direction: column; align-items: center; gap: 4px; color: var(--theme-text-muted); font-size: 11px; font-weight: 600; }
.steps li span { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--theme-border-control); font-size: 12px; }
.steps li.is-done span { background: var(--m-accent); border-color: var(--m-accent); color: #04201c; }
.steps li.is-current { color: var(--m-accent-2); }
.steps li.is-current span { border-color: var(--m-accent); color: var(--m-accent-2); background: var(--m-accent-soft); }
.state { display: flex; align-items: center; gap: 10px; padding: 14px 16px; color: var(--theme-text-secondary); font-size: 13px; }
.state--error { color: var(--theme-danger-text); flex-wrap: wrap; }
.summary p { margin: 0 0 6px; font-size: 13px; line-height: 1.6; }
.sources { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.source { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 10px; text-align: left; }
.source__img { flex: none; display: grid; place-items: center; width: 48px; height: 48px; overflow: hidden; border-radius: 10px; background: var(--theme-control); color: var(--theme-text-muted); }
.source__text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.source__text strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.source__text small { color: var(--theme-text-muted); font-size: 11px; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.actions .m-btn { height: 44px; font-size: 13px; padding: 0 10px; }
.shot-list { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.shot { display: flex; gap: 12px; padding: 10px; }
.shot.is-skip { opacity: .45; }
.shot__media { flex: none; display: flex; gap: 6px; }
.shot__ref, .shot__out { position: relative; width: 64px; height: 112px; overflow: hidden; border-radius: 8px; background: var(--theme-panel-soft); }
.shot__out { width: 72px; height: 128px; border: 1px solid var(--m-accent-line); }
.shot__ref small { position: absolute; left: 4px; bottom: 4px; padding: 0 5px; border-radius: 4px; background: rgba(0, 0, 0, .6); color: #fff; font-size: 9px; }
.shot__empty { display: grid; place-items: center; width: 100%; height: 100%; color: var(--theme-text-muted); }
.shot__badge { position: absolute; left: 4px; right: 4px; bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 3px; padding: 2px 0; border-radius: 6px; background: rgba(0, 0, 0, .65); color: #fff; font-size: 9px; font-weight: 700; }
.shot__badge.is-ok { background: color-mix(in srgb, var(--m-accent) 80%, #000); color: #04201c; }
.shot__info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.shot__head { display: flex; align-items: center; gap: 6px; }
.shot__head strong { font-size: 13px; }
.shot__script { margin: 0; font-size: 12px; line-height: 1.5; color: var(--theme-text-secondary); display: -webkit-box; overflow: hidden; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.shot__error { margin: 0; color: var(--theme-danger-text); font-size: 11px; display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.shot__actions { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: auto; }
.link { padding: 0; border: 0; background: none; color: var(--m-accent-2); font-size: 12px; font-weight: 700; }
.link:disabled { color: var(--theme-text-muted); }
.final { overflow: hidden; aspect-ratio: 9 / 16; max-height: 70vh; margin: 0 auto 12px; }
.sheet-backdrop { position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-end; background: var(--theme-overlay); }
.sheet { width: 100%; max-height: 78vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 8px var(--m-gutter) calc(16px + var(--m-safe-bottom)); border-radius: 22px 22px 0 0; background: var(--theme-panel); }
.sheet__head { display: flex; align-items: center; justify-content: space-between; }
.sheet__head h2 { margin: 0; font-size: 17px; }
.model-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.model { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px; border: 1px solid var(--theme-border); border-radius: 12px; background: none; font-size: 12px; font-weight: 600; }
.model.is-active { border-color: var(--m-accent); background: var(--m-accent-soft); }
.model__img { display: grid; place-items: center; width: 64px; height: 84px; overflow: hidden; border-radius: 8px; background: var(--theme-control); color: var(--theme-text-muted); }
</style>
