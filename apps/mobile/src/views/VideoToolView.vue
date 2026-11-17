<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, ChevronRight, ImagePlus, LoaderCircle, Music, Play } from 'lucide-vue-next'
import { VIDEO_TOOL_LABELS, type VideoToolKind } from '@shared/cloud/videoTools'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import VideoPicker from '@/components/VideoPicker.vue'
import { uploadImage } from '@/lib/files'
import { relativeTime } from '@/lib/library'
import { cloud, errorMessage } from '@/lib/session'
import { runDownloads, runMix, runPerVideo, runSlice, startToolPolling, useToolRuns } from '@/lib/videoTools'
import { toast } from '@/lib/toast'

/** 第三阶段视频工具共用一个页面，按工具显示不同的选项 */
const route = useRoute()
const router = useRouter()
const ROUTE_TO_KIND: Record<string, VideoToolKind> = { watermark: 'watermark', subtitle: 'subtitle', slice: 'slice', mix: 'mix', download: 'parse-link' }
const kind = ROUTE_TO_KIND[String(route.params.tool)] ?? 'watermark'
const title = VIDEO_TOOL_LABELS[kind]
const runs = useToolRuns(kind)
const busy = ref(false)

const videos = ref<string[]>([])
// 水印
const wmMode = ref<'text' | 'logo'>('text')
const wmText = ref('')
const wmLogo = ref('')
const wmPosition = ref<'tl' | 'tr' | 'bl' | 'br' | 'center'>('br')
const uploadingLogo = ref(false)
// 字幕
const subLanguage = ref('')
const subPosition = ref<'bottom' | 'middle'>('bottom')
// 切片
const segmentSec = ref(30)
// 混剪
const mixCount = ref(3)
const mixDuration = ref(15)
const bgm = ref('')
const uploadingBgm = ref(false)
// 链接下载
const links = ref('')

const intro: Record<VideoToolKind, string> = {
  watermark: '给视频加文字或 Logo 水印，可以一次选多条。',
  subtitle: 'AI 听写视频里的说话内容，自动压上字幕，可以一次选多条。',
  slice: '把直播录像或长视频按固定时长切成多段短视频。',
  mix: '从素材池里随机挑镜头拼成多条不重复的新视频，可加背景音乐。',
  'parse-link': '粘贴 TikTok / 抖音分享链接，下载无水印原视频到「我的视频」。',
}
const positions = [['tl', '左上'], ['tr', '右上'], ['bl', '左下'], ['br', '右下'], ['center', '居中']] as const

onMounted(startToolPolling)

