/**
 * 查一条真实视频任务的原始返回（排查平台报错用）。Key 从本地后台数据库读，不打印。
 *   npx tsx scripts/real-video-task-raw.ts services/cloud/data/cloud.sqlite <平台 gaorui|xibapi|grsai> <taskId>
 */
async function main() {
  const [dbPath, platform, taskId] = process.argv.slice(2)
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(dbPath, { readOnly: true })
  const row = db.prepare("SELECT value FROM app_config WHERE key LIKE '%managed%' LIMIT 1").get() as { value?: string } | undefined
  db.close()
  const p = JSON.parse(String(row?.value || '{}')).platforms?.[platform]
  if (!p?.apiKey) throw new Error(`本地后台没有 ${platform} 的 Key`)
  const base = String(p.baseUrl || (platform === 'grsai' ? 'https://grsaiapi.com' : '')).replace(/\/+$/, '')
  const url = platform === 'grsai' ? `${base}/v1/api/result?id=${encodeURIComponent(taskId)}` : `${base}/v1/videos/${encodeURIComponent(taskId)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${p.apiKey}` } })
  console.log(res.status, (await res.text()).slice(0, 2000))
}
main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
