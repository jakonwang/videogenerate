<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Check,
  ChevronLeft,
  Download,
  FolderOpen,
  KeyRound,
  Link2,
  Play,
  RefreshCcw,
  Settings2,
  Trash2,
  Video,
} from 'lucide-vue-next'
import VideoPreviewModal from '../components/VideoPreviewModal.vue'

type ParserVideoItem = {
  id: string
  shareUrl: string
  videoId: string
  title?: string
  author?: string
  coverUrl?: string
  localVideoPath?: string
  thumbnailPath?: string
  status: 'processing' | 'completed' | 'failed'
  error?: string
  usedStatus: 'unused' | 'used'
  updatedAt: number
}

const DESKTOP_USER_ID = 'desktop-local'

const copy = {
  kicker: '视频解析下载',
  title: '打造可复用的视频素材库',
  subtitle: '批量导入 TikTok 分享链接，自动沉淀为本地视频资产，并直接供商品图片素材库拆分使用。',
  completed: '已完成',
  used: '已使用',
  failed: '失败',
  inputTab: '输入链接',
  libraryTab: '已下载视频',
  back: '返回',
  refresh: '刷新',
  linksTitle: '批量导入分享链接',
  linksHint: '每行一条 TikTok 分享链接，系统会逐条解析、下载并自动去重。',
  linksPlaceholder: '每行粘贴一个 TikTok 分享链接',
  lineCount: '有效链接',
  submit: '开始批量下载',
  guideA: '自动去重',
  guideADesc: '重复导入同一作品时，系统会直接复用已存在的视频记录，不会重复创建。',
  guideB: '素材复用',
  guideBDesc: '下载成功后的视频会进入下方素材库，并可被商品图片素材库直接选用。',
  libraryTitle: '视频素材库',
  libraryHint: '像素材库一样浏览、预览和管理已下载视频，已被拆分使用的视频会自动标记。',
  noLibrary: '暂时还没有下载好的视频素材',
  noThumb: '暂无封面',
  preparing: '生成预览中',
  preview: '预览',
  showFile: '打开文件',
  retry: '重试',
  remove: '删除',
  settingsTitle: '缺少 TikHub 密钥',
  settingsHint: '请先在设置中填写 TikHub API Key，之后才能解析和下载 TikTok 视频。',
  openSettings: '打开设置',
  deleteConfirm: '确定删除这条下载记录吗？',
  deleteDone: '已删除该视频记录',
  importedOk: '已导入视频',
  importedFail: '失败',
  usedStatus: '已使用',
  unusedStatus: '未使用',
  statusCompleted: '下载完成',
  statusFailed: '下载失败',
  statusProcessing: '下载中',
  untitled: '未命名视频',
} as const

const router = useRouter()
const activeTab = ref<'input' | 'library'>('input')
const shareInput = ref('')
const items = ref<ParserVideoItem[]>([])
const loading = ref(false)
const submitting = ref(false)
const notice = ref('')
const errorText = ref('')
const hasTikHubKey = ref(false)
const previewOpen = ref(false)
const previewSrc = ref<string | null>(null)
const previewFallbackSrc = ref<string | null>(null)
const previewPoster = ref<string | null>(null)
const previewTitle = ref('')
const brokenPosterIds = ref<string[]>([])
let refreshTimer: ReturnType<typeof setInterval> | null = null

const lines = computed(() => Array.from(new Set(shareInput.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))))

function mediaUrl(filePath?: string) {
  const text = String(filePath || '').trim()
  return text ? `vg://file?path=${encodeURIComponent(text)}` : ''
}

function fileVideoUrl(filePath?: string) {
  const text = String(filePath || '').trim()
  if (!text) return ''
  const normalized = text.replace(/\\/g, '/')
  const pathname = /^[a-z]:/i.test(normalized) ? `/${normalized}` : normalized
  return encodeURI(`file://${pathname}`)
}

function formatTime(value: number) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function formatTitle(item: ParserVideoItem) {
  return item.title?.trim() || item.videoId || copy.untitled
}

function formatSubtitle(item: ParserVideoItem) {
  return item.author?.trim() || item.shareUrl
}

