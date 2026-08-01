<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight, Search, ShieldCheck, TriangleAlert } from 'lucide-vue-next'
import { GMV_MAX_HELP_CHAPTERS, GMV_MAX_HELP_ISSUES, type GmvMaxHelpTargetTab } from './helpCatalog'

type CurrentIssue = {
  code: string
  severity: string
  currentValue?: string
  targetValue?: string
  evidenceSource?: string
}

const props = defineProps<{
  currentIssues: CurrentIssue[]
  currentObject: { product: string; campaign: string; store: string }
  focusIssueCode?: string
}>()

const emit = defineEmits<{ navigate: [tabId: GmvMaxHelpTargetTab] }>()
const { t, te } = useI18n()
const query = ref('')
const selectedId = ref('quick_start')
const article = ref<HTMLElement | null>(null)

const issueMap = new Map(GMV_MAX_HELP_ISSUES.map((item) => [item.code, item]))
const selectedIssue = computed(() => selectedId.value.startsWith('issue:') ? issueMap.get(selectedId.value.slice(6)) : undefined)
const selectedChapter = computed(() => GMV_MAX_HELP_CHAPTERS.find((item) => item.id === selectedId.value))
const selectedCurrentIssue = computed(() => selectedIssue.value ? props.currentIssues.find((item) => item.code === selectedIssue.value?.code) : undefined)

function issueKey(code: string, field: 'title' | 'reason' | 'solution' | 'completion') {
  if (code === 'external_verification_pending') return `gmvMaxOperations.verification.${field}`
  return `gmvMaxIssueResolutions.items.${code}.${field}`
}

function issueText(code: string, field: 'title' | 'reason' | 'solution' | 'completion') {
  const key = issueKey(code, field)
  return te(key) ? t(key) : code
}

function issueAction(actionTarget: string) {
  return t(`gmvMaxIssueResolutions.actions.${actionTarget}`)
}

function select(id: string) {
  selectedId.value = id
  nextTick(() => article.value?.scrollTo({ top: 0 }))
}

const searchResults = computed(() => {
  const value = query.value.trim().toLocaleLowerCase()
  if (!value) return []
  const chapters = GMV_MAX_HELP_CHAPTERS.filter((item) => [
    item.id,
    ...item.keywords,
    t(`gmvMaxHelp.chapters.${item.id}.title`),
    t(`gmvMaxHelp.chapters.${item.id}.summary`),
    t(`gmvMaxHelp.chapters.${item.id}.purpose`),
  ].join(' ').toLocaleLowerCase().includes(value)).map((item) => ({ id: item.id, kind: 'chapter' as const, title: t(`gmvMaxHelp.chapters.${item.id}.title`), summary: t(`gmvMaxHelp.chapters.${item.id}.summary`) }))
  const issues = GMV_MAX_HELP_ISSUES.filter((item) => [item.code, issueText(item.code, 'title'), issueText(item.code, 'reason'), issueText(item.code, 'solution'), ...item.steps.map((step) => t(`gmvMaxIssueResolutions.steps.${step}`))].join(' ').toLocaleLowerCase().includes(value)).map((item) => ({ id: `issue:${item.code}`, kind: 'issue' as const, title: issueText(item.code, 'title'), summary: item.code }))
  return [...chapters, ...issues]
})

const currentIssueItems = computed(() => props.currentIssues.map((item) => ({ ...item, catalog: issueMap.get(item.code) })).filter((item) => item.catalog))

watch(() => props.focusIssueCode, (code) => {
  if (code && issueMap.has(code)) select(`issue:${code}`)
}, { immediate: true })
</script>

