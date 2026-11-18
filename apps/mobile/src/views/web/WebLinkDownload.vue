<script setup lang="ts">
/**
 * 视频解析下载（网页版，按电脑端 VideoParserDownloadView）：输入链接 / 已下载视频 两个分区。
 * 云端解析下载（自动去重），下好的视频带封面、作者，被「图生图」拆过的标记已使用。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Check, ChevronLeft, Download, Link2, Play, RefreshCcw, Trash2, Video, X } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import { fileBlob } from '@/lib/files'
import { downloadBlob, fileNameFor } from '@/lib/platform'
import { errorMessage } from '@/lib/session'
import { requestSync } from '@/lib/sync'
import { toast } from '@/lib/toast'
import { queuePositions, refreshToolRuns, removeRuns, retryRun, runDownloads, startToolPolling, useToolRuns, type VideoToolRunItem } from '@/lib/videoTools'

const router = useRouter()
const items = useToolRuns('parse-link')
const activeTab = ref<'input' | 'library'>('input')
const shareInput = ref('')
const submitting = ref(false)
const loading = ref(false)
const preview = ref<VideoToolRunItem | null>(null)
onMounted(startToolPolling)

const lines = computed(() => [...new Set(shareInput.value.split(/\n+/).map((line) => line.match(/https?:\/\/[^\s]+/)?.[0] ?? '').filter(Boolean))])

async function submitLinks() {
  if (!lines.value.length) return
  submitting.value = true
  try {
    const submitted = await runDownloads(lines.value.slice(0, 50))
    const skipped = Math.min(50, lines.value.length) - submitted
    toast(submitted ? `已提交 ${submitted} 条${skipped ? `，${skipped} 条已下载过、已复用` : ''}` : '这些链接都已经下载过了')
    shareInput.value = ''
    activeTab.value = 'library'
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    submitting.value = false
  }
}
async function loadAll() {
  loading.value = true
  try {
    await requestSync()
    await refreshToolRuns()
  } finally {
    loading.value = false
  }
}

const STATUS: Record<string, [string, string]> = { queued: ['排队中', 'is-processing'], running: ['下载中', 'is-processing'], succeeded: ['已完成', 'is-done'], failed: ['失败', 'is-failed'] }
const titleOf = (item: VideoToolRunItem) => item.title?.trim() || item.url || item.label
const subtitleOf = (item: VideoToolRunItem) => item.author || item.url?.replace(/^https?:\/\//, '').slice(0, 32) || 'TikTok'
const posterOf = (item: VideoToolRunItem) => item.outputs[0]?.posterFileId
const videoOf = (item: VideoToolRunItem) => item.outputs[0]?.fileId
const formatTime = (at: number) => new Date(at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

async function save(item: VideoToolRunItem) {
  const fileId = videoOf(item)
  if (!fileId) return
  try {
    downloadBlob(await fileBlob(fileId), fileNameFor(titleOf(item).slice(0, 40) || 'tiktok', 'video/mp4'))
  } catch (error) {
    toast(errorMessage(error))
  }
}
async function retry(item: VideoToolRunItem) {
  await retryRun(item).catch((error) => toast(errorMessage(error)))
}
async function remove(item: VideoToolRunItem) {
  if (!window.confirm('删除这条下载记录？已存进作品库、素材库的视频不受影响。')) return
  await removeRuns([item])
}
</script>

<template>
  <div class="vpd-page" data-testid="web-link-download">
    <section class="vpd-workspace-head">
      <div class="vpd-workspace-intro">
        <div class="vpd-workspace-icon"><Download :size="20" /></div>
        <div class="vpd-workspace-copy">
          <h1>视频解析下载</h1>
          <p>批量导入 TikTok 分享链接，自动沉淀为视频素材，并直接供商品图素材拆分使用。</p>
        </div>
        <div class="vpd-workspace-actions">
          <button class="vpd-ghost-button" type="button" @click="router.push('/toolbox')"><ChevronLeft :size="16" /> 返回</button>
          <button class="vpd-ghost-button" type="button" :disabled="loading" @click="loadAll"><RefreshCcw :size="16" :class="{ 'vg-spin': loading }" /> 刷新</button>
        </div>
      </div>
      <section class="vpd-tabs">
        <button class="vpd-tab-button" :class="{ active: activeTab === 'input' }" type="button" @click="activeTab = 'input'"><Link2 :size="15" /><span>输入链接</span></button>
        <button class="vpd-tab-button" :class="{ active: activeTab === 'library' }" type="button" data-testid="vpd-library-tab" @click="activeTab = 'library'"><Video :size="15" /><span>已下载视频</span><span class="vpd-tab-badge">{{ items.length }}</span></button>
      </section>
    </section>

    <section v-if="activeTab === 'input'" class="vpd-input-grid">
      <section class="vpd-panel">
        <div class="vpd-section-head"><div class="vpd-section-head__badge">1</div><div><h2>批量导入分享链接</h2><p>每行一条 TikTok 分享链接，系统会逐条解析、下载并自动去重。</p></div></div>
        <label class="vpd-field"><span>输入链接</span><textarea v-model="shareInput" class="vpd-textarea" rows="12" placeholder="每行粘贴一个 TikTok 分享链接" data-testid="vpd-input"></textarea></label>
        <div class="vpd-input-footer">
          <span>有效链接 {{ lines.length }}</span>
          <button class="vpd-primary-button" type="button" data-testid="vpd-submit" :disabled="!lines.length || submitting" @click="submitLinks"><RefreshCcw v-if="submitting" :size="16" class="vg-spin" /><Download v-else :size="16" /> 开始批量下载</button>
        </div>
      </section>
      <section class="vpd-panel vpd-panel--side">
        <div class="vpd-tip-card"><strong>自动去重</strong><p>重复导入同一作品时，会直接复用已下载的视频记录，不会重复下载。</p></div>
        <div class="vpd-tip-card"><strong>素材复用</strong><p>下载成功后的视频会进入「已下载视频」和作品库，并可在「商品图素材」里直接选用拆图。</p></div>
        <div class="vpd-tip-card"><strong>云端下载</strong><p>在云端解析下载，关掉网页也会继续。</p></div>
      </section>
    </section>

    <section v-else class="vpd-library">
      <div class="vpd-library__intro"><strong>视频素材库</strong><span>浏览、预览和管理已下载视频，已被拆分使用的视频会自动标记。</span></div>
      <div v-if="!items.length" class="vpd-empty-copy">暂时还没有下载好的视频素材</div>
      <div v-else class="vpd-album-grid">
        <article v-for="item in items" :key="item.id" class="vpd-album-card" data-testid="vpd-card">
          <button class="vpd-album-card__media" type="button" :disabled="!videoOf(item)" @click="preview = item">
            <CloudImage v-if="posterOf(item)" :file-id="posterOf(item)" class="vpd-album-thumb" />
            <div v-else class="vpd-album-card__placeholder"><Video :size="22" /><span>{{ item.status === 'succeeded' ? '暂无封面' : item.status === 'failed' ? '下载失败' : '生成预览中' }}</span></div>
            <div class="vpd-album-card__overlay">
              <span class="vpd-status-pill" :class="STATUS[item.status]?.[1]">{{ STATUS[item.status]?.[0] }}<template v-if="item.status === 'queued' && queuePositions[item.jobId]"> · 第 {{ queuePositions[item.jobId] }} 位</template></span>
              <div class="vpd-album-card__actions-top">
                <span v-if="item.used" class="vpd-ghost-chip vpd-ghost-chip--mini"><Check :size="12" /> 已使用</span>
                <span v-if="videoOf(item)" class="vpd-icon-action" title="预览" @click.stop="preview = item"><Play :size="13" /></span>
                <span v-if="item.status === 'failed'" class="vpd-icon-action" title="重试" @click.stop="retry(item)"><RefreshCcw :size="13" /></span>
                <span class="vpd-icon-action vpd-icon-action--danger" title="删除" @click.stop="remove(item)"><Trash2 :size="13" /></span>
              </div>
            </div>
          </button>
          <div class="vpd-album-card__body">
            <strong class="vpd-album-card__title" :title="titleOf(item)">{{ titleOf(item) }}</strong>
            <div class="vpd-album-card__meta"><span>{{ subtitleOf(item) }}</span><span>{{ item.used ? '已使用' : '未使用' }}</span></div>
            <div class="vpd-album-card__time">{{ formatTime(item.createdAt) }}</div>
            <div v-if="item.error" class="vpd-album-card__error">{{ item.error }}</div>
            <div class="vpd-album-card__footer">
              <button class="vpd-ghost-chip" type="button" :disabled="!videoOf(item)" @click="preview = item"><Play :size="12" /> 预览</button>
              <button class="vpd-ghost-chip" type="button" :disabled="!videoOf(item)" @click="save(item)"><Download :size="12" /> 下载</button>
            </div>
          </div>
        </article>
      </div>
    </section>

    <div v-if="preview" class="vg-backdrop" @click.self="preview = null">
      <section class="vg-dialog vg-dialog--wide">
        <header class="vg-dialog__head"><span class="vg-dialog__title">{{ titleOf(preview) }}</span><button type="button" class="vg-icon-btn" aria-label="关闭" @click="preview = null"><X :size="16" /></button></header>
        <div class="vg-dialog__body vpd-preview"><CloudVideo :file-id="videoOf(preview)" controls autoplay /></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.vpd-page { display: flex; flex-direction: column; gap: 14px; padding: 12px 16px 40px; color: var(--theme-text); }
.vpd-workspace-head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.vpd-workspace-intro, .vpd-tabs { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.vpd-workspace-icon { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px; background: var(--vg-accent-soft); color: var(--vg-accent); }
.vpd-workspace-copy { flex: 1; min-width: 0; }
.vpd-workspace-copy h1 { margin: 0; font-size: 19px; font-weight: 800; }
.vpd-workspace-copy p { margin: 3px 0 0; overflow: hidden; color: var(--theme-text-muted); font-size: 12.5px; text-overflow: ellipsis; white-space: nowrap; }
.vpd-workspace-actions { display: flex; gap: 6px; }
.vpd-ghost-button, .vpd-primary-button { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); font-size: 13px; font-weight: 700; cursor: pointer; }
.vpd-primary-button { border-color: var(--vg-accent); background: var(--vg-accent); color: #fff; }
.vpd-primary-button:disabled, .vpd-ghost-button:disabled { opacity: .5; cursor: not-allowed; }
.vpd-tabs { gap: 10px; }
.vpd-tab-button { display: flex; flex: 1; align-items: center; gap: 8px; height: 44px; padding: 0 14px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel-soft); color: var(--theme-text); font-weight: 700; cursor: pointer; }
.vpd-tab-button.active { border-color: var(--vg-accent); background: var(--vg-accent-soft); color: var(--vg-accent); }
.vpd-tab-badge { margin-left: 6px; font-size: 12px; }
.vpd-input-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.vpd-panel { display: flex; flex-direction: column; gap: 14px; padding: 18px; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.vpd-section-head { display: flex; gap: 12px; }
.vpd-section-head__badge { display: grid; place-items: center; width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%; background: var(--vg-accent-soft); color: var(--vg-accent); font-weight: 800; }
.vpd-section-head h2 { margin: 0; font-size: 16px; }
.vpd-section-head p { margin: 4px 0 0; color: var(--theme-text-muted); font-size: 12.5px; }
.vpd-field { display: flex; flex-direction: column; gap: 6px; color: var(--theme-text-muted); font-size: 12.5px; font-weight: 700; }
.vpd-textarea { width: 100%; padding: 12px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); color: var(--theme-text); font: 13px/1.6 inherit; resize: vertical; outline: none; }
.vpd-input-footer { display: flex; align-items: center; justify-content: space-between; color: var(--theme-text-muted); font-size: 13px; }
.vpd-tip-card { padding: 12px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); }
.vpd-tip-card p { margin: 6px 0 0; color: var(--theme-text-muted); font-size: 12.5px; line-height: 1.6; }
.vpd-library { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.vpd-library__intro { display: flex; flex-direction: column; gap: 4px; }
.vpd-library__intro span, .vpd-empty-copy { color: var(--theme-text-muted); font-size: 12.5px; }
.vpd-album-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.vpd-album-card { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); }
.vpd-album-card__media { position: relative; display: block; aspect-ratio: 9 / 12; padding: 0; overflow: hidden; border: 0; background: #000; cursor: pointer; }
.vpd-album-thumb, .vpd-album-thumb :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.vpd-album-card__placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; height: 100%; color: var(--theme-text-muted); font-size: 12px; }
.vpd-album-card__overlay { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: space-between; padding: 8px; background: linear-gradient(rgba(0, 0, 0, .5), transparent 40%); }
.vpd-status-pill { padding: 2px 8px; border-radius: 999px; background: rgba(0, 0, 0, .55); color: #fff; font-size: 11.5px; font-weight: 700; }
.vpd-status-pill.is-done { background: rgba(16, 185, 129, .85); }
.vpd-status-pill.is-failed { background: rgba(239, 68, 68, .85); }
.vpd-album-card__actions-top { display: flex; gap: 4px; }
.vpd-icon-action { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 7px; background: rgba(0, 0, 0, .55); color: #fff; }
.vpd-icon-action--danger:hover { background: #ef4444; }
.vpd-ghost-chip { display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 10px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-panel); color: var(--theme-text); font-size: 12px; cursor: pointer; }
.vpd-ghost-chip--mini { height: 24px; padding: 0 6px; border: 0; background: rgba(0, 0, 0, .55); color: #fff; }
.vpd-ghost-chip:disabled { opacity: .5; cursor: not-allowed; }
.vpd-album-card__body { display: flex; flex-direction: column; gap: 6px; padding: 10px; }
.vpd-album-card__title { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.vpd-album-card__meta { display: flex; justify-content: space-between; gap: 8px; color: var(--theme-text-muted); font-size: 12px; }
.vpd-album-card__meta span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vpd-album-card__time { color: var(--theme-text-muted); font-size: 11.5px; }
.vpd-album-card__error { color: #f87171; font-size: 12px; overflow-wrap: anywhere; }
.vpd-album-card__footer { display: flex; gap: 6px; }
.vpd-preview { display: grid; place-items: center; }
.vpd-preview :deep(video) { max-width: 100%; max-height: 70vh; }
@media (max-width: 1100px) { .vpd-workspace-head, .vpd-input-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
