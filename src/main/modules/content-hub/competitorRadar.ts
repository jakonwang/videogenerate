/**
 * 竞品爆款雷达（主进程）：竞品账号列表、定时拉最近视频、找出爆款、下载原视频用来复刻。
 * 每 6 小时自动查一次（有竞品时），也可以手动「立即刷新」。每次每个账号 1–2 个 TikHub 请求。
 */
import { cloneRepo } from '../clone/repo'
import { tikhubApiBase } from '../video-parser-download/tikhub'
import { downloadCreativeVideo } from './creativeVideo'
import { createJsonStore } from './stores'
import {
  detectBreakouts,
  normalizeHandle,
  parseTikhubPosts,
  parseTikhubProfile,
  type RadarBreakout,
  type RadarCompetitor,
  type RadarVideo,
} from '../../../shared/competitorRadar'

type RadarDb = { schemaVersion: 1; competitors: RadarCompetitor[]; videos: Record<string, RadarVideo & { firstSeenAt: number }>; breakouts: Record<string, RadarBreakout>; lastRunAt?: number }
const store = createJsonStore<RadarDb>('competitor-radar.json', () => ({ schemaVersion: 1, competitors: [], videos: {}, breakouts: {} }), (db) => ({
  schemaVersion: 1,
  competitors: Array.isArray(db?.competitors) ? db.competitors : [],
  videos: db?.videos && typeof db.videos === 'object' ? db.videos : {},
  breakouts: db?.breakouts && typeof db.breakouts === 'object' ? db.breakouts : {},
  ...(db?.lastRunAt ? { lastRunAt: db.lastRunAt } : {}),
}))

export const RADAR_INTERVAL_MS = 6 * 3600_000
const MAX_COMPETITORS = 30
const KEEP_VIDEO_DAYS = 30

