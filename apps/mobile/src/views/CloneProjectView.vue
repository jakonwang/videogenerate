<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, ArrowLeft, Boxes, Clapperboard, Download, Film, Image as ImageIcon, LoaderCircle, RefreshCw, SlidersHorizontal, UserRound, X } from 'lucide-vue-next'
import { fileBlob } from '@/lib/files'
import { downloadBlob } from '@/lib/platform'
import { SYNC_COLLECTIONS, type SyncCloneProject, type SyncJobState } from '@shared/cloud/sync'
import { CLONE_SHOT_ROLE_LABELS } from '@shared/cloud/clone'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProductPicker from '@/components/ProductPicker.vue'
import { CLONE_STEPS, analyze, cloneProgress, compose, generateFrames, generateShotVideos, refreshProject, setSource, toggleSkip, usableShots } from '@/lib/clone'
import { coverOf, useModels, type ProductItem } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { getRecord, syncState } from '@/lib/sync'
import { toast } from '@/lib/toast'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
import { Check } from 'lucide-vue-next'
const inWebShell = useInWebShell()

const route = useRoute()
const router = useRouter()
const id = String(route.params.id ?? route.params.projectId)
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

/* 网页版：同电脑端的分步页面，一次看一个步骤；默认停在当前该做的那一步 */
const STEP_META = [
  { title: '参考视频分析', desc: '提取脚本结构、内容节奏与可复刻信息' },
  { title: '选择商品与模特', desc: '分镜里的商品换成你的商品，可指定模特保持人物一致' },
  { title: '分镜设计', desc: '按原片构图为每个镜头生成换上商品的分镜图' },
  { title: '分镜视频', desc: '把每张分镜图生成动态视频片段' },
  { title: '成片合成', desc: '按原片节奏把镜头拼接成完整成片' },
]
const viewStep = ref(1)
const stepDone = computed(() => (project.value ? cloneProgress(project.value).done : [false, false, false, false, false]))
let stepChosen = false
watch(project, (value) => {
  if (value && !stepChosen) {
    viewStep.value = cloneProgress(value).current
    stepChosen = true
  }
})
async function downloadFinal() {
  if (!project.value?.finalFileId) return
  try {
    downloadBlob(await fileBlob(project.value.finalFileId), `${project.value.name || '复刻成片'}.mp4`)
  } catch (error) {
    toast(errorMessage(error))
  }
}

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
  <template v-if="inWebShell">
    <main v-if="loaded && project" class="vg-page cps" data-testid="web-clone-project">
      <!-- 顶部步骤条（同电脑端：返回任务列表 + 各步骤） -->
      <nav class="cps-bar">
        <button type="button" class="cps-back" @click="router.push('/clone')"><ArrowLeft :size="15" /> 任务列表</button>
        <template v-for="(label, index) in CLONE_STEPS" :key="label">
          <button type="button" class="cps-step" :class="{ 'is-active': viewStep === index + 1, 'is-done': stepDone[index] }" @click="viewStep = index + 1">
            <span class="cps-step__num"><Check v-if="stepDone[index] && viewStep !== index + 1" :size="12" /><template v-else>{{ index + 1 }}</template></span>{{ label }}
          </button>
          <span v-if="index < CLONE_STEPS.length - 1" class="cps-line" :class="{ 'is-done': stepDone[index] }"></span>
        </template>
      </nav>
      <div class="cps-tip">
        <span><SlidersHorizontal :size="15" /><strong>逐步调整</strong> 这里可以逐个步骤查看和修改；任务在云端执行，关掉网页也会继续。</span>
        <span class="vg-muted">{{ project.name }}</span>
      </div>

      <header class="cps-head">
        <span class="cps-head__num">{{ String(viewStep).padStart(2, '0') }}</span>
        <div class="cps-head__text"><h1>{{ STEP_META[viewStep - 1].title }}</h1><p>{{ STEP_META[viewStep - 1].desc }}</p></div>
        <div class="cps-head__actions">
          <template v-if="viewStep === 1">
            <button v-if="project.analyzeStatus === 'failed'" type="button" class="vg-btn vg-btn--primary" :disabled="busy === 'analyze'" @click="act('analyze', (p) => analyze(id, p), '已重新开始拆解')"><RefreshCw :size="14" /> 重新分析</button>
            <button v-else type="button" class="vg-btn vg-btn--primary" :disabled="!project.analysis" @click="viewStep = 2">下一步：选择商品</button>
          </template>
          <template v-else-if="viewStep === 2">
            <button type="button" class="vg-btn" @click="pickingModel = true"><UserRound :size="14" /> {{ project.modelId ? '更换模特' : '选择模特' }}</button>
            <button type="button" class="vg-btn vg-btn--primary" @click="pickingProduct = true"><Boxes :size="14" /> {{ project.productImageFileId ? '更换商品' : '选择商品' }}</button>
          </template>
          <template v-else-if="viewStep === 3">
            <button type="button" class="vg-btn vg-btn--primary" :disabled="!project.productImageFileId || busy === 'frames'" @click="act('frames', (p) => generateFrames(id, p, allFrameIds()), '已开始生成分镜图')">
              <LoaderCircle v-if="busy === 'frames'" :size="14" class="vg-spin" /><ImageIcon v-else :size="14" /> {{ framesDone ? '重新生成全部分镜图' : '生成分镜图' }}
            </button>
          </template>
          <template v-else-if="viewStep === 4">
            <button type="button" class="vg-btn vg-btn--primary" :disabled="!framesDone || busy === 'videos'" @click="act('videos', (p) => generateShotVideos(id, p, framedIds()), '已提交分镜视频')">
              <LoaderCircle v-if="busy === 'videos'" :size="14" class="vg-spin" /><Clapperboard v-else :size="14" /> 生成分镜视频
            </button>
          </template>
          <template v-else>
            <button v-if="project.finalFileId" type="button" class="vg-btn" @click="downloadFinal"><Download :size="14" /> 下载成片</button>
            <button type="button" class="vg-btn vg-btn--primary" :disabled="!framesDone || busy === 'compose' || running(project.composeStatus)" @click="act('compose', (p) => compose(id, p), '已开始合成')">
              <LoaderCircle v-if="busy === 'compose' || running(project.composeStatus)" :size="14" class="vg-spin" /><Film v-else :size="14" /> {{ project.finalFileId ? '重新合成' : '合成成片' }}
            </button>
          </template>
        </div>
      </header>

      <!-- 01 参考分析 -->
      <div v-if="viewStep === 1" class="cps-analyze">
        <section class="vg-card cps-card cps-ref">
          <h3 class="cps-card__title">参考视频 <small>{{ project.analysis ? '分析完成' : '上传后自动分析' }}</small></h3>
          <div class="cps-ref__video"><CloudVideo :file-id="project.referenceVideoFileId" controls /></div>
          <dl class="cps-kv">
            <dt>文件名</dt><dd>{{ project.name }}</dd>
            <dt>片段数</dt><dd>{{ project.analysis?.shots.length ?? 0 }}</dd>
            <dt>时长</dt><dd>{{ project.analysis ? `${project.analysis.totalDurationSec.toFixed(1)} 秒` : '—' }}</dd>
            <dt>状态</dt><dd><span class="vg-pill vg-pill--dot" :class="project.analyzeStatus === 'succeeded' ? 'vg-pill--green' : project.analyzeStatus === 'failed' ? 'vg-pill--red' : 'vg-pill--blue'">{{ project.analyzeStatus === 'succeeded' ? '已分析' : project.analyzeStatus === 'failed' ? '分析失败' : '分析中' }}</span></dd>
          </dl>
        </section>
        <div class="cps-analyze__main">
          <section class="vg-card cps-card">
            <h3 class="cps-card__title">内容结构 <small>{{ project.analysis ? `${project.analysis.shots.length} 段` : '等待分析' }}</small></h3>
            <div v-if="running(project.analyzeStatus)" class="cps-wait"><LoaderCircle :size="18" class="vg-spin" /> AI 正在拆分镜、写脚本，约 1–3 分钟…</div>
            <div v-else-if="project.analyzeStatus === 'failed'" class="cps-wait is-error"><AlertTriangle :size="16" /> {{ project.analyzeError || '拆解失败' }}</div>
            <template v-else-if="project.analysis">
              <p v-if="project.analysis.summary" class="cps-summary">{{ project.analysis.summary }}</p>
              <div class="cps-structure">
                <div v-for="shot in project.analysis.shots" :key="shot.id" class="cps-seg" :class="{ 'is-skip': !shots.some((s) => s.id === shot.id) }" :style="{ flex: Math.max(0.6, shot.durationSec) }" :title="`${CLONE_SHOT_ROLE_LABELS[shot.role] || shot.role} · ${shot.durationSec.toFixed(1)}s`">
                  <CloudImage :file-id="shot.frameFileId" /><span>{{ CLONE_SHOT_ROLE_LABELS[shot.role] || shot.role }}</span>
                </div>
              </div>
              <p v-if="skipped" class="vg-muted cps-tiny">{{ skipped }} 个录屏 / 教学镜头已自动跳过。</p>
            </template>
            <div v-else class="cps-wait">完成分析后，这里会展示参考视频的内容分段。</div>
          </section>
          <section class="vg-card cps-card">
            <h3 class="cps-card__title">脚本内容 <small>{{ project.analysis ? '逐镜脚本' : '等待识别' }}</small></h3>
            <ol v-if="project.analysis" class="cps-script">
              <li v-for="shot in project.analysis.shots" :key="shot.id"><b>{{ shot.index + 1 }}</b><span class="vg-chip">{{ CLONE_SHOT_ROLE_LABELS[shot.role] || shot.role }}</span><p>{{ shot.scriptText || '（无台词）' }}</p></li>
            </ol>
            <p v-else class="vg-muted">分析完成后，这里会显示节选脚本预览。</p>
          </section>
        </div>
      </div>

      <!-- 02 选择商品 -->
      <div v-else-if="viewStep === 2" class="cps-sources">
        <button type="button" class="vg-card cps-source" @click="pickingProduct = true">
          <span class="cps-source__img"><CloudImage v-if="project.productImageFileId" :file-id="project.productImageFileId" /><Boxes v-else :size="26" /></span>
          <span class="cps-source__text"><small>商品（必选）</small><strong>{{ project.productName || '选择商品' }}</strong><span class="vg-muted">分镜图和视频里的商品都会换成它</span></span>
        </button>
        <button type="button" class="vg-card cps-source" @click="pickingModel = true">
          <span class="cps-source__img"><CloudImage v-if="project.modelImageFileId" :file-id="project.modelImageFileId" /><UserRound v-else :size="26" /></span>
          <span class="cps-source__text"><small>模特（可选）</small><strong>{{ models.find((m) => m.id === project?.modelId)?.name || '不指定' }}</strong><span class="vg-muted">指定后各镜头保持同一个人物</span></span>
        </button>
      </div>

      <!-- 03 分镜图 / 04 分镜视频 -->
      <section v-else-if="viewStep === 3 || viewStep === 4" class="cps-shots">
        <div class="cps-shots__bar">
          <span class="vg-muted">{{ viewStep === 3 ? `分镜图 ${framesDone}/${shots.length}` : `分镜视频 ${videosDone}/${shots.length}` }}</span>
          <span v-if="!project.productImageFileId" class="vg-pill vg-pill--amber">先在「选择商品」里选商品，才能生成分镜图</span>
        </div>
        <div v-if="shots.length" class="cp-grid">
          <article v-for="shot in shots" :key="shot.id" class="cp-shot" :class="{ 'is-skip': project.shots[shot.id]?.skip }">
            <div class="cp-shot__media">
              <div class="cp-shot__ref"><CloudImage :file-id="shot.frameFileId" /><small>原片</small></div>
              <div class="cp-shot__out">
                <CloudVideo v-if="viewStep === 4 && project.shots[shot.id]?.videoFileId" :file-id="project.shots[shot.id]?.videoFileId" autoplay />
                <CloudImage v-else-if="project.shots[shot.id]?.frameFileId" :file-id="project.shots[shot.id]?.frameFileId" />
                <span v-else class="cp-shot__empty">
                  <LoaderCircle v-if="running(project.shots[shot.id]?.frameStatus)" :size="16" class="vg-spin" />
                  <AlertTriangle v-else-if="project.shots[shot.id]?.frameStatus === 'failed'" :size="16" />
                  <ImageIcon v-else :size="16" />
                </span>
                <span v-if="running(project.shots[shot.id]?.videoStatus)" class="cp-shot__badge"><LoaderCircle :size="11" class="vg-spin" /> 视频生成中</span>
                <span v-else-if="project.shots[shot.id]?.videoFileId" class="cp-shot__badge is-ok"><Film :size="11" /> 视频</span>
              </div>
            </div>
            <div class="cp-shot__info">
              <div class="cp-shot__head"><strong>镜头 {{ shot.index + 1 }}</strong><span class="vg-chip">{{ CLONE_SHOT_ROLE_LABELS[shot.role] || shot.role }}</span><span class="vg-muted">{{ shot.durationSec.toFixed(1) }}s</span></div>
              <p v-if="shot.scriptText" class="cp-shot__script">{{ shot.scriptText }}</p>
              <p v-if="project.shots[shot.id]?.frameError || project.shots[shot.id]?.videoError" class="cp-shot__error">{{ project.shots[shot.id]?.videoError || project.shots[shot.id]?.frameError }}</p>
              <div class="cp-shot__actions">
                <button v-if="viewStep === 3" type="button" class="vg-btn vg-btn--xs" :disabled="!project.productImageFileId" @click="act('one', (p) => generateFrames(id, p, [shot.id]), '已重新生成这一镜')"><ImageIcon :size="12" /> 重做分镜图</button>
                <button v-else type="button" class="vg-btn vg-btn--xs" :disabled="!project.shots[shot.id]?.frameFileId" @click="act('one', (p) => generateShotVideos(id, p, [shot.id]), '已提交这一镜的视频')"><Clapperboard :size="12" /> {{ project.shots[shot.id]?.videoFileId ? '重做视频' : '生成视频' }}</button>
                <button type="button" class="vg-btn vg-btn--xs vg-btn--ghost" @click="act('one', (p) => toggleSkip(id, p, shot.id))">{{ project.shots[shot.id]?.skip ? '放回成片' : '不要这镜' }}</button>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="vg-empty"><span class="vg-empty__icon"><Film :size="20" /></span><h3>拆解完成后分镜会出现在这里</h3></div>
      </section>

      <!-- 05 成片合成 -->
      <div v-else class="cps-final">
        <section class="vg-card cps-card cps-final__video">
          <h3 class="cps-card__title">成片 <small>{{ project.finalFileId ? '已生成' : '未生成' }}</small></h3>
          <div class="cps-ref__video">
            <CloudVideo v-if="project.finalFileId" :file-id="project.finalFileId" controls />
            <div v-else-if="running(project.composeStatus)" class="cps-wait"><LoaderCircle :size="18" class="vg-spin" /> 正在按原片节奏拼接…</div>
            <div v-else-if="project.composeStatus === 'failed'" class="cps-wait is-error"><AlertTriangle :size="16" /> {{ project.composeError || '合成失败' }}</div>
            <div v-else class="cps-wait">点右上角「合成成片」按原片节奏拼接</div>
          </div>
        </section>
        <section class="vg-card cps-card">
          <h3 class="cps-card__title">合成清单</h3>
          <dl class="cps-kv">
            <dt>分镜</dt><dd>{{ shots.length }} 个（不要的 {{ shots.filter((s) => project?.shots[s.id]?.skip).length }} 个）</dd>
            <dt>分镜图</dt><dd>{{ framesDone }}/{{ shots.length }}</dd>
            <dt>分镜视频</dt><dd>{{ videosDone }}/{{ shots.length }}</dd>
            <dt>商品</dt><dd>{{ project.productName || '未选' }}</dd>
          </dl>
          <p class="vg-muted cps-tiny">没生成视频的镜头用分镜图做静帧；成片不带声音，可在「批量字幕」里加字幕、在发布中心发布。</p>
        </section>
      </div>

      <ProductPicker v-if="pickingProduct" @close="pickingProduct = false" @pick="pickProduct" />
      <div v-if="pickingModel" class="vg-backdrop" @click.self="pickingModel = false">
        <section class="vg-dialog vg-dialog--wide">
          <header class="vg-dialog__head"><span class="vg-dialog__title"><UserRound :size="16" /> 选择模特</span><button type="button" class="vg-icon-btn" aria-label="关闭" @click="pickingModel = false"><X :size="16" /></button></header>
          <div class="vg-dialog__body cp-models">
            <button type="button" class="cp-model" :class="{ 'is-active': !project?.modelId }" @click="pickModel(null)"><span class="cp-model__img"><UserRound :size="22" /></span>不指定</button>
            <button v-for="model in models" :key="model.id" type="button" class="cp-model" :class="{ 'is-active': project?.modelId === model.id }" @click="pickModel(model.id)">
              <span class="cp-model__img"><CloudImage :file-id="coverOf(model)" /></span>{{ model.name }}
            </button>
          </div>
          <footer v-if="!models.length" class="vg-dialog__foot"><button type="button" class="vg-btn vg-btn--primary" @click="router.push('/library/models/new')">先去模特库添加模特</button></footer>
        </section>
      </div>
    </main>
    <main v-else-if="loaded" class="vg-page"><div class="vg-empty"><h3>项目不存在</h3></div></main>
  </template>
  <template v-else>
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
</template>

