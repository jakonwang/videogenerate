/**
 * PostCSS plugin: expand a trailing `:is(...)` into a plain selector list.
 *
 * Why: Chromium indexes style rules by the *rightmost* compound selector
 * (id / class / tag / attribute buckets). A rule such as
 *   `html[data-app-theme] body #app .page :is(.card, .panel)`
 * has a rightmost compound that starts with `:is(`, so it lands in the
 * universal bucket and is tested against EVERY element on every style recalc.
 * The global stylesheets contain hundreds of these, which made style
 * recalculation ~3x slower than necessary.
 *
 * The rewrite is semantics-preserving:
 *   `P :is(A, B)S`  ->  `P A<pad>S, P B<pad>S`
 * - only arguments that are a single, simple compound are expanded (no
 *   combinators, only well-known pseudo-classes), so the matched element set
 *   is identical and no expanded selector can be invalid;
 * - `:is()` takes the specificity of its most specific argument, so each
 *   expanded argument is padded with never-matching negations
 *   (`:not(#…)`, `:not(.…)`, `:not(…)`) up to exactly that specificity;
 * - any argument that cannot be expanded safely stays inside a residual
 *   `:is(...)`, also padded, so the cascade is unchanged.
 */

const PAD_ID = ':not(#vgx-sp)'
const PAD_CLASS = ':not(.vgx-sp)'
const PAD_TYPE = ':not(vgx-sp)'

const SAFE_PSEUDO = new Set([
  'hover', 'focus', 'focus-visible', 'focus-within', 'active', 'disabled', 'enabled',
  'checked', 'first-child', 'last-child', 'only-child', 'first-of-type', 'last-of-type',
  'empty', 'visited', 'link', 'placeholder-shown', 'read-only', 'required', 'invalid',
])

/** Split on a delimiter at nesting depth 0 (ignoring parens, brackets, strings, escapes). */
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
    else if (depth === 0 && isDelimiter(c, i)) {
      parts.push({ text: text.slice(start, i), end: i })
      start = i + 1
    }
  }
  parts.push({ text: text.slice(start), end: text.length })
  return parts
}

/** Index of the matching `)` for the `(` at `open`, or -1. */
function matchParen(text, open) {
  let depth = 0
  let quote = ''
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (c === '\\') { i++; continue }
    if (quote) { if (c === quote) quote = ''; continue }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) return i }
  }
  return -1
}

/** Start index of the last compound selector (after the last top-level combinator). */
function lastCompoundStart(selector) {
  let last = 0
  splitTop(selector, (c) => c === ' ' || c === '>' || c === '+' || c === '~' || c === '\n' || c === '\t')
    .forEach((part) => { if (part.text.trim()) last = part.end - part.text.length })
  return last
}

const IDENT = String.raw`(?:[\w-]|\\.)+`
const SIMPLE_COMPOUND = new RegExp(
  String.raw`^(?:${IDENT}|\*)?(?:\.${IDENT}|#${IDENT}|\[[^\[\]]*\]|:${IDENT}(?:\((?:[^()]|\([^()]*\))*\))?)*$`,
)

/** Specificity [a, b, c] of a simple compound selector (as accepted by SIMPLE_COMPOUND). */
function compoundSpecificity(compound) {
  let a = 0, b = 0, c = 0
  const re = new RegExp(String.raw`#${IDENT}|\.${IDENT}|\[[^\[\]]*\]|:(${IDENT})(\((?:[^()]|\([^()]*\))*\))?|^${IDENT}`, 'g')
  let m
  while ((m = re.exec(compound))) {
    const token = m[0]
    if (token[0] === '#') a++
    else if (token[0] === '.' || token[0] === '[') b++
    else if (token[0] === ':') {
      const name = m[1]
      if (name === 'not' || name === 'is') {
        const inner = m[2].slice(1, -1)
        const specs = splitTop(inner, (ch) => ch === ',').map((p) => complexSpecificity(p.text.trim()) || compoundSpecificity(p.text.trim()))
        const max = specs.reduce(maxSpec, [0, 0, 0])
        a += max[0]; b += max[1]; c += max[2]
      } else if (name !== 'where') b++
    } else c++
  }
  return [a, b, c]
}

