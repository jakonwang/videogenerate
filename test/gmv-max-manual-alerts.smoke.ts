/**
 * GMV MAX ads-manager backend: alerts from local data, one-time desktop announcement, manual-change validation,
 * and the previous-period range used for "vs previous" deltas. Runs offline on the seed-gmv-v2 fixture.
 * Usage: tsx test/gmv-max-manual-alerts.smoke.ts
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'

async function main() {
  const dataDir = join(mkdtempSync(join(tmpdir(), 'gmv-manual-alerts-')), 'data')
  execFileSync(process.execPath, [join('node_modules', 'tsx', 'dist', 'cli.mjs'), join('test', 'fixtures', 'seed-gmv-v2.ts'), dataDir], { stdio: 'ignore' })
  configureAppPathRuntime({ dataDir, userDataDir: dataDir })
  const { gmvMaxService, previousDateRange } = await import('../src/main/modules/tiktok-gmv-max/service')

  // previous period: same length, ending the day before
  assert.deepEqual(previousDateRange({ startDate: '2026-11-09', endDate: '2026-11-15' }), { startDate: '2026-11-02', endDate: '2026-11-08' })
  assert.deepEqual(previousDateRange({ startDate: '2026-03-01', endDate: '2026-03-01' }), { startDate: '2026-02-28', endDate: '2026-02-28' })

  // no margin set: nothing to compare ROI against
  assert.equal(gmvMaxService.getAlerts().filter((item) => item.kind === 'roi_below_floor').length, 0)

  // 40% margin -> break-even ROI 2.5: the ROI-2.0 and ROI-2.2 campaigns lose money
  await gmvMaxService.saveV2Settings({ storeId: 'store-1', marginPercent: 40 })
  const roiAlerts = gmvMaxService.getAlerts().filter((item) => item.kind === 'roi_below_floor')
  assert.deepEqual(roiAlerts.map((item) => item.campaignId).sort(), ['c-learning', 'c-losing'])
  assert.equal(roiAlerts[0].threshold, '2.50')
  assert.equal(roiAlerts[0].severity, 'critical')

  // announced once per day
  const first = gmvMaxService.takeNewAlerts()
  assert.ok(first.length >= 2)
  assert.equal(gmvMaxService.takeNewAlerts().length, 0)

  // desktop alerts off -> nothing announced
  await gmvMaxService.saveNotificationConfig({ enabled: false })
  assert.equal(gmvMaxService.takeNewAlerts().length, 0)

  // manual change validation happens before any TikTok call
  await assert.rejects(() => gmvMaxService.applyManualChange({ campaignId: 'nope', budget: 10 }), /does not exist/)
  await assert.rejects(() => gmvMaxService.applyManualChange({ campaignId: 'c-losing', budget: 200 }), /GMV_MAX_MANUAL_NO_CHANGE/)
  await assert.rejects(() => gmvMaxService.applyManualChange({ campaignId: 'c-losing', budget: -5 }), /GMV_MAX_MANUAL_BUDGET_INVALID/)
  await assert.rejects(() => gmvMaxService.applyManualChange({ campaignId: 'c-losing', roasBid: 0 }), /GMV_MAX_MANUAL_ROI_INVALID/)
  await assert.rejects(() => gmvMaxService.applyManualChange({ campaignId: 'c-losing', operationStatus: 'ENABLE' }), /GMV_MAX_MANUAL_NO_CHANGE/)
  await assert.rejects(() => gmvMaxService.applyManualChange({ campaignId: 'c-losing', operationStatus: 'DELETE' }), /GMV_MAX_MANUAL_STATUS_INVALID/)
  const bulk = await gmvMaxService.applyManualChanges({ changes: [{ campaignId: 'c-losing', budget: 200 }, { campaignId: 'nope', budget: 1 }] })
  assert.equal(bulk.failed, 2)

  // emergency stop blocks writes
  await gmvMaxService.setEmergencyStop({ stopped: true, reason: 'test' })
  await assert.rejects(() => gmvMaxService.applyManualChange({ campaignId: 'c-losing', budget: 250 }), /emergency stop/)

  console.log('gmv max manual changes + alerts smoke: ok')
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error)
  process.exit(1)
})
