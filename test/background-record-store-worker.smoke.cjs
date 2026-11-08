const assert = require('node:assert/strict')
const { mkdtemp, rm, writeFile } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { Worker } = require('node:worker_threads')

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'background-record-store-'))
  const databasePath = join(directory, 'records.sqlite')
  const legacyPath = join(directory, 'legacy.json')
  const workerPath = join(process.cwd(), 'out', 'main', 'backgroundRecordStoreWorker.js')
  const worker = new Worker(workerPath, { workerData: { databasePath } })
  let requestId = 0
  const pending = new Map()

  worker.on('message', (message) => {
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error))
    else request.resolve(message.result)
  })

  function call(action, payload) {
    requestId += 1
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      worker.postMessage({ id: requestId, action, ...payload })
    })
  }

  try {
    await writeFile(
      legacyPath,
      JSON.stringify({ tasks: [{ id: 'legacy-1', status: 'queued' }] }),
      'utf8'
    )
    await call('migrate', {
      namespace: 'smoke',
      filePath: legacyPath,
      rootKey: 'tasks'
    })
    await call('upsert', {
      namespace: 'smoke',
      value: { id: 'active-1', status: 'processing' }
    })
    const page = await call('list', { namespace: 'smoke', offset: 0, limit: 1 })
    assert.equal(page.total, 2)
    assert.equal(page.items.length, 1)
    assert.equal((await call('get', { namespace: 'smoke', key: 'legacy-1' })).id, 'legacy-1')
    await call('remove', { namespace: 'smoke', key: 'active-1' })
    assert.equal((await call('list', { namespace: 'smoke', offset: 0, limit: 10 })).total, 1)
  } finally {
    await worker.terminate()
    await rm(directory, { recursive: true, force: true })
  }

  console.log('background record store worker smoke passed')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
