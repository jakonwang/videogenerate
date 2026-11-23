/**
 * 网页版的 tk创意室：电脑在线时显示电脑端「tk创意室」页面本身（TiktokCreativeStudioView），
 * window.api.tiktokCreative 经电脑代办交给电脑，用电脑上的 TikTok 创意账号执行（lib/desktopRelay）。这里补页面里和本机有关的部分：
 *
 * - 参考图 / 参考视频：上传到云端（cloudfile:），电脑执行前自动下载。
 * - 图片素材库：网页版图生图素材（云端数据，路径是 cloudfile:）。
 * - 导出：不写电脑上的文件夹，把选中的成片从电脑传到云端，再由浏览器逐个下载。
 * - 账号 cookie 文件：账号只在电脑端添加（lib/desktopRelay 里已拦下账号的增改测删）。
 */
import { cloud, errorMessage } from '../session'
import { fileBlob } from '../files'
import { downloadBlob } from '../platform'
import { toast } from '../toast'
import { getPathForFile, pickFiles } from './files'
import imageMaterialsApi from './productImageMaterials'

type Shot = { shotId: string; shotIndex: number; status: string; resultVideoPath?: string; subtitleVideoPath?: string }
type Task = { id: string; productName?: string; shots?: Shot[] }

const BROWSER_DOWNLOAD = '浏览器下载'
const desktop = <T>(ns: string, method: string, args: unknown[]) => cloud.relay.call<T>(ns, method, args)

/** 选中的成片：电脑把视频传到云端，浏览器下载；返回格式和电脑端 exportItems 一样 */
async function exportItems(input: { taskId: string; shotIds: string[]; outputDir?: string }) {
  const task = await desktop<Task | null>('tiktokCreative', 'getTask', [input.taskId])
  const wanted = new Set(input.shotIds ?? [])
  const exported: Array<{ shotId: string; videoPath: string }> = []
  const skipped: Array<{ shotId: string; reason: string }> = []
  for (const shot of task?.shots ?? []) {
    if (!wanted.has(shot.shotId)) continue
    const source = shot.subtitleVideoPath || shot.resultVideoPath
    if (shot.status !== 'completed' || !source) {
      skipped.push({ shotId: shot.shotId, reason: '视频还没生成好' })
      continue
    }
    try {
      const { fileId } = await desktop<{ fileId: string; mime: string }>('media', 'publish', [{ path: source }])
      const name = `${task?.productName || 'tiktok'}-${shot.shotIndex + 1}-${shot.shotId.slice(0, 8)}.mp4`
      downloadBlob(await fileBlob(fileId), name)
      exported.push({ shotId: shot.shotId, videoPath: name })
    } catch (error) {
      skipped.push({ shotId: shot.shotId, reason: errorMessage(error) })
    }
  }
  if (skipped.length) toast(`${skipped.length} 条没有下载：${skipped[0]!.reason}`)
  return { taskId: input.taskId, outputDir: BROWSER_DOWNLOAD, exported, skipped }
}

/** 这个页面打开期间替换的 window.api 部分（tiktokCreative 的其余方法照旧经电脑代办） */
export default {
  tiktokCreative: { exportItems },
  productImageMaterials: {
    listMaterials: imageMaterialsApi.productImageMaterials.listMaterials,
    updateUsageStatus: imageMaterialsApi.productImageMaterials.updateUsageStatus,
  },
  pickFiles,
  getPathForFile,
  // 导出位置：浏览器下载（页面要先选一个目录才会导出）
  pickDir: async () => BROWSER_DOWNLOAD,
  readFileAsBase64: async () => {
    throw new Error('TikTok 账号要在电脑端添加（账号 cookie 只保存在电脑上）')
  },
}
