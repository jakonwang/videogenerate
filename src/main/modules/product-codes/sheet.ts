import * as XLSX from 'xlsx'
import { compareCodes, isValidProductCode, normalizeProductCode, splitCode } from '../../../shared/productCode'

/** 款号表格（编号 / 图片 / 爆款类型，每个前缀一张表）的读写，图片在单元格里。 */

type CfbEntry = { name: string; content: Uint8Array }
type CfbContainer = { FullPaths: string[]; FileIndex: CfbEntry[] }
const CFB = (XLSX as unknown as { CFB: { read: (data: Buffer, options: { type: 'buffer' }) => CfbContainer; write: (cfb: CfbContainer, options: Record<string, unknown>) => Buffer; utils: { cfb_add: (cfb: CfbContainer, name: string, content: Buffer) => void } } }).CFB

export type SheetRow = { sheet: string; row: number; code: string; hotType: string; image?: { data: Buffer; ext: string } }

class Zip {
  private files = new Map<string, Buffer>()
  constructor(data: Buffer) {
    const cfb = CFB.read(data, { type: 'buffer' })
    cfb.FullPaths.forEach((path, index) => {
      const name = path.replace(/^[^/]*\//, '')
      const content = cfb.FileIndex[index]?.content
      if (name && content) this.files.set(name, Buffer.from(content))
    })
  }
  raw(path: string) {
    return this.files.get(path.replace(/^\//, ''))
  }
  text(path: string) {
    return this.raw(path)?.toString('utf8') || ''
  }
  /** rId → 包内路径 */
  rels(path: string) {
    const dir = path.split('/').slice(0, -1)
    const text = this.text([...dir, '_rels', `${path.split('/').pop()}.rels`].join('/'))
    const out = new Map<string, string>()
    for (const match of text.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
      const id = attr(match[0], 'Id')
      const target = attr(match[0], 'Target')
      if (id && target) out.set(id, resolve(dir, target))
    }
    return out
  }
}

function attr(tag: string, name: string) {
  return new RegExp(`(?:^|\\s)(?:\\w+:)?${name}="([^"]*)"`).exec(tag)?.[1]
}

function resolve(dir: string[], target: string) {
  if (target.startsWith('/')) return target.slice(1)
  const out = [...dir]
  for (const part of target.split('/')) {
    if (part === '..') out.pop()
    else if (part !== '.') out.push(part)
  }
  return out.join('/')
}

type Img = { data: Buffer; ext: string }
function media(zip: Zip, path: string | undefined): Img | undefined {
  const data = path ? zip.raw(path) : undefined
  const ext = (path?.split('.').pop() || '').toLowerCase()
  return data?.length && /^(png|jpe?g|webp|gif|bmp)$/.test(ext) ? { data, ext: ext === 'jpeg' ? 'jpg' : ext } : undefined
}

/** 每张表：行号（0 起）→ 图片。支持浮动图片、WPS / 金山单元格图片（DISPIMG）、Excel 单元格内图片。 */
function sheetImages(zip: Zip, sheetPath: string): Map<number, Img> {
  const out = new Map<number, Img>()
  const xml = zip.text(sheetPath)
  const rels = zip.rels(sheetPath)

  for (const match of xml.matchAll(/<(?:\w+:)?drawing\b[^>]*>/g)) {
    const path = rels.get(attr(match[0], 'id') || '')
    if (!path) continue
    const drawingRels = zip.rels(path)
    for (const anchor of zip.text(path).matchAll(/<(?:\w+:)?(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/(?:\w+:)?\1>/g)) {
      const row = /<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?row>(\d+)</.exec(anchor[0])?.[1]
      const image = media(zip, drawingRels.get(/r:embed="([^"]+)"/.exec(anchor[0])?.[1] || ''))
      if (row !== undefined && image && !out.has(Number(row))) out.set(Number(row), image)
    }
  }

  const named = new Map<string, Img>()
  const cellRels = zip.rels('xl/cellimages.xml')
  for (const item of zip.text('xl/cellimages.xml').matchAll(/<(?:\w+:)?cellImage>[\s\S]*?<\/(?:\w+:)?cellImage>/g)) {
    const name = /<(?:\w+:)?cNvPr\b[^>]*\bname="([^"]+)"/.exec(item[0])?.[1]
    const image = media(zip, cellRels.get(/r:embed="([^"]+)"/.exec(item[0])?.[1] || ''))
    if (name && image) named.set(name, image)
  }
  const rich = richImages(zip)
  if (named.size || rich.length) {
    for (const cell of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const row = Number(/\br="[A-Z]+(\d+)"/.exec(cell[1])?.[1]) - 1
      if (!(row >= 0) || out.has(row)) continue
      const id = /DISPIMG\((?:&quot;|")(ID_\w+)/.exec(cell[2])?.[1]
      const vm = Number(attr(cell[1], 'vm'))
      const image = id ? named.get(id) : vm ? rich[vm - 1] : undefined
      if (image) out.set(row, image)
    }
  }
  return out
}

/** Excel 365 单元格内图片：vm 序号 → 图片 */
function richImages(zip: Zip): Array<Img | undefined> {
  const meta = zip.text('xl/metadata.xml')
  const values = zip.text('xl/richData/rdrichvalue.xml')
  const relPath = 'xl/richData/richValueRel.xml'
  if (!meta || !values) return []
  const rels = zip.rels(relPath)
  const ids = [...zip.text(relPath).matchAll(/<(?:\w+:)?rel\b[^>]*>/g)].map((item) => attr(item[0], 'id') || '')
  const rich = [...values.matchAll(/<rv\b[^>]*>([\s\S]*?)<\/rv>/g)].map((item) => Number(/<v>(\d+)<\/v>/.exec(item[1])?.[1]))
  const future = [.../<futureMetadata\b[^>]*XLRICHVALUE[\s\S]*?<\/futureMetadata>/.exec(meta)?.[0].matchAll(/\brvb\b[^>]*\bi="(\d+)"/g) || []].map((item) => Number(item[1]))
  return [.../<valueMetadata\b[\s\S]*?<\/valueMetadata>/.exec(meta)?.[0].matchAll(/<rc\b[^>]*\bv="(\d+)"/g) || []].map((item) => media(zip, rels.get(ids[rich[future[Number(item[1])]]] || '')))
}

export function readCodeSheet(file: Buffer): { rows: SheetRow[]; skipped: Array<{ sheet: string; row: number; value: string }>; sheets: string[] } {
  const book = XLSX.read(file, { type: 'buffer', cellStyles: false })
  const zip = file[0] === 0x50 ? new Zip(file) : null
  const bookRels = zip?.rels('xl/workbook.xml')
  const paths = new Map<string, string>()
  if (zip && bookRels) {
    let index = 0
    for (const match of zip.text('xl/workbook.xml').matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
      const path = bookRels.get(/\br:id="([^"]+)"/.exec(match[0])?.[1] || '')
      if (path) paths.set(book.SheetNames[index], path)
      index += 1
    }
  }
  const rows: SheetRow[] = []
  const skipped: Array<{ sheet: string; row: number; value: string }> = []
  const sheets: string[] = []
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name]
    if (!sheet?.['!ref']) continue
    const range = XLSX.utils.decode_range(sheet['!ref'])
    const value = (r: number, c: number) => String(sheet[XLSX.utils.encode_cell({ r, c })]?.v ?? '').trim()
    let header = -1
    let codeCol = -1
    let hotCol = -1
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 9) && header < 0; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const text = value(r, c)
        if (/^(编号|款号|货号|SKU|产品编号|商品编号)$/i.test(text)) { header = r; codeCol = c }
        if (/爆款|类型|标签/.test(text)) hotCol = c
      }
      if (header < 0) hotCol = -1
    }
    if (header < 0) continue
    sheets.push(name)
    const images = zip && paths.get(name) ? sheetImages(zip, paths.get(name)!) : new Map<number, Img>()
    for (let r = header + 1; r <= range.e.r; r += 1) {
      const raw = value(r, codeCol)
      if (!raw) continue
      const code = normalizeProductCode(raw)
      if (!isValidProductCode(code)) {
        skipped.push({ sheet: name, row: r + 1, value: raw })
        continue
      }
      rows.push({ sheet: name, row: r + 1, code, hotType: hotCol >= 0 ? value(r, hotCol).slice(0, 12) : '', image: images.get(r) })
    }
  }
  return { rows, skipped, sheets }
}

