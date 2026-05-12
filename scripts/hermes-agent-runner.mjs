import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

function parseArgs(argv) {
  const [command = 'doctor', ...rest] = argv
  const options = {}
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = rest[i + 1]
    if (!next || next.startsWith('--')) {
      options[key] = true
      continue
    }
    options[key] = next
    i += 1
  }
  return { command, options }
}

function nowStamp() {
  const d = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function resolveWithin(rootPath, targetPath) {
  const resolvedRoot = path.resolve(rootPath)
  const resolvedTarget = path.resolve(targetPath)
  const relative = path.relative(resolvedRoot, resolvedTarget)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function toAbsolute(rootPath, value) {
  if (!value) return rootPath
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(rootPath, value)
}

function validateWorkspace(config, task) {
  const workspaceRoot = path.resolve(config.workspace.rootPath)
  const taskWorkspace = path.resolve(task.workspace || workspaceRoot)
  assert(workspaceRoot === taskWorkspace, `任务 workspace 必须等于配置 rootPath: ${workspaceRoot}`)

  const allowedRoots = (config.workspace.writeWhitelist || []).map((item) => path.resolve(item))
  assert(allowedRoots.some((item) => item === workspaceRoot), 'writeWhitelist 必须包含当前仓库根目录')

  for (const blocked of config.workspace.blockedWritePaths || []) {
    const absoluteBlocked = path.resolve(blocked)
    assert(resolveWithin(workspaceRoot, absoluteBlocked), `blockedWritePaths 必须位于仓库内: ${blocked}`)
  }

  for (const item of task.scope?.allowedPaths || []) {
    const absolute = toAbsolute(workspaceRoot, item)
    assert(resolveWithin(workspaceRoot, absolute), `allowedPaths 不能超出仓库: ${item}`)
  }

  for (const item of task.scope?.forbiddenPaths || []) {
    const absolute = toAbsolute(workspaceRoot, item)
    assert(resolveWithin(workspaceRoot, absolute), `forbiddenPaths 不能超出仓库: ${item}`)
  }

  return workspaceRoot
}

async function ensureRequiredDocs(workspaceRoot, config) {
  const docs = []
  for (const docPath of config.workspace.requiredDocs || []) {
    const absolute = path.resolve(workspaceRoot, docPath)
    await fsp.access(absolute, fs.constants.R_OK)
    const content = await fsp.readFile(absolute, 'utf8')
    docs.push({
      path: absolute,
      bytes: Buffer.byteLength(content, 'utf8'),
      preview: content.slice(0, 220),
    })
  }
  return docs
}

function validateCommands(config, task) {
  const allowed = new Set(config.execution.allowedCommands || [])
  const commands = [...(task.runtime?.startCommands || []), ...(task.acceptance?.checks || [])]
  for (const command of commands) {
    assert(allowed.has(command), `命令未在 allowedCommands 白名单中: ${command}`)
  }
}

function spawnPowerShellCommand(command, workdir, logFile) {
  const escaped = command.replace(/"/g, '`"')
  const psCommand = `Set-Location -LiteralPath "${workdir}"; ${escaped} *> "${logFile}"`
  const child = spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], {
    cwd: workdir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return child.pid
}

async function runPowerShellCommand(command, workdir, timeoutMs) {
  return await new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
      cwd: workdir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdout = []
    const stderr = []
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)

    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        code: timedOut ? -1 : code ?? -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
      })
    })
  })
}

function normalizeWindowsConsoleText(text) {
  if (!text) return ''
  if (!text.includes('\u0000')) return text
  try {
    return Buffer.from(text, 'utf8').toString('utf16le').replace(/\u0000/g, '')
  } catch {
    return text.replace(/\u0000/g, '')
  }
}

async function runCommand(command, workspaceRoot, timeoutMs) {
  return await runPowerShellCommand(`Set-Location -LiteralPath "${workspaceRoot}"; ${command}`, workspaceRoot, timeoutMs)
}

