<script setup lang="ts">
/**
 * 视频批量水印（网页版，按电脑端 VideoBatchWatermarkView）：选视频 → 水印样式（文字 / 图片、颜色、位置、大小、不透明度、边距）→ 输出。
 * 文字水印和电脑端一样先画成透明 PNG（预览和成片是同一张图），云端按大小 / 边距叠加。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, FolderOpen, Images, Loader2, Play, Stamp, X } from 'lucide-vue-next'
import type { VideoJobOptions } from '@shared/cloud/videoTools'
import AssetPickerDialog from '@/components/web/AssetPickerDialog.vue'
import ToolBatchHistory from '@/components/web/ToolBatchHistory.vue'
import { uploadVideo, type AssetItem } from '@/lib/assets'
import { uploadRaw } from '@/lib/files'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import { runVideoBatch, startToolPolling } from '@/lib/videoTools'

type Position = 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right'
const POSITIONS: Array<[Position, string]> = [['top-left', '左上'], ['top-right', '右上'], ['center', '居中'], ['bottom-left', '左下'], ['bottom-right', '右下']]
const POSITION_KEY: Record<Position, NonNullable<VideoJobOptions['position']>> = { 'top-left': 'tl', 'top-right': 'tr', center: 'center', 'bottom-left': 'bl', 'bottom-right': 'br' }
const ARCHIVE_FOLDER = 'AI 成片 / 加水印'

const router = useRouter()
const videos = ref<Array<{ fileId: string; name: string }>>([])
const settings = ref({ kind: 'text' as 'text' | 'image', text: '', color: '#FFFFFF', position: 'bottom-right' as Position, opacity: 0.8, scale: 0.22, margin: 0.04 })
const imageFile = ref<File | null>(null)
const imageUrl = ref('')
const archive = ref(true)
const busy = ref(false)
const uploading = ref(0)
const picking = ref(false)
const videoInput = ref<HTMLInputElement>()
const imageInput = ref<HTMLInputElement>()
onMounted(startToolPolling)

/* ---------------------------------------------------------------- 水印图（文字画成透明 PNG，和电脑端同样的字体和阴影） */
const markUrl = ref('')
let markBlob: Blob | null = null
async function renderTextMark(text: string, color: string): Promise<Blob> {
  const fontSize = 120
  const font = `700 ${fontSize}px 'Microsoft YaHei','PingFang SC','Noto Sans CJK SC','Source Han Sans SC',Arial,sans-serif`
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const width = Math.ceil(probe.measureText(text).width + fontSize * 0.4)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(16, width)
  canvas.height = Math.ceil(fontSize * 1.5)
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fillText(text, fontSize * 0.2 + 3, fontSize * 1.12 + 3)
  ctx.fillStyle = color
  ctx.fillText(text, fontSize * 0.2, fontSize * 1.12)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('水印生成失败'))), 'image/png'))
}
let renderTimer = 0
watch(
  () => [settings.value.kind, settings.value.text, settings.value.color, imageUrl.value],
  () => {
    window.clearTimeout(renderTimer)
    renderTimer = window.setTimeout(async () => {
      const s = settings.value
      if (markUrl.value && markUrl.value !== imageUrl.value) URL.revokeObjectURL(markUrl.value)
      markBlob = null
      markUrl.value = ''
      if (s.kind === 'image') {
        markBlob = imageFile.value
        markUrl.value = imageUrl.value
        return
      }
      if (!s.text.trim()) return
      markBlob = await renderTextMark(s.text.trim(), s.color)
      markUrl.value = URL.createObjectURL(markBlob)
    }, 200)
  },
)
const previewStyle = computed(() => {
  const s = settings.value
  const margin = `${s.margin * 100}%`
  const style: Record<string, string> = { width: `${s.scale * 100}%`, opacity: String(s.opacity) }
  if (s.position.includes('top')) style.top = margin
  if (s.position.includes('bottom')) style.bottom = margin
  if (s.position.includes('left')) style.left = margin
  if (s.position.includes('right')) style.right = margin
  if (s.position === 'center') Object.assign(style, { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' })
  return style
})

/* ---------------------------------------------------------------- 选视频 / 图片 */
async function onVideos(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  ;(event.target as HTMLInputElement).value = ''
  for (const file of files) {
    uploading.value += 1
    try {
      const video = await uploadVideo(file)
      videos.value = [...videos.value, { fileId: video.fileId, name: video.name }]
    } catch (error) {
      toast(errorMessage(error))
    } finally {
      uploading.value -= 1
    }
  }
}
function toggleAsset(item: AssetItem) {
  videos.value = videos.value.some((v) => v.fileId === item.fileId) ? videos.value.filter((v) => v.fileId !== item.fileId) : [...videos.value, { fileId: item.fileId, name: item.name }]
}
function onImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageFile.value = file
  imageUrl.value = URL.createObjectURL(file)
}

const canStart = computed(() => videos.value.length > 0 && uploading.value === 0 && (settings.value.kind === 'text' ? settings.value.text.trim().length > 0 : Boolean(imageFile.value)))
async function start() {
  if (!canStart.value || busy.value || !markBlob) return
  busy.value = true
  try {
    const mark = await uploadRaw(markBlob, markBlob.type || 'image/png')
    const s = settings.value
    const options: VideoJobOptions = { logoFileId: mark.fileId, position: POSITION_KEY[s.position], opacity: s.opacity, scale: s.scale, margin: s.margin }
    const label = s.kind === 'text' ? `文字水印：${s.text.trim()}` : '图片水印'
    await runVideoBatch('watermark', videos.value.map((v) => ({ ...v, options })), label, archive.value ? { archiveFolder: ARCHIVE_FOLDER } : {})
    toast(`已开始处理 ${videos.value.length} 个视频`)
    videos.value = []
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="vg-scope vg-page wm" data-testid="web-video-watermark">
    <header class="vg-page-head">
      <button class="vg-icon-btn" type="button" title="返回工具箱" @click="router.push('/toolbox')"><ChevronLeft :size="18" /></button>
      <span class="vg-page-head__icon"><Stamp :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>视频批量水印</h1>
        <p>给多条视频统一加文字或图片水印</p>
      </div>
    </header>

    <div class="vg-split wm__layout">
      <div class="vg-stack">
        <section class="vg-card">
          <div class="vg-card__head">
            <span class="vg-card__title">1. 选择视频 <small>已选 {{ videos.length }} 个</small></span>
            <div class="vg-card__actions">
              <button type="button" class="vg-btn vg-btn--sm" @click="picking = true"><Images :size="14" /> 从素材库选</button>
              <button type="button" class="vg-btn vg-btn--sm" :disabled="uploading > 0" @click="videoInput?.click()"><Loader2 v-if="uploading" :size="14" class="vg-spin" /><FolderOpen v-else :size="14" /> 从电脑选</button>
              <input ref="videoInput" type="file" accept="video/*" multiple hidden data-testid="wm-video-input" @change="onVideos" />
            </div>
          </div>
          <div v-if="videos.length" class="vg-list wm__videos">
            <div v-for="video in videos" :key="video.fileId" class="vg-list__item">
              <span class="vg-list__main"><span class="vg-list__title vg-ellipsis">{{ video.name }}</span></span>
              <button type="button" class="vg-icon-btn vg-icon-btn--sm" aria-label="移除" @click="videos = videos.filter((v) => v.fileId !== video.fileId)"><X :size="14" /></button>
            </div>
          </div>
          <p v-else class="vg-muted wm__empty">{{ uploading ? `正在上传 ${uploading} 个视频…` : '从素材库或电脑添加要加水印的视频' }}</p>
        </section>

        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title">2. 水印样式</span></div>
          <div class="vg-seg wm__kind">
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': settings.kind === 'text' }" @click="settings.kind = 'text'">文字水印</button>
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': settings.kind === 'image' }" @click="settings.kind = 'image'">图片水印</button>
          </div>
          <div class="vg-form-grid">
            <template v-if="settings.kind === 'text'">
              <label class="vg-field"><span class="vg-field__label">水印文字<span class="vg-req">*</span></span><input v-model="settings.text" class="vg-input" maxlength="60" data-testid="watermark-text" placeholder="例如：品牌名 / 店铺名" /></label>
              <label class="vg-field"><span class="vg-field__label">文字颜色</span><input v-model="settings.color" class="vg-input wm__color" type="color" /></label>
            </template>
            <div v-else class="vg-field">
              <span class="vg-field__label">水印图片<span class="vg-req">*</span></span>
              <div class="vg-row">
                <button type="button" class="vg-btn vg-btn--sm" @click="imageInput?.click()"><FolderOpen :size="14" /> 选择图片</button>
                <span class="vg-muted vg-ellipsis">{{ imageFile ? imageFile.name : '建议使用透明背景的 PNG' }}</span>
              </div>
              <input ref="imageInput" type="file" accept="image/png,image/webp,image/jpeg" hidden @change="onImage" />
            </div>
            <div class="vg-field">
              <span class="vg-field__label">位置</span>
              <div class="wm__positions">
                <button v-for="[key, label] in POSITIONS" :key="key" type="button" class="vg-chip wm__position" :class="{ 'is-on': settings.position === key }" @click="settings.position = key">{{ label }}</button>
              </div>
            </div>
            <label class="vg-field"><span class="vg-field__label">大小（占画面宽度） · {{ Math.round(settings.scale * 100) }}%</span><input v-model.number="settings.scale" type="range" min="0.05" max="0.6" step="0.01" /></label>
            <label class="vg-field"><span class="vg-field__label">不透明度 · {{ Math.round(settings.opacity * 100) }}%</span><input v-model.number="settings.opacity" type="range" min="0.1" max="1" step="0.05" /></label>
            <label class="vg-field"><span class="vg-field__label">边距 · {{ Math.round(settings.margin * 100) }}%</span><input v-model.number="settings.margin" type="range" min="0" max="0.15" step="0.01" /></label>
          </div>
        </section>

        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title">3. 输出</span></div>
          <p class="vg-muted wm__note">在云端处理，关掉网页也会继续；完成后在右侧「处理记录」下载，成片也会进作品库和审核收件箱。</p>
          <button type="button" class="vg-switch wm__switch" :class="{ 'is-on': archive }" @click="archive = !archive"><span class="vg-switch__track"></span>完成后存入素材库「{{ ARCHIVE_FOLDER }}」</button>
          <button type="button" class="vg-btn vg-btn--primary vg-btn--block" data-testid="watermark-start" :disabled="!canStart || busy" @click="start"><Loader2 v-if="busy" :size="15" class="vg-spin" /><Play v-else :size="15" /> 开始处理 {{ videos.length }} 个视频</button>
        </section>
      </div>

      <aside class="vg-stack">
        <section class="vg-card">
          <div class="vg-card__head"><span class="vg-card__title">效果预览</span></div>
          <div class="wm__frame">
            <img v-if="markUrl" class="wm__mark" :src="markUrl" :style="previewStyle" alt="" data-testid="wm-preview-mark" />
            <span v-else class="wm__frame-empty">填写水印文字或选择图片后显示预览</span>
          </div>
        </section>
        <ToolBatchHistory kind="watermark" />
      </aside>
    </div>
    <AssetPickerDialog v-if="picking" kind="video" :picked="videos.map((v) => v.fileId)" @toggle="toggleAsset" @close="picking = false" />
  </main>
</template>

<style scoped>
.wm { width: min(1400px, 100%); margin: 0 auto; }
.wm input[type='range'] { width: 100%; accent-color: var(--vg-accent); }
.wm__layout { grid-template-columns: minmax(0, 1fr) 380px; }
.wm__videos { max-height: 240px; overflow: auto; }
.wm__empty, .wm__note { padding: 8px 0; font-size: 12.5px; }
.wm__kind { margin-bottom: 12px; }
.wm__color { width: 64px; height: 34px; padding: 2px; }
.wm__positions { display: flex; flex-wrap: wrap; gap: 6px; }
.wm__position { height: 28px; padding: 0 10px; font-size: 12px; cursor: pointer; }
.wm__position.is-on { border-color: var(--vg-accent-line); background: var(--vg-accent-soft); color: var(--vg-accent); }
.wm__switch { margin: 6px 0 12px; padding: 0; border: 0; background: transparent; }
.wm__frame { position: relative; aspect-ratio: 9 / 16; max-height: 460px; margin: 0 auto; overflow: hidden; border-radius: var(--vg-radius-sm); background: linear-gradient(160deg, #2b3a55, #10151f 70%); }
.wm__mark { position: absolute; height: auto; }
.wm__frame-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 20px; color: rgba(255, 255, 255, .6); font-size: 12.5px; text-align: center; }
@media (max-width: 1100px) { .wm__layout { grid-template-columns: minmax(0, 1fr); } }
</style>
