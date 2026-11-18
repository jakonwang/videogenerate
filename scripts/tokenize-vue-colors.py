"""Rewrite hard-coded colours in a .vue <style> block to theme tokens.

usage: python scripts/tokenize-vue-colors.py <file.vue> [--dry]

Classification (per declaration):
  * box-shadow / text-shadow / filter / drop-shadow  -> left alone (shadows work in all themes)
  * background*  : dark neutral -> --theme-panel / --theme-panel-soft / --theme-input
                   light neutral (overlay tints) -> mix of --theme-text at the same alpha
  * color / fill / stroke : neutral by lightness -> --theme-text / -secondary / -muted
  * border* / outline*    : neutral -> --theme-border (or --theme-border-control if strong)
  * saturated colours in any property -> tone token by hue
      teal/green/cyan (140-200deg) -> --theme-accent, blue (200-250) -> --theme-tone-blue,
      violet (250-320) -> --theme-tone-violet, red/pink (320-20) -> --theme-tone-red,
      amber/orange/yellow (20-70) -> --theme-tone-amber, lime (70-140) -> --theme-tone-green
  * alpha < 1 is preserved with color-mix(in srgb, <token> N%, transparent)
  * pure white text on a saturated button stays white (--theme-on-accent) when the
    declaration's rule also sets a saturated background.
"""
import colorsys, re, sys

path = sys.argv[1]
dry = '--dry' in sys.argv
src = open(path, encoding='utf8').read()

COLOR = re.compile(r'#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+%?\s*)?\)')

def parse(c):
    if c.startswith('#'):
        h = c[1:]
        if len(h) in (3, 4): h = ''.join(x * 2 for x in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
    else:
        nums = re.findall(r'[\d.]+%?', c)
        r, g, b = (float(x) for x in nums[:3])
        a = 1.0
        if len(nums) > 3:
            a = float(nums[3].rstrip('%')) / (100 if nums[3].endswith('%') else 1)
    return r / 255, g / 255, b / 255, a

def tone_for_hue(h):
    d = h * 360
    if 140 <= d < 200: return 'var(--theme-accent)'
    if 200 <= d < 250: return 'var(--theme-tone-blue)'
    if 250 <= d < 320: return 'var(--theme-tone-violet)'
    if d >= 320 or d < 20: return 'var(--theme-tone-red)'
    if 20 <= d < 70: return 'var(--theme-tone-amber)'
    return 'var(--theme-tone-green)'

def with_alpha(token, a):
    if a >= 0.995: return token
    pct = max(1, round(a * 100))
    return f'color-mix(in srgb, {token} {pct}%, transparent)'

CUSTOM_BY_NAME = [
    (r'(soft|tint|wash-accent|bg-accent)', 'soft'),
    (r'(ink|text|fg|foreground|title)', 'var(--theme-text)'),
    (r'(muted|subtle|secondary|dim|meta)', 'var(--theme-text-muted)'),
    (r'(line|border|stroke|divider|rule)', 'var(--theme-border)'),
    (r'(wash|soft-bg|panel-soft|surface-2|raised)', 'var(--theme-panel-soft)'),
    (r'(paper|surface|panel|card|bg|background)', 'var(--theme-panel)'),
]

def classify_custom(prop, c):
    r, g, b, a = parse(c)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    name = prop.lower()
    saturated = s > 0.35 and 0.06 < l < 0.94
    for pattern, token in CUSTOM_BY_NAME:
        if re.search(pattern, name):
            if token == 'soft':
                base = tone_for_hue(h) if s > 0.15 else 'var(--theme-text)'
                return f'color-mix(in srgb, {base} 14%, transparent)'
            if saturated and token in ('var(--theme-panel)', 'var(--theme-panel-soft)'):
                return f'color-mix(in srgb, {tone_for_hue(h)} 14%, var(--theme-panel))'
            return with_alpha(token, a)
    if saturated:
        return with_alpha(tone_for_hue(h), a)
    return None

def classify(prop, c, rule_text):
    if prop.startswith('--'):
        return classify_custom(prop, c)
    r, g, b, a = parse(c)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    saturated = s > 0.35 and 0.12 < l < 0.9
    p = prop.lower()
    if p in ('box-shadow', 'text-shadow', 'filter', '-webkit-box-shadow'): return None
    if saturated:
        if p in ('color', 'fill', 'stroke') and lum < 0.2:  # dark saturated text: treat as neutral dark
            pass
        else:
            return with_alpha(tone_for_hue(h), a)
    if p.startswith('background') or p in ('--bg',):
        if lum > 0.85:   # white-ish tint used as subtle overlay on dark UI
            return with_alpha('var(--theme-text)', a) if a < 0.5 else with_alpha('var(--theme-panel)', a)
        if lum < 0.035: return with_alpha('var(--theme-input)', a)
        if lum < 0.09: return with_alpha('var(--theme-panel)', a)
        if lum < 0.22: return with_alpha('var(--theme-panel-soft)', a)
        return with_alpha('var(--theme-control-hover)', a)
    if p in ('color', 'fill', 'stroke', 'caret-color', '-webkit-text-fill-color'):
        if lum > 0.97 and re.search(r'background[^;]*(var\(--theme-accent\)|var\(--theme-tone|var\(--theme-danger)', rule_text):
            return 'var(--theme-on-accent)'
        if lum > 0.78: return with_alpha('var(--theme-text)', a) if a < 0.6 else 'var(--theme-text)'
        if lum > 0.5: return 'var(--theme-text-secondary)'
        if lum > 0.25: return 'var(--theme-text-muted)'
        return 'var(--theme-text)'  # dark text on light (light-first designs)
    if p.startswith('border') or p.startswith('outline') or p in ('column-rule', 'text-decoration-color'):
        return 'var(--theme-border-control)' if (a > 0.3 and 0.2 < lum < 0.6) else 'var(--theme-border)'
    if p.startswith('--'):
        return None   # custom properties: resolved where used
    return None

def convert_css(css):
    out, n = [], 0
    # walk rule by rule: selector { decls }
    pos = 0
    for m in re.finditer(r'\{([^{}]*)\}', css):
        out.append(css[pos:m.start() + 1])
        body = m.group(1)
        def decl(dm):
            nonlocal n
            prop, val = dm.group(1), dm.group(2)
            def rep(cm):
                nonlocal n
                new = classify(prop.strip(), cm.group(0), body)
                if new is None: return cm.group(0)
                n += 1
                return new
            return f'{prop}:{COLOR.sub(rep, val)}'
        body2 = re.sub(r'([\w-]+)\s*:([^;{}]*)', decl, body)
        out.append(body2 + '}')
        pos = m.end()
    out.append(css[pos:])
    return ''.join(out), n

total = 0
def style_rep(m):
    global total
    new, n = convert_css(m.group(2))
    total += n
    return m.group(1) + new + m.group(3)
res = re.sub(r'(<style[^>]*>)(.*?)(</style>)', style_rep, src, flags=re.S)
left = len(COLOR.findall(re.search(r'<style[^>]*>(.*?)</style>', res, re.S).group(1))) if '<style' in res else 0
print(f'{path}: converted {total} colours, {left} literals left (shadows / custom props / skipped)')
if not dry:
    open(path, 'w', encoding='utf8', newline='').write(res)
