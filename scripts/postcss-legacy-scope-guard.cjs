/**
 * PostCSS plugin: keep legacy global styles away from migrated UI.
 *
 * The old global stylesheets (styles.css, theme-components.css) theme the app
 * by patching elements with broad `!important` rules such as
 *   html[data-app-theme] … :is(button, [role='button'], …) { … !important }
 *   :is(span, em, small)[class*='badge'] { … !important }
 * Anything new had to out-shout them with even more specific `!important`
 * rules. Pages rebuilt on the shared `vg-` UI kit mark their root with
 * `.vg-scope`; this plugin appends `:not(:where(.vg-scope, .vg-scope *))` to
 * every legacy selector whose subject is "generic" (no class / id of its own,
 * or a `[class*=…]` substring match), so those rules stop reaching inside a
 * vg-scope. `:where()` has zero specificity, so legacy cascade order is
 * unchanged everywhere else.
 *
 * Only files listed in LEGACY_FILES are touched. Must run after
 * postcss-expand-trailing-is.
 */

const LEGACY_FILES = [/[\\/]styles\.css$/, /[\\/]design-system[\\/]theme-components\.css$/]
const GUARD = ':not(:where(.vg-scope, .vg-scope *))'
// State classes shared by legacy and new markup; a legacy subject made only of
// these (e.g. `.is-active`, `button.active`) is as broad as a bare tag.
const STATE_CLASSES = new Set([
  'active', 'is-active', 'selected', 'is-selected', 'checked', 'is-checked', 'disabled', 'is-disabled',
  'open', 'is-open', 'current', 'is-current', 'on', 'is-on', 'done', 'is-done', 'error', 'is-error',
  'success', 'is-success', 'loading', 'is-loading', 'running', 'is-running', 'danger', 'primary',
])

function splitTop(text, isDelimiter) {
  const parts = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') { i++; continue }
    if (quote) { if (c === quote) quote = ''; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (depth === 0 && isDelimiter(c)) {
      parts.push({ text: text.slice(start, i), start })
      start = i + 1
    }
  }
  parts.push({ text: text.slice(start), start })
  return parts
}

/** Text of the compound with everything inside (...) and [...] removed. */
function topLevel(compound) {
  let out = ''
  let depth = 0
  for (let i = 0; i < compound.length; i++) {
    const c = compound[i]
    if (c === '\\') { if (!depth) out += compound.slice(i, i + 2); i++; continue }
    if (c === '(' || c === '[') { depth++; continue }
    if (c === ')' || c === ']') { depth--; continue }
    if (!depth) out += c
  }
  return out
}

/** Index inside the compound where a pseudo-element starts (guard must precede it). */
function pseudoElementIndex(compound) {
  let depth = 0
  for (let i = 0; i < compound.length; i++) {
    const c = compound[i]
    if (c === '\\') { i++; continue }
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (!depth && c === ':') {
      if (compound[i + 1] === ':') return i
      if (/^:(before|after|first-line|first-letter)\b/i.test(compound.slice(i))) return i
    }
  }
  return -1
}

function guardComplex(complex) {
  const trimmed = complex.trim()
  if (!trimmed || trimmed.includes('vg-scope')) return trimmed
  const parts = splitTop(trimmed, (c) => c === ' ' || c === '>' || c === '+' || c === '~' || c === '\n' || c === '\t')
  const last = [...parts].reverse().find((p) => p.text.trim())
  if (!last) return trimmed
  const compound = last.text
  const top = topLevel(compound)
  const classes = [...top.matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) => m[1])
  const generic =
    !/#/.test(top) && (classes.length === 0 || classes.every((name) => STATE_CLASSES.has(name))) ||
    /\[class[*^$]?=/.test(compound)
  // Root-level selectors (html / body / :root) are not content, leave them alone.
  if (!generic || /^(html|body|:root)\b/i.test(compound) && parts.filter((p) => p.text.trim()).length === 1) return trimmed
  const pe = pseudoElementIndex(compound)
  const at = last.start + (pe < 0 ? compound.length : pe)
  return trimmed.slice(0, at) + GUARD + trimmed.slice(at)
}

/** Tailwind's generated CSS lives in @layer blocks and uses nested `&` selectors; never rewrite it. */
function isFrameworkRule(rule) {
  if (rule.selector.includes('&')) return true
  for (let node = rule.parent; node; node = node.parent) {
    if (node.type === 'atrule' && node.name === 'layer') return true
  }
  return false
}

module.exports = () => ({
  postcssPlugin: 'vgx-legacy-scope-guard',
  OnceExit(root) {
    const file = root.source && root.source.input && root.source.input.file
    if (!file || !LEGACY_FILES.some((re) => re.test(file))) return
    root.walkRules((rule) => {
      if (rule.parent && rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return
      if (isFrameworkRule(rule)) return
      const selectors = splitTop(rule.selector, (c) => c === ',').map((p) => guardComplex(p.text))
      rule.selector = selectors.join(',\n')
    })
  },
})
module.exports.postcss = true
module.exports._internal = { guardComplex }