function hasVideo(item: ParserVideoItem) {
  return Boolean(String(item.localVideoPath || '').trim())
}

function posterUrl(item: ParserVideoItem) {
  const localThumb = mediaUrl(item.thumbnailPath)
  if (localThumb) return localThumb
  const remoteCover = String(item.coverUrl || '').trim()
  return remoteCover || ''
}

function canRenderPoster(item: ParserVideoItem) {
  return Boolean(posterUrl(item)) && !brokenPosterIds.value.includes(item.id)
}

function markPosterBroken(id: string) {
  if (!id || brokenPosterIds.value.includes(id)) return
  brokenPosterIds.value = [...brokenPosterIds.value, id]
}

function statusLabel(item: ParserVideoItem) {
  if (item.status === 'completed') return item.usedStatus === 'used' ? copy.usedStatus : copy.statusCompleted
  if (item.status === 'failed') return copy.statusFailed
  return copy.statusProcessing
}

function statusTone(item: ParserVideoItem) {
  if (item.status === 'completed' && item.usedStatus === 'used') return 'is-warning'
  if (item.status === 'completed') return 'is-success'
  if (item.status === 'failed') return 'is-danger'
  return 'is-info'
}

function openPreview(item: ParserVideoItem) {
  if (!hasVideo(item)) return
  previewSrc.value = fileVideoUrl(item.localVideoPath)
  previewFallbackSrc.value = mediaUrl(item.localVideoPath)
  previewPoster.value = posterUrl(item) || null
  previewTitle.value = formatTitle(item)
  previewOpen.value = true
}

function closePreview() {
  previewOpen.value = false
  previewSrc.value = null
  previewFallbackSrc.value = null
  previewPoster.value = null
  previewTitle.value = ''
}

async function loadAll() {
  loading.value = true
  try {
    const [nextItems, credentials] = await Promise.all([
      window.api.videoParserDownload.listItems({ userId: DESKTOP_USER_ID }) as Promise<ParserVideoItem[]>,
      window.api.clone.getModelCredentials() as Promise<{ tikhubApiKey?: string }>,
    ])
    items.value = nextItems
    brokenPosterIds.value = brokenPosterIds.value.filter((id) => nextItems.some((item) => item.id === id))
    hasTikHubKey.value = Boolean(String(credentials?.tikhubApiKey || '').trim())
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    loading.value = false
  }
}

async function submitLinks() {
  if (!lines.value.length || !hasTikHubKey.value) return
  submitting.value = true
  notice.value = ''
  errorText.value = ''
  try {
    const result = await window.api.videoParserDownload.importShareUrls({
      userId: DESKTOP_USER_ID,
      shareUrls: lines.value,
    })
    shareInput.value = ''
    notice.value = result.errors?.length
      ? `${copy.importedOk} ${result.items.length}，${copy.importedFail} ${result.errors.length}`
      : `${copy.importedOk} ${result.items.length}`
    activeTab.value = 'library'
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  } finally {
    submitting.value = false
  }
}

