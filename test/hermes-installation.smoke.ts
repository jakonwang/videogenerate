import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function main() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'videogenerate-hermes-installation-'))
  const localAppData = path.join(root, 'local-app-data')
  const runtimeRoot = path.join(localAppData, 'hermes', 'hermes-agent')
  const executable = path.join(runtimeRoot, 'venv', 'Scripts', 'hermes.exe')
  const marker = path.join(runtimeRoot, '.videogenerate-runtime.json')
  const lock = path.join(localAppData, 'VideoGenerate', 'hermes-install.lock')
  process.env.LOCALAPPDATA = localAppData
  process.env.VIDEOGENERATE_HERMES_ROOT = runtimeRoot

  const { hermesInstallation } = await import('../src/main/modules/hermes/installation')
  const { hermesRuntime } = await import('../src/main/modules/hermes/runtime')

  try {
    const bootstrapSource = await readFile(path.join(process.cwd(), 'resources', 'hermes', 'bootstrap.ps1'), 'utf8')
    assert.match(bootstrapSource, /-File \$installerPath[\s\S]+-ProtocolVersion/)
    assert.match(bootstrapSource, /-File \$installerPath[\s\S]+-Manifest/)
    assert.match(bootstrapSource, /-Stage \$stageName/)
    assert.match(bootstrapSource, /\$stageName -eq "path"/)
    assert.match(bootstrapSource, /Write-Output \(\[string\]\$_\)/)
    assert.doesNotMatch(bootstrapSource, /& \$installerPath\s+`/)

    const missing = await hermesInstallation.inspect()
    assert.equal(missing.state, 'missing')
    assert.equal(missing.targetVersion, '0.17.0')

    const fakeInstaller = `# -*- coding: utf-8 -*-
param(
    [switch]$ProtocolVersion,
    [switch]$Manifest,
    [string]$Stage = "",
    [string]$Branch = "main",
    [string]$Commit = "",
    [string]$HermesHome = "",
    [string]$InstallDir = "",
    [switch]$SkipSetup,
    [switch]$NonInteractive,
    [switch]$Json
)
$stages = @(
    @{ name = "uv"; needs_user_input = $false },
    @{ name = "python"; needs_user_input = $false },
    @{ name = "git"; needs_user_input = $false },
    @{ name = "repository"; needs_user_input = $false },
    @{ name = "venv"; needs_user_input = $false },
    @{ name = "dependencies"; needs_user_input = $false },
    @{ name = "path"; needs_user_input = $false },
    @{ name = "configure"; needs_user_input = $true }
)
if ($ProtocolVersion) { Write-Output "1"; exit 0 }
if ($Manifest) { @{ protocol_version = 1; stages = $stages } | ConvertTo-Json -Depth 4 -Compress; exit 0 }
if (-not $Stage) { throw "Full installation must not be used by the bootstrap test." }
if ($Stage -eq "path" -or $Stage -eq "configure") { throw "Skipped stage was invoked: $Stage" }
if ($Stage -eq "repository") { New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null }
if ($Stage -eq "venv") {
    $scripts = Join-Path $InstallDir "venv\\Scripts"
    New-Item -ItemType Directory -Force -Path $scripts | Out-Null
    Copy-Item -LiteralPath $env:VIDEOGENERATE_TEST_NODE_EXE -Destination (Join-Path $scripts "hermes.exe")
    Copy-Item -LiteralPath $env:VIDEOGENERATE_TEST_NODE_EXE -Destination (Join-Path $scripts "python.exe")
}
@{ stage = $Stage; ok = $true } | ConvertTo-Json -Compress
exit 0
`
    const fakeInstallerHash = createHash('sha256').update(fakeInstaller).digest('hex').toUpperCase()
    const server = createServer((request, response) => {
      if (request.url !== '/install.ps1') {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end(fakeInstaller)
    })
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen)
      server.listen(0, '127.0.0.1', resolveListen)
    })
    try {
      const address = server.address()
      assert.ok(address && typeof address === 'object')
      const fakeManifestPath = path.join(root, 'runtime-manifest.json')
      await writeFile(fakeManifestPath, JSON.stringify({
        schemaVersion: 1,
        version: process.version.slice(1),
        commit: '15852722d47b2b50d6815b3831891663076b5865',
        branch: 'main',
        installScriptUrl: `http://127.0.0.1:${address.port}/install.ps1`,
        installScriptSha256: fakeInstallerHash,
        minimumInstallerProtocol: 1,
        requiredFiles: ['venv/Scripts/hermes.exe', 'venv/Scripts/python.exe'],
      }), 'utf8')
      const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const stagedInstall = await execFileAsync(powershell, [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', path.join(process.cwd(), 'resources', 'hermes', 'bootstrap.ps1'),
        '-ManifestPath', fakeManifestPath,
      ], {
        env: {
          ...process.env,
          LOCALAPPDATA: localAppData,
          USERPROFILE: path.join(root, 'user'),
          VIDEOGENERATE_TEST_NODE_EXE: process.execPath,
        },
        windowsHide: true,
        timeout: 30_000,
      })
      assert.match(stagedInstall.stdout, /"stage":"venv"/)
      assert.equal(existsSync(executable), true)
      assert.equal(existsSync(path.join(localAppData, 'hermes', 'hermes-agent.videogenerate-staging')), false)
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    }

    await rm(runtimeRoot, { recursive: true, force: true })

    await mkdir(path.dirname(executable), { recursive: true })
    await writeFile(executable, '', 'utf8')
    await writeFile(path.join(runtimeRoot, 'venv', 'Scripts', 'python.exe'), '', 'utf8')
    await mkdir(path.join(runtimeRoot, '.git'), { recursive: true })
    await writeFile(path.join(runtimeRoot, '.git', 'HEAD'), '15852722d47b2b50d6815b3831891663076b5865\n', 'utf8')
    const adopted = await hermesInstallation.inspect()
    assert.equal(adopted.state, 'ready')
    assert.equal(adopted.installedVersion, '0.17.0')
    assert.equal(JSON.parse(await readFile(marker, 'utf8')).commit, '15852722d47b2b50d6815b3831891663076b5865')

    await writeFile(marker, JSON.stringify({
      schemaVersion: 1,
      version: '0.17.0',
      commit: '15852722d47b2b50d6815b3831891663076b5865',
    }), 'utf8')
    const ready = await hermesInstallation.inspect()
    assert.equal(ready.state, 'ready')
    assert.equal(ready.installedVersion, '0.17.0')

    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    await execFileAsync(powershell, [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', path.join(process.cwd(), 'resources', 'hermes', 'bootstrap.ps1'),
      '-ManifestPath', path.join(process.cwd(), 'resources', 'hermes', 'runtime-manifest.json'),
    ], {
      env: { ...process.env, LOCALAPPDATA: localAppData, USERPROFILE: path.join(root, 'user') },
      windowsHide: true,
      timeout: 30_000,
    })
    const handoff = JSON.parse(await readFile(path.join(localAppData, 'VideoGenerate', 'hermes-install-status.json'), 'utf8'))
    assert.equal(handoff.state, 'ready')
    assert.equal(existsSync(path.join(localAppData, 'VideoGenerate', 'hermes-install.lock')), false)

    await writeFile(marker, JSON.stringify({
      schemaVersion: 1,
      version: '0.16.0',
      commit: '0000000000000000000000000000000000000000',
    }), 'utf8')
    const update = await hermesInstallation.inspect()
    assert.equal(update.state, 'update_available')

    await mkdir(path.dirname(lock), { recursive: true })
    await writeFile(lock, 'locked', 'utf8')
    await assert.rejects(() => hermesRuntime.start(), /installation operation is running/i)
    await unlink(lock)

    console.log('hermes-installation.smoke: ok')
  } finally {
    await hermesRuntime.stop().catch(() => undefined)
    await rm(root, { recursive: true, force: true })
  }
}

void main()
