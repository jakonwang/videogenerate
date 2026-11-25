import { existsSync } from 'node:fs'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { MuseJob } from './types'

export type MuseSubtitleInput = {
  ids: string[]
  titleConfig: { strategy?: 'single_for_all' | 'random_pool'; singleText?: string; titlePool?: string[] }
  captionStyle?: Record<string, unknown>
  layoutPolicy?: Record<string, unknown>
}

export type MuseSubtitleRender = (input: {
  items: Array<{ id: string; videoPath: string; title: string; coverImagePath?: string }>
  canvas: { width: number; height: number }
  titleConfig: MuseSubtitleInput['titleConfig']
  captionStyle?: Record<string, unknown>
  layoutPolicy?: Record<string, unknown>
}) => Promise<Array<{ id: string; videoPath: string; coverImagePath?: string; subtitleJobId?: string }>>

/** 1080 px on the short side, same shape as the video: overlay titles are laid out on this canvas. */
export function subtitleCanvas(width: number, height: number) {
  const ratio = width > 0 && height > 0 ? width / height : 9 / 16
  const even = (value: number) => Math.round(value / 2) * 2
  return ratio <= 1 ? { width: 1080, height: even(1080 / ratio) } : { width: even(1080 * ratio), height: 1080 }
}

/** Everything done to finished videos: covers, subtitles, export, deletion. None of it touches Muse. */
export function createMuseResults(options: {
  list: () => Promise<MuseJob[]>
  patch: (id: string, apply: (job: MuseJob) => Partial<MuseJob>, log?: string, level?: 'info' | 'success' | 'error') => Promise<void>
  removeJob: (id: string) => Promise<void>
  makePoster: (videoPath: string, posterPath: string) => Promise<void>
  renderSubtitles: MuseSubtitleRender
}) {
  const busy = new Set<string>()
  const posterTried = new Set<string>()
  let posterQueue: Promise<unknown> = Promise.resolve()

  const removeFiles = async (...paths: Array<string | undefined>) => {
    for (const path of paths) if (path) await rm(path, { force: true }).catch(() => undefined)
  }
  const completed = async (ids: string[]) => {
    const wanted = new Set((Array.isArray(ids) ? ids : []).map(String))
    return (await options.list()).filter((job) => wanted.has(job.id) && job.status === 'completed' && job.result && existsSync(job.result.videoPath))
  }
  async function hold<T>(ids: string[], work: () => Promise<T>): Promise<T> {
    if (ids.some((id) => busy.has(id))) throw new Error('有视频正在处理中，请稍候')
    for (const id of ids) busy.add(id)
    try {
      return await work()
    } finally {
      for (const id of ids) busy.delete(id)
    }
  }

  return {
    /** Covers are made in the background, once per video and session. */
    queuePosters(jobs: MuseJob[]) {
      for (const job of jobs) {
        if (job.status !== 'completed' || !job.result || job.posterPath || posterTried.has(job.id)) continue
        posterTried.add(job.id)
        const { videoPath } = job.result
        posterQueue = posterQueue.then(async () => {
          const posterPath = join(videoPath, '..', `${basename(videoPath, extname(videoPath))}.jpg`)
          await options.makePoster(videoPath, posterPath)
          if (existsSync(posterPath)) await options.patch(job.id, () => ({ posterPath }))
        }).catch((error) => console.warn('[muse-creative] cover failed', error instanceof Error ? error.message : error))
      }
      return posterQueue
    },

    async addSubtitles(input: MuseSubtitleInput) {
      const config = input.titleConfig || {}
      const hasTitle = config.strategy === 'random_pool'
        ? (config.titlePool || []).some((item) => String(item).trim())
        : String(config.singleText || '').trim()
      if (!hasTitle) throw new Error('请填写字幕标题')
      const jobs = await completed(input.ids)
      if (!jobs.length) throw new Error('请选择已完成的视频')
      return await hold(jobs.map((job) => job.id), async () => {
        const groups = new Map<string, { canvas: { width: number; height: number }; jobs: MuseJob[] }>()
        for (const job of jobs) {
          const canvas = subtitleCanvas(job.result!.width, job.result!.height)
          const key = `${canvas.width}x${canvas.height}`
          const group = groups.get(key) ?? { canvas, jobs: [] }
          group.jobs.push(job)
          groups.set(key, group)
        }
        let done = 0
        let failure = ''
        for (const group of groups.values()) {
          let outputs: Awaited<ReturnType<MuseSubtitleRender>> = []
          try {
            outputs = await options.renderSubtitles({
              // Always from the original, so applying again replaces instead of stacking.
              items: group.jobs.map((job) => ({ id: job.id, videoPath: job.result!.videoPath, title: job.productName || 'Muse创意室', coverImagePath: job.posterPath })),
              canvas: group.canvas,
              titleConfig: config,
              captionStyle: input.captionStyle,
              layoutPolicy: input.layoutPolicy,
            })
          } catch (error) {
            failure = error instanceof Error ? error.message : '字幕生成失败'
          }
          for (const job of group.jobs) {
            const output = outputs.find((item) => item.id === job.id && existsSync(item.videoPath))
            if (!output) {
              await options.patch(job.id, () => ({}), `字幕生成失败${failure ? `：${failure}` : ''}`, 'error')
              continue
            }
            await options.patch(job.id, () => ({
              subtitleVideoPath: output.videoPath,
              subtitleCoverPath: output.coverImagePath,
              subtitleAppliedAt: Date.now(),
              // The exported copy is the older version now.
              exportedAt: undefined,
              exportedVideoPath: undefined,
            }), '已添加字幕', 'success')
            if (job.subtitleVideoPath !== output.videoPath) await removeFiles(job.subtitleVideoPath)
            if (job.subtitleCoverPath !== output.coverImagePath) await removeFiles(job.subtitleCoverPath)
            done += 1
          }
        }
        if (!done) throw new Error(failure || '字幕生成失败，请检查字幕配置')
        return { done, failed: jobs.length - done }
      })
    },

    async revertSubtitles(ids: string[]) {
      const jobs = (await completed(ids)).filter((job) => job.subtitleVideoPath)
      return await hold(jobs.map((job) => job.id), async () => {
        for (const job of jobs) {
          await options.patch(job.id, () => ({ subtitleVideoPath: undefined, subtitleCoverPath: undefined, subtitleAppliedAt: undefined, exportedAt: undefined, exportedVideoPath: undefined }), '已撤销字幕')
          await removeFiles(job.subtitleVideoPath, job.subtitleCoverPath)
        }
        return { done: jobs.length }
      })
    },

    /** Copies; an existing file in the target folder is never overwritten. */
    async exportJobs(input: { ids: string[]; outputDir: string }) {
      const outputDir = String(input.outputDir || '').trim()
      if (!outputDir) throw new Error('请选择导出文件夹')
      const jobs = await completed(input.ids)
      if (!jobs.length) throw new Error('请选择已完成的视频')
      await mkdir(outputDir, { recursive: true })
      return await hold(jobs.map((job) => job.id), async () => {
        for (const job of jobs) {
          const source = job.subtitleVideoPath && existsSync(job.subtitleVideoPath) ? job.subtitleVideoPath : job.result!.videoPath
          const name = `${(job.productName || 'muse').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 60) || 'muse'}-${job.id.slice(0, 8)}`
          let target = join(outputDir, `${name}${extname(source) || '.mp4'}`)
          for (let n = 2; existsSync(target); n += 1) target = join(outputDir, `${name}-${n}${extname(source) || '.mp4'}`)
          await copyFile(source, target)
          await options.patch(job.id, () => ({ exportedAt: Date.now(), exportedVideoPath: target }), `已导出 ${basename(target)}`, 'success')
        }
        return { done: jobs.length, outputDir }
      })
    },

    /** Exported copies stay; queued and running jobs are skipped. */
    async removeMany(ids: string[]) {
      const wanted = new Set((Array.isArray(ids) ? ids : []).map(String))
      const jobs = (await options.list()).filter((job) => wanted.has(job.id) && !['running', 'queued', 'swapping'].includes(job.status))
      return await hold(jobs.map((job) => job.id), async () => {
        for (const job of jobs) {
          await options.removeJob(job.id)
          await removeFiles(job.subtitleVideoPath, job.subtitleCoverPath)
        }
        return { done: jobs.length, skipped: wanted.size - jobs.length }
      })
    },
  }
}
