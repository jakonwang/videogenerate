<script setup lang="ts">
import { isWeb } from '@/lib/platform'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Check, Inbox, X } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import GenerationTile from '@/components/GenerationTile.vue'
import PageHeader from '@/components/PageHeader.vue'
import { approve, reject, startPolling, useGenerations, type GenerationItem } from '@/lib/generate'
import { relativeTime } from '@/lib/library'
import { toast } from '@/lib/toast'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
import { onBeforeUnmount, watch } from 'vue'
// Video tools keep the input video as their source: there is no source image to show.
const VIDEO_TOOL_PURPOSES = new Set(['watermark', 'subtitle', 'slice', 'mix', 'parse-link'])
const LINE_LABEL: Record<string, string> = { 'product-image': '商品图素材', 'image-to-video': '图生视频', clone: '复刻', 'product-replace': '商品替换', 'product-watermark': '商品图水印', creative: 'tk创意室', model: 'AI 模特', watermark: '批量水印', subtitle: '批量字幕', slice: '直播切片', mix: '批量混剪', 'parse-link': '链接下载' }
const inWebShell = useInWebShell()

/**
 * 审核收件箱：AI 生成好的商品图 / 视频在这里过一遍。
 * 通过的商品图自动加进对应商品的图片；不通过的留档，不再出现在待审核里。
 */
const route = useRoute()
const tab = ref<'pending' | 'done' | 'running'>('pending')
const all = useGenerations()
const lists = computed(() => ({
  pending: all.value.filter((item) => item.status === 'succeeded' && item.review === 'pending'),
  running: all.value.filter((item) => item.status === 'queued' || item.status === 'running' || item.status === 'failed'),
  done: all.value.filter((item) => item.review !== 'pending'),
}))
const focusId = ref(route.query.focus ? String(route.query.focus) : '')
const focused = computed(() => all.value.find((item) => item.id === focusId.value) ?? null)

onMounted(startPolling)

async function decide(item: GenerationItem, ok: boolean) {
  if (ok) {
    await approve(item)
    toast(item.kind === 'image' && item.productId ? '已通过，图片已加进商品库' : '已通过')
  } else {
    await reject(item)
    toast('已标记不通过')
  }
  // Move on to the next item waiting for review.
  const next = lists.value.pending.find((candidate) => candidate.id !== item.id)
  focusId.value = next?.id ?? ''
}

// Web (desktop layout): production-line filter, a current item that follows the list, keyboard review.
const lineFilter = ref('all')
const lineOptions = computed(() => [...new Set(all.value.map((item) => item.purpose))].map((key) => [key, LINE_LABEL[key] || key] as const))
const webLists = computed(() => {
  const keep = (item: GenerationItem) => lineFilter.value === 'all' || item.purpose === lineFilter.value
  return { pending: lists.value.pending.filter(keep), running: lists.value.running.filter(keep), done: lists.value.done.filter(keep) }
})
const current = computed(() => webLists.value[tab.value].find((item) => item.id === focusId.value) ?? webLists.value[tab.value][0] ?? null)
watch(tab, () => { focusId.value = '' })
function onReviewKey(event: KeyboardEvent) {
  if (!inWebShell.value || !current.value) return
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  const list = webLists.value[tab.value]
  const index = list.findIndex((item) => item.id === current.value!.id)
  const key = event.key.toLowerCase()
  if (key === 'arrowdown' || key === 'arrowup') {
    event.preventDefault()
    const next = list[Math.max(0, Math.min(list.length - 1, index + (key === 'arrowdown' ? 1 : -1)))]
    if (next) focusId.value = next.id
  } else if ((key === 'a' || key === 'r') && current.value.status === 'succeeded') {
    event.preventDefault()
    void decide(current.value, key === 'a')
  }
}
window.addEventListener('keydown', onReviewKey)
onBeforeUnmount(() => window.removeEventListener('keydown', onReviewKey))

function open(item: GenerationItem) {
  if (item.status === 'succeeded') focusId.value = item.id
}
</script>

