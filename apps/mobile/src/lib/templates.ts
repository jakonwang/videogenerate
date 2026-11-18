import { ref, watch } from 'vue'
import { SYNC_COLLECTIONS, type SyncTemplate } from '@shared/cloud/sync'
import { defaultSyncTemplate, normalizeSyncTemplate, templateMixOptions } from '@shared/cloud/templates'
import { deleteRecord, listRecords, newId, saveRecord, syncState } from './sync'

/** 混剪模板库（和电脑端「模板库」同步） */
export type TemplateItem = SyncTemplate & { id: string; updatedAt: number }

export function useTemplates() {
  const items = ref<TemplateItem[]>([])
  watch(
    () => syncState.version,
    async () => {
      const records = await listRecords<SyncTemplate>(SYNC_COLLECTIONS.templates)
      items.value = records
        .filter((record) => record.data)
        .map((record) => ({ ...normalizeSyncTemplate(record.data), id: record.id, updatedAt: record.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    },
    { immediate: true },
  )
  return items
}

export async function createTemplate(name: string) {
  const id = newId('tpl')
  await saveRecord<SyncTemplate>(SYNC_COLLECTIONS.templates, id, defaultSyncTemplate(name.trim() || '新模板'))
  return id
}

export async function saveTemplate(id: string, template: SyncTemplate) {
  await saveRecord<SyncTemplate>(SYNC_COLLECTIONS.templates, id, normalizeSyncTemplate(template))
}

export async function removeTemplate(id: string) {
  await deleteRecord(SYNC_COLLECTIONS.templates, id)
}

/** 编辑时「组间空一行」：一组 = 一条视频的标题（首行标题，其余是装饰行） */
export const titlesToText = (titles: string[]) => titles.join('\n\n')
export const textToTitles = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((group) => group.trim())
    .filter(Boolean)

export { templateMixOptions }
