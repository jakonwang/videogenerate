import { copyFile, mkdir, unlink, writeFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { runFfmpeg } from './runner'
import type { VideoPlan } from '../random/engine'
import { prepareFontsDirForSubtitles } from '../../lib/fontResolve'
import {
  invalidateHwEncoderProbes,
  libx264Pick,
  pickH264Encoder,
  type EncoderPick,
} from './encoders'
import { resolveSoleBgmPathForRender } from '../../lib/bgmPaths'

/** FFmpeg 带 `file=` 参数滤镜的路径转义（Win 盘符/反斜杠） */
function escapePathForFfmpegSubtitlesFilter(absPath: string): string {
  return String(absPath)
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
}

export type RenderOptions = {
  plan: VideoPlan
  tmpDir: string
  outPath: string
  onLog?: (msg: string) => void
  onProgress?: (p: number) => void
  signal?: AbortSignal
}

export async function renderVideo(opts: RenderOptions) {
  const { plan, tmpDir, outPath } = opts
  await mkdir(tmpDir, { recursive: true })

  function clamp(n: number, min: number, max: number) {
    if (!Number.isFinite(n)) return min
    return Math.max(min, Math.min(max, n))
  }

  async function stageSafeAudioInput(inputPath: string, name: string) {
    const p = String(inputPath ?? '').trim()
    if (!p) return p
    const ext = extname(p) || '.mp3'
    const safe = join(tmpDir, `${name}${ext}`)
    if (safe !== p) {
      await copyFile(p, safe)
      return safe
    }
    return p
  }

  function extractInputPaths(args: string[]) {
    const out: string[] = []
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] === '-i') out.push(String(args[i + 1]))
    }
    return out
  }

  const aspectMode = plan.aspectUnifyMode ?? 'contain_pad'
  // 原声静音：硬保证（即使素材带音轨也不会进入 concat/xfade 音频链）
  const sourceMuted = (plan.audio?.source ?? 'keep') === 'mute'

  // 性能优化：单次 ffmpeg 进程完成裁剪 + 统一画幅 + concat，避免中间文件与多进程开销
  // 注意：这里使用 -ss/-t 放在 -i 前做“输入裁剪”（更快），并在 filter 里 setpts/atrim 对齐时间轴
  const n = plan.segments.length
  const inputs: string[] = []
  const audioInputs: Array<'src' | 'anull'> = []
  for (const s of plan.segments) {
    const inputDur = Math.max(0.1, Number(s.inputDurationSec ?? s.durationSec))
    inputs.push('-ss', `${s.startSec}`, '-t', `${inputDur}`, '-i', s.filePath)
    audioInputs.push(s.hasAudio ? 'src' : 'anull')
  }

  // 彩色贴纸：作为额外视频输入（-loop 1），用于 overlay
  const useSticker = Boolean(plan.sticker?.filePath)
  const stickerIndex = useSticker ? n : -1
  if (useSticker) {
    inputs.push('-loop', '1', '-i', plan.sticker!.filePath)
  }

  // 可选 BGM：全局仅 1 个 -i（多首模板已在方案里随机成单一路径；此处再兜底解析，禁止多 BGM 叠加）
  // 兼容性兜底（Win）：部分 ffmpeg 构建对含中文/括号等路径打开会报 Invalid argument。
  // 策略：先复制到 tmpDir 下的纯英文文件名再作为输入；若复制失败则自动跳过 BGM（保证任务不因 BGM 失败）。
  const rawBgmPath = resolveSoleBgmPathForRender(plan)
  let soleBgmPath: string | null = rawBgmPath || null
  if (soleBgmPath) {
    opts.onLog?.(`BGM：原始路径 -> ${soleBgmPath}`)
    try {
      const staged = await stageSafeAudioInput(soleBgmPath, 'bgm_input')
      if (staged !== soleBgmPath) opts.onLog?.(`BGM：已复制到临时路径（兼容性）-> ${staged}`)
      soleBgmPath = staged
      opts.onLog?.(`BGM：FFmpeg 输入路径 -> ${soleBgmPath}`)
    } catch (e: any) {
      opts.onLog?.(`BGM：复制到临时路径失败，已自动跳过（不影响出片）：${String(e?.message ?? e)}`)
      soleBgmPath = null
    }
  }
  const useBgm = Boolean(soleBgmPath)
  const bgmIndex = useBgm ? n + (useSticker ? 1 : 0) : -1
  if (useBgm) {
    inputs.push('-stream_loop', '-1', '-i', soleBgmPath!)
  }

  const vFilters: string[] = []
  const aFilters: string[] = []
  for (let i = 0; i < n; i++) {
    // 容错：保证最小 duration，避免除 0 或极小值导致滤镜异常
    const fx = plan.segments[i].fx ?? { zoom: 1.0, moveX: 0, moveY: 0 }
    const dur = Math.max(0.1, plan.segments[i].durationSec)
    const speed = Math.max(0.985, Math.min(1.015, Number(plan.segments[i].jitter?.speed ?? 1)))
    const color = plan.segments[i].jitter?.color
    const base = plan.colorGrade
    // 先统一到 1080x1920，再做轻微 zoom + 位置移动（更像“真人剪辑”）
    // moveX/moveY 为归一化(-0.1~0.1)，转成像素偏移，并在整个片段里线性变化
    const z = fx.zoom
    // 标准化：强制 9:16（两种模式）；再统一 fps/像素格式，避免 concat/xfade 因格式差异断链
    // - contain_pad：完整展示（可能留黑边）
    // - cover_crop：充满屏幕（等比放大后居中裁切）
    const unify =
      aspectMode === 'cover_crop'
        ? `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`
        : `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black`
    const zoomScale = `scale=trunc(1080*${z}/2)*2:trunc(1920*${z}/2)*2`
    const dx = `(iw-1080)*${fx.moveX}`
    const dy = `(ih-1920)*${fx.moveY}`
    // 兼容性：某些 ffmpeg 构建对 crop 的 eval/逐帧表达式支持不一致。
    // 这里使用“静态偏移”的 crop（不依赖 t 变量），避免触发 eval 相关报错；仍能通过随机 moveX/moveY 做轻微构图变化。
    const crop = `crop=w=1080:h=1920:x='(iw-1080)/2 + (${dx})':y='(ih-1920)/2 + (${dy})'`
    const wantEq = Boolean(base) || Boolean(color)
    // eq 安全范围：brightness [-1,1]；contrast 建议 [0,2]；saturation [0,3]；hue [-180,180]
    // 这里对“手动调色 + 微扰叠加”的最终值做限幅，避免出现整屏冲白/纯黑等极端情况。
    const effBrightness = clamp(
      Number(((base?.brightness ?? 0) + (color?.brightness ?? 0)).toFixed(4)),
      -1,
      1,
    )
    const effContrast = clamp(
      Number(((base?.contrast ?? 1) * (color?.contrast ?? 1)).toFixed(4)),
      0,
      2,
    )
    const effSaturation = clamp(
      Number(((base?.saturation ?? 1) * (color?.saturation ?? 1)).toFixed(4)),
      0,
      3,
    )
    const effHue = color?.hueDeg != null ? clamp(Number(color.hueDeg), -180, 180) : undefined
    const colorFilter = wantEq
      ? `,eq=brightness=${effBrightness}:contrast=${effContrast}:saturation=${effSaturation}${effHue != null ? `,hue=h=${effHue}` : ''}`
      : ''
    const hflipFilter = plan.segments[i]?.hflip ? ',hflip' : ''
    // 速度：setpts=PTS/speed（speed>1 更快）；保证起点为 0
    const speedPts = speed !== 1 ? `,setpts=(PTS-STARTPTS)/${speed}` : ',setpts=PTS-STARTPTS'
    vFilters.push(
      `[${i}:v:0]${unify},${zoomScale},${crop}${colorFilter}${hflipFilter},fps=30,format=yuv420p,setsar=1${speedPts}[v${i}]`,
    )
    // 若静音原声：无论输入有没有音轨，都用 anullsrc（确保不会听到素材自带音乐/环境声）
    if (sourceMuted) {
      aFilters.push(
        `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${dur},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,aresample=async=1:first_pts=0[a${i}]`,
      )
    } else if (audioInputs[i] === 'src') {
      // 指定具体 stream index：避免 MOV 首条 audio 为 apac（FFmpeg 不可解码）时 `a:0` 指向错误轨
      const seg = plan.segments[i]
      const aSpec =
        typeof seg.audioStreamIndex === 'number' && Number.isFinite(seg.audioStreamIndex)
          ? `${i}:${seg.audioStreamIndex}`
          : `${i}:a:0`
      // 标准化音频：48k + stereo，避免 acrossfade/amix 出现采样率/声道不一致
      // 速度：atempo 支持 0.5~2.0；这里范围很小，直接使用即可
      const atempo = speed !== 1 ? `,atempo=${speed.toFixed(4)}` : ''
      // async=1 修正时间基，降低拼接后音频“轻微卡顿/漂移”的概率（尤其是 VFR 输入）
      aFilters.push(
        `[${aSpec}]atrim=0,asetpts=PTS-STARTPTS${atempo},aformat=sample_rates=48000:channel_layouts=stereo,aresample=async=1:first_pts=0[a${i}]`,
      )
    } else {
      // 无音轨素材：用静音填充，避免 concat 引用不存在的音频流
      aFilters.push(
        `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${dur},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,aresample=async=1:first_pts=0[a${i}]`,
      )
    }
  }

  const transEnabled = Boolean(plan.transition?.enabled) && (plan.transition?.durationsSec?.length ?? 0) === Math.max(0, n - 1)
  const transDur = plan.transition?.durationsSec ?? []
  const transNames = (Array.isArray(plan.transition?.transitions) ? plan.transition?.transitions : []) as Array<
    'hardcut' | 'fade' | 'slideleft' | 'slideright' | 'pixelize' | 'circlecrop' | 'wipeup' | 'squeezev' | 'squeezeh'
  >

  // 拼接方式：
  // - 有转场：使用 xfade + acrossfade 逐段合成（更像真人剪辑）
  // - 无转场：使用 concat
  const chains: string[] = []
  const pre = [...vFilters, ...aFilters].join(';')

  let outV = `v0`
  let outA = `a0`
  let currentDur = plan.segments[0]?.durationSec ?? 0
  if (transEnabled && n > 1) {
    for (let i = 1; i < n; i++) {
      const d = transDur[i - 1] ?? 0.18
      const tr = transNames[i - 1] ?? 'fade'
      if (tr === 'hardcut') {
        // 硬切：不做转场与音频叠化，直接按时间轴拼接
        chains.push(`[${outV}][${outA}][v${i}][a${i}]concat=n=2:v=1:a=1[vxf${i}][axf${i}]`)
        outV = `vxf${i}`
        outA = `axf${i}`
        currentDur = currentDur + plan.segments[i].durationSec
      } else {
        const safeD = Math.max(0.05, Math.min(d, currentDur * 0.4, plan.segments[i].durationSec * 0.4))
        const offset = Math.max(0, Number((currentDur - safeD).toFixed(3)))
        // xfade 要求两路时间基一致；前级 xfade 输出常为 1/1000000，而 [vN] 经 fps=30 为 1/30，需先 settb 对齐
        const xL = `xfl${i}`
        const xR = `xfr${i}`
        chains.push(
          `[${outV}]settb=1/30[${xL}];[v${i}]settb=1/30[${xR}];[${xL}][${xR}]xfade=transition=${tr}:duration=${safeD}:offset=${offset}[vxf${i}]`,
        )
        chains.push(`[${outA}][a${i}]acrossfade=d=${safeD}:c1=tri:c2=tri[axf${i}]`)
        outV = `vxf${i}`
        outA = `axf${i}`
        currentDur = currentDur + plan.segments[i].durationSec - safeD
      }
    }
    chains.push(`[${outV}]copy[outv]`)
    // 不用 anull：部分构建下 anull 输出易触发 “anull:default has an unconnected output”；aformat 同样可承接到 [outa]
    chains.push(
      `[${outA}]aformat=sample_rates=48000:channel_layouts=stereo,aresample=async=1:first_pts=0[outa]`,
    )
  } else {
    const concatIn = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join('')
    chains.push(`${concatIn}concat=n=${n}:v=1:a=1[outv][outa]`)
  }

  // 最终音频时长必须对齐整条成片时长。
  // 这里不能直接用 currentDur（在“无转场 concat”分支里 currentDur 仍可能是首段时长），
  // 否则会出现“第一分镜有声，后续分镜 BGM 消失”的问题。
  const planDur = Number(plan.totalDurationSec ?? 0)
  const segDurSum = Number(plan.segments.reduce((a, s) => a + Number(s.durationSec || 0), 0))
  const finalDur = Math.max(0.1, Number((planDur > 0 ? planDur : segDurSum).toFixed(3)))

  // 末端视频处理顺序：贴纸 overlay -> lut3d -> subtitles
  let outVLabel = 'outv'
  let stickerFilter = ''
  let lutFilter = ''

  if (useSticker) {
    const h = Math.max(40, Math.min(800, Math.round(Number(plan.sticker?.heightPx ?? 180) || 180)))
    // 贴纸缩放到固定高度，居中贴在标题下方区域（y=520 可后续做成可配置）
    stickerFilter = `;[${stickerIndex}:v:0]scale=-2:${h},format=rgba[st0];[outv][st0]overlay=x=(W-w)/2:y=520:format=auto[outvst]`
    outVLabel = 'outvst'
  }

  if (plan.lut3d?.filePath) {
    const lutPath = escapePathForFfmpegSubtitlesFilter(plan.lut3d.filePath)
    lutFilter = `;[${outVLabel}]lut3d=file='${lutPath}'[outvlut]`
    outVLabel = 'outvlut'
  }

  // ASS 字幕（已废弃 drawtext）：subtitles 滤镜 + 强制 fontsdir
  let subtitleFilter = ''
  if (plan.ass?.filePath) {
    const fontsDir = await prepareFontsDirForSubtitles(tmpDir)
    opts.onLog?.(`字幕字体目录（强制）: ${fontsDir}`)
    const assPath = escapePathForFfmpegSubtitlesFilter(plan.ass.filePath)
    const fd = `:fontsdir='${escapePathForFfmpegSubtitlesFilter(fontsDir)}'`
    subtitleFilter = `;[${outVLabel}]subtitles='${assPath}'${fd}[outvs]`
    outVLabel = 'outvs'
  }

  const assTmpPath = plan.ass?.filePath ?? null

  // 配音（voice）与 BGM + ducking
  const duckingEnabled = Boolean(plan.audio?.ducking?.enabled)
  const amountDb = plan.audio?.ducking?.amountDb ?? 14
  const baseOut = `${pre};${chains.join(';')}`
  const useVoice = Boolean(plan.voice?.filePath)
  if (useVoice) {
    const rawVoice = plan.voice!.filePath
    const stagedVoice = await stageSafeAudioInput(rawVoice, 'voice_input')
    if (stagedVoice !== rawVoice) opts.onLog?.(`VOICE：已复制到临时路径（兼容性）-> ${stagedVoice}`)
    inputs.push('-stream_loop', '-1', '-i', stagedVoice)
  }

  const voiceIndex = (useBgm ? bgmIndex + 1 : n + (useSticker ? 1 : 0))

  // 音频链路（更稳）：复用 concat/xfade 的 [outa]
  // 注意：[outa] 必须有且仅有一条“出口”。若启用配音且不保留原声（或已选静音原声），
  // 只能用 anullsink 丢弃 [outa]；不可再生成 [outa_n]/[outa_m]，否则该 label 无人引用会触发
  // “Filter anull:default has an unconnected output / Invalid argument”。
  let audioTail = ''
  let baseAudioLabel: string | null = null
  if (sourceMuted) {
    audioTail += `;[outa]anullsink`
    if (!useVoice && !useBgm) {
      audioTail += `;anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${finalDur},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,aresample=async=1:first_pts=0[outa_m]`
      baseAudioLabel = 'outa_m'
    }
  } else if (useVoice && !plan.voice!.keepOriginal) {
    audioTail += `;[outa]anullsink`
  } else {
    audioTail += `;[outa]aformat=sample_rates=48000:channel_layouts=stereo,aresample=async=1:first_pts=0[outa_n]`
    baseAudioLabel = 'outa_n'
  }

  let mainAudioLabel: string
  if (useVoice) {
    const vVol = plan.voice!.volume ?? 0.9
    audioTail += `;[${voiceIndex}:a:0]atrim=0:${finalDur},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,aresample=async=1:first_pts=0,volume=${vVol}[voice0]`
    if (!sourceMuted && plan.voice!.keepOriginal) {
      audioTail += `;[${baseAudioLabel}][voice0]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=200[origduck];[origduck][voice0]amix=inputs=2:duration=first:dropout_transition=2[amain]`
      mainAudioLabel = 'amain'
    } else {
      // 直接使用 [voice0]，避免多余的 anull 支路在某些图上被判定为未连接
      mainAudioLabel = 'voice0'
    }
  } else {
    // 仅在“无配音”时会走到这里；若 sourceMuted+useBgm 则 mainAudioLabel 后续不会被使用
    mainAudioLabel = baseAudioLabel ?? 'outa'
  }

  // bgm
  let outAudioLabel = mainAudioLabel
  if (useBgm) {
    const bgmVolRaw = Number(plan.bgm?.volume ?? 0.25)
    const bgmVol = clamp(bgmVolRaw, 0, 2)
    opts.onLog?.(`BGM：mix volume -> ${bgmVol}`)
    if (bgmVol <= 0.001) {
      opts.onLog?.(`BGM：音量为 0（或接近 0），成片会听不到背景音乐。请在模板里把 BGM 音量调高。`)
    }
    // 规避“分镜后无声”：
    // 1) 剔除片头静音；
    // 2) 同时剔除中段较长静音（部分 BGM 文件本身存在 0.2s+ 静音洞，切到该区间会误以为“分镜后没声音”）。
    // 说明：stop_periods=-1 表示循环剔除后续静音段；阈值与时长稍收紧，优先保证“全程持续可听”。
    audioTail += `;[${bgmIndex}:a:0]silenceremove=start_periods=1:start_silence=0:start_threshold=-45dB:stop_periods=-1:stop_duration=0.1:stop_threshold=-40dB,atrim=0:${finalDur},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,aresample=async=1:first_pts=0,volume=${bgmVol}[bgm0]`
    // 关键修复：当原声已静音且没有配音时，直接使用 BGM，避免“静音底轨 + amix”在部分构建下产出静音
    if (sourceMuted && !useVoice) {
      audioTail += `;[bgm0]acopy[outam]`
    } else if (duckingEnabled) {
      // 关键：mainAudioLabel 会被用两次（侧链输入 + 混音输入），必须 asplit，否则会出现 “matches no streams/Invalid stream specifier”
      // 连续性保护：sidechaincompress 在个别素材切镜瞬间会把 BGM 压得过深，听感像“切镜就静音”。
      // 这里叠加一条低电平 floor 底轨，保证 BGM 在分镜切换处也持续可听。
      // normalize=0：避免 amix 默认归一化把 BGM 压得过轻（听感像“没有背景音乐”）
      const bgmFloorVol = clamp(Number((bgmVol * 0.22).toFixed(4)), 0.06, 0.2)
      audioTail += `;[${mainAudioLabel}]asplit=2[m_bg_side][m_bg_mix];[bgm0]asplit=2[bgm_sc][bgm_floor_src];[bgm_sc][m_bg_side]sidechaincompress=threshold=0.025:ratio=6:attack=25:release=220[bgmd];[bgm_floor_src]volume=${bgmFloorVol}[bgmfloor];[bgmd][bgmfloor]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[bgmsafe];[m_bg_mix][bgmsafe]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[outam]`
    } else {
      audioTail += `;[${mainAudioLabel}][bgm0]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[outam]`
    }
    outAudioLabel = 'outam'
  }

  const filter = `${baseOut}${audioTail}${stickerFilter}${lutFilter}${subtitleFilter}`

  opts.onLog?.(`渲染输出 -> ${outPath}`)
  let enc: EncoderPick = await pickH264Encoder()
  opts.onLog?.(`编码器：${enc.codec}（${enc.note}）`)

  const buildFfmpegArgs = (e: EncoderPick) => [
    '-y',
    '-hide_banner',
    '-loglevel',
    'warning',
    ...inputs,
    '-filter_complex',
    filter,
    '-map',
    `[${outVLabel}]`,
    '-map',
    `[${outAudioLabel}]`,
    '-fps_mode',
    'cfr',
    '-r',
    '30',
    '-c:v',
    e.codec,
    ...e.args,
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-shortest',
    outPath,
  ]

  const onFfmpegStderr = (l: string) => {
    if (l.includes('time=')) opts.onProgress?.(0.1 + 0.85 * (Math.random() * 0.02 + 0.98))
    opts.onLog?.(l)
  }

  try {
    try {
      await runFfmpeg({
        args: buildFfmpegArgs(enc),
        signal: opts.signal,
        onStderr: onFfmpegStderr,
      })
    } catch (err) {
      const msg = String((err as Error)?.message ?? err)
      // 让“Invalid argument 打不开某个输入文件”的问题可被直接定位：把 -i 列表附在错误里
      const debugInputs = extractInputPaths(buildFfmpegArgs(enc))
      const debugNote = debugInputs.length ? `\n--- ffmpeg inputs ---\n${debugInputs.join('\n')}` : ''
      const fontHintNeeded =
        Boolean(plan.ass?.filePath) &&
        /(subtitles|libass|font|fontsdir|fontconfig|Error opening font|No fonts found|fontselect|could not load)/i.test(msg)
      const fontHint = fontHintNeeded
        ? `\n--- 字幕字体排查提示 ---\n` +
          `1) 模板里的“字体”应填写字体内部的族名（Family Name / ASS Fontname），不是文件名。\n` +
          `2) 请确认用户字体已导入到 userData/videogenerate/fonts/，并在任务日志中看到“字幕字体目录（强制）”。\n` +
          `3) 若仍失败，优先查看下方 ffmpeg tail 中是否有 “Error opening font” 或 “fontsdir” 相关行。\n`
        : ''
      const enrichedErr = new Error(msg + debugNote + fontHint)
      const nvencBroken =
        enc.codec === 'h264_nvenc' &&
        /nvenc|Driver does not support|required nvenc api|Error while opening encoder/i.test(msg)
      const qsvBroken =
        enc.codec === 'h264_qsv' && /h264_qsv|\bqsv\b|Error while opening encoder/i.test(msg)
      if (!nvencBroken && !qsvBroken) throw enrichedErr
      invalidateHwEncoderProbes()
      enc = libx264Pick(
        enc.codec === 'h264_qsv'
          ? 'QSV 实际打开失败，已用语编码 libx264 自动重试'
          : 'NVENC 实际打开失败，已用语编码 libx264 自动重试',
      )
      opts.onLog?.(`编码器：${enc.codec}（${enc.note}）`)
      await runFfmpeg({
        args: buildFfmpegArgs(enc),
        signal: opts.signal,
        onStderr: onFfmpegStderr,
      })
    }
    opts.onProgress?.(1)
  } finally {
    if (assTmpPath) {
      try {
        await unlink(assTmpPath)
        opts.onLog?.(`已删除临时字幕: ${assTmpPath}`)
      } catch {
        // 忽略删除失败（文件已不存在等）
      }
    }
  }
}

