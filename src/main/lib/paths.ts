import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

type AppPathRuntimeOptions = {
  userDataDir?: string
  dataDir?: string
}

let runtimeOverrides: AppPathRuntimeOptions = {}

export function configureAppPathRuntime(options: AppPathRuntimeOptions) {
  runtimeOverrides = {
    ...runtimeOverrides,
    ...options,
  }
}

function resolveElectronUserData() {
  if (runtimeOverrides.userDataDir) return runtimeOverrides.userDataDir
  if (typeof require !== 'function') return ''
  try {
    const electron = require('electron') as typeof import('electron')
    if (electron?.app?.isReady?.()) {
      return electron.app.getPath('userData')
    }
  } catch {
    // Ignore and fall back to process-level storage.
  }
  return ''
}

export function getAppPaths() {
  const userData =
    resolveElectronUserData() ||
    process.env.VIDEOGENERATE_USER_DATA_DIR ||
    process.cwd()
  const dataDir =
    runtimeOverrides.dataDir ||
    process.env.VIDEOGENERATE_DATA_DIR ||
    join(userData, '.videogenerate')
  const dbDir = join(dataDir, 'db')
  const tmpDir = join(dataDir, 'tmp')
  const cacheDir = join(dataDir, 'cache')

  // electron-vite dev/build 默认输出为 .js（CommonJS 环境下可用 __dirname）
  const preload = join(__dirname, '../preload/index.js')
  const rendererDist = join(__dirname, '../renderer')

  return { userData, dataDir, dbDir, tmpDir, cacheDir, preload, rendererDist }
}

export async function ensureAppDirs() {
  const { dataDir, dbDir, tmpDir, cacheDir } = getAppPaths()
  await mkdir(dataDir, { recursive: true })
  await mkdir(dbDir, { recursive: true })
  await mkdir(tmpDir, { recursive: true })
  await mkdir(cacheDir, { recursive: true })
}

