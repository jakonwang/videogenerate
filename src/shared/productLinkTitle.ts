export const PRODUCT_LINK_TITLE_MAX_LENGTH = 30

/**
 * Words TikTok's language filter flags even inside a harmless product name.
 * Vietnamese "bướm" (butterfly) is also slang for genitals: "Khuyên tai vòng
 * bướm đính đá" was rejected as offensive. Only auto-built titles drop them;
 * a title the user typed is sent as typed.
 */
const FLAGGED_WORDS = new Set(['bướm', 'buom'])

/**
 * TikTok's product anchor title: at most 30 characters, letters/digits/spaces only.
 *
 * Cut on a word boundary: a mid-word cut can leave a fragment that TikTok's
 * language filter rejects (Vietnamese "…đính đá" cut to "…đính đ" reads as a
 * swear abbreviation → "the product link title contains offensive language").
 * Leading catalogue codes such as "#45" are dropped for the same reason.
 */
export function buildProductLinkTitle(input: { productLinkTitle?: string; productTitle?: string }) {
  const custom = Boolean(input.productLinkTitle?.trim())
  let source = String(input.productLinkTitle || input.productTitle || '')
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!custom) {
    // "#45 Khuyên tai …" → "Khuyên tai …" (keep it if the title is only a number).
    const withoutCode = source.replace(/^(?:\p{N}+\s+)+/u, '').trim()
    if (withoutCode) source = withoutCode
    const clean = source.split(' ').filter((word) => !FLAGGED_WORDS.has(word.toLocaleLowerCase('vi'))).join(' ')
    if (clean) source = clean
  }

  const chars = Array.from(source)
  if (chars.length <= PRODUCT_LINK_TITLE_MAX_LENGTH) return source

  const cut = chars.slice(0, PRODUCT_LINK_TITLE_MAX_LENGTH).join('')
  const endsOnBoundary = chars[PRODUCT_LINK_TITLE_MAX_LENGTH] === ' '
  const lastSpace = cut.lastIndexOf(' ')
  // A title that is one long word (e.g. Chinese) has no boundary to cut on.
  if (!endsOnBoundary && lastSpace <= 0) return cut.trim()
  let words = (endsOnBoundary ? cut : cut.slice(0, lastSpace)).trim().split(' ')
  // Do not end on a lone letter either ("… cho nữ A").
  while (words.length > 1 && Array.from(words[words.length - 1]).length === 1) words = words.slice(0, -1)
  return words.join(' ')
}
