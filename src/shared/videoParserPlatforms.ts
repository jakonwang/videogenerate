/**
 * 视频解析下载（多平台，TikHub 接口）：识别分享链接属于哪个平台、调用对应接口、从返回里取出视频地址等。
 * 纯函数（fetch 由调用方传入），电脑端 video-parser-download、云端链接下载任务和网页页面共用。
 *
 * 接口来自 TikHub OpenAPI（2026-06）。多数平台的返回字段文档没写，所以除了已知字段，还会在返回里
 * 按「像不像视频地址」挑选（排除封面、头像、带水印地址），并认出画面 / 声音分开的流（B 站、YouTube），交给下载方合并。
 */

export type ParsePlatform = 'douyin' | 'tiktok' | 'xiaohongshu' | 'kuaishou' | 'bilibili' | 'youtube' | 'instagram' | 'threads'

type PlatformSpec = {
  label: string
  /** 链接域名 */
  hosts: RegExp
  /** TikHub 接口路径和参数（url：链接；text：整段分享文案） */
  endpoint: (url: string, text: string) => { path: string; params: Record<string, string> }
  /** 下载视频文件时要带的请求头（防盗链） */
  downloadHeaders?: Record<string, string>
}

export const PARSE_PLATFORMS: Record<ParsePlatform, PlatformSpec> = {
  douyin: {
    label: '抖音',
    hosts: /(^|\.)(douyin\.com|iesdouyin\.com|douyinvod\.com)$/i,
    endpoint: (url) => ({ path: '/api/v1/douyin/app/v3/fetch_one_video_by_share_url', params: { share_url: url } }),
  },
  tiktok: {
    label: 'TikTok',
    hosts: /(^|\.)tiktok\.com$/i,
    endpoint: (url) => ({ path: '/api/v1/tiktok/app/v3/fetch_one_video_by_share_url', params: { share_url: url } }),
  },
  xiaohongshu: {
    label: '小红书',
    hosts: /(^|\.)(xiaohongshu\.com|xhslink\.com|xhslink\.cn)$/i,
    endpoint: (url, text) => ({ path: '/api/v1/xiaohongshu/app_v2/get_video_note_detail', params: { share_text: text || url } }),
  },
  kuaishou: {
    label: '快手',
    hosts: /(^|\.)(kuaishou\.com|chenzhongtech\.com|gifshow\.com|kwai\.com)$/i,
    endpoint: (url) => ({ path: '/api/v1/kuaishou/web/fetch_one_video_by_url', params: { url } }),
  },
  bilibili: {
    label: 'B 站',
    hosts: /(^|\.)(bilibili\.com|b23\.tv)$/i,
    endpoint: (url) => ({ path: '/api/v1/bilibili/web/fetch_video_play_info', params: { url } }),
    downloadHeaders: { Referer: 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0' },
  },
  youtube: {
    label: 'YouTube',
    hosts: /(^|\.)(youtube\.com|youtu\.be)$/i,
    endpoint: (url) => ({ path: '/api/v1/youtube/web_v2/get_video_streams_v2', params: { video_url: url } }),
  },
  instagram: {
    label: 'Instagram',
    hosts: /(^|\.)(instagram\.com|instagr\.am)$/i,
    endpoint: (url) => ({ path: '/api/v1/instagram/v1/fetch_post_by_url', params: { post_url: url } }),
  },
  threads: {
    label: 'Threads',
    hosts: /(^|\.)threads\.(net|com)$/i,
    endpoint: (url) => ({ path: '/api/v1/threads/web/fetch_post_detail_v2', params: { url } }),
  },
}

/** 解析用到的全部 TikHub 接口路径（云端代理只放行这些，别的 TikHub 接口不对客户端开放） */
export const TIKHUB_PARSE_PATHS: readonly string[] = Object.values(PARSE_PLATFORMS).map((item) => item.endpoint('', '').path)

export const PARSE_PLATFORM_IDS = Object.keys(PARSE_PLATFORMS) as ParsePlatform[]
export const parsePlatformLabel = (platform?: string) => PARSE_PLATFORMS[platform as ParsePlatform]?.label ?? '其他'
export const TIKHUB_API_BASE = 'https://api.tikhub.io'

/* ------------------------------------------------------------------ 链接识别 */

/** 一段文字里的第一个链接（去掉中文标点等结尾杂字） */
export function extractFirstUrl(text: string) {
  const match = String(text || '').match(/https?:\/\/[^\s　-〿＀-￯"'<>]+/i)?.[0]
  return match ? match.replace(/[),.;!?]+$/, '') : ''
}

export function detectPlatform(text: string): { platform: ParsePlatform; url: string } | null {
  const url = extractFirstUrl(text)
  if (!url) return null
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return null
  }
  const platform = PARSE_PLATFORM_IDS.find((id) => PARSE_PLATFORMS[id].hosts.test(host))
  return platform ? { platform, url } : null
}

/* ------------------------------------------------------------------ 返回解析 */

export type ParsedVideo = {
  platform: ParsePlatform
  videoId: string
  title: string
  author: string
  coverUrl: string
  /** 视频文件地址（画面和声音分开时是画面） */
  downloadUrl: string
  /** 画面和声音分开时的声音地址，下载后要合并 */
  audioUrl?: string
  downloadHeaders?: Record<string, string>
}

type Json = Record<string, unknown>
const isObj = (value: unknown): value is Json => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const str = (value: unknown) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '')
const isHttp = (value: string) => /^https?:\/\//i.test(value)

