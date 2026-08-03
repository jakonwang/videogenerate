import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getAppPaths } from '../../lib/paths'
import { normalizeGmvMaxReportRate } from './reportContract'
import type {
  GmvMaxAccountBinding,
  GmvMaxAuditRecord,
  GmvMaxCampaign,
  GmvMaxConnection,
  GmvMaxDailyMetric,
  GmvMaxPolicy,
  GmvMaxRecommendation,
  GmvMaxOptimizationRun,
  GmvMaxStoreCost,
  GmvMaxProductCost,
  GmvMaxCreativeMetric,
  GmvMaxRuleGroup,
  GmvMaxRuleBinding,
  GmvMaxListEntry,
  GmvMaxSessionSnapshot,
  GmvMaxActionLock,
  GmvMaxBacktestResult,
  GmvMaxNotificationConfig,
  GmvMaxNotificationRecord,
  GmvMaxRealtimeSample,
  GmvMaxCreativeAsset,
  GmvMaxLearningSnapshot,
  GmvMaxActionOutcome,
  GmvMaxCreativeInsight,
  GmvMaxPortfolioPlan,
  GmvMaxSchedulerState,
  GmvMaxSopInstance,
  GmvMaxMatureAssessment,
  GmvMaxSopIntervention,
  GmvMaxSopAutomationRun,
  GmvMaxSopTask,
  GmvMaxSupplementalMetric,
  GmvMaxWinnerDna,
  GmvMaxSyncProgress,
  GmvMaxDecisionSnapshot,
  GmvMaxExperiment,
  GmvMaxProductProfile,
  GmvMaxCoachRun,
} from './types'

type Statement = { run(...params: unknown[]): unknown; get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] }
type Database = { exec(sql: string): unknown; prepare(sql: string): Statement; close?: () => unknown }
type DatabaseCtor = new (path: string) => Database

let database: Database | null = null

const schema = `
CREATE TABLE IF NOT EXISTS gmv_connections (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_bindings (id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_campaigns (id TEXT PRIMARY KEY, binding_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_metrics (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, stat_date TEXT NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_policies (campaign_id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_recommendations (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_audits (id TEXT PRIMARY KEY, campaign_id TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_optimization_runs (id TEXT PRIMARY KEY, binding_id TEXT NOT NULL, local_date TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_store_costs (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_product_costs (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, product_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_creative_metrics (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, stat_date TEXT NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_creative_assets (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_realtime_samples (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, stat_date TEXT NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_rule_groups (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_rule_bindings (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_list_entries (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_session_snapshots (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, synced_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_action_locks (campaign_id TEXT NOT NULL, action_type TEXT NOT NULL, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (campaign_id, action_type));
CREATE TABLE IF NOT EXISTS gmv_backtest_results (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_notification_configs (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_notification_records (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_learning_snapshots (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, analyzed_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_action_outcomes (id TEXT PRIMARY KEY, recommendation_id TEXT NOT NULL, campaign_id TEXT NOT NULL, measured_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_creative_insights (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, analyzed_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_portfolio_plans (id TEXT PRIMARY KEY, store_id TEXT NOT NULL, analyzed_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_runtime_state (id TEXT PRIMARY KEY, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_sop_instances (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_mature_assessments (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, sop_instance_id TEXT NOT NULL, stat_date TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_sop_interventions (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, sop_instance_id TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_sop_automation_runs (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, sop_instance_id TEXT NOT NULL, local_date TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_sop_tasks (id TEXT PRIMARY KEY, sop_instance_id TEXT NOT NULL, local_date TEXT NOT NULL, status TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_supplemental_metrics (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, stat_date TEXT NOT NULL, source TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_decision_snapshots (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, sop_instance_id TEXT NOT NULL, priority TEXT NOT NULL, evaluated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_experiments (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, sop_instance_id TEXT NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_product_profiles (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, store_id TEXT NOT NULL, product_id TEXT, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_coach_runs (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, sop_instance_id TEXT, status TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_winner_dna (id TEXT PRIMARY KEY, sop_instance_id TEXT NOT NULL, campaign_id TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_sync_jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gmv_schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_gmv_metrics_campaign_date ON gmv_metrics(campaign_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_metrics_normalized_date ON gmv_metrics(substr(stat_date, 1, 10), campaign_id);
CREATE INDEX IF NOT EXISTS idx_gmv_recommendations_campaign ON gmv_recommendations(campaign_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_audits_created ON gmv_audits(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gmv_runs_binding_date ON gmv_optimization_runs(binding_id, local_date);
CREATE INDEX IF NOT EXISTS idx_gmv_product_costs_store ON gmv_product_costs(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_gmv_creative_metrics_campaign_date ON gmv_creative_metrics(campaign_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_creative_metrics_normalized_date ON gmv_creative_metrics(substr(stat_date, 1, 10), campaign_id);
CREATE INDEX IF NOT EXISTS idx_gmv_realtime_campaign_date ON gmv_realtime_samples(campaign_id, stat_date, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_notifications_created ON gmv_notification_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_learning_campaign_date ON gmv_learning_snapshots(campaign_id, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_outcomes_campaign_date ON gmv_action_outcomes(campaign_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_creative_insights_campaign_date ON gmv_creative_insights(campaign_id, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_portfolio_store_date ON gmv_portfolio_plans(store_id, analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_sop_instances_campaign ON gmv_sop_instances(campaign_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_mature_assessments_instance ON gmv_mature_assessments(sop_instance_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_sop_interventions_instance ON gmv_sop_interventions(sop_instance_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_sop_automation_runs_instance ON gmv_sop_automation_runs(sop_instance_id, local_date DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_sop_tasks_instance_date ON gmv_sop_tasks(sop_instance_id, local_date DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_supplemental_campaign_date ON gmv_supplemental_metrics(campaign_id, stat_date DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_decisions_instance_date ON gmv_decision_snapshots(sop_instance_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_decisions_priority_date ON gmv_decision_snapshots(priority, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_experiments_instance_state ON gmv_experiments(sop_instance_id, state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_profiles_campaign_product ON gmv_product_profiles(campaign_id, product_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_coach_runs_campaign_date ON gmv_coach_runs(campaign_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmv_winner_dna_campaign ON gmv_winner_dna(campaign_id, updated_at DESC);
`

const CREATIVE_RATE_RATIO_MIGRATION = '2026-07-29-creative-rate-ratios'
const CREATIVE_METRIC_QUERY_COLUMNS_MIGRATION = '2026-07-31-creative-metric-query-columns'
const CREATIVE_METRIC_AGGREGATE_COLUMNS_MIGRATION = '2026-07-31-creative-metric-aggregate-columns'
const COACH_TABLES_MIGRATION = '2026-08-03-gmv-coach-tables'

function migrateCreativeRatesToRatios(db: Database) {
  const applied = db.prepare('SELECT id FROM gmv_schema_migrations WHERE id = ?').get(CREATIVE_RATE_RATIO_MIGRATION)
  if (applied) return

  const rateSources: Array<[keyof GmvMaxCreativeMetric, string]> = [
    ['conversionRate', 'ad_conversion_rate'],
    ['play2sRate', 'ad_video_view_rate_2s'],
    ['playDepth', 'ad_video_view_rate_6s'],
    ['play25Rate', 'ad_video_view_rate_p25'],
    ['play50Rate', 'ad_video_view_rate_p50'],
    ['play75Rate', 'ad_video_view_rate_p75'],
    ['play100Rate', 'ad_video_view_rate_p100'],
  ]
  const update = db.prepare('UPDATE gmv_creative_metrics SET payload = ? WHERE id = ?')

  db.exec('BEGIN IMMEDIATE;')
  try {
    for (const row of db.prepare('SELECT id, payload FROM gmv_creative_metrics').all() as Array<{ id: string; payload: string }>) {
      const metric = JSON.parse(String(row.payload)) as GmvMaxCreativeMetric
      const mutableMetric = metric as unknown as Record<string, unknown>
      const raw = metric.raw || {}
      const rawCtr = raw.product_click_rate || raw.ad_click_rate
      let changed = false
      if (rawCtr !== undefined && rawCtr !== null && String(rawCtr).trim()) {
        metric.ctr = normalizeGmvMaxReportRate(rawCtr)
        changed = true
      }
      for (const [field, source] of rateSources) {
        const value = raw[source]
        if (value === undefined || value === null || !String(value).trim()) continue
        mutableMetric[field] = normalizeGmvMaxReportRate(value)
        changed = true
      }
      if (changed) update.run(JSON.stringify(metric), row.id)
    }
    db.prepare('INSERT INTO gmv_schema_migrations (id, applied_at) VALUES (?, ?)').run(CREATIVE_RATE_RATIO_MIGRATION, Date.now())
    db.exec('COMMIT;')
  } catch (error) {
    db.exec('ROLLBACK;')
    throw error
  }
}

