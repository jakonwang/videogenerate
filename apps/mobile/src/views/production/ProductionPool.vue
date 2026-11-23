<script setup lang="ts">
import { isWeb } from '@/lib/platform'
/** 混剪素材池（网页版，对应电脑端 ProductionClipPoolView）。切镜和 AI 识别由电脑端执行，结果同步到这里。 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, Ban, Bot, Camera, Film, FolderInput, Layers, LoaderCircle, Monitor, ScanSearch, Undo2, X } from 'lucide-vue-next'
import type { ClipOrigin, ClipRole } from '@shared/mixPool'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import {
  CLIP_ROLES,
  ORIGIN_LABEL,
  ROLE_LABEL,
  SOURCE_KIND_LABEL,
  SOURCE_STATUS_LABEL,
  editClip,
  effectiveClipRole,
  importToPool,
  useDesktopOnline,
  usePool,
  useProductOptions,
  type WebPoolClip,
} from '@/lib/production'

const route = useRoute()
const router = useRouter()
const products = useProductOptions()
const productId = ref(typeof route.query.productId === 'string' ? route.query.productId : '')
watch(products, (list) => { if (!productId.value && list.length) productId.value = list[0]!.id }, { immediate: true })
const view = usePool(productId)
const { online } = useDesktopOnline()
const stats = computed(() => view.value.stats)

type OriginFilter = 'all' | 'real' | 'ai'
const originFilter = ref<OriginFilter>('all')
const roleFilter = ref<ClipRole | 'all' | 'untagged'>('all')
const sortKey = ref<'hook' | 'quality' | 'time'>('hook')
const showDisabled = ref(false)
const previewClip = ref<WebPoolClip | null>(null)
const uploading = ref(0)
const input = ref<HTMLInputElement>()
const importOrigin = ref<ClipOrigin>('real')

const base = computed(() => view.value.clips.filter((clip) => (showDisabled.value || !clip.disabled) && (originFilter.value === 'all' || clip.origin === originFilter.value)))
const roleCounts = computed(() => {
  const counts = new Map<string, number>([['all', base.value.length]])
  for (const clip of base.value) {
    const role = effectiveClipRole(clip) ?? 'untagged'
    counts.set(role, (counts.get(role) ?? 0) + 1)
  }
  return counts
})
const visibleClips = computed(() => {
  const list = base.value.filter((clip) => roleFilter.value === 'all' || (effectiveClipRole(clip) ?? 'untagged') === roleFilter.value)
  if (sortKey.value === 'hook') return [...list].sort((a, b) => (b.tags?.hookScore ?? -1) - (a.tags?.hookScore ?? -1))
  if (sortKey.value === 'quality') return [...list].sort((a, b) => (b.tags?.quality ?? -1) - (a.tags?.quality ?? -1))
  return [...list].sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.startSec - b.startSec)
})
const sourceById = computed(() => new Map((view.value.pool?.sources ?? []).map((s) => [s.id, s])))
const pendingImports = computed(() => view.value.imports.filter((item) => item.state === 'pending'))

const secs = (n: number) => `${n.toFixed(1)}s`
const scoreTone = (n: number) => (n >= 70 ? 'green' : n >= 45 ? 'amber' : 'red')
const roleLabel = (role: ClipRole | null) => (role ? ROLE_LABEL[role] : '未识别')

async function setRole(clip: WebPoolClip, value: string) {
  await editClip(productId.value, clip.id, { roleOverride: (value || null) as ClipRole | null, disabled: Boolean(clip.disabled) })
  toast(online.value ? '已修改，电脑端同步后生效' : '已修改，电脑端打开后同步')
}
async function toggleDisabled(clip: WebPoolClip) {
  await editClip(productId.value, clip.id, { roleOverride: clip.roleOverride ?? null, disabled: !clip.disabled })
}

function pickFiles(origin: ClipOrigin) {
  importOrigin.value = origin
  input.value?.click()
}
async function onFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || [])
  ;(event.target as HTMLInputElement).value = ''
  for (const file of files) {
    uploading.value += 1
    try {
      await importToPool(productId.value, file, importOrigin.value)
    } catch (error) {
      toast(`上传失败：${errorMessage(error)}`)
    } finally {
      uploading.value -= 1
    }
  }
  if (files.length) toast(`已上传 ${files.length} 个视频，电脑端会切镜并识别`)
}
</script>

<template>
  <PageHeader title="混剪素材池" :back="isWeb ? undefined : '/production'" description="把商品的实拍素材和 AI 生成视频切成单个镜头，由 AI 标注镜头作用、钩子分和画质，供混剪按脚本选片。">
    <template #actions>
      <select v-model="productId" class="vg-select pool__product" aria-label="选择商品">
        <option v-if="!products.length" value="">还没有商品</option>
        <option v-for="item in products" :key="item.id" :value="item.id">{{ item.name }}</option>
      </select>
    </template>
  </PageHeader>
  <main class="vg-page pool" data-testid="web-pool">
    <section class="vg-card pool__actions">
      <div class="vg-toolbar">
        <button class="vg-btn" type="button" :disabled="!productId || uploading > 0" @click="pickFiles('real')"><Camera :size="15" /> 导入实拍视频</button>
        <button class="vg-btn" type="button" :disabled="!productId || uploading > 0" @click="pickFiles('ai')"><Bot :size="15" /> 导入 AI 视频</button>
        <span v-if="uploading" class="vg-muted pool__uploading"><LoaderCircle :size="14" class="vg-spin" /> 上传中…</span>
        <span class="vg-toolbar__spacer" />
        <span class="vg-pill vg-pill--dot" :class="online ? 'vg-pill--green' : 'vg-pill--amber'"><Monitor :size="12" /> {{ online ? '电脑端在线' : '电脑端不在线' }}</span>
        <span v-if="view.pool?.busy" class="vg-pill vg-pill--blue"><LoaderCircle :size="12" class="vg-spin" /> 电脑正在切镜识别</span>
      </div>
      <input ref="input" type="file" accept="video/*" multiple hidden @change="onFiles" />
      <p class="vg-muted pool__hint">切镜和 AI 识别在电脑端执行：电脑上「同步商品素材」拉取的商品视频和复刻成片会出现在这里；网页导入的视频会在电脑端下次同步时切镜识别。实拍镜头在混剪中优先使用，转化通常比纯 AI 画面更好。</p>
      <div v-if="pendingImports.length" class="vg-notice vg-notice--accent">
        <Monitor :size="14" /> {{ pendingImports.length }} 个视频等电脑端切镜识别：{{ pendingImports.map((i) => i.name).join('、') }}
      </div>
      <div v-for="item in view.imports.filter((i) => i.state === 'failed').slice(0, 3)" :key="item.id" class="vg-notice vg-notice--danger">{{ item.name }}：{{ item.error }}</div>
    </section>

    <section class="vg-stats">
      <div class="vg-stat"><span class="vg-stat__icon"><Film :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">可用镜头</span><span class="vg-stat__value">{{ stats.clipCount }}</span></span></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--blue"><ScanSearch :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">已识别</span><span class="vg-stat__value">{{ stats.taggedCount }}</span></span></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--amber"><Camera :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">实拍 / AI</span><span class="vg-stat__value">{{ stats.realCount }} / {{ stats.aiCount }}</span></span></div>
      <div class="vg-stat"><span class="vg-stat__icon vg-stat__icon--violet"><Layers :size="17" /></span><span class="vg-stat__body"><span class="vg-stat__label">源视频</span><span class="vg-stat__value">{{ stats.sourceCount }}</span></span></div>
    </section>

    <div v-if="stats.mismatchCount" class="vg-notice vg-notice--danger pool__gap">
      <AlertTriangle :size="16" />
      <span>{{ stats.mismatchCount }} 个镜头被 AI 判断为「不是这款商品」，已从混剪中排除。请检查这些素材是否放错了商品，或在商品详情里更新商品描述。</span>
    </div>
    <div v-if="stats.missingRoles.length" class="vg-notice vg-notice--warning pool__gap">
      <AlertTriangle :size="16" />
      <span><strong>镜头缺口：</strong>{{ stats.missingRoles.map((r) => ROLE_LABEL[r]).join('、') }} — 混剪一条完整带货视频需要这些镜头，建议补拍或导入。</span>
    </div>

    <section class="vg-card">
      <div class="vg-card__head">
        <span class="vg-card__title"><Film :size="16" /> 镜头</span>
        <div class="vg-row">
          <div class="vg-seg vg-seg--sm">
            <button v-for="o in (['all', 'real', 'ai'] as OriginFilter[])" :key="o" class="vg-seg__btn" :class="{ 'is-active': originFilter === o }" type="button" @click="originFilter = o">{{ o === 'all' ? '全部' : ORIGIN_LABEL[o] }}</button>
          </div>
          <select v-model="sortKey" class="vg-select vg-select--sm" aria-label="排序">
            <option value="hook">按钩子分</option>
            <option value="quality">按画质</option>
            <option value="time">按时间</option>
          </select>
          <label class="vg-row pool__check"><input v-model="showDisabled" type="checkbox" /> 显示已停用</label>
        </div>
      </div>

      <div class="vg-seg vg-seg--sm pool__roles">
        <button class="vg-seg__btn" :class="{ 'is-active': roleFilter === 'all' }" type="button" @click="roleFilter = 'all'">全部 <span class="vg-count">{{ roleCounts.get('all') ?? 0 }}</span></button>
        <button v-for="r in CLIP_ROLES" :key="r" class="vg-seg__btn" :class="{ 'is-active': roleFilter === r, 'is-missing': stats.missingRoles.includes(r) }" type="button" @click="roleFilter = r">
          {{ ROLE_LABEL[r] }} <span class="vg-count">{{ roleCounts.get(r) ?? 0 }}</span>
        </button>
        <button v-if="roleCounts.get('untagged')" class="vg-seg__btn" :class="{ 'is-active': roleFilter === 'untagged' }" type="button" @click="roleFilter = 'untagged'">未识别 <span class="vg-count">{{ roleCounts.get('untagged') }}</span></button>
      </div>

      <div v-if="visibleClips.length" class="pool__grid">
        <article v-for="clip in visibleClips" :key="clip.id" class="pool-clip" :class="{ 'is-disabled': clip.disabled }">
          <button class="vg-media pool-clip__media" type="button" title="预览镜头" @click="previewClip = clip">
            <CloudImage :file-id="clip.thumbFileId" />
            <span class="vg-media__badge vg-row pool-clip__badges">
              <span class="vg-pill vg-pill--solid" :class="clip.origin === 'ai' ? 'vg-pill--solid-blue' : clip.origin === 'real' ? '' : 'vg-pill--solid-amber'">{{ ORIGIN_LABEL[clip.origin] }}</span>
            </span>
            <span class="pool-clip__dur vg-num">{{ secs(clip.durationSec) }}</span>
          </button>
          <div class="pool-clip__body">
            <div class="vg-row pool-clip__head">
              <span class="vg-pill vg-pill--accent">{{ roleLabel(effectiveClipRole(clip)) }}</span>
              <span v-if="clip.tags?.matchesProduct === false" class="vg-pill vg-pill--solid vg-pill--solid-red" title="AI 判断画面里是另一款商品，不会用于本商品的混剪；手动指定镜头作用后才会使用。">非本商品</span>
              <span v-if="clip.pendingEdit" class="vg-muted pool-clip__tiny">待电脑同步</span>
              <span v-else-if="clip.roleOverride" class="vg-muted pool-clip__tiny">手动</span>
            </div>
            <div v-if="clip.tags" class="vg-row pool-clip__scores">
              <span class="vg-pill vg-pill--dot" :class="`vg-pill--${scoreTone(clip.tags.hookScore)}`">钩子 {{ clip.tags.hookScore }}</span>
              <span class="vg-pill vg-pill--dot" :class="`vg-pill--${scoreTone(clip.tags.quality)}`">画质 {{ clip.tags.quality }}</span>
            </div>
            <p v-if="clip.tags?.description" class="pool-clip__desc">{{ clip.tags.description }}</p>
            <p v-if="clip.tags?.issues?.length" class="pool-clip__issues">{{ clip.tags.issues.join(' · ') }}</p>
            <p v-if="clip.tagStatus === 'failed'" class="pool-clip__issues">AI 识别失败，已用规则推断</p>
            <div class="vg-row pool-clip__foot">
              <select class="vg-select vg-select--sm" :value="clip.roleOverride ?? ''" aria-label="修改镜头作用" @change="setRole(clip, ($event.target as HTMLSelectElement).value)">
                <option value="">自动识别</option>
                <option v-for="r in CLIP_ROLES" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option>
              </select>
              <button class="vg-icon-btn vg-icon-btn--sm" type="button" :title="clip.disabled ? '恢复该镜头' : '停用该镜头'" @click="toggleDisabled(clip)">
                <Undo2 v-if="clip.disabled" :size="14" /><Ban v-else :size="14" />
              </button>
            </div>
          </div>
        </article>
      </div>
      <div v-else class="vg-empty">
        <span class="vg-empty__icon"><Film :size="24" /></span>
        <p>{{ view.clips.length ? '当前筛选下没有镜头。' : '素材池为空。在电脑端「同步商品素材」，或在这里导入视频。' }}</p>
      </div>
    </section>

    <section class="vg-card">
      <div class="vg-card__head"><span class="vg-card__title"><FolderInput :size="16" /> 源视频</span></div>
      <div v-if="view.pool?.sources.length" class="vg-table-wrap">
        <table class="vg-table vg-table--compact">
          <thead><tr><th>文件</th><th>来源</th><th>类型</th><th>状态</th><th>镜头数</th><th>云端副本</th></tr></thead>
          <tbody>
            <tr v-for="s in view.pool.sources" :key="s.id">
              <td class="pool__file"><span class="vg-ellipsis">{{ s.fileName }}</span><small v-if="s.durationSec" class="vg-muted vg-num">{{ secs(s.durationSec) }}</small></td>
              <td>{{ SOURCE_KIND_LABEL[s.kind] ?? s.kind }}</td>
              <td>{{ ORIGIN_LABEL[s.origin] }}</td>
              <td><span class="vg-pill vg-pill--dot" :class="s.status === 'ready' ? 'vg-pill--green' : s.status === 'failed' ? 'vg-pill--red' : s.status === 'splitting' ? 'vg-pill--blue' : 'vg-pill--amber'" :title="s.error">{{ SOURCE_STATUS_LABEL[s.status] }}</span></td>
              <td class="vg-num">{{ s.clipCount }}</td>
              <td><span class="vg-muted" :title="s.fileId ? '可用于云端简版成片' : '超过 60 MB 没有上传，只能在电脑上成片'">{{ s.fileId ? '有' : '—' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="vg-empty"><span class="vg-empty__icon"><FolderInput :size="24" /></span><p>还没有源视频。</p></div>
    </section>

    <div v-if="previewClip" class="vg-backdrop" @click.self="previewClip = null">
      <div class="vg-dialog pool__dialog" role="dialog" aria-modal="true">
        <div class="vg-dialog__head">
          <span class="vg-dialog__title">{{ roleLabel(effectiveClipRole(previewClip)) }} · {{ secs(previewClip.startSec) }}–{{ secs(previewClip.endSec) }}</span>
          <button class="vg-icon-btn" type="button" aria-label="关闭" @click="previewClip = null"><X :size="16" /></button>
        </div>
        <div class="vg-dialog__body">
          <div class="pool__video">
            <CloudVideo v-if="sourceById.get(previewClip.sourceId)?.fileId" :file-id="sourceById.get(previewClip.sourceId)!.fileId" :start="previewClip.startSec" :end="previewClip.endSec" controls autoplay />
            <CloudImage v-else :file-id="previewClip.thumbFileId" />
          </div>
          <p v-if="previewClip.tags?.description">{{ previewClip.tags.description }}</p>
          <p class="vg-muted pool-clip__tiny">{{ sourceById.get(previewClip.sourceId)?.fileName }}</p>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.pool { display: flex; flex-direction: column; gap: 14px; width: min(1408px, 100%); margin: 0 auto; }
.pool__product { min-width: 220px; }
.pool__actions { display: flex; flex-direction: column; gap: 10px; }
.pool__hint { font-size: 12px; margin: 0; }
.pool__uploading { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.pool__gap { display: flex; align-items: center; gap: 8px; }
.pool__roles { margin-bottom: 12px; flex-wrap: wrap; height: auto; }
.pool__roles .vg-seg__btn.is-missing:not(.is-active) { border-color: color-mix(in srgb, var(--vg-amber) 50%, transparent); color: var(--vg-amber); }
.pool__check { font-size: 12px; color: var(--theme-text-muted); gap: 6px; cursor: pointer; }
.pool__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; }
.pool__file { max-width: 280px; }
.pool__file .vg-ellipsis { display: block; }
.pool__dialog { width: min(440px, calc(100vw - 32px)); }
.pool__video { width: 100%; aspect-ratio: 9 / 16; max-height: 62vh; border-radius: var(--vg-radius-sm); overflow: hidden; background: #000; margin-bottom: 10px; }
.pool__video :deep(img) { width: 100%; height: 100%; object-fit: contain; }
.pool__video :deep(video) { object-fit: contain; }
.pool-clip { display: flex; flex-direction: column; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); overflow: hidden; min-width: 0; }
.pool-clip.is-disabled { opacity: 0.45; }
.pool-clip__media { --vg-media-ratio: 9 / 16; border: 0; border-radius: 0; padding: 0; cursor: pointer; }
.pool-clip__media :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.pool-clip__badges { gap: 4px; }
.pool-clip__dur { position: absolute; right: 6px; bottom: 6px; padding: 1px 6px; border-radius: 6px; font-size: 11px; background: rgb(0 0 0 / 0.62); color: #fff; }
.pool-clip__body { display: flex; flex-direction: column; gap: 6px; padding: 8px; flex: 1; }
.pool-clip__head { gap: 6px; }
.pool-clip__scores { gap: 4px; }
.pool-clip__scores .vg-pill { font-size: 11px; }
.pool-clip__tiny { font-size: 11px; }
.pool-clip__desc { margin: 0; font-size: 12px; line-height: 1.45; color: var(--theme-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pool-clip__issues { margin: 0; font-size: 11px; color: var(--vg-amber); }
.pool-clip__foot { margin-top: auto; gap: 4px; flex-wrap: nowrap; }
.pool-clip__foot .vg-select { flex: 1; min-width: 0; }
</style>
