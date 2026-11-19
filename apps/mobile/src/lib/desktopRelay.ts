/**
 * 网页版的 window.api.tiktokGmvMax / tiktokCreatorHub：电脑端的 GMV Max、达人中心页面在网页上原样复用，
 * 每个调用实时转交给用户的电脑执行（TikTok 登录在电脑上），见 src/shared/cloud/relay.ts。
 */
import { ref } from 'vue'
import { RELAY_NAMESPACES, cloudFileRef, relayAllows, type RelayNamespace } from '@shared/cloud/relay'
import { cloud, errorMessage } from './session'
import { toast } from './toast'
import { openDesktopFile } from './desktopShims/localMedia'

/**
 * 复刻页面打开期间，这些调用改由服务器复刻引擎执行（复刻本身总在服务器上；商品列表要用服务器引擎里的商品 id）。
 * 由 WebClone / WebCloneProject 在挂载时设置、卸载时清除。
 */
const serverTargetCount = new Map<string, number>()
const serverTargets = { has: (ns: string) => (serverTargetCount.get(ns) ?? 0) > 0 }
export function useServerTargetFor(ns: RelayNamespace, on: boolean) {
  // Counted: the next page may mount before the previous one unmounts.
  serverTargetCount.set(ns, Math.max(0, (serverTargetCount.get(ns) ?? 0) + (on ? 1 : -1)))
}

/** 电脑端是否在线（能接实时调用）；页面上方的提示条用 */
export const desktopRelayOnline = ref<boolean | null>(null)

export async function refreshDesktopRelayStatus() {
  try {
    desktopRelayOnline.value = (await cloud.relay.status()).online
  } catch {
    desktopRelayOnline.value = false
  }
  return desktopRelayOnline.value
}

const LOCAL: Partial<Record<RelayNamespace, Record<string, (...args: any[]) => unknown>>> = {
  tiktokGmvMax: {
    // Progress events come from the computer's window; the web page reads progress via getSyncJob instead.
    onSyncProgress: () => () => undefined,
    selectEvidenceAttachment: async () => {
      throw new Error('上传凭证附件请在电脑端操作')
    },
  },
  dianxiaomiInventory: {
    openLogin: async () => {
      throw new Error('店小秘登录要在电脑端完成：打开电脑上的 TiktokCut → 店小秘库存 → 登录')
    },
  },
  tiktokCreatorHub: {
    openBackend: async () => {
      throw new Error('店铺后台带着电脑上的登录，只能在电脑端打开')
    },
    openCreatorBackend: async () => {
      throw new Error('达人后台带着电脑上的登录，只能在电脑端打开')
    },
  },
}

function proxyFor(ns: RelayNamespace) {
  return new Proxy({} as Record<string, (...args: unknown[]) => Promise<unknown>>, {
    get(_target, method) {
      if (typeof method !== 'string' || method === 'then') return undefined
      const local = LOCAL[ns]?.[method]
      if (local) return local
      // Event subscriptions (onChanged, onProgress…) cannot cross the relay: pages refresh by polling instead.
      if (/^on[A-Z]/.test(method)) return () => () => undefined
      if (!relayAllows(ns, method)) return async () => { throw new Error('这个操作需要在电脑端完成') }
      return async (...args: unknown[]) => {
        try {
          // clone / livePhoto always run on the server engine (services/cloud/src/cloneEngine.ts)
          const toServer = ns === 'clone' || ns === 'livePhoto' || serverTargets.has(ns)
          const result = await cloud.relay.call(ns, method, args, serverTargets.has(ns) ? 'server' : undefined)
          if (!toServer) desktopRelayOnline.value = true
          return result
        } catch (error) {
          if ((error as { code?: string })?.code === 'DESKTOP_OFFLINE') desktopRelayOnline.value = false
          throw error
        }
      }
    },
  })
}

/**
 * 电脑端页面里的「选择文件」（window.api.pickFiles）：在网页上选本地文件，先传到云端，
 * 返回 `cloudfile:` 引用；经电脑代办交给电脑时由电脑下载成本地路径。
 */
function pickFilesViaCloud(options: { multiple?: boolean; filters?: Array<{ extensions: string[] }> } = {}) {
  return new Promise<string[]>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = options.multiple !== false
    const exts = (options.filters ?? []).flatMap((f) => f.extensions).filter((e) => e && e !== '*')
    if (exts.length) input.accept = exts.map((e) => `.${e}`).join(',')
    input.onchange = async () => {
      const files = Array.from(input.files ?? [])
      const refs: string[] = []
      for (const file of files) {
        const { fileId } = await cloud.sync.uploadFile(file, file.type || 'application/octet-stream')
        refs.push(cloudFileRef(fileId, file.name))
      }
      resolve(refs)
    }
    input.oncancel = () => resolve([])
    input.click()
  })
}

export function installDesktopRelayApi() {
  const w = window as unknown as { api?: Record<string, unknown> }
  // clone / mixStudio only expose a few methods (see RELAY_MODULES); other web code never uses them.
  w.api = { ...(w.api ?? {}), ...Object.fromEntries(RELAY_NAMESPACES.map((ns) => [ns, proxyFor(ns)])) }
  w.api.pickFiles ??= pickFilesViaCloud
  // 电脑端页面的「打开文件 / 在文件夹中显示」：把电脑上的文件经云端在新标签页打开；导出到电脑文件夹要在电脑端做
  // Merged: lib/researchApi installs shell.openExternal first.
  w.api.shell = {
    openPath: (path: string) => openDesktopFile(path).then(() => '').catch((error) => toast(errorMessage(error))),
    showItemInFolder: (path: string) => openDesktopFile(path).catch((error) => toast(errorMessage(error))),
    ...((w.api.shell as object | undefined) ?? {}),
  }
  const desktopOnly = async () => {
    toast('选择电脑上的文件夹要在电脑端操作；网页上可以在作品库下载成片')
    return null
  }
  w.api.pickDir ??= desktopOnly
  w.api.saveFileAs ??= desktopOnly
}