<template>
  <template v-if="inWebShell">
    <PageHeader title="审核收件箱" description="AI 产出的图片和视频都在这里。逐条选择：通过 / 不通过，通过的商品图自动加进商品库。">
      <template #actions>
        <select v-model="lineFilter" class="vg-select vg-select--sm" title="生产线">
          <option value="all">全部生产线</option>
          <option v-for="[value, label] in lineOptions" :key="value" :value="value">{{ label }}</option>
        </select>
      </template>
    </PageHeader>
    <main class="vg-page rv" data-testid="web-review">
      <div class="rv-bar">
        <nav class="rv-tabs" role="tablist">
          <button v-for="[key, label] in [['pending', '待审核'], ['running', '生成中'], ['done', '已处理']] as const" :key="key" type="button" class="rv-tab" :class="{ 'is-active': tab === key }" @click="tab = key">
            {{ label }} <span class="rv-tab__count">{{ webLists[key].length }}</span>
          </button>
        </nav>
        <span class="rv-keys"><kbd>A</kbd> 通过 <kbd>R</kbd> 不通过 <kbd>↑</kbd><kbd>↓</kbd> 切换</span>
      </div>

      <div v-if="webLists[tab].length" class="rv-split">
        <div class="rv-list">
          <button v-for="item in webLists[tab]" :key="item.id" type="button" class="rv-item" :class="{ 'is-active': current?.id === item.id }" @click="focusId = item.id">
            <span class="rv-item__thumb">
              <CloudImage :file-id="item.kind === 'image' && item.outputFileId ? item.outputFileId : item.sourceFileId" />
              <span v-if="item.kind === 'video'" class="rv-item__badge">视频</span>
            </span>
            <span class="rv-item__main">
              <strong>{{ item.productName ? `${item.productName} · ${item.label}` : item.label }}</strong>
              <small>{{ LINE_LABEL[item.purpose] || '作品' }} · {{ relativeTime(item.createdAt) }}</small>
            </span>
            <span class="vg-pill vg-pill--dot" :class="item.status === 'failed' ? 'vg-pill--red' : item.status !== 'succeeded' ? 'vg-pill--blue' : item.review === 'approved' ? 'vg-pill--green' : item.review === 'rejected' ? 'vg-pill--red' : 'vg-pill--amber'">
              {{ item.status === 'failed' ? '失败' : item.status !== 'succeeded' ? '生成中' : item.review === 'approved' ? '已通过' : item.review === 'rejected' ? '未通过' : '待审核' }}
            </span>
          </button>
        </div>
        <section v-if="current" class="rv-detail">
          <div class="rv-detail__media" :class="{ 'is-video': current.kind === 'video' }">
            <template v-if="current.status === 'succeeded'">
              <CloudVideo v-if="current.kind === 'video'" :key="current.id" :file-id="current.outputFileId" autoplay controls />
              <CloudImage v-else :file-id="current.outputFileId" />
            </template>
            <div v-else class="vg-empty"><h3>{{ current.status === 'failed' ? '生成失败' : '还在生成中' }}</h3><p>{{ current.error || '完成后可以在这里审核' }}</p></div>
          </div>
          <aside class="rv-detail__side">
            <h3>{{ current.productName || '未关联商品' }}</h3>
            <p class="vg-muted">{{ current.label }}</p>
            <dl class="vg-kv">
              <dt>生产线</dt><dd>{{ LINE_LABEL[current.purpose] || '作品' }}</dd>
              <dt>类型</dt><dd>{{ current.kind === 'video' ? '视频' : '图片' }}</dd>
              <dt>时间</dt><dd>{{ new Date(current.createdAt).toLocaleString() }}</dd>
              <dt>状态</dt><dd>{{ current.review === 'approved' ? '已通过' : current.review === 'rejected' ? '未通过' : '待审核' }}</dd>
            </dl>
            <div v-if="current.sourceFileId && !VIDEO_TOOL_PURPOSES.has(current.purpose)" class="rv-detail__source"><span class="vg-field__label">原图</span><CloudImage :file-id="current.sourceFileId" /></div>
            <div v-if="current.status === 'succeeded'" class="rv-detail__actions">
              <button type="button" class="vg-btn vg-btn--primary vg-btn--block" @click="decide(current, true)"><Check :size="15" /> 通过 <kbd>A</kbd></button>
              <button type="button" class="vg-btn vg-btn--block rv-reject" @click="decide(current, false)"><X :size="15" /> 不通过 <kbd>R</kbd></button>
            </div>
          </aside>
        </section>
      </div>
      <div v-else class="vg-empty rv-empty">
        <span class="vg-empty__icon"><Inbox :size="24" /></span>
        <h3>{{ tab === 'pending' ? '没有待审核的内容' : tab === 'running' ? '没有进行中的任务' : '还没有处理过的内容' }}</h3>
        <p>在「商品图素材」「图生视频」或视频工具里生成后，结果会出现在这里。</p>
      </div>
    </main>
  </template>
  <template v-else>
  <PageHeader title="审核收件箱" back="/create" />
  <main class="m-page m-page--no-tabs">
    <div class="seg" role="tablist">
      <button type="button" :class="{ 'is-active': tab === 'pending' }" @click="tab = 'pending'">待审核 <small>{{ lists.pending.length }}</small></button>
      <button type="button" :class="{ 'is-active': tab === 'running' }" @click="tab = 'running'">生成中 <small>{{ lists.running.length }}</small></button>
      <button type="button" :class="{ 'is-active': tab === 'done' }" @click="tab = 'done'">已处理 <small>{{ lists.done.length }}</small></button>
    </div>

    <div v-if="lists[tab].length" class="grid">
      <GenerationTile v-for="item in lists[tab]" :key="item.id" :item="item" :tall="item.kind === 'video'" @click="open(item)" />
    </div>
    <div v-else class="m-card m-empty">
      <span class="m-empty__icon"><Inbox :size="28" /></span>
      <span class="m-empty__title">{{ tab === 'pending' ? '没有待审核的素材' : tab === 'running' ? '没有进行中的任务' : '还没有处理过的素材' }}</span>
      <span class="m-empty__text">在「商品图素材」或「图生视频」里生成后，结果会出现在这里</span>
    </div>
  </main>

  <Teleport to="body">
    <div v-if="focused" class="viewer" role="dialog" aria-modal="true" @click.self="focusId = ''">
      <div class="viewer__media" :class="{ 'is-video': focused.kind === 'video' }">
        <CloudVideo v-if="focused.kind === 'video'" :file-id="focused.outputFileId" autoplay controls />
        <CloudImage v-else :file-id="focused.outputFileId" />
      </div>
      <div class="viewer__info">
        <strong>{{ focused.productName || (isWeb ? '上传的图片' : '手机照片') }} · {{ focused.label }}</strong>
        <span>{{ relativeTime(focused.createdAt) }}<template v-if="focused.review !== 'pending'"> · {{ focused.review === 'approved' ? '已通过' : '未通过' }}</template></span>
      </div>
      <div v-if="focused.sourceFileId" class="viewer__source"><span>原图</span><CloudImage :file-id="focused.sourceFileId" /></div>
      <div class="viewer__actions">
        <button type="button" class="m-btn m-btn--danger" @click="decide(focused, false)"><X :size="18" /> 不通过</button>
        <button type="button" class="m-btn m-btn--primary" @click="decide(focused, true)"><Check :size="18" /> 通过</button>
      </div>
      <button type="button" class="viewer__close" aria-label="关闭" @click="focusId = ''"><X :size="22" /></button>
    </div>
  </Teleport>
  </template>
