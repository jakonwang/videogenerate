/** Rows and results shown by GmvChangeDialog for budget / target ROI / on-off changes. */
export type GmvChangeRow = {
  campaignId: string
  campaignName: string
  field: 'budget' | 'roi' | 'status'
  before: string
  after: string
  change?: number | null
  warnings: string[]
}
export type GmvChangeResult = { campaignId: string; ok: boolean; error?: string; undoId?: string }
