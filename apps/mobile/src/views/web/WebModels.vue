<script setup lang="ts">
/** 模特库 for the web version — same layout as the desktop ModelLibrary: kicker + title, stat cards, toolbar, grid. */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { AlertTriangle, CheckCircle2, Download, LayoutGrid, List, Loader2, Plus, Search, Sparkles, UserRound, Users } from 'lucide-vue-next'
import { SYNC_COLLECTIONS, type SyncModel } from '@shared/cloud/sync'
import { uploadImage } from '@/lib/files'
import { newId, saveRecord } from '@/lib/sync'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'
import CloudImage from '@/components/CloudImage.vue'
import { useGenerations } from '@/lib/generate'
import { coverOf, relativeTime, useModels, type ModelItem } from '@/lib/library'

const router = useRouter()
const { items: models } = useModels()
const modelJobs = useGenerations((item) => item.purpose === 'model')
const query = ref('')
const view = ref<'grid' | 'list'>('grid')

function stateOf(model: ModelItem): 'ready' | 'running' | 'failed' | 'empty' {
  const jobs = modelJobs.value.filter((job) => job.modelId === model.id)
  if (jobs.some((job) => job.status === 'queued' || job.status === 'running')) return 'running'
  if ((model.images || []).length) return 'ready'
  if (jobs.some((job) => job.status === 'failed')) return 'failed'
  return 'empty'
}
const STATE_LABEL = { ready: '已就绪', running: '生成中', failed: '生成失败', empty: '待生成形象' }

const stats = computed(() => ({
  total: models.value.length,
  ready: models.value.filter((m) => stateOf(m) === 'ready').length,
  running: models.value.filter((m) => stateOf(m) === 'running').length,
  failed: models.value.filter((m) => stateOf(m) === 'failed').length,
}))
const shown = computed(() => {
  const word = query.value.trim().toLowerCase()
  return models.value.filter((m) => !word || `${m.name} ${m.style || ''} ${m.description || ''} ${(m.tags || []).join(' ')}`.toLowerCase().includes(word))
})
/* 导入模特：每张照片直接成为一个已就绪的模特（文件名作名字） */
const importInput = ref<HTMLInputElement>()
const importing = ref(0)
async function importModels(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files ?? [])
  ;(event.target as HTMLInputElement).value = ''
  if (!files.length) return
  importing.value = files.length
  let done = 0
  for (const file of files) {
    try {
      const image = await uploadImage(file)
      const data: SyncModel = { name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || '导入模特', images: [image], coverFileId: image.fileId, tags: ['导入'], createdAt: Date.now() }
      await saveRecord(SYNC_COLLECTIONS.models, newId('model'), data)
      done += 1
    } catch (error) {
      toast(`${file.name}：${errorMessage(error)}`)
    }
    importing.value -= 1
  }
  if (done) toast(`已导入 ${done} 个模特`)
}
const tagsOf = (m: ModelItem) => [m.gender, m.ageRange, m.style, ...(m.tags || [])].filter(Boolean).slice(0, 4) as string[]
</script>

<template>
  <main class="vg-page ml" data-testid="web-models">
    <header class="ml-head">
      <div class="ml-head__text">
        <span class="ml-kicker"><Sparkles :size="12" /> AI MODEL STUDIO</span>
        <h1>模特库</h1>
        <p>管理 AI 数字模特，筛选形象与场景，并绑定到复刻项目。</p>
      </div>
      <div class="ml-head__actions">
        <button type="button" class="vg-btn" :disabled="importing > 0" data-testid="web-model-import" @click="importInput?.click()"><Loader2 v-if="importing" :size="15" class="vg-spin" /><Download v-else :size="15" /> {{ importing ? `导入中 ${importing}` : '导入模特' }}</button>
        <input ref="importInput" type="file" accept="image/*" multiple hidden @change="importModels" />
        <button type="button" class="vg-btn vg-btn--primary" data-testid="web-model-create" @click="router.push('/library/models/new')"><Plus :size="15" /> 创建模特</button>
      </div>
    </header>

    <div class="ml-stats">
      <div class="ml-stat is-accent"><span class="ml-stat__icon"><Users :size="17" /></span><span><strong>{{ stats.total }}</strong><small>模特总数</small></span></div>
      <div class="ml-stat"><span class="ml-stat__icon is-green"><CheckCircle2 :size="17" /></span><span><strong>{{ stats.ready }}</strong><small>已就绪</small></span></div>
      <div class="ml-stat"><span class="ml-stat__icon is-blue"><Loader2 :size="17" /></span><span><strong>{{ stats.running }}</strong><small>生成中</small></span></div>
      <div class="ml-stat"><span class="ml-stat__icon is-red"><AlertTriangle :size="17" /></span><span><strong>{{ stats.failed }}</strong><small>生成失败</small></span></div>
    </div>

    <div class="ml-bar">
      <label class="vg-search ml-search"><Search :size="14" /><input v-model="query" class="vg-input vg-input--sm" placeholder="搜索模特名称或标签" /></label>
      <span class="vg-muted ml-count">{{ shown.length }} 个模特</span>
      <span class="vg-toolbar__spacer"></span>
      <div class="pl-view ml-view">
        <button type="button" :class="{ 'is-active': view === 'grid' }" title="网格" @click="view = 'grid'"><LayoutGrid :size="15" /></button>
        <button type="button" :class="{ 'is-active': view === 'list' }" title="列表" @click="view = 'list'"><List :size="15" /></button>
      </div>
    </div>

    <div v-if="shown.length" class="ml-grid" :class="{ 'ml-grid--list': view === 'list' }">
      <button v-for="model in shown" :key="model.id" type="button" class="ml-card" @click="router.push(`/library/models/${model.id}`)">
        <span class="ml-card__media">
          <CloudImage v-if="coverOf(model)" :file-id="coverOf(model)" :alt="model.name" />
          <UserRound v-else :size="30" />
          <span class="ml-card__state" :class="`is-${stateOf(model)}`">{{ STATE_LABEL[stateOf(model)] }}</span>
        </span>
        <span class="ml-card__body">
          <strong>{{ model.name || '未命名模特' }}</strong>
          <span class="ml-card__tags"><span v-for="tag in tagsOf(model)" :key="tag" class="vg-chip">{{ tag }}</span></span>
          <small>{{ (model.images || []).length }} 张形象图 · {{ relativeTime(model.updatedAt) }}</small>
        </span>
      </button>
    </div>
    <div v-else class="vg-empty ml-empty">
      <span class="vg-empty__icon"><Sparkles :size="22" /></span>
      <h3>{{ models.length ? '没有符合条件的模特' : '当前筛选条件下没有模特' }}</h3>
      <p>{{ models.length ? '换个关键词试试' : '创建一个模特，AI 会生成统一的人物形象，复刻时保持人物一致。' }}</p>
      <button type="button" class="vg-btn vg-btn--primary" @click="router.push('/library/models/new')"><Sparkles :size="14" /> 创建模特</button>
    </div>
  </main>
