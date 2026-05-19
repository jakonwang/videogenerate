type CapcutMateConfig = {
  baseUrl: string
  requestTimeoutMs: number
  draftRoot?: string
}

type CapcutMateCaption = {
  text: string
  start: number
  end: number
  font_size?: number
  font_color?: string
  position?: string
}

type JsonRecord = Record<string, unknown>

function normalizeBaseUrl(input?: string) {
  return String(input || '').trim().replace(/\/+$/, '')
}

function buildFormBody(input: Record<string, string>) {
  const body = new URLSearchParams()
  Object.entries(input).forEach(([key, value]) => {
    body.set(key, value)
  })
  return body
}

async function requestJson<T>(config: CapcutMateConfig, path: string, input: Record<string, string>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(3_000, config.requestTimeoutMs || 45_000))
  try {
    const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buildFormBody(input),
      signal: controller.signal,
    })
    const payload = (await response.json().catch(() => ({}))) as JsonRecord
    if (!response.ok) {
      throw new Error(String(payload.message || payload.error || `capcut-mate 请求失败: ${response.status}`))
    }
    return payload as T
  } finally {
    clearTimeout(timer)
  }
}

export function isCapcutMateConfigured(config: Partial<CapcutMateConfig> | null | undefined) {
  return Boolean(normalizeBaseUrl(config?.baseUrl))
}

export async function createCapcutDraft(
  config: CapcutMateConfig,
  input: { projectName: string; width?: number; height?: number },
) {
  return await requestJson<{ draft_url?: string; draftId?: string; id?: string }>(config, '/create_draft', {
    project_name: String(input.projectName || 'VideoGenerate 字幕任务'),
    width: String(Math.max(1, Number(input.width || 1080))),
    height: String(Math.max(1, Number(input.height || 1920))),
    draft_root: String(config.draftRoot || ''),
  })
}

export async function addCapcutVideos(config: CapcutMateConfig, input: { draftUrl: string; videoPaths: string[] }) {
  return await requestJson<{ success?: boolean }>(config, '/add_videos', {
    draft_url: input.draftUrl,
    video_infos: JSON.stringify(
      input.videoPaths.map((path) => ({
        file_path: path,
      })),
    ),
  })
}

export async function addCapcutCaptions(
  config: CapcutMateConfig,
  input: {
    draftUrl: string
    captions: CapcutMateCaption[]
  },
) {
  return await requestJson<{ success?: boolean }>(config, '/add_captions', {
    draft_url: input.draftUrl,
    captions: JSON.stringify(input.captions),
  })
}

export async function saveCapcutDraft(config: CapcutMateConfig, input: { draftUrl: string }) {
  return await requestJson<{ success?: boolean }>(config, '/save_draft', {
    draft_url: input.draftUrl,
  })
}

export async function genCapcutVideo(
  config: CapcutMateConfig,
  input: { draftUrl: string; exportPath?: string; width?: number; height?: number },
) {
  return await requestJson<{ task_id?: string; taskId?: string; id?: string }>(config, '/gen_video', {
    draft_url: input.draftUrl,
    export_path: String(input.exportPath || ''),
    width: String(Math.max(1, Number(input.width || 1080))),
    height: String(Math.max(1, Number(input.height || 1920))),
  })
}

export async function getCapcutVideoStatus(config: CapcutMateConfig, input: { taskId: string }) {
  return await requestJson<{
    status?: string
    progress?: number
    video_path?: string
    output?: string
    error?: string
    message?: string
  }>(config, '/gen_video_status', {
    task_id: input.taskId,
  })
}
