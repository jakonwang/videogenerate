import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureAppPathRuntime } from '../src/main/lib/paths'
import { isImageReplacementPrompt, tiktokCreativePromptVersions } from '../src/main/modules/tiktok-creative-studio/promptVersions'

async function main() {
  const root = process.cwd()
  const livePhoto = await readFile(join(root, 'src/renderer/src/ui/views/LivePhotoGeneratorView.vue'), 'utf8')
  const tiktokCreative = await readFile(join(root, 'src/renderer/src/ui/views/TiktokCreativeStudioView.vue'), 'utf8')
  const tiktokPromptVersions = await readFile(join(root, 'src/main/modules/tiktok-creative-studio/promptVersions.ts'), 'utf8')
  const tiktokService = await readFile(join(root, 'src/main/modules/tiktok-creative-studio/service.ts'), 'utf8')

  for (const [name, view, loadFunction, switchFunction] of [
    ['Live Photo', livePhoto, 'loadPromptManagement', 'switchPromptKind'],
    ['TikTok Creative Studio', tiktokCreative, 'loadPromptVersions', 'switchPromptKind'],
  ] as const) {
    assert.match(view, /let promptVersionLoadSequence = 0/, `${name} should sequence prompt loads`)
    assert.match(view, /promptKind\.value !== kind\) return[;\s]+const requestId = \+\+promptVersionLoadSequence/, `${name} should skip stale category loads`)
    assert.match(view, /requestId !== promptVersionLoadSequence \|\| promptKind\.value !== kind/, `${name} should ignore stale prompt results`)
    assert.match(view, /const draft = \{ \.\.\.promptDrafts\[kind\] \}/, `${name} should snapshot drafts before reactive updates`)
    assert.match(view, new RegExp(`async function ${switchFunction}\\(kind: ['"]image['"] \\| ['"]video['"]\\)[\\s\\S]*?const draft = \\{ \\.\\.\\.promptDrafts\\[kind\\] \\}[;\\s]+promptKind\\.value = kind`), `${name} should snapshot the destination draft before switching`)
    assert.match(view, /:disabled="promptVersionBusy"/, `${name} should prevent category changes during version mutations`)
    assert.ok(view.includes(`async function ${loadFunction}(`), `${name} should have a category-scoped prompt loader`)
  }

  assert.match(tiktokPromptVersions, /export function isImageReplacementPrompt/)
  assert.match(tiktokService, /if \(isImageReplacementPrompt\(value\)\)/)
  assert.doesNotMatch(tiktokPromptVersions, /\|image\\s\*\[12\]/)
  const chineseVideoPrompt = '以参考图为首帧，保持人物、场景和饰品造型一致，镜头缓慢靠近并展示商品细节。'
  assert.equal(isImageReplacementPrompt(chineseVideoPrompt), false)
  assert.equal(isImageReplacementPrompt('将图片1中的商品替换为图片2中的实物，同时保持图片1的场景和构图。'), true)
  assert.equal(isImageReplacementPrompt('Replace the product in Image 1 with the exact product from Image 2.'), true)

  const dataDir = await mkdtemp(join(tmpdir(), 'tiktok-prompt-persistence-'))
  try {
    configureAppPathRuntime({ dataDir, userDataDir: dataDir })
    const [activeVideoPrompt] = await tiktokCreativePromptVersions.list('video')
    assert.ok(activeVideoPrompt)
    const saved = await tiktokCreativePromptVersions.save({
      id: activeVideoPrompt.id,
      name: '中文视频模板',
      prompt: chineseVideoPrompt,
      kind: 'video',
    })
    assert.equal(saved.prompt, chineseVideoPrompt)
    const reloaded = await tiktokCreativePromptVersions.getActive('video')
    assert.equal(reloaded.id, saved.id)
    assert.equal(reloaded.prompt, chineseVideoPrompt)
    assert.equal(reloaded.name, '中文视频模板')
  } finally {
    await rm(dataDir, { recursive: true, force: true })
  }

  console.log('prompt kind switch smoke test passed')
}

void main()
