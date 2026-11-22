/**
 * Wording for shop analysis findings in every app language. Used by the 店铺 page, desktop
 * notifications and the Feishu morning card, so all three say the same thing.
 */
import type { Finding, MorningReport, ShopHealthIndicator } from './shopAnalysis'

export type ReportLang = 'zh-CN' | 'en-US' | 'vi-VN'

type Dict = {
  driver: Record<string, string>
  channel: Record<string, string>
  indicator: Record<string, string>
  finding: Record<string, (p: Record<string, string | number>, d: Dict) => string>
  action: Record<string, string>
  report: { title: string; yesterday: string; vsLastWeek: string; week: string; noData: string; open: string; profit: string; summary: (shops: number, problems: number) => string }
}

const money = (value: unknown) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0)

const ZH: Dict = {
  driver: { visitors: '访客', conversion: '转化率', perBuyer: '每个买家花的钱' },
  channel: { liveGmv: '直播', videoGmv: '短视频', cardGmv: '商品卡' },
  indicator: {
    compute_shop_gne_pre_cot_fast_dispatch_rate_s37d_e8d: '24 小时极速发货率',
    compute_shop_gne_fast_dispatch_rate_s37d_e8d: '快速发货率',
    compute_non_fbt_late_dispatch_s7d_e1d: '延迟发货率',
    compute_shop_liable_cancel_rate_by_seller_s14d_e8d: '卖家原因取消率',
    compute_non_fbt_late_dispatch_instant_s7d_e1d: '极速单延迟发货率',
    compute_non_fbt_late_dispatch_sameday_s7d_e1d: '当日达延迟发货率',
    seller_fault_negative_review_rate: '卖家原因差评率',
    seller_service_issue_negative_review_rate: '服务原因差评率',
    compute_seller_fault_quality_refund_rate_s30d_e1d: '卖家原因退款退货率',
    user_12h_valid_mcs_reply_rate_30d: '12 小时客服回复率',
    IMART_hour_30d: '平均回复时长',
    seller_im_csat_30d: '客服聊天满意度',
  },
  finding: {
    gmvDayDown: (p, d) => `昨天 GMV 比上周同一天 ${p.change}，主要是${d.driver[p.driver]} ${p.driverChange}`,
    gmvDayUp: (p, d) => `昨天 GMV 比上周同一天 ${p.change}，主要靠${d.driver[p.driver]} ${p.driverChange}`,
    gmvWeekDown: (p, d) => `近 7 天 GMV 比前 7 天 ${p.change}，主要是${d.driver[p.driver]} ${p.driverChange}`,
    gmvWeekUp: (p, d) => `近 7 天 GMV 比前 7 天 ${p.change}，主要靠${d.driver[p.driver]} ${p.driverChange}`,
    conversionDown: (p) => `访客没少，但转化率掉了 ${p.change}（现在 ${p.value}）`,
    affiliateHeavy: (p) => `${p.share} 的 GMV 来自达人，自营直播和视频只占 ${p.own}，太依赖达人`,
    channelDown: (p, d) => `${d.channel[p.channel]} GMV 比前 7 天 ${p.change}（占 ${p.share}）`,
    channelUp: (p, d) => `${d.channel[p.channel]} GMV 比前 7 天 ${p.change}（占 ${p.share}）`,
    skuOut: (p) => `${p.code} 已售罄，按之前的销量每天少卖约 ${money(p.perDay)}`,
    skuUrgent: (p) => `${p.code} 只够卖 ${p.days} 天，建议补 ${p.qty} 件`,
    skuHot: (p) => `${p.code} 是爆款，近 7 天卖了 ${p.units} 件（${p.change}）`,
    healthFail: (p, d) => `${d.indicator[String(p.indicator)] || p.title} 不达标：${fmtIndicator(Number(p.value), Number(p.unit), 'zh')}，要求 ${opText(String(p.indicator), Number(p.target), Number(p.unit), 'zh')}`,
    violationScore: (p) => `店铺违规分 ${p.score} 分，尽快处理`,
    urgentShip: (p) => `${p.n} 个订单快超时没发货（待发货共 ${p.total}）`,
    urgentReturns: (p) => `${p.n} 个退货退款快超时（待处理共 ${p.total}）`,
    negativeReviews: (p) => `有 ${p.n} 条新差评待回复`,
    allGood: () => '一切正常，没有需要马上处理的问题',
    profitNegative: (p) => `近 7 天在亏钱：预估利润 ${money(p.profit)}（利润率 ${p.margin}）`,
    profitLow: (p) => `近 7 天利润率只有 ${p.margin}`,
  },
  action: {
    traffic: '流量少了：多发视频、找达人带货、看看 GMV Max 投放',
    keepTraffic: '流量涨了：趁热多发内容、加投放',
    conversion: '转化差了：检查价格和优惠、商品评价、爆款是否断货',
    keepConversion: '转化提高了：记下这次改了什么',
    perBuyer: '买家花得少了：看看是不是低价款卖得多、优惠给太多',
    keepPerBuyer: '客单价提高了：组合装、加购在起作用',
    ownContent: '多做自营直播和视频，减少对达人的依赖',
    restock: '去「销售与库存」记入库或安排补货',
    pushHot: '给爆款加素材、加投放',
    adCost: '广告费占比太高：看 GMV Max 的 ROI，停掉亏钱的计划',
    margin: '检查成本价和售价、优惠力度，算一下每单还赚不赚钱',
  },
  report: {
    title: 'Klipmill 店铺早报',
    yesterday: '昨天 GMV',
    vsLastWeek: '比上周同日',
    week: '近 7 天',
    noData: '没有昨天的数据（可能还没同步或登录失效）',
    open: '打开 Klipmill → 店铺 查看详情',
    profit: '近 7 天利润',
    summary: (shops, problems) => (problems ? `${shops} 个店铺，${problems} 件事要处理` : `${shops} 个店铺，一切正常`),
  },
}

