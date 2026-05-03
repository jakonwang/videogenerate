/**
 * 按段位取产品素材列表：先精确键，再忽略大小写匹配 assets 的 key（避免 hook / HOOK 不一致导致「有图无素材」）。
 */
export function getAssetsForProductSegment(
  assets: Record<string, unknown> | undefined,
  segment: string,
): unknown[] {
  if (!assets || typeof assets !== 'object') return []
  const seg = String(segment).trim()
  const direct = assets[seg]
  if (Array.isArray(direct) && direct.length > 0) return direct
  const want = seg.toLowerCase()
  for (const k of Object.keys(assets)) {
    if (String(k).trim().toLowerCase() === want) {
      const v = assets[k]
      return Array.isArray(v) ? v : []
    }
  }
  return []
}

export function segmentHasAssets(
  assets: Record<string, unknown> | undefined,
  segment: string,
): boolean {
  return getAssetsForProductSegment(assets, segment).length > 0
}
