import { m } from './museText'
import type { MuseAccount, MuseAccountState, MuseJob } from '../../../../../main/modules/muse-creative-studio/types'

export const MUSE_ACCOUNT_STATES: Record<MuseAccountState, { label: string; tone: string }> = {
  unchecked: { label: '待检测', tone: '' },
  login_required: { label: '待登录', tone: 'ts-state--warn' },
  ready: { label: '可用', tone: 'ts-state--ok' },
  disabled: { label: '已停用', tone: '' },
  expired: { label: '登录失效', tone: 'ts-state--err' },
  proxy_error: { label: '代理异常', tone: 'ts-state--err' },
  region_blocked: { label: '出口不可用', tone: 'ts-state--err' },
  ip_changed: { label: '出口 IP 变化', tone: 'ts-state--warn' },
  error: { label: '异常', tone: 'ts-state--err' },
}

const JOB_STATUS: Record<MuseJob['status'], { label: string; tone: string }> = {
  swapping: { label: '换图中', tone: 'ts-state--run' },
  image_review: { label: '待确认换图', tone: 'ts-state--warn' },
  queued: { label: '排队中', tone: '' },
  running: { label: '进行中', tone: 'ts-state--run' },
  completed: { label: '完成', tone: 'ts-state--ok' },
  failed: { label: '失败', tone: 'ts-state--err' },
  needs_review: { label: '待人工确认', tone: 'ts-state--warn' },
  cancelled: { label: '已取消', tone: '' },
}

const JOB_STAGE: Record<MuseJob['stage'], string> = {
  preparing: '准备中',
  submitting: '发送提示词',
  generating: '等待生成',
  collecting: '找回中',
  downloading: '下载视频',
}

/** Labels are translated here, so they follow a language switch. */
export function museJobState(job: MuseJob) {
  const state = jobState(job)
  return { label: m(state.label), tone: state.tone }
}

function jobState(job: MuseJob) {
  if (job.status === 'swapping' && !job.image?.submitting && !job.image?.waiting) return { label: '等待换图', tone: '' }
  if (job.status === 'image_review' && !job.preparedImagePath) return { label: '换图失败', tone: 'ts-state--err' }
  if (job.status === 'running') return { label: JOB_STAGE[job.stage], tone: 'ts-state--run' }
  if (job.status === 'queued' && job.collect) return { label: '等待找回', tone: '' }
  return JOB_STATUS[job.status]
}

export const museQuotaPaused = (account: MuseAccount) => Number(account.quotaUntil) > Date.now()

export const museError = (e: any) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')