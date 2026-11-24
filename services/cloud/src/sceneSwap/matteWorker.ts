import sharp from 'sharp'

/**
 * 抠图子进程：推理会占住事件循环、也很吃内存，所以不放在云端主进程里；闲置后由主进程关掉。
 * 输入图片路径，输出同尺寸的灰度蒙版 PNG（白 = 人物）。
 */
const SIZE = 1024
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]
type Request = { id: number; model: string; input: string; output: string }

let session: Promise<any> | null = null

async function matte({ model, input, output }: Request) {
  const ort = await import('onnxruntime-node')
  session ??= ort.InferenceSession.create(model, { logSeverityLevel: 3, enableCpuMemArena: false, enableMemPattern: false })
  const net = await session
  const { data, info } = await sharp(input).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const small = await sharp(data, { raw: { width, height, channels: 3 } }).resize(SIZE, SIZE, { fit: 'fill' }).raw().toBuffer()
  const pixels = SIZE * SIZE
  const tensor = new Float32Array(3 * pixels)
  for (let i = 0; i < pixels; i += 1) for (let c = 0; c < 3; c += 1) tensor[c * pixels + i] = (small[i * 3 + c]! / 255 - MEAN[c]!) / STD[c]!
  const result = await net.run({ [net.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, SIZE, SIZE]) })
  const raw = result[net.outputNames[0]].data as Float32Array
  let min = Infinity
  let max = -Infinity
  for (const value of raw) {
    if (value < min) min = value
    if (value > max) max = value
  }
  // 有的导出带 sigmoid（0–1），有的是 logits
  const logits = min < -0.01 || max > 1.01
  const mask = Buffer.alloc(pixels)
  for (let i = 0; i < pixels; i += 1) mask[i] = Math.round(255 * Math.min(1, Math.max(0, logits ? 1 / (1 + Math.exp(-raw[i]!)) : raw[i]!)))
  await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: 1 } }).resize(width, height, { fit: 'fill', kernel: 'cubic' }).toColourspace('b-w').png().toFile(output)
}

let chain: Promise<void> = Promise.resolve()
process.on('message', (request: Request) => {
  chain = chain.then(async () => {
    try {
      await matte(request)
      process.send?.({ id: request.id, rss: process.memoryUsage().rss })
    } catch (error) {
      process.send?.({ id: request.id, error: String((error as Error)?.message || error) })
    }
  })
})
process.on('disconnect', () => process.exit(0))
