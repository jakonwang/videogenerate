<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertTriangle, Check, ChevronDown, ChevronUp, Copy, LoaderCircle, Package, RotateCw, ShieldCheck, SkipForward, X } from 'lucide-vue-next'
import { localMediaUrl, thumbnailUrl } from '@/lib/localMedia'
import { LAUNCH_STAGES, itemStatus, type LaunchItem, type LaunchMarket, type LaunchStage } from '../../../../../shared/productLaunch'

const props = defineProps<{ item: LaunchItem; markets: LaunchMarket[]; busy: boolean }>()
const emit = defineEmits<{ retry: [stage: LaunchStage]; skip: [stage: LaunchStage]; inbox: [] }>()
const { t } = useI18n()
const k = (key: string, params: Record<string, unknown> = {}) => t(`ai.launch.${key}`, params)

const status = computed(() => itemStatus(props.item))
const open = ref(status.value === 'review' || status.value === 'done')
const market = ref<LaunchMarket>(props.markets[0] ?? 'VN')
const copied = ref('')
const failed = computed(() => LAUNCH_STAGES.find((stage) => props.item.stages[stage].status === 'failed'))
const running = computed(() => LAUNCH_STAGES.find((stage) => props.item.stages[stage].status === 'running'))
const copy = computed(() => props.item.copy[market.value])
const videos = computed(() => props.item.videos.filter((video) => video.status === 'done' && video.path))
const hasResults = computed(() => props.item.images.length > 0 || Object.keys(props.item.copy).length > 0 || props.item.videos.length > 0)
const progress = computed(() => {
  const stage = running.value ? props.item.stages[running.value] : null
  return stage?.total ? Math.round(((stage.done ?? 0) / stage.total) * 100) : 0
})

function stageLabel(stage: LaunchStage) {
  const state = props.item.stages[stage]
  if (stage === 'review' && state.status === 'done') return k('stageReviewWaiting')
  if (state.status === 'running' && state.total) return `${k(`stage.${stage}`)} ${state.done ?? 0}/${state.total}`
  if (state.status === 'done' && stage === 'images') return `${k('stage.images')} ${props.item.images.length}`
  if (state.status === 'done' && stage === 'videos') return `${k('stage.videos')} ${videos.value.length}`
  return k(`stage.${stage}`)
}

async function copyText(value: string, key: string) {
  await navigator.clipboard.writeText(value)
  copied.value = key
  setTimeout(() => (copied.value === key ? (copied.value = '') : undefined), 1500)
}
</script>

