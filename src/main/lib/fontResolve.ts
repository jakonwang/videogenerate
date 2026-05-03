import { existsSync, readdirSync } from 'node:fs'
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { getAppPaths } from './paths'
import { ASS_DEFAULT_FONT_FAMILY } from '../../shared/assDefaults'
import { tryGetFontFamilyName } from './fontMeta'

export type ResolvedMultilangFont = {
  /** 主字体文件（用于日志/兼容）；与 ASS 主族名对应 */
  path: string | null
  assFamily: string
  /**
   * 必须传入 FFmpeg `subtitles=...:fontsdir=...`，目录内需含 NotoSansSC 及补充字体，禁止省略（否则 libass 系统回退导致乱码）
   */
  fontsDir: string | null
}

type Candidate = { path: string; assFamily: string }
export type FontRenderAssessment = {
  fileName: string
  sourceFile: string
  familyName: string
  renderReady: boolean
  message: string
}

function exists(p: string): boolean {
  try {
    return existsSync(p)
  } catch {
    return false
  }
}

function isFontFileName(n: string): boolean {
  return /\.(woff2|otf|ttf|ttc)$/i.test(n) && !n.startsWith('.') && n.toLowerCase() !== 'readme.md'
}

function stemFromFileName(fileName: string): string {
  return String(fileName ?? '')
    .replace(/\.(woff2|otf|ttf|ttc)$/i, '')
    .trim()
}

async function listFontFilesInDir(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir)
    return names.filter(isFontFileName).sort((a, b) => a.localeCompare(b, 'en'))
  } catch {
    return []
  }
}

/** 主进程 out/main/resources/fonts、或项目根 resources/fonts（开发 cwd） */
function findBundledFontsDir(): string | null {
  const candidates = [
    join(__dirname, 'resources', 'fonts'),
    join(process.cwd(), 'resources', 'fonts'),
  ]
  for (const d of candidates) {
    if (!existsSync(d)) continue
    try {
      const names = readdirSync(d)
      const ready = existsSync(join(d, '.videogenerate-fonts-ready'))
      const hasFonts = names.some(isFontFileName)
      if (ready || hasFonts) return d
    } catch {
      // ignore
    }
  }
  return null
}

export async function listBundledFontFiles(): Promise<{ dir: string | null; files: string[] }> {
  const dir = findBundledFontsDir()
  if (!dir) return { dir: null, files: [] }
  const files = await listFontFilesInDir(dir)
  return { dir, files }
}

export async function assessImportedFontFile(input: {
  fileName: string
  absPath: string
  familyName?: string | null
}): Promise<FontRenderAssessment> {
  const sourceFile = String(input.fileName ?? '').trim()
  const ext = extname(sourceFile).toLowerCase()
  const resolvedFamily =
    String(input.familyName ?? '').trim() || (await tryGetFontFamilyName(String(input.absPath ?? ''))) || stemFromFileName(sourceFile)
  let message = '可用于 ASS 字幕渲染。'
  if (ext === '.woff2') {
    message =
      'woff2 已导入，但部分 FFmpeg/libass 环境可能无法加载。若渲染异常，建议改用 ttf/otf/ttc。'
  }
  return {
    fileName: sourceFile,
    sourceFile,
    familyName: resolvedFamily,
    renderReady: true,
    message,
  }
}

function pickPrimaryBundledFontPath(dir: string): string | null {
  try {
    const names = readdirSync(dir).filter(isFontFileName)
    const sc = names.find((n) => /notosanssc/i.test(n))
    if (sc) return join(dir, sc)
    return names[0] ? join(dir, names[0]) : null
  } catch {
    return null
  }
}

/** 模板里若仍用下列「默认族名」，渲染时改为与探测到的字体文件一致 */
const FONT_NAMES_SYNC_WITH_PROBE = new Set([
  '',
  'Noto Sans',
  'Noto Sans SC',
  'Noto Sans CJK SC',
  'Noto Sans CJK TC',
  'Noto Sans CJK JP',
])

/**
 * 优先内置 `resources/fonts`（与 FFmpeg 强制 fontsdir 一致），再用户目录，再系统。
 */
