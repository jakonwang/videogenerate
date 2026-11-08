const PRODUCT_LINK_TITLE_MAX_LENGTH = 30

export function buildProductLinkTitle(input: { productLinkTitle?: string; productTitle?: string }) {
  const source = String(input.productLinkTitle || input.productTitle || '')
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^\p{L}\p{M}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return Array.from(source).slice(0, PRODUCT_LINK_TITLE_MAX_LENGTH).join('').trim()
}
