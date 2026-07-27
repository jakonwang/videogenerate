// -*- coding: utf-8 -*-
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { normalizeTiktokCookies } from '../src/main/modules/tiktok-creative-studio/accounts'
import { normalizeTiktokPreparedImageAspect } from '../src/main/modules/tiktok-creative-studio/imageAspect'

async function main() {
  const cookies = normalizeTiktokCookies([
    {
      name: 'sessionid_ads',
      value: 'test-session',
      domain: '.tiktok.com',
      path: '/',
      expirationDate: 2000000000,
      httpOnly: true,
      secure: true,
      sameSite: 'no_restriction',
    },
  ])
  assert.equal(cookies.length, 1)
  assert.equal(cookies[0].sameSite, 'None')
  assert.equal(cookies[0].expires, 2000000000)

  const aspectRoot = await mkdtemp(join(tmpdir(), 'tiktok-image-aspect-'))
  try {
    const sourcePath = join(aspectRoot, 'source.png')
    await sharp({ create: { width: 720, height: 960, channels: 3, background: '#445566' } }).png().toFile(sourcePath)
    const normalized = await normalizeTiktokPreparedImageAspect(sourcePath, join(aspectRoot, 'output'))
    const metadata = await sharp(normalized.path).metadata()
    assert.equal(normalized.normalized, true)
    assert.equal(metadata.width, 720)
    assert.equal(metadata.height, 1280)
  } finally {
    await rm(aspectRoot, { recursive: true, force: true })
  }

  const root = process.cwd()
  const view = await readFile(join(root, 'src/renderer/src/ui/views/TiktokCreativeStudioView.vue'), 'utf8')
  const ipc = await readFile(join(root, 'src/main/ipc/registerTiktokCreativeStudioIpc.ts'), 'utf8')
  const preload = await readFile(join(root, 'src/preload/index.ts'), 'utf8')
  const service = await readFile(join(root, 'src/main/modules/tiktok-creative-studio/service.ts'), 'utf8')
  const officialClient = await readFile(join(root, 'src/main/modules/tiktok-creative-studio/officialClient.ts'), 'utf8')
  const livePhotoService = await readFile(join(root, 'src/main/modules/live-photo/service.ts'), 'utf8')
  const runtimeLogDialog = await readFile(join(root, 'src/renderer/src/ui/components/RuntimeLogDialog.vue'), 'utf8')

  assert.match(view, /\u4ece\u53c2\u8003\u56fe\u521b\u5efa/)
  assert.match(view, /\u5e93 \/ \u5bfc\u51fa/)
  assert.doesNotMatch(view, /\u4ece\u590d\u523b\u955c\u5934\u521b\u5efa/)
  assert.match(view, /confirmRemoveShot/)
  assert.match(view, /deleteTarget/)
  assert.match(view, /confirmBatchDelete/)
  assert.match(view, /BatchDeleteDialog/)
  assert.match(view, /const imagePaths = \[\.\.\.referenceImagePaths\.value\]/)
  assert.match(view, /referenceImagePaths: imagePaths/)
  assert.match(view, /openLogs\(task, shot\)/)
  assert.match(view, /openRegionEditor\(task, shot\)/)
  assert.match(view, /saveRegionAndRetry/)
  assert.match(view, /框选主要区域并重新生成/)
  assert.match(view, /自动重试进度/)
  assert.match(view, /质量失败项/)
  assert.match(view, /:logs="runtimeLogs"/)
  assert.match(view, /:show-all="true"/)
  assert.match(view, /syncRuntimeSelection\(\)/)
  assert.match(runtimeLogDialog, /showAll\?: boolean/)
  assert.match(runtimeLogDialog, /replace\(\/\\u001b\\\[\[0-9;\]\*m\/g, ''\)/)
  assert.match(ipc, /plugin:tiktokCreative:createFromReference/)
  assert.match(ipc, /replacementRegion\?: \{ x: number; y: number; width: number; height: number \}/)
  assert.doesNotMatch(ipc, /createDraftFromCloneProject/)
  assert.match(preload, /tiktokCreative:createFromReference/)
  assert.match(preload, /tiktokCreative:listAccounts/)
  assert.match(preload, /replacementRegion\?: \{ x: number; y: number; width: number; height: number \}/)
  assert.match(service, /prepareReferenceImageForExternalWorkflow/)
  assert.match(service, /normalizeTiktokPreparedImageAspect/)
  assert.match(service, /const TIKTOK_IMAGE_RETRY_LIMIT = 2/)
  assert.match(service, /automatic retry \$\{nextRetryCount\}\/\$\{TIKTOK_IMAGE_RETRY_LIMIT\}/)
  assert.match(service, /\[image_retry_exhausted\]/)
  assert.match(service, /replacement region corrected manually/)
  assert.match(service, /legacy page failure migrated to official API processing/)
  assert.match(service, /TikTok's Creative GenAl Terms/)
  assert.match(service, /tiktok-creative-studio', taskId, shotId/)
  assert.doesNotMatch(service, /livePhotoService\.prepareReferenceStillForExternalUse/)
  assert.doesNotMatch(service, /preparationItemId/)
  assert.doesNotMatch(service, /getByText|getByRole|filechooser|setInputFiles|launchPersistentContext|runAutomationPreparation/)
  assert.match(service, /Legacy clone tasks are read-only and cannot be submitted/)
  assert.match(service, /queued for official API processing/)
  assert.doesNotMatch(livePhotoService, /prepareReferenceStillForExternalUse/)
  assert.doesNotMatch(livePhotoService, /stopAfterImage/)
  assert.match(officialClient, /creative_bff_i18n\/api\/cue\/upload/)
  assert.match(officialClient, /save_to_my_library/)
  assert.match(officialClient, /i2v\/create_generate_task/)
  assert.match(officialClient, /generate-task\/check/)
  assert.match(officialClient, /cue\/video_info/)
  assert.match(officialClient, /\[binary omitted\]/)
  assert.doesNotMatch(officialClient, /getByText|getByRole|filechooser|setInputFiles/)
  assert.match(view, /创建结果待确认/)
  assert.doesNotMatch(view, /等待人工复核/)
  assert.match(view, /video-dialog__player/)
  assert.match(view, /openSingleSubtitleDialog/)
  assert.match(view, /回退字幕/)
  assert.match(view, /subtitleTitleStrategy/)
  assert.match(view, /subtitlePresets/)
  assert.match(view, /subtitleCaptionStyle/)
  assert.match(view, /随机标题池/)
  assert.match(view, /爆款钩子款/)
  assert.doesNotMatch(view, /subtitleMode !== 'timed_caption'/)
  assert.match(service, /async revertSubtitles/)
  assert.match(service, /titleRenderMode: 'overlay_image'/)
  assert.match(ipc, /plugin:tiktokCreative:revertSubtitles/)
  assert.match(preload, /tiktokCreative:revertSubtitles/)
  assert.match(view, /durationSec: 10/)
  assert.match(view, /十秒视频任务/)
  assert.match(service, /const DEFAULT_DURATION_SEC = 10/)
  assert.match(service, /result\.source\.mp4/)
  assert.match(service, /'-profile:v',[\s\S]*'baseline'/)
  assert.match(service, /'-movflags',[\s\S]*'\+faststart'/)

  console.log('tiktok creative studio reference workflow smoke test passed')
}

void main()
