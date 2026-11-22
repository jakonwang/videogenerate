import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { detectBreakouts, formatCount, normalizeHandle, parseTikhubPosts, parseTikhubProfile, videoUrl } from '../src/shared/competitorRadar'
import { classifyProxyRequest } from '../services/cloud/src/aiProxy'

const HOUR = 3600_000
const NOW = Date.parse('2026-11-22T12:00:00Z')

/** TikHub app v3 user posts, shaped like the real response */
function postsPayload(handle: string, plays: number[], ageHours: number[] = plays.map((_, i) => 24 * (i + 1))) {
  return {
    code: 200,
    data: {
      aweme_list: plays.map((play, i) => ({
        aweme_id: `73${String(handle.length).padStart(2, '0')}${String(i).padStart(15, '0')}`,
        desc: `${handle} video ${i} #earrings`,
        create_time: Math.floor((NOW - ageHours[i]! * HOUR) / 1000),
        statistics: { play_count: play, digg_count: Math.round(play / 20), comment_count: 3, share_count: 2 },
        video: { cover: { url_list: [`https://p16.example/${i}.jpg`] } },
        author: { unique_id: handle },
      })),
    },
  }
}

function sharedTests() {
  assert.equal(normalizeHandle('@Pearl.Shop'), 'pearl.shop')
  assert.equal(normalizeHandle('https://www.tiktok.com/@pearl_shop/video/123?lang=en'), 'pearl_shop')
  assert.equal(normalizeHandle('not a handle!'), '')
  assert.equal(videoUrl({ handle: 'a', id: '1' }), 'https://www.tiktok.com/@a/video/1')
  assert.equal(formatCount(125_000), '125K')
  assert.equal(formatCount(2_340_000), '2.3M')

  const videos = parseTikhubPosts(postsPayload('shop', [5000, 6000, 4000, 90000, 5500]), 'shop')
  assert.equal(videos.length, 5)
  assert.deepEqual([videos[3]!.plays, videos[3]!.likes, videos[3]!.cover], [90000, 4500, 'https://p16.example/3.jpg'])
  assert.equal(videos[0]!.createdAt, NOW - 24 * HOUR)
  assert.deepEqual(parseTikhubProfile({ data: { userInfo: { user: { secUid: 'MS4w', nickname: 'Pearl' }, stats: { followerCount: 12000 } } } }), { secUid: 'MS4w', nickname: 'Pearl', followers: 12000 })

  // 90K plays vs a ~5.2K median → breakout (≈17×); everything else is normal.
  const hits = detectBreakouts(videos, NOW)
  assert.deepEqual(hits.map((hit) => hit.plays), [90000])
  assert.equal(hits[0]!.baseline, 5250)
  assert.equal(hits[0]!.multiple, 17.1)
  // Too old (10 days) → not reported; too few videos → no baseline.
  const old = parseTikhubPosts(postsPayload('old', [5000, 6000, 4000, 90000], [24, 48, 72, 240]), 'old')
  assert.equal(detectBreakouts(old, NOW).length, 0)
  assert.equal(detectBreakouts(videos.slice(2, 5), NOW).length, 0)
  // Small accounts: below 10K plays is never a breakout, even at 10×.
  const tiny = parseTikhubPosts(postsPayload('tiny', [500, 600, 400, 8000]), 'tiny')
  assert.equal(detectBreakouts(tiny, NOW).length, 0)

  // Cloud proxy lets the two radar endpoints through (GET only), still blocks the rest of TikHub.
  const c = (method: string, p: string) => classifyProxyRequest({ platform: 'tikhub' as any, method, path: p, model: '' }).kind
  assert.equal(c('GET', '/api/v1/tiktok/web/fetch_user_profile'), 'free')
  assert.equal(c('GET', '/api/v1/tiktok/app/v3/fetch_user_post_videos'), 'free')
  assert.equal(c('POST', '/api/v1/tiktok/app/v3/fetch_user_post_videos'), 'blocked')
  assert.equal(c('GET', '/api/v1/tikhub/user/get_user_info'), 'blocked')
}

