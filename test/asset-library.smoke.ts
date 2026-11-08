import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'videogenerate-asset-library-'))
  const dataDir = join(root, 'data')
  const sourceDir = join(root, 'source')
  process.env.VIDEOGENERATE_USER_DATA_DIR = root
  process.env.VIDEOGENERATE_DATA_DIR = dataDir

  try {
    await mkdir(sourceDir, { recursive: true })
    const imagePath = join(sourceDir, 'desktop-image.png')
    await writeFile(imagePath, await sharp({ create: { width: 2, height: 2, channels: 3, background: '#23aa91' } }).png().toBuffer())
    const { configureAppPathRuntime } = await import('../src/main/lib/paths')
    configureAppPathRuntime({ userDataDir: root, dataDir })
    const { assetLibraryService } = await import('../src/main/modules/asset-library/service')
    const { runFfmpeg } = await import('../src/main/modules/ffmpeg/runner')

    const desktop = await assetLibraryService.importFile(imagePath)
    assert.equal(desktop.type, 'image')
    assert.equal(desktop.source, 'desktop')
    assert.equal(desktop.qiniuUrl, undefined)
    assert.match(await assetLibraryService.thumbnail(desktop.id), /^data:image\/webp;base64,/)
    const usedDesktop = await assetLibraryService.updateUsageStatus(desktop.id, 'product-image-materials', 'used')
    assert.equal(usedDesktop.pluginUsage?.['product-image-materials'], 'used')
    assert.equal((await assetLibraryService.list('', 'image'))[0].pluginUsage?.['product-image-materials'], 'used')
    const unusedDesktop = await assetLibraryService.updateUsageStatus(desktop.id, 'product-image-materials', 'unused')
    assert.equal(unusedDesktop.pluginUsage?.['product-image-materials'], 'unused')
    const edited = await assetLibraryService.editImage(desktop.id, { resize: { width: 4, height: 5 } })
    assert.equal(edited.id, desktop.id)
    assert.equal(edited.createdAt, desktop.createdAt)
    assert.ok(edited.size > 0)

    const folder = await assetLibraryService.createFolder('Campaign assets')
    const nestedFolder = await assetLibraryService.createFolder('Approved', folder.id)
    assert.equal((await assetLibraryService.listFolders(null))[0].id, folder.id)
    assert.deepEqual((await assetLibraryService.getFolderPath(nestedFolder.id)).map((item) => item.id), [folder.id, nestedFolder.id])
    await assetLibraryService.moveAssets([desktop.id], nestedFolder.id)
    assert.equal((await assetLibraryService.list('', 'all', nestedFolder.id))[0].id, desktop.id)
    assert.equal((await assetLibraryService.list('', 'all', null)).length, 0)
    const renamedFolder = await assetLibraryService.renameFolder(nestedFolder.id, 'Published')
    assert.equal(renamedFolder.name, 'Published')
    assert.equal((await assetLibraryService.moveFolder(nestedFolder.id, null)).parentId, null)
    assert.equal((await assetLibraryService.moveFolder(nestedFolder.id, folder.id)).parentId, folder.id)
    await assert.rejects(() => assetLibraryService.moveFolder(folder.id, nestedFolder.id), /descendant/)
    const renamedAsset = await assetLibraryService.renameAsset(desktop.id, 'campaign-cover.png')
    assert.equal(renamedAsset.name, 'campaign-cover.png')
    const copiedAssets = await assetLibraryService.copyAssets([desktop.id], null)
    assert.equal(copiedAssets.length, 1)
    assert.match(copiedAssets[0].name, /Copy/)
    assert.equal(await assetLibraryService.removeMany([copiedAssets[0].id]), 1)

    const videoPath = join(sourceDir, 'desktop-video.mp4')
    await runFfmpeg({
      args: ['-y', '-f', 'lavfi', '-i', 'color=c=#224466:s=160x120:d=1', '-c:v', 'mpeg4', videoPath],
    })
    const video = await assetLibraryService.importFile(videoPath)
    assert.equal(video.type, 'video')
    assert.match(await assetLibraryService.thumbnail(video.id), /^data:image\/jpeg;base64,/)

    const session = await assetLibraryService.createSession()
    const page = await fetch(session.url.replace(/http:\/\/[^/:]+/, 'http://127.0.0.1'))
    assert.equal(page.status, 200)
    const mobilePage = await page.text()
    assert.match(mobilePage, /VideoGenerate.*素材库/)
    assert.match(mobilePage, /accept="image\/\*"/)
    assert.match(mobilePage, /accept="video\/\*,\.mp4,\.mov,\.webm,\.mkv"/)

    const png = await sharp({ create: { width: 3, height: 3, channels: 3, background: '#224466' } }).png().toBuffer()
    const uploadUrl = session.url.replace(/http:\/\/[^/:]+/, 'http://127.0.0.1')
    const uploaded = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent('phone-image.png') },
      body: png,
    })
    assert.equal(uploaded.status, 201)
    const list = await assetLibraryService.list('phone-image', 'image')
    assert.equal(list.length, 1)
    assert.equal(list[0].source, 'mobile')
    assert.equal(await assetLibraryService.remove(list[0].id), true)
    assert.equal(await assetLibraryService.list('phone-image', 'all').then((items) => items.length), 0)

    assert.equal(await assetLibraryService.removeFolder(folder.id), true)
    assert.equal((await assetLibraryService.list('', 'all')).some((item) => item.id === desktop.id), false)

    const invalid = await fetch(`${uploadUrl.slice(0, uploadUrl.lastIndexOf('/') + 1)}${'0'.repeat(48)}`)
    assert.equal(invalid.status, 410)
    console.log('asset-library smoke passed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1 })
