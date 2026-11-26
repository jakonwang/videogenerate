/**
 * 网页版的一键上新：电脑端「一键上新」页面（ProductLaunchView）在网页上原样显示，
 * window.api.productLaunch 的调用经 lib/desktopRelay 交给**服务器引擎**执行（services/cloud/src/cloneEngine.ts 总是转给引擎），
 * 跑的是电脑端同一套流水线；服务器上没有 TikTok 创意账号，只能用图生视频出视频（引擎的 info() 会告诉页面）。
 * 这里补页面里和本机有关的部分：
 *
 * - 选图 / 拖图：上传到云端（cloudfile:），引擎用的时候自动下载。拖进来的图在建任务时才上传。
 * - 商品库：用服务器引擎里的商品（id 要和引擎里的一致）。
 * - 结果里的图片、视频是引擎里的路径，页面的 localMediaUrl 替身会请引擎传到云端再显示。
 */
import type { DesktopApi } from './contract'
import { cloudFileRef } from '@shared/cloud/relay'
import { cloud } from '../session'
import { requestSync } from '../sync'
import { cloudFileIdOf, fileNameOf, getPathForFile, pickFiles } from './files'

type ProductLaunch = DesktopApi['productLaunch']
type CreateInput = Parameters<ProductLaunch['create']>[0]

const engine = <T>(ns: string, method: string, args: unknown[]) => cloud.relay.call<T>(ns, method, args, 'server')

/** 拖进来的图（blob: 临时路径）先传到云端，换成 cloudfile 引用 */
async function create(input: CreateInput) {
  const items = await Promise.all(
    (input?.items ?? []).map(async (item) => {
      const path = String(item.imagePath || '')
      if (!path || path.startsWith('cloudfile:')) return item
      return { ...item, imagePath: cloudFileRef(await cloudFileIdOf(path), fileNameOf(path)) }
    }),
  )
  return engine<Awaited<ReturnType<ProductLaunch['create']>>>('productLaunch', 'create', [{ ...input, items }])
}

/**
 * 引擎把成片发到作品库 / 审核收件箱（云端 generations）后才把上新标成「等你审核」；
 * 这时让网页马上同步一次，用户点「去审核」就能看到，不用等下一轮同步。
 */
const syncedJobs = new Set<string>()
async function get(id: string) {
  const job = await engine<Awaited<ReturnType<ProductLaunch['get']>>>('productLaunch', 'get', [id])
  if (job?.status === 'review' && !syncedJobs.has(job.id)) {
    syncedJobs.add(job.id)
    void requestSync()
  }
  return job
}

/** 这个页面打开期间替换的 window.api 部分（productLaunch 其余方法原样交给服务器引擎） */
export default {
  // 网页上只有服务器引擎，固定只有图生视频（不必等引擎启动，也不受会员状态影响）
  productLaunch: { create, get, info: async () => ({ videoEngines: ['livePhoto' as const] }) } satisfies Partial<ProductLaunch>,
  products: { list: () => engine<unknown[]>('products', 'list', []) },
  pickFiles,
  getPathForFile,
}
