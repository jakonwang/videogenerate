<script setup lang="ts">
/**
 * 模板库（网页版，按电脑端「模板库」布局：左模板列表 / 中编辑 / 右使用与电脑端设置）。
 * 和电脑端同一份数据：网页改的时长、镜头、标题、音乐、画面会同步到电脑；配音、转场等电脑端设置保留不动。
 */
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowDown, ArrowRight, ArrowUp, Film, LayoutTemplate, ListChecks, LoaderCircle, Monitor, Music, Package, Plus, Save, Sparkles, Trash2 } from 'lucide-vue-next'
import type { SyncTemplate, SyncTemplateSegment } from '@shared/cloud/sync'
import { DEFAULT_SEGMENT_KEYS, segmentSpan } from '@shared/cloud/templates'
import PageHeader from '@/components/PageHeader.vue'
import { useAssets } from '@/lib/assets'
import { relativeTime } from '@/lib/library'
import { errorMessage } from '@/lib/session'
import { createTemplate, removeTemplate, saveTemplate, textToTitles, titlesToText, useTemplates } from '@/lib/templates'
import { toast } from '@/lib/toast'

const route = useRoute()
const router = useRouter()
const templates = useTemplates()
const { items: libraryAudio } = useAssets((item) => item.kind === 'audio')

const selectedId = ref<string | null>(typeof route.query.id === 'string' ? route.query.id : null)
const selected = computed(() => templates.value.find((t) => t.id === selectedId.value) ?? templates.value[0] ?? null)
const newName = ref('')
const creating = ref(false)
const saving = ref(false)

type Form = SyncTemplate & { titlesText: string }
const form = ref<Form | null>(null)
const dirty = ref(false)
const activeSeg = ref(0)
const newSegName = ref('')
let applying = false
watch(form, () => { if (!applying) dirty.value = true }, { deep: true, flush: 'sync' })
watch(
  selected,
  (value, previous) => {
    // Keep unsaved edits when only a sync refresh happened; switching templates always loads the new one.
    if (dirty.value && value?.id === previous?.id) return
    applying = true
    form.value = value ? withDefaultSegments({ ...(JSON.parse(JSON.stringify(value)) as SyncTemplate), titlesText: titlesToText(value.titles) }) : null
    activeSeg.value = 0
    applying = false
    dirty.value = false
  },
  { immediate: true },
)

