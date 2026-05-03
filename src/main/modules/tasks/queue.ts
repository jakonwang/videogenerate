import PQueue from 'p-queue'
import { randomUUID } from 'node:crypto'
import { join, extname } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { getAppPaths } from '../../lib/paths'
import { renderVideo } from '../ffmpeg/render'
import { resolveSoleBgmPathForRender } from '../../lib/bgmPaths'
import { synthesizeEdgeTts } from '../tts/edge'
import { probeMedia } from '../ffmpeg/probe'
import {
  buildAss,
  readTtsPartsJson,
  type AssTitlePlacement,
  type AssTtsPlacement,
  type TtsSubtitlePart,
} from '../subtitle/ass'
import { suggestSubtitlePlacement } from '../subtitle/placement'
import {
  ASS_DEFAULT_FONT_SIZE,
  ASS_DEFAULT_TITLE_MARGIN_V,
  ASS_DEFAULT_TTS_MARGIN_V,
} from '../../../shared/assDefaults'
import {
  assertAssFontFamilyAvailable,
  assertFontsDirForSubtitles,
  pickAssFontFamilyForRender,
  prepareFontsDirForSubtitles,
  resolveAssFontFamilyForFontsDir,
  resolveMultilangFont,
} from '../../lib/fontResolve'
import { appendBatchReportRow } from '../../lib/batchReport'
import type { TaskEvent, VideoTask } from './types'

type Listener = (evt: TaskEvent) => void

/** 常见纯音频扩展名：ffprobe 偶发不列出音轨时不应直接丢弃 BGM，否则成片会“没有背景音乐” */
function looksLikeAudioOnlyExt(filePath: string): boolean {
  const e = extname(filePath).replace(/^\./, '').toLowerCase()
  return ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma'].includes(e)
}

class TaskQueue {
  private q = new PQueue({ concurrency: 3 })
  private tasks: VideoTask[] = []
  private listeners: Listener[] = []
  private cancelled = false
  private paused = false
  private lastEmitByTask = new Map<string, number>()
  private controllers = new Map<string, AbortController>()
  private scheduled = new Set<string>()