</template>

<style scoped>
.ml { width: min(1440px, 100%); margin: 0 auto; gap: 16px; padding-top: 18px; }
.ml-head { display: flex; align-items: flex-end; gap: 16px; }
.ml-head__text { display: flex; flex-direction: column; gap: 4px; }
.ml-kicker { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 800; letter-spacing: .14em; color: var(--vg-accent); }
.ml-head h1 { font-size: 22px; font-weight: 800; }
.ml-head p { font-size: 12.5px; color: var(--theme-text-muted); }
.ml-head__actions { margin-left: auto; display: flex; gap: 8px; }
.ml-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.ml-stat { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); }
.ml-stat.is-accent { border-color: var(--vg-accent-line); background: linear-gradient(180deg, var(--vg-accent-soft), transparent), var(--theme-panel); }
.ml-stat__icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--vg-accent-soft); color: var(--vg-accent); }
.ml-stat__icon.is-green { background: color-mix(in srgb, var(--vg-green) 14%, transparent); color: var(--vg-green); }
.ml-stat__icon.is-blue { background: color-mix(in srgb, var(--vg-blue) 14%, transparent); color: var(--vg-blue); }
.ml-stat__icon.is-red { background: color-mix(in srgb, var(--vg-red) 14%, transparent); color: var(--vg-red); }
.ml-stat > span:last-child { display: flex; flex-direction: column; }
.ml-stat strong { font-size: 20px; font-weight: 800; line-height: 1.2; }
.ml-stat small { font-size: 11.5px; color: var(--theme-text-muted); }
.ml-bar { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid var(--theme-divider); }
.ml-search { flex: 0 1 280px; }
.ml-count { font-size: 12px; }
.ml-view { display: inline-flex; padding: 2px; border-radius: 8px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); }
.ml-view button { width: 28px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: transparent; color: var(--theme-text-muted); cursor: pointer; }
.ml-view button.is-active { background: var(--theme-panel); color: var(--vg-accent); box-shadow: inset 0 0 0 1px var(--theme-border-control); }
.ml-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
.ml-card { display: flex; flex-direction: column; min-width: 0; padding: 0; overflow: hidden; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); color: var(--theme-text); text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.ml-card:hover { border-color: var(--vg-accent-line); box-shadow: var(--theme-shadow-float); }
.ml-card__media { position: relative; display: grid; place-items: center; aspect-ratio: 3 / 4; background: var(--theme-panel-soft); color: var(--theme-text-muted); }
.ml-card__media img { width: 100%; height: 100%; object-fit: cover; }
.ml-card__state { position: absolute; left: 8px; top: 8px; height: 20px; padding: 0 8px; border-radius: 999px; background: rgb(10 12 16 / .62); color: #fff; font-size: 11px; line-height: 20px; }
.ml-card__state.is-ready { color: var(--vg-green); }
.ml-card__state.is-running { color: var(--vg-blue); }
.ml-card__state.is-failed { color: var(--vg-red); }
.ml-card__body { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px 12px; }
.ml-card__body strong { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ml-card__tags { display: flex; flex-wrap: wrap; gap: 4px; min-height: 20px; }
.ml-card__body small { font-size: 11px; color: var(--theme-text-muted); }
.ml-grid--list { grid-template-columns: 1fr; gap: 0; border: 1px solid var(--theme-border); border-radius: var(--vg-radius); background: var(--theme-panel); }
.ml-grid--list .ml-card { flex-direction: row; align-items: center; border: 0; border-radius: 0; background: transparent; }
.ml-grid--list .ml-card + .ml-card { border-top: 1px solid var(--theme-divider); }
.ml-grid--list .ml-card__media { width: 56px; aspect-ratio: 1; margin: 8px 0 8px 12px; border-radius: 8px; overflow: hidden; }
.ml-grid--list .ml-card__state { display: none; }
.ml-grid--list .ml-card__body { flex-direction: row; align-items: center; gap: 16px; flex: 1; }
.ml-grid--list .ml-card__body strong { flex: 0 0 200px; }
.ml-empty { padding: 56px 20px; border: 1px dashed var(--theme-border); border-radius: var(--vg-radius); }
</style>
