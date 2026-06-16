import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import { cloneService } from '../src/main/modules/clone/service'
import { cloneRepo } from '../src/main/modules/clone/repo'

async function main() {
  const root = await mkdtemp(join(os.tmpdir(), 'clone-final-compose-prefers-latest-shot-output-'))
  const oldVideoPath = join(root, 'old.mp4')
  const newVideoPath = join(root, 'new.mp4')
  const outputPath = join(root, 'composed.mp4')

  await writeFile(oldVideoPath, 'old-video')
  await writeFile(newVideoPath, 'new-video')

  const originalRenderPreview = cloneService.renderPreview
  const originalGetProject = cloneRepo.getProject
  const originalUpsertProject = cloneRepo.upsertProject

  const projectId = 'compose-prefers-latest-output-project'
  const savedProjects = new Map<string, any>()
  const project = {
    id: projectId,
    title: projectId,
    status: 'ready_for_review',
    referenceVideoPath: '',
    outputDir: root,
    updatedAt: Date.now(),
    policy: { retries: 0 },
    workflowV2: { currentStep: 'final_compose' },
    previewPipeline: { status: 'idle', updatedAt: Date.now(), lastError: '' },
    finalCompose: { status: 'idle', updatedAt: Date.now(), outputPath: '', error: '' },
    blueprint: {
      shots: [
        {
          id: 'shot_1',
          index: 0,
          durationSec: 1,
          generatedClipPath: oldVideoPath,
          generatedSource: 'cloud',
          generatedProvider: 'provider-old',
          generatedModel: 'model-old',
          status: 'done',
          qualityStatus: 'passed',
          canEnterRender: true,
        },
      ],
    },
    shotVideoOutputs: [
      {
        shotId: 'shot_1',
        segmentId: 'shot_1',
        index: 0,
        status: 'done',
        videoPath: newVideoPath,
        localPath: newVideoPath,
        provider: 'provider-new',
        model: 'model-new',
        updatedAt: Date.now() + 1000,
      },
    ],
  } as any
  savedProjects.set(projectId, project)

  cloneRepo.getProject = async (id: string) => {
    const current = savedProjects.get(id)
    return current ? JSON.parse(JSON.stringify(current)) : null
  }
  cloneRepo.upsertProject = async (next: any) => {
    savedProjects.set(next.id, JSON.parse(JSON.stringify(next)))
    return JSON.parse(JSON.stringify(next))
  }

  let capturedShotPath = ''
  cloneService.renderPreview = async (input: { cloneProjectId: string }) => {
    const latest = savedProjects.get(input.cloneProjectId)
    capturedShotPath = String(latest?.blueprint?.shots?.[0]?.generatedClipPath || '').trim()
    await writeFile(outputPath, 'composed-video')
    return { output: outputPath, outputs: [outputPath], reportPath: '' }
  }

  try {
    const result = await cloneService.composeCloneFinalVideo({ cloneProjectId: projectId, outputDir: root })
    assert.equal(capturedShotPath, newVideoPath)
    assert.equal(String(result.project?.finalCompose?.outputPath || ''), outputPath)
    assert.equal(result.project?.finalCompose?.composeHealth, undefined)
    const saved = savedProjects.get(projectId)
    assert.equal(String(saved?.blueprint?.shots?.[0]?.generatedClipPath || ''), newVideoPath)
    assert.equal(String(saved?.shotVideoOutputs?.[0]?.videoPath || ''), newVideoPath)
    assert.equal(String(await readFile(outputPath, 'utf8')), 'composed-video')
    console.log('clone final compose prefers latest shot output smoke test passed')
  } finally {
    cloneService.renderPreview = originalRenderPreview
    cloneRepo.getProject = originalGetProject
    cloneRepo.upsertProject = originalUpsertProject
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
