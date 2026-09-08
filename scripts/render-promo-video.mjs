import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {bundle} from '@remotion/bundler'
import {renderMedia, selectComposition} from '@remotion/renderer'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(root, 'promo-video', 'public')
const ffmpegPath = (await import('ffmpeg-static')).default
const audioPath = path.join(publicDir, 'ambient.mp3')
const outputPath = path.join(root, 'release', 'VideoGenerate-Promo-v5.0.65.mp4')

const audio = spawnSync(ffmpegPath, [
  '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=48',
  '-f', 'lavfi', '-i', 'sine=frequency=329.63:duration=48',
  '-f', 'lavfi', '-i', 'sine=frequency=440:duration=48',
  '-filter_complex', '[0:a]volume=0.08[a0];[1:a]volume=0.04[a1];[2:a]volume=0.018[a2];[a0][a1][a2]amix=inputs=3:duration=longest,afade=t=in:st=0:d=3,afade=t=out:st=44:d=4',
  '-ar', '48000', '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '160k', audioPath,
], {stdio: 'inherit', windowsHide: true})
if (audio.status !== 0) throw new Error('Unable to generate promo soundtrack')

const serveUrl = await bundle({
  entryPoint: path.join(root, 'promo-video', 'src', 'index.ts'),
  publicDir,
  webpackOverride: (config) => config,
})
const composition = await selectComposition({serveUrl, id: 'VideoGeneratePromo'})
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: outputPath,
  audioCodec: 'aac',
  crf: 18,
  pixelFormat: 'yuv420p',
  concurrency: 4,
})
console.log(`Promo video written to ${outputPath}`)
