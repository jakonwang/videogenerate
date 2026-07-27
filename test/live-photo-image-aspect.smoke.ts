import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { normalizeLivePhotoGeneratedImageAspect } from '../src/main/modules/live-photo/imageAspect'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'live-photo-image-aspect-'))
  try {
    const sourcePath = join(root, 'source.png')
    await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#405060' } }).png().toFile(sourcePath)

    const normalized = await normalizeLivePhotoGeneratedImageAspect(sourcePath, join(root, 'output'))
    assert.equal(normalized.normalized, true)
    assert.equal(normalized.width, 720)
    assert.equal(normalized.height, 1280)
    assert.notEqual(normalized.path, sourcePath)

    const metadata = await sharp(normalized.path).metadata()
    assert.equal(metadata.width, 720)
    assert.equal(metadata.height, 1280)
    console.log('live photo image aspect smoke test passed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

void main()
