/**
 * 复刻项目同步（电脑端 ↔ 服务器）：两边都用电脑端同一套复刻引擎，项目格式相同。
 *
 * - 同步记录（集合 clone-workspaces，id = 项目 id）只放列表要用的摘要和文件清单；
 * - 完整项目 JSON 压缩后作为文件上传（docFileId），里面用到的图片 / 视频各自上传；
 * - 另一端下载后把路径换成本机路径再导入。
 */
export type SyncCloneWorkspace = {
  title: string
  status: string
  /** 项目自己的 updatedAt（两边谁新用谁） */
  projectUpdatedAt: number
  createdAt: number
  /** 完整项目（gzip JSON） */
  docFileId: string
  /** 项目用到的全部云端文件（存储清理按这里判断文件是否还在用） */
  files: string[]
  coverFileId?: string
  /** 最新成片 */
  finalVideoFileId?: string
  groupName?: string
  /** 最后一次是哪一端改的 */
  origin: 'desktop' | 'server'
}

/** 完整项目文件的内容 */
export type CloneWorkspaceDoc = {
  version: 1
  /** 来源机器上的数据目录：项目里以它开头的路径换成本机对应目录 */
  roots: string[]
  project: Record<string, unknown>
  /** 原路径 → 云端文件 */
  files: Record<string, { fileId: string; mime: string }>
}
