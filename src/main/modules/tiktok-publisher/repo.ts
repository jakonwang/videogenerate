import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { backgroundRecordStore } from '../../lib/backgroundRecordStore'
import type { CreatokPublishTask } from './types'

const path = () => join(getAppPaths().dbDir, 'tiktok-creatok-publisher.json')
const STORE_NAMESPACE = 'tiktok-creatok-publisher-tasks'
let migrationPromise: Promise<{ migrated: number }> | null = null
function ensureMigrated() {
  migrationPromise ||= backgroundRecordStore.migrate(STORE_NAMESPACE, path(), 'tasks')
  return migrationPromise
}
export const creatokPublisherRepo = {
  async list() { await ensureMigrated(); return (await backgroundRecordStore.list<CreatokPublishTask>(STORE_NAMESPACE, { limit: 10_000 })).items },
  async listPage(input: { offset?: number; limit?: number } = {}) { await ensureMigrated(); return backgroundRecordStore.list<CreatokPublishTask>(STORE_NAMESPACE, input) },
  async get(id: string) { await ensureMigrated(); return backgroundRecordStore.get<CreatokPublishTask>(STORE_NAMESPACE, id) },
  async remove(id: string) {
    await ensureMigrated()
    return backgroundRecordStore.remove(STORE_NAMESPACE, id)
  },
  async upsert(task: CreatokPublishTask) { await ensureMigrated(); await backgroundRecordStore.upsert(STORE_NAMESPACE, task as unknown as Record<string, unknown>); return task },
  async upsertMany(tasks: CreatokPublishTask[]) {
    if (!tasks.length) return []
    await ensureMigrated()
    await backgroundRecordStore.upsertMany(STORE_NAMESPACE, tasks as unknown as Array<Record<string, unknown>>)
    return tasks
  },
}
