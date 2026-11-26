<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ChevronRight, History, Package, Plus, Zap } from 'lucide-vue-next'
import LaunchNew from './product-launch/LaunchNew.vue'
import LaunchProgress from './product-launch/LaunchProgress.vue'
import { thumbnailUrl } from '@/lib/localMedia'
import { jobCounts, type LaunchJob, type LaunchJobStatus } from '../../../../shared/productLaunch'

/** 一键上新：放白底图 → AI 出商品图、写各国标题详情、做视频 → 进审核收件箱。?job= 看进度，?pane=jobs 看记录 */
const { t } = useI18n()
const k = (key: string, params: Record<string, unknown> = {}) => t(`ai.launch.${key}`, params)
const route = useRoute()
const router = useRouter()

const jobId = computed(() => String(route.query.job || ''))
const pane = computed(() => (route.query.pane === 'jobs' ? 'jobs' : 'new'))
const jobs = ref<Array<LaunchJob & { status: LaunchJobStatus }>>([])
const STATUS_PILL: Record<LaunchJobStatus, string> = { running: 'vg-pill--accent', paused: 'vg-pill--amber', review: 'vg-pill--amber', done: 'vg-pill--green', failed: 'vg-pill--red' }

async function loadJobs() {
  jobs.value = await window.api.productLaunch.list().catch(() => [])
}
const go = (query: Record<string, string>) => router.push({ query })

onMounted(loadJobs)
watch(() => route.query, loadJobs)
</script>

<template>
  <div class="vg-page vg-scope launch" data-testid="product-launch">
    <LaunchProgress v-if="jobId" :key="jobId" :job-id="jobId" @back="go({ pane: 'jobs' })" @again="go({})" />

    <template v-else>
      <header class="vg-page-head">
        <span class="vg-page-head__icon"><Zap :size="20" /></span>
        <div class="vg-page-head__text">
          <h1>{{ k('title') }}</h1>
          <p>{{ k('subtitle') }}</p>
        </div>
      </header>

      <nav class="gs-tabs" :aria-label="k('title')">
        <button type="button" class="gs-tab" :class="{ 'is-active': pane === 'new' }" :aria-current="pane === 'new' ? 'page' : undefined" @click="go({})"><Plus :size="15" />{{ k('paneNew') }}</button>
        <button type="button" class="gs-tab" :class="{ 'is-active': pane === 'jobs' }" :aria-current="pane === 'jobs' ? 'page' : undefined" @click="go({ pane: 'jobs' })"><History :size="15" />{{ k('paneJobs') }}<span v-if="jobs.length" class="vg-count">{{ jobs.length }}</span></button>
      </nav>

      <LaunchNew v-if="pane === 'new'" @created="go({ job: $event })" />

      <div v-else class="launch__jobs">
        <button v-for="job in jobs" :key="job.id" type="button" class="vg-card launch__job" @click="go({ job: job.id })">
          <span class="launch__covers"><span v-for="item in job.items.slice(0, 3)" :key="item.id" class="launch__cover"><img v-if="item.sourceImagePath" :src="thumbnailUrl(item.sourceImagePath, 64)" alt="" /><Package v-else :size="18" /></span></span>
          <span class="launch__job-text">
            <b>{{ job.title }}</b>
            <small>{{ job.markets.join(' · ') || '—' }} · {{ new Date(job.createdAt).toLocaleString() }}</small>
          </span>
          <span class="launch__job-counts">{{ k('jobCounts', jobCounts(job)) }}</span>
          <span class="vg-pill vg-pill--dot" :class="STATUS_PILL[job.status]">{{ k(`jobStatus.${job.status}`) }}</span>
          <ChevronRight :size="16" />
        </button>
        <div v-if="!jobs.length" class="vg-empty">
          <span class="vg-empty__icon"><Zap :size="22" /></span>
          <p>{{ k('noJobs') }}</p>
          <button type="button" class="vg-btn vg-btn--primary" @click="go({})"><Plus :size="14" />{{ k('paneNew') }}</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.launch { display: flex; flex-direction: column; gap: 14px; min-height: 100%; }
.launch__jobs { display: flex; flex-direction: column; gap: 10px; }
.launch__job { display: flex; align-items: center; gap: 14px; padding: 12px 16px; color: var(--theme-text); font: inherit; text-align: left; cursor: pointer; }
.launch__job:hover { border-color: var(--theme-border-control); }
.launch__covers { display: flex; flex-shrink: 0; }
.launch__cover { display: grid; place-items: center; width: 44px; height: 44px; margin-left: -10px; overflow: hidden; border: 2px solid var(--theme-panel); border-radius: 9px; background: #fff; color: var(--theme-text-muted); }
.launch__cover:first-child { margin-left: 0; }
.launch__cover img { width: 100%; height: 100%; object-fit: contain; }
.launch__job-text { display: flex; flex: 1; flex-direction: column; gap: 3px; min-width: 0; }
.launch__job-text b { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.launch__job-text small { font-size: 12px; color: var(--theme-text-muted); }
.launch__job-counts { font-size: 12px; color: var(--theme-text-secondary); white-space: nowrap; }
</style>