async function retryItem(id: string) {
  errorText.value = ''
  notice.value = ''
  try {
    await window.api.videoParserDownload.retryItem({ userId: DESKTOP_USER_ID, id })
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

async function deleteItem(id: string) {
  if (!window.confirm(copy.deleteConfirm)) return
  errorText.value = ''
  notice.value = ''
  try {
    await window.api.videoParserDownload.deleteItem({ userId: DESKTOP_USER_ID, id })
    notice.value = copy.deleteDone
    await loadAll()
  } catch (error: any) {
    errorText.value = error?.message ?? String(error)
  }
}

function openSettings() {
  void router.push('/settings')
}

async function showInFolder(filePath?: string) {
  const value = String(filePath || '').trim()
  if (!value) return
  await window.api.shell.showItemInFolder(value)
}

onMounted(async () => {
  await loadAll()
  refreshTimer = setInterval(() => {
    void loadAll()
  }, 4000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="vpd-page plugin-workspace-standard">
    <section class="vpd-workspace-head">
      <div class="vpd-workspace-intro">
        <div class="vpd-workspace-icon">
          <Download class="icon" />
        </div>
        <div class="vpd-workspace-copy">
          <h1>{{ copy.kicker }}</h1>
          <p>{{ copy.subtitle }}</p>
        </div>
        <div class="vpd-workspace-actions">
          <button class="vpd-ghost-button" type="button" @click="router.push('/plugins?tab=installed&plugin=video-parser-download')">
            <ChevronLeft class="icon" />
            {{ copy.back }}
          </button>
          <button class="vpd-ghost-button" type="button" :disabled="loading" @click="loadAll">
            <RefreshCcw class="icon" :class="{ spin: loading }" />
            {{ copy.refresh }}
          </button>
        </div>
      </div>

      <section class="vpd-tabs vpd-workspace-tabs">
        <button class="vpd-tab-button" :class="{ active: activeTab === 'input' }" type="button" @click="activeTab = 'input'">
          <Link2 class="icon icon--small" />
          <span>{{ copy.inputTab }}</span>
        </button>
        <button class="vpd-tab-button" :class="{ active: activeTab === 'library' }" type="button" @click="activeTab = 'library'">
          <Video class="icon icon--small" />
          <span>{{ copy.libraryTab }}</span>
          <span class="vpd-tab-badge">{{ items.length }}</span>
        </button>
      </section>
    </section>

    <div v-if="notice" class="vpd-notice vpd-notice--success">{{ notice }}</div>
    <div v-if="errorText" class="vpd-notice vpd-notice--danger">{{ errorText }}</div>

    <section v-if="!hasTikHubKey" class="vpd-empty vpd-content-scroll">
      <div class="vpd-empty__icon">
        <KeyRound class="icon" />
      </div>
      <div class="vpd-empty__content">
        <h2>{{ copy.settingsTitle }}</h2>
        <p>{{ copy.settingsHint }}</p>
      </div>
      <button class="vpd-primary-button" type="button" @click="openSettings">
        <Settings2 class="icon" />
        {{ copy.openSettings }}
      </button>
    </section>

    <section v-else class="vpd-workspace vpd-content-scroll">
      <section v-if="activeTab === 'input'" class="vpd-input-grid">
        <section class="vpd-panel vpd-panel--main">
          <div class="vpd-section-head">
            <div class="vpd-section-head__badge">1</div>
            <div>
              <h2>{{ copy.linksTitle }}</h2>
              <p>{{ copy.linksHint }}</p>
            </div>
          </div>

          <label class="vpd-field">
            <span>{{ copy.inputTab }}</span>
            <textarea
              v-model="shareInput"
              class="vpd-textarea"
              rows="12"
              :placeholder="copy.linksPlaceholder"
            ></textarea>
          </label>

          <div class="vpd-input-footer">
            <span>{{ copy.lineCount }} {{ lines.length }}</span>
            <button class="vpd-primary-button" type="button" :disabled="!lines.length || submitting" @click="submitLinks">
              <RefreshCcw v-if="submitting" class="icon spin" />
              <Download v-else class="icon" />
              {{ copy.submit }}
            </button>
          </div>
        </section>

        <section class="vpd-panel vpd-panel--side">
          <div class="vpd-tip-card">
            <strong>{{ copy.guideA }}</strong>
            <p>{{ copy.guideADesc }}</p>
          </div>
          <div class="vpd-tip-card">
            <strong>{{ copy.guideB }}</strong>
            <p>{{ copy.guideBDesc }}</p>
          </div>
        </section>
      </section>

      <section v-else class="vpd-library">
        <div class="vpd-library__intro">
          <div>
            <strong>{{ copy.libraryTitle }}</strong>
            <span>{{ copy.libraryHint }}</span>
          </div>
        </div>

        <div v-if="!items.length && !loading" class="vpd-empty-copy">{{ copy.noLibrary }}</div>
        <div v-else class="vpd-album-grid">
          <article v-for="item in items" :key="item.id" class="vpd-album-card">
            <button class="vpd-album-card__media" type="button" :disabled="!hasVideo(item)" @click="openPreview(item)">
              <img
                v-if="canRenderPoster(item)"
                class="vpd-album-thumb"
                :src="posterUrl(item)"
                alt=""
                @error="markPosterBroken(item.id)"
              />
              <div v-else class="vpd-album-card__placeholder">
                <Video class="vpd-album-card__placeholder-icon" />
                <span>{{ item.status === 'processing' ? copy.preparing : copy.noThumb }}</span>
              </div>

              <div class="vpd-album-card__overlay">
                <span class="vpd-status-pill" :class="statusTone(item)">{{ statusLabel(item) }}</span>
                <div class="vpd-album-card__actions-top">
                  <span v-if="item.usedStatus === 'used'" class="vpd-ghost-chip vpd-ghost-chip--mini">
                    <Check class="icon icon--tiny" />
                    {{ copy.usedStatus }}
                  </span>
                  <button
                    v-if="hasVideo(item)"
                    class="vpd-icon-action"
                    type="button"
                    @click.stop="openPreview(item)"
                  >
                    <Play class="icon icon--tiny" />
                  </button>
                  <button
                    v-if="item.status === 'failed'"
                    class="vpd-icon-action"
                    type="button"
                    @click.stop="retryItem(item.id)"
                  >
                    <RefreshCcw class="icon icon--tiny" />
                  </button>
                  <button
                    class="vpd-icon-action vpd-icon-action--danger"
                    type="button"
                    @click.stop="deleteItem(item.id)"
                  >
                    <Trash2 class="icon icon--tiny" />
                  </button>
                </div>
              </div>
            </button>

            <div class="vpd-album-card__body">
              <div class="vpd-album-card__topline">
                <strong>{{ formatTitle(item) }}</strong>
              </div>
              <div class="vpd-album-card__meta">
                <span>{{ formatSubtitle(item) }}</span>
                <span>{{ item.usedStatus === 'used' ? copy.usedStatus : copy.unusedStatus }}</span>
              </div>
              <div class="vpd-album-card__time">{{ formatTime(item.updatedAt) }}</div>
              <div v-if="item.error" class="vpd-album-card__error">{{ item.error }}</div>
              <div class="vpd-album-card__footer">
                <button class="vpd-ghost-chip" type="button" :disabled="!hasVideo(item)" @click="openPreview(item)">
                  <Play class="icon icon--tiny" />
                  {{ copy.preview }}
                </button>
                <button class="vpd-ghost-chip" type="button" :disabled="!item.localVideoPath" @click="showInFolder(item.localVideoPath)">
                  <FolderOpen class="icon icon--tiny" />
                  {{ copy.showFile }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>
    </section>

    <VideoPreviewModal
      :open="previewOpen"
      :src="previewSrc"
      :fallback-src="previewFallbackSrc"
      :poster="previewPoster"
      :title="previewTitle"
      media-type="video"
      @close="closePreview"
    />
  </div>
</template>

<style>
.vpd-page {
  display: grid;
  gap: 16px;
  color: #eef2ff;
}

.vpd-hero,
.vpd-workspace,
.vpd-empty {
  border: 1px solid rgba(82, 102, 176, 0.24);
  border-radius: 24px;
  background:
    radial-gradient(circle at top left, rgba(96, 78, 255, 0.14), transparent 30%),
    linear-gradient(180deg, rgba(18, 26, 48, 0.98), rgba(11, 17, 31, 0.98));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 10px 20px rgba(4, 10, 24, 0.24);
}

.vpd-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  padding: 20px 22px;
}

.vpd-hero__content {
  display: grid;
  gap: 10px;
}

.vpd-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(226, 232, 255, 0.86);
  font-size: 12px;
  font-weight: 600;
}

.vpd-hero__eyebrow-icon {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(109, 93, 255, 0.92), rgba(62, 127, 255, 0.84));
}

.vpd-hero h1,
.vpd-hero p {
  margin: 0;
}

.vpd-hero h1 {
  font-size: 30px;
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.vpd-hero p {
  max-width: 760px;
  font-size: 13px;
  line-height: 1.7;
  color: rgba(226, 232, 255, 0.72);
}

.vpd-hero__stats {
  display: flex;
  gap: 10px;
}

.vpd-stat {
  min-width: 118px;
  display: grid;
  gap: 6px;
  align-content: center;
  padding: 12px 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(22, 31, 55, 0.88), rgba(11, 18, 32, 0.88));
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.vpd-stat strong {
  font-size: 24px;
}

.vpd-stat span {
  font-size: 11px;
  color: rgba(226, 232, 255, 0.7);
}

.vpd-notice {
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 13px;
}

.vpd-notice--success {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.24);
}

.vpd-notice--danger {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.24);
}

.vpd-empty {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px;
}

.vpd-empty__icon {
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(109, 93, 255, 0.9), rgba(52, 120, 255, 0.75));
}

.vpd-empty__content {
  flex: 1;
  display: grid;
  gap: 6px;
}

.vpd-empty__content h2,
.vpd-empty__content p {
  margin: 0;
}

.vpd-empty__content p {
  color: rgba(224, 231, 255, 0.72);
  font-size: 13px;
}

.vpd-workspace {
  display: grid;
  gap: 14px;
  padding: 18px;
}

.vpd-workspace__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.vpd-tabs {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.vpd-tab-button,
.vpd-ghost-button,
.vpd-primary-button,
.vpd-ghost-chip,
.vpd-icon-action {
  border: 0;
  cursor: pointer;
  transition: 0.2s ease;
}

.vpd-tab-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(224, 231, 255, 0.74);
}

.vpd-tab-button.active {
  background: linear-gradient(135deg, rgba(106, 82, 255, 0.32), rgba(62, 127, 255, 0.24));
  color: #ffffff;
}

.vpd-tab-badge {
  min-width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 11px;
}

.vpd-input-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
}

