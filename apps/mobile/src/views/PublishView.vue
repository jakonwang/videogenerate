<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Download, LoaderCircle, Send, Share2, X } from 'lucide-vue-next'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useGenerations, type GenerationItem } from '@/lib/generate'
import { relativeTime } from '@/lib/library'
import { installedTargets, publishAvailable, saveToGallery, shareTo, useCaptionSuggestions, usePublishRecords } from '@/lib/publish'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

const router = useRouter()
const tab = ref<'ready' | 'done'>('ready')
const videos = useGenerations((item) => item.kind === 'video' && item.status === 'succeeded' && Boolean(item.outputFileId) && item.review !== 'rejected')
const records = usePublishRecords()
const captions = useCaptionSuggestions()
const targets = ref({ tiktok: false, douyin: false })
const selected = ref<GenerationItem | null>(null)
const caption = ref('')
const busy = ref('')

const publishedIds = computed(() => new Set(records.value.filter((r) => r.target !== 'gallery').map((r) => r.fileId)))
// Approved videos first, then the rest waiting for review.
const ready = computed(() => [...videos.value].sort((a, b) => Number(b.review === 'approved') - Number(a.review === 'approved')))
const TARGET_LABEL: Record<string, string> = { tiktok: 'TikTok', douyin: '抖音', other: '其他应用', gallery: '相册' }

onMounted(async () => {
  targets.value = await installedTargets().catch(() => ({ tiktok: false, douyin: false }))
})

function open(item: GenerationItem) {
  selected.value = item
  caption.value = ''
}

