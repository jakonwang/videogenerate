// Builds the factory promo soundtrack: per-line TTS, a synth beat, ducked mix,
// and a frame timeline the Remotion composition reads.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {EdgeTTS} from 'node-edge-tts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const promo = path.join(root, 'promo-factory')
const narration = JSON.parse(fs.readFileSync(path.join(promo, 'narration.json'), 'utf8'))
const clipsDir = path.join(promo, 'build', 'clips')
const publicDir = path.join(promo, 'video', 'public')
fs.mkdirSync(clipsDir, {recursive: true})
fs.mkdirSync(publicDir, {recursive: true})

const FPS = 30
const LEAD_IN = 0.7
const LINE_GAP = 0.16
const SCENE_GAP = 0.42
const TAIL = 2.2

const run = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: 'inherit', windowsHide: true})
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`)
}
const duration = (file) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {encoding: 'utf8'}).stdout.trim())

async function speak(text, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 2000 && fs.existsSync(`${file}.txt`) && fs.readFileSync(`${file}.txt`, 'utf8') === text) return
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const tts = new EdgeTTS({voice: narration.voice, lang: 'zh-CN', rate: narration.rate, timeout: 40000})
      await tts.ttsPromise(text, file)
      fs.writeFileSync(`${file}.txt`, text)
      return
    } catch (err) {
      console.warn(`tts retry ${attempt}: ${err.message}`)
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  throw new Error(`TTS failed for: ${text}`)
}

const timeline = {fps: FPS, scenes: []}
const clips = []
let cursor = LEAD_IN
for (const [si, scene] of narration.scenes.entries()) {
  const sceneStart = si === 0 ? 0 : cursor - SCENE_GAP / 2
  const lines = []
  for (const [li, text] of scene.lines.entries()) {
    const file = path.join(clipsDir, `${String(si).padStart(2, '0')}-${li}.mp3`)
    await speak(text, file)
    // edge-tts pads ~0.1s silence at both ends; trim a bit so the read stays tight.
    const d = duration(file)
    lines.push({text, from: Math.round(cursor * FPS), to: Math.round((cursor + d) * FPS)})
    clips.push({file, start: cursor})
    cursor += d + LINE_GAP
    process.stdout.write('.')
  }
  cursor += SCENE_GAP - LINE_GAP
  const sceneEnd = si === narration.scenes.length - 1 ? cursor + TAIL : cursor - SCENE_GAP / 2
  timeline.scenes.push({id: scene.id, from: Math.round(sceneStart * FPS), to: Math.round(sceneEnd * FPS), lines})
}
const total = timeline.scenes.at(-1).to / FPS
timeline.durationInFrames = timeline.scenes.at(-1).to
console.log(`\nnarration ${total.toFixed(1)}s, ${clips.length} lines`)

// 1) voice track
const voice = path.join(promo, 'build', 'voice.wav')
{
  const inputs = clips.flatMap((c) => ['-i', c.file])
  const delays = clips.map((c, i) => `[${i}:a]adelay=${Math.round(c.start * 1000)}:all=1[v${i}]`).join(';')
  const mix = `${clips.map((_, i) => `[v${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,apad=whole_dur=${total},atrim=0:${total}[out]`
  run([...inputs, '-filter_complex', `${delays};${mix}`, '-map', '[out]', '-ar', '48000', '-ac', '2', voice])
}

// 2) synth beat at 120 bpm: kick, offbeat hat, side-chained bass, pad chords (Am F C G)
const beat = path.join(promo, 'build', 'beat.wav')
{
  const m = 'mod(t,0.5)'
  const bar = 'mod(t,8)'
  const root = `if(lt(${bar},2),110,if(lt(${bar},4),87.31,if(lt(${bar},6),130.81,98)))`
  const kick = `0.9*sin(2*PI*(46+120*exp(-28*${m}))*${m})*exp(-7*${m})`
  const hat = `0.10*(random(0)*2-1)*exp(-70*mod(t+0.25,0.5))`
  const pump = `(1-0.85*exp(-9*${m}))`
  const bass = `0.30*${pump}*sin(2*PI*${root}*t)`
  const pad = `0.07*${pump}*(sin(2*PI*${root}*2*t)+0.7*sin(2*PI*${root}*3*t)+0.5*sin(2*PI*${root}*2.52*t))`
  const expr = `${kick}+${hat}+${bass}+${pad}`
  run(['-f', 'lavfi', '-i', `aevalsrc='${expr}':s=48000:d=${total}`, '-af', `lowpass=f=9000,afade=t=in:d=1.5,afade=t=out:st=${total - 3}:d=3,volume=0.55`, '-ac', '2', beat])
}

// 3) duck the beat under the voice, then mix and normalise
const mixed = path.join(publicDir, 'soundtrack.mp3')
run([
  '-i', beat, '-i', voice, '-filter_complex',
  '[1:a]asplit=2[vk][vm];[0:a][vk]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[bd];[bd]volume=0.45[b];[b][vm]amix=inputs=2:normalize=0,loudnorm=I=-15:TP=-1.2:LRA=9[out]',
  '-map', '[out]', '-ar', '48000', '-codec:a', 'libmp3lame', '-b:a', '192k', mixed,
])

fs.writeFileSync(path.join(promo, 'video', 'src', 'timeline.json'), JSON.stringify(timeline, null, 1))
console.log(`soundtrack -> ${mixed}`)