/* ---------- 分镜结构（和电脑端模板的分段设置同一份） ---------- */
function withDefaultSegments(f: Form): Form {
  if (!f.segments?.length) {
    const keys = f.structure?.length ? f.structure : DEFAULT_SEGMENT_KEYS
    f.segments = keys.map((key) => ({ key, min: f.pieceSec.min, max: f.pieceSec.max, zoomMin: 1, zoomMax: 1.06 }))
  }
  return f
}
const segs = computed<SyncTemplateSegment[]>(() => form.value?.segments ?? [])
const currentSeg = computed(() => segs.value[activeSeg.value] ?? null)
/** 段改了之后：结构顺序、「每个镜头」跨度跟着变（云端混剪按跨度切镜头） */
function syncSegments() {
  if (!form.value?.segments?.length) return
  form.value.structure = form.value.segments.map((seg) => seg.key)
  const span = segmentSpan(form.value.segments)
  form.value.pieceSec = { min: span.min, max: span.max }
}
function addSegment() {
  if (!form.value) return
  const key = newSegName.value.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 24)
  if (!key) return
  if (segs.value.some((seg) => seg.key === key)) return toast('已经有这个分段了')
  if (segs.value.length >= 12) return toast('最多 12 段')
  const last = segs.value[segs.value.length - 1]
  form.value.segments = [...segs.value, { key, min: last?.min ?? 2, max: last?.max ?? 4, zoomMin: last?.zoomMin ?? 1, zoomMax: last?.zoomMax ?? 1.06 }]
  newSegName.value = ''
  activeSeg.value = form.value.segments.length - 1
  syncSegments()
}
function moveSeg(index: number, delta: -1 | 1) {
  if (!form.value?.segments) return
  const target = index + delta
  if (target < 0 || target >= form.value.segments.length) return
  const list = [...form.value.segments]
  ;[list[index], list[target]] = [list[target], list[index]]
  form.value.segments = list
  if (activeSeg.value === index) activeSeg.value = target
  syncSegments()
}
function removeSeg(index: number) {
  if (!form.value?.segments || form.value.segments.length <= 1) return toast('至少保留一段')
  form.value.segments = form.value.segments.filter((_, i) => i !== index)
  activeSeg.value = Math.min(activeSeg.value, form.value.segments.length - 1)
  syncSegments()
}
/** 「每个镜头」统一改：套到所有段 */
function applyPieceToAll() {
  if (!form.value?.segments) return
  const { min, max } = form.value.pieceSec
  form.value.segments = form.value.segments.map((seg) => ({ ...seg, min: Math.min(min, max), max: Math.max(min, max) }))
  syncSegments()
}
/* 预设：和电脑端「自然带货 / 快节奏转化 / 质感叙事」同一组参数（转场、微扰等在电脑端预设里） */
const PRESETS = [
  { key: 'natural', title: '自然带货', desc: '节奏稳定，适合常规商品展示。', total: { min: 8, max: 13 }, seg: { min: 1.2, max: 2.6 }, zoom: { min: 1, max: 1.05 }, hflip: true, aspect: 'contain_pad' as const, color: { enabled: false, brightness: 0, contrast: 1, saturation: 1 } },
  { key: 'fast', title: '快节奏转化', desc: '切换更快，更强调钩子和转化。', total: { min: 6, max: 10 }, seg: { min: 0.8, max: 1.8 }, zoom: { min: 1.02, max: 1.1 }, hflip: true, aspect: 'cover_crop' as const, color: { enabled: false, brightness: 0, contrast: 1, saturation: 1 } },
  { key: 'cinematic', title: '质感叙事', desc: '镜头更稳，偏真实商业短片。', total: { min: 10, max: 15 }, seg: { min: 1.8, max: 3.6 }, zoom: { min: 1, max: 1.04 }, hflip: false, aspect: 'contain_pad' as const, color: { enabled: true, brightness: -0.03, contrast: 1.05, saturation: 0.96 } },
]
function applyPreset(preset: (typeof PRESETS)[number]) {
  if (!form.value) return
  form.value.durationSec = { ...preset.total }
  form.value.segments = segs.value.map((seg) => ({ ...seg, min: preset.seg.min, max: preset.seg.max, zoomMin: preset.zoom.min, zoomMax: preset.zoom.max }))
  form.value.hflip = preset.hflip
  form.value.aspect = preset.aspect
  form.value.colorGrade = { ...preset.color }
  syncSegments()
  toast(`已套用「${preset.title}」，保存后生效`)
}

const audioName = (fileId: string) => libraryAudio.value.find((item) => item.fileId === fileId)?.name ?? '音乐'
function toggleBgm(fileId: string) {
  if (!form.value) return
  const list = form.value.bgmFileIds
  form.value.bgmFileIds = list.includes(fileId) ? list.filter((id) => id !== fileId) : [...list, fileId]
}

async function create() {
  creating.value = true
  try {
    selectedId.value = await createTemplate(newName.value)
    newName.value = ''
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    creating.value = false
  }
}

async function save() {
  if (!form.value || !selected.value) return
  saving.value = true
  try {
    const { titlesText, ...data } = form.value
    await saveTemplate(selected.value.id, { ...data, titles: textToTitles(titlesText) })
    dirty.value = false
    toast('模板已保存，会同步到电脑端')
  } catch (error) {
    toast(errorMessage(error))
  } finally {
    saving.value = false
  }
}

async function remove(id: string, name: string) {
  if (!window.confirm(`删除模板「${name}」？电脑端的同一个模板也会删除。`)) return
  await removeTemplate(id)
  if (selectedId.value === id) selectedId.value = null
  toast('已删除')
}

function useForMix() {
  if (!selected.value) return
  router.push({ path: '/tools/mix', query: { template: selected.value.id } })
}
</script>