.vpd-panel {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background:
    linear-gradient(180deg, rgba(20, 29, 50, 0.92), rgba(10, 17, 31, 0.92)),
    rgba(12, 18, 33, 0.95);
}

.vpd-panel--side {
  align-content: start;
}

.vpd-section-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.vpd-section-head h2,
.vpd-section-head p {
  margin: 0;
}

.vpd-section-head h2 {
  font-size: 16px;
}

.vpd-section-head p {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.65;
  color: rgba(224, 231, 255, 0.72);
}

.vpd-section-head__badge {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(106, 82, 255, 0.92), rgba(62, 127, 255, 0.9));
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
}

.vpd-field {
  display: grid;
  gap: 8px;
}

.vpd-field span {
  font-size: 13px;
  color: rgba(226, 232, 255, 0.84);
}

.vpd-textarea {
  width: 100%;
  min-height: 280px;
  resize: vertical;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(8, 13, 24, 0.86);
  color: #eef2ff;
  padding: 14px;
  font: inherit;
}

.vpd-input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: rgba(224, 231, 255, 0.68);
}

.vpd-tip-card {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(255, 255, 255, 0.03);
}

.vpd-tip-card strong {
  font-size: 13px;
}

.vpd-tip-card p {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: rgba(224, 231, 255, 0.72);
}

