// Shared helper for the GMV Max Electron e2e tests that need real, connected GMV data.
//
// By default the tests run against a throw-away COPY of the local GMV database and auth
// file, so analysis recomputes and seeded rows never touch the real profile. Set
// GMV_E2E_USE_REAL_PROFILE=1 to run against the real profile instead (old behaviour).
// GMV_E2E_SOURCE_DB_DIR overrides where the source `db` directory is read from.
const { copyFile, mkdir, mkdtemp, rm } = require('node:fs/promises')
const { existsSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const GMV_FILES = [
  'tiktok-gmv-max.sqlite',
  'tiktok-gmv-max.sqlite-wal',
  'tiktok-gmv-max.sqlite-shm',
  'tiktok-gmv-max-auth.json',
]

function resolveSourceDbDir() {
  const explicit = String(process.env.GMV_E2E_SOURCE_DB_DIR || '').trim()
  if (explicit) return explicit
  const candidates = [
    'E:\\VideoGenerate\\userData\\.videogenerate\\db',
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'VideoGenerate', '.videogenerate', 'db'),
  ]
  return candidates.find((dir) => existsSync(path.join(dir, 'tiktok-gmv-max.sqlite'))) || ''
}

/**
 * Prepares the launch environment for a GMV e2e test.
 * Returns { env, cleanup, describe } — pass `env` to electron.launch and await cleanup() at the end.
 */
async function prepareGmvProfile(label) {
  if (process.env.GMV_E2E_USE_REAL_PROFILE === '1') {
    return { env: { ...process.env }, cleanup: async () => undefined, describe: 'real profile' }
  }
  const root = await mkdtemp(path.join(os.tmpdir(), `videogenerate-${label}-`))
  const userData = path.join(root, 'userData')
  const dataDir = path.join(userData, '.videogenerate')
  const dbDir = path.join(dataDir, 'db')
  await mkdir(dbDir, { recursive: true })
  const sourceDbDir = resolveSourceDbDir()
  const copied = []
  if (sourceDbDir) {
    for (const name of GMV_FILES) {
      const source = path.join(sourceDbDir, name)
      if (!existsSync(source)) continue
      await copyFile(source, path.join(dbDir, name))
      copied.push(name)
    }
  }
  return {
    env: { ...process.env, VIDEOGENERATE_USER_DATA_DIR: userData, VIDEOGENERATE_DATA_DIR: dataDir },
    cleanup: () => rm(root, { recursive: true, force: true }).catch(() => undefined),
    describe: sourceDbDir ? `copy of ${sourceDbDir} (${copied.join(', ')})` : 'empty temp profile (no source GMV data found)',
  }
}

module.exports = { prepareGmvProfile }