const EN: Dict = {
  driver: { visitors: 'visitors', conversion: 'conversion', perBuyer: 'spend per buyer' },
  channel: { liveGmv: 'LIVE', videoGmv: 'Video', cardGmv: 'Product card' },
  indicator: {
    compute_shop_gne_pre_cot_fast_dispatch_rate_s37d_e8d: '24h fast dispatch rate',
    compute_shop_gne_fast_dispatch_rate_s37d_e8d: 'Fast dispatch rate',
    compute_non_fbt_late_dispatch_s7d_e1d: 'Late dispatch rate',
    compute_shop_liable_cancel_rate_by_seller_s14d_e8d: 'Seller-fault cancellation rate',
    compute_non_fbt_late_dispatch_instant_s7d_e1d: 'Late dispatch rate (instant)',
    compute_non_fbt_late_dispatch_sameday_s7d_e1d: 'Late dispatch rate (same day)',
    seller_fault_negative_review_rate: 'Seller-fault negative review rate',
    seller_service_issue_negative_review_rate: 'Service negative review rate',
    compute_seller_fault_quality_refund_rate_s30d_e1d: 'Seller-fault return/refund rate',
    user_12h_valid_mcs_reply_rate_30d: '12h chat reply rate',
    IMART_hour_30d: 'Average reply time',
    seller_im_csat_30d: 'Chat satisfaction',
  },
  finding: {
    gmvDayDown: (p, d) => `Yesterday's GMV ${p.change} vs the same day last week, mostly ${d.driver[p.driver]} ${p.driverChange}`,
    gmvDayUp: (p, d) => `Yesterday's GMV ${p.change} vs the same day last week, mostly ${d.driver[p.driver]} ${p.driverChange}`,
    gmvWeekDown: (p, d) => `7-day GMV ${p.change} vs the previous 7 days, mostly ${d.driver[p.driver]} ${p.driverChange}`,
    gmvWeekUp: (p, d) => `7-day GMV ${p.change} vs the previous 7 days, mostly ${d.driver[p.driver]} ${p.driverChange}`,
    conversionDown: (p) => `Visitors held but conversion fell ${p.change} (now ${p.value})`,
    affiliateHeavy: (p) => `${p.share} of GMV comes from creators; own LIVE and video only ${p.own}`,
    channelDown: (p, d) => `${d.channel[p.channel]} GMV ${p.change} vs the previous 7 days (${p.share} of GMV)`,
    channelUp: (p, d) => `${d.channel[p.channel]} GMV ${p.change} vs the previous 7 days (${p.share} of GMV)`,
    skuOut: (p) => `${p.code} is sold out; about ${money(p.perDay)} of sales lost per day`,
    skuUrgent: (p) => `${p.code} lasts ${p.days} days; restock ${p.qty}`,
    skuHot: (p) => `${p.code} is a best seller: ${p.units} sold in 7 days (${p.change})`,
    healthFail: (p, d) => `${d.indicator[String(p.indicator)] || p.title} below target: ${fmtIndicator(Number(p.value), Number(p.unit), 'en')}, required ${opText(String(p.indicator), Number(p.target), Number(p.unit), 'en')}`,
    violationScore: (p) => `Violation score ${p.score}; act now`,
    urgentShip: (p) => `${p.n} orders about to miss the dispatch deadline (${p.total} to ship)`,
    urgentReturns: (p) => `${p.n} returns about to time out (${p.total} pending)`,
    negativeReviews: (p) => `${p.n} new negative reviews to answer`,
    allGood: () => 'All good; nothing needs attention now',
    profitNegative: (p) => `Losing money over 7 days: estimated profit ${money(p.profit)} (margin ${p.margin})`,
    profitLow: (p) => `7-day margin is only ${p.margin}`,
  },
  action: {
    traffic: 'Less traffic: post more videos, work with creators, check GMV Max',
    keepTraffic: 'More traffic: post more and raise ads while it lasts',
    conversion: 'Lower conversion: check price and promos, reviews, best sellers out of stock',
    keepConversion: 'Conversion improved: note what changed',
    perBuyer: 'Buyers spend less: cheap items or promos may dominate',
    keepPerBuyer: 'Spend per buyer is up: bundles and add-ons work',
    ownContent: 'Grow your own LIVE and videos to depend less on creators',
    restock: 'Record a delivery in Sales & Inventory or order stock',
    pushHot: 'Give the best seller more content and ad budget',
    adCost: 'Ads eat too much: check GMV Max ROI and stop losing campaigns',
    margin: 'Check cost and selling prices and discounts; is each order still profitable?',
  },
  report: {
    title: 'Klipmill shop report',
    yesterday: "Yesterday's GMV",
    vsLastWeek: 'vs same day last week',
    week: 'Last 7 days',
    noData: 'No data for yesterday (not synced or login expired)',
    open: 'Open Klipmill → Shops for details',
    profit: '7-day profit',
    summary: (shops, problems) => (problems ? `${shops} shops, ${problems} things to handle` : `${shops} shops, all good`),
  },
}

