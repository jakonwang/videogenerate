import assert from 'node:assert/strict'
import { __test_advanceAutoRunWorkflow } from '../src/main/modules/clone/service'

const project = {
  id: 'clone-auto-flow-workflow-progress',
  workflowV2: {
    currentStep: 'identity_grid',
    stepStatus: {
      reference_analysis: { status: 'done', updatedAt: 1, error: '' },
      script_generation: { status: 'done', updatedAt: 1, error: '' },
      identity_grid: { status: 'done', updatedAt: 1, error: '' },
      storyboard_design: { status: 'idle', updatedAt: 1, error: '' },
      storyboard_videos: { status: 'idle', updatedAt: 1, error: '' },
      final_compose: { status: 'idle', updatedAt: 1, error: '' },
    },
    updatedAt: 1,
  },
} as any

__test_advanceAutoRunWorkflow(project, 'script_generation')
assert.equal(project.workflowV2.currentStep, 'script_generation')
assert.equal(project.workflowV2.stepStatus.script_generation.status, 'running')

__test_advanceAutoRunWorkflow(project, 'storyboard_design')
assert.equal(project.workflowV2.currentStep, 'storyboard_design')
assert.equal(project.workflowV2.stepStatus.script_generation.status, 'done')
assert.equal(project.workflowV2.stepStatus.storyboard_design.status, 'running')

console.log('clone auto flow workflow progress smoke test passed')