<template>
  <PageHeader title="模板库" :icon="LayoutTemplate" description="混剪的时长、镜头节奏、画面标题和背景音乐存成模板，批量混剪时一键套用；和电脑端模板库同步。">
    <template #actions>
      <button type="button" class="vg-btn" :disabled="!selected" @click="useForMix"><Film :size="14" /> 用这个模板混剪</button>
    </template>
  </PageHeader>
  <main class="vg-page tpl" data-testid="web-templates">
    <nav class="tpl-nav">
      <button type="button" class="tpl-nav__card" @click="router.push('/library?tab=products')"><span class="tpl-nav__icon"><Package :size="16" /></span><span><strong>商品库</strong><small>管理商品与图片</small></span></button>
      <button type="button" class="tpl-nav__card is-active"><span class="tpl-nav__icon"><LayoutTemplate :size="16" /></span><span><strong>模板中心</strong><small>分镜结构与成片参数</small></span></button>
      <button type="button" class="tpl-nav__card" @click="router.push('/tasks')"><span class="tpl-nav__icon"><ListChecks :size="16" /></span><span><strong>任务中心</strong><small>查看混剪与生成进度</small></span></button>
    </nav>
    <div class="tpl-grid">
      <!-- 模板列表 -->
      <aside class="tpl-card tpl-list">
        <div class="tpl-list__head">
          <h2>模板列表</h2>
          <small>{{ templates.length }} 个模板</small>
        </div>
        <form class="tpl-list__new" @submit.prevent="create">
          <input v-model="newName" class="vg-input" maxlength="60" placeholder="新模板名称" />
          <button type="submit" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="creating" title="新建模板"><Plus :size="15" /></button>
        </form>
        <button v-for="tpl in templates" :key="tpl.id" type="button" class="tpl-soft tpl-list__item" :class="{ 'is-active': selected?.id === tpl.id }" @click="selectedId = tpl.id">
          <span class="tpl-list__main">
            <strong>{{ tpl.name }}</strong>
            <small>总时长 {{ tpl.durationSec.min }}–{{ tpl.durationSec.max }} 秒 · {{ relativeTime(tpl.updatedAt) }}</small>
            <span v-if="tpl.desktop" class="tpl-list__tags"><span class="vg-pill vg-pill--violet">电脑端模板</span></span>
          </span>
          <span class="vg-btn vg-btn--danger vg-btn--xs tpl-list__del" role="button" title="删除" @click.stop="remove(tpl.id, tpl.name)"><Trash2 :size="12" /></span>
        </button>
        <div v-if="!templates.length" class="tpl-soft tpl-list__empty">还没有模板。输入名称新建一个，或在电脑端模板库里创建后自动同步过来。</div>
      </aside>

      <!-- 编辑 -->
      <section class="tpl-card tpl-editor">
        <template v-if="form && selected">
          <div class="tpl-editor__head">
            <div>
              <h2>模板编辑</h2>
              <p>{{ selected.name }}</p>
            </div>
            <span v-if="dirty" class="vg-pill vg-pill--amber">未保存</span>
          </div>

          <section class="tpl-soft tpl-section" data-testid="template-structure">
            <h3>分镜结构 <small>点一段编辑它的镜头时长和缩放；云端混剪按所有段的时长跨度切镜头</small></h3>
            <div class="tpl-flow">
              <template v-for="(seg, index) in segs" :key="`${seg.key}-${index}`">
                <button type="button" class="tpl-node" :class="{ 'is-active': activeSeg === index }" @click="activeSeg = index">
                  <strong>{{ seg.key.toUpperCase() }}</strong>
                  <span>{{ seg.min }}–{{ seg.max }} 秒</span>
                </button>
                <span v-if="index < segs.length - 1" class="tpl-flow__arrow">→</span>
              </template>
            </div>
            <div v-if="currentSeg" class="tpl-seg">
              <div class="tpl-seg__head">
                <strong>当前段设置 · {{ currentSeg.key.toUpperCase() }}</strong>
                <span class="tpl-seg__ops">
                  <button type="button" class="vg-btn vg-btn--sm" :disabled="activeSeg === 0" title="上移" @click="moveSeg(activeSeg, -1)"><ArrowUp :size="13" /></button>
                  <button type="button" class="vg-btn vg-btn--sm" :disabled="activeSeg >= segs.length - 1" title="下移" @click="moveSeg(activeSeg, 1)"><ArrowDown :size="13" /></button>
                  <button type="button" class="vg-btn vg-btn--danger vg-btn--sm" :disabled="segs.length <= 1" title="删除这段" @click="removeSeg(activeSeg)"><Trash2 :size="13" /></button>
                </span>
              </div>
              <div class="vg-form-grid tpl-seg__grid">
                <label class="vg-field"><span class="vg-field__label">镜头最短（秒）</span><input v-model.number="currentSeg.min" class="vg-input" type="number" min="0.5" max="8" step="0.1" @change="syncSegments" /></label>
                <label class="vg-field"><span class="vg-field__label">镜头最长（秒）</span><input v-model.number="currentSeg.max" class="vg-input" type="number" min="0.5" max="8" step="0.1" @change="syncSegments" /></label>
                <label class="vg-field"><span class="vg-field__label">缩放最小</span><input v-model.number="currentSeg.zoomMin" class="vg-input" type="number" min="1" max="1.3" step="0.01" /></label>
                <label class="vg-field"><span class="vg-field__label">缩放最大</span><input v-model.number="currentSeg.zoomMax" class="vg-input" type="number" min="1" max="1.3" step="0.01" /></label>
              </div>
            </div>
            <form class="tpl-seg__add" @submit.prevent="addSegment">
              <input v-model="newSegName" class="vg-input" maxlength="24" placeholder="新分段名称，如 proof / cta" />
              <button type="submit" class="vg-btn vg-btn--primary vg-btn--sm" :disabled="!newSegName.trim()"><Plus :size="14" /> 添加分段</button>
            </form>
            <div class="tpl-presets">
              <span class="vg-field__label">预设</span>
              <button v-for="preset in PRESETS" :key="preset.key" type="button" class="tpl-preset" :title="preset.desc" @click="applyPreset(preset)">
                <Sparkles :size="13" /><span><strong>{{ preset.title }}</strong><small>{{ preset.desc }}</small></span>
              </button>
            </div>
          </section>

          <section class="tpl-soft tpl-section">
            <h3>基础信息</h3>
            <label class="vg-field"><span class="vg-field__label">模板名称</span><input v-model="form.name" class="vg-input" maxlength="60" /></label>
          </section>

          <section class="tpl-soft tpl-section">
            <h3>时长与节奏</h3>
            <div class="vg-form-grid">
              <label class="vg-field"><span class="vg-field__label">总时长最短（秒）</span><input v-model.number="form.durationSec.min" class="vg-input" type="number" min="6" max="60" /></label>
              <label class="vg-field"><span class="vg-field__label">总时长最长（秒）</span><input v-model.number="form.durationSec.max" class="vg-input" type="number" min="6" max="60" /></label>
              <label class="vg-field"><span class="vg-field__label">所有段镜头最短（秒）</span><input v-model.number="form.pieceSec.min" class="vg-input" type="number" min="1" max="8" step="0.5" @change="applyPieceToAll" /></label>
              <label class="vg-field"><span class="vg-field__label">所有段镜头最长（秒）</span><input v-model.number="form.pieceSec.max" class="vg-input" type="number" min="1" max="8" step="0.5" @change="applyPieceToAll" /></label>
            </div>
          </section>

          <section class="tpl-soft tpl-section">
            <h3>画面</h3>
            <div class="wt-field">
              <span class="vg-field__label">画幅统一</span>
              <div class="vg-seg vg-seg--sm">
                <button type="button" class="vg-seg__btn" :class="{ 'is-active': form.aspect === 'contain_pad' }" @click="form.aspect = 'contain_pad'">完整展示（加黑边）</button>
                <button type="button" class="vg-seg__btn" :class="{ 'is-active': form.aspect === 'cover_crop' }" @click="form.aspect = 'cover_crop'">充满屏幕（居中裁切）</button>
              </div>
            </div>
            <div class="tpl-switches">
              <label class="vg-switch" :class="{ 'is-on': form.hflip }"><input v-model="form.hflip" type="checkbox" hidden /><span class="vg-switch__track"></span> 随机水平镜像（降低重复）</label>
              <label class="vg-switch" :class="{ 'is-on': form.colorGrade.enabled }"><input v-model="form.colorGrade.enabled" type="checkbox" hidden /><span class="vg-switch__track"></span> 画面调色</label>
            </div>
            <div v-if="form.colorGrade.enabled" class="vg-form-grid vg-form-grid--3">
              <label class="vg-field"><span class="vg-field__label">亮度 {{ form.colorGrade.brightness.toFixed(2) }}</span><input v-model.number="form.colorGrade.brightness" type="range" min="-0.3" max="0.3" step="0.01" /></label>
              <label class="vg-field"><span class="vg-field__label">对比度 {{ form.colorGrade.contrast.toFixed(2) }}</span><input v-model.number="form.colorGrade.contrast" type="range" min="0.5" max="1.5" step="0.01" /></label>
              <label class="vg-field"><span class="vg-field__label">饱和度 {{ form.colorGrade.saturation.toFixed(2) }}</span><input v-model.number="form.colorGrade.saturation" type="range" min="0" max="2" step="0.01" /></label>
            </div>
          </section>

          <section class="tpl-soft tpl-section">
            <h3>画面标题 <small>每条视频随机抽一组；组与组之间空一行，每组首行是标题</small></h3>
            <textarea v-model="form.titlesText" class="vg-textarea" rows="5" placeholder="今日上新&#10;✨ 限时优惠 ✨&#10;&#10;同款不同色&#10;👇 点击下方链接"></textarea>
          </section>

          <section class="tpl-soft tpl-section">
            <h3>背景音乐 <small>每条视频随机挑一首</small></h3>
            <div v-if="form.bgmFileIds.length" class="tpl-chips">
              <span v-for="fileId in form.bgmFileIds" :key="fileId" class="vg-pill vg-pill--accent"><Music :size="12" /> {{ audioName(fileId) }}</span>
            </div>
            <div v-if="libraryAudio.length" class="vg-seg vg-seg--sm tpl-audio">
              <button v-for="item in libraryAudio.slice(0, 20)" :key="item.id" type="button" class="vg-seg__btn" :class="{ 'is-active': form.bgmFileIds.includes(item.fileId) }" @click="toggleBgm(item.fileId)">{{ item.name }}</button>
            </div>
            <p v-else class="vg-muted tpl-hint">素材库里还没有音乐。先在「素材库」上传音频，再回来选择。</p>
            <label class="vg-field"><span class="vg-field__label">音乐音量 {{ Math.round(form.bgmVolume * 100) }}%</span><input v-model.number="form.bgmVolume" type="range" min="0" max="1" step="0.05" /></label>
          </section>

          <div class="tpl-editor__foot">
            <button type="button" class="vg-btn vg-btn--primary" data-testid="template-save" :disabled="saving || !dirty" @click="save">
              <LoaderCircle v-if="saving" :size="14" class="vg-spin" /><Save v-else :size="14" /> 保存模板
            </button>
          </div>
        </template>
        <div v-else class="vg-empty tpl-empty">
          <span class="vg-empty__icon"><LayoutTemplate :size="20" /></span>
          <h3>选择或新建一个模板</h3>
          <p>在左侧输入名称新建模板</p>
        </div>
      </section>

      <!-- 使用与电脑端设置 -->
      <aside class="tpl-side">
        <section class="tpl-card tpl-section">
          <h3>使用模板</h3>
          <p class="vg-muted tpl-hint">在批量混剪里选这个模板，时长、镜头节奏、标题、音乐和画面都会自动套用。</p>
          <button type="button" class="vg-btn vg-btn--primary vg-btn--block" :disabled="!selected" @click="useForMix">去批量混剪 <ArrowRight :size="14" /></button>
        </section>
        <section v-if="selected" class="tpl-card tpl-section">
          <h3><Monitor :size="14" /> 电脑端设置</h3>
          <template v-if="selected.desktopOnly?.length">
            <div class="tpl-chips"><span v-for="name in selected.desktopOnly" :key="name" class="vg-pill">{{ name }}</span></div>
            <p class="vg-muted tpl-hint">这些设置在电脑端成片时生效，网页云端混剪不执行；在网页上保存不会改动它们。</p>
          </template>
          <p v-else class="vg-muted tpl-hint">{{ selected.desktop ? '这个模板没有只在电脑端生效的设置。' : '网页新建的模板，电脑端同步后可以继续加配音、转场等设置。' }}</p>
        </section>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.tpl-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.tpl-nav__card { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel); color: var(--theme-text); text-align: left; cursor: pointer; }
