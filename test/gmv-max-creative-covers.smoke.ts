import assert from 'node:assert/strict'
import { extractGmvMaxCampaignPostVideos } from '../src/main/modules/tiktok-gmv-max/creativeAssets'
import type { GmvMaxCampaign } from '../src/main/modules/tiktok-gmv-max/types'

// Custom-selected posts inside campaign details become video rows, scoped to the right store and de-duplicated.
const post = { item_id: '111', text: 'caption', video_info: { video_cover_url: 'https://example.test/cover.jpg' } }
const campaigns = [
  { id: 'c1', storeId: 's1', raw: { campaign: { item_list: [post, post, { item_id: '222' }] } } },
  { id: 'c2', storeId: 's2', raw: { campaign: { item_list: [{ ...post, item_id: '333' }] } } },
] as unknown as GmvMaxCampaign[]
const rows = extractGmvMaxCampaignPostVideos(campaigns, 's1')
assert.equal(rows.length, 1)
assert.equal(rows[0].campaignId, 'c1')
assert.equal(rows[0].row.item_id, '111')
assert.equal(extractGmvMaxCampaignPostVideos(campaigns, 's3').length, 0)

console.log('gmv-max creative covers smoke passed')
