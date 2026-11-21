/**
 * 投放素材（常常是达人视频）→ 拼出 TikTok 链接 → 用「视频解析下载」下载 → 等文件下好再交给复刻。
 */
import assert from 'node:assert/strict'
import { creativePostUrl, creatorHandleForPost, downloadCreativeVideo, setCreativeVideoTestDependencies } from '../src/main/modules/content-hub/creativeVideo'
import type { VideoParserDownloadItem } from '../src/main/modules/video-parser-download/types'

const ID = '7699314466432896264'

function item(patch: Partial<VideoParserDownloadItem>): VideoParserDownloadItem {
  return { id: 'dl-1', userId: 'desktop-local', shareUrl: '', videoId: `pending:${ID}`, platform: 'tiktok', status: 'processing', usedStatus: 'unused', createdAt: 1, updatedAt: 1, ...patch }
}

async function main() {
  // 链接：有达人账号就用真实链接，没有就用 /@/video/<id>
  assert.equal(creativePostUrl(ID, 'vanixink'), `https://www.tiktok.com/@vanixink/video/${ID}`)
  assert.equal(creativePostUrl(ID), `https://www.tiktok.com/@/video/${ID}`)
  assert.equal(creatorHandleForPost(ID, () => [{ itemId: 'x', creatorHandle: 'a' }, { itemId: ID, creatorHandle: '@vanixink' }]), 'vanixink')
  assert.equal(creatorHandleForPost(ID, () => { throw new Error('no creator hub') }), '')
  console.log('✓ builds the TikTok link from the creative id and creator handle')

  // 下载：用下载接口导入，等到完成再返回文件路径
  const imported: string[][] = []
  setCreativeVideoTestDependencies({
    handleFor: () => 'vanixink',
    importShareUrls: (async ({ shareUrls }: { shareUrls: string[] }) => {
      imported.push(shareUrls)
      return { ok: true, items: [item({ shareUrl: shareUrls[0] })], errors: [] }
    }) as never,
    waitForItem: (async (input: { item: VideoParserDownloadItem; videoId?: string }) => {
      assert.equal(input.videoId, ID, 'waits by the post id so a reused earlier download is found')
      return item({ ...input.item, videoId: ID, status: 'completed', localVideoPath: 'D:/dl/video.mp4', title: '#xh', author: 'Vani' })
    }) as never,
  })
  const ok = await downloadCreativeVideo({ creativeId: ID })
  assert.deepEqual(imported, [[`https://www.tiktok.com/@vanixink/video/${ID}`]])
  assert.equal(ok.status, 'completed')
  assert.equal(ok.localVideoPath, 'D:/dl/video.mp4')
  assert.equal(ok.creatorHandle, 'vanixink')
  console.log('✓ downloads through the video download interface and waits for the file')

  // 下载失败：返回失败原因，不给文件路径
  setCreativeVideoTestDependencies({
    handleFor: () => '',
    importShareUrls: (async ({ shareUrls }: { shareUrls: string[] }) => ({ ok: true, items: [item({ shareUrl: shareUrls[0] })], errors: [] })) as never,
    waitForItem: (async (input: { item: VideoParserDownloadItem }) => item({ ...input.item, status: 'failed', error: '视频已删除' })) as never,
  })
  const failed = await downloadCreativeVideo({ creativeId: ID })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.localVideoPath, undefined)
  assert.equal(failed.error, '视频已删除')
  assert.equal(failed.shareUrl, `https://www.tiktok.com/@/video/${ID}`)
  console.log('✓ a failed download reports why')

  // 不是 TikTok 视频 ID：直接说明
  await assert.rejects(downloadCreativeVideo({ creativeId: 'abc' }), /没有 TikTok 视频 ID/)
  setCreativeVideoTestDependencies(null)
  console.log('creative video download smoke passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
