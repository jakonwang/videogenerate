/**
 * 网页版的图生视频：电脑端「图生视频」页面（LivePhotoGeneratorView）在网页上原样显示，
 * window.api.livePhoto 的调用经 lib/desktopRelay 交给**服务器引擎**执行（和复刻一样，见 services/cloud/engine/cloneWorker.ts），
 * 跑的是电脑端同一套图生视频代码。这里只补页面里和本机有关的部分：
 *
 * - 商品列表：用服务器引擎里的商品（引擎会和云端同步商品，商品 id 要和引擎里的一致）。
 * - 选素材（视频拆解图片库）：网页版图生图素材接口（云端数据，路径是 cloudfile:，引擎用的时候自动下载）。
 * - 导出：引擎导到用户自己的目录，再由浏览器逐个下载。
 * - 字幕视频：服务器装好 Remotion 前，引擎会提示「即将支持」。
 * - 同款参考视频：分析走 livePhoto 通道（analyzeStyleReference），批量生成（createFromStyleReference）原样交给引擎。
 */
import { cloud, errorMessage } from '../session'
import { fileBlob } from '../files'
import { downloadBlob } from '../platform'
import { toast } from '../toast'
import { getPathForFile, pickFiles } from './files'
import imageMaterialsApi from './productImageMaterials'

type ExportResult = { outputDir?: string; total?: number; exported?: Array<{ id: string; videoPath: string }>; skipped?: Array<{ id?: string; reason?: string }> }

const engine = <T>(ns: string, method: string, args: unknown[]) => cloud.relay.call<T>(ns, method, args, 'server')

/** 导出：引擎把成片复制到用户自己的导出目录，网页再把每个文件传到云端后下载 */
async function exportItems(payload: { ids: string[]; outputDir?: string; settings?: Record<string, unknown> }) {
  const result = await engine<ExportResult>('livePhoto', 'exportItems', [{ ...payload, outputDir: undefined }])
  let downloaded = 0
  for (const entry of result?.exported ?? []) {
    try {
      const { fileId } = await engine<{ fileId: string; mime: string }>('media', 'publish', [{ path: entry.videoPath }])
      downloadBlob(await fileBlob(fileId), entry.videoPath.split(/[\\/]/).pop() || `${entry.id}.mp4`)
      downloaded += 1
    } catch (error) {
      toast(`下载失败：${errorMessage(error)}`)
    }
  }
  if (downloaded) toast(`已下载 ${downloaded} 个视频`)
  return { ...result, outputDir: '浏览器下载' }
}

/** 这个页面打开期间替换的 window.api 部分（其余 livePhoto 方法原样交给服务器引擎） */
export default {
  livePhoto: { exportItems },
  // 同款参考视频：上传的视频（cloudfile:）由引擎下载后分析，首尾帧留在引擎里
  styleReference: {
    analyze: (payload: { videoPath: string }) => engine<unknown>('livePhoto', 'analyzeStyleReference', [payload]),
    list: async () => [],
  },
  products: { list: () => engine<unknown[]>('products', 'list', []) },
  productImageMaterials: {
    listMaterials: imageMaterialsApi.productImageMaterials.listMaterials,
    resolveMaterialImages: imageMaterialsApi.productImageMaterials.resolveMaterialImages,
    updateUsageStatus: imageMaterialsApi.productImageMaterials.updateUsageStatus,
  },
  pickFiles,
  getPathForFile,
  pickDir: async () => '浏览器下载',
  // 页面检查参考图是否还在：网页上的文件都在云端或服务器引擎里
  pathExists: async (input: { path: string }) => Boolean(String(input?.path || '').trim()),
}
