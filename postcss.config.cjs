module.exports = {
  plugins: [
    require('@tailwindcss/postcss')(),
    // Rewrites trailing `:is(...)` selectors so Chromium can index them by
    // class/tag instead of testing them on every element.
    require('./scripts/postcss-expand-trailing-is.cjs')(),
    // Must run last: stops broad legacy rules (styles.css, theme-components.css)
    // from reaching UI built on the vg- kit (marked with `.vg-scope`).
    require('./scripts/postcss-legacy-scope-guard.cjs')(),
  ],
}
