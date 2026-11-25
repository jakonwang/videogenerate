/** Muse创意室经电脑代办的接口：手机页面用；网页版直接复用电脑端页面（views/web/WebMuseStudio）。 */
import { onMounted, reactive, ref } from 'vue'
import type { MuseAccountSummary, MuseCreateInput, MuseJob, MusePromptVersion, MuseQueue } from '../../../../src/main/modules/muse-creative-studio/types'
import { cloud } from './session'

export type { MuseAccountSummary, MuseJob, MuseQueue }

const call = <T>(method: string, ...args: unknown[]) => cloud.relay.call<T>('museCreative', method, args)

export const muse = {
  accounts: async () => (await call<{ accounts: MuseAccountSummary[] }>('listAccountSummaries')).accounts,
  queue: () => call<MuseQueue>('listJobs'),
  create: (input: MuseCreateInput) => call<MuseJob[]>('createJobs', input),
  approve: (ids: string[]) => call<{ done: number }>('approveImages', ids),
  redo: (id: string) => call<null>('redoImage', { id }),
  collect: (id: string) => call<null>('collectJob', id),
  retry: (id: string) => call<null>('retryJob', id),
  cancel: (id: string) => call<null>('cancelJob', id),
  setPaused: (paused: boolean) => call<null>('setQueuePaused', paused),
  prompts: () => call<MusePromptVersion[]>('listPrompts', 'video'),
  products: () => cloud.relay.call<Array<{ id: string; name: string }>>('products', 'list', []),
}

export const MUSE_STATUS: Record<MuseJob['status'], { label: string; tone: string }> = {
  swapping: { label: '换图中', tone: 'vg-pill--blue' },
  image_review: { label: '待确认换图', tone: 'vg-pill--amber' },
  queued: { label: '排队中', tone: 'vg-pill--amber' },
  running: { label: '生成中', tone: 'vg-pill--blue' },
  completed: { label: '完成', tone: 'vg-pill--green' },
  failed: { label: '失败', tone: 'vg-pill--red' },
  needs_review: { label: '待人工确认', tone: 'vg-pill--amber' },
  cancelled: { label: '已取消', tone: 'vg-pill--red' },
}

/** 只有这台电脑上已经有 Muse 账号时，才显示入口 */
export function useMuseAvailable() {
  const available = ref(false)
  onMounted(async () => {
    available.value = Boolean((await muse.accounts().catch(() => [])).length)
  })
  return available
}

/** 电脑上的图片 / 视频：请电脑传到云端，返回云端文件 id（同一个文件只传一次） */
const published = reactive<Record<string, string>>({})
const requested = new Set<string>()
const keyOf = (path: string, width?: number) => `${path}|${width ?? ''}`
export function museFileId(path?: string, width?: number) {
  return path ? published[keyOf(path, width)] : undefined
}
export async function publishMuseFile(path?: string, width?: number) {
  if (!path) return
  const key = keyOf(path, width)
  if (published[key] || requested.has(key)) return
  requested.add(key)
  try {
    published[key] = (await cloud.relay.call<{ fileId: string }>('media', 'publish', [{ path, width }])).fileId
  } finally {
    requested.delete(key)
  }
}