function at(input: unknown, path: string): unknown {
  let current: unknown = input
  for (const key of path.split('.')) {
    if (Array.isArray(current)) current = current[Number(key)]
    else if (isObj(current)) current = current[key]
    else return undefined
  }
  return current
}
function first(input: unknown, paths: string[]) {
  for (const path of paths) {
    const value = str(at(input, path))
    if (value) return value
  }
  return ''
}

/** 走遍返回 JSON，收集所有「键路径 + 字符串值」 */
function walk(input: unknown, visit: (path: string[], value: string, parent: Json | unknown[]) => void, path: string[] = [], depth = 0) {
  if (depth > 12) return
  if (Array.isArray(input)) input.forEach((item, index) => (typeof item === 'string' ? visit([...path, String(index)], item, input) : walk(item, visit, [...path, String(index)], depth + 1)))
  else if (isObj(input))
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string') visit([...path, key], value, input)
      else walk(value, visit, [...path, key], depth + 1)
    }
}

const IMAGE_RE = /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)(\?|$)|[?&](x-oss-process=image|imageView)/i
const NOT_VIDEO_KEY = /(cover|avatar|thumb|image|img|poster|icon|music|audio|sound|subtitle|caption|lyric|share|profile|web_?url|link|page|author|user|origin_?url)/i
const VIDEO_KEY = /(play|video|download|nwm|stream|mp4|media|url_?list|base_?url|backup|mv_?urls?|master_?url|h264|h265)/i