async function moduleTests() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-radar-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  try {
    const { competitorRadar, setRadarTestDependencies, RADAR_INTERVAL_MS } = await import('../src/main/modules/content-hub/competitorRadar')
    let now = NOW
    const calls: string[] = []
    let shopPlays = [5000, 6000, 4000, 5500, 5200]
    const downloads: any[] = []
    setRadarTestDependencies({
      now: () => now,
      fetch: async (p, params) => {
        calls.push(`${p}?${new URLSearchParams(params)}`)
        if (p.endsWith('fetch_user_profile')) {
          if (params.uniqueId === 'ghost') return { code: 200, data: { userInfo: {} } }
          return { code: 200, data: { userInfo: { user: { secUid: `SEC-${params.uniqueId}`, nickname: params.uniqueId }, stats: { followerCount: 5000 } } } }
        }
        return postsPayload(params.sec_user_id!.slice(4), shopPlays)
      },
      download: (async (input: any) => { downloads.push(input); return { creativeId: input.creativeId, shareUrl: '', status: 'completed', localVideoPath: path.join(root, 'v.mp4') } }) as any,
    })

    await assert.rejects(competitorRadar.add({ handle: '!!' }), /请输入 TikTok 账号/)
    await competitorRadar.add({ handle: '@Pearl.Shop', note: '同款耳环' })
    await assert.rejects(competitorRadar.add({ handle: 'pearl.shop' }), /已经在雷达里/)
    await competitorRadar.add({ handle: 'ghost' })
    assert.equal(await competitorRadar.runScheduled() !== null, true, 'first run happens right away')

    let state = await competitorRadar.state()
    const pearl = state.competitors.find((item) => item.handle === 'pearl.shop')!
    assert.deepEqual([pearl.secUid, pearl.followers, pearl.error], ['SEC-pearl.shop', 5000, undefined])
    assert.match(state.competitors.find((item) => item.handle === 'ghost')!.error!, /找不到账号 @ghost/)
    assert.equal(state.breakouts.length, 0)
    assert.ok(calls.some((call) => call.includes('sec_user_id=SEC-pearl.shop') && call.includes('count=20')))

    // Within 6 hours nothing runs; after that the profile is cached and only posts are fetched.
    now += HOUR
    assert.equal(await competitorRadar.runScheduled(), null)
    now += RADAR_INTERVAL_MS
    shopPlays = [5000, 6000, 4000, 120000, 5200]
    calls.length = 0
    const result = (await competitorRadar.runScheduled())!
    assert.equal(calls.filter((call) => call.includes('fetch_user_profile') && call.includes('pearl.shop')).length, 0, 'secUid is cached')
    assert.equal(result.newBreakouts.length, 1)
    assert.equal(result.newBreakouts[0]!.plays, 120000)
    state = await competitorRadar.state()
    assert.equal(state.breakouts.length, 1)

    // Seen again next time → not "new" again, numbers updated.
    now += RADAR_INTERVAL_MS
    shopPlays = [5000, 6000, 4000, 150000, 5200]
    const again = await competitorRadar.refresh()
    assert.equal(again.newBreakouts.length, 0)
    state = await competitorRadar.state()
    assert.equal(state.breakouts[0]!.plays, 150000)

    // Clone: the download uses the competitor's handle so the share link is the real one.
    const video = state.breakouts[0]!
    const downloaded = await competitorRadar.download(video.id)
    assert.equal(downloaded.localVideoPath, path.join(root, 'v.mp4'))
    assert.deepEqual([downloads[0].creativeId, downloads[0].handle], [video.id, 'pearl.shop'])

    // Dismiss hides it; removing the competitor drops its videos.
    state = await competitorRadar.dismiss(video.id)
    assert.equal(state.breakouts.length, 0)
    state = await competitorRadar.remove('pearl.shop')
    assert.deepEqual(state.competitors.map((item) => item.handle), ['ghost'])
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main() {
  sharedTests()
  await moduleTests()
  console.log('competitor-radar smoke passed')
  process.exit(0)
}
main().catch((error) => { console.error(error); process.exit(1) })
