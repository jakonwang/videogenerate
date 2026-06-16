import assert from 'node:assert/strict'
import { applyScriptAnalysisToShots } from '../src/main/modules/clone/aiScriptAnalyzer'
import type { ScriptAnalysisResult } from '../src/main/modules/clone/aiScriptAnalyzer'
import type { ShotSpec } from '../src/main/modules/clone/types'

const baseShot = {
  id: 'shot_1',
  index: 0,
  purpose: 'problem',
  startSec: 0,
  endSec: 3.6,
  durationSec: 3.6,
  role: 'model_scene',
  shotType: 'model_demo',
  scriptText: '0.0s-3.6s Extreme close-up shot. Camera slowly pans right across the earlobe. No zoom.',
  scriptRole: 'solution',
  visualDescription: 'Reference shot visual',
  actionDescription: 'Reference shot action',
  cameraDescription: 'extreme_closeup framing, slow pan right movement',
  productFocus: 'earlobe area and earring structure',
  generationPrompt: 'reference prompt',
  scriptConfidence: 0.7,
  visual: 'reference shot visual',
  subtitleSuggestion: '',
  materialNeed: 'exact product structure',
  sourceMode: 'reference',
  uploadedAssetIds: [],
  aiEnabled: true,
  prompt: {
    positive: '',
    negative: '',
    cameraMotion: '',
    aspectRatio: '9:16',
  },
} as ShotSpec

const result: ScriptAnalysisResult = {
  globalScript: {
    language: 'zh-CN',
    summary: 'test',
    hook: '',
    problem: '',
    solution: '',
    proof: '',
    offer: '',
    cta: '',
    content: '',
  },
  shots: [
    {
      shotId: 'shot_1',
      startTime: 0,
      endTime: 3.6,
      storyboardReferenceMode: 'product_closeup',
      scriptText: 'Extreme close-up shot. Camera slowly pans right across the earlobe. No zoom.',
      scriptRole: 'solution',
      visualDescription: 'Extreme close-up of the earlobe and earring area only.',
      actionDescription: 'Camera slowly pans right across the earlobe.',
      cameraDescription: 'Extreme close-up, slow pan right, no zoom.',
      productFocus: 'earlobe area and exact earring structure',
      generationPrompt: 'extreme close-up of earlobe and earring area',
      scriptConfidence: 0.95,
      analysisNotes: ['product dominates, model identity is not the subject'],
    },
  ],
}

const [nextShot] = applyScriptAnalysisToShots([baseShot], result)

assert.equal(nextShot.storyboardReferenceMode, 'model_presentation')
assert.match(nextShot.visualDescription, /earlobe and earring area/i)

const modelPresentationShot = {
  ...baseShot,
  id: 'shot_2',
  role: 'model_scene',
  shotType: 'model_demo',
  framing: 'medium',
  visualDescription: 'Reference model presentation shot',
  actionDescription: 'Reference model presentation action',
  cameraDescription: 'medium framing, slight handheld movement',
  productFocus: 'model wearing view and product visibility',
  scriptText: 'Model presents the earrings to camera in a half-body showcase.',
} as ShotSpec

const modelPresentationResult: ScriptAnalysisResult = {
  globalScript: result.globalScript,
  shots: [
    {
      shotId: 'shot_2',
      startTime: 0,
      endTime: 3.2,
      storyboardReferenceMode: 'product_closeup',
      scriptText: 'Half-body model presentation shot facing camera.',
      scriptRole: 'hook',
      visualDescription: 'Half-body model presentation with face-centered showcase.',
      actionDescription: 'Model presents the product to camera naturally.',
      cameraDescription: 'Medium shot, presenter-like handheld framing.',
      productFocus: 'wearing scene and presenter showcase',
      generationPrompt: 'half-body model presentation facing camera',
      scriptConfidence: 0.91,
      analysisNotes: ['model identity is the main subject'],
    },
  ],
}

const [correctedModelPresentationShot] = applyScriptAnalysisToShots([modelPresentationShot], modelPresentationResult)

assert.equal(correctedModelPresentationShot.storyboardReferenceMode, 'model_presentation')
assert.match(correctedModelPresentationShot.visualDescription, /face-centered showcase/i)

const wristCloseupShot = {
  ...baseShot,
  id: 'shot_3',
  productType: 'bracelet',
  role: 'model_scene',
  shotType: 'model_demo',
  framing: 'closeup',
  visualDescription: 'Close-up of the wrist and bracelet only with no face visible.',
  actionDescription: 'Natural wrist turn showing bracelet structure.',
  cameraDescription: 'Close-up wrist framing with gentle motion.',
  productFocus: 'bracelet structure, clasp, and wrist fit detail',
  scriptText: 'Extreme close-up of the wrist and bracelet with the product as the only subject.',
} as ShotSpec

