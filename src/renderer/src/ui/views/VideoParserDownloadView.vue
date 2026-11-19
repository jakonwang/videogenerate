<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Download,
  FolderInput,
  FolderOpen,
  Images,
  KeyRound,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  Play,
  RefreshCcw,
  Search,
  Settings2,
  Trash2,
  Video,
  X,
} from 'lucide-vue-next'
import VideoPreviewModal from '../components/VideoPreviewModal.vue'
import MaterialPager from '../components/product-materials/MaterialPager.vue'
import { useCloudAuthStore } from '@/stores/cloudAuth'
import { PARSE_PLATFORM_IDS, detectPlatform, extractFirstUrl, parsePlatformLabel, type ParsePlatform } from '../../../../shared/videoParserPlatforms'
// Page layout lives with the page so the web version (which reuses this page) gets it too.
import '@/design-system/video-parser-download.css'

type ParserVideoItem = {
  id: string
  shareUrl: string
  videoId: string
  platform?: ParsePlatform
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

type StatusFilter = 'all' | 'processing' | 'completed' | 'failed'

const DESKTOP_USER_ID = 'desktop-local'
const PAGE_SIZES = [24, 48, 96]
const VIEW_KEY = 'vpd.view'
const PAGE_SIZE_KEY = 'vpd.pageSize'

const router = useRouter()
const shareInput = ref('')
const items = ref<ParserVideoItem[]>([])
const loading = ref(false)
const submitting = ref(false)
const notice = ref<{ tone: 'accent' | 'danger' | 'warning'; text: string } | null>(null)
const hasTikHubKey = ref(true)
const query = ref('')
const statusFilter = ref<StatusFilter>('all')
const platformFilter = ref<'all' | ParsePlatform>('all')
const sortNewest = ref(true)
const viewMode = ref<'grid' | 'list'>(readView())
const page = ref(1)
const pageSize = ref(readPageSize())
const selected = ref<Set<string>>(new Set())
const brokenPosterIds = ref<Set<string>>(new Set())
const busy = ref(false)
const preview = ref<{ src: string; fallback: string; poster: string | null; title: string } | null>(null)
let refreshTimer: ReturnType<typeof setInterval> | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null

function readPageSize() {
  try {
    const value = Number(localStorage.getItem(PAGE_SIZE_KEY))
    return PAGE_SIZES.includes(value) ? value : PAGE_SIZES[0]
  } catch {
    return PAGE_SIZES[0]
  }
}
watch(pageSize, (size) => {
  page.value = 1
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(size))
  } catch {
    /* 存不了就算了 */
  }
})

function readView(): 'grid' | 'list' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}
watch(viewMode, (mode) => {
  try {
    localStorage.setItem(VIEW_KEY, mode)
  } catch {
    /* 存不了就算了 */
  }
})

function say(tone: 'accent' | 'danger' | 'warning', text: string) {
  notice.value = { tone, text }
  if (noticeTimer) clearTimeout(noticeTimer)
  if (tone !== 'danger') noticeTimer = setTimeout(() => (notice.value = null), 5000)
}
const messageOf = (error: unknown) => String((error as Error)?.message ?? error)

/* ------------------------------------------------------------ 粘贴框：逐行识别平台 */

const shareKey = (url: string) => url.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()
const knownKeys = computed(() => new Map(items.value.map((item) => [shareKey(item.shareUrl), item])))

/** 粘贴的每一行：识别出的链接、平台，以及是否重复 / 已下载 */
const parsedLines = computed(() => {
  const seen = new Set<string>()
  return shareInput.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => {
      const url = extractFirstUrl(text)
      const platform = url ? detectPlatform(url)?.platform : undefined
      const key = url ? shareKey(url) : ''
      const duplicate = Boolean(key) && seen.has(key)
      if (key) seen.add(key)
      const existing = key ? knownKeys.value.get(key) : undefined
      return { text, url, platform, duplicate, downloaded: existing?.status === 'completed' }
    })
})
const readyLines = computed(() => parsedLines.value.filter((line) => line.platform && !line.duplicate))
const newLines = computed(() => readyLines.value.filter((line) => !line.downloaded))
const unknownCount = computed(() => parsedLines.value.filter((line) => !line.platform).length)
const duplicateCount = computed(() => parsedLines.value.filter((line) => line.duplicate).length + readyLines.value.length - newLines.value.length)
const detectedPlatforms = computed(() => {
  const counts = new Map<ParsePlatform, number>()
  for (const line of readyLines.value) counts.set(line.platform!, (counts.get(line.platform!) ?? 0) + 1)
  return counts
})

