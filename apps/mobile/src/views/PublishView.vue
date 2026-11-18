<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Download, LoaderCircle, Send, Share2, X } from 'lucide-vue-next'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useGenerations, type GenerationItem } from '@/lib/generate'
import { relativeTime } from '@/lib/library'
import { installedTargets, publishLabels, saveToGallery, shareTo, useCaptionSuggestions, usePublishRecords } from '@/lib/publish'
import { isWeb } from '@/lib/platform'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import { useInWebShell } from '@/lib/layout'
import WebStep from '@/components/web/WebStep.vue'
import WebResults from '@/components/web/WebResults.vue'
const inWebShell = useInWebShell()

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
const TARGET_LABEL: Record<string, string> = { tiktok: 'TikTok', douyin: '抖音', other: '其他应用', gallery: isWeb ? '下载' : '相册' }

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
  busy.value = kind
  try {
    const input = { fileId: item.outputFileId, label: item.productName ? `${item.productName} · ${item.label}` : item.label, generationId: item.id }
    if (kind === 'gallery') {
      await saveToGallery(input)
      toast(publishLabels.galleryDone)
    } else {
      await shareTo(kind, { ...input, caption: caption.value.trim() || undefined })
      if (isWeb && kind !== 'any') toast(caption.value.trim() ? '视频已下载、描述已复制，在新打开的上传页里选这个视频即可' : '视频已下载，在新打开的上传页里选这个视频即可')
      else if (caption.value.trim()) toast('描述已复制，到发布页粘贴即可')
    }
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <template v-if="inWebShell">
    <PageHeader title="发布中心" description="选一条视频，下载后在 TikTok / 抖音的网页上传页发布，描述会自动复制。不需要授权账号。">
      <template #actions>
        <button type="button" class="vg-btn" @click="router.push('/works')">作品库</button>
      </template>
    </PageHeader>
    <main class="vg-page pb" data-testid="web-publish">
      <div class="tk-bar">
        <nav class="rv-tabs">
          <button type="button" class="rv-tab" :class="{ 'is-active': tab === 'ready' }" @click="tab = 'ready'">待发布 <span class="rv-tab__count">{{ ready.length }}</span></button>
          <button type="button" class="rv-tab" :class="{ 'is-active': tab === 'done' }" @click="tab = 'done'">发布记录 <span class="rv-tab__count">{{ records.length }}</span></button>
        </nav>
      </div>
      <div class="pb-body">
        <section class="pb-main">
          <template v-if="tab === 'ready'">
            <div v-if="ready.length" class="vg-table-wrap">
              <table class="vg-table">
                <thead><tr><th style="width: 72px">视频</th><th>标题 / 来源</th><th style="width: 160px">商品</th><th style="width: 100px">审核</th><th style="width: 90px">状态</th><th style="width: 100px">时间</th></tr></thead>
                <tbody>
                  <tr v-for="item in ready" :key="item.id" class="pb-row" :class="{ 'is-active': selected?.id === item.id }" @click="open(item)">
                    <td><span class="pb-thumb"><CloudVideo :file-id="item.outputFileId" /></span></td>
                    <td class="ls-title">{{ item.label }}</td>
                    <td class="vg-muted">{{ item.productName || '—' }}</td>
                    <td><span class="vg-pill vg-pill--dot" :class="item.review === 'approved' ? 'vg-pill--green' : 'vg-pill--amber'">{{ item.review === 'approved' ? '已通过' : '待审核' }}</span></td>
                    <td><span class="vg-pill" :class="publishedIds.has(item.outputFileId!) ? 'vg-pill--blue' : ''">{{ publishedIds.has(item.outputFileId!) ? '已发布' : '待发布' }}</span></td>
                    <td class="vg-muted">{{ relativeTime(item.createdAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="vg-empty pb-empty">
              <span class="vg-empty__icon"><Send :size="20" /></span>
              <h3>还没有发布任务</h3>
              <p>用复刻、图生视频、批量混剪等生成视频后会出现在这里</p>
              <button type="button" class="vg-btn vg-btn--primary" @click="router.push('/toolbox')">去工具箱</button>
            </div>
          </template>
          <template v-else>
            <div v-if="records.length" class="vg-table-wrap">
              <table class="vg-table">
                <thead><tr><th>内容</th><th style="width: 110px">去向</th><th>描述</th><th style="width: 120px">时间</th></tr></thead>
                <tbody>
                  <tr v-for="item in records" :key="item.id"><td class="ls-title">{{ item.label }}</td><td>{{ TARGET_LABEL[item.target] }}</td><td class="tk-detail">{{ item.caption || '—' }}</td><td class="vg-muted">{{ relativeTime(item.at) }}</td></tr>
                </tbody>
              </table>
            </div>
            <div v-else class="vg-empty pb-empty"><h3>还没有发布记录</h3></div>
          </template>
        </section>

        <aside class="pb-side">
          <h2 class="vg-section-title"><Send :size="16" /> 发布设置</h2>
          <template v-if="selected">
            <div class="pb-preview"><CloudVideo :key="selected.id" :file-id="selected.outputFileId" controls /></div>
            <label class="vg-field">
              <span class="vg-field__label">描述（会复制到剪贴板）</span>
              <textarea v-model="caption" class="vg-textarea" rows="4" maxlength="2200" placeholder="写一句视频描述和话题标签" />
            </label>
            <div v-if="captions.length" class="pb-captions">
              <span class="vg-field__label">上架助手里的标题</span>
              <button v-for="text in captions" :key="text" type="button" class="vg-chip pb-caption" @click="caption = text">{{ text.slice(0, 22) }}{{ text.length > 22 ? '…' : '' }}</button>
            </div>
            <div class="pb-actions">
              <button type="button" class="vg-btn vg-btn--primary" :disabled="Boolean(busy)" @click="act('tiktok')"><LoaderCircle v-if="busy === 'tiktok'" :size="14" class="vg-spin" /><Send v-else :size="14" /> 发到 TikTok</button>
              <button type="button" class="vg-btn" :disabled="Boolean(busy)" @click="act('douyin')"><LoaderCircle v-if="busy === 'douyin'" :size="14" class="vg-spin" /><Send v-else :size="14" /> 发到抖音</button>
              <button type="button" class="vg-btn" :disabled="Boolean(busy)" @click="act('any')"><Share2 :size="14" /> 分享</button>
              <button type="button" class="vg-btn" :disabled="Boolean(busy)" @click="act('gallery')"><Download :size="14" /> 下载</button>
            </div>
            <p class="vg-muted pb-hint">会在新标签页打开上传页并下载视频；如果浏览器拦截了弹出窗口，请允许本站弹出窗口。</p>
          </template>
          <p v-else class="vg-muted pb-hint">在左侧选一条视频，再设置描述并发布。</p>
        </aside>
      </div>
    </main>
  </template>
  <template v-else>
  <PageHeader title="发布中心" back="/create" />
  <main class="m-page m-page--no-tabs">
    <p class="intro">{{ isWeb ? '选一条视频，下载后在 TikTok / 抖音的网页上传页发布。不需要授权账号。' : '选一条视频，直接打开 TikTok / 抖音的发布页，或保存到相册。不需要授权账号。' }}</p>
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
          <button type="button" class="m-btn" :disabled="Boolean(busy)" @click="act('any')"><Share2 :size="16" /> {{ publishLabels.other }}</button>
          <button type="button" class="m-btn" :disabled="Boolean(busy)" @click="act('gallery')">
            <LoaderCircle v-if="busy === 'gallery'" :size="16" class="m-spin" /><Download v-else :size="16" /> {{ publishLabels.gallery }}
          </button>
        </div>
        <p class="m-muted small">{{ isWeb ? '会在新标签页打开上传页并下载视频；如果浏览器拦截了弹出窗口，请允许本站弹出窗口。' : '第一次发布会先下载视频，较大的视频需要几秒。没装对应 App 时会打开系统分享。' }}</p>
      </section>
    </div>
  </Teleport>
  </template>
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
