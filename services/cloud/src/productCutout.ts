import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { CloudError, badRequest } from './security'
import type { Matting } from './sceneSwap/matting'

/** 单张商品图最大 8MB（base64 之后约 11MB） */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
/** 每个账号每天最多抠这么多张：同一张商品图电脑端会缓存，正常用不到 */
const DAILY_LIMIT = 300

/**
 * 图生视频「贴真实商品」的抠图：桌面端和网页引擎都把商品图发过来，服务器用腾讯云抠图（密钥只在服务器），
 * 返回透明通道蒙版（黑白 PNG）。按张收费很低（约 0.02 元），这里只做每日上限防滥用。
 */
export function createProductCutout(deps: { matting: Matting; dataDir: string; now?: () => number }) {
  const now = deps.now ?? Date.now
  const used = new Map<string, { day: string; count: number }>()

  function take(userId: string) {
    const day = new Date(now()).toISOString().slice(0, 10)
    const current = used.get(userId)
    const count = current?.day === day ? current.count : 0
    if (count >= DAILY_LIMIT) throw new CloudError('RATE_LIMITED', `今天的抠图次数已用完（每天 ${DAILY_LIMIT} 张），明天再试`, 429)
    used.set(userId, { day, count: count + 1 })
  }

  return {
    available: () => deps.matting.available(),
    async run(userId: string, input: { image?: unknown }) {
      if (!deps.matting.available()) throw new CloudError('BAD_REQUEST', '后台还没有配置腾讯云抠图，请联系管理员', 400)
      const raw = String(input?.image || '').replace(/^data:[^;]+;base64,/, '')
      if (!raw) throw badRequest('缺少商品图')
      const image = Buffer.from(raw, 'base64')
      if (!image.length) throw badRequest('商品图格式不对')
      if (image.length > MAX_IMAGE_BYTES) throw badRequest('商品图太大，请换一张 8MB 以内的图')
      take(userId)
      const dir = join(deps.dataDir, 'tmp', 'product-cutout')
      await mkdir(dir, { recursive: true })
      const id = randomUUID()
      const inputPath = join(dir, `${id}-in`)
      const maskPath = join(dir, `${id}-mask.png`)
      try {
        await writeFile(inputPath, image)
        await deps.matting.run(inputPath, maskPath)
        return { mask: (await readFile(maskPath)).toString('base64') }
      } finally {
        await rm(inputPath, { force: true }).catch(() => undefined)
        await rm(maskPath, { force: true }).catch(() => undefined)
      }
    },
  }
}

export type ProductCutoutService = ReturnType<typeof createProductCutout>
