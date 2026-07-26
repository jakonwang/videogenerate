import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(process.argv[2] || join(process.cwd(), 'resources', 'live-photo-quality'))
const manifestPath = join(root, 'model-manifest.json')
const licensesPath = join(root, 'licenses.json')

function fail(message) {
  console.error(`[live-photo-quality] ${message}`)
  process.exit(1)
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

if (!existsSync(manifestPath) || !existsSync(licensesPath)) {
  fail('Model manifest or license manifest is missing.')
}

const manifest = readJson(manifestPath)
const licenses = readJson(licensesPath)
if (licenses.status !== 'approved') {
  fail('Runtime and model redistribution approval is incomplete.')
}

const python = join(root, 'python', 'python.exe')
if (!existsSync(python)) fail('Bundled Python runtime is missing.')
const runtimeApproval = licenses.runtime
if (
  !runtimeApproval?.commercialRedistributionApproved ||
  !runtimeApproval.source ||
  !runtimeApproval.license ||
  !runtimeApproval.version ||
  !runtimeApproval.sha256
) {
  fail('Bundled Python runtime approval, source, license, version, or checksum is missing.')
}
if (sha256(python).toLowerCase() !== String(runtimeApproval.sha256).toLowerCase()) {
  fail('Bundled Python runtime checksum does not match the approved manifest.')
}
const dependencyCheck = spawnSync(
  python,
  ['-I', '-c', 'import cv2,numpy,onnxruntime; print("ok")'],
  { cwd: root, encoding: 'utf8', windowsHide: true },
)
if (dependencyCheck.status !== 0 || !String(dependencyCheck.stdout || '').includes('ok')) {
  fail(`Bundled Python dependencies are unavailable: ${String(dependencyCheck.stderr || '').trim()}`)
}

const approvedModels = new Map(
  (Array.isArray(licenses.models) ? licenses.models : []).map((entry) => [String(entry.id || ''), entry]),
)
for (const id of ['clip', 'dinov2']) {
  const model = manifest.models?.[id]
  const approval = approvedModels.get(id)
  if (!model?.file) fail(`Model configuration is missing for ${id}.`)
  if (!approval?.commercialRedistributionApproved) fail(`Commercial redistribution approval is missing for ${id}.`)
  if (!approval.source || !approval.license || !approval.sha256) fail(`Source, license, or checksum is missing for ${id}.`)
  const modelPath = join(root, 'models', model.file)
  if (!existsSync(modelPath)) fail(`Model file is missing: ${model.file}`)
  if (sha256(modelPath).toLowerCase() !== String(approval.sha256).toLowerCase()) {
    fail(`Checksum mismatch for ${model.file}.`)
  }
}

const smokeRoot = mkdtempSync(join(tmpdir(), 'videogenerate-quality-assets-'))
try {
  const fixtureResult = spawnSync(
    python,
    [
      '-I',
      '-c',
      [
        'import cv2,numpy as np,os,sys',
        'root=sys.argv[1]',
        'scene=np.full((256,256,3),220,dtype=np.uint8)',
        'product=np.full((256,256,3),255,dtype=np.uint8)',
        'generated=scene.copy()',
        'cv2.rectangle(product,(76,76),(180,180),(20,80,180),-1)',
        'cv2.rectangle(generated,(76,76),(180,180),(20,80,180),-1)',
        'cv2.imwrite(os.path.join(root,"scene.png"),scene)',
        'cv2.imwrite(os.path.join(root,"product.png"),product)',
        'cv2.imwrite(os.path.join(root,"generated.png"),generated)',
      ].join(';'),
      smokeRoot,
    ],
    { cwd: root, encoding: 'utf8', windowsHide: true },
  )
  if (fixtureResult.status !== 0) fail(`Cannot create quality-check fixtures: ${String(fixtureResult.stderr || '').trim()}`)
  const serviceResult = spawnSync(python, ['-I', join(root, 'quality_service.py')], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
    input: `${JSON.stringify({
      scenePath: join(smokeRoot, 'scene.png'),
      productPath: join(smokeRoot, 'product.png'),
      generatedPath: join(smokeRoot, 'generated.png'),
      modelRoot: join(root, 'models'),
    })}\n`,
  })
  const responseLine = String(serviceResult.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop() || '{}'
  const response = JSON.parse(responseLine)
  if (serviceResult.status !== 0 || !response.ok || !Number.isFinite(Number(response.score))) {
    fail(`Bundled quality service smoke test failed: ${response.reason || serviceResult.stderr || 'invalid response'}`)
  }
} finally {
  rmSync(smokeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

console.log('[live-photo-quality] Bundled runtime and model assets are approved and valid.')
