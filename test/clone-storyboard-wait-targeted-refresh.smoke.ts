import assert from 'node:assert/strict'

type ProjectLike = {
  id: string
  blueprint?: {
    shots?: Array<{
      id: string
      gptFirstFramePath?: string
      generatedFirstFramePath?: string
    }>
  }
}

async function waitForStoryboardFramesLike(input: {
  getProject: () => Promise<ProjectLike | null>
  timeoutMs?: number
  shotIds?: string[]
}) {
  const startedAt = Date.now()
  const timeoutMs = Number(input.timeoutMs ?? 2000)
  const targetShotIds = Array.from(new Set((input.shotIds ?? []).map((item) => String(item || '').trim()).filter(Boolean)))
  let latestProject: ProjectLike | null = null
  while (Date.now() - startedAt < timeoutMs) {
    latestProject = await input.getProject()
    if (latestProject?.id) {
      const shots = latestProject.blueprint?.shots ?? []
      if (targetShotIds.length) {
        const targetReady = targetShotIds.every((shotId) => {
          const shot = shots.find((item) => String(item.id || '').trim() === shotId)
          if (!shot) return false
          return Boolean(String(shot.gptFirstFramePath || '').trim() || String(shot.generatedFirstFramePath || '').trim())
        })
        if (targetReady) return latestProject
      } else {
        const hasAnyFrame = shots.some((shot) =>
          Boolean(String(shot.gptFirstFramePath || '').trim() || String(shot.generatedFirstFramePath || '').trim()),
        )
        if (hasAnyFrame) return latestProject
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return latestProject
}

async function main() {
  let pollCount = 0
  const project = await waitForStoryboardFramesLike({
    timeoutMs: 200,
    shotIds: ['shot_2'],
    getProject: async () => {
      pollCount += 1
      if (pollCount < 3) {
        return {
          id: 'p1',
          blueprint: {
            shots: [
              { id: 'shot_1', gptFirstFramePath: 'C:\\frames\\shot1.png' },
              { id: 'shot_2' },
            ],
          },
        }
      }
      return {
        id: 'p1',
        blueprint: {
          shots: [
            { id: 'shot_1', gptFirstFramePath: 'C:\\frames\\shot1.png' },
            { id: 'shot_2', gptFirstFramePath: 'C:\\frames\\shot2.png' },
          ],
        },
      }
    },
  })

  assert.ok(project)
  const shot2 = project?.blueprint?.shots?.find((item) => item.id === 'shot_2')
  assert.equal(String(shot2?.gptFirstFramePath || ''), 'C:\\frames\\shot2.png')
  assert.ok(pollCount >= 3)
  console.log('clone storyboard wait targeted refresh smoke test passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
