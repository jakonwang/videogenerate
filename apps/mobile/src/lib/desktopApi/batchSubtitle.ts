/**
 * 网页版的视频批量字幕：电脑端「视频批量字幕」页面（VideoBatchSubtitleView）在网页上原样显示。
 * 页面的业务调用走 `@/lib/webApiClient`，网页版替身（desktopShims/webApiClient）把它们交给服务器引擎里
 * 同一个本机 Web API 执行（含 Remotion 渲染，全服务器限量排队）。这里只补页面里和本机有关的几处：
 *
 * - 选视频 / 拖入：上传到云端，路径是 cloudfile:（引擎用的时候自动下载）。
 * - 读取视频信息（media.getInfo）：用上传时量到的时长和尺寸。
 * - 打开成片 / 打开所在文件夹：引擎里的文件经云端在新标签页打开（全局 shell 替身已处理）。
 */
import { cloudFileRef, parseCloudFileRef } from '@shared/cloud/relay'
import { cloudFileIdOf, getPathForFile, pickFiles, uploadedMeta } from './files'

async function getInfo(path: string) {
  if (!parseCloudFileRef(path) && !path.startsWith('blob:')) return null
  const fileId = await cloudFileIdOf(path)
  const meta = uploadedMeta(fileId)
  return meta ? { durationSec: meta.durationSec, width: meta.width, height: meta.height, thumbnailPath: meta.posterFileId ? cloudFileRef(meta.posterFileId, 'poster.jpg') : undefined } : null
}

/** 这个页面打开期间替换的 window.api 部分 */
export default {
  pickFiles,
  getPathForFile,
  media: { getInfo },
}
