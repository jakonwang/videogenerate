type LivePhotoImageGenerationResultBase = {
  provider: string
  model?: string
  baseUrl?: string
  endpointStyle?: string
  productReferenceImagePaths: string[]
}

export type LivePhotoImageGenerationResult =
  | (LivePhotoImageGenerationResultBase & { mode: 'direct'; stillPath: string })
  | (LivePhotoImageGenerationResultBase & { mode: 'remote'; taskId: string })

export type LivePhotoImageProviderAdapter = {
  provider: string
  submit: () => Promise<LivePhotoImageGenerationResult | null>
}

export async function submitLivePhotoImageGeneration(input: {
  adapters: LivePhotoImageProviderAdapter[]
  onProviderError?: (provider: string, error: unknown, hasFallback: boolean) => void
}) {
  let lastError: unknown
  for (let index = 0; index < input.adapters.length; index += 1) {
    const adapter = input.adapters[index]!
    try {
      const result = await adapter.submit()
      if (result) return result
    } catch (error) {
      lastError = error
      const hasFallback = index < input.adapters.length - 1
      input.onProviderError?.(adapter.provider, error, hasFallback)
      if (!hasFallback) throw error
    }
  }
  if (lastError) throw lastError
  throw new Error('No Live Photo image generation provider is available')
}
