import { fork, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { totalmem } from 'node:os'
import { fileURLToPath } from 'node:url'

export type Matting = { available: () => boolean; run: (input: string, output: string) => Promise<unknown>; close: () => void }

const IDLE_MS = 2 * 60_000
const TIMEOUT_MS = 5 * 60_000
/** 抠一张的内存峰值实测约 5.9GB。内存不够时硬跑会触发 OOM，把整个云端服务拖垮，所以当作没装处理 */
const MIN_MEMORY_MB = Number(process.env.CLOUD_MATTE_MIN_MEMORY_MB) || 7000

/** 机器内存和容器上限取小的 */
function memoryMb() {
  const limit = process.constrainedMemory()
  return Math.min(totalmem(), limit > 0 ? limit : Infinity) / 1024 / 1024
}

/** 抠图：一次一张，子进程闲置 2 分钟后退出，把内存还给系统 */
export function createMatting(modelPath: string): Matting {
  let child: ChildProcess | null = null
  let idle: NodeJS.Timeout | null = null
  let seq = 0
  let queue: Promise<unknown> = Promise.resolve()

  function installed() {
    try {
      createRequire(import.meta.url).resolve('onnxruntime-node')
      return true
    } catch {
      return false
    }
  }

  function stop() {
    if (idle) clearTimeout(idle)
    idle = null
    child?.kill()
    child = null
  }

  async function once(input: string, output: string) {
    if (idle) clearTimeout(idle)
    child ??= fork(fileURLToPath(new URL('./matteWorker.ts', import.meta.url)), [], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
    const current = child
    const id = (seq += 1)
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const finish = (error: Error | null, value?: unknown) => {
          clearTimeout(timer)
          current.off('message', onMessage)
          current.off('exit', onExit)
          current.off('error', onError)
          if (error) reject(error)
          else resolve(value)
        }
        const onMessage = (message: any) => {
          if (message?.id === id) finish(message.error ? new Error(`抠图失败：${message.error}`) : null, message)
        }
        const onExit = () => finish(new Error('抠图进程异常退出，可能是服务器内存不足'))
        const onError = (error: Error) => finish(error)
        const timer = setTimeout(() => {
          finish(new Error('抠图超时'))
          stop()
        }, TIMEOUT_MS)
        current.on('message', onMessage)
        current.once('exit', onExit)
        current.once('error', onError)
        current.send({ id, model: modelPath, input, output })
      })
    } finally {
      if (child === current && (current.exitCode !== null || current.signalCode !== null)) child = null
      if (child) {
        idle = setTimeout(stop, IDLE_MS)
        idle.unref()
      }
    }
  }

  return {
    available: () => existsSync(modelPath) && memoryMb() >= MIN_MEMORY_MB && installed(),
    run: (input, output) => {
      const next = queue.then(() => once(input, output))
      queue = next.catch(() => undefined)
      return next
    },
    close: stop,
  }
}
