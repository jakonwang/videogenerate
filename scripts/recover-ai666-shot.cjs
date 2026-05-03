const { app, safeStorage } = require('electron')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

function pickOutputUrl(json) {
  return String(json?.video_url || json?.detail?.download_url || json?.data?.video_url || json?.data?.detail?.download_url || '').trim()
}

function includesTaskId(value, taskId) {
  return String(value || '').includes(taskId)
}

function recoverShotList(shots, shotId, outPath, result, cfg, taskId) {
  if (!Array.isArray(shots)) return shots
  return shots.map((item) =>
    item.id === shotId
      ? {
          ...item,
          generatedClipPath: outPath,
          generatedProvider: 'ai666',
          generatedModel: result.json.model || cfg.startEndVideoModel || cfg.imageToVideoModel || '',
          generatedTaskId: taskId,
          generatedSource: 'cloud',
          status: 'done',
          error: '',
          qualityStatus: 'warning',
          qualityReasons: ['已从 ai666 历史任务查询恢复视频文件'],
          canEnterRender: true,
        }
      : item,
  )
}

function repoPaths() {
  const candidates = [
    path.join(app.getPath('userData'), 'videogenerate', 'db'),
    path.join(process.env.APPDATA || '', 'videogenerate', 'videogenerate', 'db'),
  ]
  const dbDir = candidates.find((dir) => fsSync.existsSync(path.join(dir, 'clone-projects.json')))
  if (!dbDir) throw new Error(`clone db not found in: ${candidates.join(' | ')}`)
  return {
    dbDir,
    projectsPath: path.join(dbDir, 'clone-projects.json'),
    settingsPath: path.join(dbDir, 'clone-settings.json'),
    dataDir: path.dirname(dbDir),
  }
}

async function credentials(settingsPath) {
  const settings = parseJson(await fs.readFile(settingsPath, 'utf8'))
  const text = safeStorage.decryptString(Buffer.from(settings.encryptedCredentials, 'base64'))
  return parseJson(text)
}

async function queryTask(cfg, taskId) {
  const root = String(cfg.baseUrl || '').replace(/\/+$/, '')
  const url = `${root}/v1/video/query?id=${encodeURIComponent(taskId)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.apiKey}` } })
  const text = await res.text()
  const json = parseJson(text)
  if (!res.ok) throw new Error(`query failed ${res.status}: ${text}`)
  const outputUrl = pickOutputUrl(json)
  if (!outputUrl) throw new Error(`query succeeded but output url missing: ${text.slice(0, 1000)}`)
  return { url, json, outputUrl }
}

async function download(url, outPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed ${res.status}: ${await res.text().catch(() => '')}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, buf)
}

async function main() {
  app.setName('VideoGenerate')
  await app.whenReady()
  const taskId = process.argv[2]
  if (!taskId) throw new Error('Usage: electron scripts/recover-ai666-shot.cjs <taskId>')
  const paths = repoPaths()
  const creds = await credentials(paths.settingsPath)
  const cfg = creds.apifoxHub || {}
  const result = await queryTask(cfg, taskId)
  const db = parseJson(await fs.readFile(paths.projectsPath, 'utf8'))
  const projects = Array.isArray(db.projects) ? db.projects : []
  let recovered = null
  for (const project of projects) {
    const shot = project?.blueprint?.shots?.find((item) => includesTaskId(item?.generatedTaskId, taskId) || includesTaskId(item?.error, taskId) || includesTaskId(item?.lastError, taskId) || includesTaskId(item?.lastErrorContext?.responseSnippet, taskId))
    const output = project?.shotVideoOutputs?.find((item) => includesTaskId(item?.taskId, taskId) || includesTaskId(item?.error, taskId) || includesTaskId(item?.responseSnippet, taskId) || includesTaskId(item?.lastError, taskId))
    if (!shot && !output) continue
    const shotId = shot?.id || output?.shotId || 'shot_1'
    const outPath = path.join(paths.dataDir, 'viral-clone', project.id, 'shots', shotId, `recovered_ai666_${Date.now()}_${randomUUID()}.mp4`)
    await download(result.outputUrl, outPath)
    if (project.blueprint?.shots) {
      project.blueprint.shots = recoverShotList(project.blueprint.shots, shotId, outPath, result, cfg, taskId)
    }
    if (project.baseBlueprint?.shots) {
      project.baseBlueprint.shots = recoverShotList(project.baseBlueprint.shots, shotId, outPath, result, cfg, taskId)
    }
    if (project.executionBlueprint?.shots) {
      project.executionBlueprint.shots = recoverShotList(project.executionBlueprint.shots, shotId, outPath, result, cfg, taskId)
    }
    project.shotVideoOutputs = [
      ...(project.shotVideoOutputs || []).filter((item) => item.shotId !== shotId),
      {
        shotId,
        source: 'generated',
        videoPath: outPath,
        provider: 'ai666',
        model: result.json.model || cfg.startEndVideoModel || cfg.imageToVideoModel || '',
        status: 'done',
        updatedAt: Date.now(),
      },
    ]
    project.lastError = ''
    project.lastErrorContext = undefined
    project.updatedAt = Date.now()
    recovered = { projectId: project.id, shotId, outPath, queryUrl: result.url, outputUrl: result.outputUrl }
    break
  }
  if (!recovered) throw new Error(`No failed project record found for task: ${taskId}`)
  await fs.writeFile(paths.projectsPath, JSON.stringify(db, null, 2), 'utf8')
  console.log(JSON.stringify(recovered, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => app.quit())
