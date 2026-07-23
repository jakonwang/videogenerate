import { videoParserDownloadService } from './service'

export type HermesVideoParserReplyAction = {
  type: 'text'
  text: string
}

function normalizeText(input: string) {
  return String(input || '').trim()
}

function extractShareUrls(text: string) {
  const matches = normalizeText(text).match(/https?:\/\/[^\s<>"']+/gi) || []
  return Array.from(new Set(matches.map((item) => item.trim()).filter(Boolean)))
}

function isVideoDownloadIntent(text: string) {
  const value = normalizeText(text)
  if (!value) return false
  return /(?:\u4e0b\u8f7d\u89c6\u9891|\u4e0b\u8f7d\u6296\u97f3\u89c6\u9891|\u4e0b\u8f7dtiktok\u89c6\u9891|\u89e3\u6790\u89c6\u9891|\u4fdd\u5b58\u89c6\u9891|download\s+video|download\s+tiktok)/i.test(value)
}

function buildSuccessText(input: {
  total: number
  successCount: number
  failedCount: number
}) {
  const { total, successCount, failedCount } = input
  if (successCount > 0 && failedCount === 0) {
    return `\u5df2\u52a0\u5165\u89c6\u9891\u5e93\uff0c\u5171 ${successCount} \u6761\u3002\u4f60\u73b0\u5728\u53ef\u4ee5\u5230 Video Parser Download \u63d2\u4ef6\u91cc\u67e5\u770b\u548c\u540e\u7eed\u62c6\u5206\u3002`
  }
  if (successCount > 0) {
    return `\u5df2\u52a0\u5165\u89c6\u9891\u5e93 ${successCount} \u6761\uff0c\u5931\u8d25 ${failedCount} \u6761\u3002\u53ef\u5728 Video Parser Download \u63d2\u4ef6\u91cc\u67e5\u770b\u6210\u529f\u7ed3\u679c\uff0c\u5e76\u91cd\u8bd5\u5931\u8d25\u94fe\u63a5\u3002`
  }
  return `\u672c\u6b21\u5171\u8bc6\u522b ${total} \u6761\u94fe\u63a5\uff0c\u4f46\u90fd\u672a\u6210\u529f\u5165\u5e93\u3002\u8bf7\u68c0\u67e5\u5206\u4eab\u94fe\u63a5\u662f\u5426\u6709\u6548\uff0c\u6216\u786e\u8ba4 TikHub Key \u5df2\u5728\u8bbe\u7f6e\u4e2d\u586b\u5199\u3002`
}

function buildErrorText(message: string) {
  const detail = normalizeText(message) || '\u672a\u77e5\u9519\u8bef'
  return `\u4e0b\u8f7d\u89c6\u9891\u5931\u8d25\uff1a${detail}`
}

export async function tryHandleHermesVideoParserText(input: {
  text?: string
  libraryUserId?: string
}): Promise<{ matched: boolean; actions: HermesVideoParserReplyAction[] }> {
  const text = normalizeText(input.text || '')
  if (!text) return { matched: false, actions: [] }

  const shareUrls = extractShareUrls(text)
  if (!shareUrls.length || !isVideoDownloadIntent(text)) {
    return { matched: false, actions: [] }
  }

  try {
    const result = await videoParserDownloadService.importShareUrls({
      userId: normalizeText(input.libraryUserId || '') || 'desktop-local',
      shareUrls,
    })
    const summaryText = buildSuccessText({
      total: shareUrls.length,
      successCount: Array.isArray(result.items) ? result.items.length : 0,
      failedCount: Array.isArray(result.errors) ? result.errors.length : 0,
    })
    const errorLines = Array.isArray(result.errors)
      ? result.errors
          .slice(0, 3)
          .map(
            (item) =>
              `\u5931\u8d25\u94fe\u63a5\uff1a${item.shareUrl}\n\u539f\u56e0\uff1a${item.message}`,
          )
      : []
    return {
      matched: true,
      actions: [
        {
          type: 'text',
          text: [summaryText, ...errorLines].filter(Boolean).join('\n\n'),
        },
      ],
    }
  } catch (error) {
    return {
      matched: true,
      actions: [
        {
          type: 'text',
          text: buildErrorText(String((error as Error)?.message || error || '')),
        },
      ],
    }
  }
}