<template>
  <section class="vg-card li" :class="`is-${status}`">
    <div class="li__head">
      <span class="li__thumb"><img v-if="item.sourceImagePath" :src="thumbnailUrl(item.sourceImagePath, 64)" alt="" /><Package v-else :size="22" /></span>
      <div class="li__name">
        <b>{{ item.productName }}</b>
        <span class="li__tags"><span class="vg-chip">{{ item.source === 'upload' ? k('tagUpload') : k('tagLibrary') }}</span><span v-for="code in markets" :key="code" class="vg-chip">{{ code }}</span></span>
      </div>
      <div class="li__pipe">
        <template v-for="(stage, index) in LAUNCH_STAGES" :key="stage">
          <span v-if="index" class="li__line" :class="{ 'is-ok': ['done', 'skipped'].includes(item.stages[LAUNCH_STAGES[index - 1]].status) }" />
          <span class="li__stage" :class="[`is-${item.stages[stage].status}`, { 'is-wait': stage === 'review' && item.stages.review.status === 'done' }]">
            <LoaderCircle v-if="item.stages[stage].status === 'running'" :size="12" class="vg-spin" />
            <Check v-else-if="item.stages[stage].status === 'done' && stage !== 'review'" :size="12" />
            <X v-else-if="item.stages[stage].status === 'failed'" :size="12" />
            <SkipForward v-else-if="item.stages[stage].status === 'skipped'" :size="12" />
            {{ stageLabel(stage) }}
          </span>
        </template>
      </div>
      <button v-if="hasResults" type="button" class="vg-icon-btn" :aria-label="open ? k('collapse') : k('expand')" :aria-expanded="open" @click="open = !open"><ChevronUp v-if="open" :size="16" /><ChevronDown v-else :size="16" /></button>
    </div>

    <div v-if="running && progress" class="li__progress"><div class="vg-progress"><span class="vg-progress__bar"><span class="vg-progress__fill" :style="{ width: `${progress}%` }" /></span></div><span>{{ running === 'videos' ? k('videosWaiting') : k('working') }}</span></div>

    <div v-if="failed" class="li__error" role="alert">
      <span>{{ k('failedAt', { stage: k(`stage.${failed}`) }) }}{{ item.stages[failed].error }}</span>
      <span class="li__error-actions">
        <button v-if="failed !== 'product'" type="button" class="vg-btn vg-btn--sm" :disabled="busy" @click="emit('skip', failed)"><SkipForward :size="14" />{{ k('skipStage') }}</button>
        <button type="button" class="vg-btn vg-btn--sm vg-btn--primary" :disabled="busy" @click="emit('retry', failed)"><RotateCw :size="14" />{{ k('retryStage') }}</button>
      </span>
    </div>

    <div v-if="open && hasResults" class="li__body">
      <div v-if="item.images.length" class="li__col">
        <div class="li__sub">{{ k('resultImages') }}<em>{{ k('imagesCount', { count: item.images.length }) }}</em></div>
        <div class="li__images">
          <a v-for="path in item.images" :key="path" :href="localMediaUrl(path)" target="_blank" rel="noreferrer" class="li__img"><img :src="thumbnailUrl(path, 160)" alt="" loading="lazy" /></a>
        </div>
      </div>

      <div v-if="Object.keys(item.copy).length" class="li__col li__col--copy">
        <div class="li__sub">{{ k('resultCopy') }}<em>{{ k('copyHint') }}</em></div>
        <div class="li__markets">
          <button v-for="code in markets" :key="code" type="button" class="li__mtab" :class="{ 'is-on': market === code }" :disabled="!item.copy[code]" @click="market = code">{{ code }} {{ k(`market.${code}`) }}</button>
        </div>
        <template v-if="copy">
          <div v-for="(title, index) in copy.titles" :key="index" class="li__title">
            <span class="li__n">{{ index + 1 }}</span><span class="li__title-text">{{ title }}</span>
            <button type="button" class="vg-icon-btn vg-icon-btn--sm" :aria-label="k('copy')" @click="copyText(title, `${market}-t${index}`)"><Check v-if="copied === `${market}-t${index}`" :size="13" /><Copy v-else :size="13" /></button>
          </div>
          <div v-if="copy.description" class="li__desc">
            <span class="li__desc-head">{{ k('description') }}<button type="button" class="vg-icon-btn vg-icon-btn--sm" :aria-label="k('copy')" @click="copyText(copy.description, `${market}-d`)"><Check v-if="copied === `${market}-d`" :size="13" /><Copy v-else :size="13" /></button></span>
            <p>{{ copy.description }}</p>
          </div>
          <span v-if="copy.flags?.length" class="li__flag is-warn" data-testid="launch-banned"><AlertTriangle :size="13" />{{ k('bannedFound', { words: copy.flags.join('、') }) }}</span>
          <span v-else-if="copy.flags" class="li__flag"><ShieldCheck :size="13" />{{ k('bannedPassed') }}</span>
        </template>
      </div>

      <div v-if="item.videos.length" class="li__col">
        <div class="li__sub">{{ k('resultVideos') }}<em>{{ k('videosDone', { done: videos.length, total: item.videos.length }) }}</em></div>
        <div class="li__videos">
          <figure v-for="video in item.videos" :key="video.shotId" class="li__clip">
            <video v-if="video.path" class="li__video" :src="localMediaUrl(video.path)" controls preload="metadata" />
            <span v-else class="li__video li__video--empty" :class="`is-${video.status}`"><LoaderCircle v-if="video.status === 'running'" :size="18" class="vg-spin" /><X v-else :size="18" /><small>{{ video.status === 'running' ? k('videoMaking') : video.error }}</small></span>
            <figcaption v-if="video.style">{{ k(`style.${video.style}`) }}</figcaption>
          </figure>
        </div>
      </div>
    </div>

    <div v-if="status === 'review'" class="li__next">
      <span>{{ k('reviewReady') }}</span>
      <button type="button" class="vg-btn vg-btn--primary vg-btn--sm" @click="emit('inbox')"><Check :size="14" />{{ k('goReview') }}</button>
    </div>
  </section>
</template>