/** 给一个候选地址打分：越像无水印视频文件分越高；不像视频返回 -1 */
function scoreVideoUrl(path: string[], value: string) {
  if (!isHttp(value) || IMAGE_RE.test(value) || /\.(json|txt|m3u8)(\?|$)/i.test(value)) return -1
  const keys = path.filter((key) => !/^\d+$/.test(key)).join('.').toLowerCase()
  const leaf = path.filter((key) => !/^\d+$/.test(key)).slice(-3).join('.').toLowerCase()
  if (NOT_VIDEO_KEY.test(leaf) && !VIDEO_KEY.test(path[path.length - 1] ?? '')) return -1
  let score = 0
  if (VIDEO_KEY.test(keys)) score += 10
  if (/\.mp4(\?|$)|mime_type=video|\/video\//i.test(value)) score += 8
  if (/no_?watermark|nwm|play_addr_h264|play_addr|video_versions|playurl|play_url/i.test(keys)) score += 6
  // 抖音 / TikTok 的 download_addr 带水印
  if (/download_addr|wmplay|watermark/i.test(keys) && !/no_?watermark|nwm/i.test(keys)) score -= 6
  if (/(^|\.)0$/.test(path.join('.'))) score += 1
  return score
}

/** 一组「带地址的流对象」（B 站 dash、YouTube formats）里挑画面和声音 */
type Stream = { url: string; mime: string; width: number; height: number; bandwidth: number; hasVideo: boolean; hasAudio: boolean }
function collectStreams(input: unknown): Stream[] {
  const streams: Stream[] = []
  const visit = (node: unknown, depth: number, hint: string) => {
    if (depth > 12) return
    if (Array.isArray(node)) return node.forEach((item) => visit(item, depth + 1, hint))
    if (!isObj(node)) return
    const url = str(node.url) || str(node.baseUrl) || str(node.base_url) || str(node.downloadUrl)
    const mime = (str(node.mimeType) || str(node.mime_type) || str(node.mime) || str(node.type)).toLowerCase()
    const codecs = (str(node.codecs) + ' ' + mime).toLowerCase()
    if (url && isHttp(url) && !IMAGE_RE.test(url)) {
      const width = Number(node.width ?? 0) || 0
      const height = Number(node.height ?? 0) || 0
      const hintAudio = /audio/.test(hint)
      const hintVideo = /video/.test(hint)
      const hasAudio = /audio|mp4a|opus/.test(codecs) || Boolean(node.audioQuality || node.audio_quality || node.audioSampleRate || node.audio_sample_rate) || hintAudio || node.has_audio === true || node.hasAudio === true
      const hasVideo = /video|avc|h264|hev|vp9|av01/.test(codecs) || width > 0 || height > 0 || (hintVideo && !hintAudio) || node.has_video === true || node.hasVideo === true
      if (hasVideo || hasAudio) streams.push({ url, mime, width, height, bandwidth: Number(node.bandwidth ?? node.bitrate ?? 0) || 0, hasVideo, hasAudio })
    }
    for (const [key, value] of Object.entries(node)) if (typeof value === 'object') visit(value, depth + 1, key.toLowerCase())
  }
  visit(input, 0, '')
  return streams
}

function pickStreams(input: unknown): { video: string; audio?: string } | null {
  const streams = collectStreams(input)
  if (!streams.length) return null
  const isMp4 = (s: Stream) => /mp4|avc|h264/.test(s.mime) || /\.mp4(\?|$)/i.test(s.url)
  const rank = (s: Stream) => (isMp4(s) ? 1e9 : 0) + Math.min(s.height || 0, 1080) * 1e5 + (s.bandwidth || 0) / 1e3
  const muxed = streams.filter((s) => s.hasVideo && s.hasAudio).sort((a, b) => rank(b) - rank(a))
  if (muxed[0]) return { video: muxed[0].url }
  const video = streams.filter((s) => s.hasVideo && !s.hasAudio).sort((a, b) => rank(b) - rank(a))[0]
  const audio = streams.filter((s) => s.hasAudio && !s.hasVideo).sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0]
  return video ? { video: video.url, audio: audio?.url } : null
}

const TITLE_PATHS = ['data.aweme_detail.desc', 'data.aweme_details.0.desc', 'data.desc', 'data.title', 'data.data.title', 'data.note.title', 'data.items.0.title', 'data.caption.text', 'data.items.0.caption.text', 'data.video_title', 'data.data.desc', 'data.info.title', 'data.photo.caption']
const AUTHOR_PATHS = ['data.aweme_detail.author.nickname', 'data.aweme_details.0.author.nickname', 'data.author.nickname', 'data.author.name', 'data.user.nickname', 'data.user.username', 'data.items.0.user.username', 'data.owner.name', 'data.data.owner.name', 'data.note.user.nickname', 'data.author_name', 'data.channel.name', 'data.photo.userName']
const COVER_PATHS = ['data.aweme_detail.video.origin_cover.url_list.0', 'data.aweme_detail.video.cover.url_list.0', 'data.aweme_details.0.video.cover.url_list.0', 'data.cover', 'data.data.pic', 'data.pic', 'data.image_versions2.candidates.0.url', 'data.items.0.image_versions2.candidates.0.url', 'data.thumbnail', 'data.photo.coverUrl']
const ID_PATHS = ['data.aweme_detail.aweme_id', 'data.aweme_details.0.aweme_id', 'data.aweme_id', 'data.note_id', 'data.id', 'data.data.bvid', 'data.bvid', 'data.video_id', 'data.code', 'data.items.0.code', 'data.photo.id', 'data.pk']

/** 找不到已知字段时：按键名猜（title / desc / nickname …） */
function guessByKey(input: unknown, keys: RegExp, accept: (value: string) => boolean = (v) => v.length > 0 && v.length < 300 && !isHttp(v)) {
  let found = ''
  walk(input, (path, value) => {
    if (!found && keys.test(path[path.length - 1] ?? '') && accept(value.trim())) found = value.trim()
  })
  return found
}