const wristCloseupResult: ScriptAnalysisResult = {
  globalScript: result.globalScript,
  shots: [
    {
      shotId: 'shot_3',
      startTime: 0,
      endTime: 2.8,
      storyboardReferenceMode: 'product_closeup',
      scriptText: 'Extreme close-up of the wrist and bracelet with no face visible.',
      scriptRole: 'detail',
      visualDescription: 'Extreme close-up of wrist and bracelet only.',
      actionDescription: 'Tiny wrist movement keeps bracelet readable.',
      cameraDescription: 'Extreme close-up wrist framing.',
      productFocus: 'bracelet clasp and fit on wrist',
      generationPrompt: 'extreme close-up bracelet on wrist only',
      scriptConfidence: 0.93,
      analysisNotes: ['product dominates and identity is not visible'],
    },
  ],
}

const [correctedWristCloseupShot] = applyScriptAnalysisToShots([wristCloseupShot], wristCloseupResult)

assert.equal(correctedWristCloseupShot.storyboardReferenceMode, 'product_closeup')
assert.match(correctedWristCloseupShot.productFocus, /bracelet clasp/i)

const productCardShot = {
  ...baseShot,
  id: 'shot_4',
  role: 'product_closeup',
  shotType: 'closeup',
  framing: 'closeup',
  visualDescription: 'Clean close-up of the earring card only.',
  actionDescription: 'Static product card display only.',
  cameraDescription: 'Close-up static product card framing.',
  productFocus: 'earring card and product structure only',
  scriptText: 'Static close-up of the display card with the product only.',
} as ShotSpec

const productCardResult: ScriptAnalysisResult = {
  globalScript: result.globalScript,
  shots: [
    {
      shotId: 'shot_4',
      startTime: 0,
      endTime: 2.0,
      storyboardReferenceMode: 'model_presentation',
      scriptText: 'Static close-up of the earring card only.',
      scriptRole: 'detail',
      visualDescription: 'Product card close-up with no wearing scene.',
      actionDescription: 'No subject motion.',
      cameraDescription: 'Static close-up product card framing.',
      productFocus: 'display card and product structure only',
      generationPrompt: 'static display card close-up',
      scriptConfidence: 0.9,
      analysisNotes: ['pure product object display'],
    },
  ],
}

const [correctedProductCardShot] = applyScriptAnalysisToShots([productCardShot], productCardResult)

assert.equal(correctedProductCardShot.storyboardReferenceMode, 'product_closeup')

const modelSceneImageShot = {
  ...baseShot,
  id: 'shot_5',
  productType: 'general',
  role: 'hook',
  shotType: 'model_demo',
  framing: 'closeup',
  visualDescription: 'Lifestyle scene image of a female model presenting the product near the face.',
  actionDescription: 'Model presents the product naturally inside a real room.',
  cameraDescription: 'Close-up lifestyle framing with a real person in scene.',
  productFocus: 'product visibility with model-scene relation',
  scriptText: 'Use the model scene image as the storyboard reference for the opening shot.',
} as ShotSpec

const modelSceneImageResult: ScriptAnalysisResult = {
  globalScript: result.globalScript,
  shots: [
    {
      shotId: 'shot_5',
      startTime: 0,
      endTime: 3.0,
      storyboardReferenceMode: 'product_closeup',
      scriptText: 'Close-up lifestyle shot of a woman presenting the product in a real room.',
      scriptRole: 'hook',
      visualDescription: 'Close-up scene image of a female model presenting the product near the face.',
      actionDescription: 'Model presents the product naturally inside a real room.',
      cameraDescription: 'Close-up lifestyle framing with a real person in scene.',
      productFocus: 'product visibility with model-scene relation',
      generationPrompt: 'lifestyle model scene image with presenter-like framing',
      scriptConfidence: 0.94,
      analysisNotes: ['real person scene image should remain a model presentation shot'],
    },
  ],
}

const [correctedModelSceneImageShot] = applyScriptAnalysisToShots([modelSceneImageShot], modelSceneImageResult)

assert.equal(correctedModelSceneImageShot.storyboardReferenceMode, 'model_presentation')
assert.match(correctedModelSceneImageShot.visualDescription, /female model presenting the product/i)

console.log('ai script storyboard reference mode smoke test passed')
