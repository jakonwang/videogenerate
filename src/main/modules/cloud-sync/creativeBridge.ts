/**
 * tk创意室 orders from the web / phone, executed by this computer (it holds the TikTok creative
 * accounts). Pure logic with an injectable service so it can be tested without Electron.
 */
import { createHash } from 'node:crypto'
import type { SyncCreativeRequest } from '../../../shared/cloud/selling'

export type CreativeTaskShot = { shotId: string; status: string; resultVideoPath?: string; lastError?: string }
export type CreativeService = {
  createFromReference(input: { referenceImagePaths: string[]; productId: string; mode?: 'reference_to_video' | 'image_to_video' }): Promise<{ id: string }>
  get(taskId: string): Promise<{ id: string; shots: CreativeTaskShot[] } | null>
}

/** Desktop shot status → what the web shows. Anything not finished counts as running. */
export function shotState(status: string): 'running' | 'completed' | 'failed' {
  if (status === 'completed') return 'completed'
  if (status === 'failed' || status === 'requires_manual' || status === 'cancelled') return 'failed'
  return 'running'
}

/** Overall request state once every shot has an outcome. */
export function requestState(shots: Array<{ status: 'running' | 'completed' | 'failed' }>): SyncCreativeRequest['state'] {
  if (!shots.length || shots.some((shot) => shot.status === 'running')) return 'running'
  return shots.some((shot) => shot.status === 'completed') ? 'completed' : 'failed'
}

export function reportFingerprint(request: Pick<SyncCreativeRequest, 'state' | 'shots' | 'error'>) {
  return createHash('sha1').update(JSON.stringify([request.state, request.shots, request.error])).digest('hex')
}

export async function defaultCreativeService(): Promise<CreativeService | null> {
  try {
    const { tiktokCreativeStudioService } = await import('../tiktok-creative-studio/service')
    const { tiktokCreativeStudioRepo } = await import('../tiktok-creative-studio/repo')
    return {
      createFromReference: (input) => tiktokCreativeStudioService.createFromReference(input),
      get: (taskId) => tiktokCreativeStudioRepo.get(taskId),
    }
  } catch {
    return null
  }
}
