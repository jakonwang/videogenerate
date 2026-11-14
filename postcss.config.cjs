module.exports = {
  plugins: [
    require('@tailwindcss/postcss')(),
    // Must run last: rewrites trailing `:is(...)` selectors so Chromium can
    // index them by class/tag instead of testing them on every element.
    require('./scripts/postcss-expand-trailing-is.cjs')(),
  ],
}