.vpd-library {
  display: grid;
  gap: 12px;
}

.vpd-library__intro strong,
.vpd-library__intro span {
  display: block;
}

.vpd-library__intro strong {
  font-size: 14px;
}

.vpd-library__intro span {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(224, 231, 255, 0.68);
}

.vpd-album-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.vpd-album-card {
  min-width: 0;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(82, 102, 176, 0.24);
  background:
    linear-gradient(180deg, rgba(24, 34, 61, 0.98), rgba(17, 24, 44, 0.98)),
    rgba(12, 18, 33, 0.95);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 10px 20px rgba(4, 10, 24, 0.24);
}

.vpd-album-card__media {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  overflow: hidden;
  aspect-ratio: 0.84 / 1;
  border-bottom: 1px solid rgba(88, 108, 186, 0.16);
  background: linear-gradient(180deg, rgba(16, 22, 39, 0.98), rgba(9, 14, 26, 0.98));
}

.vpd-album-card__media:disabled {
  cursor: default;
}

.vpd-album-thumb,
.vpd-album-card__placeholder {
  width: 100%;
  height: 100%;
}

.vpd-album-thumb {
  object-fit: cover;
  display: block;
  transition: transform 0.25s ease;
}

.vpd-album-card:hover .vpd-album-thumb {
  transform: scale(1.04);
}

