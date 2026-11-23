import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

async function main() {
  const root = process.cwd()
  const viewPath = path.join(root, 'src/renderer/src/ui/views/LivePhotoGeneratorView.vue')
  const view = await readFile(viewPath, 'utf8')
  const card = await readFile(path.join(root, 'src/renderer/src/ui/views/live-photo/LivePhotoTaskCard.vue'), 'utf8')

  assert.match(view, /const videoDialogItemId = ref\(''\)/)
  assert.match(view, /function openVideoDialog\(item: LivePhotoItem\)/)
  // 卡片缩略图上的播放按钮：有视频时点缩略图打开播放弹窗
  assert.match(card, /class="lpc__play"/)
  assert.match(card, /run\(caps\.hasVideo \? 'play' : 'details'\)/)
  assert.match(view, /case 'play': return openVideoDialog\(item\)/)
  assert.match(view, /class="live-photo-video-dialog__player"/)
  assert.match(view, /@click="openSingleSubtitleDialog\(videoDialogItem\)"/)
  assert.match(view, /@click="revertSubtitleFromItem\(videoDialogItem\)"/)
  assert.doesNotMatch(
    view,
    /data-testid="`live-photo-preview-\$\{item\.id\}`"[\s\S]{0,300}@click\.stop="openPath\(livePhotoDisplayVideoPath\(item\)\)"/,
  )

  console.log('live photo video dialog smoke test passed')
}

void main()
