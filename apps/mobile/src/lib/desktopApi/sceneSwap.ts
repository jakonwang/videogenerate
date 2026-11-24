/**
 * 网页版的批量换景接口：电脑端「AI 修图」页面在网页上原样显示。
 * 批次和队列都在云端（和电脑、手机同一份），这里只负责浏览器里的选图、上传和下载。
 */
import { cloudFileRef } from '@shared/cloud/relay'
import { uploadSceneImage } from '../sceneSwap'
import { fileBlob } from '../files'
import { downloadBlob } from '../platform'
import { cloud } from '../session'
import type { DesktopApi } from './contract'
import { chooseFiles, droppedFile, fileNameOf, getPathForFile } from './files'

const IMAGE = /\.(jpe?g|png|webp)$/i
const asPaths = (files: File[]) => files.filter((file) => file.type.startsWith('image/') || IMAGE.test(file.name)).map((file) => ({ path: getPathForFile(file), name: file.name }))

function chooseFolder(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.onchange = () => resolve(Array.from(input.files ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))
    input.oncancel = () => resolve([])
    input.click()
  })
}

const sceneSwap = {
  pick: async (kind: 'files' | 'folder') => asPaths(kind === 'folder' ? await chooseFolder() : await chooseFiles('image/jpeg,image/png,image/webp', true)),
  expandPaths: async (paths: string[]) => paths.filter((path) => IMAGE.test(path)).map((path) => ({ path, name: fileNameOf(path) })),
  upload: async (path: string) => {
    const file = droppedFile(path)
    if (!file) throw new Error('这个文件已经失效，请重新选择')
    return { fileId: (await uploadSceneImage(file)).fileId }
  },
  imagePath: async (fileId: string) => cloudFileRef(fileId, 'image.jpg'),
  info: () => cloud.sceneSwap.info(),
  list: () => cloud.sceneSwap.list(),
  create: (input) => cloud.sceneSwap.create(input),
  remove: (id) => cloud.sceneSwap.remove(id),
  action: (id, action) => cloud.sceneSwap.action(id, action),
  item: (id, itemId, action, reasons) => cloud.sceneSwap.item(id, itemId, action, reasons),
  addScene: (input) => cloud.sceneSwap.addScene(input),
  removeScene: (id) => cloud.sceneSwap.removeScene(id),
  exportResults: async (files: Array<{ fileId: string; name: string }>) => {
    const used = new Map<string, number>()
    for (const file of files) {
      const base = file.name.replace(/[\\/:*?"<>|]+/g, '_') || 'image'
      const n = (used.get(base) ?? 0) + 1
      used.set(base, n)
      downloadBlob(await fileBlob(file.fileId), `${base}${n > 1 ? `_${n}` : ''}.jpg`)
      // 连续下载留点间隔，否则浏览器会丢掉一部分
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return { canceled: false, count: files.length }
  },
} satisfies DesktopApi['sceneSwap']

export default { sceneSwap, getPathForFile }
