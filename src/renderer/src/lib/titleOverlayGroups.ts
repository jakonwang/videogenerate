/**
 * 画面标题「多组候选」：与主进程 random 约定一致——textPool 每项为一组字符串「首行标题 + 换行 + 符号区（可多行）」。
 */

export type TitleOverlayGroupRow = { title: string; symbol: string }

export function poolEntryToGroup(entry: string): TitleOverlayGroupRow {
  const s = String(entry ?? '').replace(/\r\n/g, '\n')
  const i = s.indexOf('\n')
  if (i < 0) return { title: s.trim(), symbol: '' }
  return { title: s.slice(0, i).trim(), symbol: s.slice(i + 1).trimEnd() }
}

export function groupToPoolEntry(g: TitleOverlayGroupRow): string {
  const title = String(g.title ?? '').trim()
  const sym = String(g.symbol ?? '').replace(/\r\n/g, '\n').trimEnd()
  if (!title && !sym.trim()) return ''
  if (!sym.trim()) return title
  return `${title}\n${sym}`
}

/** 将历史/粘贴产生的「一条里多套」按空行拆开，再转成行编辑结构 */
export function migratePoolToGroupRows(pool: string[] | undefined): TitleOverlayGroupRow[] {
  const flat: string[] = []
  for (const raw of pool ?? []) {
    const s = String(raw ?? '').replace(/\r\n/g, '\n').trim()
    if (!s) continue
    if (/\n\s*\n/.test(s)) {
      flat.push(...s.split(/\n\s*\n+/).map((x) => x.trim()).filter((x) => x.length > 0))
    } else {
      flat.push(s)
    }
  }
  const rows = flat.map(poolEntryToGroup).filter((g) => g.title.trim() || g.symbol.trim())
  return rows.length ? rows : [{ title: '', symbol: '' }]
}

export function groupRowsToPool(rows: TitleOverlayGroupRow[]): string[] {
  const out: string[] = []
  for (const g of rows) {
    const e = groupToPoolEntry(g)
    if (e) out.push(e)
  }
  return out
}
