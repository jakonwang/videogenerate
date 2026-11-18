<script setup lang="ts">
/**
 * 爆款视频复刻 · 任务列表（网页版，按电脑端 CloneTaskListView）：统计条、分组、搜索 / 排序、列表 / 卡片视图、
 * 步骤进度、批量移动 / 删除 / 导出成片、分页。复刻在云端执行。
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDownUp, ChevronDown, Copy, Download, Folder, Image as ImageIcon, LayoutGrid, List, LoaderCircle, MoreHorizontal, Pencil, Play, Plus, Search, Trash2, Video, X } from 'lucide-vue-next'
import CloudImage from '@/components/CloudImage.vue'
import CloudVideo from '@/components/CloudVideo.vue'
import PageHeader from '@/components/PageHeader.vue'
import { CLONE_STAGE_LABEL, CLONE_STEPS, cloneProgress, cloneStage, createProject, removeProject, saveCloneGroups, updateProjectMeta, useCloneGroups, useCloneProjects, type CloneProjectItem, type CloneStage } from '@/lib/clone'
import { fileBlob } from '@/lib/files'
import { downloadBlob } from '@/lib/platform'
import { errorMessage } from '@/lib/session'
import { toast } from '@/lib/toast'

const router = useRouter()
const projects = useCloneProjects()
const groups = useCloneGroups()

/* ---------------------------------------------------------------- 新建 */
const input = ref<HTMLInputElement>()
const uploading = ref(false)
const locale = ref<'zh-CN' | 'en-US' | 'vi-VN'>('zh-CN')
const createMenu = ref(false)
async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  uploading.value = true
  try {
    router.push(`/clone/${await createProject(file, locale.value)}`)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    uploading.value = false
  }
}
function pickVideo(lang?: typeof locale.value) {
  if (lang) locale.value = lang
  createMenu.value = false
  input.value?.click()
}

/* ---------------------------------------------------------------- 统计 / 筛选 */
type StatKey = 'all' | CloneStage | 'pending'
const stat = ref<StatKey>('all')
const group = ref<string>('__all__')
const query = ref('')
const sort = ref<'newest' | 'oldest'>('newest')
const view = ref<'list' | 'grid'>('list')
const page = ref(1)
const pageSize = ref(10)

const stats = computed(() => {
  const count = (key: StatKey) =>
    key === 'all' ? projects.value.length : key === 'pending' ? projects.value.filter((p) => !p.finalFileId).length : projects.value.filter((p) => cloneStage(p) === key).length
  return [
    { key: 'all' as const, label: '全部任务', hint: '总任务数', dot: 'accent' },
    { key: 'draft' as const, label: '草稿', hint: '待完善任务', dot: 'gray' },
    { key: 'running' as const, label: '进行中', hint: '任务处理中', dot: 'blue' },
    { key: 'done' as const, label: '已完成', hint: '任务已完成', dot: 'green' },
    { key: 'failed' as const, label: '失败任务', hint: '任务失败', dot: 'red' },
    { key: 'pending' as const, label: '等待输出', hint: '尚未生成成片', dot: 'amber' },
  ].map((item) => ({ ...item, count: count(item.key) }))
})

const groupNames = computed(() => [...new Set([...groups.value, ...projects.value.map((p) => p.group).filter((g): g is string => Boolean(g))])])
const groupCount = (name: string) => (name === '__all__' ? projects.value.length : name === '__none__' ? projects.value.filter((p) => !p.group).length : projects.value.filter((p) => p.group === name).length)

const filtered = computed(() => {
  const word = query.value.trim().toLowerCase()
  const list = projects.value.filter((p) => {
    if (stat.value === 'pending' ? p.finalFileId : stat.value !== 'all' && cloneStage(p) !== stat.value) return false
    if (group.value === '__none__' ? p.group : group.value !== '__all__' && p.group !== group.value) return false
    return !word || `${p.name} ${p.productName || ''}`.toLowerCase().includes(word)
  })
  return sort.value === 'newest' ? list : [...list].reverse()
})
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
const paged = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
watch([stat, group, query, pageSize], () => { page.value = 1 })

