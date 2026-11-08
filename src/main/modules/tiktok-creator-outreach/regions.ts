export type StoreType = 'cross_border' | 'local'

export type AffiliateRegion = {
  code: string
  name: string
  affiliateHost: string
  sellerHost?: string
}

export const AFFILIATE_HOST = 'affiliate.tiktok.com'

export const AFFILIATE_REGIONS: AffiliateRegion[] = [
  { code: 'US', name: 'United States', affiliateHost: AFFILIATE_HOST, sellerHost: 'seller-us.tiktok.com' },
  { code: 'UK', name: 'United Kingdom', affiliateHost: AFFILIATE_HOST, sellerHost: 'seller-uk.tiktok.com' },
  { code: 'VN', name: 'Vietnam', affiliateHost: AFFILIATE_HOST, sellerHost: 'seller-vn.tiktok.com' },
  { code: 'TH', name: 'Thailand', affiliateHost: AFFILIATE_HOST, sellerHost: 'seller-th.tiktok.com' },
  { code: 'MY', name: 'Malaysia', affiliateHost: AFFILIATE_HOST, sellerHost: 'seller-my.tiktok.com' },
  { code: 'PH', name: 'Philippines', affiliateHost: AFFILIATE_HOST, sellerHost: 'seller-ph.tiktok.com' },
  { code: 'SG', name: 'Singapore', affiliateHost: AFFILIATE_HOST, sellerHost: 'seller-sg.tiktok.com' },
  { code: 'ID', name: 'Indonesia', affiliateHost: AFFILIATE_HOST, sellerHost: 'seller-id.tiktok.com' },
]

export function getAffiliateRegion(code: string) {
  const normalized = String(code || '').trim().toUpperCase()
  return AFFILIATE_REGIONS.find((region) => region.code === normalized)
}

export function buildAffiliateUrl(input: { shopRegion: string; shopId: string; affiliateHost?: string; path?: string }) {
  const host = input.affiliateHost || getAffiliateRegion(input.shopRegion)?.affiliateHost || AFFILIATE_HOST
  const requestedPath = String(input.path || 'platform/homepage').replace(/^\/+/, '')
  const path = requestedPath === 'creator' ? 'platform/homepage' : requestedPath
  const params = new URLSearchParams({ shop_region: input.shopRegion.trim().toUpperCase(), tab: '0', shop_id: input.shopId.trim() })
  return `https://${host}/affiliate/${path}?${params.toString()}`
}
