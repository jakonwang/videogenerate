const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

function pickOutputUrl(json) {
  const values = [
    json?.data?.output,
    json?.data?.outputs,
    json?.data?.output_urls,
    json?.data?.outputUrls,
    json?.data?.video?.url,
    json?.data?.video?.download_url,
    json?.data?.videos,
    json?.data?.prediction?.output,
    json?.data?.prediction?.outputs,
    json?.data?.prediction?.video_url,
    json?.data?.prediction?.url,
    json?.data?.result?.output,
    json?.data?.result?.outputs,
    json?.data?.result?.video_url,
    json?.data?.result?.url,
    json?.data?.metadata?.url,
    json?.metadata?.url,
    json?.output,
    json?.outputs,
    json?.output_urls,
    json?.outputUrls,
    json?.video_url,
    json?.video?.url,
    json?.videos,
    json?.url,
  ]
  for (const value of values) {
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = typeof item === 'string' ? item : pickOutputUrl(item)
        if (typeof nested === 'string' && /^https?:\/\//i.test(nested)) return nested
      }
    }
    if (value && typeof value === 'object') {
      const nested = pickOutputUrl(value)
      if (nested) return nested
    }
  }
  return ''
}

function normalizeTaskId(model, taskId) {
  const rawTaskId = String(taskId || '').trim()
  const rawModel = String(model || '').trim()
  if (!rawTaskId) return ''
  if (!rawModel || rawTaskId.includes(':')) return rawTaskId
  return `${rawModel}:${rawTaskId}`
}

async function queryOnce(root, apiKey, provider, taskId, label) {
  const url = `${root}/v1/video/query?id=${encodeURIComponent(taskId)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const text = await res.text()
  const json = parseJson(text)
  return {
    label,
    ok: res.ok,
    status: res.status,
    url,
    taskId,
    provider,
    outputUrl: pickOutputUrl(json),
    response: json,
  }
}

async function main() {
  app.setName('VideoGenerate')
  await app.whenReady()
  const taskId = process.argv[2]
  if (!taskId) throw new Error('Usage: electron scripts/query-ai666-task.cjs <taskId>')
  const candidates = [
    path.join(app.getPath('userData'), 'videogenerate', 'db', 'clone-settings.json'),
    path.join(app.getPath('userData'), '..', 'videogenerate', 'videogenerate', 'db', 'clone-settings.json'),
    path.join(process.env.APPDATA || '', 'videogenerate', 'videogenerate', 'db', 'clone-settings.json'),
  ]
  const settingsPath = candidates.find((file) => file && fs.existsSync(file))
  if (!settingsPath) throw new Error(`clone-settings.json not found in: ${candidates.join(' | ')}`)
  const settings = parseJson(fs.readFileSync(settingsPath, 'utf8'))
  const decrypted = safeStorage.decryptString(Buffer.from(settings.encryptedCredentials, 'base64'))
  const credentials = parseJson(decrypted)
  const cfg = credentials.apifoxHub || {}
  const model = cfg.startEndVideoModel || cfg.imageToVideoModel || cfg.referenceVideoModel || cfg.textToVideoModel || ''
  const root = String(cfg.baseUrl || '').replace(/\/+$/, '')
  const attempts = []
  attempts.push(await queryOnce(root, cfg.apiKey, cfg.videoProvider, taskId, 'raw_task_id'))
  const normalizedTaskId = normalizeTaskId(model, taskId)
  if (normalizedTaskId !== taskId) {
    attempts.push(await queryOnce(root, cfg.apiKey, cfg.videoProvider, normalizedTaskId, 'normalized_task_id'))
  }
  console.log(JSON.stringify({
    taskId,
    normalizedTaskId,
    provider: cfg.videoProvider,
    endpointStyle: cfg.videoEndpointStyle,
    model,
    attempts,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => app.quit())