/* ---------------------------------------------------------------- 分组 */
async function createGroup() {
  const name = window.prompt('新分组名称')?.trim()
  if (!name) return
  await saveCloneGroups([...groupNames.value, name])
  group.value = name
}
async function moveTo(ids: string[], name: string) {
  for (const id of ids) await updateProjectMeta(id, { group: name || undefined })
  if (name && !groupNames.value.includes(name)) await saveCloneGroups([...groupNames.value, name])
  toast(name ? `已移到「${name}」` : '已移出分组')
}

/* ---------------------------------------------------------------- 选择与批量操作 */
const selected = ref<string[]>([])
const pageAllSelected = computed(() => paged.value.length > 0 && paged.value.every((p) => selected.value.includes(p.id)))
function togglePage() {
  selected.value = pageAllSelected.value ? selected.value.filter((id) => !paged.value.some((p) => p.id === id)) : [...new Set([...selected.value, ...paged.value.map((p) => p.id)])]
}
const exportable = computed(() => projects.value.filter((p) => selected.value.includes(p.id) && p.finalFileId))
const exporting = ref(false)
async function exportFinals(list = exportable.value) {
  if (!list.length) return void toast('所选任务还没有成片')
  exporting.value = true
  try {
    for (const p of list) downloadBlob(await fileBlob(p.finalFileId!), `${p.name || '复刻成片'}.mp4`)
    toast(`已导出 ${list.length} 条成片`)
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    exporting.value = false
  }
}
async function remove(ids: string[]) {
  if (!ids.length || !window.confirm(`删除 ${ids.length} 个复刻任务？删除后不能恢复。`)) return
  for (const id of ids) await removeProject(id)
  selected.value = selected.value.filter((id) => !ids.includes(id))
  toast('已删除')
}
const menuFor = ref('')
async function rename(p: CloneProjectItem) {
  menuFor.value = ''
  const name = window.prompt('任务名称', p.name)?.trim()
  if (name && name !== p.name) await updateProjectMeta(p.id, { name })
}
const moveMenu = ref(false)
const playing = ref<CloneProjectItem | null>(null)
const errorOf = (p: CloneProjectItem) => p.analyzeError || p.composeError || ''
const fmt = (ts: number) => {
  const d = new Date(ts)
  return { time: d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), date: d.toLocaleDateString('zh-CN') }
}
</script>

