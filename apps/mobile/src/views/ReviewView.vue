<script setup lang="ts">
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

function open(item: GenerationItem) {
  if (item.status === 'succeeded') focusId.value = item.id
}
</script>

<template>
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
        <strong>{{ focused.productName || '手机照片' }} · {{ focused.label }}</strong>
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