const canRun = computed(() => {
  if (kind === 'parse-link') return links.value.match(/https?:\/\//) !== null
  if (kind === 'mix') return videos.value.length >= 2
  if (kind === 'watermark') return videos.value.length > 0 && (wmMode.value === 'text' ? wmText.value.trim().length > 0 : Boolean(wmLogo.value))
  return videos.value.length > 0
})

async function pickLogo(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  uploadingLogo.value = true
  try {
    wmLogo.value = (await uploadImage(file)).fileId
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    uploadingLogo.value = false
  }
}

async function pickBgm(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  uploadingBgm.value = true
  try {
    bgm.value = (await cloud.sync.uploadFile(file, file.type && file.type.startsWith('audio/') ? file.type : 'audio/mpeg')).fileId
    toast('背景音乐已上传')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    uploadingBgm.value = false
  }
}

async function start() {
  busy.value = true
  try {
    if (kind === 'watermark') {
      const options = wmMode.value === 'text' ? { text: wmText.value.trim(), position: wmPosition.value } : { logoFileId: wmLogo.value, position: wmPosition.value }
      await runPerVideo('watermark', videos.value, options, wmMode.value === 'text' ? `文字水印：${wmText.value.trim()}` : 'Logo 水印')
    } else if (kind === 'subtitle') {
      await runPerVideo('subtitle', videos.value, { language: subLanguage.value || undefined, position: subPosition.value }, '自动字幕')
    } else if (kind === 'slice') {
      await runSlice(videos.value[0]!, segmentSec.value)
    } else if (kind === 'mix') {
      await runMix(videos.value, { count: mixCount.value, durationSec: mixDuration.value, pieceSec: 3, bgmFileId: bgm.value || undefined })
    } else {
      const urls = links.value.split(/\n+/).map((line) => line.trim()).filter((line) => /https?:\/\//.test(line)).slice(0, 10)
      await runDownloads(urls)
      links.value = ''
    }
    videos.value = []
    toast('已提交，处理好会出现在下方和「审核收件箱」')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <PageHeader :title="title" back="/create" />
  <main class="m-page m-page--no-tabs">
    <p class="intro">{{ intro[kind] }}</p>

    <section v-if="kind === 'parse-link'" class="m-section">
      <label class="m-field">
        <span class="m-field__label">分享链接（一行一个，最多 10 个）</span>
        <textarea v-model="links" class="m-textarea" placeholder="在 TikTok / 抖音点「分享 → 复制链接」，粘贴到这里" />
      </label>
    </section>

    <section v-else class="m-section">
      <div class="m-section__head">
        <h2 class="m-section__title">{{ kind === 'mix' ? '素材池（至少 2 段）' : kind === 'slice' ? '选一条长视频' : '选视频' }}</h2>
        <span class="m-muted small">{{ videos.length }} 个</span>
      </div>
      <VideoPicker v-model="videos" :multiple="kind !== 'slice'" :max="kind === 'mix' ? 20 : 10" />
    </section>

    <!-- 工具选项 -->
    <section v-if="kind === 'watermark'" class="m-section">
      <div class="seg">
        <button type="button" :class="{ 'is-active': wmMode === 'text' }" @click="wmMode = 'text'">文字水印</button>
        <button type="button" :class="{ 'is-active': wmMode === 'logo' }" @click="wmMode = 'logo'">Logo 水印</button>
      </div>
      <input v-if="wmMode === 'text'" v-model="wmText" class="m-input" maxlength="40" placeholder="例如：店铺名 / @账号" />
      <label v-else class="logo m-card">
        <span class="logo__img"><CloudImage v-if="wmLogo" :file-id="wmLogo" /><LoaderCircle v-else-if="uploadingLogo" :size="20" class="m-spin" /><ImagePlus v-else :size="20" /></span>
        <span>{{ wmLogo ? '换一张 Logo' : '上传 Logo 图片（建议透明背景 PNG）' }}</span>
        <input type="file" accept="image/*" hidden @change="pickLogo" />
      </label>
      <div class="chips">
        <span class="m-muted small label">位置</span>
        <button v-for="[value, text] in positions" :key="value" type="button" class="m-chip" :class="{ 'is-active': wmPosition === value }" @click="wmPosition = value">{{ text }}</button>
      </div>
    </section>

    <section v-else-if="kind === 'subtitle'" class="m-section">
      <div class="chips">
        <span class="m-muted small label">说话语言</span>
        <button v-for="[value, text] in [['', '自动'], ['zh', '中文'], ['en', '英语'], ['vi', '越南语']] as const" :key="value" type="button" class="m-chip" :class="{ 'is-active': subLanguage === value }" @click="subLanguage = value">{{ text }}</button>
      </div>
      <div class="chips">
        <span class="m-muted small label">字幕位置</span>
        <button type="button" class="m-chip" :class="{ 'is-active': subPosition === 'bottom' }" @click="subPosition = 'bottom'">底部</button>
        <button type="button" class="m-chip" :class="{ 'is-active': subPosition === 'middle' }" @click="subPosition = 'middle'">中间</button>
      </div>
    </section>

    <section v-else-if="kind === 'slice'" class="m-section">
      <div class="chips">
        <span class="m-muted small label">每段时长</span>
        <button v-for="value in [15, 30, 60, 90]" :key="value" type="button" class="m-chip" :class="{ 'is-active': segmentSec === value }" @click="segmentSec = value">{{ value }} 秒</button>
      </div>
      <p class="m-muted small note">一次最多切 30 段；视频最大 200MB。</p>
    </section>

    <section v-else-if="kind === 'mix'" class="m-section">
      <div class="chips">
        <span class="m-muted small label">出几条</span>
        <button v-for="value in [1, 3, 5, 10]" :key="value" type="button" class="m-chip" :class="{ 'is-active': mixCount === value }" @click="mixCount = value">{{ value }}</button>
      </div>
      <div class="chips">
        <span class="m-muted small label">每条时长</span>
        <button v-for="value in [10, 15, 30]" :key="value" type="button" class="m-chip" :class="{ 'is-active': mixDuration === value }" @click="mixDuration = value">{{ value }} 秒</button>
      </div>
      <label class="logo m-card">
        <span class="logo__img"><LoaderCircle v-if="uploadingBgm" :size="20" class="m-spin" /><Music v-else :size="20" /></span>
        <span>{{ bgm ? '已选背景音乐，点这里更换' : '背景音乐（可选，选一个音频文件）' }}</span>
        <input type="file" accept="audio/*" hidden @change="pickBgm" />
      </label>
      <p class="m-muted small note">每条都是不同的镜头组合，自动去重；统一裁成 9:16 竖屏。</p>
    </section>

    <section class="m-section">
      <button type="button" class="m-btn m-btn--primary m-btn--block" :disabled="!canRun || busy" @click="start">
        <LoaderCircle v-if="busy" :size="18" class="m-spin" /><Play v-else :size="18" /> 开始{{ title }}
      </button>
      <p class="m-muted small note">在云端处理，关掉 App 也会继续。</p>
    </section>

    <section v-if="runs.length" class="m-section">
      <div class="m-section__head"><h2 class="m-section__title">处理记录</h2><button type="button" class="m-section__link" @click="router.push('/review')">去审核</button></div>
      <div class="runs">
        <div v-for="run in runs.slice(0, 20)" :key="run.id" class="run m-card">
          <div class="run__head">
            <strong>{{ run.label }}</strong>
            <span class="m-muted small">{{ relativeTime(run.createdAt) }}</span>
          </div>
          <div v-if="run.status === 'queued' || run.status === 'running'" class="run__state"><LoaderCircle :size="16" class="m-spin" /> {{ run.status === 'queued' ? '排队中' : '处理中…' }}</div>
          <div v-else-if="run.status === 'failed'" class="run__state run__state--error"><AlertTriangle :size="16" /> {{ run.error || '处理失败' }}</div>
          <div v-else class="run__outputs">
            <div v-for="output in run.outputs" :key="output.fileId" class="run__video">
              <CloudVideo :file-id="output.fileId" controls />
              <small v-if="output.durationSec">{{ output.durationSec }}s</small>
            </div>
          </div>
          <p v-if="run.transcript" class="run__transcript">{{ run.transcript }}</p>
        </div>
      </div>
      <button type="button" class="m-btn m-btn--block more" @click="router.push('/review')">在审核收件箱里查看全部 <ChevronRight :size="16" /></button>
    </section>
  </main>
</template>

<style scoped>
.intro { margin: 4px 2px 0; color: var(--theme-text-muted); font-size: 13px; line-height: 1.6; }
.small { font-size: 12px; }
.note { margin: 10px 2px 0; line-height: 1.6; }
.label { flex: none; margin-right: 4px; }
.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 12px; padding: 4px; border-radius: 14px; background: var(--theme-panel); border: 1px solid var(--theme-border); }
.seg button { height: 36px; border: 0; border-radius: 10px; background: none; color: var(--theme-text-muted); font-size: 13px; font-weight: 700; }
.seg button.is-active { background: var(--theme-control-hover); color: var(--theme-text); }
.chips { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.logo { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 10px 12px; color: var(--theme-text-secondary); font-size: 13px; }
.logo__img { flex: none; display: grid; place-items: center; width: 44px; height: 44px; overflow: hidden; border-radius: 10px; background: var(--theme-control); color: var(--theme-text-muted); }
.runs { display: flex; flex-direction: column; gap: 10px; }
.run { padding: 12px; }
.run__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.run__head strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.run__state { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: var(--theme-text-muted); font-size: 13px; }
.run__state--error { color: var(--theme-danger-text); }
.run__outputs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; }
.run__video { position: relative; aspect-ratio: 9 / 16; overflow: hidden; border-radius: 8px; background: #000; }
.run__video small { position: absolute; right: 4px; top: 4px; padding: 0 5px; border-radius: 4px; background: rgba(0, 0, 0, .6); color: #fff; font-size: 10px; }
.run__transcript { margin: 10px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--theme-control); color: var(--theme-text-secondary); font-size: 12px; line-height: 1.6; white-space: pre-wrap; max-height: 120px; overflow-y: auto; }
.more { margin-top: 10px; }
</style>