function maxSpec(x, y) {
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? x : y
  return x
}

function isSafeArg(arg) {
  if (!SIMPLE_COMPOUND.test(arg) || arg.includes('::')) return false
  const pseudoRe = new RegExp(String.raw`:(${IDENT})(\()?`, 'g')
  let m
  while ((m = pseudoRe.exec(arg))) {
    const name = m[1]
    if (name === 'not' && m[2]) continue
    if (!SAFE_PSEUDO.has(name)) return false
  }
  return true
}

function pad(spec, target) {
  const d = [target[0] - spec[0], target[1] - spec[1], target[2] - spec[2]]
  if (d.some((n) => n < 0)) return null
  return PAD_ID.repeat(d[0]) + PAD_CLASS.repeat(d[1]) + PAD_TYPE.repeat(d[2])
}

/** Returns the expanded selector strings for one complex selector, or null to keep it. */
function expandComplex(complex) {
  const trimmed = complex.trim()
  const start = lastCompoundStart(trimmed)
  const compound = trimmed.slice(start)
  if (!compound.startsWith(':is(')) return null
  const close = matchParen(compound, 3)
  if (close < 0) return null
  const prefix = trimmed.slice(0, start)
  const inner = compound.slice(4, close)
  const suffix = compound.slice(close + 1)
  if (suffix.includes(':is(') || suffix.includes(':where(') || suffix.includes(':has(')) return null

  const args = splitTop(inner, (c) => c === ',').map((p) => p.text.trim()).filter(Boolean)

  // Specificity of the original :is() = max over ALL arguments (complex ones included).
  const argSpec = (arg) => (isSafeArg(arg) ? compoundSpecificity(arg) : complexSpecificity(arg))
  const specs = args.map(argSpec)
  if (specs.some((s) => s === null)) return null
  const target = specs.reduce(maxSpec, [0, 0, 0])

  const out = []
  const rest = []
  args.forEach((arg, index) => {
    const padding = isSafeArg(arg) ? pad(specs[index], target) : null
    if (padding === null) rest.push(index)
    else out.push(prefix + arg + padding + suffix)
  })
  if (!out.length) return null
  if (rest.length) {
    // Residual :is() must keep the original specificity. If its own max is lower
    // (some args could only be padded upward in the wrong component), include the
    // argument that defines the target as an anchor; matching it twice is harmless.
    let restMax = rest.map((i) => specs[i]).reduce(maxSpec, [0, 0, 0])
    let padding = pad(restMax, target)
    if (padding === null) {
      const anchor = specs.findIndex((s) => s.join() === target.join())
      if (!rest.includes(anchor)) rest.push(anchor)
      padding = ''
    }
    out.push(prefix + ':is(' + rest.map((i) => args[i]).join(', ') + ')' + padding + suffix)
  }
  return out
}

/** Specificity of a complex selector made of simple compounds, or null if unsupported. */
function complexSpecificity(complex) {
  const compounds = splitTop(complex, (c) => c === ' ' || c === '>' || c === '+' || c === '~' || c === '\n')
    .map((p) => p.text.trim())
    .filter(Boolean)
  let total = [0, 0, 0]
  for (const compound of compounds) {
    if (!SIMPLE_COMPOUND.test(compound) && compound !== '*') return null
    const s = compoundSpecificity(compound)
    total = [total[0] + s[0], total[1] + s[1], total[2] + s[2]]
  }
  return total
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
  postcssPlugin: 'vgx-expand-trailing-is',
  // Single pass over the final tree (a `Rule` visitor would revisit rewritten
  // rules and expand the residual :is() again).
  OnceExit(root) {
    root.walkRules((rule) => {
      if (!rule.selector.includes(':is(')) return
      if (rule.parent && rule.parent.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return
      if (isFrameworkRule(rule)) return
      let changed = false
      const selectors = []
      for (const part of splitTop(rule.selector, (c) => c === ',')) {
        const expanded = expandComplex(part.text)
        if (expanded) { changed = true; selectors.push(...expanded) } else selectors.push(part.text.trim())
      }
      if (changed) rule.selector = selectors.join(',\n')
    })
  },
})
module.exports.postcss = true
module.exports._internal = { expandComplex, compoundSpecificity }
