import { getPromptConsistencyDb } from '../client'

export const ruleSetRepository = {
  listActive() {
    const db = getPromptConsistencyDb()
    return db.prepare('SELECT * FROM pc_rule_sets WHERE is_active = 1 ORDER BY updated_at DESC').all()
  },
}
