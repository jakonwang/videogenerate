/** 1.20.1 的类型没有被 package.json exports 暴露出来，这里只声明用到的部分 */
declare module 'onnxruntime-node' {
  export class Tensor {
    constructor(type: 'float32', data: Float32Array, dims: number[])
    readonly data: unknown
  }
  export const InferenceSession: {
    create(path: string, options?: Record<string, unknown>): Promise<{
      inputNames: string[]
      outputNames: string[]
      run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>
    }>
  }
}
