/**
 * 网页版的批量混剪：电脑在线时显示电脑端的批量混剪页面（首页、新建任务、混剪工作室、素材池、任务列表 / 详情），
 * 素材池、方案、成片都在电脑上（原始素材在电脑上），调用经电脑代办（lib/desktopRelay）。这里补页面里和本机有关的部分：
 *
 * - 导入素材 / 参考爆款视频：电脑端会弹选择框；网页改成在浏览器里选文件，上传到云端（cloudfile:），电脑执行前下载。
 * - 进度 / 任务事件：电脑推不过来，改成定时读取（素材池读电脑记下的最新进度，任务列表定时刷新）。
 * - 输出目录：默认用电脑的数据目录（页面上也能直接改路径）。
 */
import { cloud } from '../session'
import { pickFiles, getPathForFile } from './files'

const desktop = <T>(ns: string, method: string, args: unknown[]) => cloud.relay.call<T>(ns, method, args)
const VIDEO_FILTERS = [{ name: 'Videos', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv'] }]

async function importFiles(payload: { productId: string; origin?: string }) {
  const paths = await pickFiles({ multiple: true, filters: VIDEO_FILTERS })
  if (!paths.length) return { added: 0, skipped: 0 }
  return desktop('mixPool', 'importPaths', [{ productId: payload?.productId, paths, origin: payload?.origin }])
}

/** 素材池进度：每 2 秒读一次电脑记下的最新进度，有变化就交给页面（和电脑端的推送一样） */
function onProgress(cb: (p: Record<string, any>) => void) {
  const seen = new Map<string, number>()
  let stopped = false
  const tick = async () => {
    try {
      const list = await desktop<Array<Record<string, any> & { at: number }>>('mixPool', 'latestProgress', [])
      for (const item of list ?? []) {
        if (seen.get(item.productId) === item.at) continue
        seen.set(item.productId, item.at)
        cb(item)
      }
    } catch {
      // Computer offline / older version: the page still refreshes after each action.
    }
    if (!stopped) timer = setTimeout(() => void tick(), 2000)
  }
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => void tick(), 1000)
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

async function formulaFromReference(payload?: { name?: string }) {
  const [videoPath] = await pickFiles({ multiple: false, filters: VIDEO_FILTERS })
  if (!videoPath) return null
  return desktop('mixStudio', 'formulaFromReferencePath', [{ videoPath, name: payload?.name }])
}

/**
 * 任务列表：电脑的任务事件推不过来，页面打开期间每 5 秒刷新一次（每次刷新要读好几个列表，都经电脑代办；
 * 标签页在后台时不刷新）
 */
function onEvent(cb: (event: unknown) => void) {
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') cb({ type: 'poll' })
  }, 5000)
  return () => clearInterval(timer)
}

let paths: Promise<unknown> | null = null
const getPaths = () => (paths ??= desktop('app', 'getPaths', []).catch((error) => {
  paths = null
  throw error
}))

/** 这些页面打开期间替换的 window.api 部分（其余方法照旧经电脑代办） */
export default {
  mixPool: { importFiles, onProgress },
  mixStudio: { formulaFromReference },
  tasks: { onEvent },
  getPaths,
  pickFiles,
  getPathForFile,
}
