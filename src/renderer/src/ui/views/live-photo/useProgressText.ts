import { useI18n } from 'vue-i18n'
import { splitDuration, type LivePhotoProgress } from './progress'

/** 进度 → 文案（卡片、详情弹窗共用） */
export function useProgressText() {
  const { t } = useI18n()

  function duration(ms: number) {
    const { h, m, s } = splitDuration(ms)
    if (h > 0) return t('lpTask.dur.hm', { h, m })
    if (m > 0) return t('lpTask.dur.ms', { m, s })
    return t('lpTask.dur.s', { s })
  }

  /** 卡片右上角的状态短语 */
  function stateLabel(p: LivePhotoProgress) {
    if (p.state === 'running' || p.state === 'waiting') return shortLabel(p)
    return t(`lpTask.state.${p.state}`)
  }

  function shortLabel(p: LivePhotoProgress) {
    if (p.phase === 'done') return t('lpTask.state.done')
    if (p.phase === 'queued') return t('lpTask.short.queued')
    if (p.state === 'waiting' && (p.phase === 'image' || p.phase === 'video')) return t(`lpTask.short.${p.phase}Waiting`)
    return t(`lpTask.short.${p.phase}`)
  }

  /** 详情弹窗顶部的「现在」一句话 */
  function nowLabel(p: LivePhotoProgress) {
    if (p.failure) return t(`lpTask.failure.${p.failure.kind}`)
    if (p.state === 'paused') return t('lpTask.now.paused')
    if (p.phase === 'done') return t('lpTask.now.done')
    if (p.state === 'waiting' && (p.phase === 'image' || p.phase === 'video')) return t(`lpTask.now.${p.phase}Waiting`)
    return t(`lpTask.now.${p.phase}`)
  }

  /** 「已等 52 秒 · 通常 1–3 分钟」 */
  function timingLabel(p: LivePhotoProgress, now: number) {
    if (!p.startedAt || !p.expectedSec || (p.state !== 'running' && p.state !== 'waiting')) return ''
    const waited = now - p.startedAt
    const parts = [t('lpTask.waited', { d: duration(waited) })]
    const [min, max] = p.expectedSec
    if (waited > max * 2000) parts.push(t('lpTask.overdue'))
    else parts.push(max <= 60 ? t('lpTask.expectedUnderMinute') : t('lpTask.expected', { min: Math.max(1, Math.round(min / 60)), max: Math.round(max / 60) }))
    return parts.join(' · ')
  }

  function nextLabel(p: LivePhotoProgress) {
    if (p.state === 'retrying') return t('lpTask.next.retrying', { n: Math.min(p.retryCount + 1, p.retryLimit), max: p.retryLimit })
    if (p.next === 'none') return ''
    if (p.next === 'retry' && p.failure?.limitReached) return t('lpTask.next.retryAfterLimit', { max: p.retryLimit })
    return t(`lpTask.next.${p.next}`)
  }

  function failureLabel(p: LivePhotoProgress) {
    if (!p.failure) return ''
    return t(`lpTask.failure.${p.failure.kind}`)
  }

  return { t, duration, stateLabel, shortLabel, nowLabel, timingLabel, nextLabel, failureLabel }
}
