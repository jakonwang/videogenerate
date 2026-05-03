/**
 * 画面标题「符号行」快捷模板库：本地持久化（Windows/Linux 通用，仅存于渲染进程 localStorage）。
 */
export type OverlaySymbolTemplateItem = { id: string; label: string; text: string }

const STORAGE_KEY = 'videogenerate-overlay-symbol-templates'

/** 内置约 20 套常用符号/表情组合；用户可在模板页「管理模板库」增删改。 */
export const DEFAULT_OVERLAY_SYMBOL_TEMPLATES: OverlaySymbolTemplateItem[] = [
  { id: 'def-1', label: '♥', text: '♥♥♥♥♥' },
  { id: 'def-2', label: '★', text: '★★★★★★' },
  { id: 'def-3', label: '✨', text: '✨✨✨✨✨' },
  { id: 'def-4', label: '✿', text: '✿✿✿✿✿' },
  { id: 'def-5', label: '❀', text: '❀❀❀❀❀' },
  { id: 'def-6', label: '♪', text: '♪♫♪♫♪' },
  { id: 'def-7', label: '☆', text: '☆.。.:*・°☆' },
  { id: 'def-8', label: '·͜·', text: '·͜· ♡ ·͜·' },
  { id: 'def-9', label: 'ᐢ', text: '₍ᐢ..ᐢ₎' },
  { id: 'def-10', label: '⁺', text: '⁺₊✧⋆⁺₊' },
  { id: 'def-11', label: '~', text: '~~~☆~~~' },
  { id: 'def-12', label: '╰', text: '╰(*°▽°*)╯' },
  { id: 'def-13', label: '♡', text: '♡⃛ ♡⃛ ♡⃛' },
  { id: 'def-14', label: '✧', text: '✧*。٩(ˊᗜˋ*)و✧*。' },
  { id: 'def-15', label: '(｡', text: '(｡♥‿♥｡)' },
  { id: 'def-16', label: '(๑', text: '(๑•̀ㅂ•́)و✧' },
  { id: 'def-17', label: '(ง', text: '(ง•̀_•́)ง' },
  { id: 'def-18', label: 'ヽ', text: "ヽ(´▽`)/♡" },
  { id: 'def-19', label: 'ヽ', text: '✿✿ヽ(°▽°)ノ✿✿' },
  { id: 'def-20', label: '˚', text: '˚₊·—̳͟͞͞♡' },
]

export function cloneDefaultOverlaySymbolTemplates(): OverlaySymbolTemplateItem[] {
  return DEFAULT_OVERLAY_SYMBOL_TEMPLATES.map((x) => ({ ...x }))
}

export function loadOverlaySymbolTemplates(): OverlaySymbolTemplateItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return cloneDefaultOverlaySymbolTemplates()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return cloneDefaultOverlaySymbolTemplates()
    const out: OverlaySymbolTemplateItem[] = []
    const seen = new Set<string>()
    for (const it of parsed) {
      if (!it || typeof it !== 'object') continue
      const o = it as Record<string, unknown>
      const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : crypto.randomUUID()
      if (seen.has(id)) continue
      seen.add(id)
      const label = typeof o.label === 'string' ? o.label.trim() : ''
      const text = typeof o.text === 'string' ? o.text.trim() : ''
      if (!text) continue
      out.push({ id, label: label || '·', text })
    }
    return out.length ? out : cloneDefaultOverlaySymbolTemplates()
  } catch {
    return cloneDefaultOverlaySymbolTemplates()
  }
}

export function saveOverlaySymbolTemplates(items: OverlaySymbolTemplateItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

/** 恢复默认并立即写入本地（用于「恢复默认」按钮；也可在弹窗内仅草稿用 cloneDefault） */
export function resetOverlaySymbolTemplatesToDefault(): OverlaySymbolTemplateItem[] {
  const d = cloneDefaultOverlaySymbolTemplates()
  saveOverlaySymbolTemplates(d)
  return d
}

export function normalizeOverlaySymbolTemplates(
  items: OverlaySymbolTemplateItem[],
): OverlaySymbolTemplateItem[] {
  const seen = new Set<string>()
  const out: OverlaySymbolTemplateItem[] = []
  for (const x of items) {
    const id = String(x.id ?? '').trim() || crypto.randomUUID()
    if (seen.has(id)) continue
    const text = String(x.text ?? '').trim()
    if (!text) continue
    seen.add(id)
    const label = String(x.label ?? '').trim() || '·'
    out.push({ id, label, text })
  }
  return out.length ? out : cloneDefaultOverlaySymbolTemplates()
}
