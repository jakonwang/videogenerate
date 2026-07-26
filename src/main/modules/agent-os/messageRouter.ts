import type { AgentAttachment } from './types'

export type AgentMessageRoute =
  | { kind: 'direct'; responseCode: 'greeting' | 'capabilities' | 'thanks' | 'assistant_unavailable' }
  | { kind: 'artifact_query'; artifactType: 'live_photo_video' }
  | { kind: 'clarification'; responseCode: 'output_directory' | 'publish_account' | 'source_video' | 'source_artifact' }
  | { kind: 'workflow' }

function text(value: unknown) {
  return String(value ?? '').trim()
}

function hasVideoAttachment(attachments: AgentAttachment[]) {
  return attachments.some((item) => item.mediaType === 'video')
}

export function routeAgentMessage(input: {
  content: string
  attachments: AgentAttachment[]
  context: Record<string, unknown>
}): AgentMessageRoute {
  const prompt = text(input.content).toLowerCase()
  const compact = prompt.replace(/[\s,.!?;:'"`~()\[\]{}<>\-_/\\]+/g, '')

  if (/^(hi|hello|hey|\u4f60\u597d|\u60a8\u597d|\u65e9\u4e0a\u597d|\u4e0b\u5348\u597d|\u665a\u4e0a\u597d)$/.test(compact)) {
    return { kind: 'direct', responseCode: 'greeting' }
  }
  if (/^(thanks|thankyou|\u8c22\u8c22|\u8c22\u4e86|\u597d\u7684|\u660e\u767d\u4e86)$/.test(compact)) {
    return { kind: 'direct', responseCode: 'thanks' }
  }
  if (/(what can you do|your capabilities|\u4f60\u80fd\u505a\u4ec0\u4e48|\u6709\u4ec0\u4e48\u529f\u80fd|\u4f60\u4f1a\u4ec0\u4e48)/.test(prompt)) {
    return { kind: 'direct', responseCode: 'capabilities' }
  }

  const asksToView = /(show|view|open|send me|latest|recent|\u770b|\u67e5\u770b|\u6253\u5f00|\u53d1\u7ed9|\u7ed9\u6211\u770b|\u6700\u8fd1|\u6700\u65b0)/.test(prompt)
  const asksForLivePhoto = /(live\s*photo|\u52a8\u6001\u7167\u7247|\u5b9e\u51b5\u7167\u7247)/.test(prompt)
  if (asksToView && asksForLivePhoto) {
    return { kind: 'artifact_query', artifactType: 'live_photo_video' }
  }

  const hasOutputDirectory = Boolean(text(input.context.outputDir) || text(input.context.outputDirectory))
  const asksToExport = /(export|download|save to|\u5bfc\u51fa|\u4e0b\u8f7d|\u4fdd\u5b58\u5230)/.test(prompt)
  if (asksToExport && !hasOutputDirectory) {
    return { kind: 'clarification', responseCode: 'output_directory' }
  }
  const hasSourceArtifact = input.attachments.length > 0 || (Array.isArray(input.context.artifactPaths) && input.context.artifactPaths.some((item) => text(item)))
  if (asksToExport && !hasSourceArtifact) {
    return { kind: 'clarification', responseCode: 'source_artifact' }
  }

  const hasPublishAccount = Boolean(
    text(input.context.publishAccountId) || text(input.context.targetAccount) || text(input.context.accountId),
  )
  if (/(publish|post to|\u53d1\u5e03|\u4e0a\u4f20\u5230)/.test(prompt) && !hasPublishAccount) {
    return { kind: 'clarification', responseCode: 'publish_account' }
  }

  const hasSourceVideo = hasVideoAttachment(input.attachments) || Boolean(
    text(input.context.referenceVideoPath) ||
    text(input.context.sourceVideoPath) ||
    (Array.isArray(input.context.videoPaths) && input.context.videoPaths.some((item) => text(item))),
  )
  const needsSourceVideo = /(subtitle|material|clone|replicate|publish|post to|\u5b57\u5e55|\u7d20\u6750|\u590d\u523b|\u53c2\u8003\u89c6\u9891|\u53d1\u5e03|\u4e0a\u4f20\u5230)/.test(prompt)
  if (needsSourceVideo && !hasSourceVideo) {
    return { kind: 'clarification', responseCode: 'source_video' }
  }

  return { kind: 'workflow' }
}
