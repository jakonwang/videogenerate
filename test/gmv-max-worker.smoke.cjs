const assert = require('node:assert/strict')
const { mkdtemp, rm } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { Worker } = require('node:worker_threads')

async function main() {
  const directory = await mkdtemp(join(tmpdir(), 'gmv-max-worker-'))
  const dataDir = process.env.GMV_MAX_TEST_DATA_DIR || join(directory, '.videogenerate')
  const worker = new Worker(join(process.cwd(), 'out', 'main', 'gmvMaxWorker.js'), {
    workerData: {
      userDataDir: directory,
      dataDir,
      encryptionAvailable: false,
    },
  })

  try {
    let requestId = 0
    const pending = new Map()
    worker.on('message', (message) => {
      if (message.type === 'auth-request') {
        worker.postMessage({ authRequestId: message.authRequestId, result: {} })
        return
      }
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      clearTimeout(request.timeout)
      if (message.error) request.reject(new Error(message.error))
      else request.resolve(message.result)
    })

    const call = (method, args) => new Promise((resolve, reject) => {
      requestId += 1
      const timeout = setTimeout(() => reject(new Error(`GMV MAX worker method timed out: ${method}`)), 30_000)
      pending.set(requestId, { resolve, reject, timeout })
      worker.postMessage({ id: requestId, method, args })
    })

    for (const method of ['getCampaignPage', 'getCreativePage', 'getProductPage', 'getActionPage', 'getAuditPage']) {
      const result = await call(method, [{ page: 1, pageSize: 20 }])
      assert.equal(result.page, 1)
      assert.equal(result.pageSize, 20)
      assert.ok(Number.isInteger(result.total) && result.total >= 0)
      assert.ok(Array.isArray(result.items))
    }
    for (const method of ['getSopWorkspace', 'getCoachWorkspace', 'getCommandCenter']) {
      const result = await call(method, [])
      assert.ok(result && typeof result === 'object')
    }
  } finally {
    await worker.terminate()
    await rm(directory, { recursive: true, force: true })
  }

  console.log('gmv max worker smoke passed')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