.tpl-nav__card.is-active { border-color: var(--vg-accent); box-shadow: 0 0 0 1px var(--vg-accent) inset; }
.tpl-nav__card > span:last-child { display: flex; flex-direction: column; gap: 2px; }
.tpl-nav__card strong { font-size: 14px; }
.tpl-nav__card small { color: var(--theme-text-muted); font-size: 12px; }
.tpl-nav__icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--vg-accent-soft); color: var(--vg-accent); }
button.tpl-node { border: 1px solid var(--theme-border); cursor: pointer; font: inherit; color: inherit; }
button.tpl-node.is-active { border-color: var(--vg-accent); box-shadow: 0 0 0 1px var(--vg-accent) inset; }
.tpl-seg { margin-top: 10px; padding: 12px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel); }
.tpl-seg__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; font-size: 13px; }
.tpl-seg__ops { display: flex; gap: 6px; }
.tpl-seg__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.tpl-seg__add { display: flex; gap: 8px; margin-top: 10px; }
.tpl-presets { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
.tpl-preset { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--theme-border); border-radius: 10px; background: var(--theme-panel); color: var(--theme-text); text-align: left; cursor: pointer; }
.tpl-preset:hover { border-color: var(--vg-accent); }
.tpl-preset svg { color: var(--vg-accent); flex-shrink: 0; }
.tpl-preset > span { display: flex; flex-direction: column; }
.tpl-preset strong { font-size: 13px; }
.tpl-preset small { color: var(--theme-text-muted); font-size: 11.5px; }
@media (max-width: 1100px) { .tpl-seg__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tpl-nav { grid-template-columns: minmax(0, 1fr); } }
/* Same structure as the desktop TemplatesView: 280px list | editor | 320px side. */
.tpl-grid { display: grid; grid-template-columns: 280px minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
@media (max-width: 767px) { .tpl-grid { grid-template-columns: minmax(0, 1fr); } .tpl-side { grid-template-columns: minmax(0, 1fr) !important; } }
@media (max-width: 1280px) and (min-width: 768px) { .tpl-grid { grid-template-columns: 240px minmax(0, 1fr); } .tpl-side { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; } }
.tpl-card { padding: 16px; border: 1px solid var(--theme-border); border-radius: 14px; background: var(--theme-panel); }
.tpl-soft { border: 1px solid var(--theme-border); border-radius: 12px; background: var(--theme-panel-soft); }
.tpl-list { display: flex; flex-direction: column; gap: 10px; }
.tpl-list__head h2 { font-size: 16px; font-weight: 800; }
.tpl-list__head small { font-size: 12px; color: var(--theme-text-muted); }
.tpl-list__new { display: flex; gap: 8px; }
.tpl-list__new .vg-input { flex: 1; min-width: 0; }
.tpl-list__item { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; color: var(--theme-text); text-align: left; cursor: pointer; }
.tpl-list__item:hover { border-color: var(--theme-border-strong, var(--theme-border)); }
.tpl-list__item.is-active { border-color: var(--vg-accent); background: var(--vg-accent-soft); }
.tpl-list__main { display: flex; flex: 1; flex-direction: column; gap: 3px; min-width: 0; }
.tpl-list__main strong { overflow: hidden; font-size: 13.5px; text-overflow: ellipsis; white-space: nowrap; }
.tpl-list__main small { font-size: 11.5px; color: var(--theme-text-muted); }
.tpl-list__tags { display: flex; gap: 4px; margin-top: 4px; }
.tpl-list__del { opacity: 0; }
.tpl-list__item:hover .tpl-list__del { opacity: 1; }
.tpl-list__empty { padding: 16px; font-size: 13px; color: var(--theme-text-muted); }
.tpl-editor { display: flex; flex-direction: column; gap: 14px; min-width: 0; padding: 20px; }
.tpl-editor__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tpl-editor__head h2 { font-size: 16px; font-weight: 800; }
.tpl-editor__head p { font-size: 12px; color: var(--theme-text-muted); }
.tpl-flow { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.tpl-node { display: flex; flex-direction: column; gap: 2px; min-width: 96px; padding: 10px 12px; border: 1px solid var(--vg-accent-line); border-radius: 10px; background: var(--vg-accent-soft); }
.tpl-node strong { font-size: 13px; }
.tpl-node span { font-size: 11.5px; color: var(--theme-text-muted); }
.tpl-flow__arrow { color: var(--theme-text-muted); }
.tpl-section { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; }
.tpl-section h3 { display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 800; }
.tpl-section h3 small { font-size: 11.5px; font-weight: 500; color: var(--theme-text-muted); }
.tpl-switches { display: flex; flex-wrap: wrap; gap: 20px; }
.tpl-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tpl-audio { flex-wrap: wrap; height: auto; }
.tpl-hint { font-size: 12px; line-height: 1.6; }
.tpl-editor__foot { display: flex; justify-content: flex-end; }
.tpl-side { display: flex; flex-direction: column; gap: 14px; }
.tpl-empty { padding: 60px 16px; }
input[type='range'] { width: 100%; accent-color: var(--vg-accent); }
</style>
