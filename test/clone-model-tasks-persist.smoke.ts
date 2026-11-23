/**
 * 模特库「创建模特」：新建的模特任务要能读回来（以前 readDb 漏掉了 modelTasks，列表总是空的，
 * 生成时报「Model task does not exist」，而且 readDb 回写时会把模特任务全部删掉）。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vg-model-tasks-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  const { cloneService } = await import('../src/main/modules/clone/service')
  const { cloneRepo } = await import('../src/main/modules/clone/repo')
  const { closeCloneSqlite } = await import('../src/main/modules/clone/sqlite')

  const task = await cloneService.createModelTask({ title: '模特生成任务', productType: 'general' })
  assert.deepEqual((await cloneService.listModelTasks()).map((t) => t.id), [task.id])
  assert.equal((await cloneRepo.getModelTask(task.id))?.id, task.id)

  // readDb rewrites the store when it normalizes data; model tasks must survive that.
  await cloneRepo.upsertModelIdentity({ id: 'm1', name: 'A', status: 'done', imagePaths: [] } as never).catch(() => undefined)
  await cloneRepo.readDb()
  assert.equal((await cloneService.listModelTasks()).length, 1)

  closeCloneSqlite()
  await rm(root, { recursive: true, force: true }).catch(() => undefined)
  console.log('clone-model-tasks-persist smoke ok')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
