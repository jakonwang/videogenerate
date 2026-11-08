import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function main() {
  const root = process.cwd()
  const [livePhoto, tiktokCreative, productImageMaterials, assetPicker, zhLocale] = await Promise.all([
    readFile(join(root, 'src/renderer/src/ui/views/LivePhotoGeneratorView.vue'), 'utf8'),
    readFile(join(root, 'src/renderer/src/ui/views/TiktokCreativeStudioView.vue'), 'utf8'),
    readFile(join(root, 'src/renderer/src/ui/views/ProductImageMaterialsView.vue'), 'utf8'),
    readFile(join(root, 'src/renderer/src/ui/components/AssetLibraryPickerHost.vue'), 'utf8'),
    readFile(join(root, 'src/renderer/src/locales/zh-CN.json'), 'utf8'),
  ])

  assert.match(livePhoto, /openAssetLibraryPicker\(\{ type: 'image', multiple: true \}\)/)
  assert.match(livePhoto, /item\.materialOrigin === 'derived'/)
  assert.match(zhLocale, /"materialLibrarySelect": "\u4ece\u884d\u751f\u56fe\u9009\u56fe"/)

  assert.match(tiktokCreative, /pickReferenceImagesFromAssetLibrary/)
  assert.match(tiktokCreative, /openAssetLibraryPicker\(\{ type: "image", multiple: true \}\)/)
  assert.match(tiktokCreative, /item\.materialOrigin === "derived"/)

  assert.match(productImageMaterials, /pickSourceImageFromAssetLibrary/)
  assert.match(productImageMaterials, /openAssetLibraryPicker\(\{ type: 'image', multiple: false, usagePlugin: ASSET_USAGE_PLUGIN \}\)/)
  assert.match(productImageMaterials, /pickVideosFromAssetLibrary/)
  assert.match(productImageMaterials, /openAssetLibraryPicker\(\{ type: 'video', multiple: true, usagePlugin: ASSET_USAGE_PLUGIN \}\)/)
  assert.match(productImageMaterials, /sourceImagePath\.value = selected\[0\]\.filePath/)
  assert.match(productImageMaterials, /sourceImagePath: sourceImagePath\.value/)
  assert.match(productImageMaterials, /pluginName: '\\u5546\\u54c1\\u56fe\\u7247\\u7d20\\u6750'/)
  assert.match(assetPicker, /assetLibrary\.updateUsageStatus/)
  assert.match(assetPicker, /usageFilter/)
  assert.match(assetPicker, /usagePlugin/)

  console.log('asset library plugin integration smoke passed')
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
