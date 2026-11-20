// Builds the factory-facing Vidloom deck.
// Run: NODE_PATH=<dir with pptxgenjs> node promo-factory/deck/build-deck.cjs
const path = require('path')
const fs = require('fs')
const pptxgen = require('pptxgenjs')
const sharp = require('sharp')

const DIR = __dirname
const IMG = path.join(DIR, 'img')
const OUT = path.join(DIR, '..', 'Vidloom-工厂版产品介绍.pptx')
const PUB = path.join(DIR, '..', 'video', 'public')
const narration = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'narration.json'), 'utf8'))
const say = (id) => (narration.scenes.find((s) => s.id === id)?.lines || []).join('')

const THEME = {
  name: 'Vidloom Factory',
  headFontFace: 'Microsoft YaHei',
  bodyFontFace: 'Microsoft YaHei',
  colors: {dk1: 'EEF4F8', lt1: '05090F', dk2: '8A9AAC', lt2: '0E1724', accent1: '46F897', accent2: '22D3B4', accent3: '4EA8FF', accent4: 'FFB547', accent5: 'FF5F6D', accent6: '9A83FF', hlink: '46F897', folHlink: '22D3B4'},
}
const K = {bg: '05090F', panel: '0E1724', panel2: '132031', line: '223245', text: 'EEF4F8', muted: '8A9AAC', dim: '5B6B7D', green: '46F897', teal: '22D3B4', blue: '4EA8FF', amber: 'FFB547', red: 'FF5F6D', violet: '9A83FF', ink: '03140D'}
const FONT = 'Microsoft YaHei'

const ICON = {
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm9 16-4.3-4.3', box: 'M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7M12 11v10',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9c0-4 4-6 8-6s8 2 8 6', copy: 'M8 8h12v12H8zM4 16V4h12',
  wand: 'M4 20 16 8m-3-3 2-2m4 6 2-2M15 3v3m6 3h-3M18 12l1 2m-5-9-1-2', play: 'M7 4v16l13-8z',
  cut: 'M6 7a3 3 0 1 0 0 .1M6 17a3 3 0 1 0 0 .1M8.5 8.5 20 20M8.5 15.5 20 4', check: 'M5 12.5l4.5 4.5L19 7',
  send: 'M4 12 20 4l-6 16-3-7z', chart: 'M4 20V10m6 10V4m6 16v-8m4 8H2', inbox: 'M3 13l3-8h12l3 8v6H3zm0 0h5l1 3h6l1-3h5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  qr: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h2v2h-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 0h2v2h-2z', sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  rocket: 'M5 15c-1 1-2 4-2 6 2 0 5-1 6-2m-4-4 4 4m-4-4 3-6c3-5 8-6 12-6 0 4-1 9-6 12l-6 3m3-9a1 1 0 1 0 0 .1', stop: 'M6 6h12v12H6z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v10m-3-7h4.5a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3H15', layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5',
  sub: 'M4 5h16v14H4zM7 14h4m2 0h4M7 11h10', stamp: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm-3 9h6', swap: 'M4 8h13l-3-3m6 11H7l3 3',
  image: 'M4 5h16v14H4zm0 11 5-5 4 4 3-3 4 4M15 9a1 1 0 1 0 0 .1', truck: 'M3 6h11v10H3zm11 4h4l3 3v3h-7M7 19a2 2 0 1 0 0-.1M17 19a2 2 0 1 0 0-.1',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zm4 4h4', brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 3 5 3 3 0 0 0 5 1V5a3 3 0 0 0-3-1zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-3 5 3 3 0 0 1-5 1',
  monitor: 'M3 4h18v12H3zm6 16h6m-3-4v4', cloud: 'M7 18a5 5 0 0 1-.5-10A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z',
  factory: 'M3 21V10l6 4V10l6 4V6h6v15zM7 17h2m4 0h2', money: 'M3 6h18v12H3zm9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2', tag: 'M3 12V3h9l9 9-9 9zM8 8a1 1 0 1 0 0 .1', video: 'M3 6h12v12H3zm12 4 6-3v10l-6-3',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  key: 'M14 10a4 4 0 1 0-3.9 4.9L10 15H8v2H6v2H3v-3l7.1-7.1A4 4 0 0 0 14 10z', calendar: 'M4 5h16v15H4zM4 10h16M8 3v4m8-4v4',
}
const iconCache = {}
async function icon(name, color) {
  const key = `${name}-${color}`
  if (!iconCache[key]) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 24 24" fill="none" stroke="#${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${ICON[name]}"/></svg>`
    const buf = await sharp(Buffer.from(svg)).png().toBuffer()
    iconCache[key] = 'image/png;base64,' + buf.toString('base64')
  }
  return iconCache[key]
}

