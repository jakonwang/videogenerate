// Usage:
//   node scripts/factory-promo/render.mjs qa 120 900 ...   -> preview frames of the video
//   node scripts/factory-promo/render.mjs stills            -> UI mock PNGs for the slide deck
//   node scripts/factory-promo/render.mjs video             -> final mp4
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {bundle} from '@remotion/bundler'
import {renderMedia, renderStill, selectComposition, getCompositions} from '@remotion/renderer'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const promo = path.join(root, 'promo-factory')
const [mode = 'video', ...rest] = process.argv.slice(2)

const serveUrl = await bundle({
  entryPoint: path.join(promo, 'video', 'src', 'index.ts'),
  publicDir: path.join(promo, 'video', 'public'),
})

if (mode === 'qa') {
  const out = path.join(promo, 'build', 'qa')
  fs.mkdirSync(out, {recursive: true})
  const composition = await selectComposition({serveUrl, id: 'FactoryPromo'})
  for (const frame of rest.map(Number)) {
    const file = path.join(out, `f${String(frame).padStart(5, '0')}.png`)
    await renderStill({composition, serveUrl, frame, output: file, scale: 0.5})
    console.log(file)
  }
} else if (mode === 'stills') {
  const out = path.join(promo, 'deck', 'img')
  fs.mkdirSync(out, {recursive: true})
  const comps = (await getCompositions(serveUrl)).filter((c) => c.id.startsWith('mock-'))
  for (const composition of comps) {
    const file = path.join(out, `${composition.id}.png`)
    await renderStill({composition, serveUrl, frame: 0, output: file, scale: 2, imageFormat: 'png'})
    console.log(file)
  }
} else {
  const out = path.join(promo, 'Klipmill-工厂宣传片.mp4')
  const composition = await selectComposition({serveUrl, id: 'FactoryPromo'})
  let last = -1
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: out,
    audioCodec: 'aac',
    audioBitrate: '192k',
    crf: 18,
    pixelFormat: 'yuv420p',
    concurrency: 6,
    onProgress: ({progress}) => {
      const p = Math.floor(progress * 20)
      if (p !== last) { last = p; console.log(`${Math.round(progress * 100)}%`) }
    },
  })
  console.log(`video -> ${out}`)
}