<template>
  <section class="help-center" data-testid="gmv-help-center">
    <header class="help-hero">
      <div>
        <span><BookOpen />{{ t('gmvMaxHelp.eyebrow') }}</span>
        <h2>{{ t('gmvMaxHelp.title') }}</h2>
        <p>{{ t('gmvMaxHelp.subtitle') }}</p>
      </div>
      <div class="help-context" data-testid="gmv-help-context">
        <small>{{ t('gmvMaxHelp.currentObject') }}</small>
        <strong>{{ currentObject.product || currentObject.campaign || t('gmvMaxHelp.noObject') }}</strong>
        <span>{{ currentObject.campaign }}<template v-if="currentObject.store"> / {{ currentObject.store }}</template></span>
      </div>
    </header>

    <div class="help-search">
      <Search />
      <input v-model="query" data-testid="gmv-help-search" :placeholder="t('gmvMaxHelp.searchPlaceholder')" />
      <span v-if="query">{{ searchResults.length }} {{ t('gmvMaxHelp.results') }}</span>
    </div>

    <section v-if="currentIssueItems.length" class="help-current" data-testid="gmv-help-current-issues">
      <header><div><TriangleAlert /><span><strong>{{ t('gmvMaxHelp.currentIssues') }}</strong><small>{{ t('gmvMaxHelp.currentIssuesHint') }}</small></span></div><b>{{ currentIssueItems.length }}</b></header>
      <div>
        <button v-for="item in currentIssueItems.slice(0, 4)" :key="item.code" @click="select(`issue:${item.code}`)">
          <span :class="['help-severity', `is-${item.severity}`]"></span>
          <span><strong>{{ issueText(item.code, 'title') }}</strong><small>{{ item.code }}</small></span>
          <ChevronRight />
        </button>
      </div>
    </section>

    <div class="help-layout">
      <aside class="help-directory" :aria-label="t('gmvMaxHelp.directory')">
        <template v-if="query">
          <div class="help-directory__label">{{ t('gmvMaxHelp.searchResults') }}</div>
          <button v-for="item in searchResults" :key="item.id" :class="{ 'is-active': selectedId === item.id }" @click="select(item.id)">
            <span><strong>{{ item.title }}</strong><small>{{ item.summary }}</small></span><ChevronRight />
          </button>
          <div v-if="!searchResults.length" class="help-directory__empty">{{ t('gmvMaxHelp.noResults') }}</div>
        </template>
        <template v-else>
          <div class="help-directory__label">{{ t('gmvMaxHelp.directory') }}</div>
          <button v-for="(item, index) in GMV_MAX_HELP_CHAPTERS" :key="item.id" :class="{ 'is-active': selectedId === item.id }" @click="select(item.id)">
            <b>{{ String(index + 1).padStart(2, '0') }}</b><span><strong>{{ t(`gmvMaxHelp.chapters.${item.id}.title`) }}</strong><small>{{ t(`gmvMaxHelp.chapters.${item.id}.summary`) }}</small></span><ChevronRight />
          </button>
        </template>
      </aside>

      <article ref="article" class="help-article" data-testid="gmv-help-article">
        <template v-if="selectedChapter">
          <div class="help-article__heading"><span>{{ t('gmvMaxHelp.guideLabel') }}</span><h2>{{ t(`gmvMaxHelp.chapters.${selectedChapter.id}.title`) }}</h2><p>{{ t(`gmvMaxHelp.chapters.${selectedChapter.id}.summary`) }}</p></div>
          <dl class="help-facts">
            <div><dt>{{ t('gmvMaxHelp.fields.purpose') }}</dt><dd>{{ t(`gmvMaxHelp.chapters.${selectedChapter.id}.purpose`) }}</dd></div>
            <div><dt>{{ t('gmvMaxHelp.fields.when') }}</dt><dd>{{ t(`gmvMaxHelp.chapters.${selectedChapter.id}.when`) }}</dd></div>
            <div><dt>{{ t('gmvMaxHelp.fields.data') }}</dt><dd>{{ t(`gmvMaxHelp.chapters.${selectedChapter.id}.data`) }}</dd></div>
            <div><dt>{{ t('gmvMaxHelp.fields.logic') }}</dt><dd>{{ t(`gmvMaxHelp.chapters.${selectedChapter.id}.logic`) }}</dd></div>
          </dl>
          <section class="help-steps"><h3>{{ t('gmvMaxHelp.fields.steps') }}</h3><ol><li v-for="index in selectedChapter.stepCount" :key="index"><b>{{ index }}</b><span>{{ t(`gmvMaxHelp.chapters.${selectedChapter.id}.steps.${index}`) }}</span></li></ol></section>
          <div class="help-outcome"><CheckCircle2 /><div><strong>{{ t('gmvMaxHelp.fields.result') }}</strong><span>{{ t(`gmvMaxHelp.chapters.${selectedChapter.id}.result`) }}</span></div></div>
          <div class="help-risk"><ShieldCheck /><div><strong>{{ t('gmvMaxHelp.fields.risk') }}</strong><span>{{ t(`gmvMaxHelp.chapters.${selectedChapter.id}.risk`) }}</span></div></div>
          <footer><button class="help-primary" data-testid="gmv-help-use" @click="emit('navigate', selectedChapter.targetTab)">{{ t('gmvMaxHelp.useFeature') }}<ArrowRight /></button></footer>
        </template>

        <template v-else-if="selectedIssue">
          <div class="help-article__heading"><span>{{ t('gmvMaxHelp.issueLabel') }} / {{ selectedIssue.code }}</span><h2>{{ issueText(selectedIssue.code, 'title') }}</h2><p>{{ issueText(selectedIssue.code, 'reason') }}</p></div>
          <dl class="help-evidence" data-testid="gmv-help-issue-evidence">
            <div><dt>{{ t('gmvMaxHelp.fields.currentValue') }}</dt><dd>{{ selectedCurrentIssue?.currentValue || t('gmvMaxHelp.notAvailable') }}</dd></div>
            <div><dt>{{ t('gmvMaxHelp.fields.targetValue') }}</dt><dd>{{ selectedCurrentIssue?.targetValue || t('gmvMaxHelp.notAvailable') }}</dd></div>
            <div><dt>{{ t('gmvMaxHelp.fields.evidenceSource') }}</dt><dd>{{ selectedCurrentIssue?.evidenceSource || t('gmvMaxHelp.notAvailable') }}</dd></div>
          </dl>
          <dl class="help-facts help-facts--issue">
            <div><dt>{{ t('gmvMaxHelp.fields.solution') }}</dt><dd>{{ issueText(selectedIssue.code, 'solution') }}</dd></div>
            <div><dt>{{ t('gmvMaxHelp.fields.completion') }}</dt><dd>{{ issueText(selectedIssue.code, 'completion') }}</dd></div>
            <div><dt>{{ t('gmvMaxHelp.fields.approval') }}</dt><dd>{{ t(selectedIssue.approvalRequired ? 'gmvMaxHelp.yes' : 'gmvMaxHelp.no') }}</dd></div>
            <div><dt>{{ t('gmvMaxHelp.fields.rollback') }}</dt><dd>{{ t(selectedIssue.rollbackSupported ? 'gmvMaxHelp.supported' : 'gmvMaxHelp.notSupported') }}</dd></div>
          </dl>
          <section class="help-steps"><h3>{{ t('gmvMaxHelp.systemSteps') }}</h3><ol><li v-for="(step, index) in selectedIssue.steps" :key="step"><b>{{ index + 1 }}</b><span>{{ t(`gmvMaxIssueResolutions.steps.${step}`) }}</span></li></ol></section>
          <div class="help-risk"><ShieldCheck /><div><strong>{{ t('gmvMaxHelp.externalNoteTitle') }}</strong><span>{{ t('gmvMaxHelp.externalNote') }}</span></div></div>
          <footer><button class="help-primary" data-testid="gmv-help-issue-use" @click="emit('navigate', selectedIssue.targetTab)">{{ issueAction(selectedIssue.actionTarget) }}<ArrowRight /></button></footer>
        </template>
      </article>
    </div>
  </section>
