const { existsSync, readdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

function removePath(target) {
  if (!existsSync(target)) return
  rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

function removeNamedDirectories(root, names) {
  if (!existsSync(root)) return
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const target = join(root, entry.name)
    if (names.has(entry.name)) removePath(target)
    else removeNamedDirectories(target, names)
  }
}

function run(command, args, cwd, label) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180000,
  })
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${String(result.stderr || result.stdout || '').trim()}`)
  }
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const resources = join(context.appOutDir, 'resources')
  const unpackedModules = join(resources, 'app.asar.unpacked', 'node_modules')

  removePath(join(unpackedModules, 'ffprobe-static', 'bin', 'darwin'))
  removePath(join(unpackedModules, 'ffprobe-static', 'bin', 'linux'))
  removePath(join(unpackedModules, 'ffprobe-static', 'bin', 'win32', 'ia32'))
  removePath(join(unpackedModules, 'next'))
  removePath(join(unpackedModules, '@next'))
  removePath(join(unpackedModules, '@rspack'))
  removePath(join(unpackedModules, 'better-sqlite3', 'deps'))
  removePath(join(unpackedModules, 'better-sqlite3', 'src'))
  removePath(join(unpackedModules, 'better-sqlite3', 'test'))

  const ffprobe = join(unpackedModules, 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe')
  if (!existsSync(ffprobe)) throw new Error('Packaged Windows x64 ffprobe is missing.')
  run(ffprobe, ['-version'], context.appOutDir, 'Packaged ffprobe verification')

}