<style scoped>
/* 网页版分步页面（同电脑端 CloneView 布局） */
.cps { display: flex; flex-direction: column; gap: 14px; width: min(1408px, 100%); margin: 0 auto; }
.cps-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.cps-back { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 0; border-radius: 8px; background: none; color: var(--theme-text); font-weight: 700; cursor: pointer; }
.cps-step { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 6px; border: 0; border-radius: 999px; background: none; color: var(--theme-text-secondary); font-weight: 700; font-size: 13px; cursor: pointer; white-space: nowrap; }
.cps-step.is-active { background: var(--vg-accent-soft); color: var(--theme-text); box-shadow: inset 0 0 0 1px var(--vg-accent-line); }
.cps-step__num { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--theme-border); font-size: 11.5px; }
.cps-step.is-active .cps-step__num, .cps-step.is-done .cps-step__num { background: var(--vg-accent); border-color: var(--vg-accent); color: #fff; }
.cps-line { flex: 1; min-width: 16px; height: 1px; background: var(--theme-border); }
.cps-line.is-done { background: var(--vg-accent); }
.cps-tip { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); font-size: 12.5px; }
.cps-tip > span:first-child { display: flex; align-items: center; gap: 8px; color: var(--theme-text-secondary); }
.cps-tip strong { color: var(--theme-text); }
.cps-head { display: flex; align-items: center; gap: 14px; padding: 6px 4px; }
.cps-head__num { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; border: 1px solid var(--vg-accent-line); background: var(--vg-accent-soft); color: var(--vg-accent); font-weight: 800; }
.cps-head__text { flex: 1; min-width: 0; }
.cps-head__text h1 { font-size: 20px; font-weight: 800; }
.cps-head__text p { font-size: 13px; color: var(--theme-text-muted); }
.cps-head__actions { display: flex; gap: 8px; }
.cps-card { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.cps-card__title { font-size: 14px; font-weight: 800; }
.cps-card__title small { margin-left: 6px; font-size: 12px; font-weight: 500; color: var(--theme-text-muted); }
.cps-analyze { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 14px; align-items: start; }
.cps-analyze__main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.cps-ref__video { aspect-ratio: 9 / 16; max-height: 520px; overflow: hidden; border-radius: 10px; background: #000; }
.cps-ref__video :deep(video) { object-fit: contain; }
.cps-kv { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; margin: 0; font-size: 12.5px; }
.cps-kv dt { color: var(--theme-text-muted); }
.cps-kv dd { margin: 0; text-align: right; font-weight: 700; }
.cps-wait { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 110px; padding: 16px; border: 1px dashed var(--theme-border); border-radius: 10px; color: var(--theme-text-muted); font-size: 13px; text-align: center; }
.cps-wait.is-error { color: var(--vg-red); }
.cps-summary { font-size: 13px; line-height: 1.7; }
.cps-structure { display: flex; gap: 4px; height: 120px; }
.cps-seg { position: relative; min-width: 0; overflow: hidden; border-radius: 8px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.cps-seg :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.cps-seg span { position: absolute; left: 4px; bottom: 4px; padding: 1px 6px; border-radius: 6px; background: rgb(0 0 0 / .6); color: #fff; font-size: 10.5px; white-space: nowrap; }
.cps-seg.is-skip { opacity: .4; }
.cps-script { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.cps-script li { display: grid; grid-template-columns: 24px auto 1fr; align-items: start; gap: 8px; font-size: 13px; }
.cps-script b { color: var(--theme-text-muted); }
.cps-script p { margin: 0; line-height: 1.6; }
.cps-tiny { font-size: 12px; }
.cps-sources { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.cps-source { display: flex; align-items: center; gap: 16px; padding: 18px; color: var(--theme-text); text-align: left; cursor: pointer; }
.cps-source__img { display: grid; place-items: center; width: 96px; height: 96px; flex-shrink: 0; overflow: hidden; border-radius: 12px; background: var(--theme-panel-soft); color: var(--theme-text-muted); }
.cps-source__img :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.cps-source__text { display: flex; flex-direction: column; gap: 4px; }
.cps-source__text small { font-size: 12px; color: var(--theme-text-muted); }
.cps-source__text strong { font-size: 16px; }
.cps-source__text span { font-size: 12px; }
.cps-shots { display: flex; flex-direction: column; gap: 10px; }
.cps-shots__bar { display: flex; align-items: center; gap: 10px; font-size: 12.5px; }
.cps-final { display: grid; grid-template-columns: 360px minmax(0, 1fr); gap: 14px; align-items: start; }
@media (max-width: 1100px) { .cps-analyze, .cps-final, .cps-sources { grid-template-columns: minmax(0, 1fr); } }

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
@media (min-width: 1024px) {
  /* Computer: shots side by side with larger previews; steps and actions keep a sensible width. */
  .steps { max-width: 640px; margin: 4px auto 0; }
  .sources, .actions { max-width: 640px; }
  .shot-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(440px, 1fr)); gap: 12px; }
  .shot__ref { width: 96px; height: 170px; }
  .shot__out { width: 108px; height: 192px; }
  .shot__script { -webkit-line-clamp: 6; }
  .final { max-height: 560px; }
}
</style>
