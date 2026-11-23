/**
 * 商品同步：AI 结果（商品分析、分析板、标准源图）按各自的更新时间合并，较新的一方生效；
 * 旧版桌面端回传的旧结果不会盖掉较新的；生成图换成本机下载的路径；分段素材不同步。
 */
import assert from 'node:assert/strict'
import { mergeProductDesktopFields, productDesktopFields, productDesktopFilePaths } from '../src/main/modules/cloud-sync/productBridge'
import type { Product } from '../src/main/modules/products/types'

const analysis = (at: number, summary: string) => ({ category: 'earring', summary, coreSubject: '', connectionStructure: '', materialDetails: '', wearingPosition: '', surfaceDetails: '', colorDetails: '', geometryDetails: '', sizeScale: '', matchingRules: [], rawDescription: '', updatedAt: at })

const local = {
  id: 'p1', name: '耳环', type: 'earring', assets: { hook: [{ path: 'C:/clip.mp4' }] }, createdAt: 1, updatedAt: 1,
  analysisBoardPath: 'C:/local/board.png', analysisBoardStatus: 'ready', analysisBoardUpdatedAt: 100,
  canonicalSourcePath: 'C:/local/canon.png', canonicalSourceStatus: 'ready', canonicalSourceUpdatedAt: 300,
  productAnalysis: analysis(100, '旧分析'),
} as unknown as Product

// The other device re-ran the analysis board and the text analysis; its canonical source is older than ours.
const other = {
  ...local, id: 'p9',
  analysisBoardPath: '/srv/engine/board.png', analysisBoardStatus: 'ready', analysisBoardUpdatedAt: 200,
  canonicalSourcePath: '/srv/engine/canon.png', canonicalSourceStatus: 'failed', canonicalSourceUpdatedAt: 250,
  productAnalysis: analysis(200, '新分析'),
} as unknown as Product

const desktop = productDesktopFields(other)
assert.equal('assets' in desktop, false, 'segment clips stay local')
assert.equal('analysisBoardPath' in desktop, false, 'file paths travel as files, not paths')
assert.deepEqual(productDesktopFilePaths(other), { analysisBoardPath: '/srv/engine/board.png', canonicalSourcePath: '/srv/engine/canon.png' })

const merged = mergeProductDesktopFields(local, desktop, { analysisBoardPath: 'C:/dl/board.png', canonicalSourcePath: 'C:/dl/canon.png' })
assert.equal(merged.analysisBoardUpdatedAt, 200)
assert.equal(merged.analysisBoardPath, 'C:/dl/board.png', 'newer board: downloaded image used')
assert.equal(merged.productAnalysis?.summary, '新分析')
assert.equal('canonicalSourceStatus' in merged, false, 'our canonical source is newer: not touched')
assert.equal('canonicalSourcePath' in merged, false)
assert.equal('assets' in merged, false)

// An old desktop echoing a stale blob (older in every group) changes nothing.
const stale = { ...local, analysisBoardUpdatedAt: 50, canonicalSourceUpdatedAt: 50, productAnalysis: analysis(50, '更旧') } as unknown as Product
assert.deepEqual(mergeProductDesktopFields(other, productDesktopFields(stale), { analysisBoardPath: 'x', canonicalSourcePath: 'y' }), {})
// Clients without AI results (phone, old web) change nothing.
assert.deepEqual(mergeProductDesktopFields(local, undefined, {}), {})

console.log('product-bridge-merge smoke ok')