async function pasteFromClipboard() {
  try {
    const text = (await navigator.clipboard.readText()).trim()
    if (!text) return say('warning', '剪贴板里没有内容')
    shareInput.value = shareInput.value.trim() ? `${shareInput.value.trim()}\n${text}` : text
  } catch {
    say('warning', '读不到剪贴板，请在输入框里按 Ctrl+V 粘贴')
  }
}

async function submitLinks() {
  if (!readyLines.value.length || submitting.value) return
  submitting.value = true
  try {
    const result = await window.api.videoParserDownload.importShareUrls({
      userId: DESKTOP_USER_ID,
      shareUrls: readyLines.value.map((line) => line.text),
    })
    shareInput.value = ''
    const failed = result.errors?.length ?? 0
    say(failed ? 'warning' : 'accent', failed ? `已开始下载 ${result.items.length} 条，${failed} 条没能提交：${result.errors[0]?.message ?? ''}` : `已开始下载 ${result.items.length} 条，下载好会出现在下方`)
    statusFilter.value = 'all'
    await loadAll()
  } catch (error) {
    say('danger', messageOf(error))
  } finally {
    submitting.value = false
  }
}

/* ------------------------------------------------------------ 视频库 */

const counts = computed(() => ({
  all: items.value.length,
  processing: items.value.filter((item) => item.status === 'processing').length,
  completed: items.value.filter((item) => item.status === 'completed').length,
  failed: items.value.filter((item) => item.status === 'failed').length,
}))
const platformsInLibrary = computed(() => PARSE_PLATFORM_IDS.filter((id) => items.value.some((item) => platformOf(item) === id)))

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = items.value.filter((item) => {
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false
    if (platformFilter.value !== 'all' && platformOf(item) !== platformFilter.value) return false
    if (!q) return true
    return [item.title, item.author, item.shareUrl].some((text) => String(text || '').toLowerCase().includes(q))
  })
  return list.sort((a, b) => (sortNewest.value ? b.updatedAt - a.updatedAt : a.updatedAt - b.updatedAt))
})
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
/** 当前页的视频 */
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([query, statusFilter, platformFilter, sortNewest], () => (page.value = 1))
// 删掉或筛选后页数变少：停在最后一页
watch(totalPages, (count) => {
  if (page.value > count) page.value = count
})

const selectedItems = computed(() => items.value.filter((item) => selected.value.has(item.id)))
const allVisibleSelected = computed(() => visible.value.length > 0 && visible.value.every((item) => selected.value.has(item.id)))

