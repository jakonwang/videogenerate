import { DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT } from './promptVersions'

export function buildLivePhotoReplacementPrompt(lockedPrompt?: string) {
  return String(lockedPrompt || '').trim() || DEFAULT_LIVE_PHOTO_REPLACEMENT_PROMPT
}