/** 从 TikHub 返回里取出下载需要的信息；没有可下载视频时 downloadUrl 为空 */
export function normalizeParsedVideo(platform: ParsePlatform, payload: unknown, sourceUrl = ''): ParsedVideo {
  const spec = PARSE_PLATFORMS[platform]
  let downloadUrl = ''
  let audioUrl: string | undefined
  if (platform === 'bilibili' || platform === 'youtube') {
    const picked = pickStreams(payload)
    if (picked) {
      downloadUrl = picked.video
      audioUrl = picked.audio
    }
  }
  if (!downloadUrl) {
    let best = { score: -1, url: '' }
    walk(payload, (path, value) => {
      const score = scoreVideoUrl(path, value.trim())
      if (score > best.score) best = { score, url: value.trim() }
    })
    if (best.score >= 8) downloadUrl = best.url
  }
  if (!downloadUrl) {
    const picked = pickStreams(payload)
    if (picked) {
      downloadUrl = picked.video
      audioUrl = picked.audio
    }
  }
  const title = first(payload, TITLE_PATHS) || guessByKey(payload, /^(title|desc|description|caption|text)$/i)
  const author = first(payload, AUTHOR_PATHS) || guessByKey(payload, /^(nickname|author_?name|username|uploader|owner_?name|channel_?name)$/i)
  const coverUrl = first(payload, COVER_PATHS) || guessByKey(payload, /(cover|thumbnail|poster)/i, (v) => isHttp(v))
  const rawId = first(payload, ID_PATHS) || guessByKey(payload, /^(aweme_id|note_id|bvid|video_id|photo_id|shortcode|code)$/i, (v) => v.length > 0 && v.length < 80)
  // 抖音 / TikTok 保持原来的写法（不带前缀），和已有记录去重
  const fallbackId = sourceUrl ? `url:${sourceUrl.replace(/[?#].*$/, '').replace(/\/+$/, '')}` : ''
  const videoId = rawId ? (platform === 'tiktok' || platform === 'douyin' ? rawId : `${platform}:${rawId}`) : fallbackId
  return { platform, videoId, title, author, coverUrl, downloadUrl, audioUrl, downloadHeaders: spec.downloadHeaders }
}

/* ------------------------------------------------------------------ 调用 TikHub */

export type TikhubFetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

/** 识别平台 → 调用对应接口 → 取出信息。失败时抛出给人看的中文原因 */
export async function parseShareLink(input: { text: string; apiKey: string; baseUrl?: string; fetch: TikhubFetch; timeoutMs?: number }): Promise<ParsedVideo> {
  const detected = detectPlatform(input.text)
  if (!detected) {
    if (!extractFirstUrl(input.text)) throw new Error('没有找到链接')
    throw new Error(`暂不支持这个平台的链接（支持：${PARSE_PLATFORM_IDS.map((id) => PARSE_PLATFORMS[id].label).join('、')}）`)
  }
  const { platform, url } = detected
  const { path, params } = PARSE_PLATFORMS[platform].endpoint(url, String(input.text || '').trim())
  const api = new URL(`${(input.baseUrl || TIKHUB_API_BASE).replace(/\/+$/, '')}${path}`)
  for (const [key, value] of Object.entries(params)) api.searchParams.set(key, value)
  const response = await input.fetch(api.toString(), { headers: { Authorization: `Bearer ${input.apiKey}` }, signal: AbortSignal.timeout(input.timeoutMs ?? 60_000) })
  const text = await response.text()
  if (!response.ok) throw new Error(`${PARSE_PLATFORMS[platform].label}链接解析失败（HTTP ${response.status}）${text ? `：${text.slice(0, 160)}` : ''}`)
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('链接解析返回异常，请稍后再试')
  }
  const code = Number(at(payload, 'code') ?? 200)
  if (Number.isFinite(code) && code !== 200 && code !== 0) throw new Error(str(at(payload, 'message')) || str(at(payload, 'msg')) || `链接解析失败（${code}）`)
  const parsed = normalizeParsedVideo(platform, payload, url)
  if (!parsed.downloadUrl) throw new Error(`这条${PARSE_PLATFORMS[platform].label}链接里没有可下载的视频（可能是图文或已删除）`)
  return parsed
}