function toggleSelect(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function toggleSelectAll() {
  const next = new Set(selected.value)
  if (allVisibleSelected.value) visible.value.forEach((item) => next.delete(item.id))
  else visible.value.forEach((item) => next.add(item.id))
  selected.value = next
}
const clearSelection = () => (selected.value = new Set())

function platformOf(item: ParserVideoItem): ParsePlatform {
  return item.platform || detectPlatform(item.shareUrl)?.platform || 'tiktok'
}
const titleOf = (item: ParserVideoItem) => item.title?.trim() || (item.status === 'processing' ? '正在解析…' : '未命名视频')
const hasVideo = (item: ParserVideoItem) => item.status === 'completed' && Boolean(String(item.localVideoPath || '').trim())
/** 网页版的视频在云端：「打开文件」就是下载到这台电脑 */
const isCloudFile = (item: ParserVideoItem) => String(item.localVideoPath || '').startsWith('cloudfile:')

function mediaUrl(filePath?: string) {
  const text = String(filePath || '').trim()
  return text ? `vg://file?path=${encodeURIComponent(text)}` : ''
}
function fileVideoUrl(filePath?: string) {
  const text = String(filePath || '').trim()
  if (!text) return ''
  const normalized = text.replace(/\\/g, '/')
  return encodeURI(`file://${/^[a-z]:/i.test(normalized) ? `/${normalized}` : normalized}`)
}
function posterUrl(item: ParserVideoItem) {
  if (brokenPosterIds.value.has(item.id)) return ''
  return mediaUrl(item.thumbnailPath) || String(item.coverUrl || '').trim()
}
function markPosterBroken(id: string) {
  brokenPosterIds.value = new Set(brokenPosterIds.value).add(id)
}

function formatTime(value: number) {
  if (!value) return ''
  const diff = Date.now() - value
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const d = new Date(value)
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function openPreview(item: ParserVideoItem) {
  if (!hasVideo(item)) return
  preview.value = { src: fileVideoUrl(item.localVideoPath), fallback: mediaUrl(item.localVideoPath), poster: posterUrl(item) || null, title: titleOf(item) }
}

async function loadAll() {
  loading.value = true
  try {
    const [nextItems, credentials] = await Promise.all([
      window.api.videoParserDownload.listItems({ userId: DESKTOP_USER_ID }) as Promise<ParserVideoItem[]>,
      window.api.clone.getModelCredentials() as Promise<{ tikhubApiKey?: string }>,
    ])
    items.value = nextItems
    const ids = new Set(nextItems.map((item) => item.id))
    selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
    hasTikHubKey.value = Boolean(String(credentials?.tikhubApiKey || '').trim())
  } catch (error) {
    say('danger', messageOf(error))
  } finally {
    loading.value = false
  }
}

/* ------------------------------------------------------------ 单条 / 批量操作 */

async function retry(list: ParserVideoItem[]) {
  const failed = list.filter((item) => item.status === 'failed')
  if (!failed.length) return say('warning', '选中的视频里没有下载失败的')
  busy.value = true
  try {
    for (const item of failed) await window.api.videoParserDownload.retryItem({ userId: DESKTOP_USER_ID, id: item.id })
    say('accent', `已重新下载 ${failed.length} 条`)
    await loadAll()
  } catch (error) {
    say('danger', messageOf(error))
  } finally {
    busy.value = false
  }
}

async function remove(list: ParserVideoItem[]) {
  if (!list.length) return
  if (!window.confirm(list.length === 1 ? '确定删除这条视频吗？下载的文件也会一起删除。' : `确定删除选中的 ${list.length} 条视频吗？下载的文件也会一起删除。`)) return
  busy.value = true
  try {
    for (const item of list) await window.api.videoParserDownload.deleteItem({ userId: DESKTOP_USER_ID, id: item.id })
    say('accent', `已删除 ${list.length} 条`)
    clearSelection()
    await loadAll()
  } catch (error) {
    say('danger', messageOf(error))
  } finally {
    busy.value = false
  }
}

async function copyLinks(list: ParserVideoItem[]) {
  const text = list.map((item) => item.shareUrl).filter(Boolean).join('\n')
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    say('accent', list.length === 1 ? '已复制链接' : `已复制 ${list.length} 条链接`)
  } catch {
    say('danger', '复制失败，请稍后再试')
  }
}

async function saveToLibrary(list: ParserVideoItem[]) {
  const paths = list.filter(hasVideo).map((item) => item.localVideoPath!)
  if (!paths.length) return say('warning', '选中的视频还没有下载好')
  busy.value = true
  try {
    await window.api.assetLibrary.importPaths({ paths, folderId: null })
    say('accent', `已存入素材库 ${paths.length} 条`)
  } catch (error) {
    say('danger', messageOf(error))
  } finally {
    busy.value = false
  }
}

async function openFile(item: ParserVideoItem) {
  if (!item.localVideoPath) return
  await window.api.shell.showItemInFolder(item.localVideoPath)
}

async function downloadSelected(list: ParserVideoItem[]) {
  const ready = list.filter(hasVideo)
  if (!ready.length) return say('warning', '选中的视频还没有下载好')
  for (const item of ready) await openFile(item)
}

function goMakeImages() {
  if (router.hasRoute('plugin-product-image-materials')) void router.push({ name: 'plugin-product-image-materials' })
  else void router.push('/product-images')
}

const cloudAuth = useCloudAuthStore()
void cloudAuth.ensureLoaded()
/** 商业版托管模式：TikHub 由平台统一提供，用户没有地方填 Key，不显示「打开设置」 */
const managedAi = computed(() => Boolean(cloudAuth.status?.managedSettings))
const onWeb = computed(() => items.value.some(isCloudFile))

onMounted(async () => {
  await loadAll()
  refreshTimer = setInterval(() => {
    if (document.hidden || !items.value.some((item) => item.status === 'processing')) return
    void loadAll()
  }, 4000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (noticeTimer) clearTimeout(noticeTimer)
})
</script>

<template>
  <div class="vg-scope vg-page vpd">
    <header class="vg-page-head">
      <span class="vg-page-head__icon"><Download :size="20" /></span>
      <div class="vg-page-head__text">
        <h1>视频解析下载</h1>
        <p>粘贴分享链接，自动识别平台，下载无水印视频，可直接拿去拆帧做图、存进素材库。</p>
      </div>
      <div class="vg-page-head__actions">
        <button class="vg-btn vg-btn--sm" type="button" :disabled="loading" @click="loadAll">
          <RefreshCcw :size="14" :class="{ 'vg-spin': loading }" />刷新
        </button>
      </div>
    </header>

    <div v-if="notice" class="vg-notice" :class="`vg-notice--${notice.tone}`">
      <span>{{ notice.text }}</span>
      <button class="vg-icon-btn vg-icon-btn--sm" type="button" aria-label="关闭" @click="notice = null"><X :size="13" /></button>
    </div>

    <section v-if="!hasTikHubKey" class="vg-card vpd-key">
      <span class="vpd-key__icon"><KeyRound :size="22" /></span>
      <div class="vpd-key__text">
        <h2>{{ managedAi ? '视频解析服务暂未开通' : '还没有填写 TikHub 密钥' }}</h2>
        <p>{{ managedAi ? '平台开通视频解析服务后这里会自动可用，如需使用请联系客服。' : '在设置里填写 TikHub API Key 之后，就能解析下载各平台的视频。' }}</p>
      </div>
      <button v-if="!managedAi" class="vg-btn vg-btn--primary" type="button" @click="router.push('/settings')"><Settings2 :size="15" />打开设置</button>
    </section>

    <template v-else>
      <!-- 粘贴框：一直在顶部 -->
      <section class="vg-card vpd-paste">
        <div class="vpd-paste__head">
          <span class="vpd-paste__title"><Link2 :size="16" />粘贴分享链接</span>
          <div class="vpd-platforms">
            <span
              v-for="id in PARSE_PLATFORM_IDS"
              :key="id"
              class="vpd-platform"
              :class="[`vpd-platform--${id}`, { 'is-on': detectedPlatforms.has(id) }]"
            >
              {{ parsePlatformLabel(id) }}<b v-if="detectedPlatforms.get(id)">{{ detectedPlatforms.get(id) }}</b>
            </span>
          </div>
        </div>
        <textarea
          v-model="shareInput"
          class="vg-textarea vpd-paste__input"
          rows="4"
          spellcheck="false"
          placeholder="一行一条：可以直接粘贴 App 里「分享 → 复制链接」得到的整段文字，会自动找出里面的链接&#10;支持抖音、TikTok、小红书、快手、B 站、YouTube、Instagram、Threads"
          @keydown.ctrl.enter.prevent="submitLinks"
          @keydown.meta.enter.prevent="submitLinks"
        ></textarea>
        <div class="vpd-paste__foot">
          <div class="vpd-paste__summary">
            <template v-if="parsedLines.length">
              <span class="vg-pill vg-pill--green vg-pill--dot">可下载 {{ readyLines.length }}</span>
              <span v-if="duplicateCount" class="vg-pill vg-pill--amber">重复或已下载 {{ duplicateCount }}</span>
              <span v-if="unknownCount" class="vg-pill vg-pill--red">无法识别 {{ unknownCount }}</span>
            </template>
            <span v-else class="vg-muted">粘贴后自动识别，Ctrl + Enter 开始下载</span>
          </div>
          <div class="vg-row">
            <button v-if="shareInput" class="vg-btn vg-btn--ghost vg-btn--sm" type="button" @click="shareInput = ''">清空</button>
            <button class="vg-btn vg-btn--sm" type="button" @click="pasteFromClipboard"><ClipboardPaste :size="14" />从剪贴板粘贴</button>
            <button class="vg-btn vg-btn--primary" type="button" :disabled="!readyLines.length || submitting" @click="submitLinks">
              <Loader2 v-if="submitting" :size="15" class="vg-spin" /><Download v-else :size="15" />
              {{ readyLines.length ? `开始下载 ${readyLines.length} 条` : '开始下载' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 视频库 -->
      <section class="vg-card vg-card--flush vpd-library">
        <div class="vpd-toolbar">
          <div class="vg-seg vg-seg--sm" role="tablist">
            <button
              v-for="tab in ([['all', '全部'], ['processing', '下载中'], ['completed', '已完成'], ['failed', '失败']] as const)"
              :key="tab[0]"
              type="button"
              class="vg-seg__btn"
              :class="{ 'is-active': statusFilter === tab[0] }"
              @click="statusFilter = tab[0]"
            >
              {{ tab[1] }}<span class="vpd-count" :class="{ 'is-red': tab[0] === 'failed' && counts.failed }">{{ counts[tab[0]] }}</span>
            </button>
          </div>
          <div class="vg-toolbar__spacer"></div>
          <label class="vg-search vpd-search">
            <Search :size="15" />
            <input v-model="query" class="vg-input vg-input--sm" placeholder="搜索标题、作者、链接" />
          </label>
          <select v-model="platformFilter" class="vg-select vg-select--sm vpd-platform-select" aria-label="平台">
            <option value="all">全部平台</option>
            <option v-for="id in platformsInLibrary" :key="id" :value="id">{{ parsePlatformLabel(id) }}</option>
          </select>
          <button class="vg-btn vg-btn--sm" type="button" @click="sortNewest = !sortNewest">
            <ArrowDownWideNarrow v-if="sortNewest" :size="14" /><ArrowUpNarrowWide v-else :size="14" />{{ sortNewest ? '最新' : '最早' }}
          </button>
          <div class="vg-seg vg-seg--sm" role="group" aria-label="显示方式">
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': viewMode === 'grid' }" title="卡片" @click="viewMode = 'grid'"><LayoutGrid :size="14" /></button>
            <button type="button" class="vg-seg__btn" :class="{ 'is-active': viewMode === 'list' }" title="列表" @click="viewMode = 'list'"><List :size="14" /></button>
          </div>
        </div>

        <div v-if="filtered.length" class="vpd-selectbar" :class="{ 'is-active': selected.size }">
          <label class="vpd-check">
            <input type="checkbox" :checked="allVisibleSelected" @change="toggleSelectAll" />
            <span>{{ selected.size ? `已选 ${selected.size} 条` : totalPages > 1 ? `全选本页（共 ${filtered.length} 条）` : `共 ${filtered.length} 条` }}</span>
          </label>
          <template v-if="selected.size">
            <button class="vg-btn vg-btn--xs" type="button" :disabled="busy" @click="downloadSelected(selectedItems)">
              <component :is="onWeb ? Download : FolderOpen" :size="13" />{{ onWeb ? '下载到电脑' : '打开文件位置' }}
            </button>
            <button class="vg-btn vg-btn--xs" type="button" :disabled="busy" @click="saveToLibrary(selectedItems)"><FolderInput :size="13" />存入素材库</button>
            <button class="vg-btn vg-btn--xs" type="button" @click="copyLinks(selectedItems)"><Copy :size="13" />复制链接</button>
            <button v-if="selectedItems.some((item) => item.status === 'failed')" class="vg-btn vg-btn--xs" type="button" :disabled="busy" @click="retry(selectedItems)"><RefreshCcw :size="13" />重试失败</button>
            <button class="vg-btn vg-btn--xs vg-btn--danger" type="button" :disabled="busy" @click="remove(selectedItems)"><Trash2 :size="13" />删除</button>
            <button class="vg-btn vg-btn--xs vg-btn--ghost" type="button" @click="clearSelection">取消</button>
          </template>
          <template v-else>
            <div class="vg-toolbar__spacer"></div>
            <button v-if="counts.failed" class="vg-btn vg-btn--xs" type="button" :disabled="busy" @click="retry(items)"><RefreshCcw :size="13" />全部重试（{{ counts.failed }}）</button>
            <button v-if="counts.completed" class="vg-btn vg-btn--xs vg-btn--soft" type="button" @click="goMakeImages"><Images :size="13" />去拆帧做图生图</button>
          </template>
        </div>

        <div v-if="!filtered.length" class="vg-empty vpd-empty">
          <span class="vg-empty__icon"><Video :size="22" /></span>
          <p v-if="items.length">没有符合条件的视频</p>
          <p v-else>还没有下载过视频。把分享链接粘贴到上面，点「开始下载」就行</p>
        </div>

        <!-- 卡片 -->
        <div v-else-if="viewMode === 'grid'" class="vpd-grid">
          <article
            v-for="item in visible"
            :key="item.id"
            class="vpd-card"
            :class="{ 'is-selected': selected.has(item.id), [`is-${item.status}`]: true }"
          >
            <div class="vpd-card__media" @click="hasVideo(item) ? openPreview(item) : undefined">
              <img v-if="posterUrl(item)" :src="posterUrl(item)" alt="" loading="lazy" decoding="async" @error="markPosterBroken(item.id)" />
              <span v-else class="vpd-card__noposter"><Video :size="26" /></span>
              <label class="vpd-card__check" @click.stop>
                <input type="checkbox" :checked="selected.has(item.id)" @change="toggleSelect(item.id)" />
              </label>
              <span class="vpd-badge" :class="`vpd-platform--${platformOf(item)}`">{{ parsePlatformLabel(platformOf(item)) }}</span>
              <span v-if="item.usedStatus === 'used'" class="vpd-card__used">已使用</span>
              <div v-if="item.status === 'processing'" class="vpd-card__state">
                <Loader2 :size="22" class="vg-spin" /><span>下载中…</span>
              </div>
              <div v-else-if="item.status === 'failed'" class="vpd-card__state is-failed" @click.stop>
                <AlertTriangle :size="20" />
                <span class="vpd-card__error" :title="item.error">{{ item.error || '下载失败' }}</span>
                <button class="vg-btn vg-btn--xs vg-btn--primary" type="button" :disabled="busy" @click="retry([item])"><RefreshCcw :size="12" />重试</button>
              </div>
              <span v-else class="vpd-card__play"><Play :size="20" /></span>
            </div>
            <div class="vpd-card__body">
              <strong class="vpd-card__title" :title="titleOf(item)">{{ titleOf(item) }}</strong>
              <div class="vpd-card__meta">
                <span class="vg-ellipsis">{{ item.author || item.shareUrl }}</span>
                <span>{{ formatTime(item.updatedAt) }}</span>
              </div>
            </div>
            <div class="vpd-card__actions">
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="!hasVideo(item)" :title="isCloudFile(item) ? '下载到电脑' : '打开文件位置'" @click="openFile(item)">
                <component :is="isCloudFile(item) ? Download : FolderOpen" :size="14" />
              </button>
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="!hasVideo(item)" title="存入素材库" @click="saveToLibrary([item])"><FolderInput :size="14" /></button>
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" title="复制链接" @click="copyLinks([item])"><Copy :size="14" /></button>
              <button class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" type="button" title="删除" @click="remove([item])"><Trash2 :size="14" /></button>
            </div>
          </article>
        </div>

        <!-- 列表 -->
        <div v-else class="vg-table-wrap vpd-table-wrap">
          <table class="vg-table vg-table--compact">
            <thead>
              <tr>
                <th class="vpd-col-check"></th>
                <th>视频</th>
                <th>平台</th>
                <th>状态</th>
                <th>时间</th>
                <th class="vpd-col-actions"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in visible" :key="item.id" :class="{ 'is-selected': selected.has(item.id) }">
                <td class="vpd-col-check"><input type="checkbox" :checked="selected.has(item.id)" @change="toggleSelect(item.id)" /></td>
                <td>
                  <div class="vpd-row-video">
                    <button class="vg-thumb vpd-row-thumb" type="button" :disabled="!hasVideo(item)" @click="openPreview(item)">
                      <img v-if="posterUrl(item)" :src="posterUrl(item)" alt="" loading="lazy" @error="markPosterBroken(item.id)" />
                      <Video v-else :size="16" />
                    </button>
                    <div class="vpd-row-text">
                      <strong class="vg-ellipsis" :title="titleOf(item)">{{ titleOf(item) }}</strong>
                      <span class="vg-ellipsis">{{ item.author || item.shareUrl }}</span>
                    </div>
                  </div>
                </td>
                <td><span class="vpd-badge is-inline" :class="`vpd-platform--${platformOf(item)}`">{{ parsePlatformLabel(platformOf(item)) }}</span></td>
                <td>
                  <span v-if="item.status === 'processing'" class="vg-pill vg-pill--blue"><Loader2 :size="12" class="vg-spin" />下载中</span>
                  <span v-else-if="item.status === 'failed'" class="vg-pill vg-pill--red" :title="item.error">失败</span>
                  <span v-else-if="item.usedStatus === 'used'" class="vg-pill vg-pill--amber">已使用</span>
                  <span v-else class="vg-pill vg-pill--green"><CheckCircle2 :size="12" />已完成</span>
                </td>
                <td class="vg-muted">{{ formatTime(item.updatedAt) }}</td>
                <td class="vpd-col-actions">
                  <div class="vg-row">
                    <button v-if="item.status === 'failed'" class="vg-icon-btn vg-icon-btn--sm" type="button" title="重试" @click="retry([item])"><RefreshCcw :size="14" /></button>
                    <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="!hasVideo(item)" title="预览" @click="openPreview(item)"><Play :size="14" /></button>
                    <button class="vg-icon-btn vg-icon-btn--sm" type="button" :disabled="!hasVideo(item)" :title="isCloudFile(item) ? '下载到电脑' : '打开文件位置'" @click="openFile(item)">
                      <component :is="isCloudFile(item) ? Download : FolderOpen" :size="14" />
                    </button>
                    <button class="vg-icon-btn vg-icon-btn--sm" type="button" title="复制链接" @click="copyLinks([item])"><Copy :size="14" /></button>
                    <button class="vg-icon-btn vg-icon-btn--sm vg-icon-btn--danger" type="button" title="删除" @click="remove([item])"><Trash2 :size="14" /></button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <MaterialPager
          v-if="filtered.length > PAGE_SIZES[0]"
          v-model:page="page"
          v-model:page-size="pageSize"
          class="vpd-pager"
          :total-pages="totalPages"
          :total="filtered.length"
          :sizes="PAGE_SIZES"
          :labels="{ prev: '上一页', next: '下一页', perPage: '每页', items: '条' }"
        />
      </section>
    </template>

    <VideoPreviewModal
      :open="Boolean(preview)"
      :src="preview?.src ?? null"
      :fallback-src="preview?.fallback ?? null"
      :poster="preview?.poster ?? null"
      :title="preview?.title ?? ''"
      media-type="video"
      @close="preview = null"
    />
  </div>
</template>