.vpd-album-card__placeholder {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(227, 233, 255, 0.52);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.vpd-album-card__placeholder-icon {
  width: 24px;
  height: 24px;
}

.vpd-album-card__overlay {
  position: absolute;
  inset: 0;
  padding: 8px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  background: linear-gradient(180deg, rgba(7, 11, 20, 0.54), rgba(7, 11, 20, 0.02) 42%, rgba(7, 11, 20, 0.3));
}

.vpd-album-card__actions-top {
  display: flex;
  gap: 6px;
}

.vpd-album-card__body {
  display: grid;
  gap: 5px;
  padding: 10px;
}

.vpd-album-card__topline,
.vpd-album-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.vpd-album-card__topline strong {
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.vpd-album-card__topline span,
.vpd-album-card__meta span {
  color: rgba(224, 231, 255, 0.72);
  font-size: 11px;
}

.vpd-album-card__meta span:first-child {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vpd-album-card__meta span:last-child {
  flex: 0 0 auto;
}

.vpd-album-card__time {
  font-size: 10px;
  color: rgba(224, 231, 255, 0.56);
}

.vpd-album-card__error {
  font-size: 11px;
  line-height: 1.55;
  color: #fecaca;
}

.vpd-album-card__footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.vpd-status-pill {
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  backdrop-filter: blur(10px);
}

.vpd-ghost-button,
.vpd-primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  padding: 0 14px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 600;
}

.vpd-ghost-button {
  background: rgba(255, 255, 255, 0.04);
  color: #eef2ff;
}

.vpd-primary-button {
  background: linear-gradient(135deg, #6558ff, #3478ff);
  color: #ffffff;
  box-shadow: 0 14px 30px rgba(52, 120, 255, 0.26);
}

.vpd-ghost-chip,
.vpd-icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(26, 18, 33, 0.34);
  color: #f8fbff;
}

.vpd-icon-action {
  width: 26px;
  height: 26px;
  backdrop-filter: blur(10px);
}

.vpd-icon-action--danger {
  background: rgba(255, 94, 94, 0.18);
  border-color: rgba(255, 94, 94, 0.28);
  color: #fecaca;
}

.vpd-ghost-chip {
  min-width: 0;
  padding: 5px 8px;
  font-size: 11px;
}

.vpd-ghost-chip--mini {
  min-height: 24px;
  padding: 0 8px;
  color: rgba(225, 231, 255, 0.78);
}

.vpd-ghost-chip--danger {
  background: rgba(255, 94, 94, 0.18);
  border-color: rgba(255, 94, 94, 0.28);
  color: #fecaca;
}

.vpd-empty-copy {
  padding: 24px 12px;
  text-align: center;
  color: rgba(224, 231, 255, 0.64);
}

.is-success {
  background: rgba(34, 197, 94, 0.18);
  color: #bbf7d0;
}

.is-warning {
  background: rgba(245, 158, 11, 0.18);
  color: #fde68a;
}

.is-danger {
  background: rgba(239, 68, 68, 0.2);
  color: #fecaca;
}

.is-info {
  background: rgba(59, 130, 246, 0.18);
  color: #bfdbfe;
}

.vpd-ghost-button:disabled,
.vpd-primary-button:disabled,
.vpd-ghost-chip:disabled,
.vpd-icon-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.icon {
  width: 16px;
  height: 16px;
}

.icon--small {
  width: 14px;
  height: 14px;
}

.icon--tiny {
  width: 12px;
  height: 12px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1080px) {
  .vpd-hero,
  .vpd-input-grid {
    grid-template-columns: 1fr;
  }

  .vpd-album-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .vpd-hero__stats {
    width: 100%;
  }

  .vpd-stat {
    flex: 1;
  }
}

@media (max-width: 820px) {
  .vpd-workspace__head,
  .vpd-input-footer,
  .vpd-empty {
    flex-direction: column;
    align-items: stretch;
  }

  .vpd-album-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
