import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { _electron as electron } from 'playwright'
import ffmpegPath from 'ffmpeg-static'

async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs: number, intervalMs = 250) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await condition()) return true
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

async function main() {
  const root = path.resolve(__dirname, '..')
  const artifactDir = path.join(root, 'test', 'artifacts', 'live-photo-clone-desktop')
  fs.mkdirSync(artifactDir, { recursive: true })

  const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'videogen-live-photo-clone-userdata-'))
  const tempDataDir = path.join(tempUserDataDir, '.videogenerate')
  process.env.VIDEOGENERATE_USER_DATA_DIR = tempUserDataDir
  process.env.VIDEOGENERATE_DATA_DIR = tempDataDir

  const cloneRepoModule = await import('../src/main/modules/clone/repo')
  const cloneSqliteModule = await import('../src/main/modules/clone/sqlite')
  const cloneRepo = (cloneRepoModule as any).cloneRepo || (cloneRepoModule as any).default

  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-photo-clone-fixture-'))
  const shotImage = path.join(fixtureDir, 'clone-shot.jpg')
  const shotVideo = path.join(fixtureDir, 'clone-shot.mp4')
  fs.writeFileSync(shotImage, 'clone-shot-image', 'utf-8')
  execFileSync(
    String(ffmpegPath),
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=720x1280:d=1.2',
      '-vf',
      'format=yuv420p',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      shotVideo,
    ],
    { stdio: 'ignore' },
  )

  const draft = await cloneRepo.createProject({
    title: `Live Photo Clone Smoke ${Date.now()}`,
    description: 'desktop clone smoke',
    locale: 'zh-CN',
    strength: 'structure',
    runMode: 'manual',
  })

  const project = await cloneRepo.upsertProject({
    ...draft,
    blueprint: {
      ...(draft.blueprint || {}),
      shots: [
        {
          id: 'shot-clone-1',
          scriptText: 'Clone desktop live photo shot',
          scriptRole: 'hook',
        },
      ],
    },
    storyboardFrames: [
      {
        id: 'frame-clone-1',
        shotId: 'shot-clone-1',
        imagePath: shotImage,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
    shotVideoOutputs: [
      {
        shotId: 'shot-clone-1',
        videoPath: shotVideo,
        localPath: shotVideo,
        status: 'done',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  } as any)

  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-photo-clone-export-'))
  const report = {
    startedAt: new Date().toISOString(),
    cloneProjectId: project.id,
    exportDir,
    steps: [] as Array<{ step: string; screenshot: string }>,
  }

  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      VIDEOGENERATE_USER_DATA_DIR: tempUserDataDir,
      VIDEOGENERATE_DATA_DIR: tempDataDir,
    },
  })
  const page = await app.firstWindow()

  try {
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => {
      location.hash = '#/plugins/live-photo-generator'
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="live-photo-page"]', { timeout: 30000 })

    await page.evaluate(async () => {
      const items = await window.api.livePhoto.list()
      for (const item of items) {
        await window.api.livePhoto.remove(item.id)
      }
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="live-photo-page"]', { timeout: 30000 })

    await page.evaluate((dir) => {
      ;(window as any).__VG_TEST_pickDirCalled = 0
      ;(window as any).__VG_TEST_exportItemsCalled = 0
      ;(window as any).__VG_TEST_lastExportPayload = null
      ;(window as any).__VG_TEST_pickDir = async () => {
        ;(window as any).__VG_TEST_pickDirCalled += 1
        return dir
      }
      const originalExportItems = window.api.livePhoto.exportItems
      window.api.livePhoto.exportItems = async (payload: any) => {
        ;(window as any).__VG_TEST_exportItemsCalled += 1
        ;(window as any).__VG_TEST_lastExportPayload = payload
        return await originalExportItems(payload)
      }
    }, exportDir)

    const openShotCount = async () =>
      await page.evaluate(() => document.querySelectorAll('[data-testid^="live-photo-shot-"]').length)

    await page.click('[data-testid="live-photo-tab-clone"]')
    await waitFor(
      async () =>
        await page.evaluate((projectId) => {
          const select = document.querySelector('[data-testid="live-photo-clone-project-select"]') as HTMLSelectElement | null
          if (!select) return false
          return Array.from(select.options).some((option) => option.value === projectId)
        }, project.id),
      30000,
    )
    await page.selectOption('[data-testid="live-photo-clone-project-select"]', project.id)
    await waitFor(async () => (await openShotCount()) >= 1, 30000)
    await page.screenshot({ path: path.join(artifactDir, '01-clone-tab.png'), fullPage: true })
    report.steps.push({ step: 'clone-tab-ready', screenshot: path.join(artifactDir, '01-clone-tab.png') })

    await page.click('[data-testid="live-photo-create-clone"]')
    await page.click('[data-testid="live-photo-tab-library"]')
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="live-photo-item-"]').length >= 1, { timeout: 30000 })
    await page.screenshot({ path: path.join(artifactDir, '02-clone-item-created.png'), fullPage: true })
    report.steps.push({ step: 'clone-item-created', screenshot: path.join(artifactDir, '02-clone-item-created.png') })

    const createdItems = await page.evaluate(async () => await window.api.livePhoto.list())
    const itemId = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid^="live-photo-item-"]'))
      const firstCard = cards[0]
      if (!firstCard) return ''
      return String(firstCard.getAttribute('data-testid') || '').replace('live-photo-item-', '')
    })
    if (!itemId) {
      console.error('[live-photo-clone-desktop] created items snapshot:', JSON.stringify(createdItems, null, 2))
    }
    assert.ok(itemId, 'Expected created clone-shot Live Photo item')
    await waitFor(
      async () =>
        await page.evaluate(async (targetId) => {
          const items = await window.api.livePhoto.list()
          return items.some((item) => item.id === targetId && item.packagingStatus === 'completed')
        }, itemId),
      90000,
    )

    await page.locator(`[data-testid="live-photo-item-${itemId}"] .live-console-row__check span`).click()
    await page.waitForFunction((targetId) => {
      const input = document.querySelector(`[data-testid="live-photo-select-${targetId}"]`) as HTMLInputElement | null
      return Boolean(input?.checked)
    }, itemId, { timeout: 30000 })
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="live-photo-export-selected"]') as HTMLButtonElement | null
      return Boolean(button && !button.disabled)
    }, { timeout: 30000 })
    await page.evaluate(() => {
      const button = document.querySelector('[data-testid="live-photo-export-selected"]') as HTMLButtonElement | null
      if (!button) throw new Error('Missing export selected button')
      button.click()
    })
    let exportedItem = null as any
    try {
      exportedItem = await waitFor(
        async () =>
          await page.evaluate(async (targetId) => {
            const items = await window.api.livePhoto.list()
            return items.find((item) => item.id === targetId && item.exportBundlePath && item.packagingMetadataBridgePath) || null
          }, itemId),
        90000,
      )
    } catch (error) {
      const exportDebug = await page.evaluate(async (targetId) => {
        const items = await window.api.livePhoto.list()
        const target = items.find((item) => item.id === targetId) || null
        const notice = document.querySelector('[data-testid="live-photo-notice"]')?.textContent || ''
        const errorText = document.querySelector('[data-testid="live-photo-error"]')?.textContent || ''
        const selected = document.querySelector(`[data-testid="live-photo-select-${targetId}"]`) as HTMLInputElement | null
        const button = document.querySelector('[data-testid="live-photo-export-selected"]') as HTMLButtonElement | null
        let manualInvokeResult: any = null
        let manualInvokeError = ''
        try {
        } catch (error: any) {
          manualInvokeError = error?.message || String(error || '')
        }
        return {
          notice,
          errorText,
          pickDirCalled: Number((window as any).__VG_TEST_pickDirCalled || 0),
          exportItemsCalled: Number((window as any).__VG_TEST_exportItemsCalled || 0),
          lastExportPayload: (window as any).__VG_TEST_lastExportPayload || null,
          manualInvokeError,
          selectedChecked: Boolean(selected?.checked),
          exportButtonDisabled: Boolean(button?.disabled),
          target,
        }
      }, itemId)
      console.error('[live-photo-clone-desktop] export debug:', JSON.stringify(exportDebug, null, 2))
      throw error
    }
    await page.waitForFunction((targetId) => {
      const button = document.querySelector(`[data-testid="live-photo-metadata-${targetId}"]`) as HTMLButtonElement | null
      return Boolean(button && !button.disabled)
    }, itemId, { timeout: 30000 })
    await page.screenshot({ path: path.join(artifactDir, '03-clone-item-exported.png'), fullPage: true })
    report.steps.push({ step: 'clone-item-exported', screenshot: path.join(artifactDir, '03-clone-item-exported.png') })

    const bundleDir = path.dirname(String(exportedItem.exportBundlePath || ''))
    assert.ok(fs.existsSync(bundleDir), 'Expected exported clone-shot Live Photo bundle directory')
    const bundleFiles = fs.readdirSync(bundleDir)
    if (!bundleFiles.some((item) => item.endsWith('.livephoto.json'))) {
      console.error('[live-photo-clone-desktop] bundle files snapshot:', JSON.stringify(bundleFiles, null, 2))
    }
    assert.ok(bundleFiles.some((item) => item.endsWith('.livephoto.json')), 'Expected .livephoto.json bundle file')
    assert.ok(bundleFiles.some((item) => item.endsWith('.asset-metadata.json')), 'Expected .asset-metadata.json bundle file')

    const metadataButton = page.locator(`[data-testid="live-photo-metadata-${itemId}"]`)
    assert.equal(await metadataButton.isVisible(), true)
    assert.equal(await metadataButton.isDisabled(), false)

    const output = {
      ...report,
      bundleDir,
      bundleFiles,
      status: 'passed',
      finishedAt: new Date().toISOString(),
    }
    console.log(JSON.stringify(output, null, 2))
  } finally {
    try {
      await page.evaluate(() => {
        delete (window as any).__VG_TEST_pickDir
        delete (window as any).__VG_TEST_pickDirCalled
        delete (window as any).__VG_TEST_exportItemsCalled
        delete (window as any).__VG_TEST_lastExportPayload
      })
    } catch {}
    await app.close().catch(() => {})
    cloneSqliteModule.closeCloneSqlite()
    delete process.env.VIDEOGENERATE_USER_DATA_DIR
    delete process.env.VIDEOGENERATE_DATA_DIR
  }
}

main().catch((error) => {
  console.error('[live-photo-clone-desktop] failed:', error)
  process.exitCode = 1
})
