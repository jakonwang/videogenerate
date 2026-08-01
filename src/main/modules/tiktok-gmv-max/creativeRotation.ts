export class GmvMaxCreativeRotationError extends Error {
  rollbackApplied: boolean

  constructor(message: string, rollbackApplied: boolean) {
    super(message)
    this.name = 'GmvMaxCreativeRotationError'
    this.rollbackApplied = rollbackApplied
  }
}

export async function executeGmvMaxCreativeRotation<T>(input: {
  addCreativeId: string
  removeCreativeId: string
  updateCreative: (operation: 'ADD' | 'REMOVE', creativeId: string) => Promise<T>
}) {
  if (!input.addCreativeId || !input.removeCreativeId || input.addCreativeId === input.removeCreativeId) {
    throw new Error('Creative rotation requires distinct add and remove assets.')
  }
  const addUpdate = await input.updateCreative('ADD', input.addCreativeId)
  try {
    const removeUpdate = await input.updateCreative('REMOVE', input.removeCreativeId)
    return { addUpdate, removeUpdate }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    try {
      await input.updateCreative('REMOVE', input.addCreativeId)
    } catch (rollbackError) {
      const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError)
      throw new GmvMaxCreativeRotationError(`${message}; replacement rollback failed: ${rollbackMessage}`, false)
    }
    throw new GmvMaxCreativeRotationError(message, true)
  }
}
