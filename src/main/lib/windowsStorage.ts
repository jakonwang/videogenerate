import { app } from 'electron'
import { join } from 'node:path'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { configureAppPathRuntime, getAppPaths } from './paths'

function resolveWindowsUserDataRoot() {
  const explicitUserData = String(process.env.VIDEOGENERATE_USER_DATA_DIR || '').trim()
  if (explicitUserData) return explicitUserData

  const explicitRoot = String(process.env.VIDEOGENERATE_WINDOWS_STORAGE_ROOT || '').trim()
  if (explicitRoot) return join(explicitRoot, 'userData')

  return 'E:\\VideoGenerate\\userData'
}

export function configureWindowsStorageRoot() {
  if (process.platform !== 'win32') return
  const userDataDir = resolveWindowsUserDataRoot()
  const dataDir = String(process.env.VIDEOGENERATE_DATA_DIR || '').trim() || join(userDataDir, '.videogenerate')
  app.setPath('userData', userDataDir)
  app.setPath('sessionData', join(userDataDir, 'session'))
  app.setPath('logs', join(userDataDir, 'logs'))
  configureAppPathRuntime({
    userDataDir,
    dataDir,
  })
}

export async function cleanupLegacyWindowsStorage() {
  if (process.platform !== 'win32') return
  const legacyRoot = join(app.getPath('appData'), 'VideoGenerate')
  const currentUserData = getAppPaths().userData
  if (legacyRoot === currentUserData) return

  const removableDirs = [
    'Cache',
    'Code Cache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'GPUCache',
    'blob_storage',
    'shared_proto_db',
    'VideoDecodeStats',
  ]

  await Promise.all(
    removableDirs.map((name) =>
      rm(join(legacyRoot, name), {
        recursive: true,
        force: true,
      }).catch(() => undefined),
    ),
  )

  const legacyPreviewDir = join(legacyRoot, '.videogenerate', 'batch-subtitle-preview')
  await rm(legacyPreviewDir, { recursive: true, force: true }).catch(() => undefined)

  const logEntries = await readdir(legacyRoot, { withFileTypes: true }).catch(() => [])
  await Promise.all(
    logEntries
      .filter((entry) => entry.isFile() && /\.log(\.\d+)?$/i.test(entry.name))
      .map((entry) =>
        rm(join(legacyRoot, entry.name), {
          force: true,
        }).catch(() => undefined),
      ),
  )
}

export async function migrateLegacyWindowsUserData() {
  if (process.platform !== 'win32') return
  const legacyRoot = join(app.getPath('appData'), 'VideoGenerate')
  const currentUserData = getAppPaths().userData
  if (legacyRoot === currentUserData) return

  const entries = await readdir(legacyRoot, { withFileTypes: true }).catch(() => [])
  if (!entries.length) return

  await mkdir(currentUserData, { recursive: true })
  for (const entry of entries) {
    const source = join(legacyRoot, entry.name)
    const target = join(currentUserData, entry.name)
    const exists = await stat(target).then(() => true).catch(() => false)
    if (exists) continue
    try {
      await mkdir(join(target, '..'), { recursive: true })
      await import('node:fs/promises').then(({ cp }) =>
        cp(source, target, {
          recursive: true,
          force: false,
          errorOnExist: false,
        }),
      )
    } catch {
      // ignore migrate failures for non-critical legacy files
    }
  }

  const legacyNestedDataDir = join(currentUserData, 'videogenerate')
  const currentDataDir = getAppPaths().dataDir
  if (legacyNestedDataDir === currentDataDir) return

  const nestedEntries = await readdir(legacyNestedDataDir, { withFileTypes: true }).catch(() => [])
  if (!nestedEntries.length) return

  await mkdir(currentDataDir, { recursive: true })
  for (const entry of nestedEntries) {
    const source = join(legacyNestedDataDir, entry.name)
    const target = join(currentDataDir, entry.name)
    const exists = await stat(target).then(() => true).catch(() => false)
    if (exists) continue
    try {
      await mkdir(join(target, '..'), { recursive: true })
      await import('node:fs/promises').then(({ cp }) =>
        cp(source, target, {
          recursive: true,
          force: false,
          errorOnExist: false,
        }),
      )
    } catch {
      // ignore migrate failures for nested legacy data
    }
  }
}
