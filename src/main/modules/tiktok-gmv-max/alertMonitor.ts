import { app, BrowserWindow, Notification } from 'electron'
import { gmvMaxWorkerClient } from './workerClient'

/**
 * Desktop alerts for GMV MAX. Started the first time the GMV MAX page loads; every 15 minutes it asks the worker for
 * alerts not announced yet (ROI under break-even, budget burning too fast, tired creatives) and shows them as
 * system notifications. Turning alerts off in GMV MAX settings stops new ones.
 */
type Alert = { key: string; kind: 'roi_below_floor' | 'budget_overspend' | 'creative_fatigue'; campaignName: string; value: string; threshold?: string }

const FIRST_CHECK_MS = 60_000
const INTERVAL_MS = 15 * 60_000
const MAX_SINGLE = 3
let started = false

const percent = (value?: string) => `${Math.round((Number(value) || 0) * 100)}%`
const COPY = {
  zh: {
    roi_below_floor: (a: Alert) => ['ROI 低于保本线', `${a.campaignName}：近 3 天 ROI ${a.value}，保本需要 ${a.threshold}，正在亏钱`],
    budget_overspend: (a: Alert) => ['预算可能提前花完', `${a.campaignName}：已花 ${percent(a.value)}，按时间应花 ${percent(a.threshold)}`],
    creative_fatigue: (a: Alert) => ['素材疲劳', `${a.campaignName}：${a.value} 条素材效果在下降，建议补充新素材`],
    summary: (count: number) => ['GMV MAX 预警', `还有 ${count} 条预警，打开 GMV MAX 查看`],
  },
  vi: {
    roi_below_floor: (a: Alert) => ['ROI dưới mức hòa vốn', `${a.campaignName}: ROI 3 ngày ${a.value}, cần ${a.threshold} để hòa vốn`],
    budget_overspend: (a: Alert) => ['Ngân sách có thể hết sớm', `${a.campaignName}: đã chi ${percent(a.value)}, theo giờ nên là ${percent(a.threshold)}`],
    creative_fatigue: (a: Alert) => ['Nội dung đang giảm hiệu quả', `${a.campaignName}: ${a.value} nội dung giảm hiệu quả, nên bổ sung mới`],
    summary: (count: number) => ['Cảnh báo GMV MAX', `Còn ${count} cảnh báo, mở GMV MAX để xem`],
  },
  en: {
    roi_below_floor: (a: Alert) => ['ROI below break-even', `${a.campaignName}: 3-day ROI ${a.value}, break-even needs ${a.threshold}`],
    budget_overspend: (a: Alert) => ['Budget may run out early', `${a.campaignName}: ${percent(a.value)} spent, pace expects ${percent(a.threshold)}`],
    creative_fatigue: (a: Alert) => ['Creatives are tiring', `${a.campaignName}: ${a.value} creatives are declining, add new ones`],
    summary: (count: number) => ['GMV MAX alerts', `${count} more alerts, open GMV MAX to see them`],
  },
}

function copy() {
  const locale = app.getLocale().toLowerCase()
  return locale.startsWith('zh') ? COPY.zh : locale.startsWith('vi') ? COPY.vi : COPY.en
}

function openGmvMax() {
  const window = BrowserWindow.getAllWindows()[0]
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  void window.webContents.executeJavaScript("window.location.hash = '#/plugins/tiktok-gmv-max-optimizer'").catch(() => undefined)
}

function show(title: string, body: string) {
  const notification = new Notification({ title, body })
  notification.on('click', openGmvMax)
  notification.show()
}

async function check() {
  if (!Notification.isSupported()) return
  try {
    const alerts = await gmvMaxWorkerClient.call<Alert[]>('takeNewAlerts')
    if (!alerts.length) return
    const text = copy()
    for (const alert of alerts.slice(0, MAX_SINGLE)) {
      const [title, body] = text[alert.kind](alert)
      show(title, body)
    }
    if (alerts.length > MAX_SINGLE) show(...(text.summary(alerts.length - MAX_SINGLE) as [string, string]))
  } catch {
    /* alerts are best effort; the next check retries */
  }
}

export function startGmvMaxAlertMonitor() {
  if (started) return
  started = true
  setTimeout(() => void check(), FIRST_CHECK_MS).unref?.()
  setInterval(() => void check(), INTERVAL_MS).unref?.()
}
