import { createHash } from 'node:crypto'
import type { VideoPlan } from '../random/engine'

export function computePlanHash(input: { productId: string; templateId: string; plan: VideoPlan }) {
  const h = createHash('sha256')
  h.update(input.productId)
  h.update('|')
  h.update(input.templateId)
  h.update('|')
  for (const s of input.plan.segments) {
    h.update(`${s.segment}:${s.assetId}:${s.startSec}:${s.durationSec}:${s.hasAudio ? 1 : 0}|`)
    if (s.fx) h.update(`fx:${s.fx.zoom}:${s.fx.moveX}:${s.fx.moveY}|`)
    if (s.jitter?.speed != null) h.update(`sp:${s.jitter.speed}|`)
    if (s.jitter?.color) {
      const c = s.jitter.color
      h.update(`c:${c.brightness}:${c.contrast}:${c.saturation}:${c.hueDeg}|`)
    }
  }
  if (input.plan.colorGrade) {
    const g = input.plan.colorGrade
    h.update(`grade:${g.brightness}:${g.contrast}:${g.saturation}|`)
  }
  if (input.plan.aspectUnifyMode) h.update(`aspect:${input.plan.aspectUnifyMode}|`)
  if (input.plan.lut3d?.filePath) h.update(`lut:${input.plan.lut3d.filePath}|`)
  if (input.plan.sticker?.filePath) h.update(`sticker:${input.plan.sticker.filePath}:${input.plan.sticker.heightPx}|`)
  if (input.plan.bgm?.filePath) h.update(`bgm:${input.plan.bgm.filePath}:${input.plan.bgm.volume}|`)
  if (input.plan.titleOverlay?.text) h.update(`title:${input.plan.titleOverlay.text}|`)
  if (input.plan.tts?.text) h.update(`tts:${input.plan.tts.text}|`)
  if (input.plan.voice?.filePath) {
    h.update(`voice:${input.plan.voice.filePath}:${input.plan.voice.volume}:${input.plan.voice.keepOriginal ? 1 : 0}|`)
  }
  const src = input.plan.audio?.source ?? 'keep'
  const duck = input.plan.audio?.ducking
  h.update(`audiosrc:${src}|`)
  if (duck) h.update(`duck:${duck.enabled ? 1 : 0}:${duck.amountDb}|`)
  return h.digest('hex')
}

