/**
 * 9:16 竖屏 ASS 边距默认值（与 libass Alignment 8/2 配合）：
 * - 标题：距顶越大 → 越远离顶边，视觉上越接近「居中偏上」而非贴顶
 * - 配音字幕：距底越大 → 越远离底边，视觉上越接近「居中偏下」而非贴底
 */
export const ASS_DEFAULT_TITLE_MARGIN_V = 360
export const ASS_DEFAULT_TTS_MARGIN_V = 360

/** ASS 字幕默认字体族（与 Noto Sans SC / CJK 等多语言字体文件对应；见 fontResolve） */
export const ASS_DEFAULT_FONT_FAMILY = 'Noto Sans SC'

/**
 * 短视频「白字柔描边」标题体：圆润拉丁（Nunito **Bold + Italic** woff2，见 setup:fonts 的 `ital,wght@0,700;1,700`）。
 * 与 Noto 同目录供 libass 选形；中文等缺字由 fontsdir 内 Noto 回退。
 */
export const ASS_POP_TITLE_FONT_FAMILY = 'Nunito'

/** white_shadow 顶栏样式名（V4+ Styles） */
export const ASS_STYLE_MAIN_CONTENT = 'MainContent'

/** white_shadow 底部配音字幕样式名 */
export const ASS_STYLE_MAIN_CONTENT_BOTTOM = 'MainContentBottom'

/** 工具链多行标题：主标题行（Bold+Italic，较大字号） */
export const ASS_STYLE_TITLE_TEXT = 'TitleText'

/** 工具链多行标题：符号装饰行（Bold+Italic，略小字号） */
export const ASS_STYLE_SYMBOL_ROW = 'SymbolRow'

/** 模板仍填下列族名时，`white_shadow` 成片样式改用 ASS_POP_TITLE_FONT_FAMILY */
export const ASS_FONT_NAMES_MAP_TO_POP_ROUND: ReadonlySet<string> = new Set([
  '',
  'Noto Sans',
  'Noto Sans SC',
  'Noto Sans CJK SC',
  'Noto Sans CJK TC',
  'Noto Sans CJK JP',
])

/** PlayResY=1920 时推荐字号（短视频标题/字幕） */
export const ASS_DEFAULT_FONT_SIZE = 70
