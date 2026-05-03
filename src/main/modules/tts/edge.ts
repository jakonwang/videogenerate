import { EdgeTTS } from 'node-edge-tts'

export type EdgeTtsOptions = {
  text: string
  outPath: string
  voice?: string
  rate?: string
  pitch?: string
  volume?: string
  proxy?: string
  timeoutMs?: number
  saveSubtitles?: boolean
}

export async function synthesizeEdgeTts(opts: EdgeTtsOptions) {
  const tts = new EdgeTTS({
    voice: opts.voice ?? 'zh-CN-XiaoxiaoNeural',
    lang: (opts.voice ?? '').slice(0, 5) || 'zh-CN',
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    saveSubtitles: Boolean(opts.saveSubtitles ?? true),
    proxy: opts.proxy,
    pitch: opts.pitch ?? 'default',
    rate: opts.rate ?? 'default',
    volume: opts.volume ?? 'default',
    timeout: Math.max(3000, Number(opts.timeoutMs ?? 15000)),
  } as any)

  await tts.ttsPromise(String(opts.text ?? ''), opts.outPath)

  // node-edge-tts 在 saveSubtitles=true 时会生成同名 json（用于词边界时间）
  const subtitlesJsonPath = opts.outPath.replace(/\.(mp3|wav|m4a|aac|flac)$/i, '') + '.json'
  return { audioPath: opts.outPath, subtitlesJsonPath }
}

