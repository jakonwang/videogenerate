/**
 * 网页版的 Muse创意室：电脑在线时显示电脑端页面本身，window.api.museCreative 经电脑代办交给电脑执行（lib/desktopRelay）。
 * 这里补页面里和本机有关的部分，做法同 creativeStudio。
 */
import type { MuseJob } from '../../../../../src/main/modules/muse-creative-studio/types'
import { cloud, errorMessage } from '../session'
import { fileBlob } from '../files'
import { downloadBlob } from '../platform'
import { getPathForFile, pickFiles } from './files'
import imageMaterialsApi from './productImageMaterials'

const BROWSER_DOWNLOAD = '浏览器下载'

/** 选中的成片：电脑把视频传到云端，浏览器逐个下载 */
async function exportJobs(input: { ids: string[] }) {
  let done = 0
  let failure = ''
  for (const id of input.ids) {
    try {
      const job = await cloud.relay.call<MuseJob>('museCreative', 'getJob', [id])
      const source = job.subtitleVideoPath || job.result?.videoPath
      if (!source) throw new Error('视频还没生成好')
      const { fileId } = await cloud.relay.call<{ fileId: string }>('media', 'publish', [{ path: source }])
      downloadBlob(await fileBlob(fileId), `${(job.productName || 'muse').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60)}-${id.slice(0, 8)}.mp4`)
      done += 1
    } catch (error) {
      failure = errorMessage(error)
    }
  }
  if (!done) throw new Error(failure || '没有可以下载的视频')
  return { done, outputDir: BROWSER_DOWNLOAD }
}

export default {
  museCreative: { exportJobs },
  productImageMaterials: {
    listMaterials: imageMaterialsApi.productImageMaterials.listMaterials,
    updateUsageStatus: imageMaterialsApi.productImageMaterials.updateUsageStatus,
  },
  pickFiles,
  getPathForFile,
  pickDir: async () => BROWSER_DOWNLOAD,
}