const VI: Dict = {
  driver: { visitors: 'khách truy cập', conversion: 'tỷ lệ chuyển đổi', perBuyer: 'chi tiêu mỗi người mua' },
  channel: { liveGmv: 'LIVE', videoGmv: 'Video', cardGmv: 'Thẻ sản phẩm' },
  indicator: {
    user_12h_valid_mcs_reply_rate_30d: 'Tỷ lệ trả lời trong 12 giờ',
    IMART_hour_30d: 'Thời gian phản hồi trung bình',
    seller_im_csat_30d: 'Tỷ lệ hài lòng qua chat',
  },
  finding: {
    gmvDayDown: (p, d) => `GMV hôm qua ${p.change} so với cùng ngày tuần trước, chủ yếu do ${d.driver[p.driver]} ${p.driverChange}`,
    gmvDayUp: (p, d) => `GMV hôm qua ${p.change} so với cùng ngày tuần trước, chủ yếu nhờ ${d.driver[p.driver]} ${p.driverChange}`,
    gmvWeekDown: (p, d) => `GMV 7 ngày ${p.change} so với 7 ngày trước, chủ yếu do ${d.driver[p.driver]} ${p.driverChange}`,
    gmvWeekUp: (p, d) => `GMV 7 ngày ${p.change} so với 7 ngày trước, chủ yếu nhờ ${d.driver[p.driver]} ${p.driverChange}`,
    conversionDown: (p) => `Khách truy cập không giảm nhưng tỷ lệ chuyển đổi giảm ${p.change} (hiện ${p.value})`,
    affiliateHeavy: (p) => `${p.share} GMV đến từ nhà sáng tạo, LIVE và video tự bán chỉ ${p.own}`,
    channelDown: (p, d) => `GMV ${d.channel[p.channel]} ${p.change} so với 7 ngày trước (chiếm ${p.share})`,
    channelUp: (p, d) => `GMV ${d.channel[p.channel]} ${p.change} so với 7 ngày trước (chiếm ${p.share})`,
    skuOut: (p) => `${p.code} đã hết hàng, mỗi ngày mất khoảng ${money(p.perDay)} doanh thu`,
    skuUrgent: (p) => `${p.code} chỉ đủ bán ${p.days} ngày, nên nhập ${p.qty}`,
    skuHot: (p) => `${p.code} đang bán chạy: 7 ngày bán ${p.units} (${p.change})`,
    healthFail: (p, d) => `${d.indicator[String(p.indicator)] || p.title} chưa đạt: ${fmtIndicator(Number(p.value), Number(p.unit), 'vi')}, yêu cầu ${opText(String(p.indicator), Number(p.target), Number(p.unit), 'vi')}`,
    violationScore: (p) => `Điểm vi phạm ${p.score}, cần xử lý ngay`,
    urgentShip: (p) => `${p.n} đơn sắp trễ hạn gửi hàng (cần gửi ${p.total})`,
    urgentReturns: (p) => `${p.n} yêu cầu trả hàng sắp quá hạn (chờ xử lý ${p.total})`,
    negativeReviews: (p) => `${p.n} đánh giá tiêu cực mới cần trả lời`,
    allGood: () => 'Mọi thứ ổn, không có việc cần xử lý ngay',
    profitNegative: (p) => `7 ngày qua đang lỗ: lợi nhuận ước tính ${money(p.profit)} (biên ${p.margin})`,
    profitLow: (p) => `Biên lợi nhuận 7 ngày chỉ ${p.margin}`,
  },
  action: {
    traffic: 'Lưu lượng giảm: đăng thêm video, hợp tác nhà sáng tạo, xem GMV Max',
    keepTraffic: 'Lưu lượng tăng: tranh thủ đăng thêm, tăng quảng cáo',
    conversion: 'Chuyển đổi giảm: kiểm tra giá, khuyến mãi, đánh giá, hàng bán chạy hết hàng',
    keepConversion: 'Chuyển đổi tăng: ghi lại thay đổi vừa làm',
    perBuyer: 'Người mua chi ít hơn: có thể hàng giá rẻ hoặc khuyến mãi quá nhiều',
    keepPerBuyer: 'Chi tiêu mỗi người mua tăng: combo và mua kèm hiệu quả',
    ownContent: 'Tăng LIVE và video tự bán để bớt phụ thuộc nhà sáng tạo',
    restock: 'Ghi nhập kho trong Bán hàng & Tồn kho hoặc đặt thêm hàng',
    pushHot: 'Thêm nội dung và ngân sách quảng cáo cho hàng bán chạy',
    adCost: 'Chi phí quảng cáo quá cao: xem ROI GMV Max, dừng chiến dịch lỗ',
    margin: 'Kiểm tra giá vốn, giá bán và khuyến mãi; mỗi đơn còn lãi không?',
  },
  report: {
    title: 'Báo cáo cửa hàng Klipmill',
    yesterday: 'GMV hôm qua',
    vsLastWeek: 'so với cùng ngày tuần trước',
    week: '7 ngày qua',
    noData: 'Chưa có dữ liệu hôm qua (chưa đồng bộ hoặc hết hạn đăng nhập)',
    open: 'Mở Klipmill → Cửa hàng để xem chi tiết',
    profit: 'Lợi nhuận 7 ngày',
    summary: (shops, problems) => (problems ? `${shops} cửa hàng, ${problems} việc cần xử lý` : `${shops} cửa hàng, mọi thứ ổn`),
  },
}