async function act(kind: 'tiktok' | 'douyin' | 'any' | 'gallery') {
  const item = selected.value
  if (!item?.outputFileId) return
  if (!publishAvailable) {
    toast('请在手机 App 里发布')
    return
  }
  busy.value = kind
  try {
    const input = { fileId: item.outputFileId, label: item.productName ? `${item.productName} · ${item.label}` : item.label, generationId: item.id }
    if (kind === 'gallery') {
      await saveToGallery(input)
      toast('已保存到相册「Movies/TiktokCut」')
    } else {
      await shareTo(kind, { ...input, caption: caption.value.trim() || undefined })
      if (caption.value.trim()) toast('描述已复制，到发布页粘贴即可')
    }
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <PageHeader title="发布中心" back="/create" />
  <main class="m-page m-page--no-tabs">
    <p class="intro">选一条视频，直接打开 TikTok / 抖音的发布页，或保存到相册。不需要授权账号。</p>
    <div class="seg">
      <button type="button" :class="{ 'is-active': tab === 'ready' }" @click="tab = 'ready'">可发布 <small>{{ ready.length }}</small></button>
      <button type="button" :class="{ 'is-active': tab === 'done' }" @click="tab = 'done'">发布记录 <small>{{ records.length }}</small></button>
    </div>

    <template v-if="tab === 'ready'">
      <div v-if="ready.length" class="grid">
        <button v-for="item in ready" :key="item.id" type="button" class="tile" @click="open(item)">
          <CloudVideo :file-id="item.outputFileId" />
          <span class="tile__label">{{ item.label }}</span>
          <span v-if="publishedIds.has(item.outputFileId!)" class="tile__done">已发</span>
          <span v-else-if="item.review === 'approved'" class="tile__ok">已审核</span>
        </button>
      </div>
      <div v-else class="m-card m-empty">
        <span class="m-empty__title">还没有可发布的视频</span>
        <span class="m-empty__text">用复刻、图生视频、批量混剪等生成视频后会出现在这里</span>
        <button type="button" class="m-btn m-btn--sm" @click="router.push('/create')">去创作</button>
      </div>
    </template>

    <template v-else>
      <div v-if="records.length" class="m-card m-list">
        <div v-for="item in records" :key="item.id" class="m-row">
          <span class="m-row__main">
            <span class="m-row__title">{{ item.label }}</span>
            <span class="m-row__sub">{{ TARGET_LABEL[item.target] }} · {{ relativeTime(item.at) }}<template v-if="item.caption"> · {{ item.caption }}</template></span>
          </span>
        </div>
      </div>
      <div v-else class="m-card m-empty"><span class="m-empty__title">还没有发布记录</span></div>
    </template>
  </main>

  <Teleport to="body">
    <div v-if="selected" class="sheet-backdrop" @click.self="selected = null">
      <section class="sheet">
        <header class="sheet__head">
          <h2>{{ selected.label }}</h2>
          <button type="button" class="m-icon-btn" aria-label="关闭" @click="selected = null"><X :size="20" /></button>
        </header>
        <div class="preview"><CloudVideo :file-id="selected.outputFileId" controls autoplay /></div>
        <label class="m-field">
          <span class="m-field__label">描述（可选，会复制到剪贴板）</span>
          <textarea v-model="caption" class="m-textarea caption" maxlength="2200" placeholder="写一句视频描述和话题标签" />
        </label>
        <div v-if="captions.length" class="chips">
          <button v-for="text in captions" :key="text" type="button" class="m-chip" @click="caption = text">{{ text.slice(0, 18) }}{{ text.length > 18 ? '…' : '' }}</button>
        </div>
        <div class="actions">
          <button type="button" class="m-btn m-btn--primary" :disabled="Boolean(busy)" @click="act('tiktok')">
            <LoaderCircle v-if="busy === 'tiktok'" :size="16" class="m-spin" /><Send v-else :size="16" /> TikTok{{ targets.tiktok ? '' : '（未安装）' }}
          </button>
          <button type="button" class="m-btn" :disabled="Boolean(busy)" @click="act('douyin')">
            <LoaderCircle v-if="busy === 'douyin'" :size="16" class="m-spin" /><Send v-else :size="16" /> 抖音{{ targets.douyin ? '' : '（未安装）' }}
          </button>
          <button type="button" class="m-btn" :disabled="Boolean(busy)" @click="act('any')"><Share2 :size="16" /> 其他应用</button>
          <button type="button" class="m-btn" :disabled="Boolean(busy)" @click="act('gallery')">
            <LoaderCircle v-if="busy === 'gallery'" :size="16" class="m-spin" /><Download v-else :size="16" /> 存到相册
          </button>
        </div>
        <p class="m-muted small">第一次发布会先下载视频，较大的视频需要几秒。没装对应 App 时会打开系统分享。</p>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.intro { margin: 4px 2px 12px; color: var(--theme-text-muted); font-size: 13px; line-height: 1.6; }
.small { font-size: 12px; }
.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 14px; padding: 4px; border-radius: 14px; background: var(--theme-panel); border: 1px solid var(--theme-border); }
.seg button { height: 36px; border: 0; border-radius: 10px; background: none; color: var(--theme-text-muted); font-size: 13px; font-weight: 700; }
.seg button small { font-weight: 600; opacity: .8; }
.seg button.is-active { background: var(--theme-control-hover); color: var(--theme-text); }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.tile { position: relative; aspect-ratio: 9 / 16; overflow: hidden; padding: 0; border: 1px solid var(--theme-border); border-radius: 12px; background: #000; }
.tile__label { position: absolute; left: 6px; right: 6px; bottom: 6px; overflow: hidden; padding: 2px 6px; border-radius: 6px; background: rgba(0, 0, 0, .6); color: #fff; font-size: 10px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.tile__done, .tile__ok { position: absolute; top: 6px; right: 6px; padding: 1px 6px; border-radius: 999px; font-size: 10px; font-weight: 800; }
.tile__done { background: var(--m-accent); color: #04201c; }
.tile__ok { background: rgba(0, 0, 0, .6); color: var(--m-green); }
.sheet-backdrop { position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-end; background: var(--theme-overlay); }
.sheet { width: 100%; max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 12px var(--m-gutter) calc(16px + var(--m-safe-bottom)); border-radius: 22px 22px 0 0; background: var(--theme-panel); }
.sheet__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sheet__head h2 { margin: 0; overflow: hidden; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.preview { align-self: center; width: 46%; aspect-ratio: 9 / 16; overflow: hidden; border-radius: 12px; background: #000; }
.caption { min-height: 72px; }
.chips { display: flex; gap: 8px; overflow-x: auto; margin-top: -4px; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.actions .m-btn { height: 46px; font-size: 14px; padding: 0 8px; }
</style>
