import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

async function main() {
  const root = process.cwd()
  const viewPath = path.join(root, 'src/renderer/src/ui/views/LivePhotoGeneratorView.vue')
  const view = await readFile(viewPath, 'utf8')

  assert.match(view, /const videoDialogItemId = ref\(''\)/)
  assert.match(view, /function openVideoDialog\(item: LivePhotoItem\)/)
  assert.match(view, /class="preview-play"/)
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
