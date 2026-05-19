import { getPromptConsistencyDb } from '../client'
import type { DbProjectConsistencyRow } from '../types'

export const projectConsistencyRepository = {
  upsert(input: DbProjectConsistencyRow) {
    const db = getPromptConsistencyDb()
    db.prepare(
      `INSERT INTO pc_projects (
        project_id, compiler_version, policy_version, last_compiled_at, strict_mode_default, summary_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        compiler_version=excluded.compiler_version,
        policy_version=excluded.policy_version,
        last_compiled_at=excluded.last_compiled_at,
        strict_mode_default=excluded.strict_mode_default,
        summary_json=excluded.summary_json,
        updated_at=excluded.updated_at`,
    ).run(
      input.project_id,
      input.compiler_version,
      input.policy_version,
      input.last_compiled_at,
      input.strict_mode_default,
      input.summary_json,
      input.created_at,
      input.updated_at,
    )
  },

  get(projectId: string) {
    const db = getPromptConsistencyDb()
    return db.prepare('SELECT * FROM pc_projects WHERE project_id = ?').get(projectId) as DbProjectConsistencyRow | undefined
  },
}
