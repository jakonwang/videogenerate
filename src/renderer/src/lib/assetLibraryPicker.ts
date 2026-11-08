export type AssetPickerOptions = {
  type?: 'all' | 'image' | 'video'
  multiple?: boolean
  usagePlugin?: string
}
export type AssetPickerResult = Array<{
  id: string
  name: string
  filePath: string
  type: 'image' | 'video'
  mimeType: string
  pluginUsage?: Record<string, 'used' | 'unused'>
  qiniuUrl?: string
}>

type PickerRequest = { options: AssetPickerOptions; resolve: (items: AssetPickerResult | null) => void }

export function openAssetLibraryPicker(options: AssetPickerOptions = {}) {
  return new Promise<AssetPickerResult | null>((resolve) => {
    window.dispatchEvent(new CustomEvent<PickerRequest>('asset-library:pick', { detail: { options, resolve } }))
  })
}