  onEvent(fn: Listener) {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((x) => x !== fn)
    }
  }

  private emit(evt: TaskEvent) {
    for (const l of this.listeners) l(evt)
  }

  list() {
    return this.tasks
  }

  getTask(id: string) {
    return this.tasks.find((t) => t.id === id)
  }

  stats() {
    return {
      concurrency: this.q.concurrency,
      size: this.tasks.length,
      pending: this.q.size,
      paused: this.paused,
    }
  }

  pause() {
    this.paused = true
    this.q.pause()
    // 终止正在运行的 ffmpeg（跨平台稳定），任务标记为 paused，稍后可继续（从头重跑）
    for (const t of this.tasks) {
      if (t.status === 'running') {
        this.controllers.get(t.id)?.abort()
        t.status = 'paused'
        this.emitTaskUpdate(t, true)
      }
    }
    this.emit({ type: 'queue:stats', stats: { size: this.tasks.length, pending: this.q.size, paused: true, concurrency: this.q.concurrency } })
  }

  resume() {
    this.paused = false
    this.q.start()
    // 将 paused 的任务重新入队
    for (const t of this.tasks) {
      if (t.status === 'paused') {
        t.status = 'queued'
        t.error = undefined
        this.emitTaskUpdate(t, true)
        this.scheduleRun(t)
      }
    }
    this.emit({ type: 'queue:stats', stats: { size: this.tasks.length, pending: this.q.size, paused: false, concurrency: this.q.concurrency } })
  }

  private emitTaskUpdate(t: VideoTask, force = false) {
    // 节流：进度更新可能非常频繁，避免 IPC 洪泛导致 UI 卡顿
    const now = Date.now()
    const last = this.lastEmitByTask.get(t.id) ?? 0
    if (!force && now - last < 120) return
    this.lastEmitByTask.set(t.id, now)
    this.emit({ type: 'task:update', task: t })
  }

  private scheduleRun(t: VideoTask) {
    if (this.scheduled.has(t.id)) return
    this.scheduled.add(t.id)
    this.q.add(async () => {
      try {
        await this.runTask(t)
      } finally {
        this.scheduled.delete(t.id)
      }
    })
  }

  private async runTask(t: VideoTask) {
    if (this.cancelled) {
      t.status = 'cancelled'
      t.progress = 0
      this.emitTaskUpdate(t, true)
      return
    }
    if (this.paused) {
      // 队列被 pause 时不会开始新任务，但这里做一层保护
      t.status = 'queued'
      this.emitTaskUpdate(t, true)
      return
    }

    t.status = 'running'
    t.progress = Math.max(t.progress, 0.01)
    this.emitTaskUpdate(t, true)

    const ctrl = new AbortController()
    this.controllers.set(t.id, ctrl)

    const tmpDir = getAppPaths().tmpDir
    const taskTmp = join(tmpDir, `task_${t.id}`)
    try {
      const startedAt = Date.now()
      // ASS / TTS：有画面标题时始终烧录（不必勾选「ASS」）；配音字幕需勾选 ASS 才会与 TTS 一并烧录
      const needAssFlag = Boolean(t.plan?.assStyle?.enabled)
      const hasTitle = Boolean(t.plan?.titleOverlay?.text?.trim())
      const hasTtsText = Boolean(t.plan?.tts?.text?.trim())
      const shouldWriteAss = hasTitle || (needAssFlag && hasTtsText)
      let fontsDirForAssCheck: string | null = null

      if (shouldWriteAss) {
        assertFontsDirForSubtitles(resolveMultilangFont())
      }

      // 每个任务使用独立临时目录：避免并发任务互相覆盖 bgm_input.mp3 / voice_input.mp3 等临时文件
      await mkdir(taskTmp, { recursive: true })
      if (shouldWriteAss) {
        fontsDirForAssCheck = await prepareFontsDirForSubtitles(taskTmp)
      }

      if (shouldWriteAss || hasTtsText) {

        let timedSpeech: {
          text: string
          audioDurationSec: number
          parts: TtsSubtitlePart[] | null
        } | null = null
        let autoTitlePlacement: AssTitlePlacement | undefined
        let autoTtsPlacement: AssTtsPlacement | undefined

        if (hasTtsText) {
          const mp3Path = join(taskTmp, `tts.mp3`)
          const wantTimedSubs = Boolean(needAssFlag && hasTtsText)
          const { subtitlesJsonPath } = await synthesizeEdgeTts({
            text: t.plan.tts!.text,
            outPath: mp3Path,
            voice: t.plan.tts!.voice,
            rate: t.plan.tts!.rate,
            pitch: t.plan.tts!.pitch,
            volume: t.plan.tts!.ttsVolume,
            saveSubtitles: wantTimedSubs,
          })
          const ttsMeta = await probeMedia(mp3Path)
          const audioDur = Math.max(0.2, Number(ttsMeta.durationSec ?? 0))
          const parts = wantTimedSubs ? await readTtsPartsJson(subtitlesJsonPath) : null
          timedSpeech = wantTimedSubs
            ? {
                text: t.plan.tts!.text,
                audioDurationSec: audioDur,
                parts,
              }
            : null
          t.plan.voice = {
            filePath: mp3Path,
            volume: Number(t.plan.tts!.mixVolume ?? 0.9),
            keepOriginal: Boolean(t.plan.tts!.keepOriginal ?? true),
          }
          t.logs = [`TTS：已生成 ${mp3Path}`, ...t.logs].slice(0, 200)
          this.emitTaskUpdate(t, true)
        }

        if (shouldWriteAss) {
          const autoPlacementEnabled = Boolean((t.plan.assStyle as any)?.autoPlacement ?? true)
          if (hasTitle && autoPlacementEnabled) {
            try {
              const picked = await suggestSubtitlePlacement({
                segments: t.plan.segments.map((s) => ({
                  filePath: String(s.filePath ?? ''),
                  startSec: Number(s.startSec ?? 0),
                  durationSec: Number(s.durationSec ?? 0),
                  inputDurationSec: Number(s.inputDurationSec ?? s.durationSec ?? 0),
                })),
                samplePerSegment: 1,
                maxSegments: 3,
                signal: ctrl.signal,
              })
              if (picked) {
                autoTitlePlacement = picked.titlePlacement
                autoTtsPlacement = picked.ttsPlacement
                const scoreStr = `top=${picked.scores.top.toFixed(2)}, middle=${picked.scores.middle.toFixed(2)}, bottom=${picked.scores.bottom.toFixed(2)}`
                t.logs = [
                  `字幕自动选位：title=${picked.titlePlacement}, tts=${picked.ttsPlacement}, confidence=${Math.round(picked.confidence * 100)}%, samples=${picked.sampledFrames}, ${scoreStr}`,
                  ...t.logs,
                ].slice(0, 200)
                this.emitTaskUpdate(t, true)
              } else {
                t.logs = [`字幕自动选位：分析无有效结果，回退默认位置（title=top, tts=bottom）`, ...t.logs].slice(0, 200)
                this.emitTaskUpdate(t, true)
              }
            } catch (e: any) {
              t.logs = [`字幕自动选位：分析失败，回退默认位置（title=top, tts=bottom）：${String(e?.message ?? e)}`, ...t.logs].slice(0, 200)
              this.emitTaskUpdate(t, true)
            }
          }

          const style = t.plan.assStyle!
          const assPath = join(taskTmp, `subtitles.ass`)
          const resolvedFont = resolveMultilangFont()
          let assFontName = pickAssFontFamilyForRender(style.fontName, resolvedFont)
          if (fontsDirForAssCheck) {
            assFontName = await resolveAssFontFamilyForFontsDir(fontsDirForAssCheck, assFontName)
            await assertAssFontFamilyAvailable(fontsDirForAssCheck, assFontName)
          }
          const assText = buildAss({
            fontName: assFontName,
            fontSize: Number(style.fontSize ?? ASS_DEFAULT_FONT_SIZE),
            preset: (style.preset ?? 'yellow_box') as 'yellow_box' | 'white_shadow',
            marginV: Number(style.marginV ?? ASS_DEFAULT_TITLE_MARGIN_V),
            ttsMarginV: Number(style.ttsMarginV ?? ASS_DEFAULT_TTS_MARGIN_V),
            titlePlacement: autoTitlePlacement,
            ttsPlacement: autoTtsPlacement,
            staticTitle: hasTitle
              ? { text: String(t.plan.titleOverlay!.text).trim(), durationSec: t.plan.totalDurationSec }
              : null,
            timedSpeech,
          })
          await writeFile(assPath, assText, { encoding: 'utf8' })
          t.plan.ass = { filePath: assPath }
          if (hasTitle && !hasTtsText) {
            t.logs = [`画面标题：已生成 ASS（无配音）${assPath}`, ...t.logs].slice(0, 200)
            this.emitTaskUpdate(t, true)
          }
        }
      }

      // BGM：强制 plan 上仅保留一首路径（杜绝 filePaths 误入导致后续多轨）
      const soleBgm = resolveSoleBgmPathForRender(t.plan)
      if (soleBgm) {
        t.plan.bgm = { filePath: soleBgm, volume: Number(t.plan.bgm?.volume ?? 0.25) }
      } else {
        t.plan.bgm = null
      }

      // BGM：ffprobe 无音轨 / 探测失败时，对常见音频扩展名仍保留混音（交由 FFmpeg 裁决）；其余再跳过以免 filter 断链
      if (t.plan?.bgm?.filePath) {
        const bgmPath = t.plan.bgm.filePath
        try {
          const meta = await probeMedia(bgmPath)
          if (!meta.hasAudio) {
            if (looksLikeAudioOnlyExt(bgmPath)) {
              t.logs = [
                `BGM：ffprobe 未识别音轨，但扩展名为常见音频，仍尝试混音（若失败请看下方 FFmpeg 日志）：${bgmPath}`,
                ...t.logs,
              ].slice(0, 200)
              this.emitTaskUpdate(t, true)
            } else {
              t.plan.bgm = null
              t.logs = [`BGM：未检测到音轨，已自动跳过（${bgmPath}）`, ...t.logs].slice(0, 200)
              this.emitTaskUpdate(t, true)
            }
          }
        } catch {
          if (looksLikeAudioOnlyExt(bgmPath)) {
            t.logs = [`BGM：探测失败，扩展名为常见音频，仍尝试混音：${bgmPath}`, ...t.logs].slice(0, 200)
            this.emitTaskUpdate(t, true)
          } else {
            t.plan.bgm = null
            t.logs = [`BGM：探测失败，已自动跳过（${bgmPath}）`, ...t.logs].slice(0, 200)
            this.emitTaskUpdate(t, true)
          }
        }
      }

      // 音频合成诊断：帮助定位“为什么像多首 BGM”
      const srcMode = (t.plan.audio?.source ?? 'keep') as any
      const bgmFp = t.plan.bgm?.filePath ? String(t.plan.bgm.filePath) : ''
      t.logs = [
        `音频模式：原声=${srcMode === 'mute' ? '静音' : '保留'}；BGM=${bgmFp ? bgmFp.split(/[/\\]/).pop() : '无'}；配音=${t.plan.voice?.filePath ? '有' : '无'}`,
        ...t.logs,
      ].slice(0, 200)
      this.emitTaskUpdate(t, true)

      await renderVideo({
        plan: t.plan,
        tmpDir: taskTmp,
        outPath: t.outPath,
        signal: ctrl.signal,
        onLog: (msg) => {
          t.logs = [msg, ...t.logs].slice(0, 200)
          this.emitTaskUpdate(t)
        },
        onProgress: (p) => {
          t.progress = Math.max(0, Math.min(1, p))
          this.emitTaskUpdate(t)
        },
      })
      t.renderMs = Date.now() - startedAt
      try {
        const hook = t.plan.segments.find((s) => s.segment === 'hook') ?? t.plan.segments[0]
        const hookName = hook?.filePath ? hook.filePath.split(/[/\\]/).pop() ?? hook.filePath : ''
        const ttsText = String(t.plan.tts?.text ?? '').trim()
        const bgmName = t.plan.bgm?.filePath ? t.plan.bgm.filePath.split(/[/\\]/).pop() ?? t.plan.bgm.filePath : ''
        t.reportPath = await appendBatchReportRow(t.outDir, {
          outPath: t.outPath,
          hookAssetName: hookName,
          ttsText,
          bgmFileName: bgmName,
          renderMs: t.renderMs,
        })
      } catch {
        // 报表失败不应影响任务完成
      }
      t.status = 'done'
      t.progress = 1
      this.emitTaskUpdate(t, true)
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      if (msg.includes('已中止') || msg.includes('aborted') || msg.includes('Abort')) {
        // pause/取消导致的中止：如果当前处于 pause，则标记 paused；否则当作 cancelled
        if (this.paused) t.status = 'paused'
        else t.status = 'cancelled'
        this.emitTaskUpdate(t, true)
      } else {
        t.status = 'error'
        t.error = msg
        t.logs = [`ERROR: ${msg}`, ...t.logs].slice(0, 200)
        this.emitTaskUpdate(t, true)
      }
    } finally {
      this.controllers.delete(t.id)
      this.emit({ type: 'queue:stats', stats: { size: this.tasks.length, pending: this.q.size, paused: this.paused, concurrency: this.q.concurrency } })
    }
  }

  enqueue(task: Omit<VideoTask, 'id' | 'createdAt' | 'status' | 'progress' | 'logs'>) {
    const t: VideoTask = {
      id: randomUUID(),
      createdAt: Date.now(),
      status: 'queued',
      progress: 0,
      logs: [],
      ...task,
    }
    this.tasks.unshift(t)
    this.emitTaskUpdate(t, true)
    this.emit({ type: 'queue:stats', stats: { size: this.tasks.length, pending: this.q.size } })

    this.scheduleRun(t)
  }

  cancelAll() {
    this.cancelled = true
    this.q.clear()
    for (const c of this.controllers.values()) c.abort()
    for (const t of this.tasks) {
      if (t.status === 'queued' || t.status === 'running') {
        t.status = 'cancelled'
        t.progress = 0
        this.emitTaskUpdate(t, true)
      }
    }
    this.emit({ type: 'queue:stats', stats: { size: this.tasks.length, pending: this.q.size } })
    // 下一次 enqueue 后允许继续
    setTimeout(() => {
      this.cancelled = false
    }, 0)
  }
}

export const taskQueue = new TaskQueue()

