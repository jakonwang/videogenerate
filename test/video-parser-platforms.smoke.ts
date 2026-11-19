/**
 * 视频解析下载（多平台）：链接识别、各平台返回解析（样例按 TikHub 文档 / 各平台常见字段构造）、
 * 电脑端服务的后台下载（导入后马上返回「下载中」，下载完成、去重、画面声音分开时合并）。
 *   npm run test:video-parser-platforms
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectPlatform, extractFirstUrl, normalizeParsedVideo, parseShareLink } from '../src/shared/videoParserPlatforms'

async function main() {
  /* ---------------- 链接识别 ---------------- */
  const cases: Array<[string, string | null]> = [
    ['https://v.douyin.com/iRNBho6/', 'douyin'],
    ['7.48 复制打开抖音，看看【好物】这个杯子太好用了 https://v.douyin.com/L4FJNR3/ yGv:/', 'douyin'],
    ['https://www.tiktok.com/@shop/video/7400000000000000001?is_from_webapp=1', 'tiktok'],
    ['https://vt.tiktok.com/ZSabc123/', 'tiktok'],
    ['64 小红书的笔记 http://xhslink.com/a/AbCdEf，复制本条信息', 'xiaohongshu'],
    ['https://www.xiaohongshu.com/explore/65f0c0000000000012345678', 'xiaohongshu'],
    ['https://v.kuaishou.com/abc123', 'kuaishou'],
    ['https://www.bilibili.com/video/BV1xx411c7mD', 'bilibili'],
    ['https://b23.tv/abcd123', 'bilibili'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    ['https://www.youtube.com/shorts/abc123', 'youtube'],
    ['https://www.instagram.com/reel/C1abcDEF/', 'instagram'],
    ['https://www.threads.net/@user/post/C2xyz', 'threads'],
    ['https://www.pinterest.com/pin/123/', null],
    ['没有链接的文字', null],
  ]
  for (const [text, want] of cases) assert.equal(detectPlatform(text)?.platform ?? null, want, text)
  assert.equal(extractFirstUrl('64 小红书 http://xhslink.com/a/AbCdEf，复制'), 'http://xhslink.com/a/AbCdEf')
  console.log('✓ links recognised for 8 platforms (and share text)')

  /* ---------------- 返回解析 ---------------- */
  const douyin = normalizeParsedVideo('douyin', {
    code: 200,
    data: {
      aweme_detail: {
        aweme_id: '7300000000000000001',
        desc: '这个杯子太好用了',
        author: { nickname: '杯子店', avatar_thumb: { url_list: ['https://p3.douyinpic.com/avatar.jpeg'] } },
        music: { play_url: { url_list: ['https://sf3.douyinvod.com/music.mp3'] } },
        video: {
          cover: { url_list: ['https://p3.douyinpic.com/cover.jpeg'] },
          download_addr: { url_list: ['https://v26.douyinvod.com/watermark.mp4'] },
          play_addr: { url_list: ['https://v26-web.douyinvod.com/video/tos/abc/?mime_type=video_mp4'] },
        },
      },
    },
  })
  assert.equal(douyin.videoId, '7300000000000000001')
  assert.equal(douyin.downloadUrl, 'https://v26-web.douyinvod.com/video/tos/abc/?mime_type=video_mp4')
  assert.equal(douyin.title, '这个杯子太好用了')
  assert.equal(douyin.author, '杯子店')
  assert.equal(douyin.coverUrl, 'https://p3.douyinpic.com/cover.jpeg')

  const tiktok = normalizeParsedVideo('tiktok', { data: { aweme_detail: { aweme_id: '74000', desc: 'mug', author: { nickname: 'mugshop' }, video: { play_addr: { url_list: ['https://v16m.tiktokcdn.com/abc/video.mp4'] }, download_addr: { url_list: ['https://v16m.tiktokcdn.com/wm.mp4'] } } } } })
  assert.equal(tiktok.downloadUrl, 'https://v16m.tiktokcdn.com/abc/video.mp4')
  assert.equal(tiktok.videoId, '74000')

  const xhs = normalizeParsedVideo('xiaohongshu', { data: [{ note_list: [{ id: '65f0c', title: '耳环分享', user: { nickname: '小红' }, images_list: [{ url: 'https://sns-img.xhscdn.com/a.jpg' }], video: { media: { stream: { h264: [{ master_url: 'https://sns-video-bd.xhscdn.com/stream/abc.mp4' }] } } } }] }] })
  assert.equal(xhs.downloadUrl, 'https://sns-video-bd.xhscdn.com/stream/abc.mp4')
  assert.equal(xhs.title, '耳环分享')
  assert.equal(xhs.author, '小红')

  const ks = normalizeParsedVideo('kuaishou', { data: { photo: { id: '3x9', caption: '快手好物', userName: '快手店', coverUrl: 'https://p1.a.yximgs.com/cover.jpg', mainMvUrls: [{ url: 'https://v1.kwaicdn.com/upic/abc.mp4' }] } } })
  assert.equal(ks.downloadUrl, 'https://v1.kwaicdn.com/upic/abc.mp4')
  assert.equal(ks.author, '快手店')

  const bili = normalizeParsedVideo('bilibili', { data: { bvid: 'BV1xx', title: 'B 站视频', owner: { name: 'UP 主' }, pic: 'https://i0.hdslb.com/pic.jpg', dash: { video: [{ id: 64, baseUrl: 'https://upos.bilivideo.com/720.m4s', codecs: 'avc1.64001F', width: 1280, height: 720, bandwidth: 1500000 }, { id: 80, baseUrl: 'https://upos.bilivideo.com/1080.m4s', codecs: 'avc1.640032', width: 1920, height: 1080, bandwidth: 3000000 }], audio: [{ id: 30280, baseUrl: 'https://upos.bilivideo.com/audio.m4s', codecs: 'mp4a.40.2', bandwidth: 320000 }] } } })
  assert.equal(bili.downloadUrl, 'https://upos.bilivideo.com/1080.m4s')
  assert.equal(bili.audioUrl, 'https://upos.bilivideo.com/audio.m4s')
  assert.equal(bili.videoId, 'bilibili:BV1xx')
  assert.equal(bili.downloadHeaders?.Referer, 'https://www.bilibili.com/')

  const yt = normalizeParsedVideo('youtube', { data: { title: 'Shorts', channel: { name: 'Chan' }, formats: [{ itag: 18, url: 'https://rr1.googlevideo.com/muxed', mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', width: 640, height: 360, audioQuality: 'AUDIO_QUALITY_LOW' }], adaptiveFormats: [{ itag: 137, url: 'https://rr1.googlevideo.com/1080', mimeType: 'video/mp4; codecs="avc1.640028"', width: 1920, height: 1080, bitrate: 4000000 }, { itag: 140, url: 'https://rr1.googlevideo.com/audio', mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000 }] } })
  assert.equal(yt.downloadUrl, 'https://rr1.googlevideo.com/muxed', 'YouTube prefers a stream that already has sound')
  assert.equal(yt.audioUrl, undefined)

  const ig = normalizeParsedVideo('instagram', { data: { items: [{ code: 'C1abc', caption: { text: 'reel' }, user: { username: 'iguser' }, image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/thumb.jpg' }] }, video_versions: [{ url: 'https://scontent.cdninstagram.com/o1/v/t16/reel.mp4?efg=1', width: 720 }] }] } })
  assert.equal(ig.downloadUrl, 'https://scontent.cdninstagram.com/o1/v/t16/reel.mp4?efg=1')
  assert.equal(ig.author, 'iguser')
  assert.equal(ig.videoId, 'instagram:C1abc')

  const threads = normalizeParsedVideo('threads', { data: { post: { code: 'C2xyz', caption: { text: 'threads clip' }, user: { username: 'tuser' }, video_versions: [{ type: 101, url: 'https://scontent.cdninstagram.com/threads.mp4' }] } } })
  assert.equal(threads.downloadUrl, 'https://scontent.cdninstagram.com/threads.mp4')

  const imageOnly = normalizeParsedVideo('xiaohongshu', { data: { note: { title: '图文', images_list: [{ url: 'https://sns-img.xhscdn.com/a.jpg' }] } } })
  assert.equal(imageOnly.downloadUrl, '', 'image-only notes have no video')
  console.log('✓ responses parsed for 8 platforms (no-watermark, split streams, image-only)')

  /* ---------------- 调用接口：路径和参数 ---------------- */
  const calls: string[] = []
  const fakeFetch = async (url: string) => {
    calls.push(url)
    return { ok: true, status: 200, text: async () => JSON.stringify({ code: 200, data: { aweme_detail: { aweme_id: '1', video: { play_addr: { url_list: ['https://x.douyinvod.com/v.mp4'] } } } } }) }
  }
  await parseShareLink({ text: '复制打开抖音 https://v.douyin.com/L4FJNR3/', apiKey: 'k', fetch: fakeFetch })
  assert.match(calls[0]!, /\/api\/v1\/douyin\/app\/v3\/fetch_one_video_by_share_url\?share_url=https%3A%2F%2Fv\.douyin\.com%2FL4FJNR3%2F$/)
  await parseShareLink({ text: '小红书 http://xhslink.com/a/AbCdEf，复制', apiKey: 'k', baseUrl: 'https://cloud.example/api/v1/ai-proxy/tikhub', fetch: async (url: string) => {
    calls.push(url)
    return { ok: true, status: 200, text: async () => JSON.stringify({ data: { video: { media: { stream: { h264: [{ master_url: 'https://sns-video-bd.xhscdn.com/a.mp4' }] } } } } }) }
  } })
  assert.match(calls[1]!, /^https:\/\/cloud\.example\/api\/v1\/ai-proxy\/tikhub\/api\/v1\/xiaohongshu\/app_v2\/get_video_note_detail\?share_text=/)
  await assert.rejects(parseShareLink({ text: 'https://www.pinterest.com/pin/1/', apiKey: 'k', fetch: fakeFetch }), /暂不支持/)
  await assert.rejects(
    parseShareLink({ text: 'https://www.xiaohongshu.com/explore/1', apiKey: 'k', fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ data: { note: { images_list: [{ url: 'https://a.jpg' }] } } }) }) }),
    /没有可下载的视频/,
  )
  console.log('✓ endpoint paths, proxy base and error messages')

  /* ---------------- 电脑端服务：后台下载、去重、合并 ---------------- */
  const root = await mkdtemp(join(tmpdir(), 'vg-parser-'))
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = join(root, 'data')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  await cloneRepo.setCredentials({ ...(await cloneRepo.getCredentials()), tikhubApiKey: 'test-key' } as never)
  const { videoParserDownloadService, waitForVideoParserQueue } = await import('../src/main/modules/video-parser-download/service')
  const ffmpegPath = String(require('ffmpeg-static'))
  const { execFileSync } = await import('node:child_process')
  const sample = join(root, 'sample.mp4')
  execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x240:d=1', '-f', 'lavfi', '-i', 'sine=d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', sample])
  const sampleBytes = await readFile(sample)
  const merged: string[] = []
  videoParserDownloadService.setTestDependencies({
    fetchImpl: (async (url: string) => {
      const u = String(url)
      if (u.includes('api.tikhub.io')) {
        const body = u.includes('bilibili')
          ? { data: { bvid: 'BVt', title: 'B 站', dash: { video: [{ baseUrl: 'https://b.example/v.m4s', codecs: 'avc1', width: 320, height: 240 }], audio: [{ baseUrl: 'https://b.example/a.m4s', codecs: 'mp4a.40.2' }] } } }
          : { code: 200, data: { aweme_detail: { aweme_id: 'tt-1', desc: '测试视频', author: { nickname: 'shop' }, video: { play_addr: { url_list: ['https://tt.example/v.mp4'] } } } } }
        return new Response(JSON.stringify(body), { status: 200 })
      }
      return new Response(sampleBytes, { status: 200 })
    }) as unknown as typeof fetch,
    mergeAudioVideo: async (videoPath: string, _audioPath: string, outputPath: string) => {
      merged.push(outputPath)
      await writeFile(outputPath, await readFile(videoPath))
    },
  })
  const imported = await videoParserDownloadService.importShareUrls({ userId: 'u', shareUrls: ['https://vt.tiktok.com/ZSabc123/', 'https://vt.tiktok.com/ZSabc123/?x=1', 'https://www.bilibili.com/video/BVt', 'https://pinterest.com/pin/1'] })
  assert.equal(imported.items.length, 2, 'duplicate share link in one batch is submitted once')
  assert.ok(imported.items.every((item) => item.status === 'processing'), 'import returns right away with processing items')
  assert.equal(imported.errors.length, 1)
  await waitForVideoParserQueue()
  let items = await videoParserDownloadService.listItems('u')
  const tt = items.find((item) => item.platform === 'tiktok')!
  const bb = items.find((item) => item.platform === 'bilibili')!
  assert.equal(tt.status, 'completed', tt.error)
  assert.equal(tt.title, '测试视频')
  assert.equal(bb.status, 'completed', bb.error)
  assert.equal(merged.length, 1, 'bilibili video and audio were merged')
  const again = await videoParserDownloadService.importShareUrls({ userId: 'u', shareUrls: ['https://vt.tiktok.com/ZSabc123/'] })
  assert.equal(again.items[0]!.id, tt.id, 'already downloaded link is reused')
  items = await videoParserDownloadService.listItems('u')
  assert.equal(items.length, 2)
  console.log('✓ desktop service: background download, dedupe, split-stream merge')
  console.log('video parser platforms smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
