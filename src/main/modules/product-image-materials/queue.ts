class ProductImageMaterialsQueue {
  private pending = new Set<string>()
  private running = false
  private processor: ((batchId: string) => Promise<void>) | null = null

  setProcessor(processor: (batchId: string) => Promise<void>) {
    this.processor = processor
  }

  schedule(batchId: string) {
    const id = String(batchId || '').trim()
    if (!id) return
    this.pending.add(id)
    void this.drain()
  }

  getState() {
    return {
      running: this.running,
      pendingCount: this.pending.size,
    }
  }

  private async drain() {
    if (this.running || !this.processor) return
    this.running = true
    try {
      while (this.pending.size > 0) {
        const next = this.pending.values().next().value
        if (!next) break
        this.pending.delete(next)
        try {
          await this.processor(next)
        } catch (error) {
          console.error('[product-image-materials] queue processor failed', error)
        }
      }
    } finally {
      this.running = false
      if (this.pending.size > 0) void this.drain()
    }
  }
}

export const productImageMaterialsQueue = new ProductImageMaterialsQueue()
