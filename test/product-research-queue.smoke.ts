// 选品手机连接：任务按台排队（手机一次只跑一个）、手机离线时先排队、断线重连重发、/hello 认电脑。
// 用法：npx tsx test/product-research-queue.smoke.ts（用 KLIPMILL_RESEARCH_PORT 避开正在运行的软件）
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket } from 'ws'

process.env.KLIPMILL_RESEARCH_PORT = process.env.KLIPMILL_RESEARCH_PORT || '41699'
const PORT = Number(process.env.KLIPMILL_RESEARCH_PORT)

type Msg = { type: string; task?: { id: string; keyword: string }; taskId?: string }

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'pr-queue-'))
  const { configureAppPathRuntime } = await import('../src/main/lib/paths')
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  const { productResearchService: service } = await import('../src/main/modules/product-research/service')
  const base = `http://127.0.0.1:${PORT}`
  try {
    await service.ensureServer()

    // /hello 返回本机 serverId
    const hello = await (await fetch(`${base}/hello`)).json() as { app: string; serverId: string }
    assert.equal(hello.app, 'klipmill-research')
    assert.ok(hello.serverId)

    // 二维码带全部地址
    const pairing = await service.createPairing()
    assert.ok(pairing.endpoints && pairing.endpoints.length >= 1)
    assert.equal(pairing.endpoints[0], pairing.endpoint)

    const paired = await (await fetch(`${base}/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pair', pairingCode: pairing.pairingCode, deviceId: 'phone-1', deviceName: 'Test Phone' }),
    })).json() as { token: string; serverId: string; endpoints: string[] }
    assert.ok(paired.token)
    assert.equal(paired.serverId, hello.serverId)

    // 手机离线时也能建任务：先排队
    const t1 = await service.createTask({ keyword: 'a', targetCount: 5 })
    const t2 = await service.createTask({ keyword: 'b', targetCount: 5 })
    const t3 = await service.createTask({ keyword: 'c', targetCount: 5 })
    assert.equal(t1.status, 'queued')

    const received: Msg[] = []
    const connectPhone = () => new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?deviceId=phone-1&token=${encodeURIComponent(paired.token)}`)
      ws.on('message', (data) => received.push(JSON.parse(String(data)) as Msg))
      ws.on('open', () => resolve(ws))
      ws.on('error', reject)
    })
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    const collects = () => received.filter((item) => item.type === 'collect_task').map((item) => item.task!.id)

    let phone = await connectPhone()
    await wait(300)
    // 手机连上后只下发最早的一个
    assert.deepEqual(collects(), [t1.id], 'only the oldest task is dispatched')

    phone.send(JSON.stringify({ type: 'task_progress', taskId: t1.id }))
    await wait(200)

    // 断线重连：把手上的 t1 重发，不发 t2
    phone.terminate()
    await wait(200)
    received.length = 0
    phone = await connectPhone()
    await wait(300)
    assert.deepEqual(collects(), [t1.id], 'in-flight task is re-sent after reconnect')

    // 手机回「已有任务在跑」不算失败
    phone.send(JSON.stringify({ type: 'task_error', taskId: t1.id, error: 'Another task is already running.' }))
    await wait(200)
    let snap = await service.snapshot()
    assert.equal(snap.tasks.find((item) => item.id === t1.id)?.status, 'running')

    // t1 完成后才下发 t2
    received.length = 0
    phone.send(JSON.stringify({ type: 'task_complete', taskId: t1.id }))
    await wait(300)
    assert.deepEqual(collects(), [t2.id], 'next task after completion')

    // t2 失败后接着下发 t3
    received.length = 0
    phone.send(JSON.stringify({ type: 'task_error', taskId: t2.id, error: 'Search entry was not found.' }))
    await wait(300)
    assert.deepEqual(collects(), [t3.id], 'next task after failure')
    snap = await service.snapshot()
    assert.equal(snap.tasks.find((item) => item.id === t2.id)?.status, 'failed')

    // 取消正在跑的 t3：给手机发取消
    received.length = 0
    await service.cancelTask(t3.id)
    await wait(200)
    assert.ok(received.some((item) => item.type === 'cancel_task' && item.taskId === t3.id))

    phone.terminate()
    console.log('product-research queue smoke: ok')
  } finally {
    await service.stop()
    await rm(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