export function resolveMultilangFont(): ResolvedMultilangFont {
  const bundled = findBundledFontsDir()
  if (bundled) {
    const primary = pickPrimaryBundledFontPath(bundled)
    if (primary) {
      return { path: primary, assFamily: ASS_DEFAULT_FONT_FAMILY, fontsDir: bundled }
    }
  }

  const { dataDir } = getAppPaths()
  const userDir = join(dataDir, 'fonts')

  const candidates: Candidate[] = [
    { path: join(userDir, 'NotoSansSC-Regular.otf'), assFamily: ASS_DEFAULT_FONT_FAMILY },
    { path: join(userDir, 'NotoSansSC-Regular.ttf'), assFamily: ASS_DEFAULT_FONT_FAMILY },
    { path: join(userDir, 'NotoSansCJK-Regular.ttc'), assFamily: 'Noto Sans CJK SC' },
    { path: join(userDir, 'NotoSans-Regular.ttf'), assFamily: 'Noto Sans' },
    { path: join(userDir, 'NotoSans.ttf'), assFamily: 'Noto Sans' },
  ]

  if (process.platform === 'win32') {
    const win = 'C:\\Windows\\Fonts'
    candidates.push(
      { path: join(win, 'NotoSansSC-Regular.otf'), assFamily: ASS_DEFAULT_FONT_FAMILY },
      { path: join(win, 'NotoSansSC-Regular.ttf'), assFamily: ASS_DEFAULT_FONT_FAMILY },
      { path: join(win, 'NotoSansCJK-Regular.ttc'), assFamily: 'Noto Sans CJK SC' },
      { path: join(win, 'msyh.ttc'), assFamily: 'Microsoft YaHei' },
      { path: join(win, 'msyhbd.ttc'), assFamily: 'Microsoft YaHei' },
      { path: join(win, 'NotoSans-Regular.ttf'), assFamily: 'Noto Sans' },
      { path: join(win, 'NotoSans.ttf'), assFamily: 'Noto Sans' },
    )
  } else {
    candidates.push(
      { path: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', assFamily: 'Noto Sans CJK SC' },
      { path: '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', assFamily: 'Noto Sans CJK SC' },
      { path: '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc', assFamily: 'Noto Sans CJK SC' },
      { path: '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc', assFamily: 'Noto Sans CJK SC' },
      { path: '/usr/share/fonts/truetype/noto/NotoSansSC-Regular.otf', assFamily: ASS_DEFAULT_FONT_FAMILY },
      { path: '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf', assFamily: 'Noto Sans' },
      { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', assFamily: 'DejaVu Sans' },
    )
  }

  for (const c of candidates) {
    if (exists(c.path)) {
      return { path: c.path, assFamily: c.assFamily, fontsDir: dirname(c.path) }
    }
  }

  return { path: null, assFamily: ASS_DEFAULT_FONT_FAMILY, fontsDir: null }
}

/** @deprecated 使用 resolveMultilangFont().path */
export function resolveMultilangFontFile(): string | null {
  return resolveMultilangFont().path
}

export function pickAssFontFamilyForRender(
  templateFont: string | undefined,
  resolved: ResolvedMultilangFont,
): string {
  const raw = (templateFont ?? '').trim() || ASS_DEFAULT_FONT_FAMILY
  if (!resolved.path) return raw
  if (FONT_NAMES_SYNC_WITH_PROBE.has(raw)) return resolved.assFamily
  return raw
}

function normalizeFamilyName(name: string): string {
  return String(name ?? '').trim().toLowerCase()
}

function normalizeFamilyAlias(name: string): string {
  let s = normalizeFamilyName(name).replace(/\s+/g, ' ').trim()
  if (!s) return ''

  // 变量字体常见族名：`Nunito Sans 12pt ExtraLight` -> `Nunito Sans`
  const noPt = s.replace(/\s+\d+pt\b.*$/i, '').trim()
  if (noPt) s = noPt

  // 去掉常见字重/斜体后缀，便于“常用族名”匹配
  const styleTail =
    /\s+(thin|extralight|ultralight|light|regular|book|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy|italic|oblique)$/i
  let prev = ''
  while (s && s !== prev) {
    prev = s
    s = s.replace(styleTail, '').trim()
  }

  return s || normalizeFamilyName(name)
}

export async function listRenderableAssFamilies(fontsDir: string): Promise<FontRenderAssessment[]> {
  const names = await listFontFilesInDir(fontsDir)
  const merged = new Map<string, FontRenderAssessment>()
  for (const fileName of names) {
    const absPath = join(fontsDir, fileName)
    const assessed = await assessImportedFontFile({
      fileName,
      absPath,
      familyName: await tryGetFontFamilyName(absPath),
    })
    const key = normalizeFamilyName(assessed.familyName)
    const prev = merged.get(key)
    if (!prev) {
      merged.set(key, assessed)
      continue
    }
    // 若同族名重复，优先保留非 woff2 的说明（更稳）
    const prevWoff = extname(prev.fileName).toLowerCase() === '.woff2'
    const curWoff = extname(assessed.fileName).toLowerCase() === '.woff2'
    if (prevWoff && !curWoff) merged.set(key, assessed)
  }
  return [...merged.values()].sort((a, b) => a.familyName.localeCompare(b.familyName, 'en'))
}

export async function assertAssFontFamilyAvailable(
  fontsDir: string,
  assFamily: string,
): Promise<void> {
  const target = normalizeFamilyName(assFamily)
  const targetAlias = normalizeFamilyAlias(assFamily)
  if (!target && !targetAlias) return
  const families = await listRenderableAssFamilies(fontsDir)
  const has = families.some((x) => {
    const fam = normalizeFamilyName(x.familyName)
    const alias = normalizeFamilyAlias(x.familyName)
    return fam === target || (targetAlias && alias === targetAlias)
  })
  if (has) return
  const suggested = families
    .slice(0, 8)
    .map((x) => x.familyName)
    .join(' / ')
  throw new Error(
    `ASS 字体不可用：当前 fontsdir 中未找到族名「${assFamily}」。` +
      (suggested ? ` 可选族名示例：${suggested}` : ' 请先导入 ttf/otf/ttc 字体并在模板中填写正确 Family Name。'),
  )
}

/**
 * 将模板输入的 ASS 族名按 fontsdir 中真实可用族名做一次别名解析。
 * 例如：`Nunito Sans` -> `Nunito Sans 12pt ExtraLight`
 */
export async function resolveAssFontFamilyForFontsDir(
  fontsDir: string,
  assFamily: string,
): Promise<string> {
  const target = normalizeFamilyName(assFamily)
  const targetAlias = normalizeFamilyAlias(assFamily)
  if (!target && !targetAlias) return assFamily

  const families = await listRenderableAssFamilies(fontsDir)
  const exact = families.find((x) => normalizeFamilyName(x.familyName) === target)
  if (exact) return exact.familyName

  const aliasMatched = families.find((x) => normalizeFamilyAlias(x.familyName) === targetAlias)
  if (aliasMatched) return aliasMatched.familyName

  return assFamily
}

/** 有字幕烧录时必须存在 fontsdir，否则应中止任务 */
export function assertFontsDirForSubtitles(resolved: ResolvedMultilangFont): asserts resolved is ResolvedMultilangFont & { fontsDir: string } {
  if (!resolved.fontsDir) {
    throw new Error(
      '未找到多语言字幕字体目录。请执行 npm run setup:fonts（从 Google Fonts 拉取 Noto woff2 到 resources/fonts），再 npm run build；或自行将 NotoSansSC 等字体文件放入 userData/videogenerate/fonts/',
    )
  }
}

/**
 * 为 FFmpeg subtitles 准备最终可用的 fontsdir。
 *
 * 关键点：libass 只能接收一个 fontsdir，但我们需要同时包含：
 * - 内置多语言字体（Noto/Nunito 等，保证中文/越南语/泰文稳定）
 * - 用户导入字体（userData/videogenerate/fonts），让自定义字体可被扫描
 *
 * 策略：若用户目录下存在字体，则在任务临时目录内创建 `fonts_merged/`，把两边字体复制进去并去重；
 * 否则直接使用内置 fontsDir（更快）。
 */
export async function prepareFontsDirForSubtitles(tmpDir: string): Promise<string> {
  const resolved = resolveMultilangFont()
  assertFontsDirForSubtitles(resolved)

  const { dataDir } = getAppPaths()
  const userDir = join(dataDir, 'fonts')
  const userFonts = await listFontFilesInDir(userDir)
  if (!userFonts.length) return resolved.fontsDir

  const bundledFonts = await listFontFilesInDir(resolved.fontsDir)
  // 若内置目录异常为空，也允许仅用用户目录兜底（但仍返回 mergedDir，保证后续路径一致）
  const mergedDir = join(tmpDir, 'fonts_merged')
  await mkdir(mergedDir, { recursive: true })

  const copyIfNeeded = async (src: string, dest: string) => {
    try {
      const st = await stat(dest)
      if (st.size > 32 * 1024) return
    } catch {
      // not exists
    }
    try {
      await copyFile(src, dest)
    } catch {
      // ignore single font error
    }
  }

  const used = new Set<string>()
  const makeUniqueDest = (rawName: string, scopeTag: 'bundled' | 'user') => {
    const base = stemFromFileName(rawName) || 'font'
    const ext = extname(rawName) || '.ttf'
    const normalized = basename(rawName)
    if (!used.has(normalized)) {
      used.add(normalized)
      return normalized
    }
    let i = 1
    while (true) {
      const candidate = `${base}__${scopeTag}_${i}${ext}`
      if (!used.has(candidate)) {
        used.add(candidate)
        return candidate
      }
      i += 1
    }
  }

  for (const name of bundledFonts) {
    const destName = makeUniqueDest(name, 'bundled')
    await copyIfNeeded(join(resolved.fontsDir, name), join(mergedDir, destName))
  }
  for (const name of userFonts) {
    const destName = makeUniqueDest(name, 'user')
    await copyIfNeeded(join(userDir, name), join(mergedDir, destName))
  }

  return mergedDir
}