const DICTS: Record<ReportLang, Dict> = { 'zh-CN': ZH, 'en-US': EN, 'vi-VN': VI }

function dict(lang: string) {
  return DICTS[lang as ReportLang] || ZH
}

export function fmtIndicator(value: number, unit: number, lang: 'zh' | 'en' | 'vi') {
  if (!Number.isFinite(value)) return '—'
  if (unit === 202) return lang === 'zh' ? `${value.toFixed(1)} 小时` : lang === 'vi' ? `${value.toFixed(1)} giờ` : `${value.toFixed(1)} h`
  return `${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`
}

function opText(_key: string, target: number, unit: number, lang: 'zh' | 'en' | 'vi') {
  return fmtIndicator(target, unit, lang)
}

export function indicatorLabel(indicator: Pick<ShopHealthIndicator, 'key' | 'title'>, lang: string) {
  // The platform title is already in the backend language (Vietnamese for VN shops).
  return dict(lang).indicator[indicator.key] || indicator.title
}

export function findingText(finding: Finding, lang: string) {
  const d = dict(lang)
  const render = d.finding[finding.key] || ZH.finding[finding.key]
  return render ? render(finding.params, d) : finding.key
}

export function actionText(finding: Finding, lang: string) {
  return finding.action ? dict(lang).action[finding.action] || '' : ''
}