const pres = new pptxgen()
pres.layout = 'LAYOUT_WIDE' // 13.333 x 7.5
pres.theme = {headFontFace: FONT, bodyFontFace: FONT}
pres.title = 'Vidloom 工厂版产品介绍'
pres.author = 'Vidloom'
pres.company = 'Vidloom'

const W = 13.333
const LOGO = path.join(PUB, 'brand.png')
const footer = [
  {image: {x: 0.6, y: 6.98, w: 0.24, h: 0.24, path: LOGO}},
  {text: {text: 'Vidloom · 出海工厂 AI 带货内容系统', options: {x: 0.9, y: 6.95, w: 5, h: 0.3, fontFace: FONT, fontSize: 10, color: K.dim, margin: 0, valign: 'middle'}}},
]
pres.defineSlideMaster({
  title: 'COVER',
  background: {color: K.bg},
  objects: [
    {placeholder: {options: {name: 'title', type: 'title', x: 0.6, y: 2.3, w: 5.9, h: 1.55, fontFace: FONT, fontSize: 42, bold: true, color: K.text, align: 'left', valign: 'top', margin: 0}, text: ''}},
    {placeholder: {options: {name: 'body', type: 'body', x: 0.6, y: 4.0, w: 5.7, h: 1.0, fontFace: FONT, fontSize: 18, color: K.muted, align: 'left', valign: 'top', margin: 0}, text: ''}},
  ],
})
pres.defineSlideMaster({title: 'END', background: {color: K.bg}, objects: []})
pres.defineSlideMaster({
  title: 'CONTENT',
  background: {color: K.bg},
  objects: [
    ...footer,
    {placeholder: {options: {name: 'kicker', type: 'body', x: 0.6, y: 0.42, w: 9, h: 0.32, fontFace: FONT, fontSize: 12, bold: true, color: K.green, charSpacing: 2, margin: 0, valign: 'middle'}, text: ''}},
    {placeholder: {options: {name: 'title', type: 'title', x: 0.6, y: 0.78, w: 12.1, h: 0.75, fontFace: FONT, fontSize: 34, bold: true, color: K.text, align: 'left', margin: 0, valign: 'middle'}, text: ''}},
  ],
  slideNumber: {x: 12.2, y: 6.95, w: 0.55, h: 0.3, fontFace: FONT, fontSize: 10, color: K.dim, align: 'right'},
})

/* ---------- helpers ---------- */
const box = (s, x, y, w, h, o = {}) =>
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {x, y, w, h, rectRadius: o.r ?? 0.12, fill: {color: o.fill ?? K.panel, transparency: o.tr ?? 0}, line: {color: o.line ?? K.line, width: o.lw ?? 0.75}, objectName: o.name})
const txt = (s, text, x, y, w, h, o = {}) =>
  s.addText(text, {x, y, w, h, isTextBox: true, fontFace: FONT, fontSize: o.size ?? 14, color: o.color ?? K.text, bold: !!o.bold, align: o.align ?? 'left', valign: o.valign ?? 'top', margin: o.margin ?? 0, lineSpacingMultiple: o.ls ?? 1.15, charSpacing: o.cs, objectName: o.name, fit: 'none'})
async function iconDot(s, name, x, y, d = 0.5, color = K.green) {
  s.addShape(pres.shapes.OVAL, {x, y, w: d, h: d, fill: {color, transparency: 84}, line: {color, width: 0.75, transparency: 50}})
  s.addImage({data: await icon(name, color), x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52})
}
function content(kicker, title, section) {
  const s = pres.addSlide({masterName: 'CONTENT', sectionTitle: section})
  s.addText(kicker, {placeholder: 'kicker'})
  s.addText(title, {placeholder: 'title'})
  return s
}
function pill(s, text, x, y, w, color = K.green, solid = false, size = 12) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {x, y, w, h: 0.34, rectRadius: 0.17, fill: {color: solid ? color : color, transparency: solid ? 0 : 85}, line: {color, width: 0.75, transparency: solid ? 0 : 40}})
  txt(s, text, x, y, w, 0.34, {size, bold: true, color: solid ? K.ink : color, align: 'center', valign: 'middle'})
}

