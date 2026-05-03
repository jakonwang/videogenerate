import type { AppLocale } from '../../shared/locale'

const PICK_FILES: Record<AppLocale, string> = {
  'zh-CN': '选择文件',
  'en-US': 'Select files',
  'vi-VN': 'Chọn tệp',
}

const PICK_DIR: Record<AppLocale, string> = {
  'zh-CN': '选择文件夹',
  'en-US': 'Select folder',
  'vi-VN': 'Chọn thư mục',
}

export function defaultOpenDialogTitle(locale: AppLocale, kind: 'pickFiles' | 'pickDir'): string {
  return kind === 'pickDir' ? PICK_DIR[locale] : PICK_FILES[locale]
}
