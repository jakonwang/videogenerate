<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { AlertCircle, FileSpreadsheet, FolderPlus, Info, Layers, NotebookPen, Search, Upload, X, XCircle } from 'lucide-vue-next'
import { MARKET_OPTIONS, formatFileSize, pickFile, readKeywordFile, splitKeywords, type SchemeFormValue } from './productResearchUtils'

const props = withDefaults(defineProps<{
  open: boolean
  mode?: 'create' | 'edit'
  initial?: Partial<SchemeFormValue> | null
  busy?: boolean
}>(), { mode: 'create', initial: null, busy: false })

const emit = defineEmits<{ close: []; submit: [value: SchemeFormValue, asDraft: boolean] }>()

const form = reactive({ name: '', need: '', market: 'VN', keywords: '', note: '' })
const errors = reactive<Record<string, string>>({})
const importedFile = ref<{ name: string; size: number; count: number } | null>(null)
const importing = ref(false)
const touched = ref(false)

const keywordList = computed(() => splitKeywords(form.keywords))
const isEdit = computed(() => props.mode === 'edit')

watch(() => props.open, (open) => {
  if (!open) return
  form.name = props.initial?.name || ''
  form.need = props.initial?.need || ''
  form.market = props.initial?.market || 'VN'
  form.keywords = (props.initial?.keywords || []).join('\n')
  form.note = props.initial?.note || ''
  importedFile.value = null
  touched.value = false
  for (const key of Object.keys(errors)) delete errors[key]
}, { immediate: true })

function validate(asDraft: boolean) {
  for (const key of Object.keys(errors)) delete errors[key]
  if (!form.name.trim()) errors.name = '方案名称为必填项'
  if (!asDraft) {
    if (!form.need.trim()) errors.need = '客户需求摘要为必填项'
    else if (form.need.trim().length < 10) errors.need = '客户需求摘要建议不少于 10 个字'
    if (!isEdit.value && keywordList.value.length === 0) errors.keywords = '请至少填写 1 个搜索词'
  }
  if (keywordList.value.length > 200) errors.keywords = '搜索词最多 200 个'
  return Object.keys(errors).length === 0
}

watch(form, () => { if (touched.value) validate(false) })

async function importKeywords() {
  const file = await pickFile('.txt,.csv,.xlsx,.xls')
  if (!file) return
  importing.value = true
  try {
    const values = await readKeywordFile(file)
    const merged = splitKeywords([...keywordList.value, ...values].join('\n'))
    form.keywords = merged.join('\n')
    importedFile.value = { name: file.name, size: file.size, count: values.length }
    if (!values.length) errors.keywords = '文件中未读取到搜索词'
  } catch (error) {
    errors.keywords = `导入失败：${error instanceof Error ? error.message : String(error)}`
  } finally {
    importing.value = false
  }
}