/* ---------- slides ---------- */
async function build() {
  /* 1 cover */
  pres.addSection({title: '开场'})
  {
    const s = pres.addSlide({masterName: 'COVER', sectionTitle: '开场'})
    s.addImage({path: path.join(PUB, 'hero.png'), x: 6.6, y: 0, w: 6.733, h: 7.5, sizing: {type: 'cover', w: 6.733, h: 7.5}, transparency: 25})
    s.addShape(pres.shapes.RECTANGLE, {x: 6.6, y: 0, w: 6.733, h: 7.5, fill: {color: K.bg, transparency: 45}, line: {color: K.bg, width: 0}})
    s.addImage({path: LOGO, x: 0.6, y: 1.1, w: 0.8, h: 0.8})
    txt(s, 'Vidloom', 1.55, 1.18, 4, 0.64, {size: 32, bold: true, valign: 'middle'})
    s.addText([{text: '一台电脑\n', options: {color: K.text}}, {text: '就是一支带货内容团队', options: {color: K.green}}], {placeholder: 'title'})
    s.addText('专为出海工厂打造的 AI 带货内容系统 —— 选品、出片、发布、投放、复盘，全链路一次打通', {placeholder: 'body'})
    const tags = ['选品', '建商品', '备素材', '出成片', '质检', '发布', '投放', '复盘']
    tags.forEach((t, i) => pill(s, t, 0.6 + i * 0.86, 5.35, 0.76, K.green, i === 3, 12))
    txt(s, '工厂版产品介绍', 0.6, 6.7, 4, 0.35, {size: 12, color: K.dim})
    s.addNotes('开场：' + say('hook') + '\n今天用 20 分钟，带大家看 Vidloom 怎么把工厂的“货”变成 TikTok 上源源不断的“内容”。')
  }

  /* 2 pain */
  {
    const s = content('工厂做 TikTok 的现实', '最缺的不是货，是内容', '开场')
    const cards = [
      ['money', K.amber, '数万元', '/ 月', '养一个内容团队', '编导、摄影、模特、剪辑、投手，一个都不能少，人力成本居高不下'],
      ['clock', K.amber, '1–2', '天', '拍剪一条视频', '约模特、搭场地、拍摄、剪辑、配字幕，新品上视频要排队'],
      ['box', K.red, '100+', 'SKU', '每款都要视频', '工厂款多、上新快，靠人工拍，永远拍不过来'],
      ['chart', K.red, '？', '', '广告费花在哪', '投了 GMV MAX，却看不清哪条视频赚钱、哪条在白烧钱'],
    ]
    for (const [i, c] of cards.entries()) {
      const x = 0.6 + i * 3.08
      box(s, x, 1.95, 2.88, 4.55, {line: c[1], lw: 0.75})
      await iconDot(s, c[0], x + 0.3, 2.25, 0.62, c[1])
      s.addText([{text: c[2], options: {fontSize: 44, bold: true, color: c[1]}}, {text: ' ' + c[3], options: {fontSize: 18, bold: true, color: K.muted}}], {x: x + 0.3, y: 3.15, w: 2.4, h: 0.9, isTextBox: true, fontFace: FONT, margin: 0, valign: 'bottom'})
      txt(s, c[4], x + 0.3, 4.15, 2.4, 0.45, {size: 18, bold: true})
      txt(s, c[5], x + 0.3, 4.7, 2.35, 1.5, {size: 14, color: K.muted, ls: 1.3})
    }
    s.addNotes(say('hook') + '\n' + say('pain'))
  }

  /* 3 answer */
  {
    const s = content('我们的答案', '一台电脑 = 一支带货内容团队', '开场')
    const roles = ['选品专员', '编导', '模特', '摄影', '剪辑', '投手', '运营']
    box(s, 0.6, 2.0, 5.3, 4.5, {fill: K.panel})
    txt(s, '传统团队 · 7 个岗位', 0.95, 2.25, 4.6, 0.4, {size: 18, bold: true, color: K.muted})
    roles.forEach((r, i) => pill(s, r, 0.95 + (i % 3) * 1.55, 2.95 + Math.floor(i / 3) * 0.6, 1.4, K.muted, false, 14))
    txt(s, '每月数万元人力 · 经验在人脑里，人走经验走', 0.95, 5.0, 4.7, 0.9, {size: 14, color: K.red, ls: 1.3})
    txt(s, '→', 6.0, 3.8, 0.8, 0.8, {size: 40, bold: true, color: K.green, align: 'center', valign: 'middle'})
    box(s, 6.9, 2.0, 5.83, 4.5, {fill: K.panel2, line: K.green})
    await iconDot(s, 'monitor', 7.25, 2.3, 0.8, K.green)
    txt(s, 'Vidloom', 8.25, 2.42, 4, 0.56, {size: 28, bold: true, valign: 'middle'})
    const gains = [['AI 替代', '选品分析、脚本、模特、分镜、剪辑、字幕、投放分析'], ['人只做', '定目标、挑结果、做决定——审核收件箱里点「通过」'], ['沉淀在系统', '模板、模特身份包、品牌记忆，换人也不丢']]
    gains.forEach(([a, b], i) => {
      txt(s, a, 7.25, 3.4 + i * 0.95, 1.6, 0.4, {size: 16, bold: true, color: K.green})
      txt(s, b, 8.85, 3.4 + i * 0.95, 3.6, 0.85, {size: 14, color: K.text, ls: 1.25})
    })
    s.addNotes(say('position'))
  }

  /* 4 chain */
  pres.addSection({title: '全链路'})
  {
    const s = content('全链路一张图', '8 个环节，一套系统串起来', '全链路')
    const st = [
      ['search', '选品', ['选品方案', '直播测款']], ['box', '建商品', ['商品库', '8 维度识别']], ['image', '备素材', ['素材库', '链接解析下载', '直播切片', '扫码上传']],
      ['video', '出成片', ['模特库', '爆款复刻', 'tk创意室', '图生视频', '批量混剪', '模板库']], ['inbox', '质检', ['审核收件箱', '品牌记忆']],
      ['send', '发布', ['发布中心', '上架助手']], ['coin', '投放', ['GMV MAX', '达人管理']], ['chart', '复盘', ['数据复盘', '飞书简报', 'AI 建议']],
    ]
    box(s, 0.6, 1.85, 12.13, 0.62, {fill: K.green, line: K.green, tr: 82})
    s.addImage({data: await icon('wand', K.green), x: 0.85, y: 1.98, w: 0.36, h: 0.36})
    txt(s, 'AI 制片人 · 全自动打爆流水线 —— 说一句目标，它按顺序跑完每一站，卡住时停下来告诉你原因', 1.35, 1.85, 11.2, 0.62, {size: 15, bold: true, color: K.green, valign: 'middle'})
    for (const [i, [ic, name, mods]] of st.entries()) {
      const x = 0.6 + i * 1.53
      box(s, x, 2.7, 1.38, 3.45, {fill: i === 3 ? K.panel2 : K.panel, line: i === 3 ? K.green : K.line})
      await iconDot(s, ic, x + 0.44, 2.88, 0.5, K.green)
      txt(s, `${i + 1}`, x + 0.1, 2.8, 0.3, 0.3, {size: 11, bold: true, color: K.dim})
      txt(s, name, x, 3.5, 1.38, 0.42, {size: 17, bold: true, align: 'center'})
      s.addText(mods.map((m, k) => ({text: m, options: {breakLine: k < mods.length - 1}})), {x: x + 0.08, y: 4.0, w: 1.22, h: 2.05, isTextBox: true, fontFace: FONT, fontSize: 11, color: K.muted, align: 'center', valign: 'top', margin: 0, paraSpaceAfter: 4})
      if (i < 7) txt(s, '›', x + 1.36, 4.0, 0.2, 0.4, {size: 18, bold: true, color: K.green, align: 'center'})
    }
    box(s, 0.6, 6.3, 12.13, 0.45, {fill: K.panel})
    txt(s, '复盘数据回流 → 品牌记忆 → 下一批计划自动更优　｜　电脑 · 网页 · 手机 三端云同步', 0.6, 6.3, 12.13, 0.45, {size: 13, color: K.muted, align: 'center', valign: 'middle'})
    s.addNotes('这一页是整个系统的地图。从左到右八个环节：' + st.map((x) => x[1]).join('、') + '。每个环节下面是对应的功能模块。最上面一条是 AI 制片人，它可以把整条链自动串起来跑。复盘的数据会回流到品牌记忆，让下一批内容更好。')
  }

  /* 5 advantages */
  {
    const s = content('为什么选 Vidloom', '六个核心优势', '全链路')
    const adv = [
      ['layers', '全链路，不是单点工具', '选品到复盘 8 个环节在一个系统里，数据和素材不用来回搬'],
      ['box', '以商品为中心', '一份商品档案贯穿所有视频，产品外观、卖点不走样'],
      ['inbox', 'AI 出方案，人做选择', 'AI 批量生成候选，人只需要通过、重做或丢弃'],
      ['eye', '透明可控', '执行前给计划卡：步骤、预计消耗、耗时，审批后才开始'],
      ['brain', '越用越好', '审核偏好、投放结果写入品牌记忆，下一批自动更优'],
      ['cloud', '开箱即用', 'AI 云端开通、按点数计费，三端同步，不用配接口密钥'],
    ]
    for (const [i, [ic, t, d]] of adv.entries()) {
      const x = 0.6 + (i % 3) * 4.08
      const y = 1.95 + Math.floor(i / 3) * 2.35
      box(s, x, y, 3.88, 2.15)
      await iconDot(s, ic, x + 0.3, y + 0.3, 0.6)
      txt(s, t, x + 1.05, y + 0.38, 2.7, 0.45, {size: 18, bold: true, valign: 'middle'})
      txt(s, d, x + 0.3, y + 1.1, 3.3, 0.9, {size: 14, color: K.muted, ls: 1.3})
    }
    s.addNotes('总结六个优势：' + adv.map((a) => a[1]).join('；') + '。')
  }

  /* feature slides */
  const FEATURES = [
    {sec: '选品与商品', id: 'research', kicker: 'STEP 01 · 选品', title: '数据选品：下一款做什么，数据说了算', pts: [['search', '五步选品流程', '采集候选 → 分析数据 → 确认 → 直播测款 → 定爆品'], ['chart', '趋势 + 潜力评分', '近 7 天销量趋势、环比与潜力分，一眼分出爆品和淘汰款'], ['video', '直播测款验证', '用工厂直播间真实测款，数据说话再投入'], ['box', '爆品一键建商品', '测款结论为「爆品」的商品，一键进入商品库开始做内容']], value: '工厂样品多，先用数据挑出最有希望的款，把内容和广告预算集中在爆品上。'},
    {sec: '选品与商品', id: 'product', kicker: 'STEP 02 · 建商品', title: 'AI 读懂你的产品：一份档案管住所有视频', pts: [['brain', '8 维度自动识别', '品类、材质、卖点、人群、场景、价格带、风格、禁用表达'], ['sparkle', '卖点话术自动生成', '把工厂视角的参数，翻译成消费者听得懂的卖点'], ['shield', '禁用表达自动规避', '夸大功效、绝对化用语提前拦住，降低违规风险'], ['check', '商品一致性优先', '后续所有视频都以商品档案和参考图为准，产品不走样']], value: '上传产品图就能建档，不需要专门的文案和策划人员。'},
    {sec: '素材与模特', id: 'assets', kicker: 'STEP 03 · 备素材', title: '素材从四面八方来，统一入库随取随用', pts: [['link', '多平台链接解析', 'TikTok、抖音等平台链接一贴即解析，下载无水印参考视频'], ['qr', '手机扫码上传', '车间、仓库、样品间现场拍，扫码直接进素材库'], ['cut', '直播切片', '工厂直播录像一键切成多段短素材，回流素材库'], ['layers', '统一素材库', '所有生产线都从这里取素材，文件夹管理，不再到处找']], value: '工厂最不缺的就是真实场景：车间、产线、仓库都是好素材。'},
    {sec: '素材与模特', id: 'models', kicker: 'STEP 04 · 出成片 · 模特', title: '不请模特，照样有人出镜', pts: [['user', 'AI 模特身份包', '把 AI 模特做成可复用的身份：形象、定妆照、资料统一管理'], ['copy', '一次定妆，反复使用', '同一个模特跨商品、跨项目出镜，不再按天付模特费'], ['sparkle', '多肤色多风格', '东南亚、欧美、日韩、中东……按目标市场选模特'], ['shield', '形象锁定', '分镜与视频都以身份包为准，账号形象始终统一']], value: '省掉模特费、场地费，也不受模特档期限制。'},
    {sec: '出成片', id: 'clone', kicker: 'STEP 04 · 出成片 · 爆款复刻', title: '爆款复刻：照着爆款做，就对了', pts: [['search', '参考分析', '拆解爆款视频的结构和节奏：钩子、痛点、展示、促单'], ['sub', '脚本生成', '按同样的结构，改写成你的商品脚本，可生成多个变体'], ['image', '定妆图 → 分镜图 → 分镜视频', '模特定妆、逐镜生成画面，再把每个分镜做成视频'], ['video', '成片合成', '自动合成完整成片，支持逐步调整、失败重试与断点恢复']], value: '不用会拍、不用会剪，照着已经验证过的爆款结构批量出片。'},
    {sec: '出成片', id: 'studio', kicker: 'STEP 04 · 出成片 · 创意', title: 'tk创意室 + 图生视频：没有拍摄，照样有画面', pts: [['swap', '场景图换商品', '把好看的场景图里的商品，换成你的产品'], ['wand', 'tk创意室批量出片', '用 TikTok 创意账号或模型，一张图一条短视频'], ['play', '图生视频', '让一张产品图「动起来」，做成手机上的动态内容'], ['layers', '配方一键套用', '「场景图批量出片」配方：填几个信息就能跑']], value: '只有产品图也能做视频，新品上架当天就能有内容。'},
    {sec: '出成片', id: 'mix', kicker: 'STEP 04 · 出成片 · 批量', title: '批量混剪：一个模板，几十条不重样的成片', pts: [['layers', '模板沉淀', '视频结构、字幕、TTS 配音、BGM、转场、调色、LUT 都存成模板'], ['sparkle', 'AI 反推模板', '导入一条视频，AI 自动分析并生成可复用的混剪模板'], ['cut', '智能组合去重', '素材池 × 模板，自动组合，避免重复内容'], ['rocket', '批量任务中心', '排队生成、暂停恢复、查看日志，手机扫码预览成片']], value: '工厂有大量实拍素材，用模板放大，一次产出几十条视频。'},
    {sec: '出成片', id: 'post', kicker: '后期工具箱', title: '后期同样不用人工', pts: [['sub', '视频批量字幕', '识别语音，批量生成并烧录字幕，支持字幕工作室精修'], ['stamp', '品牌水印', '统一给商品图、视频打上工厂 Logo'], ['swap', '商品替换', '把画面里的商品换成你的款'], ['image', '视频拆图 / 图生图', '从视频批量截取可复用的商品图片']], value: '原本要剪辑师逐条处理的活，批量一次完成。'},
    {sec: 'AI 制片人', id: 'producer', kicker: 'AI 制片人', title: '说一句话，AI 把活干完', pts: [['wand', '说出目标', '例：「这周给新款耳环做 20 条视频」，支持拖入图片和视频'], ['eye', '先给计划卡', '步骤、预计模型调用次数、预计耗时，一目了然'], ['check', '审批后执行', '你点「执行」才开始，后台运行，可随时接管'], ['rocket', '全自动打爆流水线', '选品 → 建商品 → 找爆款 → 出成片 → 质检 → 排期 → 复盘']], value: '一个运营就能带起整条内容线，老板只需要定目标、看结果。'},
    {sec: '质检与发布', id: 'review', kicker: 'STEP 05–06 · 质检 · 发布', title: '审核收件箱 + 发布中心：人只做选择题', pts: [['inbox', '审核收件箱', '所有生产线的产出集中到一处，逐条「通过 / 重做 / 丢弃」'], ['brain', '重做原因进记忆', '打回原因写入品牌记忆，AI 下次规划时自动避开'], ['send', '自动生成发布草稿', '通过的视频直接生成发布草稿'], ['calendar', '排期上线', '按计划排期发布，进度、失败一目了然']], value: '把质量关握在人手里，把重复劳动交给系统。'},
    {sec: '投放与运营', id: 'gmv', kicker: 'STEP 07 · 投放', title: 'GMV MAX 优化器：每一分广告费都算清楚', pts: [['chart', '素材一眼分层', '最赚钱 / 只花钱不出单 / 新视频，按真实数据分组'], ['stop', '差素材一键排除', '只花钱不出单的视频直接排除，好素材加预算'], ['bell', '紧急停止', '投放异常时一键止损'], ['coin', '利润与自动化', '利润核算、自动化规则、操作审计，新手 / 专业双模式']], value: '投放数据反过来指挥素材生产：哪类视频赚钱，就多做哪类。'},
    {sec: '投放与运营', id: 'ops', kicker: '店铺运营', title: '达人、上架、库存，一站搞定', pts: [['user', '达人管理', '多店铺统一管理达人：发现、邀约、寄样、履约、出单'], ['tag', 'TikTok 上架助手', '自动生成商品标题、描述等上架文案'], ['truck', '店小秘库存分析', '对接店小秘，库存告急、补货建议提前知道'], ['bell', '飞书每日简报', '出片、通过率、投放和库存，每天推送到飞书']], value: '内容、达人、货盘在一个系统里看，工厂老板随时掌握全局。'},
    {sec: '投放与运营', id: 'loop', kicker: 'STEP 08 · 复盘', title: '数据复盘：做得越多，系统越懂你', pts: [['chart', '全程可视', '按生产线看产出、通过、重做、发布，表现最好的商品一目了然'], ['redo', '投放效果回流', '投放数据与审核结果一起回流'], ['brain', '品牌记忆', '品牌调性、禁用词、常用模特、爆款结构持续积累'], ['sparkle', '下一批自动更优', 'AI 生成周复盘与下周内容计划']], value: '经验沉淀在系统里，不会因为人员流动而丢失。'},
    {sec: '投放与运营', id: 'devices', kicker: '多端协同', title: '电脑 · 网页 · 手机，三端云同步', pts: [['monitor', 'Windows 桌面端', '功能最全的主力工作台'], ['cloud', '网页版 + 手机 App', '同设计、同功能，出门在外也能看进度、做审核'], ['coin', '按点数计费', 'AI 能力云端开通，用多少扣多少'], ['key', '卡密激活', '不用自己申请、配置各家模型接口和密钥']], value: '老板在手机上审片，运营在电脑上生产，数据实时同步。'},
  ]
  ICON.redo = 'M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5'
  let lastSec = '全链路'
  for (const ft of FEATURES) {
    if (ft.sec !== lastSec) { pres.addSection({title: ft.sec}); lastSec = ft.sec }
    const s = content(ft.kicker, ft.title, ft.sec)
    for (const [i, [ic, h, d]] of ft.pts.entries()) {
      const y = 1.95 + i * 1.05
      await iconDot(s, ic, 0.6, y + 0.04, 0.56)
      txt(s, h, 1.35, y, 4.3, 0.38, {size: 17, bold: true, valign: 'middle'})
      txt(s, d, 1.35, y + 0.4, 4.3, 0.6, {size: 13, color: K.muted, ls: 1.25})
    }
    const iw = 6.75, ih = iw * 660 / 1080
    s.addImage({path: path.join(IMG, `mock-${ft.id}.png`), x: 5.98, y: 1.85, w: iw, h: ih, altText: `${ft.kicker} 界面示意`})
    box(s, 0.6, 6.25, 12.13, 0.5, {fill: K.green, line: K.green, tr: 86})
    s.addText([{text: '对工厂意味着　', options: {bold: true, color: K.green}}, {text: ft.value, options: {color: K.text}}], {x: 0.85, y: 6.25, w: 11.7, h: 0.5, isTextBox: true, fontFace: FONT, fontSize: 14, valign: 'middle', margin: 0})
    s.addNotes(say(ft.id) + '\n要点：' + ft.pts.map((p) => `${p[1]}——${p[2]}`).join('；'))
  }

  /* week */
  pres.addSection({title: '落地'})
  {
    const s = content('落地场景', '一个工厂运营的一周', '落地')
    const days = [
      ['周一', '选品 + 建商品', '选品方案定出 3 个爆品，一键建入商品库，AI 完成 8 维度识别'],
      ['周二', '找爆款 + 复刻', '贴 5 条同类爆款链接，自动解析下载，为每个商品复刻成片'],
      ['周三', '批量出片', 'tk创意室换场景、图生视频、批量混剪，一天产出几十条'],
      ['周四', '审核 + 排期', '审核收件箱逐条通过 / 重做，通过的自动生成发布草稿'],
      ['周五', '投放优化', 'GMV MAX 看数据：差素材排除，好素材加预算、再做同款'],
      ['周六', '达人 + 库存', '给达人寄样、跟进履约；店小秘库存告急提前补货'],
      ['周日', 'AI 周复盘', '自动生成复盘和下周计划，偏好写入品牌记忆'],
    ]
    days.forEach(([d, t, x], i) => {
      const cx = 0.6 + i * 1.75
      box(s, cx, 1.95, 1.6, 4.1, {fill: i === 2 ? K.panel2 : K.panel, line: i === 2 ? K.green : K.line})
      txt(s, d, cx, 2.15, 1.6, 0.4, {size: 14, bold: true, color: K.green, align: 'center'})
      txt(s, t, cx + 0.12, 2.65, 1.36, 0.75, {size: 16, bold: true, align: 'center', valign: 'middle'})
      txt(s, x, cx + 0.15, 3.55, 1.3, 2.4, {size: 12, color: K.muted, ls: 1.35})
    })
    txt(s, '全程只需要 1 名运营定目标、做审核；重复劳动由 AI 制片人在后台完成。', 0.6, 6.25, 12.13, 0.45, {size: 15, bold: true, color: K.text})
    s.addNotes('用一个具体的一周，把前面的功能串起来讲。重点强调：人只在周四审核、周五做决策，其余时间系统在后台跑。')
  }

  /* compare */
  {
    const s = content('对比', '传统做法 vs Vidloom', '落地')
    const rows = [
      ['人员配置', '编导、摄影、模特、剪辑、投手等多个岗位', '1–2 名运营 + AI'],
      ['新品上视频', '等模特档期、等拍摄排期', '上传产品图，当天出片'],
      ['单条视频', '拍剪 1–2 天', '分钟级生成，多条并行'],
      ['视频产量', '每周十几条，拍不过来', '模板 × 素材，一次几十条'],
      ['模特', '外请，按天付费', 'AI 身份包，反复使用'],
      ['投放判断', '凭感觉，看不清哪条赚钱', '每条视频 ROI 一眼看清，一键排除'],
      ['经验沉淀', '在人脑里，人走经验走', '模板 + 品牌记忆，沉淀在系统'],
    ]
    const hdr = (t, c) => ({text: t, options: {bold: true, color: c, fill: {color: K.panel2}, fontSize: 15, valign: 'middle'}})
    const data = [[hdr('', K.text), hdr('传统做法', K.red), hdr('Vidloom', K.green)], ...rows.map(([a, b, c]) => [
      {text: a, options: {bold: true, color: K.text}}, {text: b, options: {color: K.muted}}, {text: c, options: {color: K.text, bold: true}},
    ])]
    s.addTable(data, {x: 0.6, y: 1.9, w: 12.13, colW: [2.2, 4.96, 4.97], rowH: 0.56, fontFace: FONT, fontSize: 14, fill: {color: K.panel}, border: {type: 'solid', color: K.line, pt: 0.75}, valign: 'middle', margin: [0, 0.15, 0, 0.15]})
    txt(s, '注：为典型情况对比，实际效果因品类、素材与团队而异；生成速度与数量取决于点数和模型配额。', 0.6, 6.35, 12.13, 0.35, {size: 11, color: K.dim})
    s.addNotes('这一页给老板算账。注意说明：这是典型情况对比，不同品类会有差别。')
  }

  /* fit */
  {
    const s = content('适用工厂', '这些工厂，最适合用 Vidloom', '落地')
    const cats = [['tag', '饰品配饰'], ['user', '服装鞋包'], ['box', '家居日用'], ['monitor', '3C 数码配件'], ['sparkle', '美妆个护工具'], ['play', '母婴玩具'], ['shield', '宠物用品'], ['rocket', '运动户外']]
    for (const [i, [ic, t]] of cats.entries()) {
      const x = 0.6 + (i % 4) * 3.08, y = 1.95 + Math.floor(i / 4) * 1.6
      box(s, x, y, 2.88, 1.4)
      await iconDot(s, ic, x + 0.28, y + 0.38, 0.64)
      txt(s, t, x + 1.1, y, 1.75, 1.4, {size: 19, bold: true, valign: 'middle'})
    }
    const tr = [['SKU 多、上新快', '每款都需要内容，人工拍不过来'], ['已有或计划做 TikTok Shop', '自营店铺、跨境店、达人带货'], ['想降本增效', '不想养大团队，又要稳定出内容']]
    tr.forEach(([a, b], i) => {
      const x = 0.6 + i * 4.08
      box(s, x, 5.3, 3.88, 1.35, {fill: K.panel2, line: K.green})
      txt(s, a, x + 0.3, 5.5, 3.4, 0.4, {size: 17, bold: true, color: K.green})
      txt(s, b, x + 0.3, 5.98, 3.4, 0.5, {size: 14, color: K.muted})
    })
    s.addNotes('适合的品类举例，核心判断标准是：款多、上新快、想做 TikTok、不想养大团队。')
  }

  /* onboarding */
  {
    const s = content('开通与落地', '四步，把内容线跑起来', '落地')
    const steps = [['key', '开通账号', '卡密激活，充值点数；AI 能力云端已配好，无需自己申请接口'], ['user', '上手带练', '按主流程带练：建商品 → 复刻 → 审核 → 发布'], ['video', '首个商品跑通', '从建商品到第一条可发布视频，在自己的产品上验证效果'], ['rocket', '规模化', '沉淀模板与模特身份包，交给全自动流水线批量产出']]
    for (const [i, [ic, t, d]] of steps.entries()) {
      const x = 0.6 + i * 3.08
      box(s, x, 2.0, 2.88, 3.9)
      txt(s, `0${i + 1}`, x + 0.3, 2.25, 1.2, 0.7, {size: 36, bold: true, color: K.green})
      await iconDot(s, ic, x + 2.0, 2.3, 0.6)
      txt(s, t, x + 0.3, 3.2, 2.4, 0.45, {size: 20, bold: true})
      txt(s, d, x + 0.3, 3.8, 2.35, 1.9, {size: 14, color: K.muted, ls: 1.35})
      if (i < 3) txt(s, '›', x + 2.86, 3.6, 0.24, 0.5, {size: 24, bold: true, color: K.green, align: 'center'})
    }
    s.addNotes('落地路径：开通 → 带练 → 首个商品跑通 → 规模化。建议现场用客户自己的一款产品演示第 3 步。')
  }

  /* close */
  {
    const s = pres.addSlide({masterName: 'END', sectionTitle: '落地'})
    s.addImage({path: LOGO, x: W / 2 - 0.55, y: 1.2, w: 1.1, h: 1.1})
    txt(s, [{text: '你负责把货做好，内容交给 ', options: {color: K.text}}, {text: 'Vidloom', options: {color: K.green}}], 0.6, 2.7, 12.13, 0.9, {size: 40, bold: true, align: 'center', valign: 'middle'})
    txt(s, '让每一家工厂，都拥有自己的爆款内容工厂', 0.6, 3.65, 12.13, 0.6, {size: 22, color: K.muted, align: 'center', valign: 'middle'})
    box(s, W / 2 - 1.6, 4.75, 3.2, 0.75, {fill: K.green, line: K.green, r: 0.15})
    txt(s, '预约演示 · 开通试用', W / 2 - 1.6, 4.75, 3.2, 0.75, {size: 20, bold: true, color: K.ink, align: 'center', valign: 'middle'})
    txt(s, '联系人：__________　　电话 / 微信：__________', 0.6, 6.2, 12.13, 0.4, {size: 14, color: K.dim, align: 'center'})
    s.addNotes(say('close') + '\n结尾留联系方式，现场可以直接演示一款客户自己的产品。')
  }

  await pres.writeFile({fileName: OUT})
  if (process.env.APPLY_THEME) {
    const {applyTheme} = require(process.env.APPLY_THEME)
    await applyTheme(OUT, THEME)
  }
  console.log(OUT)
}

build().catch((e) => { console.error(e); process.exit(1) })