function migrateCreativeMetricQueryColumns(db: Database) {
  const applied = db.prepare('SELECT id FROM gmv_schema_migrations WHERE id = ?').get(CREATIVE_METRIC_QUERY_COLUMNS_MIGRATION)
  if (applied) return
  const columns = new Set((db.prepare('PRAGMA table_info(gmv_creative_metrics)').all() as Array<{ name: string }>).map((item) => String(item.name)))
  db.exec('BEGIN IMMEDIATE;')
  try {
    if (!columns.has('creative_id')) db.exec("ALTER TABLE gmv_creative_metrics ADD COLUMN creative_id TEXT NOT NULL DEFAULT '';")
    if (!columns.has('item_group_id')) db.exec("ALTER TABLE gmv_creative_metrics ADD COLUMN item_group_id TEXT NOT NULL DEFAULT '';")
    if (!columns.has('store_id')) db.exec("ALTER TABLE gmv_creative_metrics ADD COLUMN store_id TEXT NOT NULL DEFAULT '';")
    if (!columns.has('source')) db.exec("ALTER TABLE gmv_creative_metrics ADD COLUMN source TEXT NOT NULL DEFAULT '';")
    db.exec(`
      UPDATE gmv_creative_metrics SET
        creative_id = COALESCE(json_extract(payload, '$.creativeId'), ''),
        item_group_id = COALESCE(json_extract(payload, '$.itemGroupId'), ''),
        store_id = COALESCE(json_extract(payload, '$.storeId'), ''),
        source = COALESCE(json_extract(payload, '$.source'), '')
    `)
    db.exec('CREATE INDEX IF NOT EXISTS idx_gmv_creative_metrics_scope_date ON gmv_creative_metrics(campaign_id, item_group_id, stat_date DESC);')
    db.exec('CREATE INDEX IF NOT EXISTS idx_gmv_creative_metrics_creative_date ON gmv_creative_metrics(campaign_id, creative_id, item_group_id, stat_date DESC, synced_at DESC);')
    db.prepare('INSERT INTO gmv_schema_migrations (id, applied_at) VALUES (?, ?)').run(CREATIVE_METRIC_QUERY_COLUMNS_MIGRATION, Date.now())
    db.exec('COMMIT;')
  } catch (error) {
    db.exec('ROLLBACK;')
    throw error
  }
}

function migrateCreativeMetricAggregateColumns(db: Database) {
  const applied = db.prepare('SELECT id FROM gmv_schema_migrations WHERE id = ?').get(CREATIVE_METRIC_AGGREGATE_COLUMNS_MIGRATION)
  if (applied) return
  const columns = new Set((db.prepare('PRAGMA table_info(gmv_creative_metrics)').all() as Array<{ name: string }>).map((item) => String(item.name)))
  db.exec('BEGIN IMMEDIATE;')
  try {
    if (!columns.has('stat_day')) db.exec("ALTER TABLE gmv_creative_metrics ADD COLUMN stat_day TEXT NOT NULL DEFAULT '';")
    if (!columns.has('cost')) db.exec('ALTER TABLE gmv_creative_metrics ADD COLUMN cost REAL NOT NULL DEFAULT 0;')
    if (!columns.has('gross_revenue')) db.exec('ALTER TABLE gmv_creative_metrics ADD COLUMN gross_revenue REAL NOT NULL DEFAULT 0;')
    if (!columns.has('orders')) db.exec('ALTER TABLE gmv_creative_metrics ADD COLUMN orders REAL NOT NULL DEFAULT 0;')
    if (!columns.has('ctr')) db.exec('ALTER TABLE gmv_creative_metrics ADD COLUMN ctr REAL NOT NULL DEFAULT 0;')
    if (!columns.has('conversion_rate')) db.exec('ALTER TABLE gmv_creative_metrics ADD COLUMN conversion_rate REAL NOT NULL DEFAULT 0;')
    if (!columns.has('play_2s_rate')) db.exec('ALTER TABLE gmv_creative_metrics ADD COLUMN play_2s_rate REAL NOT NULL DEFAULT 0;')
    if (!columns.has('play_depth')) db.exec('ALTER TABLE gmv_creative_metrics ADD COLUMN play_depth REAL NOT NULL DEFAULT 0;')
    db.exec(`
      UPDATE gmv_creative_metrics SET
        stat_day = substr(stat_date, 1, 10),
        cost = CAST(COALESCE(json_extract(payload, '$.cost'), '0') AS REAL),
        gross_revenue = CAST(COALESCE(json_extract(payload, '$.grossRevenue'), '0') AS REAL),
        orders = CAST(COALESCE(json_extract(payload, '$.orders'), '0') AS REAL),
        ctr = CAST(COALESCE(json_extract(payload, '$.ctr'), '0') AS REAL),
        conversion_rate = CAST(COALESCE(json_extract(payload, '$.conversionRate'), '0') AS REAL),
        play_2s_rate = CAST(COALESCE(json_extract(payload, '$.play2sRate'), '0') AS REAL),
        play_depth = CAST(COALESCE(json_extract(payload, '$.playDepth'), '0') AS REAL)
    `)
    db.exec('CREATE INDEX IF NOT EXISTS idx_gmv_creative_metrics_day_scope ON gmv_creative_metrics(stat_day, campaign_id, store_id, source);')
    db.prepare('INSERT INTO gmv_schema_migrations (id, applied_at) VALUES (?, ?)').run(CREATIVE_METRIC_AGGREGATE_COLUMNS_MIGRATION, Date.now())
    db.exec('COMMIT;')
  } catch (error) {
    db.exec('ROLLBACK;')
    throw error
  }
}

function migrateCoachTables(db: Database) {
  const applied = db.prepare('SELECT id FROM gmv_schema_migrations WHERE id = ?').get(COACH_TABLES_MIGRATION)
  if (applied) return
  db.exec('BEGIN IMMEDIATE;')
  try {
    db.exec('CREATE TABLE IF NOT EXISTS gmv_product_profiles (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, store_id TEXT NOT NULL, product_id TEXT, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);')
    db.exec('CREATE TABLE IF NOT EXISTS gmv_coach_runs (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, sop_instance_id TEXT, status TEXT NOT NULL, updated_at INTEGER NOT NULL, payload TEXT NOT NULL);')
    db.exec('CREATE INDEX IF NOT EXISTS idx_gmv_profiles_campaign_product ON gmv_product_profiles(campaign_id, product_id, updated_at DESC);')
    db.exec('CREATE INDEX IF NOT EXISTS idx_gmv_coach_runs_campaign_date ON gmv_coach_runs(campaign_id, updated_at DESC);')
    db.prepare('INSERT INTO gmv_schema_migrations (id, applied_at) VALUES (?, ?)').run(COACH_TABLES_MIGRATION, Date.now())
    db.exec('COMMIT;')
  } catch (error) {
    db.exec('ROLLBACK;')
    throw error
  }
}

function getDatabase() {
  if (database) return database
  const dbDir = getAppPaths().dbDir
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true })
  let DatabaseSync: DatabaseCtor
  try {
    DatabaseSync = (require('node:sqlite') as { DatabaseSync: DatabaseCtor }).DatabaseSync
  } catch {
    DatabaseSync = require('better-sqlite3') as DatabaseCtor
  }
  database = new DatabaseSync(join(dbDir, 'tiktok-gmv-max.sqlite'))
  database.exec('PRAGMA journal_mode = WAL;')
  database.exec('PRAGMA synchronous = NORMAL;')
  database.exec(schema)
  migrateCreativeRatesToRatios(database)
  migrateCreativeMetricQueryColumns(database)
  migrateCreativeMetricAggregateColumns(database)
  migrateCoachTables(database)
  return database
}

function list<T>(table: string, orderBy = 'updated_at DESC'): T[] {
  return getDatabase().prepare(`SELECT payload FROM ${table} ORDER BY ${orderBy}`).all().map((row: any) => JSON.parse(String(row.payload)))
}

function upsert(table: string, columns: string[], values: unknown[], payload: unknown) {
  const names = [...columns, 'payload']
  const placeholders = names.map(() => '?').join(', ')
  getDatabase().prepare(`INSERT OR REPLACE INTO ${table} (${names.join(', ')}) VALUES (${placeholders})`).run(...values, JSON.stringify(payload))
}

