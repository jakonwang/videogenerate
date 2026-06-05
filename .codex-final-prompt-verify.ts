import { buildCloneShotPrompt, buildReferenceLockText, buildShotScriptConstraintText } from './src/main/modules/clone/prompt'

const shot: any = {
  scriptRole: 'unknown',
  scriptText: 'Model usage demonstration shot. Preserve body and hand action rhythm and replace product and model identity.',
  visualDescription: '真实生活场景中的人物带货镜头，Model usage demonstration shot. Preserve body/hand action rhythm and replace product/model identity.',
  actionDescription: '人物自然演示产品并快速给出结果反馈，tight detail reveal with subtle hand interaction.',
  cameraDescription: '手机手持近景快速切入，extreme_closeup framing, zoom_in.',
  productFocus: 'keep the product visible and consistent with the reference selling logic.',
  generationPrompt: '真实生活场景中的人物带货镜头，Model usage demonstration shot. Preserve body/hand action rhythm and replace product/model identity. 人物自然演示产品并快速给出结果反馈，tight detail reveal with subtle hand interaction 手机手持近景快速切入，extreme_closeup framing, zoom_in Product focus: keep the product visible and consistent with the reference selling logic. Commercial short-video realism, no watermark, no subtitles, no UI, no logo, 9:16 vertical frame.',
  framing: 'extreme_closeup',
  cameraMovement: 'zoom_in',
  motion: 'zoom_in',
  shotType: 'real_product',
  qualityMode: 'high',
  durationSec: 3,
  materialNeed: 'premium wearable product demo',
  productReferenceImagePaths: ['demo.jpg'],
  referenceLock: {
    sceneEnvironment: 'same close product-demo background category as the reference shot',
    subjectPose: 'keep the same hand and product position and product-to-camera distance as the reference shot',
    productAction: 'tight detail reveal with subtle hand interaction',
    cameraComposition: 'extreme close-up framing; preserve product screen position, subject crop, camera distance and product size ratio from the reference shot',
    motionPath: 'slow push-in following the same reference movement path',
  },
}

const scriptLock = buildShotScriptConstraintText(shot)
const refLock = buildReferenceLockText(shot)
const finalPrompt = buildCloneShotPrompt({
  blueprint: {
    totalDurationSec: 3,
    referenceAspectRatio: '9:16',
    scriptFrame: { hook: '', problem: '', solution: '', proof: '', cta: '' },
    scriptFramework: { hook: '', painPoint: '', solution: '', proof: '', offer: '', cta: '' },
    rhythm: { avgShotDurationSec: 3, cutDensity: 'medium', first3SecShotCount: 1, hasFastCut: false },
    visualStyle: { scene: 'social commerce product demo scene', lighting: 'soft natural daylight', cameraStyle: 'smartphone framing', movementStyle: 'slow push-in', realismStyle: 'ugc' },
    shots: [shot],
    analysisNotes: [],
    transcript: '',
  },
  shot,
  productRefs: ['demo.jpg'],
  options: {
    productType: 'general',
    productDescription: 'same uploaded product only',
    qualityMode: 'high',
    productPoints: 'premium realistic social commerce product demo',
  },
})

console.log('---SCRIPT LOCK---')
console.log(scriptLock)
console.log('\n---REFERENCE LOCK---')
console.log(refLock)
console.log('\n---FINAL POSITIVE---')
console.log(finalPrompt.positive)
console.log('\n---FINAL NEGATIVE---')
console.log(finalPrompt.negative)
console.log('\n---CHECK---')
console.log(JSON.stringify({
  finalHasCjk: /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(finalPrompt.positive),
  finalHasScriptRoleLabel: /script role:/i.test(finalPrompt.positive),
  finalHasGenerationPromptLabel: /generation prompt:/i.test(finalPrompt.positive),
  finalHasShotScriptLockLabel: /shot script lock:/i.test(finalPrompt.positive),
  finalLength: finalPrompt.positive.length,
}, null, 2))