async function checkUrl(healthCheck) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), healthCheck.timeoutMs || 15000)
  try {
    const response = await fetch(healthCheck.url, {
      method: 'GET',
      signal: controller.signal,
    })
    const ok = Number(response.status) === Number(healthCheck.expectStatus)
    return {
      name: healthCheck.name,
      url: healthCheck.url,
      status: response.status,
      ok,
    }
  } catch (error) {
    return {
      name: healthCheck.name,
      url: healthCheck.url,
      status: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function waitForGateway(config) {
  const deadline = Date.now() + Number(config.hermes.startupTimeoutMs || 45000)
  const healthUrl = config.hermes.gatewayHealthUrl
  while (Date.now() < deadline) {
    const result = await checkUrl({
      name: 'hermes-gateway',
      url: healthUrl,
      expectStatus: 200,
      timeoutMs: 5000,
    })
    if (result.ok) return result
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  throw new Error(`Hermes Gateway 未在超时时间内就绪: ${healthUrl}`)
}

async function startHermesGateway(config, reportDir) {
  assert(config.hermes.mode === 'wsl', '当前示例仅支持通过 WSL2 启动 Hermes Gateway')
  const logFile = path.join(reportDir, 'hermes-gateway.log')
  const args = []
  if (config.hermes.distro) {
    args.push('-d', config.hermes.distro)
  }
  args.push('--cd', config.hermes.workspaceLinuxPath, '--', 'bash', '-lc', `${config.hermes.gatewayStartCommand} > "${toLinuxLogPath(logFile)}" 2>&1`)

  const child = spawn('wsl.exe', args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
  return {
    pid: child.pid,
    logFile,
    health: await waitForGateway(config),
  }
}

function toLinuxLogPath(windowsPath) {
  const normalized = windowsPath.replace(/\\/g, '/')
  const driveMatch = /^([A-Za-z]):\/(.*)$/.exec(normalized)
  if (!driveMatch) return normalized
  return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`
}

async function doctor(config, workspaceRoot) {
  const docs = await ensureRequiredDocs(workspaceRoot, config)
  const wslStatus = await runPowerShellCommand('wsl.exe --status', workspaceRoot, 20000)
  const distroList = await runPowerShellCommand('wsl.exe -l -q', workspaceRoot, 20000)
  const normalizedDistroList = normalizeWindowsConsoleText(distroList.stdout || distroList.stderr)
  const normalizedWslStatus = normalizeWindowsConsoleText(wslStatus.stdout || wslStatus.stderr)
  const distroNames = normalizedDistroList
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)

  const gateway = await checkUrl({
    name: 'hermes-gateway',
    url: config.hermes.gatewayHealthUrl,
    expectStatus: 200,
    timeoutMs: 5000,
  })

  return {
    workspaceRoot,
    requiredDocs: docs.map((item) => item.path),
    wsl: {
      statusCommandCode: wslStatus.code,
      statusSummary: normalizedWslStatus,
      installedDistroNames: distroNames,
      targetDistroPresent: distroNames.includes(config.hermes.distro),
    },
    gateway,
  }
}

async function runTask(config, task, options) {
  const workspaceRoot = validateWorkspace(config, task)
  const docs = await ensureRequiredDocs(workspaceRoot, config)
  validateCommands(config, task)

  const outputDir = path.resolve(workspaceRoot, config.reporting.outputDir || 'tmp/hermes-agent-runs')
  await fsp.mkdir(outputDir, { recursive: true })
  const runId = `${task.id || 'task'}-${nowStamp()}`
  const reportDir = path.join(outputDir, runId)
  await fsp.mkdir(reportDir, { recursive: true })

  const report = {
    runId,
    taskId: task.id || 'unknown',
    workspaceRoot,
    requiredDocs: docs.map((item) => ({ path: item.path, bytes: item.bytes })),
    hermes: null,
    startedServices: [],
    healthChecks: [],
    checks: [],
    success: false,
    failureReason: '',
    createdAt: new Date().toISOString(),
  }

  try {
    if (options['start-hermes']) {
      report.hermes = await startHermesGateway(config, reportDir)
    } else {
      report.hermes = await checkUrl({
        name: 'hermes-gateway',
        url: config.hermes.gatewayHealthUrl,
        expectStatus: 200,
        timeoutMs: 5000,
      })
    }

    for (const command of task.runtime?.startCommands || []) {
      const fileName = command.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'service'
      const logFile = path.join(reportDir, `${fileName}.log`)
      const pid = spawnPowerShellCommand(command, workspaceRoot, logFile)
      report.startedServices.push({ command, pid, logFile })
    }

    for (const healthCheck of task.runtime?.healthChecks || []) {
      const result = await checkUrl(healthCheck)
      report.healthChecks.push(result)
      if (!result.ok) {
        throw new Error(`健康检查失败: ${healthCheck.name} -> ${healthCheck.url}`)
      }
    }

    for (const command of task.acceptance?.checks || []) {
      const result = await runCommand(command, workspaceRoot, Number(config.execution.defaultTimeoutMs || 1800000))
      const logFile = path.join(reportDir, `${command.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'check'}.log`)
      await fsp.writeFile(logFile, `${result.stdout}\n${result.stderr}`, 'utf8')
      report.checks.push({
        command,
        code: result.code,
        timedOut: result.timedOut,
        logFile,
      })
      if (result.code !== 0) {
        throw new Error(`验收命令失败: ${command}`)
      }
    }

    report.success = true
  } catch (error) {
    report.success = false
    report.failureReason = error instanceof Error ? error.message : String(error)
  }

  const reportFile = path.join(reportDir, 'report.json')
  await fsp.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8')
  return { report, reportFile }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2))
  const configPath = path.resolve(process.cwd(), String(options.config || 'automation/hermes-agent/config.example.json'))
  const config = await readJson(configPath)
  const workspaceRoot = path.resolve(config.workspace.rootPath)

  if (command === 'doctor') {
    const result = await doctor(config, workspaceRoot)
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.gateway.ok ? 0 : 1
    return
  }

  if (command === 'run') {
    const taskPath = path.resolve(process.cwd(), String(options.task || 'automation/hermes-agent/task.example.json'))
    const task = await readJson(taskPath)
    const { report, reportFile } = await runTask(config, task, options)
    console.log(JSON.stringify({ reportFile, success: report.success, failureReason: report.failureReason }, null, 2))
    process.exitCode = report.success ? 0 : 1
    return
  }

  throw new Error(`不支持的命令: ${command}`)
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
