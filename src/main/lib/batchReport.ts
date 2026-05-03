import { appendFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

type ReportRow = {
  outPath: string
  hookAssetName: string
  ttsText: string
  bgmFileName: string
  renderMs: number
}

function yyyymmdd(ts = Date.now()) {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function csvEscape(v: unknown) {
  const s = String(v ?? '')
  // RFC4180-ish: wrap in quotes if needed, escape quotes by doubling
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function ensureEndsWithNewline(s: string) {
  return s.endsWith('\n') ? s : s + '\n'
}

const HEADER = ['output_file', 'hook_asset', 'tts_text', 'bgm_file', 'render_ms'].join(',') + '\n'
const UTF8_BOM = '\ufeff'

// 单进程内串行化写入，避免并发写导致重复表头/交叉行
const writeLocks = new Map<string, Promise<void>>()

export function resolveBatchReportPath(outDir: string, ts = Date.now()) {
  const name = `Video_Batch_Report_${yyyymmdd(ts)}.csv`
  return join(outDir, name)
}

export async function appendBatchReportRow(outDir: string, row: ReportRow): Promise<string> {
  const reportPath = resolveBatchReportPath(outDir)

  const prev = writeLocks.get(reportPath) ?? Promise.resolve()
  const next = prev
    .catch(() => void 0)
    .then(async () => {
      await mkdir(outDir, { recursive: true })
      let exists = false
      try {
        const st = await stat(reportPath)
        exists = st.isFile() && st.size > 0
      } catch {
        exists = false
      }
      if (!exists) {
        // 首次创建：BOM + Header
        await writeFile(reportPath, UTF8_BOM + HEADER, { encoding: 'utf8' })
      }

      const outFile = basename(row.outPath)
      const line =
        [
          csvEscape(outFile),
          csvEscape(row.hookAssetName),
          csvEscape(row.ttsText),
          csvEscape(row.bgmFileName),
          csvEscape(Math.max(0, Math.round(row.renderMs || 0))),
        ].join(',') + '\n'
      await appendFile(reportPath, ensureEndsWithNewline(line), { encoding: 'utf8' })
    })
    .finally(() => {
      // 清理锁：仅当当前链是 map 中最新的
      if (writeLocks.get(reportPath) === next) writeLocks.delete(reportPath)
    })

  writeLocks.set(reportPath, next)
  await next
  return reportPath
}

