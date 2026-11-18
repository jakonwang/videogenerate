import { productsRepo } from '../products/repo'
import { contentIndex } from './contentIndex'
import { reviewStore } from './stores'

/**
 * A compact, read-only picture of the user's real data so the AI producer's brain can resolve
 * "this earring" to a product id or know which projects are in progress.
 */
export async function buildWorkspaceSnapshot() {
  const [products, projects, reviewDb] = await Promise.all([
    productsRepo.list().catch(() => []),
    contentIndex.recentProjects(8).catch(() => []),
    reviewStore.read().catch(() => ({ records: {} as Record<string, { decision: string }> })),
  ])
  const pendingReviews = Object.values(reviewDb.records).filter((record) => record.decision === 'pending').length
  return {
    products: products
      .slice()
      .sort((a: any, b: any) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, 40)
      .map((item: any) => ({ id: item.id, name: item.name, type: item.type })),
    recentProjects: projects.map((item) => ({
      ref: item.ref,
      line: item.line,
      title: item.title,
      productId: item.productId,
      status: item.status,
      stage: item.stage,
    })),
    pendingReviews,
  }
}
