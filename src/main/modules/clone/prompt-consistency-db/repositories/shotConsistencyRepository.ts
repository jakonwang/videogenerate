import { getPromptConsistencyDb } from '../client'
import type {
  DbIdentityAnchorRow,
  DbPromptLayerRow,
  DbShotPatchRow,
  DbShotReportRow,
  DbShotRiskFlagRow,
} from '../types'

export const shotConsistencyRepository = {
  replaceReport(input: {
    report: DbShotReportRow
    anchors: DbIdentityAnchorRow[]
    riskFlags: DbShotRiskFlagRow[]
    patches: DbShotPatchRow[]
    layers: DbPromptLayerRow[]
  }) {
    const db = getPromptConsistencyDb()
    db.exec('BEGIN')
    try {
      db.prepare(
        `INSERT INTO pc_shot_reports (
          id, project_id, shot_id, product_type, risk_level, strict_consistency_mode, reference_priority_mode,
          compiler_version, policy_version, compiled_prompt, compiled_negative_prompt, source_prompt_hash,
          report_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, shot_id) DO UPDATE SET
          id=excluded.id,
          product_type=excluded.product_type,
          risk_level=excluded.risk_level,
          strict_consistency_mode=excluded.strict_consistency_mode,
          reference_priority_mode=excluded.reference_priority_mode,
          compiler_version=excluded.compiler_version,
          policy_version=excluded.policy_version,
          compiled_prompt=excluded.compiled_prompt,
          compiled_negative_prompt=excluded.compiled_negative_prompt,
          source_prompt_hash=excluded.source_prompt_hash,
          report_json=excluded.report_json,
          updated_at=excluded.updated_at`,
      ).run(
        input.report.id,
        input.report.project_id,
        input.report.shot_id,
        input.report.product_type,
        input.report.risk_level,
        input.report.strict_consistency_mode,
        input.report.reference_priority_mode,
        input.report.compiler_version,
        input.report.policy_version,
        input.report.compiled_prompt,
        input.report.compiled_negative_prompt,
        input.report.source_prompt_hash,
        input.report.report_json,
        input.report.created_at,
        input.report.updated_at,
      )

      db.prepare('DELETE FROM pc_shot_anchors WHERE project_id = ? AND shot_id = ?').run(input.report.project_id, input.report.shot_id)
      db.prepare('DELETE FROM pc_shot_risk_flags WHERE project_id = ? AND shot_id = ?').run(input.report.project_id, input.report.shot_id)
      db.prepare('DELETE FROM pc_shot_patches WHERE project_id = ? AND shot_id = ?').run(input.report.project_id, input.report.shot_id)
      db.prepare('DELETE FROM pc_shot_prompt_layers WHERE project_id = ? AND shot_id = ?').run(input.report.project_id, input.report.shot_id)

      const insertAnchor = db.prepare(
        'INSERT INTO pc_shot_anchors (id, project_id, shot_id, anchor_key, anchor_value, confidence, source, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      for (const row of input.anchors) {
        insertAnchor.run(row.id, row.project_id, row.shot_id, row.anchor_key, row.anchor_value, row.confidence, row.source, row.sort_order, row.created_at)
      }

      const insertRisk = db.prepare(
        'INSERT INTO pc_shot_risk_flags (id, project_id, shot_id, risk_flag, severity, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      for (const row of input.riskFlags) {
        insertRisk.run(row.id, row.project_id, row.shot_id, row.risk_flag, row.severity, row.created_at)
      }

      const insertPatch = db.prepare(
        'INSERT INTO pc_shot_patches (id, project_id, shot_id, patch_type, patch_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      for (const row of input.patches) {
        insertPatch.run(row.id, row.project_id, row.shot_id, row.patch_type, row.patch_text, row.created_at, row.updated_at)
      }

      const insertLayer = db.prepare(
        'INSERT INTO pc_shot_prompt_layers (id, project_id, shot_id, layer_name, layer_priority, layer_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      for (const row of input.layers) {
        insertLayer.run(row.id, row.project_id, row.shot_id, row.layer_name, row.layer_priority, row.layer_text, row.created_at)
      }

      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  },

  getReport(projectId: string, shotId: string) {
    const db = getPromptConsistencyDb()
    return db.prepare('SELECT * FROM pc_shot_reports WHERE project_id = ? AND shot_id = ?').get(projectId, shotId) as DbShotReportRow | undefined
  },

  listAnchors(projectId: string, shotId: string) {
    const db = getPromptConsistencyDb()
    return db.prepare('SELECT * FROM pc_shot_anchors WHERE project_id = ? AND shot_id = ? ORDER BY sort_order ASC').all(projectId, shotId) as DbIdentityAnchorRow[]
  },

  listRiskFlags(projectId: string, shotId: string) {
    const db = getPromptConsistencyDb()
    return db.prepare('SELECT * FROM pc_shot_risk_flags WHERE project_id = ? AND shot_id = ? ORDER BY created_at ASC').all(projectId, shotId) as DbShotRiskFlagRow[]
  },

  listPatches(projectId: string, shotId: string) {
    const db = getPromptConsistencyDb()
    return db.prepare('SELECT * FROM pc_shot_patches WHERE project_id = ? AND shot_id = ? ORDER BY created_at ASC').all(projectId, shotId) as DbShotPatchRow[]
  },

  listLayers(projectId: string, shotId: string) {
    const db = getPromptConsistencyDb()
    return db.prepare('SELECT * FROM pc_shot_prompt_layers WHERE project_id = ? AND shot_id = ? ORDER BY layer_priority ASC').all(projectId, shotId) as DbPromptLayerRow[]
  },
}
