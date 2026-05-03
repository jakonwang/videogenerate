import { app } from 'electron'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

export function getAppPaths() {
  const userData = app.getPath('userData')
  const dataDir = join(userData, 'videogenerate')
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

