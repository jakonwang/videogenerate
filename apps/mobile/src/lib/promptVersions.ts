import { ref, watch } from 'vue'
import type { SyncPromptVersion } from '@shared/cloud/sync'
import { listRecords, newId, saveRecord, syncState } from './sync'

/**
 * 提示词版本（和电脑端各插件的「提示词版本管理」一样）：保存、复制为新版本、启用、回滚为新版本。
 * 每个工具一个同步集合；第一次打开时用电脑端的默认提示词建一个 V1。
 */

export type PromptVersionItem = SyncPromptVersion & { id: string; updatedAt: number }

export function usePromptVersions(collection: string) {
  const items = ref<PromptVersionItem[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<SyncPromptVersion>(collection)
      items.value = records
        .filter((record) => record.data)
        .map((record) => ({ ...(record.data as SyncPromptVersion), id: record.id, updatedAt: record.updatedAt }))
        .sort((a, b) => b.version - a.version)
    },
    { immediate: true },
  )
  return items
}

/** 还没有任何版本时，建电脑端同名的默认版本（固定 id，多端同时打开也只有一条） */
export async function ensureDefaultPrompt(collection: string, existing: PromptVersionItem[], name: string, prompt: string) {
  if (existing.length) return
  await saveRecord<SyncPromptVersion>(collection, `${collection}-default`, { name, version: 1, prompt, active: true, createdAt: Date.now() })
}

/** 有 id 就更新那个版本，没有就另存为新版本；返回版本 id */
export async function savePromptVersion(collection: string, input: { id?: string; name: string; prompt: string }, all: PromptVersionItem[]) {
  const current = all.find((item) => item.id === input.id)
  if (current) {
    await saveRecord<SyncPromptVersion>(collection, current.id, { name: input.name.trim() || current.name, version: current.version, prompt: input.prompt, active: current.active, createdAt: current.createdAt })
    return current.id
  }
  const id = newId('pv')
  const version = Math.max(0, ...all.map((item) => item.version)) + 1
  await saveRecord<SyncPromptVersion>(collection, id, { name: input.name.trim() || `Version ${version}`, version, prompt: input.prompt, active: false, createdAt: Date.now() })
  return id
}

export async function activatePromptVersion(collection: string, id: string, all: PromptVersionItem[]) {
  for (const item of all) {
    if (item.active === (item.id === id)) continue
    const { id: rowId, updatedAt: _u, ...data } = item
    await saveRecord<SyncPromptVersion>(collection, rowId, { ...data, active: rowId === id })
  }
}

/** 回滚为新版本：把某个旧版本的内容另存为新版本并启用 */
export async function rollbackPromptVersion(collection: string, id: string, all: PromptVersionItem[]) {
  const row = all.find((item) => item.id === id)
  if (!row) return ''
  const newIdValue = await savePromptVersion(collection, { name: `${row.name} (rollback)`, prompt: row.prompt }, all)
  await activatePromptVersion(collection, newIdValue, [...all, { ...row, id: newIdValue, active: false }])
  return newIdValue
}