export const gmvMaxRepo = {
  listConnections: () => list<GmvMaxConnection>('gmv_connections'),
  saveConnection(item: GmvMaxConnection) { upsert('gmv_connections', ['id', 'updated_at'], [item.id, item.updatedAt], item); return item },
  removeConnection(id: string) { getDatabase().prepare('DELETE FROM gmv_connections WHERE id = ?').run(id) },
  listBindings: () => list<GmvMaxAccountBinding>('gmv_bindings'),
  listBindingsByIds(ids: string[]) {
    const uniqueIds = [...new Set(ids.filter(Boolean))]
    if (!uniqueIds.length) return [] as GmvMaxAccountBinding[]
    return getDatabase().prepare(`SELECT payload FROM gmv_bindings WHERE id IN (${uniqueIds.map(() => '?').join(', ')}) ORDER BY updated_at DESC`)
      .all(...uniqueIds)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxAccountBinding)
  },
  saveBinding(item: GmvMaxAccountBinding) { upsert('gmv_bindings', ['id', 'connection_id', 'updated_at'], [item.id, item.connectionId, item.updatedAt], item); return item },
  listCampaigns: () => list<GmvMaxCampaign>('gmv_campaigns'),
  listCampaignsByIds(ids: string[]) {
    const uniqueIds = [...new Set(ids.filter(Boolean))]
    if (!uniqueIds.length) return [] as GmvMaxCampaign[]
    return getDatabase().prepare(`SELECT payload FROM gmv_campaigns WHERE id IN (${uniqueIds.map(() => '?').join(', ')}) ORDER BY updated_at DESC`)
      .all(...uniqueIds)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxCampaign)
  },
  saveCampaign(item: GmvMaxCampaign) { upsert('gmv_campaigns', ['id', 'binding_id', 'updated_at'], [item.id, item.bindingId, item.lastSyncedAt], item); return item },
  listMetrics(campaignId?: string) {
    if (!campaignId) return list<GmvMaxDailyMetric>('gmv_metrics', 'stat_date DESC')
    return getDatabase().prepare('SELECT payload FROM gmv_metrics WHERE campaign_id = ? ORDER BY stat_date ASC').all(campaignId).map((row: any) => JSON.parse(String(row.payload)) as GmvMaxDailyMetric)
  },
  listMetricsRange(startDate: string, endDate: string, campaignIds?: string[]) {
    const ids = [...new Set((campaignIds || []).filter(Boolean))]
    const campaignClause = ids.length ? ` AND campaign_id IN (${ids.map(() => '?').join(', ')})` : ''
    return getDatabase().prepare(`SELECT payload FROM gmv_metrics WHERE substr(stat_date, 1, 10) >= ? AND substr(stat_date, 1, 10) <= ?${campaignClause} ORDER BY stat_date DESC`)
      .all(startDate, endDate, ...ids)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxDailyMetric)
  },
  saveMetric(item: GmvMaxDailyMetric) { upsert('gmv_metrics', ['id', 'campaign_id', 'stat_date', 'synced_at'], [item.id, item.campaignId, item.statDate, item.syncedAt], item); return item },
  listPolicies: () => list<GmvMaxPolicy>('gmv_policies'),
  getPolicy(campaignId: string) {
    const row = getDatabase().prepare('SELECT payload FROM gmv_policies WHERE campaign_id = ?').get(campaignId) as any
    return row ? JSON.parse(String(row.payload)) as GmvMaxPolicy : null
  },
  savePolicy(item: GmvMaxPolicy) { upsert('gmv_policies', ['campaign_id', 'updated_at'], [item.campaignId, item.updatedAt], item); return item },
  listRecommendations: () => list<GmvMaxRecommendation>('gmv_recommendations'),
  listRecommendationsRange(startAt: number, endAt: number) {
    return getDatabase().prepare("SELECT payload FROM gmv_recommendations WHERE CAST(json_extract(payload, '$.createdAt') AS INTEGER) >= ? AND CAST(json_extract(payload, '$.createdAt') AS INTEGER) <= ? ORDER BY updated_at DESC").all(startAt, endAt).map((row: any) => JSON.parse(String(row.payload)) as GmvMaxRecommendation)
  },
  listRecentRecommendations(limit = 200) {
    return getDatabase().prepare('SELECT payload FROM gmv_recommendations ORDER BY updated_at DESC LIMIT ?').all(Math.max(1, Math.trunc(limit))).map((row: any) => JSON.parse(String(row.payload)) as GmvMaxRecommendation)
  },
  recommendationStatusCounts() {
    const rows = getDatabase().prepare('SELECT status, COUNT(*) AS total FROM gmv_recommendations GROUP BY status').all() as Array<{ status: string; total: number }>
    return Object.fromEntries(rows.map((row) => [String(row.status), Number(row.total)])) as Record<string, number>
  },
  pendingRecommendationCountsByCampaign() {
    const rows = getDatabase().prepare("SELECT campaign_id AS campaignId, COUNT(*) AS total FROM gmv_recommendations WHERE status IN ('pending', 'approved', 'executing') GROUP BY campaign_id").all() as Array<{ campaignId: string; total: number }>
    return new Map(rows.map((row) => [String(row.campaignId), Number(row.total)]))
  },
  getRecommendation(id: string) { const row = getDatabase().prepare('SELECT payload FROM gmv_recommendations WHERE id = ?').get(id) as any; return row ? JSON.parse(String(row.payload)) as GmvMaxRecommendation : null },
  saveRecommendation(item: GmvMaxRecommendation) { upsert('gmv_recommendations', ['id', 'campaign_id', 'status', 'updated_at'], [item.id, item.campaignId, item.status, item.updatedAt], item); return item },
  listAudits: () => list<GmvMaxAuditRecord>('gmv_audits', 'created_at DESC'),
  listAuditsRange(startAt: number, endAt: number) {
    return getDatabase().prepare('SELECT payload FROM gmv_audits WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC').all(startAt, endAt).map((row: any) => JSON.parse(String(row.payload)) as GmvMaxAuditRecord)
  },
  listRecentAudits(limit = 200) {
    return getDatabase().prepare('SELECT payload FROM gmv_audits ORDER BY created_at DESC LIMIT ?').all(Math.max(1, Math.trunc(limit))).map((row: any) => JSON.parse(String(row.payload)) as GmvMaxAuditRecord)
  },
  saveAudit(item: GmvMaxAuditRecord) { upsert('gmv_audits', ['id', 'campaign_id', 'status', 'created_at'], [item.id, item.campaignId || null, item.status, item.createdAt], item); return item },
  listOptimizationRuns: () => list<GmvMaxOptimizationRun>('gmv_optimization_runs', 'created_at DESC'),
  saveOptimizationRun(item: GmvMaxOptimizationRun) { upsert('gmv_optimization_runs', ['id', 'binding_id', 'local_date', 'status', 'created_at'], [item.id, item.bindingId, item.localDate, item.status, item.createdAt], item); return item },
  listStoreCosts: () => list<GmvMaxStoreCost>('gmv_store_costs'),
  listStoreCostsByStoreIds(storeIds: string[]) {
    const uniqueIds = [...new Set(storeIds.filter(Boolean))]
    if (!uniqueIds.length) return [] as GmvMaxStoreCost[]
    return getDatabase().prepare(`SELECT payload FROM gmv_store_costs WHERE store_id IN (${uniqueIds.map(() => '?').join(', ')}) ORDER BY updated_at DESC`)
      .all(...uniqueIds)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxStoreCost)
  },
  saveStoreCost(item: GmvMaxStoreCost) { upsert('gmv_store_costs', ['id', 'store_id', 'updated_at'], [item.id, item.storeId, item.updatedAt], item); return item },
  listProductCosts: () => list<GmvMaxProductCost>('gmv_product_costs'),
  listProductCostsForScope(storeIds: string[], campaignIds: string[]) {
    const uniqueStoreIds = [...new Set(storeIds.filter(Boolean))]
    const uniqueCampaignIds = [...new Set(campaignIds.filter(Boolean))]
    if (!uniqueStoreIds.length) return [] as GmvMaxProductCost[]
    const campaignClause = uniqueCampaignIds.length
      ? ` AND (COALESCE(json_extract(payload, '$.campaignId'), '') = '' OR json_extract(payload, '$.campaignId') IN (${uniqueCampaignIds.map(() => '?').join(', ')}))`
      : ''
    return getDatabase().prepare(`SELECT payload FROM gmv_product_costs WHERE store_id IN (${uniqueStoreIds.map(() => '?').join(', ')})${campaignClause} ORDER BY updated_at DESC`)
      .all(...uniqueStoreIds, ...uniqueCampaignIds)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxProductCost)
  },
  listProductCostsPage(input?: { page?: number; pageSize?: number; storeId?: string; campaignId?: string; scope?: string; completeness?: string; search?: string; sortBy?: string; sortDirection?: 'asc' | 'desc' }) {
    const page = Math.max(1, Math.trunc(Number(input?.page || 1)))
    const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(input?.pageSize || 25))))
    const effectiveCostFields = ['purchaseCost', 'firstMileCost', 'lastMileCost', 'warehousingCost', 'platformCommissionRate', 'creatorCommissionRate', 'expectedReturnRate', 'returnLossRate']
    const effectiveValue = (field: string) => `COALESCE(NULLIF(TRIM(CAST(json_extract(pc.payload, '$.${field}') AS TEXT)), ''), NULLIF(TRIM(CAST(json_extract(sc.payload, '$.${field}') AS TEXT)), ''))`
    const variantEffectiveValue = (field: string) => `COALESCE(NULLIF(TRIM(CAST(json_extract(variant.value, '$.${field}') AS TEXT)), ''), ${effectiveValue(field)})`
    const sellingPrice = "CAST(COALESCE(NULLIF(TRIM(CAST(json_extract(pc.payload, '$.sellingPrice') AS TEXT)), ''), '0') AS REAL)"
    const variantCount = "COALESCE(json_array_length(json_extract(pc.payload, '$.variants')), 0)"
    const catalogHasRange = "CAST(COALESCE(json_extract(pc.payload, '$.catalogMinPrice'), '0') AS REAL) <> CAST(COALESCE(json_extract(pc.payload, '$.catalogMaxPrice'), '0') AS REAL)"
    const hasMultipleSkus = `(CAST(COALESCE(json_extract(pc.payload, '$.skuCount'), '0') AS INTEGER) > 1 OR ${catalogHasRange})`
    const invalidVariant = `EXISTS (SELECT 1 FROM json_each(COALESCE(json_extract(pc.payload, '$.variants'), '[]')) AS variant WHERE CAST(COALESCE(json_extract(variant.value, '$.sellingPrice'), '0') AS REAL) <= 0 OR ${effectiveCostFields.map((field) => `${variantEffectiveValue(field)} IS NULL`).join(' OR ')})`
    const completenessExpression = `CASE WHEN ${variantCount} > 0 AND NOT ${invalidVariant} THEN 1 WHEN ${variantCount} = 0 AND NOT (${hasMultipleSkus}) AND ${sellingPrice} > 0 AND ${effectiveCostFields.map((field) => `${effectiveValue(field)} IS NOT NULL`).join(' AND ')} THEN 1 ELSE 0 END`
    const from = "gmv_product_costs pc LEFT JOIN gmv_store_costs sc ON sc.id = (SELECT latest.id FROM gmv_store_costs latest WHERE latest.store_id = pc.store_id ORDER BY latest.updated_at DESC LIMIT 1)"
    const conditions: string[] = []
    const parameters: Array<string | number> = []
    if (input?.storeId && input.storeId !== 'all') { conditions.push('pc.store_id = ?'); parameters.push(input.storeId) }
    if (input?.campaignId && input.campaignId !== 'all') { conditions.push("json_extract(pc.payload, '$.campaignId') = ?"); parameters.push(input.campaignId) }
    if (input?.scope === 'campaign') conditions.push("COALESCE(json_extract(pc.payload, '$.campaignId'), '') <> ''")
    if (input?.scope === 'store_default') conditions.push("COALESCE(json_extract(pc.payload, '$.campaignId'), '') = ''")
    if (input?.completeness === 'complete') conditions.push(`${completenessExpression} = 1`)
    if (input?.completeness === 'incomplete') conditions.push(`${completenessExpression} = 0`)
    const search = String(input?.search || '').trim().toLowerCase()
    if (search) {
      conditions.push("(LOWER(COALESCE(json_extract(pc.payload, '$.productName'), '')) LIKE ? OR LOWER(pc.product_id) LIKE ?)")
      parameters.push(`%${search}%`, `%${search}%`)
    }
    const sortExpressions: Record<string, string> = {
      updatedAt: 'pc.updated_at',
      completeness: completenessExpression,
      productName: "LOWER(COALESCE(json_extract(pc.payload, '$.productName'), pc.product_id))",
      sellingPrice,
      purchaseCost: `CAST(COALESCE(${effectiveValue('purchaseCost')}, '0') AS REAL)`,
      platformCommissionRate: `CAST(COALESCE(${effectiveValue('platformCommissionRate')}, '0') AS REAL)`,
      expectedReturnRate: `CAST(COALESCE(${effectiveValue('expectedReturnRate')}, '0') AS REAL)`,
    }
    const sortExpression = sortExpressions[String(input?.sortBy || '')] || 'pc.updated_at'
    const direction = input?.sortDirection === 'asc' ? 'ASC' : 'DESC'
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
    const totalRow = getDatabase().prepare(`SELECT COUNT(*) AS total FROM ${from}${where}`).get(...parameters) as { total: number }
    const rows = getDatabase().prepare(`SELECT pc.payload FROM ${from}${where} ORDER BY ${sortExpression} ${direction}, pc.id ASC LIMIT ? OFFSET ?`)
      .all(...parameters, pageSize, (page - 1) * pageSize)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxProductCost)
    const summaryRows = getDatabase().prepare(`SELECT CASE WHEN COALESCE(json_extract(pc.payload, '$.campaignId'), '') = '' THEN 'store_default' ELSE 'campaign' END AS scope, ${completenessExpression} AS complete, COUNT(*) AS total FROM ${from}${where} GROUP BY scope, complete`).all(...parameters) as Array<{ scope: string; complete: number; total: number }>
    const summary = { campaignOverrides: 0, storeDefaults: 0, complete: 0, incomplete: 0 }
    for (const row of summaryRows) {
      if (row.scope === 'campaign') summary.campaignOverrides += Number(row.total)
      if (row.scope === 'store_default') summary.storeDefaults += Number(row.total)
      if (Number(row.complete)) summary.complete += Number(row.total)
      else summary.incomplete += Number(row.total)
    }
    return { items: rows, total: Number(totalRow.total || 0), page, pageSize, summary }
  },
  resolveProductCost(storeId: string, campaignId: string, productId: string) {
    const row = getDatabase().prepare("SELECT payload FROM gmv_product_costs WHERE store_id = ? AND product_id = ? ORDER BY CASE WHEN json_extract(payload, '$.campaignId') = ? THEN 0 WHEN COALESCE(json_extract(payload, '$.campaignId'), '') = '' THEN 1 ELSE 2 END, updated_at DESC LIMIT 1")
      .get(storeId, productId, campaignId) as any
    if (!row) return null
    const item = JSON.parse(String(row.payload)) as GmvMaxProductCost
    return item.campaignId === campaignId || !item.campaignId ? item : null
  },
  saveProductCost(item: GmvMaxProductCost) { upsert('gmv_product_costs', ['id', 'store_id', 'product_id', 'updated_at'], [item.id, item.storeId, item.productId, item.updatedAt], item); return item },
  saveProductCosts(items: GmvMaxProductCost[]) {
    if (!items.length) return []
    const db = getDatabase()
    db.exec('BEGIN IMMEDIATE;')
    try {
      for (const item of items) {
        upsert('gmv_product_costs', ['id', 'store_id', 'product_id', 'updated_at'], [item.id, item.storeId, item.productId, item.updatedAt], item)
      }
      db.exec('COMMIT;')
      return items
    } catch (error) {
      db.exec('ROLLBACK;')
      throw error
    }
  },
  removeProductCost(id: string) { getDatabase().prepare('DELETE FROM gmv_product_costs WHERE id = ?').run(id) },
  listCreativeMetrics: () => list<GmvMaxCreativeMetric>('gmv_creative_metrics', 'stat_date DESC'),
  listCreativeMetricsRange(startDate: string, endDate: string, input?: { campaignIds?: string[]; storeId?: string; source?: string }) {
    const conditions = ['stat_day >= ?', 'stat_day <= ?']
    const parameters: string[] = [startDate, endDate]
    const campaignIds = [...new Set((input?.campaignIds || []).filter(Boolean))]
    if (campaignIds.length) {
      conditions.push(`campaign_id IN (${campaignIds.map(() => '?').join(', ')})`)
      parameters.push(...campaignIds)
    }
    if (input?.storeId && input.storeId !== 'all') { conditions.push('store_id = ?'); parameters.push(input.storeId) }
    if (input?.source && input.source !== 'all') { conditions.push('source = ?'); parameters.push(input.source) }
    return getDatabase().prepare(`SELECT payload FROM gmv_creative_metrics WHERE ${conditions.join(' AND ')} ORDER BY stat_date DESC`)
      .all(...parameters)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxCreativeMetric)
  },
  listCreativeMetricAggregatesRange(startDate: string, endDate: string, input?: { campaignIds?: string[]; storeId?: string; source?: string }) {
    const conditions = ['stat_day >= ?', 'stat_day <= ?']
    const parameters: string[] = [startDate, endDate]
    const campaignIds = [...new Set((input?.campaignIds || []).filter(Boolean))]
    if (campaignIds.length) {
      conditions.push(`campaign_id IN (${campaignIds.map(() => '?').join(', ')})`)
      parameters.push(...campaignIds)
    }
    if (input?.storeId && input.storeId !== 'all') { conditions.push('store_id = ?'); parameters.push(input.storeId) }
    if (input?.source && input.source !== 'all') { conditions.push('source = ?'); parameters.push(input.source) }
    const rows = getDatabase().prepare(`
      WITH ranked AS (
        SELECT payload, campaign_id, creative_id, item_group_id, stat_date, stat_day,
          cost, gross_revenue, orders, ctr, conversion_rate, play_2s_rate, play_depth,
          ROW_NUMBER() OVER (
            PARTITION BY campaign_id, creative_id, item_group_id
            ORDER BY stat_date DESC, synced_at DESC
          ) AS row_rank
        FROM gmv_creative_metrics
        WHERE ${conditions.join(' AND ')}
      )
      SELECT
        MAX(CASE WHEN row_rank = 1 THEN payload END) AS sample_payload,
        SUM(cost) AS cost,
        SUM(gross_revenue) AS revenue,
        SUM(orders) AS orders,
        AVG(ctr) AS ctr,
        AVG(conversion_rate) AS conversion_rate,
        AVG(play_2s_rate) AS play_2s_rate,
        AVG(play_depth) AS play_depth,
        COUNT(*) AS samples,
        COUNT(DISTINCT stat_day) AS days
      FROM ranked
      GROUP BY campaign_id, creative_id, item_group_id
    `).all(...parameters) as any[]
    return rows.map((row) => ({
      sample: JSON.parse(String(row.sample_payload)) as GmvMaxCreativeMetric,
      cost: Number(row.cost) || 0,
      revenue: Number(row.revenue) || 0,
      orders: Number(row.orders) || 0,
      ctr: Number(row.ctr) || 0,
      conversionRate: Number(row.conversion_rate) || 0,
      play2sRate: Number(row.play_2s_rate) || 0,
      playDepth: Number(row.play_depth) || 0,
      samples: Number(row.samples) || 0,
      days: Number(row.days) || 0,
    }))
  },
  listCreativeMetricAggregatePage(startDate: string, endDate: string, input?: {
    page?: number
    pageSize?: number
    campaignIds?: string[]
    storeId?: string
    source?: string
    state?: string
    search?: string
    minSpend?: number
    minOrders?: number
    minRoi?: number
    maxCpa?: number
    minCtr?: number
    sortBy?: string
    sortDirection?: 'asc' | 'desc'
  }) {
    const page = Math.max(1, Math.trunc(Number(input?.page || 1)))
    const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(input?.pageSize || 25))))
    const baseConditions = ['cm.stat_day >= ?', 'cm.stat_day <= ?']
    const baseParameters: Array<string | number> = [startDate, endDate]
    const campaignIds = [...new Set((input?.campaignIds || []).filter(Boolean))]
    if (campaignIds.length) {
      baseConditions.push(`cm.campaign_id IN (${campaignIds.map(() => '?').join(', ')})`)
      baseParameters.push(...campaignIds)
    }
    if (input?.storeId && input.storeId !== 'all') { baseConditions.push('cm.store_id = ?'); baseParameters.push(input.storeId) }
    if (input?.source && input.source !== 'all') { baseConditions.push('cm.source = ?'); baseParameters.push(input.source) }

    const filters: string[] = []
    const filterParameters: Array<string | number> = []
    const search = String(input?.search || '').trim().toLowerCase()
    if (search) {
      filters.push(`(LOWER(sample_payload) LIKE ? OR LOWER(campaign_name) LIKE ? OR LOWER(asset_name) LIKE ?)`)
      filterParameters.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    if (input?.state && input.state !== 'all') {
      filters.push('(intelligence_state = ? OR derived_label = ?)')
      filterParameters.push(input.state, input.state)
    }
    if (Number(input?.minSpend) > 0) { filters.push('cost >= ?'); filterParameters.push(Number(input?.minSpend)) }
    if (Number(input?.minOrders) > 0) { filters.push('orders >= ?'); filterParameters.push(Number(input?.minOrders)) }
    if (Number(input?.minRoi) > 0) { filters.push('roi >= ?'); filterParameters.push(Number(input?.minRoi)) }
    if (Number(input?.maxCpa) > 0) { filters.push('cpa <= ?'); filterParameters.push(Number(input?.maxCpa)) }
    if (Number(input?.minCtr) > 0) { filters.push('ctr >= ?'); filterParameters.push(Number(input?.minCtr)) }

    const sortExpressions: Record<string, string> = {
      creativeName: 'asset_name', grossRevenue: 'revenue', cost: 'cost', orders: 'orders', roi: 'roi', cpa: 'cpa',
      ctr: 'ctr', playDepth: 'play_depth', intelligenceScore: 'intelligence_score', intelligenceRoiTrend: 'intelligence_roi_trend',
    }
    const sortExpression = sortExpressions[String(input?.sortBy || '')] || 'revenue'
    const sortDirection = input?.sortDirection === 'asc' ? 'ASC' : 'DESC'
    const requiresEnrichment = Boolean(search)
      || Boolean(input?.state && input.state !== 'all')
      || ['creativeName', 'intelligenceScore', 'intelligenceRoiTrend'].includes(String(input?.sortBy || ''))

    if (!requiresEnrichment) {
      const aggregateSql = `
        WITH aggregated AS (
          SELECT cm.campaign_id, cm.creative_id, cm.item_group_id,
            SUM(cm.cost) AS cost,
            SUM(cm.gross_revenue) AS revenue,
            SUM(cm.orders) AS orders,
            AVG(cm.ctr) AS ctr,
            AVG(cm.conversion_rate) AS conversion_rate,
            AVG(cm.play_2s_rate) AS play_2s_rate,
            AVG(cm.play_depth) AS play_depth,
            COUNT(*) AS samples,
            COUNT(DISTINCT cm.stat_day) AS days
          FROM gmv_creative_metrics cm
          WHERE ${baseConditions.join(' AND ')}
          GROUP BY cm.campaign_id, cm.creative_id, cm.item_group_id
        ), filtered AS (
          SELECT *,
            CASE WHEN cost > 0 THEN revenue / cost ELSE 0 END AS roi,
            CASE WHEN orders > 0 THEN cost / orders ELSE 0 END AS cpa
          FROM aggregated${filters.length ? ` WHERE ${filters.join(' AND ')}` : ''}
        )
        SELECT *, COUNT(*) OVER() AS total_count, SUM(cost) OVER() AS total_cost,
          SUM(revenue) OVER() AS total_revenue, SUM(orders) OVER() AS total_orders
        FROM filtered
        ORDER BY ${sortExpression} ${sortDirection}, creative_id ASC
        LIMIT ? OFFSET ?
      `
      const rows = getDatabase().prepare(aggregateSql)
        .all(...baseParameters, ...filterParameters, pageSize, (page - 1) * pageSize) as any[]
      const sampleStatement = getDatabase().prepare(`
        SELECT payload FROM gmv_creative_metrics
        WHERE campaign_id = ? AND creative_id = ? AND item_group_id = ? AND stat_day >= ? AND stat_day <= ?
        ORDER BY stat_date DESC, synced_at DESC LIMIT 1
      `)
      const summary = rows[0] || { total_count: 0, total_cost: 0, total_revenue: 0, total_orders: 0 }
      return {
        items: rows.map((row) => {
          const sample = sampleStatement.get(row.campaign_id, row.creative_id, row.item_group_id, startDate, endDate) as { payload?: string } | undefined
          return {
            sample: JSON.parse(String(sample?.payload || '{}')) as GmvMaxCreativeMetric,
            cost: Number(row.cost) || 0,
            revenue: Number(row.revenue) || 0,
            orders: Number(row.orders) || 0,
            ctr: Number(row.ctr) || 0,
            conversionRate: Number(row.conversion_rate) || 0,
            play2sRate: Number(row.play_2s_rate) || 0,
            playDepth: Number(row.play_depth) || 0,
            samples: Number(row.samples) || 0,
            days: Number(row.days) || 0,
          }
        }),
        total: Number(summary.total_count) || 0,
        summary: { cost: Number(summary.total_cost) || 0, revenue: Number(summary.total_revenue) || 0, orders: Number(summary.total_orders) || 0 },
        page,
        pageSize,
      }
    }

    const commonSql = `
      WITH ranked AS (
        SELECT cm.payload, cm.campaign_id, cm.creative_id, cm.item_group_id, cm.stat_date, cm.stat_day, cm.synced_at,
          cm.cost, cm.gross_revenue, cm.orders, cm.ctr, cm.conversion_rate, cm.play_2s_rate, cm.play_depth,
          ROW_NUMBER() OVER (
            PARTITION BY cm.campaign_id, cm.creative_id, cm.item_group_id
            ORDER BY cm.stat_date DESC, cm.synced_at DESC
          ) AS row_rank
        FROM gmv_creative_metrics cm
        WHERE ${baseConditions.join(' AND ')}
      ), aggregated AS (
        SELECT
          MAX(CASE WHEN row_rank = 1 THEN payload END) AS sample_payload,
          SUM(cost) AS cost,
          SUM(gross_revenue) AS revenue,
          SUM(orders) AS orders,
          AVG(ctr) AS ctr,
          AVG(conversion_rate) AS conversion_rate,
          AVG(play_2s_rate) AS play_2s_rate,
          AVG(play_depth) AS play_depth,
          COUNT(*) AS samples,
          COUNT(DISTINCT stat_day) AS days
        FROM ranked
        GROUP BY campaign_id, creative_id, item_group_id
      ), latest_insights AS (
        SELECT payload, campaign_id,
          ROW_NUMBER() OVER (
            PARTITION BY campaign_id, json_extract(payload, '$.creativeId'), COALESCE(json_extract(payload, '$.itemGroupId'), '')
            ORDER BY analyzed_at DESC
          ) AS row_rank
        FROM gmv_creative_insights
      ), latest_learning AS (
        SELECT payload, campaign_id, ROW_NUMBER() OVER (PARTITION BY campaign_id ORDER BY analyzed_at DESC) AS row_rank
        FROM gmv_learning_snapshots
      ), latest_assets AS (
        SELECT payload, store_id,
          ROW_NUMBER() OVER (
            PARTITION BY store_id, json_extract(payload, '$.creativeId'), COALESCE(json_extract(payload, '$.campaignId'), '')
            ORDER BY synced_at DESC
          ) AS row_rank
        FROM gmv_creative_assets
      ), enriched AS (
        SELECT aggregated.*,
          CASE WHEN aggregated.cost > 0 THEN aggregated.revenue / aggregated.cost ELSE 0 END AS roi,
          CASE WHEN aggregated.orders > 0 THEN aggregated.cost / aggregated.orders ELSE 0 END AS cpa,
          COALESCE(json_extract(li.payload, '$.state'), 'testing') AS intelligence_state,
          CAST(COALESCE(json_extract(li.payload, '$.score'), '0') AS REAL) AS intelligence_score,
          CAST(COALESCE(json_extract(li.payload, '$.roiTrendPercent'), '0') AS REAL) AS intelligence_roi_trend,
          COALESCE(json_extract(c.payload, '$.name'), json_extract(aggregated.sample_payload, '$.campaignId')) AS campaign_name,
          COALESCE(
            NULLIF(json_extract(aggregated.sample_payload, '$.creativeName'), ''),
            NULLIF(json_extract(campaign_asset.payload, '$.name'), ''),
            NULLIF(json_extract(default_asset.payload, '$.name'), ''),
            json_extract(aggregated.sample_payload, '$.creativeId')
          ) AS asset_name,
          CASE
            WHEN aggregated.orders >= 3 AND (CASE WHEN aggregated.cost > 0 THEN aggregated.revenue / aggregated.cost ELSE 0 END) >= CAST(COALESCE(json_extract(ll.payload, '$.profitFloor'), json_extract(p.payload, '$.minRoi'), '0') AS REAL) THEN 'winner'
            WHEN aggregated.orders = 0 AND CAST(COALESCE(json_extract(p.payload, '$.creativeTestBudget'), '0') AS REAL) > 0 AND aggregated.cost >= CAST(COALESCE(json_extract(p.payload, '$.creativeTestBudget'), '0') AS REAL) THEN 'waste'
            WHEN aggregated.orders < 3 AND (CAST(COALESCE(json_extract(p.payload, '$.creativeTestBudget'), '0') AS REAL) <= 0 OR aggregated.cost < CAST(COALESCE(json_extract(p.payload, '$.creativeTestBudget'), '0') AS REAL)) THEN 'testing'
            ELSE 'watch'
          END AS derived_label
        FROM aggregated
        LEFT JOIN gmv_campaigns c ON c.id = json_extract(aggregated.sample_payload, '$.campaignId')
        LEFT JOIN gmv_policies p ON p.campaign_id = json_extract(aggregated.sample_payload, '$.campaignId')
        LEFT JOIN latest_learning ll ON ll.campaign_id = json_extract(aggregated.sample_payload, '$.campaignId') AND ll.row_rank = 1
        LEFT JOIN latest_assets campaign_asset ON campaign_asset.store_id = json_extract(aggregated.sample_payload, '$.storeId')
          AND json_extract(campaign_asset.payload, '$.creativeId') = json_extract(aggregated.sample_payload, '$.creativeId')
          AND json_extract(campaign_asset.payload, '$.campaignId') = json_extract(aggregated.sample_payload, '$.campaignId')
          AND campaign_asset.row_rank = 1
        LEFT JOIN latest_assets default_asset ON default_asset.store_id = json_extract(aggregated.sample_payload, '$.storeId')
          AND json_extract(default_asset.payload, '$.creativeId') = json_extract(aggregated.sample_payload, '$.creativeId')
          AND COALESCE(json_extract(default_asset.payload, '$.campaignId'), '') = ''
          AND default_asset.row_rank = 1
        LEFT JOIN latest_insights li ON li.campaign_id = json_extract(aggregated.sample_payload, '$.campaignId')
          AND json_extract(li.payload, '$.creativeId') = json_extract(aggregated.sample_payload, '$.creativeId')
          AND COALESCE(json_extract(li.payload, '$.itemGroupId'), '') = COALESCE(json_extract(aggregated.sample_payload, '$.itemGroupId'), '')
          AND li.row_rank = 1
      ), filtered AS (
        SELECT * FROM enriched${filters.length ? ` WHERE ${filters.join(' AND ')}` : ''}
      )
    `
    const parameters = [...baseParameters, ...filterParameters]
    const rows = getDatabase().prepare(`${commonSql} SELECT sample_payload, cost, revenue, orders, ctr, conversion_rate, play_2s_rate, play_depth, samples, days, COUNT(*) OVER() AS total_count, SUM(cost) OVER() AS total_cost, SUM(revenue) OVER() AS total_revenue, SUM(orders) OVER() AS total_orders FROM filtered ORDER BY ${sortExpression} ${sortDirection}, asset_name ASC LIMIT ? OFFSET ?`)
      .all(...parameters, pageSize, (page - 1) * pageSize) as any[]
    const summary = rows[0] || { total_count: 0, total_cost: 0, total_revenue: 0, total_orders: 0 }
    return {
      items: rows.map((row) => ({
        sample: JSON.parse(String(row.sample_payload)) as GmvMaxCreativeMetric,
        cost: Number(row.cost) || 0,
        revenue: Number(row.revenue) || 0,
        orders: Number(row.orders) || 0,
        ctr: Number(row.ctr) || 0,
        conversionRate: Number(row.conversion_rate) || 0,
        play2sRate: Number(row.play_2s_rate) || 0,
        playDepth: Number(row.play_depth) || 0,
        samples: Number(row.samples) || 0,
        days: Number(row.days) || 0,
      })),
      total: Number(summary.total_count) || 0,
      summary: { cost: Number(summary.total_cost) || 0, revenue: Number(summary.total_revenue) || 0, orders: Number(summary.total_orders) || 0 },
      page,
      pageSize,
    }
  },
  saveCreativeMetric(item: GmvMaxCreativeMetric) {
    upsert(
      'gmv_creative_metrics',
      ['id', 'campaign_id', 'creative_id', 'item_group_id', 'store_id', 'source', 'stat_date', 'stat_day', 'cost', 'gross_revenue', 'orders', 'ctr', 'conversion_rate', 'play_2s_rate', 'play_depth', 'synced_at'],
      [item.id, item.campaignId, item.creativeId, item.itemGroupId || '', item.storeId, item.source, item.statDate, item.statDate.slice(0, 10), Number(item.cost) || 0, Number(item.grossRevenue) || 0, Number(item.orders) || 0, Number(item.ctr) || 0, Number(item.conversionRate) || 0, Number(item.play2sRate) || 0, Number(item.playDepth) || 0, item.syncedAt],
      item,
    )
    return item
  },
  removeCreativeMetric(id: string) { getDatabase().prepare('DELETE FROM gmv_creative_metrics WHERE id = ?').run(id) },
  listCreativeAssets: () => list<GmvMaxCreativeAsset>('gmv_creative_assets', 'synced_at DESC'),
  listCreativeAssetsForScope(input: { storeIds: string[]; campaignIds?: string[]; creativeIds?: string[] }) {
    const storeIds = [...new Set(input.storeIds.filter(Boolean))]
    const campaignIds = [...new Set((input.campaignIds || []).filter(Boolean))]
    const creativeIds = [...new Set((input.creativeIds || []).filter(Boolean))]
    if (!storeIds.length) return [] as GmvMaxCreativeAsset[]
    const conditions = [`store_id IN (${storeIds.map(() => '?').join(', ')})`]
    const parameters: string[] = [...storeIds]
    if (campaignIds.length) {
      conditions.push(`(COALESCE(json_extract(payload, '$.campaignId'), '') = '' OR json_extract(payload, '$.campaignId') IN (${campaignIds.map(() => '?').join(', ')}))`)
      parameters.push(...campaignIds)
    }
    if (creativeIds.length) {
      conditions.push(`json_extract(payload, '$.creativeId') IN (${creativeIds.map(() => '?').join(', ')})`)
      parameters.push(...creativeIds)
    }
    return getDatabase().prepare(`SELECT payload FROM gmv_creative_assets WHERE ${conditions.join(' AND ')} ORDER BY synced_at DESC`)
      .all(...parameters)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxCreativeAsset)
  },
  saveCreativeAsset(item: GmvMaxCreativeAsset) { upsert('gmv_creative_assets', ['id', 'store_id', 'synced_at'], [item.id, item.storeId, item.syncedAt], item); return item },
  listRealtimeSamples(campaignId?: string) {
    if (!campaignId) return list<GmvMaxRealtimeSample>('gmv_realtime_samples', 'synced_at DESC')
    return getDatabase().prepare('SELECT payload FROM gmv_realtime_samples WHERE campaign_id = ? ORDER BY synced_at ASC').all(campaignId).map((row: any) => JSON.parse(String(row.payload)) as GmvMaxRealtimeSample)
  },
  saveRealtimeSample(item: GmvMaxRealtimeSample) { upsert('gmv_realtime_samples', ['id', 'campaign_id', 'stat_date', 'synced_at'], [item.id, item.campaignId, item.statDate, item.syncedAt], item); return item },
  listRuleGroups: () => list<GmvMaxRuleGroup>('gmv_rule_groups'),
  saveRuleGroup(item: GmvMaxRuleGroup) { upsert('gmv_rule_groups', ['id', 'updated_at'], [item.id, item.updatedAt], item); return item },
  removeRuleGroup(id: string) { getDatabase().prepare('DELETE FROM gmv_rule_groups WHERE id = ?').run(id); getDatabase().prepare('DELETE FROM gmv_rule_bindings WHERE payload LIKE ?').run(`%\"ruleGroupId\":\"${id}\"%`) },
  listRuleBindings: () => list<GmvMaxRuleBinding>('gmv_rule_bindings'),
  saveRuleBinding(item: GmvMaxRuleBinding) { upsert('gmv_rule_bindings', ['id', 'campaign_id', 'updated_at'], [item.id, item.campaignId, item.updatedAt], item); return item },
  removeRuleBindingsForCampaign(campaignId: string) { getDatabase().prepare('DELETE FROM gmv_rule_bindings WHERE campaign_id = ?').run(campaignId) },
  listListEntries: () => list<GmvMaxListEntry>('gmv_list_entries'),
  listListEntriesForScope(storeIds: string[], campaignIds: string[]) {
    const uniqueStoreIds = [...new Set(storeIds.filter(Boolean))]
    const uniqueCampaignIds = [...new Set(campaignIds.filter(Boolean))]
    if (!uniqueStoreIds.length) return [] as GmvMaxListEntry[]
    const campaignClause = uniqueCampaignIds.length
      ? ` AND (COALESCE(json_extract(payload, '$.campaignId'), '') = '' OR json_extract(payload, '$.campaignId') IN (${uniqueCampaignIds.map(() => '?').join(', ')}))`
      : ''
    return getDatabase().prepare(`SELECT payload FROM gmv_list_entries WHERE store_id IN (${uniqueStoreIds.map(() => '?').join(', ')})${campaignClause} ORDER BY updated_at DESC`)
      .all(...uniqueStoreIds, ...uniqueCampaignIds)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxListEntry)
  },
  listListEntriesPage(input?: { page?: number; pageSize?: number; storeId?: string; campaignId?: string; mode?: string; entityType?: string; search?: string }) {
    const page = Math.max(1, Math.trunc(Number(input?.page || 1)))
    const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(input?.pageSize || 25))))
    const conditions: string[] = []
    const parameters: Array<string | number> = []
    if (input?.storeId && input.storeId !== 'all') { conditions.push('store_id = ?'); parameters.push(input.storeId) }
    if (input?.campaignId && input.campaignId !== 'all') { conditions.push("json_extract(payload, '$.campaignId') = ?"); parameters.push(input.campaignId) }
    if (input?.mode && input.mode !== 'all') { conditions.push("json_extract(payload, '$.mode') = ?"); parameters.push(input.mode) }
    if (input?.entityType && input.entityType !== 'all') { conditions.push("json_extract(payload, '$.entityType') = ?"); parameters.push(input.entityType) }
    const search = String(input?.search || '').trim().toLowerCase()
    if (search) {
      conditions.push("(LOWER(COALESCE(json_extract(payload, '$.label'), '')) LIKE ? OR LOWER(COALESCE(json_extract(payload, '$.entityId'), '')) LIKE ?)")
      parameters.push(`%${search}%`, `%${search}%`)
    }
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
    const totalRow = getDatabase().prepare(`SELECT COUNT(*) AS total FROM gmv_list_entries${where}`).get(...parameters) as { total: number }
    const rows = getDatabase().prepare(`SELECT payload FROM gmv_list_entries${where} ORDER BY updated_at DESC, id ASC LIMIT ? OFFSET ?`)
      .all(...parameters, pageSize, (page - 1) * pageSize)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxListEntry)
    return { items: rows, total: Number(totalRow.total || 0), page, pageSize }
  },
  saveListEntry(item: GmvMaxListEntry) { upsert('gmv_list_entries', ['id', 'store_id', 'updated_at'], [item.id, item.storeId, item.updatedAt], item); return item },
  removeListEntry(id: string) { getDatabase().prepare('DELETE FROM gmv_list_entries WHERE id = ?').run(id) },
  listSessions: () => list<GmvMaxSessionSnapshot>('gmv_session_snapshots', 'synced_at DESC'),
  saveSession(item: GmvMaxSessionSnapshot) { upsert('gmv_session_snapshots', ['id', 'campaign_id', 'synced_at'], [item.id, item.campaignId, item.syncedAt], item); return item },
  getActionLock(campaignId: string, actionType: string) { const row = getDatabase().prepare('SELECT payload FROM gmv_action_locks WHERE campaign_id = ? AND action_type = ?').get(campaignId, actionType) as any; return row ? JSON.parse(String(row.payload)) as GmvMaxActionLock : null },
  listActionLocks: () => list<GmvMaxActionLock>('gmv_action_locks'),
  saveActionLock(item: GmvMaxActionLock) { upsert('gmv_action_locks', ['campaign_id', 'action_type', 'expires_at', 'updated_at'], [item.campaignId, item.actionType, item.expiresAt, item.updatedAt], item); return item },
  removeActionLock(campaignId: string, actionType: string) { getDatabase().prepare('DELETE FROM gmv_action_locks WHERE campaign_id = ? AND action_type = ?').run(campaignId, actionType) },
  listBacktests: () => list<GmvMaxBacktestResult>('gmv_backtest_results', 'created_at DESC'),
  listRecentBacktests(limit = 20) {
    return getDatabase().prepare('SELECT payload FROM gmv_backtest_results ORDER BY created_at DESC LIMIT ?')
      .all(Math.max(1, Math.trunc(limit)))
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxBacktestResult)
  },
  listRecentBacktestSummaries(limit = 5) {
    const rows = getDatabase().prepare(`
      SELECT id, created_at,
        json_extract(payload, '$.campaignId') AS campaign_id,
        json_extract(payload, '$.startDate') AS start_date,
        json_extract(payload, '$.endDate') AS end_date,
        json_extract(payload, '$.actionCount') AS action_count,
        json_extract(payload, '$.scaleUpCount') AS scale_up_count,
        json_extract(payload, '$.scaleDownCount') AS scale_down_count,
        json_extract(payload, '$.holdCount') AS hold_count,
        json_extract(payload, '$.blockedCount') AS blocked_count,
        json_extract(payload, '$.stageTransitions') AS stage_transitions,
        json_extract(payload, '$.productGateBlockCount') AS product_gate_block_count,
        json_extract(payload, '$.productQualifiedDays') AS product_qualified_days,
        json_extract(payload, '$.productTestingDays') AS product_testing_days,
        json_extract(payload, '$.productRiskDays') AS product_risk_days,
        json_extract(payload, '$.productCostBlockedDays') AS product_cost_blocked_days,
        json_extract(payload, '$.productEvidenceMissingDays') AS product_evidence_missing_days,
        json_extract(payload, '$.projectedProfitDelta') AS projected_profit_delta
      FROM gmv_backtest_results ORDER BY created_at DESC LIMIT ?
    `).all(Math.max(1, Math.trunc(limit))) as any[]
    return rows.map((row) => ({
      id: String(row.id),
      campaignId: row.campaign_id ? String(row.campaign_id) : undefined,
      startDate: String(row.start_date || ''),
      endDate: String(row.end_date || ''),
      actionCount: Number(row.action_count) || 0,
      scaleUpCount: Number(row.scale_up_count) || 0,
      scaleDownCount: Number(row.scale_down_count) || 0,
      holdCount: Number(row.hold_count) || 0,
      blockedCount: Number(row.blocked_count) || 0,
      stageTransitions: Number(row.stage_transitions) || 0,
      productGateBlockCount: Number(row.product_gate_block_count) || 0,
      productQualifiedDays: Number(row.product_qualified_days) || 0,
      productTestingDays: Number(row.product_testing_days) || 0,
      productRiskDays: Number(row.product_risk_days) || 0,
      productCostBlockedDays: Number(row.product_cost_blocked_days) || 0,
      productEvidenceMissingDays: Number(row.product_evidence_missing_days) || 0,
      projectedProfitDelta: String(row.projected_profit_delta || '0'),
      details: {},
      createdAt: Number(row.created_at) || 0,
    })) satisfies GmvMaxBacktestResult[]
  },
  saveBacktest(item: GmvMaxBacktestResult) { upsert('gmv_backtest_results', ['id', 'created_at'], [item.id, item.createdAt], item); return item },
  listNotificationConfigs: () => list<GmvMaxNotificationConfig>('gmv_notification_configs'),
  saveNotificationConfig(item: GmvMaxNotificationConfig) { upsert('gmv_notification_configs', ['id', 'updated_at'], [item.id, item.updatedAt], item); return item },
  listNotifications: () => list<GmvMaxNotificationRecord>('gmv_notification_records', 'created_at DESC'),
  listRecentNotifications(limit = 100) {
    return getDatabase().prepare('SELECT payload FROM gmv_notification_records ORDER BY created_at DESC LIMIT ?')
      .all(Math.max(1, Math.trunc(limit)))
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxNotificationRecord)
  },
  saveNotification(item: GmvMaxNotificationRecord) { upsert('gmv_notification_records', ['id', 'status', 'created_at'], [item.id, item.status, item.createdAt], item); return item },
  getRuntimeState() {
    const row = getDatabase().prepare('SELECT payload FROM gmv_runtime_state WHERE id = ?').get('default') as any
    return row ? JSON.parse(String(row.payload)) as GmvMaxSchedulerState : null
  },
  saveRuntimeState(item: GmvMaxSchedulerState) {
    upsert('gmv_runtime_state', ['id', 'updated_at'], ['default', item.updatedAt], item)
    return item
  },
  listLearningSnapshots(campaignId?: string) {
    if (!campaignId) return list<GmvMaxLearningSnapshot>('gmv_learning_snapshots', 'analyzed_at DESC')
    return getDatabase().prepare('SELECT payload FROM gmv_learning_snapshots WHERE campaign_id = ? ORDER BY analyzed_at DESC').all(campaignId).map((row: any) => JSON.parse(String(row.payload)) as GmvMaxLearningSnapshot)
  },
  listLearningSnapshotsForCampaigns(campaignIds: string[]) {
    const uniqueIds = [...new Set(campaignIds.filter(Boolean))]
    if (!uniqueIds.length) return [] as GmvMaxLearningSnapshot[]
    return getDatabase().prepare(`SELECT payload FROM gmv_learning_snapshots WHERE campaign_id IN (${uniqueIds.map(() => '?').join(', ')}) ORDER BY analyzed_at DESC`)
      .all(...uniqueIds)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxLearningSnapshot)
  },
  saveLearningSnapshot(item: GmvMaxLearningSnapshot) { upsert('gmv_learning_snapshots', ['id', 'campaign_id', 'analyzed_at'], [item.id, item.campaignId, item.analyzedAt], item); return item },
  listActionOutcomes(campaignId?: string) {
    if (!campaignId) return list<GmvMaxActionOutcome>('gmv_action_outcomes', 'measured_at DESC')
    return getDatabase().prepare('SELECT payload FROM gmv_action_outcomes WHERE campaign_id = ? ORDER BY measured_at DESC').all(campaignId).map((row: any) => JSON.parse(String(row.payload)) as GmvMaxActionOutcome)
  },
  saveActionOutcome(item: GmvMaxActionOutcome) { upsert('gmv_action_outcomes', ['id', 'recommendation_id', 'campaign_id', 'measured_at'], [item.id, item.recommendationId, item.campaignId, item.measuredAt], item); return item },
  listCreativeInsights: () => list<GmvMaxCreativeInsight>('gmv_creative_insights', 'analyzed_at DESC'),
  listCreativeInsightsForCampaigns(campaignIds: string[]) {
    const uniqueIds = [...new Set(campaignIds.filter(Boolean))]
    if (!uniqueIds.length) return [] as GmvMaxCreativeInsight[]
    return getDatabase().prepare(`SELECT payload FROM gmv_creative_insights WHERE campaign_id IN (${uniqueIds.map(() => '?').join(', ')}) ORDER BY analyzed_at DESC`)
      .all(...uniqueIds)
      .map((row: any) => JSON.parse(String(row.payload)) as GmvMaxCreativeInsight)
  },
  saveCreativeInsight(item: GmvMaxCreativeInsight) { upsert('gmv_creative_insights', ['id', 'campaign_id', 'analyzed_at'], [item.id, item.campaignId, item.analyzedAt], item); return item },
  clearCreativeInsights() { getDatabase().prepare('DELETE FROM gmv_creative_insights').run() },
  listPortfolioPlans: () => list<GmvMaxPortfolioPlan>('gmv_portfolio_plans', 'analyzed_at DESC'),
  getPortfolioPlan(id: string) { const row = getDatabase().prepare('SELECT payload FROM gmv_portfolio_plans WHERE id = ?').get(id) as any; return row ? JSON.parse(String(row.payload)) as GmvMaxPortfolioPlan : null },
  savePortfolioPlan(item: GmvMaxPortfolioPlan) { upsert('gmv_portfolio_plans', ['id', 'store_id', 'analyzed_at'], [item.id, item.storeId, item.analyzedAt], item); return item },
  clearPortfolioPlans() { getDatabase().prepare('DELETE FROM gmv_portfolio_plans').run() },
  clearPortfolioDrafts() { getDatabase().prepare("DELETE FROM gmv_portfolio_plans WHERE payload LIKE '%\"status\":\"proposed\"%' OR payload LIKE '%\"status\":\"blocked\"%'").run() },
  listSopInstances: () => list<GmvMaxSopInstance>('gmv_sop_instances'),
  getSopInstance(id: string) { const row = getDatabase().prepare('SELECT payload FROM gmv_sop_instances WHERE id = ?').get(id) as any; return row ? JSON.parse(String(row.payload)) as GmvMaxSopInstance : null },
  saveSopInstance(item: GmvMaxSopInstance) { upsert('gmv_sop_instances', ['id', 'campaign_id', 'status', 'updated_at'], [item.id, item.campaignId, item.status, item.updatedAt], item); return item },
  listMatureAssessments: () => list<GmvMaxMatureAssessment>('gmv_mature_assessments'),
  saveMatureAssessment(item: GmvMaxMatureAssessment) { upsert('gmv_mature_assessments', ['id', 'campaign_id', 'sop_instance_id', 'stat_date', 'updated_at'], [item.id, item.campaignId, item.sopInstanceId, item.statDate, item.updatedAt], item); return item },
  listSopInterventions: () => list<GmvMaxSopIntervention>('gmv_sop_interventions'),
  getSopIntervention(id: string) { const row = getDatabase().prepare('SELECT payload FROM gmv_sop_interventions WHERE id = ?').get(id) as any; return row ? JSON.parse(String(row.payload)) as GmvMaxSopIntervention : null },
  saveSopIntervention(item: GmvMaxSopIntervention) { upsert('gmv_sop_interventions', ['id', 'campaign_id', 'sop_instance_id', 'status', 'updated_at'], [item.id, item.campaignId, item.sopInstanceId, item.status, item.updatedAt], item); return item },
  listSopAutomationRuns: () => list<GmvMaxSopAutomationRun>('gmv_sop_automation_runs'),
  saveSopAutomationRun(item: GmvMaxSopAutomationRun) { upsert('gmv_sop_automation_runs', ['id', 'campaign_id', 'sop_instance_id', 'local_date', 'status', 'updated_at'], [item.id, item.campaignId, item.sopInstanceId, item.localDate, item.status, item.updatedAt], item); return item },
  listSopTasks: () => list<GmvMaxSopTask>('gmv_sop_tasks'),
  saveSopTask(item: GmvMaxSopTask) { upsert('gmv_sop_tasks', ['id', 'sop_instance_id', 'local_date', 'status', 'updated_at'], [item.id, item.sopInstanceId, item.localDate, item.status, item.updatedAt], item); return item },
  getSopTask(id: string) { const row = getDatabase().prepare('SELECT payload FROM gmv_sop_tasks WHERE id = ?').get(id) as any; return row ? JSON.parse(String(row.payload)) as GmvMaxSopTask : null },
  listSupplementalMetrics: () => list<GmvMaxSupplementalMetric>('gmv_supplemental_metrics'),
  saveSupplementalMetric(item: GmvMaxSupplementalMetric) { upsert('gmv_supplemental_metrics', ['id', 'campaign_id', 'stat_date', 'source', 'updated_at'], [item.id, item.campaignId, item.statDate, item.source, item.updatedAt], item); return item },
  saveSupplementalMetrics(items: GmvMaxSupplementalMetric[]) {
    if (!items.length) return []
    const db = getDatabase()
    db.exec('BEGIN IMMEDIATE;')
    try {
      for (const item of items) upsert('gmv_supplemental_metrics', ['id', 'campaign_id', 'stat_date', 'source', 'updated_at'], [item.id, item.campaignId, item.statDate, item.source, item.updatedAt], item)
      db.exec('COMMIT;')
      return items
    } catch (error) {
      db.exec('ROLLBACK;')
      throw error
    }
  },
  listDecisionSnapshots: () => list<GmvMaxDecisionSnapshot>('gmv_decision_snapshots', 'evaluated_at DESC'),
  saveDecisionSnapshot(item: GmvMaxDecisionSnapshot) { upsert('gmv_decision_snapshots', ['id', 'campaign_id', 'sop_instance_id', 'priority', 'evaluated_at'], [item.id, item.campaignId, item.sopInstanceId, item.priority, item.evaluatedAt], item); return item },
  listExperiments: () => list<GmvMaxExperiment>('gmv_experiments', 'updated_at DESC'),
  getExperiment(id: string) { const row = getDatabase().prepare('SELECT payload FROM gmv_experiments WHERE id = ?').get(id) as any; return row ? JSON.parse(String(row.payload)) as GmvMaxExperiment : null },
  saveExperiment(item: GmvMaxExperiment) { upsert('gmv_experiments', ['id', 'campaign_id', 'sop_instance_id', 'state', 'updated_at'], [item.id, item.campaignId, item.sopInstanceId, item.state, item.updatedAt], item); return item },
  listProductProfiles: () => list<GmvMaxProductProfile>('gmv_product_profiles', 'updated_at DESC'),
  getProductProfile(id: string) { const row = getDatabase().prepare('SELECT payload FROM gmv_product_profiles WHERE id = ?').get(id) as any; return row ? JSON.parse(String(row.payload)) as GmvMaxProductProfile : null },
  saveProductProfile(item: GmvMaxProductProfile) { upsert('gmv_product_profiles', ['id', 'campaign_id', 'store_id', 'product_id', 'updated_at'], [item.id, item.campaignId, item.storeId, item.productId || '', item.updatedAt], item); return item },
  listCoachRuns: () => list<GmvMaxCoachRun>('gmv_coach_runs', 'updated_at DESC'),
  getCoachRun(id: string) { const row = getDatabase().prepare('SELECT payload FROM gmv_coach_runs WHERE id = ?').get(id) as any; return row ? JSON.parse(String(row.payload)) as GmvMaxCoachRun : null },
  saveCoachRun(item: GmvMaxCoachRun) { upsert('gmv_coach_runs', ['id', 'campaign_id', 'sop_instance_id', 'status', 'updated_at'], [item.id, item.campaignId, item.sopInstanceId || '', item.status, item.updatedAt], item); return item },
  listWinnerDna: () => list<GmvMaxWinnerDna>('gmv_winner_dna'),
  getWinnerDna(id: string) { const row = getDatabase().prepare('SELECT payload FROM gmv_winner_dna WHERE id = ?').get(id) as any; return row ? JSON.parse(String(row.payload)) as GmvMaxWinnerDna : null },
  saveWinnerDna(item: GmvMaxWinnerDna) { upsert('gmv_winner_dna', ['id', 'sop_instance_id', 'campaign_id', 'updated_at'], [item.id, item.sopInstanceId, item.campaignId, item.updatedAt], item); return item },
  listSyncJobs: () => list<GmvMaxSyncProgress>('gmv_sync_jobs'),
  getSyncJob(id: string) { const row = getDatabase().prepare('SELECT payload FROM gmv_sync_jobs WHERE id = ?').get(id) as any; return row ? JSON.parse(String(row.payload)) as GmvMaxSyncProgress : null },
  saveSyncJob(item: GmvMaxSyncProgress) { upsert('gmv_sync_jobs', ['id', 'status', 'updated_at'], [item.jobId, item.status, item.updatedAt], item); return item },
}

export function closeGmvMaxSqlite() {
  database?.close?.()
  database = null
}
