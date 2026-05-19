import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const includeExt = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'])
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

const suspiciousPatterns = [
  /楠岃/,
  /鎵嬫/,
  /鐧诲/,
  /璇锋/,
  /鏃犳潈/,
  /涓嶅瓨/,
  /鍙戦€/,
  /杩囨湡/,
  /濯掍綋/,
  /钃濆浘/,
]

function shouldScan(filePath) {
  return includeExt.has(path.extname(filePath).toLowerCase())
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, files)
      continue
    }
    if (shouldScan(fullPath)) {
      files.push(fullPath)
    }
  }
  return files
}

function scanFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const findings = []
  for (const pattern of suspiciousPatterns) {
    const match = raw.match(pattern)
    if (match) {
      findings.push(match[0])
    }
  }
  return findings
}

const scanRoots = [path.join(root, 'src'), path.join(root, 'services'), path.join(root, 'apps')]
const files = scanRoots.flatMap((dir) => (fs.existsSync(dir) ? walk(dir) : []))
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

if (issues.length) {
  console.error('[encoding-guard] FAIL')
  for (const issue of issues) {
    console.error(`- ${issue.file}: ${issue.findings.join(', ')}`)
  }
  process.exitCode = 1
} else {
  console.log('[encoding-guard] OK')
}
