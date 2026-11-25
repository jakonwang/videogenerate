/**
 * 网页版接口共用：电脑端各插件的「提示词版本管理」（列出 / 保存 / 启用 / 回滚），
 * 数据在各自的同步集合里（lib/promptVersions），第一次打开时建电脑端同名的默认版本。
 */
import type { SyncPromptVersion } from '@shared/cloud/sync'
import { activatePromptVersion, ensureDefaultPrompt, rollbackPromptVersion, savePromptVersion, type PromptVersionItem } from '../promptVersions'
import { listRecords } from '../sync'

function hashOf(text: string) {
  // FNV-1a，两遍拼成 16 位十六进制：只用来在版本列表里区分内容
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < text.length; i += 1) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193) >>> 0
    b = Math.imul(b ^ text.charCodeAt(text.length - 1 - i), 0x811c9dc5) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

export function promptVersionApi(collection: string, defaultName: string, defaultPrompt: string, upgrade: <T extends { name: string; prompt: string }>(version: T) => T = (version) => version) {
  async function rows(): Promise<PromptVersionItem[]> {
    const read = async () =>
      (await listRecords<SyncPromptVersion>(collection))
        .filter((record) => record.data)
        .map((record) => upgrade({ ...(record.data as SyncPromptVersion), id: record.id, updatedAt: record.updatedAt }))
        .sort((a, b) => b.version - a.version)
    const list = await read()
    if (list.length) return list
    await ensureDefaultPrompt(collection, list, defaultName, defaultPrompt)
    return read()
  }

  const toDesktop = (row: PromptVersionItem) => ({ id: row.id, name: row.name, version: row.version, prompt: row.prompt, promptHash: hashOf(row.prompt), active: row.active, createdAt: row.createdAt, updatedAt: row.updatedAt })

  async function byId(id: string) {
    const row = (await rows()).find((item) => item.id === id)
    if (!row) throw new Error('提示词版本不存在，请刷新后重试')
    return toDesktop(row)
  }

  return {
    rows,
    listPromptVersions: async () => (await rows()).map(toDesktop),
    savePromptVersion: async (payload: { id?: string; name?: string; prompt: string }) => byId(await savePromptVersion(collection, { id: payload.id, name: payload.name ?? '', prompt: payload.prompt }, await rows())),
    activatePromptVersion: async (id: string) => {
      await activatePromptVersion(collection, id, await rows())
      return byId(id)
    },
    rollbackPromptVersion: async (id: string) => byId(await rollbackPromptVersion(collection, id, await rows())),
  }
}