</template>

<style scoped>
.seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-bottom: 14px; padding: 4px; border-radius: 14px; background: var(--theme-panel); border: 1px solid var(--theme-border); }
.seg button { height: 36px; border: 0; border-radius: 10px; background: none; color: var(--theme-text-muted); font-size: 13px; font-weight: 700; }
.seg button small { font-weight: 600; opacity: .8; }
.seg button.is-active { background: var(--theme-control-hover); color: var(--theme-text); }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; align-items: start; }
.viewer { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; gap: 14px; padding: calc(var(--m-safe-top) + 56px) var(--m-gutter) calc(var(--m-safe-bottom) + 16px); background: rgba(3, 5, 9, .96); }
.viewer__media { flex: 1; min-height: 0; display: grid; place-items: center; overflow: hidden; border-radius: 14px; }
.viewer__media :deep(img), .viewer__media :deep(video) { width: 100%; height: 100%; object-fit: contain; background: transparent; }
.viewer__info { display: flex; flex-direction: column; gap: 2px; color: #e8eef2; }
.viewer__info strong { font-size: 15px; }
.viewer__info span { color: rgba(232, 238, 242, .6); font-size: 12px; }
.viewer__source { position: absolute; top: calc(var(--m-safe-top) + 12px); left: var(--m-gutter); display: flex; align-items: center; gap: 8px; color: rgba(232, 238, 242, .7); font-size: 12px; }
.viewer__source :deep(img) { width: 36px; height: 36px; border-radius: 8px; }
.viewer__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.viewer__close { position: absolute; top: calc(var(--m-safe-top) + 8px); right: 8px; display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 12px; background: rgba(255, 255, 255, .08); color: #fff; }
</style>
