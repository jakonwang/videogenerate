/**
 * 网页版的模板库：电脑端「模板库」页面（TemplatesView）在网页上原样显示，它调用的 window.api 由这里提供。
 *
 * - 模板读写、导入视频 AI 识别模板：在**服务器引擎**上执行（services/cloud/engine/cloneWorker.ts，跑电脑端同一套模板代码），
 *   引擎里的模板经云同步和电脑端互通（配音、转场、LUT、贴纸等电脑端设置也一起同步）。
 * - LUT / 贴纸 / 字体下拉：电脑在线时用电脑上的列表（含用户自己导入的），不在线时用服务器上的内置列表。
 * - 导入字体 / 贴纸、按文件夹分析风格：要用电脑上的文件，提示到电脑端操作。
 * - 选背景音乐 / 参考视频：上传到云端（cloudfile:），引擎用的时候自动下载。
 */
import type { DesktopApi } from './contract'
import { cloud } from '../session'
import { desktopRelayOnline } from '../desktopRelay'
import { getPathForFile, pickFiles } from './files'

const engine = <T>(method: string, args: unknown[]) => cloud.relay.call<T>('templates', method, args, 'server')

/** 电脑在线时问电脑（列表和电脑上成片时用的一致），否则 / 电脑版本太旧时问服务器引擎；都拿不到就给空列表 */
async function desktopThenServer<T>(ns: 'luts' | 'stickers' | 'fonts', method: string, empty: T): Promise<T> {
  if (desktopRelayOnline.value !== false) {
    try {
      const result = await cloud.relay.call<T>(ns, method, [])
      desktopRelayOnline.value = true
      return result
    } catch (error) {
      if ((error as { code?: string })?.code === 'DESKTOP_OFFLINE') desktopRelayOnline.value = false
    }
  }
  return cloud.relay.call<T>(ns, method, [], 'server').catch(() => empty)
}

const onDesktop = (what: string) => async (): Promise<never> => {
  throw new Error(`${what}要在电脑端操作：打开电脑上的 Klipmill →「模板库」`)
}

type Api = DesktopApi

const templates = {
  list: () => engine<Awaited<ReturnType<Api['templates']['list']>>>('list', []),
  upsert: (payload: Parameters<Api['templates']['upsert']>[0]) => engine<Awaited<ReturnType<Api['templates']['upsert']>>>('upsert', [payload]),
  remove: (id: string) => engine<Awaited<ReturnType<Api['templates']['remove']>>>('remove', [id]),
  analyzeVideo: (payload: Parameters<Api['templates']['analyzeVideo']>[0]) => engine<Awaited<ReturnType<Api['templates']['analyzeVideo']>>>('analyzeVideo', [payload]),
} satisfies Api['templates']

const luts = {
  list: () => desktopThenServer<Awaited<ReturnType<Api['luts']['list']>>>('luts', 'list', []),
} satisfies Api['luts']

const stickers = {
  list: () => desktopThenServer<Awaited<ReturnType<Api['stickers']['list']>>>('stickers', 'list', []),
  listUser: () => desktopThenServer<Awaited<ReturnType<Api['stickers']['listUser']>>>('stickers', 'listUser', { dir: '', files: [] }),
  import: onDesktop('导入贴纸'),
} satisfies Api['stickers']

const fonts = {
  list: () =>
    desktopThenServer<Awaited<ReturnType<Api['fonts']['list']>>>('fonts', 'list', { bundledDir: '', bundledFiles: [], userDir: '', userFiles: [] }),
  import: onDesktop('导入字体'),
} satisfies Pick<Api['fonts'], 'list' | 'import'>

/** 这个页面打开期间替换的 window.api 部分（style 只替换「按文件夹分析」，其余方法照旧） */
export default {
  templates,
  luts,
  stickers,
  fonts,
  style: { analyzeVideos: onDesktop('按文件夹分析视频风格') },
  pickFiles,
  getPathForFile,
}