function submit(asDraft: boolean) {
  touched.value = true
  if (!validate(asDraft) || props.busy) return
  emit('submit', {
    name: form.name.trim(),
    need: form.need.trim(),
    market: form.market,
    keywords: keywordList.value,
    note: form.note.trim(),
  }, asDraft)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="vg-scope prd-backdrop" @click.self="emit('close')">
      <div class="prd-dialog prd-dialog--wide" role="dialog" aria-modal="true">
        <div class="prd-dialog__head">
          <div class="prd-dialog__title">
            <span class="prd-dialog__title-icon"><FolderPlus :size="20" /></span>
            <div>
              <h2>{{ isEdit ? '编辑选品方案' : '新建选品方案' }}</h2>
              <p>{{ isEdit ? '修改方案的基础信息，搜索词请在「商品采集」步骤中维护。' : '创建一个新的选品方案，填写需求信息后开始采集与分析。' }}</p>
            </div>
          </div>
          <button class="prd-icon-btn" aria-label="关闭" @click="emit('close')"><X :size="16" /></button>
        </div>

        <div class="prd-dialog__body">
          <section class="sf-section">
            <div class="sf-section__title"><Layers :size="16" />基本信息</div>
            <div class="sf-grid">
              <div class="prd-field">
                <label>方案名称<span class="prd-req">*</span></label>
                <div class="sf-counter-input">
                  <input v-model="form.name" maxlength="50" class="prd-input" :class="{ 'prd-input--error': errors.name }" placeholder="请输入方案名称" />
                  <span>{{ form.name.length }} / 50</span>
                </div>
                <span v-if="errors.name" class="prd-field__error"><AlertCircle :size="13" />{{ errors.name }}</span>
              </div>
              <div class="prd-field">
                <label>目标市场<span class="prd-req">*</span></label>
                <select v-model="form.market" class="prd-select">
                  <option v-for="option in MARKET_OPTIONS" :key="option.value" :value="option.value">{{ option.flag }} {{ option.label }} ({{ option.value }})</option>
                </select>
              </div>
            </div>
            <div class="prd-field">
              <label>客户需求摘要<span class="prd-req">*</span></label>
              <textarea v-model="form.need" maxlength="500" rows="3" class="prd-textarea" :class="{ 'prd-input--error': errors.need }" placeholder="描述目标人群、市场需求、价格区间、选品方向等（建议 10-500 字）" />
              <div class="sf-foot-row">
                <span v-if="errors.need" class="prd-field__error"><AlertCircle :size="13" />{{ errors.need }}</span>
                <span class="prd-field__counter">{{ form.need.length }} / 500</span>
              </div>
            </div>
          </section>

          <section v-if="!isEdit" class="sf-section">
            <div class="sf-section__title"><Search :size="16" />搜索词设置</div>
            <div class="sf-kw">
              <div class="prd-field">
                <label>搜索词<span class="prd-req">*</span></label>
                <textarea v-model="form.keywords" rows="6" class="prd-textarea" :class="{ 'prd-input--error': errors.keywords }" placeholder="请输入客户的搜索词，每行一个&#10;例如：&#10;耳环&#10;耳钉&#10;韩式耳饰" />
                <div class="sf-foot-row">
                  <span v-if="errors.keywords" class="prd-field__error"><AlertCircle :size="13" />{{ errors.keywords }}</span>
                  <span class="prd-field__counter">{{ keywordList.length }} / 200</span>
                </div>
              </div>
              <div class="prd-field">
                <label>或批量导入</label>
                <button class="prd-btn sf-import" :disabled="importing" @click="importKeywords"><Upload :size="15" />{{ importing ? '读取中…' : '导入 TXT / CSV / Excel' }}</button>
                <span class="sf-hint">支持 .txt、.csv、.xlsx 格式，单次不超过 10,000 行，自动去重并追加到左侧列表。</span>
                <div v-if="importedFile" class="sf-file">
                  <FileSpreadsheet :size="22" />
                  <div class="sf-file__meta"><b>{{ importedFile.name }}</b><small>{{ formatFileSize(importedFile.size) }} · 读取 {{ importedFile.count }} 个搜索词</small></div>
                  <button class="prd-icon-btn" title="移除文件记录" @click="importedFile = null"><XCircle :size="15" /></button>
                </div>
              </div>
            </div>
          </section>

          <section class="sf-section">
            <div class="sf-section__title"><NotebookPen :size="16" />备注（选填）</div>
            <div class="prd-field">
              <textarea v-model="form.note" maxlength="200" rows="2" class="prd-textarea" placeholder="可补充供应链、成本、竞品或其他说明信息…" />
              <span class="prd-field__counter">{{ form.note.length }} / 200</span>
            </div>
          </section>
        </div>

        <div class="prd-dialog__foot">
          <span class="prd-dialog__tip"><Info :size="14" /><span><b class="sf-tip">提示：</b>{{ isEdit ? '修改后立即生效，不影响已采集数据。' : '创建后将生成采集任务，按 SOP 流程完成选品、筛选、验证与输出。' }}</span></span>
          <div class="prd-dialog__foot-actions">
            <button class="prd-btn prd-btn--outline" @click="emit('close')">取消</button>
            <button v-if="!isEdit" class="prd-btn prd-btn--outline" :disabled="busy" @click="submit(true)">保存草稿</button>
            <button class="prd-btn prd-btn--primary" :disabled="busy" @click="submit(false)"><FolderPlus :size="15" />{{ isEdit ? '保存修改' : busy ? '创建中…' : '创建方案' }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sf-section { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; border: 1px solid var(--theme-border); border-radius: 10px; background: color-mix(in srgb, var(--theme-panel-soft) 45%, transparent); }
.sf-section__title { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; }
.sf-section__title svg { color: var(--theme-accent); }
.sf-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 14px; }
.sf-counter-input { position: relative; }
.sf-counter-input .prd-input { width: 100%; padding-right: 60px; }
.sf-counter-input span { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); font-size: 11px; color: var(--theme-text-muted); }
.sf-foot-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sf-foot-row .prd-field__counter { margin-left: auto; }
.sf-kw { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr); gap: 14px; }
.sf-import { height: 38px; }
.sf-hint { font-size: 11px; color: var(--theme-text-muted); line-height: 1.5; }
.sf-file { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 9px; border: 1px solid var(--theme-border); background: var(--theme-panel); }
.sf-file > svg { color: #22c55e; flex-shrink: 0; }
.sf-file__meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.sf-file__meta b { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sf-file__meta small { font-size: 11px; color: var(--theme-text-muted); }
.sf-tip { color: var(--theme-accent); font-weight: 600; }
@media (max-width: 720px) { .sf-grid, .sf-kw { grid-template-columns: 1fr; } }
</style>
