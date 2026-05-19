import { getPromptConsistencyDb } from '../client'
import type { DbCompilationHistoryRow } from '../types'

export const compilationHistoryRepository = {
  insert(input: DbCompilationHistoryRow) {
    const db = getPromptConsistencyDb()
    db.prepare(
      `INSERT INTO pc_compilation_history (
        id, project_id, shot_id, compiler_version, policy_version, risk_level, compiled_prompt, compiled_negative_prompt, snapshot_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.id,
      input.project_id,
      input.shot_id,
      input.compiler_version,
      input.policy_version,
      input.risk_level,
      input.compiled_prompt,
      input.compiled_negative_prompt,
      input.snapshot_json,
      input.created_at,
    )
  },
}