/** 同一款号出现多次（如「主推款式」表）合并成一条，前面的优先，空的用后面的补 */
export function mergeRows(rows: SheetRow[]): SheetRow[] {
  const out = new Map<string, SheetRow>()
  for (const row of rows) {
    const hit = out.get(row.code)
    if (!hit) out.set(row.code, { ...row })
    else {
      hit.hotType ||= row.hotType
      hit.image ||= row.image
    }
  }
  return [...out.values()]
}

export type ExportRow = { code: string; hotType: string; units30?: number; stock?: number; image?: Buffer }

const esc = (value: string) => value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)
const ROW_PT = 56

/** 按前缀分表，图片放进单元格位置（JPEG） */
export function writeCodeSheet(rows: ExportRow[]): Buffer {
  const groups = new Map<string, ExportRow[]>()
  for (const row of [...rows].sort((a, b) => compareCodes(a.code, b.code))) {
    const name = (splitCode(row.code)?.prefix || row.code).replace(/[^\p{L}\p{N}]+$/u, '').replace(/[[\]:*?/\\]/g, '').slice(0, 31) || '其他'
    groups.set(name, [...(groups.get(name) || []), row])
  }
  const book = XLSX.utils.book_new()
  for (const [name, list] of groups) {
    const sheet = XLSX.utils.aoa_to_sheet([['编号', '图片', '爆款类型', '近30天销量', '库存'], ...list.map((row) => [row.code, '', row.hotType, row.units30 ?? '', row.stock ?? ''])])
    sheet['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }]
    sheet['!rows'] = [{ hpt: 24 }, ...list.map(() => ({ hpt: ROW_PT }))]
    XLSX.utils.book_append_sheet(book, sheet, name)
  }
  if (!groups.size) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['编号', '图片', '爆款类型']]), '款号')
  const base = CFB.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer, { type: 'buffer' })
  const set = (path: string, content: string | Buffer) => {
    const index = base.FullPaths.findIndex((item) => item.replace(/^[^/]*\//, '') === path)
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    if (index >= 0) {
      base.FileIndex[index].content = data
      ;(base.FileIndex[index] as CfbEntry & { size?: number }).size = data.length
    } else CFB.utils.cfb_add(base, `/${path}`, data)
  }
  const get = (path: string) => {
    const index = base.FullPaths.findIndex((item) => item.replace(/^[^/]*\//, '') === path)
    return index >= 0 ? Buffer.from(base.FileIndex[index].content).toString('utf8') : ''
  }
  let types = get('[Content_Types].xml')
  let imageNo = 0
  let sheetNo = 0
  const EMU = 9525
  for (const list of groups.values()) {
    sheetNo += 1
    const anchors: string[] = []
    const rels: string[] = []
    list.forEach((row, index) => {
      if (!row.image) return
      imageNo += 1
      set(`xl/media/image${imageNo}.jpg`, row.image)
      const id = `rId${rels.length + 1}`
      rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${imageNo}.jpg"/>`)
      anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>${8 * EMU}</xdr:colOff><xdr:row>${index + 1}</xdr:row><xdr:rowOff>${2 * EMU}</xdr:rowOff></xdr:from><xdr:ext cx="${70 * EMU}" cy="${70 * EMU}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${imageNo + 1}" name="${esc(row.code)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${70 * EMU}" cy="${70 * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`)
    })
    if (!anchors.length) continue
    set(`xl/drawings/drawing${sheetNo}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`)
    set(`xl/drawings/_rels/drawing${sheetNo}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`)
    set(`xl/worksheets/_rels/sheet${sheetNo}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${sheetNo}.xml"/></Relationships>`)
    const path = `xl/worksheets/sheet${sheetNo}.xml`
    let xml = get(path)
    if (!/xmlns:r=/.test(xml)) xml = xml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ')
    set(path, xml.replace('</worksheet>', '<drawing r:id="rIdDrawing"/></worksheet>'))
    types = types.replace('</Types>', `<Override PartName="/xl/drawings/drawing${sheetNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`)
  }
  if (imageNo && !/Extension="jpg"/.test(types)) types = types.replace(/(<Types[^>]*>)/, '$1<Default Extension="jpg" ContentType="image/jpeg"/>')
  set('[Content_Types].xml', types)
  return Buffer.from(CFB.write(base, { type: 'buffer', fileType: 'zip', compression: true }))
}