<template>
  <PageHeader title="爆款视频复刻" :icon="Copy" description="复刻参考视频并生成可管理的项目成片。">
    <template #actions>
      <div class="cl-new">
        <button type="button" class="vg-btn vg-btn--primary" data-testid="web-clone-new" :disabled="uploading" @click="pickVideo()">
          <LoaderCircle v-if="uploading" :size="15" class="vg-spin" /><Plus v-else :size="15" /> {{ uploading ? '正在上传…' : '新建任务' }}
        </button>
        <button type="button" class="vg-btn vg-btn--primary cl-new__more" aria-label="选择脚本语言" @click="createMenu = !createMenu"><ChevronDown :size="15" /></button>
        <div v-if="createMenu" class="cl-menu" @click.stop>
          <span class="cl-menu__title">上传对标视频，脚本语言：</span>
          <button type="button" @click="pickVideo('zh-CN')">中文脚本</button>
          <button type="button" @click="pickVideo('vi-VN')">Tiếng Việt</button>
          <button type="button" @click="pickVideo('en-US')">English</button>
        </div>
      </div>
    </template>
  </PageHeader>
  <main class="vg-page cl" data-testid="web-clone-list" @click="menuFor = ''; moveMenu = false">
    <input ref="input" type="file" accept="video/*" hidden @change="onFile" />
    <section class="cl-stats">
      <button v-for="s in stats" :key="s.key" type="button" class="cl-stat" :class="{ 'is-active': stat === s.key }" @click="stat = s.key">
        <span class="cl-stat__label"><i class="cl-dot" :class="`cl-dot--${s.dot}`"></i>{{ s.label }}</span>
        <strong>{{ s.count }}</strong>
        <small>{{ s.hint }}</small>
      </button>
    </section>

    <section class="vg-card vg-card--flush cl-panel">
      <div class="cl-toolbar">
        <nav class="cl-groups">
          <button type="button" class="cl-group" :class="{ 'is-active': group === '__all__' }" @click="group = '__all__'">全部任务 <span class="vg-count">{{ groupCount('__all__') }}</span></button>
          <button type="button" class="cl-group" :class="{ 'is-active': group === '__none__' }" @click="group = '__none__'">未分组 <span class="vg-count">{{ groupCount('__none__') }}</span></button>
          <button v-for="g in groupNames" :key="g" type="button" class="cl-group" :class="{ 'is-active': group === g }" @click="group = g">{{ g }} <span class="vg-count">{{ groupCount(g) }}</span></button>
          <button type="button" class="cl-group cl-group--add" @click="createGroup"><Plus :size="13" /> 新建分组</button>
        </nav>
        <span class="vg-toolbar__spacer" />
        <label class="vg-search cl-search"><Search :size="14" /><input v-model="query" class="vg-input vg-input--sm" placeholder="搜索任务、商品或参考视频" /></label>
        <button type="button" class="vg-btn vg-btn--sm" @click="sort = sort === 'newest' ? 'oldest' : 'newest'"><ArrowDownUp :size="14" /> {{ sort === 'newest' ? '最新创建' : '最早创建' }}</button>
        <div class="vg-seg vg-seg--sm">
          <button type="button" class="vg-seg__btn" :class="{ 'is-active': view === 'list' }" title="列表视图" @click="view = 'list'"><List :size="14" /></button>
          <button type="button" class="vg-seg__btn" :class="{ 'is-active': view === 'grid' }" title="卡片视图" @click="view = 'grid'"><LayoutGrid :size="14" /></button>
        </div>
      </div>

      <div v-if="selected.length" class="cl-selbar" @click.stop>
        <span>已选 <b>{{ selected.length }}</b> 个任务 · 可导出成片 {{ exportable.length }} 条</span>
        <button type="button" class="vg-btn vg-btn--sm" :disabled="!exportable.length || exporting" @click="exportFinals()"><Download :size="13" /> 导出成片</button>
        <div class="cl-move">
          <button type="button" class="vg-btn vg-btn--sm" @click="moveMenu = !moveMenu"><Folder :size="13" /> 移动到</button>
          <div v-if="moveMenu" class="cl-menu">
            <button type="button" @click="moveTo(selected, ''); moveMenu = false">未分组</button>
            <button v-for="g in groupNames" :key="g" type="button" @click="moveTo(selected, g); moveMenu = false">{{ g }}</button>
          </div>
        </div>
        <button type="button" class="vg-btn vg-btn--sm vg-btn--danger" @click="remove(selected)"><Trash2 :size="13" /> 删除</button>
        <button type="button" class="vg-link" @click="selected = []">清除选择</button>
      </div>

      <template v-if="paged.length">
        <div v-if="view === 'list'" class="vg-table-wrap">
          <table class="vg-table cl-table">
            <thead><tr><th style="width: 40px"><input type="checkbox" :checked="pageAllSelected" aria-label="选择本页" @change="togglePage" /></th><th>任务信息</th><th style="width: 150px">阶段</th><th style="width: 240px">进度</th><th style="width: 130px">素材</th><th style="width: 110px">更新时间</th><th style="width: 90px">操作</th></tr></thead>
            <tbody>
              <tr v-for="p in paged" :key="p.id" class="cl-row" @dblclick="router.push(`/clone/${p.id}`)">
                <td><input v-model="selected" type="checkbox" :value="p.id" /></td>
                <td>
                  <button type="button" class="cl-info" @click="router.push(`/clone/${p.id}`)">
                    <span class="cl-thumb"><CloudImage v-if="p.analysis?.shots[0]?.frameFileId" :file-id="p.analysis?.shots[0]?.frameFileId" /><Video v-else :size="18" /></span>
                    <span class="cl-info__text">
                      <strong>{{ p.name }}</strong>
                      <span class="cl-info__meta"><span class="vg-pill vg-pill--blue">云端运行</span><span class="vg-muted">{{ p.productName || '未选商品' }}</span></span>
                    </span>
                  </button>
                  <p v-if="errorOf(p)" class="cl-err" :title="errorOf(p)">{{ errorOf(p) }}</p>
                </td>
                <td>
                  <span class="vg-pill vg-pill--dot" :class="CLONE_STAGE_LABEL[cloneStage(p)].tone && `vg-pill--${CLONE_STAGE_LABEL[cloneStage(p)].tone}`">{{ CLONE_STAGE_LABEL[cloneStage(p)].label }}</span>
                  <select class="vg-select vg-select--sm cl-group-select" :value="p.group || ''" aria-label="分组" @click.stop @change="moveTo([p.id], ($event.target as HTMLSelectElement).value)">
                    <option value="">未分组</option>
                    <option v-for="g in groupNames" :key="g" :value="g">{{ g }}</option>
                  </select>
                </td>
                <td>
                  <div class="cl-progress">
                    <strong>{{ cloneProgress(p).pct }}%</strong>
                    <small>第 {{ cloneProgress(p).current }}/{{ CLONE_STEPS.length }} 步 · {{ cloneProgress(p).label }}</small>
                  </div>
                  <div class="cl-segs"><i v-for="(ok, i) in cloneProgress(p).done" :key="i" :class="{ 'is-done': ok }"></i></div>
                </td>
                <td class="cl-mats">
                  <span><ImageIcon :size="13" /> {{ cloneProgress(p).frames }}</span><span><Video :size="13" /> {{ cloneProgress(p).videos }}</span>
                  <small :class="p.finalFileId ? 'is-ready' : ''">{{ p.finalFileId ? '成片已生成' : '待生成成片' }}</small>
                </td>
                <td><strong class="cl-time">{{ fmt(p.updatedAt).time }}</strong><small class="vg-muted">{{ fmt(p.updatedAt).date }}</small></td>
                <td class="cl-actions" @click.stop>
                  <button type="button" class="vg-icon-btn vg-icon-btn--sm" :disabled="!p.finalFileId" title="播放成片" @click="playing = p"><Play :size="14" /></button>
                  <div class="cl-more">
                    <button type="button" class="vg-icon-btn vg-icon-btn--sm" title="更多" @click="menuFor = menuFor === p.id ? '' : p.id"><MoreHorizontal :size="14" /></button>
                    <div v-if="menuFor === p.id" class="cl-menu cl-menu--right">
                      <button type="button" @click="router.push(`/clone/${p.id}`)">打开</button>
                      <button type="button" @click="rename(p)"><Pencil :size="13" /> 重命名</button>
                      <button v-if="p.finalFileId" type="button" @click="exportFinals([p]); menuFor = ''"><Download :size="13" /> 导出成片</button>
                      <button type="button" class="danger" @click="remove([p.id]); menuFor = ''"><Trash2 :size="13" /> 删除</button>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="cl-grid">
          <article v-for="p in paged" :key="p.id" class="cl-card" :class="{ 'is-selected': selected.includes(p.id) }">
            <button type="button" class="cl-card__media" @click="router.push(`/clone/${p.id}`)">
              <CloudImage v-if="p.analysis?.shots[0]?.frameFileId" :file-id="p.analysis?.shots[0]?.frameFileId" /><Video v-else :size="26" />
              <span class="vg-pill vg-pill--dot cl-card__stage" :class="CLONE_STAGE_LABEL[cloneStage(p)].tone && `vg-pill--${CLONE_STAGE_LABEL[cloneStage(p)].tone}`">{{ CLONE_STAGE_LABEL[cloneStage(p)].label }}</span>
            </button>
            <label class="cl-card__check" @click.stop><input v-model="selected" type="checkbox" :value="p.id" /></label>
            <div class="cl-card__body">
              <strong>{{ p.name }}</strong>
              <small class="vg-muted">{{ p.productName || '未选商品' }} · {{ p.group || '未分组' }}</small>
              <div class="cl-segs"><i v-for="(ok, i) in cloneProgress(p).done" :key="i" :class="{ 'is-done': ok }"></i></div>
              <small class="vg-muted">{{ cloneProgress(p).pct }}% · 第 {{ cloneProgress(p).current }}/{{ CLONE_STEPS.length }} 步 · {{ cloneProgress(p).label }}</small>
            </div>
          </article>
        </div>
        <footer class="cl-pager">
          <span class="vg-muted">共 {{ filtered.length }} 条，当前显示 {{ (page - 1) * pageSize + 1 }}-{{ Math.min(page * pageSize, filtered.length) }}</span>
          <span class="vg-toolbar__spacer" />
          <button type="button" class="vg-icon-btn vg-icon-btn--sm" :disabled="page <= 1" @click="page--">‹</button>
          <button v-for="n in pages" :key="n" type="button" class="cl-page" :class="{ 'is-active': n === page }" @click="page = n">{{ n }}</button>
          <button type="button" class="vg-icon-btn vg-icon-btn--sm" :disabled="page >= pages" @click="page++">›</button>
          <select v-model.number="pageSize" class="vg-select vg-select--sm"><option :value="10">10 条/页</option><option :value="20">20 条/页</option><option :value="50">50 条/页</option></select>
        </footer>
      </template>
      <div v-else class="vg-empty cl-empty">
        <span class="vg-empty__icon"><Copy :size="22" /></span>
        <h3>{{ projects.length ? '没有符合条件的任务' : '还没有复刻任务' }}</h3>
        <p>{{ projects.length ? '换个筛选条件试试。' : '点「新建任务」上传一条对标视频（3 分钟、200MB 以内），AI 会自动拆解。' }}</p>
        <button v-if="!projects.length" type="button" class="vg-btn vg-btn--primary" :disabled="uploading" @click="pickVideo()"><Plus :size="14" /> 新建任务</button>
      </div>
    </section>

    <div v-if="playing" class="vg-backdrop" @click.self="playing = null">
      <div class="vg-dialog cl-player" role="dialog" aria-modal="true">
        <div class="vg-dialog__head"><span class="vg-dialog__title">{{ playing.name }}</span><button type="button" class="vg-icon-btn" aria-label="关闭" @click="playing = null"><X :size="16" /></button></div>
        <div class="vg-dialog__body"><div class="cl-player__video"><CloudVideo :file-id="playing.finalFileId" controls autoplay /></div></div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.cl { display: flex; flex-direction: column; gap: 14px; width: min(1408px, 100%); margin: 0 auto; }
