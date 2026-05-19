import fs from 'node:fs'
import path from 'node:path'

const mode = String(process.argv[2] || process.env.VG_APP_ENV || 'staging').trim().toLowerCase()
const cwd = process.cwd()

function fail(message) {
  console.error(`[deploy-preflight] FAIL: ${message}`)
  process.exitCode = 1
}

function pass(message) {
  console.log(`[deploy-preflight] OK: ${message}`)
}

function readEnv(name) {
  return String(process.env[name] || '').trim()
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
}

function isRealUpdateUrl(value) {
  return isHttpUrl(value) && !String(value).includes('YOUR_UPDATE_URL')
}

function ensureRequiredEnv(name) {
  const value = readEnv(name)
  if (!value) {
    fail(`missing env ${name}`)
    return ''
  }
  pass(`${name} is set`)
  return value
}

function ensureDirExistsOrCreatable(targetPath) {
  try {
    fs.mkdirSync(targetPath, { recursive: true })
    pass(`directory ready: ${targetPath}`)
  } catch (error) {
    fail(`directory not writable: ${targetPath} (${error instanceof Error ? error.message : String(error)})`)
  }
}

function ensureFileExists(targetPath, label) {
  if (fs.existsSync(targetPath)) {
    pass(`${label} exists: ${targetPath}`)
    return
  }
  fail(`${label} missing: ${targetPath}`)
}

function run() {
  if (!['development', 'staging', 'production'].includes(mode)) {
    fail(`invalid app env: ${mode}`)
    return
  }

  pass(`app env: ${mode}`)

  const dataDir = ensureRequiredEnv('VIDEOGENERATE_DATA_DIR')
  const webApiBase = ensureRequiredEnv('WEB_API_BASE_URL')
  const publicWebApiBase = ensureRequiredEnv('NEXT_PUBLIC_WEB_API_BASE_URL')

  if (webApiBase && !isHttpUrl(webApiBase)) {
    fail(`WEB_API_BASE_URL must be http/https: ${webApiBase}`)
  } else if (webApiBase) {
    pass(`WEB_API_BASE_URL format valid`)
  }

  if (publicWebApiBase && !isHttpUrl(publicWebApiBase)) {
    fail(`NEXT_PUBLIC_WEB_API_BASE_URL must be http/https: ${publicWebApiBase}`)
  } else if (publicWebApiBase) {
    pass(`NEXT_PUBLIC_WEB_API_BASE_URL format valid`)
  }

  if (mode !== 'development') {
    const allowMock = readEnv('VG_ALLOW_MOCK_GENERATION')
    if (allowMock !== 'false') {
      fail(`VG_ALLOW_MOCK_GENERATION must be false in ${mode}`)
    } else {
      pass(`VG_ALLOW_MOCK_GENERATION locked to false`)
    }
  }

  if (mode === 'development') {
    pass(`update URL not required in development`)
  } else {
    const updateUrl = ensureRequiredEnv('VG_UPDATE_BASE_URL')
    if (updateUrl && !isRealUpdateUrl(updateUrl)) {
      fail(`VG_UPDATE_BASE_URL must be a real http/https URL, not placeholder`)
    } else if (updateUrl) {
      pass(`VG_UPDATE_BASE_URL format valid`)
    }
  }

  if (dataDir) {
    ensureDirExistsOrCreatable(dataDir)
    ensureDirExistsOrCreatable(path.join(dataDir, 'db'))
    ensureDirExistsOrCreatable(path.join(dataDir, 'viral-clone'))
    ensureDirExistsOrCreatable(path.join(dataDir, 'web-uploads'))
  }

  ensureFileExists(path.join(cwd, 'services', 'api', 'server.ts'), 'API entry')
  ensureFileExists(path.join(cwd, 'apps', 'web-next', 'app'), 'Web-Next app dir')
  ensureFileExists(path.join(cwd, 'package.json'), 'package.json')

  if (process.exitCode && process.exitCode !== 0) return
  console.log('[deploy-preflight] SUCCESS: deployment preflight passed')
}

run()
