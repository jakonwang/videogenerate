export class GmvMaxPortfolioExecutionError extends Error {
  rollbackApplied: boolean

  constructor(message: string, rollbackApplied: boolean) {
    super(message)
    this.name = 'GmvMaxPortfolioExecutionError'
    this.rollbackApplied = rollbackApplied
  }
}

export async function executeGmvMaxPortfolioTransfer<T>(input: {
  donorCampaignId: string
  receiverCampaignId: string
  donorBudgetBefore: string
  donorBudgetAfter: string
  receiverBudgetBefore: string
  receiverBudgetAfter: string
  verifyBudget: (campaignId: string, expectedBudget: string) => Promise<void>
  updateBudget: (campaignId: string, budget: string) => Promise<T>
}) {
  await input.verifyBudget(input.donorCampaignId, input.donorBudgetBefore)
  await input.verifyBudget(input.receiverCampaignId, input.receiverBudgetBefore)
  const donorUpdate = await input.updateBudget(input.donorCampaignId, input.donorBudgetAfter)
  await input.verifyBudget(input.donorCampaignId, input.donorBudgetAfter)
  try {
    const receiverUpdate = await input.updateBudget(input.receiverCampaignId, input.receiverBudgetAfter)
    await input.verifyBudget(input.receiverCampaignId, input.receiverBudgetAfter)
    return { donorUpdate, receiverUpdate }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    let rollbackApplied = false
    try {
      await input.updateBudget(input.donorCampaignId, input.donorBudgetBefore)
      await input.verifyBudget(input.donorCampaignId, input.donorBudgetBefore)
      rollbackApplied = true
    } catch (rollbackError) {
      const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      throw new GmvMaxPortfolioExecutionError(`${message}; donor rollback failed: ${rollbackMessage}`, false)
    }
    throw new GmvMaxPortfolioExecutionError(message, rollbackApplied)
  }
}
