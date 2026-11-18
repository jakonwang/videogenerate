import { contentIndex } from './contentIndex'
import { brandMemoryStore, reviewStore } from './stores'
import type { InsightsReport } from './types'
import { computeInsights, REDO_REASON_LABEL } from '../../../shared/contentReports'

export { REDO_REASON_LABEL }

/**
 * Feedback loop: production volume, review outcomes and publishing results per line and product.
 * The calculation itself lives in src/shared/contentReports.ts so the web version reports the same numbers.
 */
export async function buildInsights(rangeDays = 7): Promise<InsightsReport> {
  const [items, reviewDb, memory] = await Promise.all([contentIndex.listAll(), reviewStore.read(), brandMemoryStore.read()])
  return computeInsights({ items, reviews: reviewDb.records, feedback: memory.feedback, rangeDays }) as InsightsReport
}
