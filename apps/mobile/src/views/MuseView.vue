<script setup lang="ts">
/** Muse创意室（手机）：上传参考图下单、确认换图、看进度和成片；由电脑用 Muse 账号和代理执行。 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertTriangle, Check, ImagePlus, LoaderCircle, Pause, Play, RefreshCw, Send, Square, X } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import WebStep from '@/components/web/WebStep.vue'
import { cloudFileRef } from '@shared/cloud/relay'
import { uploadImage } from '@/lib/files'
import { relativeTime } from '@/lib/library'
import { muse, MUSE_STATUS, museFileId, publishMuseFile, type MuseAccountSummary, type MuseJob, type MuseQueue } from '@/lib/muse'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

const MAX_IMAGES = 10
const accounts = ref<MuseAccountSummary[]>([])
const queue = ref<MuseQueue | null>(null)
const offline = ref('')
const loading = ref(false)
const busy = ref(false)
const images = ref<string[]>([])
const uploading = ref(0)
const prompt = ref('')
const durationSec = ref(10)
const products = ref<Array<{ id: string; name: string }>>([])
const productId = ref('')
const playing = ref('')
const input = ref<HTMLInputElement>()

const ready = computed(() => accounts.value.filter((item) => item.enabled && item.state === 'ready').length)
const jobs = computed(() => queue.value?.jobs.slice(0, 20) ?? [])
const waiting = computed(() => queue.value?.jobs.filter((job) => (job.status === 'queued' && !job.collect) || (job.status === 'swapping' && !job.image?.submitting && !job.image?.waiting)).length ?? 0)
const active = computed(() => Boolean(queue.value?.jobs.some((job) => ['queued', 'running', 'swapping'].includes(job.status))))
const coverPath = (job: MuseJob) => (job.status === 'image_review' ? job.preparedImagePath : '') || job.subtitleCoverPath || job.posterPath || job.preparedImagePath || job.imagePath
const videoPath = (job: MuseJob) => job.subtitleVideoPath || job.result?.videoPath
const coverWidth = (job: MuseJob) => (job.status === 'image_review' ? 720 : 320)

const closingPath = (job: MuseJob) => (job.status === 'image_review' ? job.preparedLastFramePath : undefined)

watch(jobs, (list) => {
  for (const job of list) {
    void publishMuseFile(coverPath(job), coverWidth(job)).catch(() => undefined)
    void publishMuseFile(closingPath(job), 720).catch(() => undefined)
  }
})

async function refreshQueue() {
  queue.value = await muse.queue()
  offline.value = ''
}

async function refresh() {
  loading.value = true
  try {
    const [list] = await Promise.all([muse.accounts(), refreshQueue()])
    accounts.value = list
    if (!prompt.value) {
      const versions = await muse.prompts()
      prompt.value = (versions.find((item) => item.active) || versions[0])?.prompt ?? ''
    }
    if (!products.value.length) products.value = (await muse.products()).map(({ id, name }) => ({ id, name }))
  } catch (error) {
    offline.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

async function act(work: () => Promise<unknown>, done?: string) {
  if (busy.value) return
  busy.value = true
  try {
    await work()
    if (done) toast(done)
    await refreshQueue()
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = false
  }
}

async function onFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || []).slice(0, MAX_IMAGES - images.value.length)
  ;(event.target as HTMLInputElement).value = ''
  for (const file of files) {
    uploading.value += 1
    try {
      images.value = [...images.value, (await uploadImage(file)).fileId]
    } catch (error) {
      toast(`上传失败：${errorMessage(error)}`)
    } finally {
      uploading.value -= 1
    }
  }
}

const pausedNote = () => (queue.value?.paused ? '队列已暂停，加入后要点「继续」才开始。' : '')

function create() {
  const total = images.value.length
  const cost = productId.value ? `会先换图 ${total} 次（产生图片模型费用），你确认后才发给 Muse。` : `会发送 ${total} 次并消耗 Muse 额度。`
  if (!window.confirm(`加入 ${total} 条任务？${cost}${pausedNote()}`)) return
  void act(async () => {
    try {
      await muse.create({
        imagePaths: images.value.map((id) => cloudFileRef(id, 'reference.jpg')),
        prompt: prompt.value,
        durationSec: durationSec.value,
        aspect: '9:16',
        productId: productId.value || undefined,
        swapProduct: Boolean(productId.value),
        reviewImage: true,
      })
      images.value = []
    } catch (error) {
      // The computer may have taken the order although the answer was lost: ordering again would pay twice.
      await refreshQueue().catch(() => undefined)
      throw new Error(`${errorMessage(error)}。请先看下面的任务列表，确认没有加入再重试`)
    }
  }, '已加入，由电脑执行')
}

function approve(job: MuseJob) {
  if (window.confirm(`通过后会发给 Muse 生成 1 条视频，消耗 Muse 额度。${queue.value?.paused ? '队列已暂停，要点「继续」才开始。' : ''}`)) void act(() => muse.approve([job.id]), '已通过')
}
function redo(job: MuseJob) {
  if (window.confirm('重新换图会产生图片模型费用，确定？')) void act(() => muse.redo(job.id))
}
function retry(job: MuseJob) {
  if (window.confirm(job.image && !job.preparedImagePath ? '会重新换图，产生图片模型费用。确定？' : '会重新发送 1 次，消耗 Muse 额度。确定？')) void act(() => muse.retry(job.id))
}
function resume() {
  if (window.confirm(`会处理等待中的 ${waiting.value} 条，消耗 Muse 额度；需要换图的会先产生图片费用。`)) void act(() => muse.setPaused(false))
}
async function play(job: MuseJob) {
  playing.value = job.id
  await publishMuseFile(videoPath(job)).catch((error) => {
    playing.value = ''
    toast(errorMessage(error))
  })
}

let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void refresh()
  timer = setInterval(() => {
    if (active.value && !busy.value && document.visibilityState === 'visible') void refreshQueue().catch(() => undefined)
  }, 8000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <PageHeader title="Muse创意室" back="/creative" description="用参考图出短视频。由你的电脑执行（需开着 Klipmill 并已登录同一账号）。">
    <template #actions>
      <button type="button" class="vg-btn" :disabled="loading" @click="refresh"><RefreshCw :size="14" :class="{ 'vg-spin': loading }" /> 刷新</button>
      <template v-if="queue">
        <button v-if="queue.paused" type="button" class="vg-btn" data-testid="muse-resume" :disabled="busy" @click="resume"><Play :size="14" /> 继续 {{ waiting }}</button>
        <button v-else type="button" class="vg-btn" :disabled="busy" @click="act(() => muse.setPaused(true))"><Pause :size="14" /> 暂停</button>
      </template>
    </template>
  </PageHeader>
  <main class="vg-scope vg-page wt-page mu" data-testid="muse-mobile">
    <div v-if="offline" class="vg-notice vg-notice--warning wt-note"><AlertTriangle :size="14" /> {{ offline }}</div>
    <div class="wt-grid">
      <WebStep :index="1" title="参考图" subtitle="每张出一条视频" :meta="`${images.length}/${MAX_IMAGES}`">
        <div class="pr-scenes">
          <div v-for="(fileId, index) in images" :key="fileId" class="pr-scene">
            <CloudImage :file-id="fileId" />
            <button type="button" class="pr-scene__remove" aria-label="移除" @click="images.splice(index, 1)"><X :size="13" /></button>
          </div>
          <button v-if="images.length < MAX_IMAGES" type="button" class="pr-scene pr-scene--add" :disabled="uploading > 0" @click="input?.click()">
            <LoaderCircle v-if="uploading" :size="20" class="vg-spin" /><ImagePlus v-else :size="20" />
            <span>{{ uploading ? '上传中' : '上传' }}</span>
          </button>
        </div>
        <input ref="input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-testid="muse-files" @change="onFiles" />
      </WebStep>

      <WebStep :index="2" title="设置" :meta="queue ? `可用账号 ${ready}` : undefined">
        <label class="vg-field"><span class="vg-field__label">换成商品（可选）</span>
          <select v-model="productId" class="vg-input vg-select"><option value="">不换图</option><option v-for="item in products" :key="item.id" :value="item.id">{{ item.name }}</option></select>
        </label>
        <div class="wt-field">
          <span class="vg-field__label">时长</span>
          <div class="vg-seg vg-seg--sm"><button v-for="n in [5, 6, 8, 10]" :key="n" type="button" class="vg-seg__btn" :class="{ 'is-active': durationSec === n }" @click="durationSec = n">{{ n }} 秒</button></div>
        </div>
        <details>
          <summary class="vg-field__label">视频提示词</summary>
          <textarea v-model="prompt" class="vg-textarea" rows="6" maxlength="4000" aria-label="视频提示词" />
        </details>
        <template #foot>
          <span class="vg-muted wt-foot-hint">{{ !images.length ? '先上传参考图' : `将加入 ${images.length} 条` }}</span>
          <button type="button" class="vg-btn vg-btn--primary" data-testid="muse-submit" :disabled="busy || !images.length || !prompt.trim() || !queue" @click="create">
            <LoaderCircle v-if="busy" :size="14" class="vg-spin" /><Send v-else :size="14" /> 交给电脑出片
          </button>
        </template>
      </WebStep>

      <WebStep :index="3" title="任务与成片" :meta="queue ? `${queue.jobs.length} 条` : undefined">
        <div v-if="jobs.length" class="mu-jobs">
          <article v-for="job in jobs" :key="job.id" class="mu-job" data-testid="muse-job">
            <div class="mu-job__head">
              <strong>{{ job.productName || job.prompt }}</strong>
              <span class="vg-pill vg-pill--dot" :class="MUSE_STATUS[job.status].tone">{{ MUSE_STATUS[job.status].label }}</span>
            </div>
            <small class="vg-muted">{{ relativeTime(job.createdAt) }} · {{ job.durationSec }} 秒</small>
            <div class="mu-job__media" :class="{ 'is-large': job.status === 'image_review' || playing === job.id }">
              <CloudVideo v-if="playing === job.id && museFileId(videoPath(job))" :file-id="museFileId(videoPath(job))" controls autoplay />
              <CloudImage v-else :file-id="museFileId(coverPath(job), coverWidth(job))" />
            </div>
            <template v-if="closingPath(job)"><small class="vg-muted">尾帧</small><div class="mu-job__media is-large"><CloudImage :file-id="museFileId(closingPath(job), 720)" /></div></template>
            <p v-if="job.error" class="mu-job__error"><AlertTriangle :size="12" /> {{ job.error }}</p>
            <div class="mu-job__actions">
              <template v-if="job.status === 'image_review'">
                <button v-if="job.preparedImagePath" type="button" class="vg-btn vg-btn--sm vg-btn--primary" :disabled="busy" @click="approve(job)"><Check :size="13" /> 通过</button>
                <button type="button" class="vg-btn vg-btn--sm" :disabled="busy" @click="redo(job)">重新换图</button>
              </template>
              <button v-if="job.result && playing !== job.id" type="button" class="vg-btn vg-btn--sm" @click="play(job)"><Play :size="13" /> 播放</button>
              <span v-if="playing === job.id && !museFileId(videoPath(job))" class="vg-muted"><LoaderCircle :size="13" class="vg-spin" /> 电脑正在传视频</span>
              <button v-if="job.status === 'needs_review' && job.threadPath" type="button" class="vg-btn vg-btn--sm" :disabled="busy" @click="act(() => muse.collect(job.id), '正在找回')">找回</button>
              <button v-if="job.status === 'failed' || job.status === 'cancelled'" type="button" class="vg-btn vg-btn--sm" :disabled="busy" @click="retry(job)">重试</button>
              <button v-if="['running', 'queued', 'swapping'].includes(job.status)" type="button" class="vg-btn vg-btn--sm" :disabled="busy" @click="act(() => muse.cancel(job.id))"><Square :size="12" /> 停止</button>
            </div>
          </article>
        </div>
        <div v-else class="vg-empty pw-empty"><p>{{ loading ? '正在连接电脑…' : '还没有任务。' }}</p></div>
      </WebStep>
    </div>
  </main>
</template>

<style scoped>
.mu-jobs { display: flex; flex-direction: column; gap: 10px; }
.mu-job { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); }
.mu-job__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mu-job__head strong { overflow: hidden; font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap; }
.mu-job small { font-size: 11px; }
.mu-job__media { width: 96px; aspect-ratio: 9 / 16; overflow: hidden; border-radius: 8px; }
.mu-job__media.is-large { width: min(100%, 300px); }
.mu-job__error { display: flex; align-items: center; gap: 4px; margin: 0; font-size: 11.5px; color: var(--vg-red); }
.mu-job__actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
