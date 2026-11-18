import { cloud, session } from './session'

/**
 * 网页上直接显示云端文件（<img> / <video> 带不了登录头）：签名链接，12 小时有效，提前一小时刷新。
 * 链接是完整地址（电脑端复用过来的页面只认 http(s)），末尾带扩展名（视频是 &t=.mp4）。
 */

const links = new Map<string, { url: string; expiresAt: number }>()

function base() {
  return /^https?:\/\//.test(session.baseUrl) ? session.baseUrl.replace(/\/+$/, '') : location.origin
}

export async function resolveFileLinks(fileIds: string[]) {
  const now = Date.now()
  const missing = [...new Set(fileIds.filter((id) => id && !((links.get(id)?.expiresAt ?? 0) > now + 3_600_000)))]
  for (let i = 0; i < missing.length; i += 200) {
    const { links: got, expiresAt } = await cloud.ai.fileLinks(missing.slice(i, i + 200))
    for (const [id, url] of Object.entries(got)) links.set(id, { url: `${base()}${url}`, expiresAt })
  }
}

/** 已解析过的链接（同步读取，没有时返回 undefined） */
export const cachedFileLink = (fileId?: string) => (fileId ? links.get(fileId)?.url : undefined)

export async function fileLink(fileId: string) {
  await resolveFileLinks([fileId])
  return cachedFileLink(fileId) ?? ''
}
