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
    const sourcePath = join(aspectRoot, 'localized-replacement-r1-1787638744135-04ffa951-e20b-4642-9b9a-8d01bb4f753b.png')
    await sharp({ create: { width: 720, height: 960, channels: 3, background: '#445566' } }).png().toFile(sourcePath)
    const outputDir = join(aspectRoot, 'generated-still')
    const normalized = await normalizeTiktokPreparedImageAspect(sourcePath, outputDir)
    const metadata = await sharp(normalized.path).metadata()
    assert.equal(normalized.normalized, true)
    assert.equal(metadata.width, 720)
    assert.equal(metadata.height, 1280)
    assert.doesNotMatch(normalized.path, /localized-replacement/)
    assert.ok(
      join(
        'C:\\Users\\JakonPC\\AppData\\Roaming\\VideoGenerate\\.videogenerate\\tiktok-creative-studio',
        'c37d12ff-4a24-4e44-8dea-3eb9b881a777',
        'ff43abba-542d-4b43-ba92-55731b786d56',
        'generated-still',
        normalized.path.split(/[\\/]/).pop() || '',
      ).length < 260,
    )
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

  assert.match(view, /tr\("autoUi\.k_3a73e3f67a57"\)/)
  assert.match(view, /tr\("autoUi\.k_21eb39d9da89"\)/)
  assert.doesNotMatch(view, /\u4ece\u590d\u523b\u955c\u5934\u521b\u5efa/)
  assert.match(view, /confirmRemoveShot/)
  assert.match(view, /deleteTarget/)
  assert.match(view, /confirmBatchDelete/)
  assert.match(view, /BatchDeleteDialog/)
  assert.match(view, /const imagePaths = \[\.\.\.referenceImagePaths\.value\]/)
  assert.match(view, /referenceImagePaths: imagePaths/)
  assert.match(view, /const allShots = computed\(\(\) =>/)
  assert.match(view, /libraryPage\.value = 1;/)
  assert.match(view, /setActiveTab\("library"\)/)
  assert.match(view, /shot\.exportedAt/)
  assert.match(view, /exported-badge/)
  assert.match(view, /openLogs\(task, shot\)/)
  assert.match(view, /openRegionEditor\(task, shot\)/)
  assert.match(view, /saveRegionAndRetry/)
  assert.match(view, /openRegionEditor/)
  assert.match(view, /saveRegionAndRetry/)
  assert.match(view, /imageRetryCount/)
  assert.match(view, /qualityReport/)
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
  assert.match(service, /getTiktokImageRetryLimit/)
  assert.match(service, /imageRetryLimit/)
  assert.match(service, /exportedByShotId/)
  assert.match(service, /exportedVideoPath/)
  assert.match(service, /automatic retry \$\{nextRetryCount\}\/\$\{imageRetryLimit\}/)
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
  assert.match(officialClient, /PLAYWRIGHT_EXECUTABLE_PATH/)
  assert.match(officialClient, /Microsoft.*Edge.*Application.*msedge\.exe/s)
  assert.match(officialClient, /Google.*Chrome.*Application.*chrome\.exe/s)
  assert.match(officialClient, /chromium\.launch\(\{ executablePath/)
  assert.match(officialClient, /save_to_my_library/)
  assert.match(officialClient, /i2v\/create_generate_task/)
  assert.match(officialClient, /generate-task\/check/)
  assert.match(officialClient, /cue\/video_info/)
  assert.match(officialClient, /\[binary omitted\]/)
  assert.doesNotMatch(officialClient, /getByText|getByRole|filechooser|setInputFiles/)
  assert.match(view, /requires_manual/)
  assert.match(view, /image_retry_exhausted/)
  assert.match(view, /video-dialog__player/)
  assert.match(view, /openSingleSubtitleDialog/)
  assert.match(view, /revertSubtitles/)
  assert.match(view, /subtitleTitleStrategy/)
  assert.match(view, /subtitlePresets/)
  assert.match(view, /subtitleCaptionStyle/)
  assert.match(view, /tiktokCreative\.retry\.guard/)
  assert.match(view, /creativeSettings\.imageRetryLimit/)
  assert.match(view, /random_pool/)
  assert.match(view, /viral-hook/)
  assert.doesNotMatch(view, /subtitleMode !== 'timed_caption'/)
  assert.match(service, /async revertSubtitles/)
  assert.match(service, /titleRenderMode: 'overlay_image'/)
  assert.match(ipc, /plugin:tiktokCreative:revertSubtitles/)
  assert.match(preload, /tiktokCreative:revertSubtitles/)
  assert.match(view, /durationSec: 10/)
  assert.match(view, /durationSec: 10/)
  assert.match(service, /const DEFAULT_DURATION_SEC = 10/)
  assert.match(service, /result\.source\.mp4/)
  assert.match(service, /'-profile:v',[\s\S]*'baseline'/)
  assert.match(service, /'-movflags',[\s\S]*'\+faststart'/)

  console.log('tiktok creative studio reference workflow smoke test passed')
}

void main()
