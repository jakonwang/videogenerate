/**
 * 模板库同步：网页（服务器引擎上的电脑端模板页面）改了电脑端独有的设置，电脑端要照着更新；
 * 参考分镜缩略图是别的设备上的文件，不能带过来，本机已有的要保留。
 */
import assert from 'node:assert/strict'
import { fromSyncTemplate, toSyncTemplate } from '../src/main/modules/cloud-sync/templateBridge'
import type { Template } from '../src/main/modules/templates/types'

const local = {
  id: 'local-1',
  name: '基础模板',
  structure: ['hook', 'show'],
  totalDurationSec: { min: 7, max: 15 },
  segmentDurationSec: { hook: { min: 2, max: 3 }, show: { min: 2, max: 3 } },
  segmentFx: {},
  lut3d: { fileName: 'warm.cube' },
  transition: { enabled: false },
  meta: { source: 'video_ai', referenceShots: [{ index: 0, segment: 'hook', startSec: 0, durationSec: 2, motion: '', transitionIn: '', scriptText: '', onScreenText: '', visual: '', thumbnailPath: 'C:\\local\\shot_1.jpg' }] },
  createdAt: 1,
  updatedAt: 1,
} as unknown as Template

// The other device (server engine) changed the LUT and turned on transitions; its thumbnails are its own files.
const remoteTemplate = {
  ...local,
  id: 'engine-9',
  lut3d: { fileName: 'cool.cube' },
  transition: { enabled: true },
  meta: { ...local.meta, referenceShots: [{ ...local.meta!.referenceShots![0]!, scriptText: '新文案', thumbnailPath: '/srv/engine/u1/shot_1.jpg' }, { ...local.meta!.referenceShots![0]!, index: 1, thumbnailPath: '/srv/engine/u1/shot_2.jpg' }] },
} as unknown as Template
const sync = toSyncTemplate(remoteTemplate, [])

const merged = fromSyncTemplate(sync, local, [])
assert.equal(merged.lut3d?.fileName, 'cool.cube', 'LUT changed on the other device is applied')
assert.equal((merged.transition as { enabled?: boolean } | undefined)?.enabled, true, 'transition changed on the other device is applied')
const shots = merged.meta?.referenceShots ?? []
assert.equal(shots[0]?.scriptText, '新文案')
assert.equal(shots[0]?.thumbnailPath, 'C:\\local\\shot_1.jpg', 'own thumbnail kept')
assert.equal(shots[1]?.thumbnailPath, undefined, "the other device's file path is dropped")
assert.equal((merged as { id?: string }).id, undefined, 'local id is not overwritten')

// A new template on this device: no foreign thumbnail paths at all.
const fresh = fromSyncTemplate(sync, null, [])
assert.ok((fresh.meta?.referenceShots ?? []).every((shot) => !shot.thumbnailPath))
assert.equal(fresh.lut3d?.fileName, 'cool.cube')

// Old clients that send no desktop settings keep this computer's own.
const { desktop: _d, ...withoutDesktop } = sync
const legacy = fromSyncTemplate(withoutDesktop, local, [])
assert.equal(legacy.lut3d?.fileName, 'warm.cube')

console.log('template-bridge-merge smoke ok')