type Fetcher = (path: string, params: Record<string, string>) => Promise<any>
const defaultFetcher: Fetcher = async (path, params) => {
  const credentials = await cloneRepo.getCredentials()
  const apiKey = String(credentials.tikhubApiKey || '').trim()
  if (!apiKey) throw new Error('还没有填写 TikHub 密钥（设置 → 视频解析下载），竞品雷达用它读取账号视频')
  const url = new URL(`${tikhubApiBase()}${path}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(45_000) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || (payload?.code && Number(payload.code) !== 200)) throw new Error(`TikHub：${payload?.message || payload?.detail?.message || payload?.detail || `请求失败（${response.status}）`}`)
  return payload
}

type Deps = { fetch: Fetcher; now: () => number; download: typeof downloadCreativeVideo }
let deps: Deps = { fetch: defaultFetcher, now: () => Date.now(), download: downloadCreativeVideo }
export function setRadarTestDependencies(next: Partial<Deps>) { deps = { ...deps, ...next } }

async function fetchCompetitor(competitor: RadarCompetitor) {
  let profile: ReturnType<typeof parseTikhubProfile> = {}
  if (!competitor.secUid) {
    profile = parseTikhubProfile(await deps.fetch('/api/v1/tiktok/web/fetch_user_profile', { uniqueId: competitor.handle }))
    if (!profile.secUid) throw new Error(`找不到账号 @${competitor.handle}，检查一下拼写`)
  }
  const secUid = competitor.secUid || profile.secUid!
  const posts = await deps.fetch('/api/v1/tiktok/app/v3/fetch_user_post_videos', { sec_user_id: secUid, max_cursor: '0', count: '20', sort_type: '0' })
  return { profile: { ...profile, secUid }, videos: parseTikhubPosts(posts, competitor.handle) }
}

let refreshing: Promise<{ checked: number; newBreakouts: RadarBreakout[] }> | null = null

export const competitorRadar = {
  async state() {
    const db = await store.read()
    const breakouts = Object.values(db.breakouts).filter((item) => !item.dismissed).sort((a, b) => b.firstSeenAt - a.firstSeenAt || b.multiple - a.multiple)
    return { competitors: db.competitors, breakouts, lastRunAt: db.lastRunAt, refreshing: Boolean(refreshing) }
  },

  async add(input: { handle: string; note?: string }) {
    const handle = normalizeHandle(input.handle)
    if (!handle) throw new Error('请输入 TikTok 账号，例如 @shopname 或主页链接')
    await store.mutate((db) => {
      if (db.competitors.some((item) => item.handle === handle)) throw new Error(`@${handle} 已经在雷达里了`)
      if (db.competitors.length >= MAX_COMPETITORS) throw new Error(`最多盯 ${MAX_COMPETITORS} 个账号`)
      db.competitors.push({ handle, ...(input.note?.trim() ? { note: input.note.trim().slice(0, 40) } : {}), addedAt: deps.now() })
    })
    return this.state()
  },

  async remove(handle: string) {
    await store.mutate((db) => {
      db.competitors = db.competitors.filter((item) => item.handle !== handle)
      for (const [id, video] of Object.entries(db.breakouts)) if (video.handle === handle) delete db.breakouts[id]
      for (const [id, video] of Object.entries(db.videos)) if (video.handle === handle) delete db.videos[id]
    })
    return this.state()
  },

  async dismiss(videoId: string) {
    await store.mutate((db) => { const item = db.breakouts[videoId]; if (item) item.dismissed = true })
    return this.state()
  },

  /** 拉一遍所有竞品，返回这次新发现的爆款 */
  async refresh() {
    refreshing ||= (async () => {
      try {
        const now = deps.now()
        const competitors = (await store.read()).competitors
        const fresh: RadarBreakout[] = []
        for (const competitor of competitors) {
          try {
            const { profile, videos } = await fetchCompetitor(competitor)
            await store.mutate((db) => {
              const target = db.competitors.find((item) => item.handle === competitor.handle)
              if (target) Object.assign(target, profile, { lastCheckedAt: now, error: undefined })
              for (const video of videos) db.videos[video.id] = { ...video, firstSeenAt: db.videos[video.id]?.firstSeenAt || now }
              const mine = Object.values(db.videos).filter((video) => video.handle === competitor.handle)
              for (const hit of detectBreakouts(mine, now)) {
                const existing = db.breakouts[hit.id]
                if (existing) Object.assign(existing, { plays: hit.plays, likes: hit.likes, comments: hit.comments, shares: hit.shares, multiple: hit.multiple, baseline: hit.baseline })
                else {
                  const record: RadarBreakout = { ...hit, firstSeenAt: now }
                  db.breakouts[hit.id] = record
                  fresh.push(record)
                }
              }
            })
          } catch (error: any) {
            await store.mutate((db) => {
              const target = db.competitors.find((item) => item.handle === competitor.handle)
              if (target) Object.assign(target, { lastCheckedAt: now, error: String(error?.message || error).slice(0, 200) })
            })
          }
        }
        await store.mutate((db) => {
          db.lastRunAt = now
          const cutoff = now - KEEP_VIDEO_DAYS * 86_400_000
          for (const [id, video] of Object.entries(db.videos)) if (video.createdAt < cutoff) delete db.videos[id]
        })
        return { checked: competitors.length, newBreakouts: fresh }
      } finally {
        refreshing = null
      }
    })()
    return refreshing
  },

  /** 到点就刷新（每 6 小时；没有竞品不刷） */
  async runScheduled() {
    const db = await store.read()
    if (!db.competitors.length || (db.lastRunAt && deps.now() - db.lastRunAt < RADAR_INTERVAL_MS)) return null
    return this.refresh()
  },

  /** 下载爆款原视频，交给 AI 制片人复刻 */
  async download(videoId: string) {
    const db = await store.read()
    const video = db.breakouts[videoId] || db.videos[videoId]
    if (!video) throw new Error('这条视频不在雷达里了')
    const result = await deps.download({ creativeId: video.id, handle: video.handle, timeoutMs: 180_000 })
    if (result.status !== 'completed' || !result.localVideoPath) throw new Error(result.error || '原视频下载失败')
    return { localVideoPath: result.localVideoPath, title: video.desc || `@${video.handle} ${video.id}` }
  },
}
