/**
 * 网页版接口共用：电脑端页面里的「选文件」「拖入文件」在网页上怎么变成路径。
 *
 * - 选文件（pickFiles）：浏览器选好后传到云端，路径是 `cloudfile:<fileId>/<名字>`。
 * - 拖入文件（getPathForFile，电脑端要同步拿到路径）：先给一个本地临时路径
 *   `blob:…#/<名字>`（能直接显示、结尾带扩展名，页面的格式检查照常），用到时再用 cloudFileIdOf 上传。
 */
import { cloudFileRef, parseCloudFileRef } from '@shared/cloud/relay'
import { uploadVideo } from '../assets'
import { uploadRaw } from '../files'
import { errorMessage } from '../session'
import { toast } from '../toast'

const VIDEO_EXT = /^(mp4|mov|webm|mkv|m4v)$/i

export function chooseFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

/** 上传时就知道的文件信息（大小、视频时长和尺寸），按 fileId 记住，页面「读取视频信息」时直接用 */
export type UploadedMeta = { size: number; durationSec?: number; width?: number; height?: number; posterFileId?: string }
const metas = new Map<string, UploadedMeta>()
export const uploadedMeta = (fileId: string) => metas.get(fileId)

/** 原样上传（视频走素材上传：有大小检查和封面），返回 cloudfile 路径 */
async function uploadAsRef(file: File) {
  const isVideo = file.type.startsWith('video/') || VIDEO_EXT.test(file.name.split('.').pop() || '')
  if (isVideo) {
    const video = await uploadVideo(file)
    metas.set(video.fileId, { size: video.size || file.size, durationSec: video.durationSec, width: video.width, height: video.height, posterFileId: video.posterFileId })
    return cloudFileRef(video.fileId, file.name)
  }
  const { fileId } = await uploadRaw(file, file.type || 'application/octet-stream')
  metas.set(fileId, { size: file.size })
  return cloudFileRef(fileId, file.name)
}

/** 电脑端 window.api.pickFiles 的网页版：选文件 → 上传 → cloudfile 路径；上传较慢，给出提示 */
export async function pickFiles(options: { multiple?: boolean; filters?: Array<{ extensions: string[] }> } = {}) {
  const exts = (options.filters ?? []).flatMap((filter) => filter.extensions).filter((ext) => ext && ext !== '*')
  const files = await chooseFiles(exts.length ? exts.map((ext) => `.${ext}`).join(',') : '', options.multiple !== false)
  if (!files.length) return []
  toast(`正在上传 ${files.length} 个文件…`)
  const refs: string[] = []
  for (const file of files) {
    try {
      refs.push(await uploadAsRef(file))
    } catch (error) {
      toast(`「${file.name}」上传失败：${errorMessage(error)}`)
    }
  }
  return refs
}

/* ------------------------------------------------------------------ 拖入的文件 */

const dropped = new Map<string, File>()

/** 电脑端 window.api.getPathForFile 的网页版 */
export function getPathForFile(file: File) {
  const path = `${URL.createObjectURL(file)}#/${file.name.replace(/[\\/#]+/g, '_')}`
  dropped.set(path, file)
  return path
}

/** 拖入时记下的原文件（素材库导入时直接按素材上传） */
export const droppedFile = (path: string) => dropped.get(path)

/** 页面交回来的路径 → 云端 fileId（拖入的文件这时才上传，同一个只传一次） */
const uploads = new Map<string, Promise<string>>()
export async function cloudFileIdOf(path: string): Promise<string> {
  const ref = parseCloudFileRef(path)
  if (ref) return ref.fileId
  const file = dropped.get(path)
  if (!file) throw new Error('这个文件不在云端，请重新添加')
  let pending = uploads.get(path)
  if (!pending) {
    pending = uploadAsRef(file).then((value) => parseCloudFileRef(value)!.fileId)
    pending.catch(() => uploads.delete(path))
    uploads.set(path, pending)
  }
  return pending
}

/** 路径里的文件名（cloudfile 和拖入的临时路径都以 /<名字> 结尾） */
export const fileNameOf = (path: string) => String(path).split(/[\\/]/).pop() || path
