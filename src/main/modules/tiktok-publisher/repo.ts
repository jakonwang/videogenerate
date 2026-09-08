import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { readJsonFile, writeJsonFile } from '../../lib/storeJson'
import type { CreatokPublishTask } from './types'

type Db = { tasks: CreatokPublishTask[] }
const path = () => join(getAppPaths().dbDir, 'tiktok-creatok-publisher.json')
export const creatokPublisherRepo = {
  async list() { const db = await readJsonFile<Db>(path(), { tasks: [] }); return db.tasks.sort((a, b) => b.updatedAt - a.updatedAt) },
  async get(id: string) { return (await this.list()).find((item) => item.id === id) || null },
  async remove(id: string) {
    const db = await readJsonFile<Db>(path(), { tasks: [] });
    const before = db.tasks.length;
    db.tasks = db.tasks.filter((item) => item.id !== id);
    if (db.tasks.length !== before) await writeJsonFile(path(), db);
    return db.tasks.length !== before;
  },
  async upsert(task: CreatokPublishTask) { const db = await readJsonFile<Db>(path(), { tasks: [] }); const index = db.tasks.findIndex((item) => item.id === task.id); if (index >= 0) db.tasks[index] = task; else db.tasks.unshift(task); await writeJsonFile(path(), db); return task },
  async upsertMany(tasks: CreatokPublishTask[]) {
    if (!tasks.length) return []
    const db = await readJsonFile<Db>(path(), { tasks: [] })
    const byId = new Map(db.tasks.map((item) => [item.id, item]))
    for (const task of tasks) byId.set(task.id, task)
    db.tasks = Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt)
    await writeJsonFile(path(), db)
    return tasks
  },
}
