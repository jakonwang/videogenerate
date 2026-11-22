import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { normalizeMatrixAccount } from '../src/shared/publishMatrix'

const MIN = 60_000

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-warmup-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  try {
    const { planWarmup, geelarkWarmup, setWarmupTestDependencies, localDay } = await import('../src/main/modules/tiktok-publisher/geelarkWarmup')
    const at = (h: number, m = 0, day = 22) => new Date(2026, 10, day, h, m).getTime()

    // Settings: keywords are cleaned, minutes clamped, empty minutes = default.
    const a = normalizeMatrixAccount('x', { warmupKeywords: ' 耳环，jewelry、 pearl ,, ', warmupMinutes: 500 })
    assert.equal(a.warmupKeywords, '耳环, jewelry, pearl')
    assert.equal(a.warmupMinutes, 60)
    assert.equal(normalizeMatrixAccount('x', { warmupMinutes: '' as any }).warmupMinutes, undefined)

    const accounts = [
      normalizeMatrixAccount('geelark:PH1:tiktok', { warmupUntil: '2026-11-30', warmupKeywords: '耳环, jewelry', warmupMinutes: 15 }),
      normalizeMatrixAccount('geelark:PH2:tiktok', { warmupUntil: '2026-11-21' }), // warm-up already over
      normalizeMatrixAccount('geelark:PH3:youtube', { warmupUntil: '2026-11-30' }), // GeeLark warm-up is TikTok only
      normalizeMatrixAccount('7012345', { warmupUntil: '2026-11-30' }), // CreatOK account: not a cloud phone
      normalizeMatrixAccount('geelark:PH4:tiktok', { warmupUntil: '2026-11-30', paused: true }),
      normalizeMatrixAccount('geelark:PH5:tiktok', { warmupUntil: '2026-11-30', activeStartHour: 20, activeEndHour: 22 }),
    ]
    const plans = planWarmup({ accounts, logs: [], now: at(10), random: () => 0.5 })
    assert.deepEqual(plans.map((plan) => plan.uid), ['geelark:PH1:tiktok', 'geelark:PH5:tiktok'])
    const p1 = plans[0]!
    assert.equal(p1.minutes, 15)
    // inside the active window (10:05 … 23:00 − 20 min), not at a fixed time
    assert.ok(p1.scheduleAt >= at(10, 5) && p1.scheduleAt <= at(22, 40), new Date(p1.scheduleAt).toString())
    assert.ok(plans[1]!.scheduleAt >= at(20) && plans[1]!.scheduleAt <= at(21, 35))
    // keyword days and browse days alternate
    const tomorrow = planWarmup({ accounts: [accounts[0]!], logs: [], now: at(10, 0, 23), random: () => 0 })
    assert.notEqual(tomorrow[0]!.action, p1.action)
    assert.deepEqual((p1.action === 'search video' ? p1 : tomorrow[0]!).keywords, ['耳环', 'jewelry'])
    // too late today → nothing until tomorrow
    assert.equal(planWarmup({ accounts: [accounts[0]!], logs: [], now: at(22, 50) }).length, 0)

    // run → one GeeLark warm-up task per account per day; sync maps results; failures stop after 2 tries a day.
    let now = at(10)
    const requests: any[] = []
    let failAdd = false
    const status: Record<string, number> = {}
    setWarmupTestDependencies({
      now: () => now,
      configured: async () => true,
      accounts: async () => accounts,
      request: (async (p: string, body: any) => {
        requests.push({ p, body })
        if (p === '/open/v1/task/add') {
          if (failAdd) throw new Error('GeeLark：phone is off')
          const id = `W${requests.length}`
          status[id] = 1
          return { taskIds: [id] }
        }
        return { items: body.ids.map((id: string) => ({ id, status: status[id], failCode: status[id] === 4 ? 20100 : undefined })) }
      }) as any,
    })
    assert.deepEqual(await geelarkWarmup.run(), { created: 2 })
    const add = requests.find((r) => r.p === '/open/v1/task/add')!
    assert.equal(add.body.taskType, 2)
    assert.deepEqual(Object.keys(add.body.list[0]).sort(), (add.body.list[0].keywords ? ['action', 'duration', 'envId', 'keywords', 'scheduleAt'] : ['action', 'duration', 'envId', 'scheduleAt']).sort())
    assert.equal(add.body.list[0].envId, 'PH1')
    assert.equal(add.body.list[0].duration, 15)
    assert.equal(add.body.list[0].scheduleAt, Math.floor(add.body.list[0].scheduleAt))
    assert.deepEqual(await geelarkWarmup.run(), { created: 0 }, 'once a day')

    status.W1 = 3
    status[Object.keys(status)[1]!] = 4
    const s = await geelarkWarmup.status()
    assert.equal(s['geelark:PH1:tiktok']!.today!.state, 'done')
    assert.equal(s['geelark:PH1:tiktok']!.doneDays, 1)
    assert.match(s['geelark:PH5:tiktok']!.today!.error!, /没有网络/)

    // PH5 failed today → retried once more; a second failure stops it for the day.
    failAdd = true
    await geelarkWarmup.run()
    await geelarkWarmup.run()
    const tries = requests.filter((r) => r.p === '/open/v1/task/add' && r.body.list[0].envId === 'PH5').length
    assert.equal(tries, 2, 'at most 2 attempts a day after failures')

    // Next day: both scheduled again.
    failAdd = false
    now = at(9, 30, 23)
    assert.deepEqual(await geelarkWarmup.run(), { created: 2 })
    assert.equal(localDay(now), '2026-11-23')

    // Not connected to GeeLark → nothing happens.
    setWarmupTestDependencies({ configured: async () => false })
    now = at(9, 30, 24)
    assert.deepEqual(await geelarkWarmup.run(), { created: 0 })
    console.log('geelark-warmup smoke passed')
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