const ICON: Record<string, string> = { error: '🔴', warning: '🟠', growth: '📈', ok: '🟢' }

/** Feishu interactive card for the morning report. */
export function buildReportCard(report: MorningReport, lang = 'zh-CN', currency = '') {
  const d = dict(lang)
  const problems = report.shops.reduce((total, shop) => total + shop.analysis.findings.filter((item) => item.level === 'error' || item.level === 'warning').length, 0)
  const elements: Array<Record<string, unknown>> = [{ tag: 'div', text: { tag: 'lark_md', content: `**${d.report.summary(report.shops.length, problems)}**` } }]
  for (const shop of report.shops) {
    const a = shop.analysis
    const head = a.yesterday
      ? `**${shop.name}** · ${d.report.yesterday} ${money(a.yesterday.gmv)}${currency}${a.gmvChangeDay !== undefined ? `（${d.report.vsLastWeek} ${pctText(a.gmvChangeDay)}）` : ''} · ${d.report.week} ${money(a.gmv7)}${currency}${a.gmvChange7 !== undefined ? ` ${pctText(a.gmvChange7)}` : ''}${a.profit7 !== undefined ? ` · ${d.report.profit} ${money(a.profit7)}${currency}` : ''}`
      : `**${shop.name}** · ${d.report.noData}`
    const lines = a.findings.slice(0, 8).map((item) => {
      const action = actionText(item, lang)
      return `${ICON[item.level] || '•'} ${findingText(item, lang)}${action ? `\n　　→ ${action}` : ''}`
    })
    elements.push({ tag: 'hr' })
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: [head, ...lines].join('\n') } })
  }
  elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: `${report.date} · ${d.report.open}` }] })
  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: { template: problems ? 'orange' : 'green', title: { tag: 'plain_text', content: d.report.title } },
      elements,
    },
  }
}

/** One-line desktop notification body. */
export function reportNotification(report: MorningReport, lang = 'zh-CN') {
  const d = dict(lang)
  const problems = report.shops.flatMap((shop) => shop.analysis.findings.filter((item) => item.level === 'error' || item.level === 'warning').map((item) => `${shop.name}：${findingText(item, lang)}`))
  return { title: d.report.title, body: [d.report.summary(report.shops.length, problems.length), ...problems.slice(0, 2)].join('\n') }
}

function pctText(value: number) {
  const rounded = Math.round(value * 1000) / 10
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}