.cl-new { position: relative; display: inline-flex; }
.cl-new > .vg-btn:first-child { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.cl-new__more { border-top-left-radius: 0; border-bottom-left-radius: 0; border-left: 1px solid rgb(255 255 255 / .25); padding: 0 8px; }
.cl-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 30; display: flex; flex-direction: column; min-width: 170px; padding: 6px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel); box-shadow: var(--theme-shadow-float); }
.cl-menu--right { left: auto; right: 0; }
.cl-new .cl-menu { left: auto; right: 0; }
.cl-menu__title { padding: 6px 8px; font-size: 11.5px; color: var(--theme-text-muted); }
.cl-menu button { display: flex; align-items: center; gap: 6px; padding: 7px 8px; border: 0; border-radius: 7px; background: none; color: var(--theme-text); font-size: 13px; text-align: left; cursor: pointer; }
.cl-menu button:hover { background: var(--theme-panel-soft); }
.cl-menu button.danger { color: var(--vg-red); }
.cl-stats { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); overflow: hidden; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.cl-stat { display: flex; flex-direction: column; gap: 4px; padding: 14px 18px; border: 0; border-left: 1px solid var(--theme-border); border-bottom: 2px solid transparent; background: none; color: var(--theme-text); text-align: left; cursor: pointer; }
.cl-stat:first-child { border-left: 0; }
.cl-stat.is-active { background: var(--theme-panel-soft); border-bottom-color: var(--vg-accent); }
.cl-stat__label { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; }
.cl-stat strong { font-size: 24px; font-weight: 800; line-height: 1.1; }
.cl-stat small { font-size: 11px; color: var(--theme-text-muted); }
.cl-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--vg-accent); }
.cl-dot--gray { background: var(--theme-text-muted); }
.cl-dot--blue { background: var(--vg-blue); }
.cl-dot--green { background: var(--vg-green); }
.cl-dot--red { background: var(--vg-red); }
.cl-dot--amber { background: var(--vg-amber); }
.cl-panel { overflow: visible; }
.cl-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--theme-border); flex-wrap: wrap; }
.cl-groups { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.cl-group { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--theme-text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; }
.cl-group.is-active { color: var(--theme-text); border-bottom-color: var(--vg-accent); }
.cl-group--add { margin-left: 4px; padding: 5px 10px; border: 1px dashed var(--theme-border); border-radius: 8px; }
.cl-search { width: 240px; }
.cl-selbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--theme-border); background: var(--vg-accent-soft); font-size: 12.5px; }
.cl-selbar > span { flex: 1; }
.cl-move, .cl-more { position: relative; }
.cl-table td { vertical-align: middle; }
.cl-row:hover td { background: var(--theme-panel-soft); }
.cl-info { display: flex; align-items: center; gap: 12px; padding: 0; border: 0; background: none; color: var(--theme-text); text-align: left; cursor: pointer; min-width: 0; }
.cl-thumb { display: grid; place-items: center; width: 48px; height: 64px; flex-shrink: 0; overflow: hidden; border-radius: 9px; border: 1px solid var(--theme-border); background: var(--theme-panel-soft); color: var(--theme-text-muted); }
.cl-thumb :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.cl-info__text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.cl-info__text strong { overflow: hidden; font-size: 13.5px; text-overflow: ellipsis; white-space: nowrap; }
.cl-info__meta { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.cl-err { max-width: 360px; margin: 6px 0 0 60px; overflow: hidden; font-size: 11.5px; color: var(--vg-red); text-overflow: ellipsis; white-space: nowrap; }
.cl-group-select { display: block; margin-top: 6px; width: 120px; }
.cl-progress { display: flex; align-items: baseline; gap: 8px; }
.cl-progress strong { font-size: 15px; font-weight: 800; }
.cl-progress small { font-size: 11.5px; color: var(--theme-text-muted); }
.cl-segs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; margin-top: 6px; }
.cl-segs i { height: 4px; border-radius: 2px; background: var(--theme-panel-soft); border: 1px solid var(--theme-border); }
.cl-segs i.is-done { background: var(--vg-accent); border-color: var(--vg-accent); }
.cl-mats { font-size: 12px; }
.cl-mats span { display: inline-flex; align-items: center; gap: 3px; margin-right: 10px; font-weight: 700; }
.cl-mats small { display: block; margin-top: 4px; color: var(--theme-text-muted); }
.cl-mats small.is-ready { color: var(--vg-green); }
.cl-time { display: block; font-size: 13px; }
.cl-actions { display: flex; align-items: center; gap: 4px; }
.cl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; padding: 16px; }
.cl-card { position: relative; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); }
.cl-card.is-selected { border-color: var(--vg-accent); }
.cl-card__media { position: relative; display: grid; place-items: center; aspect-ratio: 3 / 4; padding: 0; border: 0; background: var(--theme-panel-soft); color: var(--theme-text-muted); cursor: pointer; }
.cl-card__media :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.cl-card__stage { position: absolute; left: 8px; bottom: 8px; }
.cl-card__check { position: absolute; top: 8px; left: 8px; }
.cl-card__body { display: flex; flex-direction: column; gap: 5px; padding: 10px 12px; }
.cl-card__body strong { overflow: hidden; font-size: 13.5px; text-overflow: ellipsis; white-space: nowrap; }
.cl-card__body small { font-size: 11.5px; }
.cl-pager { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-top: 1px solid var(--theme-border); font-size: 12.5px; }
.cl-page { min-width: 30px; height: 30px; border: 1px solid var(--theme-border); border-radius: 8px; background: none; color: var(--theme-text); cursor: pointer; }
.cl-page.is-active { background: var(--vg-accent); border-color: var(--vg-accent); color: #fff; }
.cl-pager .vg-select { width: 110px; }
.cl-empty { padding: 56px 16px; }
.cl-player { width: min(420px, calc(100vw - 32px)); }
.cl-player__video { aspect-ratio: 9 / 16; max-height: 70vh; overflow: hidden; border-radius: 10px; background: #000; }
.cl-player__video :deep(video) { object-fit: contain; }
@media (max-width: 1200px) { .cl-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
</style>
