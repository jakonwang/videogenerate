/**
 * 模板可配置多首 BGM，但每条成片只允许 1 个 BGM 文件参与混音。
 * 集中处理 filePaths 扁平化、去重与随机抽取，避免渲染阶段误用多路径。
 */

function flattenPathList(raw: unknown): string[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    const out: string[] = []
    for (const x of raw) {
      out.push(...flattenPathList(x))
    }
    return out
  }
  const s = String(raw).trim()
  return s ? [s] : []
}

/** 从模板 bgm 配置收集候选路径（去重保序） */
export function collectTemplateBgmCandidates(template: { bgm?: unknown }): string[] {
  const bgm = template?.bgm as { filePaths?: unknown; filePath?: unknown } | null | undefined
  if (!bgm || typeof bgm !== 'object') return []

  const parts: string[] = []
  parts.push(...flattenPathList(bgm.filePaths))
  if (typeof bgm.filePath === 'string' && bgm.filePath.trim()) {
    parts.push(bgm.filePath.trim())
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const q = p.trim()
    if (!q || seen.has(q)) continue
    seen.add(q)
    out.push(q)
  }
  return out
}

/** 构建随机方案时：从模板多首 BGM 中随机恰好 1 条 */
export function pickSingleBgmPathFromTemplate(template: { bgm?: unknown }): string | null {
  const c = collectTemplateBgmCandidates(template)
  if (!c.length) return null
  const i = Math.floor(Math.random() * c.length)
  return c[i] ?? null
}

/**
 * 渲染/队列阶段：无论 plan.bgm 是否被错误写成 filePaths 数组，只解析出 1 个文件路径。
 * - 有 filePath 时以 filePath 为准（忽略误入的 filePaths，避免多轨）。
 * - 仅 filePaths 时随机 1 条（兼容异常 plan）。
 */
export function resolveSoleBgmPathForRender(plan: {
  bgm?: { filePath?: string; filePaths?: unknown; volume?: number } | null
}): string | null {
  const bgm = plan.bgm
  if (!bgm || typeof bgm !== 'object') return null

  const fp = typeof bgm.filePath === 'string' ? bgm.filePath.trim() : ''
  const fromPaths = flattenPathList((bgm as { filePaths?: unknown }).filePaths)
    .map((p) => p.trim())
    .filter(Boolean)
  const uniqPaths = [...new Set(fromPaths)]

  if (fp) return fp
  if (!uniqPaths.length) return null
  const i = Math.floor(Math.random() * uniqPaths.length)
  return uniqPaths[i] ?? null
}
