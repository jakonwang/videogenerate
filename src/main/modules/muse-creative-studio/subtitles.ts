import { basename } from 'node:path'
import { runFfmpeg } from '../ffmpeg/runner'
import { createBatchSubtitleJob, runBatchSubtitleJob } from '../web-platform/batchSubtitle'
import { webPlatformRepo } from '../web-platform/repo'
import type { MuseSubtitleRender } from './results'

const USER_ID = 'desktop-muse-creative-studio'

/** Same engine and settings as tk创意室 and the batch subtitle page. */
export const renderMuseSubtitles: MuseSubtitleRender = async (input) => {
  const plugin = await webPlatformRepo.ensurePluginRecord(USER_ID, 'video-batch-subtitle')
  if (plugin.status !== 'installed' || plugin.runtimeState !== 'enabled') {
    await webPlatformRepo.upsertPluginRecord({ ...plugin, status: 'installed', runtimeState: 'enabled' })
  }
  const job = await createBatchSubtitleJob({
    userId: USER_ID,
    name: `Muse Creative Studio ${new Date().toISOString()}`,
    sourceItems: input.items.map((item) => ({
      id: item.id,
      sourceType: 'upload' as const,
      sourceVideoPath: item.videoPath,
      sourceProjectId: item.id,
      sourceProjectTitle: item.title,
      fileName: basename(item.videoPath),
      coverImagePath: item.coverImagePath,
    })),
    subtitleMode: 'static_title',
    subtitleSource: 'manual',
    exportEngine: 'ass_fallback',
    titleRenderMode: 'overlay_image',
    titleConfig: input.titleConfig,
    overlayImageConfig: { ...input.captionStyle, canvasWidth: input.canvas.width, canvasHeight: input.canvas.height },
    captionStyle: input.captionStyle,
    layoutPolicy: input.layoutPolicy,
  })
  const finished = await runBatchSubtitleJob({ userId: USER_ID, jobId: job.id })
  const outputs = (finished.outputs || []).flatMap((output) => output.renderStatus === 'success' && output.outputVideoPath
    ? [{ id: output.sourceItemId, videoPath: output.outputVideoPath, coverImagePath: output.coverImagePath, subtitleJobId: finished.id }]
    : [])
  if (!outputs.length) throw new Error(finished.error || '字幕生成失败，请检查视频编码和字幕配置')
  return outputs
}

export async function makeMusePoster(videoPath: string, posterPath: string) {
  await runFfmpeg({ args: ['-y', '-ss', '0.3', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', posterPath] })
}
