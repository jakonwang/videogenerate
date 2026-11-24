import { copyFile, link, rm, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

export const onCloudEngine = () => process.env.VIDEOGENERATE_CLONE_ENGINE === '1'

/**
 * 云端引擎里同样内容只占一份空间（硬链接）；电脑端照常复制。
 * 目标先删再写：它可能和别的文件是同一份内容，原地覆盖会把那些文件一起改掉。
 * 只链接实况图的生成结果和 still，其余文件（预览、别的模块的）可能会被原地改写。
 */
export async function replaceWithLink(sourcePath: string, outputPath: string, livePhotoDir: string) {
  if (!onCloudEngine()) return copyFile(sourcePath, outputPath)
  const [source, target] = await Promise.all([stat(sourcePath), stat(outputPath).catch(() => null)])
  if (target && target.dev === source.dev && target.ino === source.ino) return
  await rm(outputPath, { force: true })
  if (resolve(sourcePath).startsWith(resolve(livePhotoDir) + sep) && /[\\/](generated-(still|video)[\\/][^\\/]+|still\.\w+)$/.test(sourcePath)) {
    try {
      return await link(sourcePath, outputPath)
    } catch {
      // 不支持硬链接：改为复制
    }
  }
  await copyFile(sourcePath, outputPath)
}
