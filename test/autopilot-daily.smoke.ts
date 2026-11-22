import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

const DAY = 86_400_000

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogen-autopilot-daily-'))
  process.env.VIDEOGENERATE_DATA_DIR = root
  configureAppPathRuntime({ dataDir: root, userDataDir: root })
  try {
    const { autopilot, setAutopilotTestDependencies, autopilotDayKey } = await import('../src/main/modules/content-hub/autopilot')
    const { performanceLinkStore } = await import('../src/main/modules/content-hub/stores')
    const { gmvMaxRepo, closeGmvMaxSqlite } = await import('../src/main/modules/tiktok-gmv-max/sqlite')

    let now = new Date(2026, 10, 22, 10, 0, 0).getTime()
    const signals: Record<string, any[]> = {
      // Losing money: only the stop-loss reminder, its fatigue signal is not acted on.
      p1: [{ key: 'ads_unprofitable', level: 'warning', action: 'open_ads', params: { roi: 1.2, breakEvenRoi: 1.9 } }, { key: 'ads_fatigue', level: 'warning', action: 'replenish', params: { name: 'old', creativeId: '7100000000000000001', share: 80, previousRoi: 3, recentRoi: 1.5 } }],
      // Fatigue on a creative made here (clone project) → variants of that project.
      p2: [{ key: 'ads_fatigue', level: 'warning', action: 'replenish', params: { name: '开箱', creativeId: '7200000000000000001', share: 60, previousRoi: 3, recentRoi: 1.8, daysLeft: 2 } }],
      // A winner that is a creator video → download and clone.
      p3: [{ key: 'ads_winner', level: 'success', action: 'make_variant', params: { name: '上耳', creativeId: '7300000000000000001', roi: 5, avgRoi: 2, orders: 9 } }],
      // Too few creatives → variants of the top-spending video creative.
      p4: [{ key: 'ads_need_creatives', level: 'warning', action: 'make_content', params: { active: 1, target: 3 } }],
      // A non-video creative cannot be replenished.
      p5: [{ key: 'ads_fatigue', level: 'warning', action: 'replenish', params: { name: 'card', creativeId: 'product-card:x', share: 90, previousRoi: 3, recentRoi: 1 } }],
    }
    await performanceLinkStore.mutate((db) => { db.links['clone:proj-2'] = { ref: 'clone:proj-2', creativeId: '7200000000000000001', creativeName: '开箱', method: 'manual', linkedAt: 0 } })
    const metric = (creativeId: string, cost: number) => gmvMaxRepo.saveCreativeMetric({ id: `${creativeId}:${cost}`, campaignId: 'c', storeId: 's', creativeId, itemGroupId: 'TT-4', creativeName: `name-${creativeId}`, source: 'video', statDate: new Date(now - DAY).toISOString().slice(0, 10), cost: String(cost), grossRevenue: '100', roi: '1', orders: '1', cpa: '0', ctr: '0', playDepth: '0', raw: {}, syncedAt: now } as any)
    metric('7400000000000000001', 300)
    metric('7400000000000000002', 50)
    metric('product-card:TT-4', 900)

    const sent: any[] = []
    const approved: any[] = []
    const runStatus: Record<string, string> = {}
    let downloadOk = true
    setAutopilotTestDependencies({
      now: () => now,
      products: async () => [
        { id: 'p1', name: '耳钉', tiktokProductIds: ['TT-1'] }, { id: 'p2', name: '项链', tiktokProductIds: ['TT-2'] },
        { id: 'p3', name: '戒指', tiktokProductIds: ['TT-3'] }, { id: 'p4', name: '手链', tiktokProductIds: ['TT-4'] },
        { id: 'p5', name: '发夹', tiktokProductIds: ['TT-5'] }, { id: 'p6', name: '没绑定' },
      ],
      signals: async (productId) => signals[productId] || [],
      downloadCreative: async (creativeId) => (downloadOk ? { localVideoPath: path.join(root, `${creativeId}.mp4`) } : { error: 'network down' }),
      agent: {
        createConversation: (async (input: any) => ({ id: `conv-${sent.length + 1}`, ...input })) as any,
        sendMessage: (async (input: any) => {
          sent.push(input)
          const id = `run-${sent.length}`
          runStatus[id] = 'running'
          return { run: { id, status: 'waiting_approval', activeRevision: 1, revisions: [{ version: 1, hash: `h-${id}` }] } }
        }) as any,
        approveRun: (async (input: any) => { approved.push(input) }) as any,
        getRun: (async (id: string) => ({ run: { id, status: runStatus[id] } })) as any,
      },
    })

    // Disabled by default: the scheduler does nothing.
    assert.equal((await autopilot.settings()).enabled, false)
    assert.equal(await autopilot.runDaily(), null)

    // Manual generation works even when disabled (the "build today's plan" button).
    const first = await autopilot.generate()
    const kinds = first.day!.proposals.map((item) => `${item.kind}:${item.productId || '-'}`)
    assert.deepEqual(kinds, ['stop_loss:p1', 'replenish:p2', 'scale_winner:p3', 'more_content:p4'], kinds.join(','))
    const byKind = (kind: string) => first.day!.proposals.find((item) => item.kind === kind)!
    assert.match(byKind('replenish').reason, /约 2 天后撑不住/)
    assert.deepEqual(byKind('replenish').action, { type: 'plan', source: 'project', projectId: 'proj-2' })
    assert.deepEqual(byKind('scale_winner').action, { type: 'plan', source: 'creative' })
    assert.equal(byKind('more_content').creativeId, '7400000000000000001', 'top-spending video creative, not product-card traffic')
    assert.equal(byKind('stop_loss').action.type, 'route')

    // Stop loss is a reminder: approving it just marks it handled, nothing runs.
    await autopilot.approve(byKind('stop_loss').id)
    assert.equal(sent.length, 0)

    // Replenish a clone project → variants of that project, approved on the user's behalf.
    await autopilot.approve(byKind('replenish').id)
    assert.equal(sent[0].context.variantOfProjectId, 'proj-2')
    assert.deepEqual(sent[0].plan.intents, ['Intent.CommerceVideoCreate', 'Intent.ReviewSubmit'])
    assert.deepEqual(approved[0], { runId: 'run-1', revision: 1, planHash: 'h-run-1' })

    // Creator video: download fails → failed with the reason, retry succeeds with the downloaded video attached.
    downloadOk = false
    await autopilot.approve(byKind('scale_winner').id)
    let today = await autopilot.today()
    const failed = today.day!.proposals.find((item) => item.kind === 'scale_winner')!
    assert.equal(failed.status, 'failed')
    assert.match(failed.error!, /network down/)
    assert.equal(today.used, 2, 'a failed attempt still counts toward the daily limit')
    downloadOk = true
    await autopilot.approve(byKind('scale_winner').id)
    assert.equal(sent[1].context.referenceVideoPath, path.join(root, '7300000000000000001.mp4'))
    assert.equal(sent[1].attachments[0].mediaType, 'video')

    assert.equal((await autopilot.today()).used, 2, 'retrying the same item does not count twice')
    // Daily cap reached → the next task is refused with a clear message.
    await autopilot.saveSettings({ maxTasksPerDay: 2 })
    await assert.rejects(autopilot.approve(byKind('more_content').id), /每日上限/)
    await autopilot.skip(byKind('more_content').id)

    // Runs finishing in the AI producer flow back into the plan.
    runStatus['run-1'] = 'completed'
    runStatus['run-2'] = 'failed'
    today = await autopilot.today()
    assert.equal(today.day!.proposals.find((item) => item.kind === 'replenish')!.status, 'done')
    assert.equal(today.day!.proposals.find((item) => item.kind === 'scale_winner')!.status, 'failed')

    // Rebuilding today keeps decided items and does not duplicate them.
    const rebuilt = await autopilot.generate()
    assert.equal(rebuilt.day!.proposals.filter((item) => item.kind === 'replenish').length, 1)
    assert.equal(rebuilt.day!.proposals.find((item) => item.kind === 'more_content')!.status, 'skipped')

    // Next day, auto mode, before the hour → nothing; after the hour → plan built and run within the cap.
    now += DAY
    now = new Date(now).setHours(7, 0, 0, 0)
    await autopilot.saveSettings({ enabled: true, hour: 9, mode: 'auto', maxTasksPerDay: 1 })
    assert.equal(await autopilot.runDaily(), null)
    now = new Date(now).setHours(9, 30, 0, 0)
    const daily = await autopilot.runDaily()
    assert.ok(daily)
    today = await autopilot.today()
    assert.equal(today.day!.day, autopilotDayKey(now))
    const replenishAgain = today.day!.proposals.find((item) => item.kind === 'replenish')
    assert.equal(replenishAgain, undefined, 'the same creative is not replenished again within 3 days')
    const started = today.day!.proposals.filter((item) => item.auto)
    assert.equal(started.length, 1, 'auto mode stops at the daily cap')
    assert.equal(daily!.started, 1)
    assert.ok(daily!.pending >= 1)
    assert.equal(await autopilot.runDaily(), null, 'only once a day')
    closeGmvMaxSqlite()
    console.log('autopilot-daily smoke passed')
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
