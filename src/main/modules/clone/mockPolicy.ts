import { getAppEnv, isProductionEnv } from '../../lib/appEnv'
import type { ModelCredentials } from './types'

export function canUseMockGeneration(credentials: ModelCredentials) {
  const env = getAppEnv()
  const allowByEnv = !isProductionEnv() && String(process.env.VG_ALLOW_MOCK_GENERATION || '').trim() !== 'false'
  return Boolean(credentials.allowMockWhenNoKey && allowByEnv)
}