</template>

<style scoped>
.help-center { display: grid; gap: 10px; color: var(--theme-text, #eef2f7); }
.help-hero { min-height: 82px; padding: 13px 18px; display: flex; align-items: center; justify-content: space-between; gap: 20px; border: 1px solid var(--theme-border, #293341); background: var(--theme-panel, #111823); }
.help-hero > div:first-child { min-width: 0; max-width: 760px; }
.help-hero > div:first-child > span { display: flex; align-items: center; gap: 6px; color: #ef5a72; font-size: 10px; font-weight: 800; text-transform: uppercase; }
.help-hero svg { width: 15px; height: 15px; }
.help-hero h2 { margin: 4px 0 2px; font-size: 19px; letter-spacing: 0; }
.help-hero p { margin: 0; overflow: hidden; color: var(--theme-text-muted, #98a4b5); font-size: 12px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.help-context { width: min(320px, 34%); padding-left: 18px; display: grid; gap: 2px; border-left: 1px solid var(--theme-border, #293341); }
.help-context small, .help-context span { overflow: hidden; color: var(--theme-text-muted, #98a4b5); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.help-context strong { overflow: hidden; font-size: 13px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.help-search { height: 38px; padding: 0 12px; display: flex; align-items: center; gap: 9px; border: 1px solid var(--theme-border-control, #303a48); background: var(--theme-input, #0d131b); }
.help-search svg { width: 16px; color: #8290a3; }
.help-search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: inherit; font-size: 12px; }
.help-search span { color: var(--theme-text-muted, #98a4b5); font-size: 11px; }
.help-current { border: 1px solid var(--theme-border, #293341); background: var(--theme-panel, #111823); }
.help-current > header { min-height: 48px; padding: 0 16px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--theme-border, #293341); }
.help-current > header > div, .help-current > header span { display: flex; align-items: center; gap: 9px; }
.help-current > header span { align-items: flex-start; flex-direction: column; gap: 2px; }
.help-current > header svg { width: 17px; color: #ffb35c; }
.help-current > header small { color: var(--theme-text-muted, #98a4b5); font-size: 10px; }
.help-current > header b { min-width: 25px; height: 25px; display: grid; place-items: center; border-radius: 50%; background: rgba(239, 64, 95, .14); color: #ff7088; font-size: 11px; }
.help-current > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.help-current button { min-height: 54px; padding: 9px 14px; display: grid; grid-template-columns: 8px minmax(0, 1fr) 16px; align-items: center; gap: 10px; border: 0; border-right: 1px solid var(--theme-border, #293341); border-bottom: 1px solid var(--theme-border, #293341); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.help-current button:nth-child(even) { border-right: 0; }
.help-current button span:nth-child(2), .help-directory button span { min-width: 0; display: grid; gap: 3px; }
.help-current button strong, .help-directory button strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.help-current button small, .help-directory button small { overflow: hidden; color: var(--theme-text-muted, #98a4b5); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.help-current button > svg, .help-directory button > svg { width: 15px; color: #718096; }
.help-severity { width: 7px; height: 7px; border-radius: 50%; background: #8b98aa; }
.help-severity.is-must_fix { background: #ef5a72; box-shadow: 0 0 0 4px rgba(239, 90, 114, .1); }
.help-severity.is-recommended { background: #ffb35c; }.help-severity.is-observing { background: #5c9df5; }.help-severity.is-resolved { background: #42d49d; }
.help-layout { height: min(650px, calc(100vh - 310px)); min-height: 470px; display: grid; grid-template-columns: 270px minmax(0, 1fr); border: 1px solid var(--theme-border, #293341); background: var(--theme-panel, #111823); overflow: hidden; }
.help-directory { overflow-y: auto; border-right: 1px solid var(--theme-border, #293341); background: var(--theme-shell, #0d131b); }
.help-directory__label { position: sticky; top: 0; z-index: 1; padding: 12px 14px 8px; color: var(--theme-text-muted, #98a4b5); background: var(--theme-shell, #0d131b); font-size: 10px; font-weight: 800; text-transform: uppercase; }
.help-directory button { width: 100%; min-height: 55px; padding: 8px 12px; display: grid; grid-template-columns: 24px minmax(0, 1fr) 15px; align-items: center; gap: 8px; border: 0; border-top: 1px solid rgba(74, 85, 104, .28); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.help-directory button:hover { background: rgba(255,255,255,.025); }.help-directory button.is-active { background: rgba(239, 64, 95, .08); box-shadow: inset 3px 0 #ef405f; }
.help-directory button > b { color: #6f7c8e; font-size: 10px; }.help-directory button.is-active > b { color: #ff6d84; }
.help-directory__empty { padding: 28px 16px; color: var(--theme-text-muted, #98a4b5); font-size: 12px; text-align: center; }
.help-article { min-width: 0; overflow-y: auto; padding: 30px clamp(24px, 5vw, 64px) 36px; scroll-behavior: smooth; }
.help-article__heading { padding-bottom: 22px; border-bottom: 1px solid var(--theme-border, #293341); }
.help-article__heading > span { color: #ef5a72; font-size: 10px; font-weight: 800; text-transform: uppercase; }
.help-article__heading h2 { margin: 9px 0 7px; font-size: 22px; line-height: 1.3; letter-spacing: 0; }
.help-article__heading p { max-width: 820px; margin: 0; color: var(--theme-text-muted, #98a4b5); font-size: 13px; line-height: 1.7; }
.help-facts { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.help-evidence { margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--theme-border, #293341); }
.help-evidence > div { min-width: 0; padding: 14px 16px 14px 0; }.help-evidence > div + div { padding-left: 16px; border-left: 1px solid var(--theme-border, #293341); }
.help-evidence dt { color: #8c99ab; font-size: 10px; font-weight: 800; text-transform: uppercase; }.help-evidence dd { margin: 5px 0 0; overflow-wrap: anywhere; font-size: 12px; }
.help-facts > div { min-height: 102px; padding: 18px 20px 18px 0; border-bottom: 1px solid var(--theme-border, #293341); }
.help-facts > div:nth-child(even) { padding-left: 20px; border-left: 1px solid var(--theme-border, #293341); }
.help-facts dt { margin-bottom: 7px; color: #8c99ab; font-size: 10px; font-weight: 800; text-transform: uppercase; }
.help-facts dd { margin: 0; font-size: 12px; line-height: 1.65; }
.help-steps { padding: 22px 0; }.help-steps h3 { margin: 0 0 13px; font-size: 14px; }
.help-steps ol { margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); list-style: none; }
.help-steps li { min-height: 58px; padding: 10px 16px 10px 0; display: flex; align-items: flex-start; gap: 10px; border-top: 1px solid var(--theme-border, #293341); font-size: 12px; line-height: 1.55; }
.help-steps li:nth-child(even) { padding-left: 16px; border-left: 1px solid var(--theme-border, #293341); }
.help-steps li b { width: 22px; height: 22px; flex: 0 0 22px; display: grid; place-items: center; border: 1px solid #445063; color: #ef7a8d; font-size: 10px; }
.help-outcome,.help-risk { margin-top: 10px; padding: 14px 16px; display: flex; align-items: flex-start; gap: 12px; border-left: 3px solid #42d49d; background: rgba(66, 212, 157, .06); }
.help-risk { border-left-color: #ffb35c; background: rgba(255, 179, 92, .06); }
.help-outcome svg,.help-risk svg { width: 18px; flex: 0 0 18px; color: #42d49d; }.help-risk svg { color: #ffb35c; }
.help-outcome div,.help-risk div { display: grid; gap: 4px; }.help-outcome strong,.help-risk strong { font-size: 11px; }.help-outcome span,.help-risk span { color: var(--theme-text-muted, #98a4b5); font-size: 11px; line-height: 1.6; }
.help-article footer { padding-top: 22px; display: flex; justify-content: flex-end; }
.help-primary { min-height: 38px; padding: 0 15px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid #ef405f; border-radius: 4px; background: #ef405f; color: white; font-weight: 700; cursor: pointer; }.help-primary svg { width: 16px; }
@media (max-width: 1280px) { .help-layout { grid-template-columns: 230px minmax(0, 1fr); }.help-article { padding-inline: 24px; } }
@media (max-width: 900px) { .help-hero { align-items: flex-start; flex-direction: column; }.help-hero p { white-space: normal; }.help-context { width: 100%; padding: 9px 0 0; border-left: 0; border-top: 1px solid var(--theme-border, #293341); }.help-layout { height: auto; min-height: 0; grid-template-columns: 1fr; overflow: visible; }.help-directory { max-height: 220px; border-right: 0; border-bottom: 1px solid var(--theme-border, #293341); }.help-article { max-height: 620px; }.help-current > div,.help-facts,.help-steps ol,.help-evidence { grid-template-columns: 1fr; }.help-current button,.help-facts > div:nth-child(even),.help-steps li:nth-child(even),.help-evidence > div + div { padding-left: 0; border-left: 0; border-right: 0; } }
</style>
