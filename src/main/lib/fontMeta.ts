import * as fontkit from 'fontkit'

export type FontMeta = {
  fileName: string
  absPath: string
  /** 字体族名（ASS Fontname 应填写这个） */
  familyName: string
  /** 可读展示名 */
  displayName: string
}

function safeString(x: unknown): string {
  return String(x ?? '').trim()
}

/**
 * 从字体文件中尽量解析出「族名」。
 * - ASS / libass 依赖族名匹配，而不是文件名
 * - 若解析失败，兜底为文件名（不含后缀），但会提示用户手动修正
 */
export async function tryGetFontFamilyName(absPath: string): Promise<string | null> {
  try {
    // fontkit.open 支持 ttf/otf/ttc/woff2（取决于版本与构建），ttc 返回 collection
    const opened: any = await (fontkit as any).open(absPath)
    const font: any = opened?.fonts?.[0] ?? opened
    const family = safeString(font?.familyName)
    if (family) return family
    const full = safeString(font?.fullName)
    if (full) return full
    return null
  } catch {
    return null
  }
}

