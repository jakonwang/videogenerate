/**
 * Helpers for multi-step pipelines (e.g. the autopilot recipe): later steps pick up the products,
 * reference videos, projects and tasks produced by any earlier step of the same run.
 */
import { existsSync } from 'node:fs'
import type { AgentAdapterContext, AgentArtifact } from './types'

type PipelineContext = Pick<AgentAdapterContext, 'dependencyArtifacts' | 'upstreamArtifacts'>

function text(value: unknown) {
  return String(value ?? '').trim()
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

/** Every artifact produced earlier in the chain; falls back to the direct dependencies. */
export function upstreamArtifactsOf(context: PipelineContext): AgentArtifact[] {
  return context.upstreamArtifacts?.length ? context.upstreamArtifacts : context.dependencyArtifacts
}

/** Explicit product ids first, then products created by earlier steps (research winners, link imports). */
export function pipelineProductIds(input: Record<string, unknown>, context: PipelineContext) {
  const explicit = unique([...strings(input.productIds), text(input.productId)])
  if (explicit.length) return explicit
  return unique(
    upstreamArtifactsOf(context)
      .filter((artifact) => artifact.kind === 'product')
      .map((artifact) => text(artifact.metadata?.productId)),
  )
}

/** Reference videos handed down by an import / discovery step. */
export function pipelineReferenceVideos(context: PipelineContext) {
  const pick = (artifacts: AgentArtifact[]) => unique(
    artifacts
      .filter((artifact) => artifact.kind === 'source_video' && artifact.localPath && existsSync(artifact.localPath))
      .map((artifact) => text(artifact.localPath)),
  )
  const direct = pick(context.dependencyArtifacts)
  return direct.length ? direct : pick(upstreamArtifactsOf(context))
}

/** Content-hub refs (`clone:<id>`, `livephoto:<id>`, `creative:<taskId>`) this run has started. */
export function pipelineContentRefs(context: PipelineContext) {
  const refs: string[] = []
  for (const artifact of upstreamArtifactsOf(context)) {
    const meta = artifact.metadata || {}
    if (artifact.kind === 'project' && text(meta.projectId)) refs.push(`clone:${text(meta.projectId)}`)
    if (artifact.kind === 'task' && text(meta.livePhotoId)) refs.push(`livephoto:${text(meta.livePhotoId)}`)
    if (artifact.kind === 'task' && text(meta.creativeTaskId)) refs.push(`creative:${text(meta.creativeTaskId)}`)
  }
  return unique(refs)
}

/** Refs a review step approved on the user's behalf (autopilot with auto-approval). */
export function pipelineApprovedRefs(context: PipelineContext) {
  return unique(
    upstreamArtifactsOf(context)
      .filter((artifact) => artifact.kind === 'report')
      .flatMap((artifact) => strings(artifact.metadata?.approvedRefs)),
  )
}