<style scoped>
.li { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; }
.li.is-review { border-color: color-mix(in srgb, var(--theme-warning-text) 35%, transparent); }
.li.is-failed { border-color: color-mix(in srgb, var(--theme-danger-text) 30%, transparent); }
.li__head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.li__thumb { display: grid; place-items: center; width: 56px; height: 56px; flex-shrink: 0; overflow: hidden; border-radius: 10px; background: #fff; color: var(--theme-text-muted); }
.li__thumb img { width: 100%; height: 100%; object-fit: contain; }
.li__name { display: flex; flex-direction: column; gap: 6px; min-width: 150px; max-width: 240px; }
.li__name b { overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.li__tags { display: flex; flex-wrap: wrap; gap: 4px; }
.li__pipe { display: flex; flex: 1 1 480px; flex-wrap: wrap; align-items: center; row-gap: 8px; min-width: 0; }
.li__line { width: 16px; height: 2px; background: var(--theme-border); }
.li__line.is-ok { background: color-mix(in srgb, var(--theme-success-text) 45%, transparent); }
.li__stage { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border-radius: 999px; background: var(--theme-panel-soft); color: var(--theme-text-muted); font-size: 12px; font-weight: 500; white-space: nowrap; }
.li__stage.is-done { background: var(--theme-success-soft); color: var(--theme-success-text); }
.li__stage.is-running { background: var(--theme-accent-soft); color: var(--theme-control-selected-text); box-shadow: inset 0 0 0 1px var(--theme-accent); }
.li__stage.is-failed { background: var(--theme-danger-soft); color: var(--theme-danger-text); }
.li__stage.is-skipped { opacity: .6; text-decoration: line-through; }
.li__stage.is-wait { background: var(--theme-warning-soft); color: var(--theme-warning-text); }
.li__progress { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--theme-text-muted); }
.li__progress .vg-progress { flex: 1; max-width: 360px; }
.li__error { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; border-radius: 10px; background: var(--theme-danger-soft); color: var(--theme-danger-text); font-size: 12.5px; }
.li__error > span:first-child { flex: 1 1 240px; min-width: 0; }
.li__error-actions { display: flex; gap: 8px; }
.li__body { display: flex; flex-wrap: wrap; gap: 16px; padding-top: 14px; border-top: 1px solid var(--theme-divider); }
.li__col { display: flex; flex: 1 1 300px; flex-direction: column; gap: 10px; min-width: 0; }
.li__col--copy { flex: 1.3 1 340px; }
.li__sub { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--theme-text-secondary); }
.li__sub em { font-size: 12px; font-style: normal; font-weight: 400; color: var(--theme-text-muted); }
.li__images { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.li__img { display: block; aspect-ratio: 1 / 1; overflow: hidden; border: 1px solid var(--theme-border); border-radius: 10px; background: #fff; }
.li__img img { width: 100%; height: 100%; object-fit: cover; }
.li__markets { display: flex; flex-wrap: wrap; gap: 6px; }
.li__mtab { height: 30px; padding: 0 12px; border: 1px solid var(--theme-border); border-radius: 8px; background: var(--theme-input); color: var(--theme-text-muted); font: inherit; font-size: 12.5px; cursor: pointer; }
.li__mtab.is-on { border-color: color-mix(in srgb, var(--theme-accent) 55%, transparent); background: var(--theme-accent-soft); color: var(--theme-control-selected-text); }
.li__mtab:disabled { opacity: .45; cursor: default; }
.li__title { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid var(--theme-divider); border-radius: 10px; background: var(--theme-input); font-size: 13px; line-height: 1.5; }
.li__title-text { flex: 1; min-width: 0; color: var(--theme-text); }
.li__n { display: grid; place-items: center; width: 20px; height: 20px; flex-shrink: 0; margin-top: 1px; border-radius: 6px; background: var(--theme-panel-soft); color: var(--theme-text-muted); font-size: 11px; }
.li__desc { padding: 10px 12px; border: 1px solid var(--theme-divider); border-radius: 10px; background: var(--theme-input); font-size: 12.5px; color: var(--theme-text-secondary); }
.li__desc-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--theme-text-muted); }
.li__desc p { margin: 4px 0 0; line-height: 1.6; white-space: pre-line; }
.li__flag { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--theme-success-text); }
.li__flag.is-warn { padding: 6px 10px; border-radius: 8px; background: var(--theme-warning-soft); color: var(--theme-warning-text); }
.li__clip { display: flex; flex-direction: column; gap: 4px; margin: 0; min-width: 0; }
.li__clip figcaption { overflow: hidden; font-size: 11.5px; color: var(--theme-text-muted); text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.li__videos { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 170px)); gap: 8px; }
.li__video { width: 100%; aspect-ratio: 9 / 16; border: 1px solid var(--theme-border); border-radius: 10px; background: #000; object-fit: cover; }
.li__video--empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 8px; box-sizing: border-box; background: var(--theme-panel-soft); color: var(--theme-text-muted); text-align: center; }
.li__video--empty.is-failed { color: var(--theme-danger-text); }
.li__video--empty small { font-size: 11px; line-height: 1.4; }
.li__next { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--theme-accent) 7%, var(--theme-panel)); font-size: 13px; color: var(--theme-text-secondary); }
.li__next button { margin-left: auto; }
</style>
