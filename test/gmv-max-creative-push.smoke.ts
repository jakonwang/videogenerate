/**
 * Exclude / restore videos from the creatives page: one TikTok call per campaign with every selected video,
 * the deny list kept in step, and the per-campaign creative lock respected. TikTok is replaced by a fake client.
 * Usage: npx tsx test/gmv-max-creative-push.smoke.ts
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), 'gmv-creative-push-'))
  configureAppPathRuntime({ dataDir, userDataDir: dataDir })
  const { gmvMaxRepo } = await import('../src/main/modules/tiktok-gmv-max/sqlite')
  const { gmvMaxMcpClient } = await import('../src/main/modules/tiktok-gmv-max/mcpClient')
  const { gmvMaxService } = await import('../src/main/modules/tiktok-gmv-max/service')

  const now = Date.now()
  gmvMaxRepo.saveConnection({ id: 'conn-1', name: 'Demo', state: 'connected', serverUrl: 'https://example.test', missingTools: [], createdAt: now, updatedAt: now } as any)
  gmvMaxRepo.saveBinding({ id: 'bind-1', connectionId: 'conn-1', advertiserId: 'adv-1', advertiserName: 'Demo', currency: 'USD', timezone: 'UTC', storeId: 'store-1', storeName: 'Shop', campaignType: 'PRODUCT', active: true, updatedAt: now })
  for (const id of ['c-1', 'c-2']) {
    gmvMaxRepo.saveCampaign({ id, bindingId: 'bind-1', advertiserId: 'adv-1', storeId: 'store-1', name: id, campaignType: 'PRODUCT', operationStatus: 'ENABLE', budget: '100', roasBid: '3', promotionDaysEnabled: false, lastSyncedAt: now, raw: {} } as any)
  }
  const metric = (campaignId: string, creativeId: string, spu: string) => gmvMaxRepo.saveCreativeMetric({
    id: `${campaignId}-${creativeId}`, campaignId, storeId: 'store-1', creativeId, itemId: creativeId, itemGroupId: spu, source: 'owned',
    statDate: new Date(now - 86_400_000).toISOString().slice(0, 10), cost: '5', grossRevenue: '0', roi: '0', orders: '0', cpa: '0', ctr: '0', playDepth: '0',
    status: 'DELIVERING', raw: {}, syncedAt: now,
  } as any)
  metric('c-1', 'v-1', 'spu-a')
  metric('c-1', 'v-2', 'spu-b')
  metric('c-2', 'v-3', 'spu-a')

  const calls: Array<{ tool: string; args: any; connectionId?: string }> = []
  const client = gmvMaxMcpClient as any
  client.connect = async () => ({ capabilities: { creative_write: true, core_read: true }, toolSchemas: {}, missingTools: [] })
  client.call = async (connectionId: string, tool: string, args: any) => {
    calls.push({ tool, args, connectionId })
    if (tool === 'gmv_max_creative_update') return { data: { code: 0, request_id: `req-${calls.length}` } }
    if (tool === 'campaign_gmv_max_info_get') return { data: { campaign_id: args.campaign_id, budget: 100, roas_bid: 3, operation_status: 'ENABLE' } }
    return { data: {} }
  }

  // 1. Exclude three videos across two campaigns: two calls, the c-1 call carries both of its videos.
  const pushed = await gmvMaxService.pushCreativeChanges({
    operation: 'REMOVE',
    items: [
      { campaignId: 'c-1', creativeId: 'v-1', label: 'Video 1' },
      { campaignId: 'c-1', creativeId: 'v-2' },
      { campaignId: 'c-2', creativeId: 'v-3' },
    ],
  })
  assert.deepEqual(pushed.results.map((item) => [item.campaignId, item.status, item.error]), [['c-1', 'pushed', undefined], ['c-2', 'pushed', undefined]])
  const updates = calls.filter((call) => call.tool === 'gmv_max_creative_update')
  assert.equal(updates.length, 2)
  const c1 = updates.find((call) => call.args.campaign_id === 'c-1')!
  assert.equal(c1.args.action, 'REMOVE')
  assert.deepEqual(c1.args.item_list, [{ item_id: 'v-1', spu_id_list: ['spu-a'] }, { item_id: 'v-2', spu_id_list: ['spu-b'] }])
  const deny = gmvMaxRepo.listListEntries().filter((entry) => entry.mode === 'deny').map((entry) => `${entry.campaignId}:${entry.entityId}`).sort()
  assert.deepEqual(deny, ['c-1:v-1', 'c-1:v-2', 'c-2:v-3'])
  const recommendation = gmvMaxRepo.getRecommendation(pushed.results[0].recommendationId!)!
  assert.deepEqual(recommendation.actionPayload, { operation: 'REMOVE', creativeIds: ['v-1', 'v-2'] })
  assert.deepEqual(recommendation.rollbackPayload, { operation: 'ADD', creativeIds: ['v-1', 'v-2'] })
  assert.equal(recommendation.status, 'executed')

  // 2. A second change in c-1 before TikTok confirms the first is refused with the lock error, nothing is sent.
  const before = calls.length
  const locked = await gmvMaxService.pushCreativeChanges({ operation: 'ADD', items: [{ campaignId: 'c-1', creativeId: 'v-1' }] })
  assert.equal(locked.results[0].status, 'failed')
  assert.match(String(locked.results[0].error), /GMV_MAX_ACTION_PENDING_VERIFICATION/)
  assert.equal(calls.slice(before).some((call) => call.tool === 'gmv_max_creative_update'), false)

  // 3. Once the lock is released, restoring removes the deny entry and sends ADD.
  gmvMaxRepo.removeActionLock('c-1', 'creative')
  const restored = await gmvMaxService.pushCreativeChanges({ operation: 'ADD', items: [{ campaignId: 'c-1', creativeId: 'v-1' }] })
  assert.equal(restored.results[0].status, 'pushed')
  const addCall = calls.filter((call) => call.tool === 'gmv_max_creative_update').at(-1)!
  assert.equal(addCall.args.action, 'ADD')
  assert.deepEqual(addCall.args.item_list, [{ item_id: 'v-1', spu_id_list: ['spu-a'] }])
  assert.equal(gmvMaxRepo.listListEntries().some((entry) => entry.campaignId === 'c-1' && entry.entityId === 'v-1' && entry.mode === 'deny'), false)

  // 4. A campaign still linked to an old, errored connection is written through the connected one
  //    for the same advertiser and store instead of failing with "authorization is required".
  gmvMaxRepo.saveConnection({ id: 'conn-old', name: 'Old', state: 'error', serverUrl: 'https://example.test', missingTools: [], createdAt: now, updatedAt: now } as any)
  gmvMaxRepo.saveBinding({ id: 'bind-old', connectionId: 'conn-old', advertiserId: 'adv-1', advertiserName: 'Demo', currency: 'USD', timezone: 'UTC', storeId: 'store-1', storeName: 'Shop', campaignType: 'PRODUCT', active: true, updatedAt: now })
  gmvMaxRepo.saveCampaign({ id: 'c-3', bindingId: 'bind-old', advertiserId: 'adv-1', storeId: 'store-1', name: 'c-3', campaignType: 'PRODUCT', operationStatus: 'ENABLE', budget: '100', roasBid: '3', promotionDaysEnabled: false, lastSyncedAt: now, raw: {} } as any)
  metric('c-3', 'v-4', 'spu-c')
  const viaFallback = await gmvMaxService.pushCreativeChanges({ operation: 'REMOVE', items: [{ campaignId: 'c-3', creativeId: 'v-4' }] })
  assert.equal(viaFallback.results[0].status, 'pushed', String(viaFallback.results[0].error))
  assert.equal(calls.filter((call) => call.tool === 'gmv_max_creative_update').at(-1)!.connectionId, 'conn-1')

  // 5. A paused campaign is refused before anything is sent to TikTok.
  gmvMaxRepo.saveCampaign({ id: 'c-4', bindingId: 'bind-1', advertiserId: 'adv-1', storeId: 'store-1', name: 'c-4', campaignType: 'PRODUCT', operationStatus: 'DISABLE', budget: '100', roasBid: '3', promotionDaysEnabled: false, lastSyncedAt: now, raw: {} } as any)
  metric('c-4', 'v-5', 'spu-d')
  const beforePaused = calls.length
  const paused = await gmvMaxService.pushCreativeChanges({ operation: 'REMOVE', items: [{ campaignId: 'c-4', creativeId: 'v-5' }] })
  assert.deepEqual([paused.results[0].status, paused.results[0].error], ['failed', 'GMV_MAX_CAMPAIGN_NOT_ENABLED'])
  assert.equal(calls.length, beforePaused)

  // 6. Emergency stop blocks every push; more than 25 videos is refused.
  gmvMaxService.schedulerState.emergencyStopped = true
  await assert.rejects(() => gmvMaxService.pushCreativeChanges({ operation: 'REMOVE', items: [{ campaignId: 'c-2', creativeId: 'v-3' }] }), /emergency stop/)
  gmvMaxService.schedulerState.emergencyStopped = false
  await assert.rejects(() => gmvMaxService.pushCreativeChanges({ operation: 'REMOVE', items: Array.from({ length: 26 }, (_, i) => ({ campaignId: 'c-2', creativeId: `x-${i}` })) }), /between 1 and 25/)

  console.log('gmv-max creative push smoke passed')
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* sqlite file may still be open on Windows */ }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
