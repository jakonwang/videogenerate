import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const utf8Bom = '\uFEFF'

const root = process.cwd()
const includeExt = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.css',
  '.scss',
  '.html',
  '.txt',
])
const ignoreDirs = new Set([
  '.git',
  'node_modules',
  'dist',
  'release',
  'out',
  '.next',
  '.turbo',
  '.videogenerate',
  '.videogenerate-smoke',
  '.videogenerate-web-stack-smoke',
])
const scanRoots = ['src', 'services', 'apps', 'scripts', 'docs', '.']
const rootLevelAllowlist = new Set([
  'README.md',
  'DESIGN.md',
  'AGENTS.md',
  'package.json',
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  'tsconfig.json',
  'electron.vite.config.ts',
  'eslint.config.js',
  'postcss.config.cjs',
])
const ignoredFiles = new Set([
  'scripts/encoding-guard.mjs',
  'docs/requirements.md',
  'docs/user-manual-zh-CN.md',
  'docs/requirements-2026-05-01-clone-upgrade.md',
  'docs/requirements-2026-05-02-clone-4step-fixes.md',
  'docs/requirements-2026-05-03-ai666-official-rest-fix.md',
  'docs/requirements-2026-05-03-settings-ai666-simplify.md',
  'docs/requirements-2026-05-09-web-next-desktop-workspace-migration.md',
  'docs/requirements-2026-05-09-web-next-ui-refresh.md',
  'docs/requirements-2026-05-16-manual-pending-shot-query.md',
  'docs/requirements-2026-05-16-silent-commercial-prompt-trim.md',
  'docs/requirements-2026-05-15-encoding-guard-round9.md',
  'docs/requirements-2026-05-19-encoding-governance-round10.md',
])
const suspiciousPatterns = [
  /妤犲矁/,
  /閹靛/,
  /閻ц/,
  /鐠囬攱/,
  /閺冪姵娼?/,
  /娑撳秴鐡?/,
  /閸欐垿鈧?/,
  /鏉╁洦婀?/,
  /婵帊缍?/,
  /閽冩繂娴?/,
]
const suspiciousSubstrings = ['锛', '銆', '鈥', '鈩', '锟', '�']
const trackedBuildArtifactPrefixes = ['apps/web-next/.next/', 'apps/web-next/tsconfig.tsbuildinfo']

function shouldScan(filePath) {
  return includeExt.has(path.extname(filePath).toLowerCase())
}

function shouldVisitRootEntry(entryName) {
  return rootLevelAllowlist.has(entryName)
}

function walk(dir, files = [], isRoot = false) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (isRoot && entry.isFile() && !shouldVisitRootEntry(entry.name)) continue
    if (entry.isDirectory()) {
      walk(fullPath, files, false)
      continue
    }
    if (shouldScan(fullPath)) {
      files.push(fullPath)
    }
  }
  return files
}

function scanFile(filePath) {
  const relativePath = path.relative(root, filePath).replace(/\\/g, '/')
  if (ignoredFiles.has(relativePath)) return []
  const raw = fs.readFileSync(filePath, 'utf8')
  const findings = []
  if (raw.includes(utf8Bom)) {
    findings.push('utf8-bom')
  }
  for (const pattern of suspiciousPatterns) {
    const match = raw.match(pattern)
    if (match) {
      findings.push(match[0])
    }
  }
  for (const token of suspiciousSubstrings) {
    if (raw.includes(token)) {
      findings.push(token)
    }
  }
  return findings
}

function listTrackedBuildArtifacts() {
  const gitDir = path.join(root, '.git')
  if (!fs.existsSync(gitDir)) {
    return []
  }
  const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
  return files.filter((file) =>
    trackedBuildArtifactPrefixes.some((prefix) => file === prefix || file.startsWith(prefix)),
  )
}

const files = Array.from(
  new Set(
    scanRoots.flatMap((relativeDir) => {
      const dir = path.join(root, relativeDir)
      return fs.existsSync(dir) ? walk(dir, [], relativeDir === '.') : []
    }),
  ),
)
const issues = []

for (const filePath of files) {
  const findings = scanFile(filePath)
  if (findings.length) {
    issues.push({
      file: path.relative(root, filePath),
      findings: [...new Set(findings)],
    })
  }
}

const trackedBuildArtifacts = listTrackedBuildArtifacts()

if (issues.length || trackedBuildArtifacts.length) {
  console.error('[encoding-guard] FAIL')
  for (const issue of issues) {
    console.error(`- ${issue.file}: ${issue.findings.join(', ')}`)
  }
  if (trackedBuildArtifacts.length) {
    console.error('- tracked build artifacts:')
    for (const file of trackedBuildArtifacts.slice(0, 50)) {
      console.error(`  - ${file}`)
    }
    if (trackedBuildArtifacts.length > 50) {
      console.error(`  - ... and ${trackedBuildArtifacts.length - 50} more`)
    }
  }
  process.exitCode = 1
} else {
  console.log('[encoding-guard] OK')
}
